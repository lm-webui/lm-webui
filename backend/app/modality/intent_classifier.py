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
WEB_HINTS = ("latest", "search the web", "web search", "current price", "today's news",
             "what's new", "recent", "breaking", "weather", "stock price")
DOCUMENT_HINTS = ("my invoices", "my notes", "my documents", "the pdf", "my pdf",
                  "the file", "the attached", "from the uploaded", "this document",
                  "my knowledge base", "summarize this file", "what did i", "in this doc",
                  "uploaded pdf", "uploaded document", "uploaded file", "this pdf")
IMAGE_HINTS = ("screenshot", "this image", "this picture", "the photo", "this diagram", "this chart")
GENERATION_HINTS = ("generate an image", "create an image", "make an image", "draw a",
                    "draw an", "create a picture", "generate a picture", "image of",
                    "picture of", "logo of", "illustrate", "generate a logo", "design a")
AUDIO_HINTS = ("transcribe", "voice note", "audio note", "what did they say", "convert audio")
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


def _is_simple_vision_query(message: str) -> bool:
    """A bare description / "what X in the picture" query → one-stage VL."""
    m = message.lower()
    return bool(_has_hint(m, VISION_SIMPLE_HINTS) or _VISION_SIMPLE_RE.search(message))


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
    if has_image and not req.image_mode and has_doc:
        # an image AND a doc: prefer knowledge? keep it simple: vision when image only.
        pass
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

    # 4. LIVE — web search requested or hinted.
    if req.web_search:
        return IntentResult(ProcessingClass.LIVE, KnowledgeScope.WEB, requires_live_data=True, matched_hint="web_search")
    h = _has_hint(message, WEB_HINTS)
    if h:
        return IntentResult(ProcessingClass.LIVE, KnowledgeScope.WEB, requires_live_data=True, matched_hint=h)

    # 5. DIRECT — general knowledge (model answers).
    return IntentResult(ProcessingClass.DIRECT, KnowledgeScope.MODEL, matched_hint=None)
