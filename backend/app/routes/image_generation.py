"""
Image Generation Routes — Unified Dispatcher
Single endpoint that routes to the correct provider handler.
"""

import asyncio
import logging
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.models.schemas import ChatRequest
from app.security.auth.dependencies import get_current_user
from app.services.gemini_image import generate_image_gemini
from app.services.local_image import generate_image_local
from app.services.openai_image import generate_image_openai
from app.chat.service import save_message
from app.services.usage_tracking import record_usage, estimate_tokens

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/images", tags=["images"])

PROVIDER_ROUTING = {
    "openai": generate_image_openai,
    "google": generate_image_gemini,
    "gemini": generate_image_gemini,  # alias
    "comfyui": generate_image_local,
}

CLOUD_CHAT_VISION = {"grok", "kimi", "deepseek"}


@router.post("/generate")
async def generate_image(
    request: dict,
    background_tasks: BackgroundTasks,
    user_id: dict = Depends(get_current_user),
):
    """
    Unified image generation endpoint.

    Body:
      provider: str  — openai | google | comfyui | grok | kimi | deepseek
      model: str
      prompt: str
      params?: { size?, steps?, guidance?, style? }
    """
    provider = request.get("provider", "openai")
    model = request.get("model", "")
    prompt = request.get("prompt", "")
    params = request.get("params", {})

    # Hybrid img2img: a source image (raw data-URI or uploaded file refs) is passed
    # directly to image-input-capable models; otherwise vision-describe → t2i.
    from app.capabilities.image_gen import supports_image_input
    from app.capabilities.vision import collect_image_data_uris, describe_data_uris

    raw_image = request.get("image")
    file_refs = request.get("file_references") or request.get("files")
    source_uri = None
    if raw_image and isinstance(raw_image, str) and raw_image.startswith("data:"):
        source_uri = raw_image
    elif file_refs:
        uris = await asyncio.to_thread(collect_image_data_uris, file_refs)
        source_uri = uris[0] if uris else None
    if source_uri and not supports_image_input(provider, model):
        desc = await describe_data_uris([source_uri], prompt, user_id["id"])
        if desc:
            prompt = f"{prompt}\n\nReference image description:\n{desc}".strip()

    if not prompt:
        raise HTTPException(400, "Prompt is required")

    # Cloud vision models (Grok, Kimi, DeepSeek) — use chat, not dedicated gen
    if provider in CLOUD_CHAT_VISION:
        return {
            "status": "use_chat",
            "message": f"{provider} is a vision chat model. Send an image in chat for analysis or ask it to generate diagram code (Mermaid.js).",
        }

    handler = PROVIDER_ROUTING.get(provider)
    if not handler:
        raise HTTPException(
            400,
            f"Unsupported provider: {provider} (try: {', '.join(PROVIDER_ROUTING.keys())})",
        )

    # "auto" size → let the provider use its default
    raw_size = params.get("size", "1024x1024")
    if raw_size == "auto":
        raw_size = None

    chat_req = ChatRequest(
        message=prompt,
        provider=provider,
        model=model,
        api_key=request.get("api_key"),
        size=raw_size or "1024x1024",
        quality=params.get("quality", "standard"),
        style=params.get("style", "vivid"),
        negative=params.get("negative") or None,  # ComfyUI local path only
        user_id=user_id["id"],
        conversation_id=request.get("conversation_id"),
        image_data_uri=source_uri if supports_image_input(provider, model) else None,
    )

    try:
        usage_started = time.monotonic()
        result = await handler(chat_req, background_tasks)
        # Handlers may return JSONResponse (error) or dict (success)
        if hasattr(result, "body"):
            if getattr(result, "status_code", 200) >= 400:
                return result
            import json as _json

            body = _json.loads(result.body)
            image_url = body.get("image_url", "")
        else:
            image_url = result.get("image_url", "")

        # Persist to conversation history if conversation_id is provided
        conv_id = request.get("conversation_id")
        if conv_id and image_url:
            try:
                save_message(
                    conversation_id=conv_id,
                    user_id=user_id["id"],
                    role="user",
                    content=prompt,
                    provider=provider,
                    model=model,
                )
                save_message(
                    conversation_id=conv_id,
                    user_id=user_id["id"],
                    role="assistant",
                    content=f"Generated image: {prompt[:80]}{'…' if len(prompt) > 80 else ''}",
                    metadata={"generatedImageUrl": image_url},
                    provider=provider,
                    model=model,
                )
            except Exception as save_err:
                logger.warning(f"Failed to save image messages to history: {save_err}")

        record_usage(
            user_id=user_id["id"],
            event_type="image_generation",
            provider=provider,
            model=model,
            input_tokens=estimate_tokens(prompt),
            output_tokens=0,
            token_accuracy="estimated",
            duration_ms=int((time.monotonic() - usage_started) * 1000),
        )

        return {
            "url": image_url,
            "status": "generated",
        }
    except HTTPException:
        raise
    except Exception as e:
        record_usage(user_id=user_id["id"], event_type="image_generation", provider=provider, model=model, success=False, token_accuracy="unknown", error_code=type(e).__name__)
        logger.error(f"{provider} image generation error: {e}")
        raise HTTPException(500, f"{provider} image generation error: {str(e)}")


@router.get("/history")
async def list_image_history(user_id: dict = Depends(get_current_user)):
    """List previously generated images for the current user."""
    from app.database import get_db

    db = get_db()
    rows = db.execute(
        """SELECT id, filename, file_path, file_type, file_size, uploaded_at, generation_params
           FROM media_library
           WHERE user_id = ? AND media_type = 'image'
           ORDER BY uploaded_at DESC LIMIT 50""",
        (user_id["id"],),
    ).fetchall()
    return {
        "images": [
            {
                "id": r[0],
                "url": f"/generated/images/{r[1]}",
                "filename": r[1],
                "created_at": r[5],
                "params": r[6],
            }
            for r in rows
        ]
    }


@router.delete("/history/{image_id}")
async def delete_image(image_id: int, user_id: dict = Depends(get_current_user)):
    """Delete a generated image."""
    import os
    import time
    from app.database.sqlite.connection_pool import database_manager

    with database_manager.transaction() as conn:
        row = conn.execute(
            "SELECT file_path FROM media_library WHERE id = ? AND user_id = ?",
            (image_id, user_id["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Image not found")
        try:
            os.remove(row[0])
        except OSError:
            pass
        conn.execute("DELETE FROM media_library WHERE id = ?", (image_id,))
    return {"success": True}


@router.get("/models")
async def get_image_models(user_id: dict = Depends(get_current_user)):
    """List available image generation models per provider.
    Queries user's actual API keys to find image-capable models.
    Falls back to known models if API query fails."""
    from app.services.model_registry import get_model_registry

    registry = get_model_registry()
    known = {
        "openai": ["dall-e-3", "dall-e-2", "gpt-image-1"],
        "google": ["imagen-3", "gemini-2.5-flash-image"],
        "comfyui": ["sdxl", "flux-dev", "flux-schnell", "sd3", "ltx"],
    }
    api_keys = registry.get_user_api_keys(user_id["id"])

    # OpenAI — filter for image-capable models
    if api_keys.get("openai"):
        try:
            strategy = registry.get_strategy("openai", user_id["id"])
            if strategy:
                models = await strategy.fetch_models(api_keys.get("openai"))
                image_keywords = ["dall-e", "gpt-image"]
                dynamic = [
                    m["id"]
                    for m in models
                    if any(k in m["id"].lower() for k in image_keywords)
                ]
                if dynamic:
                    known["openai"] = dynamic
        except Exception:
            pass

    # Google — dynamically fetch image-capable models
    if api_keys.get("google"):
        try:
            strat = registry.get_strategy("google", user_id["id"])
            if strat:
                all_models = await strat.fetch_models(api_keys.get("google"))
                # Models supporting image gen: usually contain "imagen" or
                # are "gemini-*-flash-*" or "gemini-*-pro-*" with vision
                img_keywords = ["imagen", "-image"]
                dynamic = sorted(
                    set(
                        m["id"]
                        for m in all_models
                        if any(k in m["id"].lower() for k in img_keywords)
                    )
                )
                if dynamic:
                    known["google"] = dynamic
        except Exception:
            pass

    return {"models": known}


@router.get("/status")
async def image_generation_status(user_id: dict = Depends(get_current_user)):
    """Check image generation service status for the current user."""
    import os

    from app.database import get_db

    def has_key(provider: str) -> bool:
        env_key = os.getenv(f"{provider.upper()}_API_KEY")
        if env_key:
            return True
        try:
            db = get_db()
            row = db.execute(
                "SELECT 1 FROM api_keys WHERE user_id = ? AND provider = ? LIMIT 1",
                (user_id["id"], provider),
            ).fetchone()
            return row is not None
        except Exception:
            return False

    return {
        "status": "ready",
        "providers": {
            "openai": "ready" if has_key("openai") else "missing_key",
            "google": "ready" if has_key("google") else "missing_key",
            "comfyui": "check_runtime",
        },
    }
