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
    # Vision provider only when the vision capability reports ready; else the chat provider.
    provider_to_use = ctx.vision_provider if (ctx.vision_provider and ctx.vision_ready) else ctx.provider
    images = ctx.images if (ctx.vision_ready and ctx.images) else None
    req = GenerateRequest(
        model=ctx.vision_model or ctx.model_id,
        messages=ctx.messages,
        stream=True,
        max_tokens=ctx.max_tokens,
        temperature=ctx.temperature,
        top_p=ctx.top_p,
        api_key=ctx.api_key,
        images=images,
    )
    return provider_to_use, req
