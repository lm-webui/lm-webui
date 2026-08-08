"""
MLX Model Downloader — download HuggingFace repos to ~/.lmwebui/models/mlx/.
Uses huggingface_hub.snapshot_download() for reliable multi-file downloads.
"""
import asyncio
import functools
import json
import logging
import os
import shutil
import threading
import uuid
from pathlib import Path
from typing import Optional
from tqdm import tqdm
from huggingface_hub import snapshot_download, HfApi

logger = logging.getLogger(__name__)

_LMWEBUI_HOME = Path(os.environ.get("LMWEBUI_HOME", Path.home() / ".lmwebui"))
MLX_DIR = _LMWEBUI_HOME / "models" / "mlx"
MLX_DIR.mkdir(parents=True, exist_ok=True)

# Download progress store keyed by task_id — mirrors the GGUF download task pattern.
_PROGRESS: dict[str, dict] = {}


class _ProgressTqdm(tqdm):
    """tqdm subclass that records byte progress into the shared store."""

    def __init__(self, task_id: str, *args, **kwargs):
        self._task_id = task_id
        super().__init__(*args, **kwargs)

    def update(self, n: int = 1):
        super().update(n)
        total = self.total or 0
        _PROGRESS[self._task_id] = {
            "progress": int(self.n / total * 100) if total else 0,
            "status": "downloading",
        }


def start_mlx_download(repo_id: str) -> str:
    """Kick off a background MLX download; returns a task_id for progress polling."""
    task_id = uuid.uuid4().hex
    name = repo_id.split("/")[-1] if "/" in repo_id else repo_id
    local_dir = MLX_DIR / name

    if local_dir.exists():
        _PROGRESS[task_id] = {"progress": 100, "status": "exists", "repo_id": repo_id}
        return task_id

    _PROGRESS[task_id] = {"progress": 0, "status": "downloading", "repo_id": repo_id}

    def _run():
        try:
            snapshot_download(
                repo_id=repo_id,
                local_dir=str(local_dir),
                local_dir_use_symlinks=False,
                resume_download=True,
                ignore_patterns=["*.pt", "*.bin", "optimizer*"],
                tqdm_class=functools.partial(_ProgressTqdm, task_id),
            )
            _PROGRESS[task_id] = {"progress": 100, "status": "completed", "repo_id": repo_id}
            logger.info(f"MLX model downloaded: {repo_id} -> {local_dir}")
        except Exception as e:
            if local_dir.exists():
                shutil.rmtree(local_dir, ignore_errors=True)
            _PROGRESS[task_id] = {"progress": 0, "status": "failed", "repo_id": repo_id, "error": str(e)}
            logger.error(f"MLX download failed for {repo_id}: {e}")

    threading.Thread(target=_run, daemon=True).start()
    return task_id


def get_mlx_progress(task_id: str) -> Optional[dict]:
    return _PROGRESS.get(task_id)


async def download_mlx_model(repo_id: str) -> dict:
    """Download an MLX model from HuggingFace to ~/.lmwebui/models/mlx/<name>/."""
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
        if local_dir.exists():
            shutil.rmtree(local_dir, ignore_errors=True)
        logger.error(f"MLX download failed for {repo_id}: {e}")
        return {"status": "error", "repo_id": repo_id, "error": str(e)}


def list_local_mlx_models() -> list:
    """List MLX models in ~/.lmwebui/models/mlx/."""
    if not MLX_DIR.exists():
        return []
    models = []
    for entry in sorted(MLX_DIR.iterdir()):
        if entry.is_dir() and (entry / "config.json").exists():
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
