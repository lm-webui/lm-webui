"""
Google Image Generation — direct REST API via Gemini (no SDK dependency).
"""
import logging
import base64
import json
import aiohttp
from fastapi.responses import JSONResponse
from app.models.schemas import ChatRequest
from app.services.save_generated_image import save_generated_image
from app.database import get_db
from app.security.encryption import decrypt_key

logger = logging.getLogger(__name__)

GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models"


async def generate_image_gemini(req: ChatRequest, background_tasks=None):
    user_id = req.user_id
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "User ID required"})

    # Resolve key (same as chat flow)
    row = get_db().execute(
        "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
        (user_id, "google"),
    ).fetchone()
    api_key = decrypt_key(row[0]) if row else None
    if not api_key:
        return JSONResponse(status_code=401, content={"error": "Google API key required"})

    try:
        model_name = req.model or "gemini-2.5-flash"
        prompt = req.message
        logger.info(f"Generating image with Google model: {model_name}")

        url = f"{GEMINI_API}/{model_name}:generateContent?key={api_key}"

        payload: dict = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["Text", "Image"]},
        }


        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                body = await resp.json()

                if resp.status != 200:
                    err_msg = body.get("error", {}).get("message", str(body))
                    logger.error(f"Google API error {resp.status}: {err_msg}")
                    return JSONResponse(status_code=resp.status, content={"error": err_msg})

                # Extract image from response
                candidates = body.get("candidates", [])
                if not candidates:
                    return JSONResponse(status_code=500, content={"error": "No candidates returned"})

                image_bytes = None
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part and part["inlineData"].get("mimeType", "").startswith("image/"):
                        image_bytes = base64.b64decode(part["inlineData"]["data"])
                        break

                if not image_bytes:
                    return JSONResponse(status_code=500, content={"error": "No image in response"})

        logger.info(f"Decoded {len(image_bytes)} bytes from Gemini response")

        result = await save_generated_image(
            image_bytes=image_bytes, user_id=user_id, prompt=prompt,
            model=model_name, provider="google",
            params={"model": model_name},
        )
        return {"status": "generated", "image_url": result["image_url"]}

    except Exception as e:
        logger.error(f"Google image generation error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})
