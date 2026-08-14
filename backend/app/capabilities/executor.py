"""executor — walks an ExecutionPlan, running each required capability."""
from __future__ import annotations

from typing import AsyncGenerator

from app.chat.events import ModelEvent
from .base import CapabilityContext
from . import file_context, retrieve, retrieve_multimodal, search, vision, transcribe_url


async def execute_plan(plan, ctx: CapabilityContext) -> AsyncGenerator[ModelEvent, None]:
    """Run the plan's context-building capabilities, collecting typed results.

    Async generator: yields a `status` ModelEvent before each step (in execution order) so the
    client sees live pipeline stages. Sequential (not concurrent) to keep each DB access
    serialized within a request — stability over latency.
    """
    ctx.results = []
    if plan.file_context and ctx.chat_request and ctx.chat_request.file_references:
        yield ModelEvent.status("file_context", "Reading attachment…")
        ctx.results.append(await file_context.execute(ctx))
    if plan.retrieve:
        yield ModelEvent.status("retrieve", "Retrieving documents…")
        ctx.results.append(await retrieve.execute(ctx))
    if getattr(plan, "latent_retrieve", False):
        yield ModelEvent.status("retrieve", "Retrieving documents…")
        ctx.results.append(await retrieve_multimodal.execute(ctx))
    if plan.vision:
        yield ModelEvent.status("vision", "Reading image…")
        ctx.vision_mode = getattr(plan, "vision_mode", "direct")
        ctx.results.append(await vision.execute(ctx))
    if plan.search:
        # Web search runs last, so when combined with RAG/vision the results follow
        # the file/image context and the LLM composes from all of them.
        yield ModelEvent.status("search", "Searching the web…")
        ctx.results.append(await search.execute(ctx))
    if getattr(plan, "transcribe", False):
        # YouTube transcript is injected via ctx.transcript (prompt_builder), not a result.
        yield ModelEvent.status("transcribe", "Transcribing video…")
        await transcribe_url.execute(ctx)
