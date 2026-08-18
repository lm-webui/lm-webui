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
    "gguf": "app.services.local_image.generate_image_local",
}


def supports_image_input(provider: str, model: str) -> bool:
    """True when the provider/model accepts a source image (true img2img).

    Gemini-image models accept an inlineData part; OpenAI's gpt-image accepts an
    `image` param. DALL-E and ComfyUI are text-to-image only → describe-then-generate.
    """
    p, m = (provider or "").lower(), (model or "").lower()
    if p in ("google", "gemini"):
        return ("image" in m) or ("gemini" in m)
    if p == "openai":
        return "gpt-image" in m
    return False


def _is_image_gen(provider: str, model: str) -> bool:
    """True when the provider/model can generate images at all (t2i or img2img).

    Broader than `supports_image_input` — DALL-E/imagen generate but take no source
    image. Used to honor the composer's selected model only when it's an image model,
    falling back to the Settings default otherwise.
    """
    p, m = (provider or "").lower(), (model or "").lower()
    if p in ("google", "gemini"):
        return "image" in m or "imagen" in m
    if p == "openai":
        return "gpt-image" in m or "dall-e" in m
    if p == "comfyui":
        return True  # sdxl/flux/sd3/ltx are all t2i
    return False


def _resolve_image_model(prefs: dict, selected_provider: str, selected_model: str) -> tuple[str, str]:
    """Pick the generation provider/model: composer's selected model if it's image-capable,
    else the Settings default image-gen model (smart-modality default)."""
    def_provider = prefs.get("defaultImageProvider") or "openai"
    def_model = prefs.get("defaultImageModel") or ""
    if _is_image_gen(selected_provider or "", selected_model or ""):
        return selected_provider, selected_model
    return def_provider, def_model


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

    # Honor the composer's selected model when it can generate images; otherwise fall
    # back to the Settings default image-gen provider/model (smart-modality default).
    prefs = _default_image_prefs(ctx.user_id)
    provider, model = _resolve_image_model(
        prefs,
        getattr(ctx.chat_request, "provider", "") or "",
        getattr(ctx.chat_request, "model", "") or "",
    )

    handler_path = _IMAGE_HANDLERS.get(provider)
    if not handler_path:
        logger.warning("No image handler for provider %s", provider)
        return ImageGenResult()
    try:
        from app.models.schemas import ChatRequest
        mod = __import__(handler_path.rsplit(".", 1)[0], fromlist=[handler_path.rsplit(".", 1)[1]])
        handler = getattr(mod, handler_path.rsplit(".", 1)[1])

        # Hybrid: image-input-capable model → true img2img; otherwise vision-describe
        # the attached image and bake the description into the prompt (t2i fallback).
        source_uri = (ctx.images or [None])[0]
        if source_uri and not supports_image_input(provider, model):
            desc = getattr(ctx, "vision_description", None) or ""
            if desc:
                prompt = f"{prompt}\n\nReference image description:\n{desc}".strip()

        req = ChatRequest(
            message=prompt,
            provider=provider,
            model=model,
            user_id=ctx.user_id,
            conversation_id=ctx.conversation_id or None,
            image_data_uri=source_uri if supports_image_input(provider, model) else None,
        )
        result = await handler(req)
        image_url = result.get("image_url") if isinstance(result, dict) else None
        if image_url:
            return ImageGenResult(image_url=image_url, provider=provider, model=model)
        logger.warning("Image generation returned no URL: %s", result)
    except Exception as exc:
        logger.warning("Image generation failed: %s", exc)
    return ImageGenResult()
