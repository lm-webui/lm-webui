"""executor — walks an ExecutionPlan, running each required capability."""
from __future__ import annotations

from .base import CapabilityContext
from . import file_context, retrieve, search, vision


async def execute_plan(plan, ctx: CapabilityContext) -> CapabilityContext:
    """Run the plan's context-building capabilities, collecting typed results.

    Sequential (not concurrent) to keep each DB access serialized within a request —
    stability over latency.
    """
    ctx.results = []
    if plan.file_context and ctx.chat_request and ctx.chat_request.file_references:
        ctx.results.append(await file_context.execute(ctx))
    if plan.retrieve:
        ctx.results.append(await retrieve.execute(ctx))
    if plan.search:
        ctx.results.append(await search.execute(ctx))
    if plan.vision:
        ctx.results.append(await vision.execute(ctx))
    return ctx
