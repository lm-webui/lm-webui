"""chat capability — build messages via PromptBuilder and a GenerateRequest."""
from __future__ import annotations

import logging
from typing import Any, Tuple

from app.providers.schemas import GenerateRequest
from .base import CapabilityContext
from .prompt_builder import build_messages

logger = logging.getLogger(__name__)


async def execute(ctx: CapabilityContext) -> Tuple[Any, GenerateRequest]:
    """Build messages from ctx.results + ctx and return (provider_to_use, GenerateRequest)."""
    ctx.messages = build_messages(
        ctx.chat_request.message,
        ctx.results,
        ctx.conversation_id,
        system_prompt=ctx.system_prompt,
    )
    # Two-stage vision: a bare "what's in this image" query → VL answers directly (one-stage).
    # Otherwise the VL describes the image and the selected text LLM composes the final answer.
    direct = ctx.vision_ready and getattr(ctx, "vision_mode", "direct") == "direct"
    if direct:
        provider_to_use = ctx.vision_provider
        images = ctx.images
        model = ctx.vision_model or ctx.model_id
    else:
        provider_to_use = ctx.provider
        images = None
        model = ctx.model_id
    req = GenerateRequest(
        model=model,
        messages=ctx.messages,
        stream=True,
        max_tokens=ctx.max_tokens,
        temperature=ctx.temperature,
        top_p=ctx.top_p,
        api_key=ctx.api_key,
        images=images,
    )
    return provider_to_use, req
