"""IntentClassifier — answers "what is the user asking?", separately from planning.

Produces an IntentResult (processing class + knowledge scope). It inspects request
metadata (attachments, flags) first, then text hints. It never decides models,
providers, or execution — that is Smart-Modality's job.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import re
from typing import Any, List, Optional


class ProcessingClass(str, Enum):
    DIRECT = "DIRECT"
    LIVE = "LIVE"
    KNOWLEDGE = "KNOWLEDGE"
    VISION = "VISION"
    GENERATE = "GENERATE"
    AUDIO = "AUDIO"
    INGEST = "INGEST"


class KnowledgeScope(str, Enum):
    MODEL = "MODEL"   # model's own knowledge
    WEB = "WEB"       # live web
    USER = "USER"     # user's documents / index


@dataclass
class IntentResult:
    processing_class: ProcessingClass = ProcessingClass.DIRECT
    knowledge_scope: KnowledgeScope = KnowledgeScope.MODEL
    requires_live_data: bool = False
    requires_attachment: bool = False
    confidence: float = 0.9
    # hints kept for reference / debugging
    matched_hint: Optional[str] = None
    # vision response mode: "direct" (VL answers) or "describe" (VL describes → selected LLM composes)
    vision_mode: str = "direct"


@dataclass
class IntentRequest:
    message: str = ""
    file_references: List[Any] = field(default_factory=list)
    web_search: bool = False
    image_mode: bool = False
    url: str = ""
    workspace: str = ""


# Shared intent rule sets — reused by any capability, not just RAG.
DIRECT_HINTS = ("translate", "rewrite", "explain in plain", "proofread", "draft", "write a")
# Matched as plain substrings against the lowercased message (_has_hint), so every entry must be
# unambiguous on its own. This list decides LIVE vs DIRECT — and ONLY the toggle-on case is ever
# affected by that decision, because the planner refuses to search with the toggle off.
#
# That asymmetry is what sets the tuning. The toggle is authoritative, so this list is consulted
# only when the user has explicitly switched web search ON. Someone who turns search on is asking
# for web context; a search they did not want is a surprise, but a search they did ask for and did
# not get is a broken feature. Recall therefore wins over precision here.
#
# Measured against the corpora in tests/unit/test_search_toggle.py:
#
#     precision-tuned (18 entries)   7/12 live caught    0/17 dev searched
#     this list (24 entries)        12/12 live caught    6/17 dev searched
#
# The 6 dev false positives are pinned by name in
# test_search_toggle.py::test_authorized_false_positives. They are the price of the recall: each of
# these words is also ordinary development vocabulary ("update the price display", "add a news
# section", "today we'll refactor"). A wasted search costs a search plus up to three page fetches
# and dilutes the context the user actually asked about — accepted because the user asked.
#
# No substring list gets both. A word broad enough to catch "who won the election" is the same word
# that catches "the stock levels in inventory". That ceiling is the argument for tool calling.
WEB_HINTS = (
    # Explicit request to search.
    "search the web", "web search", "search for",
    # Unambiguous live-data nouns and events.
    "weather", "forecast", "exchange rate", "stock price", "current price", "today's news",
    "breaking", "trending", "standings", "outage", "headline", "who won",
    "release notes", "release date", "up to date",
    # Broadened recall words. "latest news" is deliberately absent — "latest" below subsumes it,
    # and it now also catches "the latest commit", which is the accepted trade.
    "news", "price", "today", "recent", "latest", "look up", "right now",
)
# "down" needs whole-word matching, so it is not in the substring list above. A bare "down" entry
# matches "download the file"; a space-padded " down " misses "is github down?" at end of message.
# \bdown\b catches the live phrasing and neither of the traps.
_WEB_HINTS_RE = re.compile(r"\bdown\b", re.IGNORECASE)
DOCUMENT_HINTS = ("my invoices", "my notes", "my documents", "the pdf", "my pdf",
                  "the file", "the attached", "from the uploaded", "this document",
                  "my knowledge base", "summarize this file", "what did i", "in this doc",
                  "uploaded pdf", "uploaded document", "uploaded file", "this pdf")
IMAGE_HINTS = ("screenshot", "this image", "this picture", "the photo", "this diagram", "this chart")
GENERATION_HINTS = ("generate an image", "create an image", "make an image", "draw a",
                    "draw an", "create a picture", "generate a picture", "image of",
                    "picture of", "logo of", "illustrate", "generate a logo", "design a")
AUDIO_HINTS = ("transcribe", "voice note", "audio note", "what did they say", "convert audio")
# Matches a YouTube video link → signals the transcribe_url capability (video summarization).
YOUTUBE_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/)|youtu\.be/)([\w-]{6,})", re.IGNORECASE)
# Free-text signals that the user is asking about an image — shared by the planner
# (mixed image+doc disambiguation) and the vision capability (runtime gating).
IMG_SIGNAL_RE = re.compile(
    r"\b(image|picture|photo|screenshot|snapshot|see|l[o]?ok at|what'?s in|show me|"
    r"depict|visual|diagram)\b", re.IGNORECASE)
# Simple "what's in this image" queries → VL answers directly; otherwise describe → selected LLM composes.
VISION_SIMPLE_HINTS = (
    "what's in", "what is in", "what do you see", "what do i see",
    "describe this", "describe the image", "describe the picture",
    "what's this", "what is this", "what can you see", "what's in this image",
)
# "what/which <thing> in the picture" — simple factual image questions → VL answers directly.
_VISION_SIMPLE_RE = re.compile(
    r"\b(what|which)\b.*\b(in|of|on)\b.*\b(picture|image|photo|screenshot|diagram|chart)\b",
    re.IGNORECASE,
)
# "what image is it?", "which picture is this", "what kind of image" — direct VL question
# that doesn't use "in/of/on" (a simple image question should route to direct, not describe).
_VISION_IMAGE_RE = re.compile(
    r"\b(what|which)\b.*\b(image|picture|photo|screenshot)\b",
    re.IGNORECASE,
)


def _is_simple_vision_query(message: str) -> bool:
    """A bare description / "what X in the picture" query → one-stage VL."""
    m = message.lower()
    return bool(
        _has_hint(m, VISION_SIMPLE_HINTS)
        or _VISION_SIMPLE_RE.search(message)
        or _VISION_IMAGE_RE.search(message)
    )


def _is_image(ref: Any) -> bool:
    if isinstance(ref, dict):
        mime = (ref.get("mime") or ref.get("content_type") or "").lower()
        ftype = (ref.get("type") or "").lower()
        if ftype == "image" or mime.startswith("image/"):
            return True
        name = (ref.get("filename") or ref.get("name") or "").lower()
        return name.endswith((".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"))
    return False


def _has_hint(message: str, hints) -> Optional[str]:
    m = message.lower()
    for h in hints:
        if h in m:
            return h
    return None


def classify(req: IntentRequest) -> IntentResult:
    """Classify intent from metadata first, then text hints."""
    message = (req.message or "").strip().lower()
    refs = req.file_references or []

    has_image = req.image_mode or any(_is_image(r) for r in refs)
    has_doc = any(not _is_image(r) for r in refs)

    # 1. VISION — image attachments / image mode.
    if req.image_mode or (has_image and not has_doc):
        return IntentResult(
            ProcessingClass.VISION, KnowledgeScope.MODEL, matched_hint="image",
            vision_mode="direct" if _is_simple_vision_query(message) else "describe",
        )

    # 2. GENERATE — image-generation intent.
    h = _has_hint(message, GENERATION_HINTS)
    if h:
        return IntentResult(ProcessingClass.GENERATE, KnowledgeScope.MODEL, matched_hint=h)

    # 3. KNOWLEDGE — user documents attached or referenced.
    if has_doc:
        return IntentResult(ProcessingClass.KNOWLEDGE, KnowledgeScope.USER, requires_attachment=True, matched_hint="document")
    h = _has_hint(message, DOCUMENT_HINTS)
    if h:
        return IntentResult(ProcessingClass.KNOWLEDGE, KnowledgeScope.USER, matched_hint=h)

    # 4. LIVE — the message itself asks for something current.
    #    `req.web_search` is deliberately NOT consulted here. It is a permission, not a command:
    #    short-circuiting on it made every message LIVE, so "hello" triggered a full search and up
    #    to three page fetches. Whether the toggle permits a search is decided in the planner.
    h = _has_hint(message, WEB_HINTS)
    if h or _WEB_HINTS_RE.search(message):
        return IntentResult(ProcessingClass.LIVE, KnowledgeScope.WEB, requires_live_data=True,
                            matched_hint=h or "down")

    # 5. DIRECT — general knowledge (model answers).
    return IntentResult(ProcessingClass.DIRECT, KnowledgeScope.MODEL, matched_hint=None)
