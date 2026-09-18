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
# unambiguous on its own. Scored against 11 live queries that should search and 11 ordinary
# development messages that should not:
#
#     original (10 entries)    3/11 live caught    2/11 wasted dev searches
#     broadened (31 entries)  11/11 live caught    8/11 wasted dev searches   <- rejected
#     this list (18 entries)   7/11 live caught    0/11 wasted dev searches
#
# The broadened version is rejected deliberately. In a coding workspace the words that buy recall —
# "news", "price", "today", "recent", "look up", " down" — are everyday development vocabulary:
# "the price display in my app" and "the stock levels in inventory" are not questions about the
# world. A wasted search costs a search plus up to three page fetches AND dilutes the context the
# user actually asked about, so precision wins. The four live queries this list misses are recorded
# in tests/unit/test_search_toggle.py::test_known_misses_are_the_accepted_trade.
#
# No substring list gets both: a word broad enough to catch "who won the election" is the same word
# that catches "the stock levels in inventory". That ceiling is the argument for tool calling.
WEB_HINTS = (
    # Explicit request to search.
    "search the web", "web search", "search for",
    # Unambiguous live-data nouns and events.
    "weather", "forecast", "exchange rate", "stock price", "current price", "today's news",
    "breaking", "trending", "standings", "outage", "headline", "who won",
    "release notes", "release date", "up to date",
    # The phrase, not the word. Bare "latest" is ambiguous — "the latest commit", "the latest
    # changes" are ordinary development talk — while "latest news" is only ever about the world.
    # This is what keeps the canonical query ("what is the latest news about X?") working at no
    # measurable cost in false positives.
    "latest news",
)
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
    if h:
        return IntentResult(ProcessingClass.LIVE, KnowledgeScope.WEB, requires_live_data=True, matched_hint=h)

    # 5. DIRECT — general knowledge (model answers).
    return IntentResult(ProcessingClass.DIRECT, KnowledgeScope.MODEL, matched_hint=None)
