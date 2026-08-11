"""
Smart-Modality — deterministic intent / request router.

Consumes an IntentResult from the IntentClassifier and produces the minimal
ExecutionPlan. The planner never does keyword matching itself — intent
classification lives in `intent_classifier.py`.

Principle: RAG is a capability, not the default. Plain chat skips retrieval.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from .intent_classifier import IntentRequest, IntentResult, ProcessingClass, classify, _is_image


@dataclass
class ExecutionPlan:
    """What the orchestrator should run for this request (chat path)."""
    retrieve: bool = False      # run RAG retrieval (knowledge search)
    file_context: bool = False  # inject direct extracted text of attachments
    search: bool = False        # run web search
    vision: bool = False        # image attachment -> vision model
    vision_mode: str = "direct" # "direct" (VL answers) | "describe" (VL describes → selected LLM)
    diffusion: bool = False     # image generation
    processing_class: str = ""  # informational (DIRECT/LIVE/KNOWLEDGE/VISION/GENERATE)
    background: List[str] = field(default_factory=list)  # post-answer jobs


def _has_docs(refs: List[dict]) -> bool:
    from .intent_classifier import _is_image
    return any(not _is_image(r) for r in (refs or []))


def plan(
    *,
    message: str = "",
    file_references: List[dict] | None = None,
    web_search: bool = False,
    image_mode: bool = False,
) -> ExecutionPlan:
    """Classify intent, then build the minimal capability plan."""
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

    # Vision runs for any image attachment — even when mixed with documents.
    if has_images:
        p.vision = True
        p.vision_mode = intent.vision_mode

    if intent.processing_class == ProcessingClass.LIVE:
        p.search = True
        return p

    # Documents (or knowledge scope) → direct file context + retrieval (RAG).
    if intent.processing_class == ProcessingClass.KNOWLEDGE or has_docs:
        if has_docs:
            p.file_context = True
        p.retrieve = True

    return p
