"""image_gen capability — chat invokes the shared image-generation engine
(Image Studio backend) and returns the generated image URL. Image Studio stays
the owner of generation; chat only renders the result."""
from __future__ import annotations

import json
import logging
from typing import Optional

from .base import CapabilityContext
from .results import ImageGenResult

logger = logging.getLogger(__name__)

# Reuse the exact same handlers as /api/images/generate (one engine, one history).
_IMAGE_HANDLERS = {
    "openai": "app.services.openai_image.generate_image_openai",
    "google": "app.services.gemini_image.generate_image_gemini",
    "gemini": "app.services.gemini_image.generate_image_gemini",
    "comfyui": "app.services.local_image.generate_image_local",
}


def _default_image_prefs(user_id: int) -> dict:
    try:
        from app.database import get_db
        db = get_db()
        row = db.execute(
            "SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row and row[0]:
            return json.loads(row[0])
    except Exception:
        pass
    return {}


async def execute(ctx: CapabilityContext) -> ImageGenResult:
    """Generate an image for the chat prompt via the shared image engine."""
    prompt = (ctx.chat_request.message or "").strip()
    if not prompt:
        return ImageGenResult()

    prefs = _default_image_prefs(ctx.user_id)
    provider = prefs.get("defaultImageProvider") or "openai"
    model = prefs.get("defaultImageModel") or ""

    handler_path = _IMAGE_HANDLERS.get(provider)
    if not handler_path:
        logger.warning("No image handler for provider %s", provider)
        return ImageGenResult()
    try:
        from app.models.schemas import ChatRequest
        mod = __import__(handler_path.rsplit(".", 1)[0], fromlist=[handler_path.rsplit(".", 1)[1]])
        handler = getattr(mod, handler_path.rsplit(".", 1)[1])

        req = ChatRequest(
            message=prompt,
            provider=provider,
            model=model,
            user_id=ctx.user_id,
            conversation_id=ctx.conversation_id or None,
        )
        result = await handler(req)
        image_url = result.get("image_url") if isinstance(result, dict) else None
        if image_url:
            return ImageGenResult(image_url=image_url, provider=provider, model=model)
        logger.warning("Image generation returned no URL: %s", result)
    except Exception as exc:
        logger.warning("Image generation failed: %s", exc)
    return ImageGenResult()
