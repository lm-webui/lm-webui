"""
MLX Model utilities — list local MLX models in the container's models dir.
MLX models are primarily managed on the macOS host. The container can list
any that happen to be in its models directory (e.g. cached from a native run).
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MLX_DIR = Path(__file__).parent.parent.parent / "models" / "mlx"


def list_local_mlx_models() -> list:
    """List MLX models found in the container's models/mlx/ directory."""
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
    """Delete a local MLX model directory from the container."""
    import shutil
    target = MLX_DIR / name
    if target.exists():
        shutil.rmtree(target)
        return True
    return False
