"""
OpenAI Image Generation — official openai Python SDK (base64 decode, no URL download).
"""
import logging
import base64
from openai import OpenAI
from fastapi.responses import JSONResponse
from app.models.schemas import ChatRequest
from app.services.save_generated_image import save_generated_image
from app.database import get_db
from app.security.encryption import decrypt_key

logger = logging.getLogger(__name__)


async def generate_image_openai(req: ChatRequest, background_tasks=None):
    user_id = req.user_id
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "User ID required"})

    # Always read & decrypt key from DB (same as chat flow in orchestrator)
    row = get_db().execute(
        "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
        (user_id, "openai"),
    ).fetchone()
    api_key = decrypt_key(row[0]) if row else None
    if not api_key:
        return JSONResponse(status_code=401, content={"error": "OpenAI API key required"})

    try:
        import asyncio
        loop = asyncio.get_event_loop()

        model = req.model or "dall-e-3"
        prompt = req.message
        size = req.size or "1024x1024"
        # Map 'standard' (DALL-E value) to 'high' for gpt-image models
        quality = req.quality or "auto"
        if quality == "standard":
            quality = "high"
        logger.info(f"Generating image with model {model}, size {size}, quality {quality}")

        def _generate():
            client = OpenAI(api_key=api_key)
            kwargs = dict(model=model, prompt=prompt, n=1, size=size, quality=quality)
            # gpt-image-1 returns b64_json by default; don't pass response_format
            return client.images.generate(**kwargs)

        response = await loop.run_in_executor(None, _generate)
        data = response.data[0]
        if hasattr(data, 'b64_json') and data.b64_json:
            image_bytes = base64.b64decode(data.b64_json)
            logger.info(f"Decoded {len(image_bytes)} bytes from b64_json")
        else:
            # DALL-E fallback: download from URL
            import aiohttp
            async with aiohttp.ClientSession() as s:
                async with s.get(data.url) as r:
                    image_bytes = await r.read()
            logger.info(f"Downloaded {len(image_bytes)} bytes from URL")
        logger.info(f"Generated {len(image_bytes)} bytes from base64")

        result = await save_generated_image(
            image_bytes=image_bytes, user_id=user_id, prompt=prompt,
            model=model, provider="openai",
            params={"size": size, "quality": quality, "model": model},
        )
        return {"status": "generated", "image_url": result["image_url"]}

    except Exception as e:
        logger.error(f"OpenAI image generation error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})
