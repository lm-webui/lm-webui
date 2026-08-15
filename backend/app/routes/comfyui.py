"""
ComfyUI ("Image-Gen") Model Routes
Preset checkpoint catalog + download into the local ComfyUI models/checkpoints dir.
Reuses the shared gguf_downloader + progress/status infra (by task_id), so the
frontend DownloadsProvider and /api/models/download/status/{task_id} work for free.
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pathlib import Path

from app.services.gguf_downloader import gguf_downloader
from app.security.auth.dependencies import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/comfyui")

# ComfyUI checkpoint dir (mirrors app.services.local_runtime.COMFYUI_DIR)
COMFYUI_DIR = Path(os.path.expanduser(os.getenv("COMFYUI_DIR", "~/ComfyUI")))
CHECKPOINTS_DIR = COMFYUI_DIR / "models" / "checkpoints"

# Preset checkpoint catalog (workflow-matched). Sizes are approximate download hints.
PRESETS = {
    "sd15": {
        "id": "sd15",
        "name": "Stable Diffusion 1.5",
        "filename": "v1-5-pruned-emaonly.safetensors",
        "url": "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
        "size": "~4 GB",
    },
    "sdxl": {
        "id": "sdxl",
        "name": "SDXL Base 1.0",
        "filename": "sd_xl_base_1.0.safetensors",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
        "size": "~6.9 GB",
    },
}


@router.get("/presets")
async def list_presets(_: dict = Depends(require_permission("models.install"))):
    """List preset diffusion checkpoints available for download."""
    return {"presets": list(PRESETS.values())}


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
    url = (req.get("url") or "").strip()
    filename = (req.get("filename") or "").strip()

    if model_id:
        preset = PRESETS.get(model_id)
        if not preset:
            raise HTTPException(status_code=400, detail=f"Unknown model_id: {model_id}")
        url, filename = preset["url"], preset["filename"]
    elif url and filename:
        pass
    else:
        raise HTTPException(
            status_code=400, detail="Provide model_id or both url and filename"
        )

    try:
        task_id = await gguf_downloader.start_download(url, filename, CHECKPOINTS_DIR)
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
        "target_dir": str(CHECKPOINTS_DIR),
    }
