"""chat capability — build messages via PromptBuilder and a GenerateRequest."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Tuple

from app.providers.schemas import GenerateRequest
from .base import CapabilityContext
from .prompt_builder import build_messages
from .results import MultimodalResult

logger = logging.getLogger(__name__)


_MAX_IMAGE_DIM = 1024  # downscale retrieved images to this max dimension (visual token budget)


def _retrieved_image_uris(ctx: CapabilityContext) -> list[str]:
    """Read cross-modal retrieved image files (Architecture B) into data-URIs.

    Images are downscaled to at most ``_MAX_IMAGE_DIM`` on the long edge so a low-VRAM
    vision LLM isn't flooded with full-resolution pages (visual token optimization).
    """
    import base64
    import io
    import os

    uris: list[str] = []
    for r in ctx.results or []:
        if not isinstance(r, MultimodalResult):
            continue
        for ref in r.image_refs or []:
            path = ref.get("media_path") or ref.get("file_id")
            if not path or not os.path.exists(str(path)):
                continue
            try:
                from PIL import Image
                with Image.open(str(path)) as img:
                    img = img.convert("RGB")
                    if max(img.size) > _MAX_IMAGE_DIM:
                        img.thumbnail((_MAX_IMAGE_DIM, _MAX_IMAGE_DIM))
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=85)
                    b64 = base64.b64encode(buf.getvalue()).decode()
                uris.append(f"data:image/jpeg;base64,{b64}")
            except Exception:
                continue
    return uris


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

    # Architecture B: add cross-modal retrieved images to the payload so the model can
    # see them alongside any user-attached images. Read off the event loop.
    retrieved = await asyncio.to_thread(_retrieved_image_uris, ctx)
    if retrieved:
        images = (images or []) + retrieved

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
