"""
ComfyUI ("Image-Gen") Model Routes
Preset checkpoint catalog + download into the local ComfyUI models/checkpoints dir.
Reuses the shared gguf_downloader + progress/status infra (by task_id), so the
frontend DownloadsProvider and /api/models/download/status/{task_id} work for free.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends

from app.services.gguf_downloader import gguf_downloader
from app.services.comfyui_runtime import (
    MODEL_CATALOG, QWEN_ASSETS, catalog_entries, qwen_asset_entries, qwen_models_dir,
    checkpoints_dir, comfyui_runtime,
)
from app.core.error_handlers import safe_path
from app.security.auth.dependencies import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/comfyui")

# Only these may land in a checkpoint dir. The preset branch is trusted; the
# caller-supplied branch had no extension check at all, so any file type was writable.
ALLOWED_CHECKPOINT_EXTS = (".safetensors", ".ckpt")


@router.get("/presets")
async def list_presets(_: dict = Depends(require_permission("models.install"))):
    """Preset diffusion checkpoints available for download.

    Read from the same catalog the generation path resolves against, so a downloaded
    preset is always the file the workflow will ask for.
    """
    return {"presets": catalog_entries(), "qwen_assets": qwen_asset_entries()}


@router.get("/checkpoints")
async def list_checkpoints(_: dict = Depends(require_permission("models.read"))):
    """Checkpoints actually installed in the managed engine."""
    return {"checkpoints": comfyui_runtime.checkpoints(), "dir": str(checkpoints_dir())}


@router.delete("/checkpoints/{filename}")
async def delete_checkpoint(
    filename: str,
    _: dict = Depends(require_permission("models.delete")),
):
    """Delete one installed checkpoint from the managed engine."""
    try:
        target = safe_path(checkpoints_dir(), filename)
    except Exception:
        raise HTTPException(400, "Invalid filename")
    if not target.is_file():
        raise HTTPException(404, "Checkpoint not found")
    target.unlink()
    return {"success": True, "filename": target.name}


@router.post("/download")
async def start_download(
    req: dict, _: dict = Depends(require_permission("models.install"))
):
    """
    Start downloading a diffusion checkpoint into ComfyUI's models/checkpoints.

    Request: {"model_id": "sd15"}  or  {"url": "...", "filename": "..."}

    Response:
    {
        "task_id": "uuid-string",
        "status": "starting",
        "websocket_url": "/api/models/download-ws/{task_id}"
    }
    """
    model_id = (req.get("model_id") or "").strip()
    asset_id = (req.get("asset_id") or "").strip()
    url = (req.get("url") or "").strip()
    filename = (req.get("filename") or "").strip()

    if asset_id:
        asset = next((a for a in qwen_asset_entries() if a["id"] == asset_id), None)
        if not asset:
            raise HTTPException(status_code=400, detail=f"Unknown asset_id: {asset_id}")
        url, filename = asset["url"], asset["filename"]
        target_dir = qwen_models_dir(asset["kind"])
    elif model_id:
        preset = MODEL_CATALOG.get(model_id)
        if not preset:
            raise HTTPException(status_code=400, detail=f"Unknown model_id: {model_id}")
        url, filename = preset["url"], preset["filename"]
        target_dir = qwen_models_dir("diffusion") if preset.get("qwen") else checkpoints_dir()
    elif url and filename:
        if not filename.lower().endswith(ALLOWED_CHECKPOINT_EXTS):
            raise HTTPException(
                status_code=400,
                detail=f"filename must end with {' or '.join(ALLOWED_CHECKPOINT_EXTS)}",
            )
        target_dir = checkpoints_dir()
    else:
        raise HTTPException(
            status_code=400, detail="Provide model_id or both url and filename"
        )

    try:
        task_id = await gguf_downloader.start_download(url, filename, target_dir)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"ComfyUI download start failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start download")

    return {
        "task_id": task_id,
        "status": "starting",
        "websocket_url": f"/api/models/download-ws/{task_id}",
        "filename": filename,
        "target_dir": str(target_dir),
    }
