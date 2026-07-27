"""
MLX Provider Implementation — local inference on Apple Silicon via mlx-lm.
Loads models from backend/models/mlx/<name>/ after download.
"""
import logging
import asyncio
import os
from pathlib import Path
from typing import List, Optional, AsyncGenerator
from ..base import BaseProvider
from ..schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent

try:
    from mlx_lm import load as _mlx_load, generate as _mlx_generate
    HAS_MLX = True
except ImportError:
    HAS_MLX = False

logger = logging.getLogger(__name__)

MLX_DIR = Path(__file__).parent.parent.parent.parent / "models" / "mlx"


class MLXProvider(BaseProvider):
    """Provider for local MLX models on Apple Silicon."""

    def __init__(self):
        super().__init__("mlx", "MLX (Apple Silicon)")
        self._model = None
        self._tokenizer = None
        self._loaded_path = None
        self._lock = asyncio.Lock()

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List MLX models in backend/models/mlx/."""
        if not HAS_MLX or not MLX_DIR.exists():
            return []
        models = []
        for entry in sorted(MLX_DIR.iterdir()):
            if entry.is_dir() and (entry / "config.json").exists():
                models.append(ModelMetadata(
                    id=entry.name,
                    name=entry.name,
                    provider=self.id,
                    context_window=4096,
                ))
        return models

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        raise NotImplementedError("Use stream() for MLX inference")

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        if not HAS_MLX:
            yield ModelEvent.error("MLX not installed (pip install mlx-lm)")
            return

        model_id = request.model
        if not model_id:
            yield ModelEvent.error("No model specified")
            return

        model_path = str(MLX_DIR / model_id)
        if not os.path.isdir(model_path):
            yield ModelEvent.error(f"Model {model_id} not found in {MLX_DIR}")
            return

        from app.services.mlx_downloader import MLX_DIR as _MLX_DIR

        yield ModelEvent.typing()

        try:
            messages = request.messages or []
            prompt = ""
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                prompt += f"<|im_start|>{role}\n{content}\n<|im_end|>\n"
            prompt += "<|im_start|>assistant\n"

            async def _run():
                loop = asyncio.get_event_loop()
                model, tokenizer = await loop.run_in_executor(None, lambda: _mlx_load(model_path))
                resp = await loop.run_in_executor(
                    None,
                    lambda: _mlx_generate(model, tokenizer, prompt, max_tokens=request.max_tokens or 2048, verbose=False),
                )
                return resp

            response = await _run()
            yield ModelEvent.token(response)
            yield ModelEvent.done()

        except Exception as e:
            logger.error(f"MLX generation error: {e}")
            yield ModelEvent.error(str(e))
