"""
Smart-Modality — deterministic intent / request router.

Consumes an IntentResult from the IntentClassifier and produces the minimal
ExecutionPlan. The planner never does keyword matching itself — intent
classification lives in `intent_classifier.py`.

Principle: RAG is a capability, not the default. Plain chat skips retrieval.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

from .intent_classifier import IntentRequest, IntentResult, ProcessingClass, classify, _is_image, IMG_SIGNAL_RE, YOUTUBE_RE


@dataclass
class ExecutionPlan:
    """What the orchestrator should run for this request (chat path)."""
    retrieve: bool = False      # run RAG retrieval (knowledge search)
    latent_retrieve: bool = False  # Architecture B: multimodal latent retrieval (BGE + SigLIP)
    file_context: bool = False  # inject direct extracted text of attachments
    search: bool = False        # run web search
    vision: bool = False        # image attachment -> vision model
    vision_mode: str = "direct" # "direct" (VL answers) | "describe" (VL describes → selected LLM)
    diffusion: bool = False     # image generation
    transcribe: bool = False    # linked YouTube video → transcribe → summarize
    processing_class: str = ""  # informational (DIRECT/LIVE/KNOWLEDGE/VISION/GENERATE)
    background: List[str] = field(default_factory=list)  # post-answer jobs


def _has_docs(refs: List[dict]) -> bool:
    return any(not _is_image(r) for r in (refs or []))


# Text signals that target one modality — used only when BOTH an image and a doc
# are attached, to avoid running both pipelines when the question clearly points
# at just one.
_DOC_HINTS = re.compile(
    r"\b(pdf|document|doc|file|summary|summar|read|page|paragraph|text|sheet|slides?|"
    r"attached|contents?|knowledge base)\b", re.I)


def _multimodal_enabled() -> bool:
    """True when Architecture B (multimodal latent retrieval) is the active RAG engine."""
    try:
        from app.core.config_manager import get_config
        return get_config().rag.is_multimodal
    except Exception:
        return False


def _message_target(message: str) -> tuple[bool, bool]:
    """Return (targets_image, targets_document) from message text hints."""
    m = message or ""
    return bool(IMG_SIGNAL_RE.search(m)), bool(_DOC_HINTS.search(m))


def plan(
    *,
    message: str = "",
    file_references: List[dict] | None = None,
    web_search: bool = False,
    image_mode: bool = False,
    backfilled: bool = False,
) -> ExecutionPlan:
    """Classify intent, then build the minimal capability plan.

    ``backfilled``: file refs were inherited from conversation history (a follow-up),
    not attached to this message — used to avoid auto-triggering RAG on general follow-ups.
    """
    intent = classify(IntentRequest(
        message=message,
        file_references=file_references or [],
        web_search=web_search,
        image_mode=image_mode,
    ))

    p = ExecutionPlan(processing_class=intent.processing_class.value)
    has_images = any(_is_image(r) for r in (file_references or []))
    has_docs = _has_docs(file_references or [])

    if intent.processing_class == ProcessingClass.GENERATE:
        p.diffusion = True
        return p  # image generation takes over

    if intent.processing_class == ProcessingClass.LIVE:
        p.search = True
        return p

    # Mixed image + doc: run ONLY the pipeline the question targets (rec 2), to
    # avoid paying for RAG + vision + file_context on every message. Ambiguous
    # text ("what about both?") still runs both, with the VL describing the image
    # so the text LLM can compose with the doc context.
    if has_images and has_docs:
        img_hint, doc_hint = _message_target(message)
        if doc_hint and not img_hint:
            p.file_context = True
            if _multimodal_enabled():
                p.latent_retrieve = True
            else:
                p.retrieve = True
        elif img_hint and not doc_hint:
            p.vision = True
            p.vision_mode = "direct"
        else:
            p.vision = True
            p.vision_mode = "describe"
            p.file_context = True
            if _multimodal_enabled():
                p.latent_retrieve = True
            else:
                p.retrieve = True

    elif has_images:
        # Image-only → vision.
        p.vision = True
        p.vision_mode = intent.vision_mode

    elif intent.processing_class == ProcessingClass.KNOWLEDGE or has_docs:
        # Documents (or knowledge scope) → direct file context + retrieval.
        if has_docs:
            p.file_context = True
        # RAG only when the user targets past data: the message references a doc, OR a doc
        # was attached to THIS message (not merely backfilled conversation docs). A general
        # follow-up in a doc-conversation no longer auto-triggers RAG.
        targets_doc = bool(_DOC_HINTS.search(message))
        if targets_doc or (has_docs and not backfilled):
            if _multimodal_enabled():
                # Architecture B — multimodal latent retrieval (BGE deep-text + SigLIP short/vision).
                p.latent_retrieve = True
            else:
                p.retrieve = True

    # Honor an explicit web-search toggle alongside RAG/vision (the user asked for
    # "vision/RAG → websearch → LLM compose"). Vision must be in describe mode so the
    # VL produces a description the text LLM composes with — direct mode would answer
    # alone and drop the web context.
    if web_search and not (p.vision and p.vision_mode == "direct"):
        # Option C (intent-aware): a direct/simple image question is answered by the VL with
        # the image directly — web search is pointless there and would force the heavy describe
        # path. Drop it. Web search combines with RAG/file-context/text everywhere else.
        p.search = True
        if p.vision:
            p.vision_mode = "describe"

    # A linked YouTube video → transcribe and summarize (independent of other modalities).
    if YOUTUBE_RE.search(message or ""):
        p.transcribe = True

    return p
