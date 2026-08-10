"""vision capability — collect image attachments and pick a vision provider."""
from __future__ import annotations

import asyncio
import logging

from .base import CapabilityContext
from .results import VisionResult

logger = logging.getLogger(__name__)


async def _describe(provider, images: list) -> str:
    """One-shot VL describe pass — produces text the selected LLM composes from."""
    from app.providers.schemas import GenerateRequest
    req = GenerateRequest(
        model="vision",
        messages=[{
            "role": "user",
            "content": "Describe this image in detail: subject, composition, colors, lighting, style, and any notable elements.",
        }],
        images=images,
        max_tokens=500,
        stream=False,
    )
    try:
        resp = await provider.generate(req)
        return (resp.content or "").strip()
    except Exception as exc:
        logger.warning("Vision describe pass failed: %s", exc)
        return ""


def _user_vision_model(user_id: int) -> str:
    """Return the user's default vision model (Settings → Inference), or ''."""
    try:
        import json as _json
        from app.database import get_db
        db = get_db()
        try:
            row = db.execute(
                "SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id,)
            ).fetchone()
            if row and row[0]:
                return (_json.loads(row[0]).get("defaultVisionModel") or "").strip()
        finally:
            db.close()
    except Exception:
        pass
    return ""


def _health(model: str) -> bool:
    """Capability health: runtime (llama-server) + model bundle + mmproj."""
    import shutil
    if shutil.which("llama-server") is None:
        return False
    try:
        from app.runtime.vision_runtime import vision_runtime
        vision_runtime.model = model
        bundle = vision_runtime.resolve_bundle()
        return bool(bundle and bundle.get("mmproj"))
    except Exception:
        return False


def collect_image_data_uris(file_references: list) -> list:
    """Return base64 data-URIs of image attachments (for the vision path).

    Resolves each image ref by priority: a direct local `file_path`/`url` on the ref, then
    `media_library` by `media_id`/`id`, then by `filename`.
    """
    import base64
    import os as _os
    from app.database import get_db
    db = None
    try:
        db = get_db()
        cur = db.cursor()
    except Exception:
        if db is not None:
            db.close()
        return []
    try:
        uris = []
        for ref in file_references or []:
            ftype = (ref.get("type") or "").lower()
            mime = (ref.get("mime") or ref.get("content_type") or "")
            if ftype != "image" and not mime.startswith("image/"):
                continue
            # 1. Direct local path on the ref.
            url = ref.get("url")
            path = ref.get("file_path") or (url if isinstance(url, str) and not url.startswith(("http://", "https://", "data:")) else None)
            # 2. DB lookup by media id.
            if not path:
                fid = ref.get("media_id") or ref.get("id")
                if fid:
                    try:
                        cur.execute("SELECT file_path FROM media_library WHERE id = ?", (fid,))
                        r = cur.fetchone()
                        if r and r[0]:
                            path = r[0]
                    except Exception:
                        path = None
            # 3. DB lookup by filename.
            if not path:
                fname = ref.get("filename") or ref.get("name")
                if fname:
                    try:
                        cur.execute("SELECT file_path FROM media_library WHERE filename = ?", (fname,))
                        r = cur.fetchone()
                        if r and r[0]:
                            path = r[0]
                    except Exception:
                        path = None
            if not path or not _os.path.exists(str(path)):
                continue
            try:
                with open(str(path), "rb") as fh:
                    b64 = base64.b64encode(fh.read()).decode()
                mt = mime or "image/png"
                uris.append(f"data:{mt};base64,{b64}")
            except Exception:
                continue
        return uris
    finally:
        db.close()


async def execute(ctx: CapabilityContext) -> VisionResult:
    """Collect image data-URIs and resolve the vision provider into ctx.

    Uses capability health (runtime + bundle + mmproj); if not ready, returns a
    not-ready result and falls back to normal chat.
    """
    if not ctx.chat_request or not ctx.chat_request.file_references:
        return VisionResult(ready=False)
    try:
        images = await asyncio.to_thread(
            collect_image_data_uris, ctx.chat_request.file_references
        ) or None
    except Exception as exc:
        logger.warning("Vision image collection failed: %s", exc)
        images = None

    ctx.images = images
    if not images:
        return VisionResult(images=None, ready=False)

    # Prefer a configured vision provider (e.g. ollama), else a local vision bundle.
    try:
        from app.core.config_manager import get_config as _vc
        from app.providers.factory import ProviderFactory
        vc = _vc().vision
        # The user's default vision model (Settings → Inference) wins; fall back to the global config.
        ctx.vision_model = _user_vision_model(ctx.user_id) or getattr(vc, "model", "") or ctx.model_id
        if getattr(vc, "provider", ""):
            ctx.vision_provider_id = vc.provider
            ctx.vision_provider = ProviderFactory.get_provider(ctx.vision_provider_id)
            ctx.vision_ready = ctx.vision_provider is not None
            return VisionResult(images=images, provider=ctx.vision_provider, ready=ctx.vision_ready)

        # Local vision bundle — check capability health first.
        if not _health(ctx.vision_model):
            logger.warning("Vision not ready (need llama-server + vision bundle + mmproj). Set a default vision model in Settings → Inference or open the model downloader.")
            ctx.vision_ready = False
            return VisionResult(images=images, provider=None, ready=False)

        from app.runtime.vision_runtime import vision_runtime
        vision_runtime.model = ctx.vision_model
        if await vision_runtime.start():
            from app.providers.remote.openai import OpenAIProvider
            ctx.vision_provider = OpenAIProvider("vision", "Vision (llama-server)", vision_runtime.base_url)
            ctx.vision_provider_id = "vision"
            ctx.vision_ready = True
            # Vision mode comes from the intent classifier (direct vs describe).
            ctx.vision_mode = getattr(ctx, "vision_mode", "direct")
            if ctx.vision_mode == "direct":
                return VisionResult(images=images, provider=ctx.vision_provider, ready=True)
            desc = await _describe(ctx.vision_provider, images)
            ctx.vision_description = desc
            return VisionResult(images=images, provider=ctx.vision_provider, ready=True, text=desc)
    except Exception as exc:
        logger.warning("Vision config resolution failed: %s", exc)
    ctx.vision_ready = False
    return VisionResult(images=images, provider=None, ready=False)
