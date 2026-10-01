"""
Google Image Generation — via the official google-genai SDK.
"""
import logging
from fastapi.responses import JSONResponse
from app.models.schemas import ChatRequest
from app.services.save_generated_image import save_generated_image
from app.database import get_db
from app.security.encryption import decrypt_key

logger = logging.getLogger(__name__)


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
        from google import genai
        from google.genai import errors, types

        model_name = req.model or "gemini-2.5-flash"
        prompt = req.message
        logger.info(f"Generating image with Google model: {model_name}")

        # The key is handed to the SDK, never placed in a URL. The previous implementation
        # called `${GEMINI_API}/...:generateContent?key=<key>` directly, which put a live
        # credential in a query string — logged by every proxy in the path and by the SDK's
        # own request telemetry. Both `AIza` traffic strings and `AQ.` auth tokens work here
        # because the SDK chooses the auth mechanism; nothing parses the key.
        client = genai.Client(api_key=api_key)

        parts: list = [prompt]
        if req.image_data_uri:
            # img2img: pass the source image as an inline_data part (data:image/png;base64,XXX)
            try:
                meta, b64 = req.image_data_uri.split(",", 1)
                mime = meta.split(";")[0].split(":")[1]
                parts.append({"inline_data": {"mime_type": mime, "data": b64}})
            except Exception as exc:
                logger.warning(f"Could not attach image part: {exc}")

        try:
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=parts,
                config=types.GenerateContentConfig(
                    response_modalities=["Text", "Image"],
                ),
            )
        except errors.APIError as exc:
            code = exc.code if isinstance(exc.code, int) else 500
            logger.error(f"Google API error {code}: {exc.message}")
            return JSONResponse(status_code=code, content={"error": exc.message})

        candidates = response.candidates or []
        if not candidates:
            return JSONResponse(status_code=500, content={"error": "No candidates returned"})

        image_bytes = None
        for part in (candidates[0].content.parts or []):
            blob = getattr(part, "inline_data", None)
            if blob and (blob.mime_type or "").startswith("image/"):
                image_bytes = blob.data
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
