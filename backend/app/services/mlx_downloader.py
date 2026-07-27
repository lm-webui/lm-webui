"""
MLX Model Downloader — download HuggingFace repos to backend/models/mlx/.
Uses huggingface_hub.snapshot_download() for reliable multi-file downloads.
"""
import asyncio
import logging
import os
from pathlib import Path
from typing import Optional
from huggingface_hub import snapshot_download, HfApi

logger = logging.getLogger(__name__)

MLX_DIR = Path(__file__).parent.parent.parent / "models" / "mlx"
MLX_DIR.mkdir(parents=True, exist_ok=True)


async def download_mlx_model(repo_id: str) -> dict:
    """
    Download an MLX model from HuggingFace to backend/models/mlx/<name>/.
    Uses snapshot_download for atomic multi-file download.
    """
    loop = asyncio.get_event_loop()
    name = repo_id.split("/")[-1] if "/" in repo_id else repo_id
    local_dir = MLX_DIR / name

    if local_dir.exists():
        return {"status": "exists", "repo_id": repo_id, "path": str(local_dir)}

    def _download():
        return snapshot_download(
            repo_id=repo_id,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
            resume_download=True,
            ignore_patterns=["*.pt", "*.bin", "optimizer*"],
        )

    try:
        path = await loop.run_in_executor(None, _download)
        logger.info(f"MLX model downloaded: {repo_id} -> {path}")
        return {"status": "downloaded", "repo_id": repo_id, "path": path}
    except Exception as e:
        # Clean up partial download on failure
        if local_dir.exists():
            import shutil
            shutil.rmtree(local_dir, ignore_errors=True)
        logger.error(f"MLX download failed for {repo_id}: {e}")
        return {"status": "error", "repo_id": repo_id, "error": str(e)}


def list_local_mlx_models() -> list:
    """List MLX models in backend/models/mlx/."""
    if not MLX_DIR.exists():
        return []
    models = []
    for entry in sorted(MLX_DIR.iterdir()):
        if entry.is_dir() and (entry / "config.json").exists():
            import json
            try:
                cfg = json.loads((entry / "config.json").read_text())
                models.append({
                    "name": entry.name,
                    "path": str(entry),
                    "model_type": cfg.get("model_type", "unknown"),
                    "arch": cfg.get("architectures", [None])[0],
                })
            except Exception:
                models.append({"name": entry.name, "path": str(entry), "model_type": "unknown"})
    return models


def delete_local_mlx_model(name: str) -> bool:
    """Delete a local MLX model directory."""
    import shutil
    target = MLX_DIR / name
    if target.exists():
        shutil.rmtree(target)
        return True
    return False


def resolve_hf_repo(repo_id: str) -> Optional[dict]:
    """Check if a repo exists and return metadata."""
    try:
        api = HfApi()
        info = api.model_info(repo_id)
        return {
            "repo_id": repo_id,
            "private": info.private,
            "downloads": getattr(info, "downloads", 0),
            "tags": getattr(info, "tags", []),
        }
    except Exception:
        return None
