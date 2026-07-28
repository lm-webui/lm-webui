"""
MLX Model Routes — list and delete MLX models.
MLX runs as mlx_lm.server on the macOS host (not in Docker).
Model download is a host-side operation — WebUI shows CLI commands.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from app.security.auth.dependencies import get_current_user, require_permission
from app.providers.local.mlx import MLXProvider, MLX_DEFAULT_ENDPOINT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mlx", tags=["mlx"])


class DownloadRequest(BaseModel):
    repo_id: str


@router.get("/models")
async def list_mlx_models(user_id: dict = Depends(require_permission("models.install"))):
    """List models loaded in the MLX server via its OpenAI-compatible API."""
    provider = MLXProvider()
    models = await provider.list_models()
    return {
        "models": [
            {"name": m.id, "provider": "mlx"}
            for m in models
        ]
    }


@router.post("/resolve")
async def resolve_mlx_repo(req: DownloadRequest, _: dict = Depends(require_permission("models.install"))):
    """Return CLI command for downloading an MLX model on the host."""
    return {
        "status": "host_command",
        "repo_id": req.repo_id,
        "command": f"mlx_lm.fetch --hf-path {req.repo_id}",
        "alternative": f"mlx_lm.server --port 8090 --model {req.repo_id}",
        "message": "MLX models must be on the macOS host filesystem. Run the command above on your host.",
    }


@router.post("/download")
async def download_mlx_model(req: DownloadRequest, _: dict = Depends(require_permission("models.install"))):
    """Return CLI command for downloading MLX model on host (download happens on host, not in container)."""
    return {
        "status": "host_command",
        "repo_id": req.repo_id,
        "command": f"mlx_lm.fetch --hf-path {req.repo_id}",
        "message": "Run this command on your macOS host. MLX models must be on the host filesystem for mlx_lm.server to access them.",
    }


@router.delete("/models/{model_name}")
async def delete_mlx_model(model_name: str, _: dict = Depends(require_permission("models.install"))):
    """Delete an MLX model from the host (returns CLI command)."""
    return {
        "status": "host_command",
        "command": f"rm -rf ~/.mlx/models/{model_name}",
        "message": "Run this command on your macOS host to delete the model.",
    }
