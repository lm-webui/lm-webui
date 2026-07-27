"""
MLX Model Routes — list, download, delete MLX models.
Downloads use huggingface_hub.snapshot_download to backend/models/mlx/<name>/.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from app.security.auth.dependencies import get_current_user, require_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mlx", tags=["mlx"])


class DownloadRequest(BaseModel):
    repo_id: str


@router.get("/models")
async def list_mlx_models(user_id: dict = Depends(require_permission("models.install"))):
    """List downloaded MLX models in backend/models/mlx/."""
    from app.services.mlx_downloader import list_local_mlx_models
    return {"models": list_local_mlx_models()}


@router.post("/resolve")
async def resolve_mlx_repo(req: DownloadRequest, _: dict = Depends(require_permission("models.install"))):
    """Check if a HuggingFace repo exists and return metadata (no auth required)."""
    from app.services.mlx_downloader import resolve_hf_repo
    result = resolve_hf_repo(req.repo_id)
    if not result:
        raise HTTPException(404, f"Repo {req.repo_id} not found")
    return result


@router.post("/download")
async def download_mlx_model(req: DownloadRequest, user_id: dict = Depends(require_permission("models.install"))):
    """Download MLX model from HuggingFace to backend/models/mlx/<name>/."""
    from app.services.mlx_downloader import download_mlx_model
    result = await download_mlx_model(req.repo_id)
    if result["status"] == "error":
        raise HTTPException(500, result.get("error", "Download failed"))
    return result


@router.delete("/models/{model_name}")
async def delete_mlx_model(model_name: str, user_id: dict = Depends(require_permission("models.install"))):
    """Delete a local MLX model."""
    from app.services.mlx_downloader import delete_local_mlx_model
    if delete_local_mlx_model(model_name):
        return {"success": True}
    raise HTTPException(404, f"Model {model_name} not found")
