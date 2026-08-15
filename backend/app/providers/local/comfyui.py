"""
ComfyUI Provider — local image generation via ComfyUI headless server.
Delegates to local_image.py for workflow construction and polling.
"""
import logging
import os
from typing import List, Optional, Dict, Any
from ..base import BaseProvider
from ..schemas import ModelMetadata

logger = logging.getLogger(__name__)

# Default ComfyUI endpoint
COMFYUI_BASE = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")

# Models / workflow presets this provider exposes
COMFYUI_WORKFLOWS = {
    "sdxl": {"name": "SDXL", "workflow": "sdxl.json"},
    "flux-dev": {"name": "Flux Dev", "workflow": "flux_dev.json"},
    "flux-schnell": {"name": "Flux Schnell", "workflow": "flux_schnell.json"},
    "sd3": {"name": "SD3", "workflow": "sd3.json"},
    "ltx": {"name": "LTX Video", "workflow": "ltx.json"},
}


class ComfyUIProvider(BaseProvider):
    """Provider for local ComfyUI image generation."""

    def __init__(self):
        super().__init__("comfyui", "Image-Gen")
        self._api_base = COMFYUI_BASE

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List available ComfyUI workflow presets."""
        return [
            ModelMetadata(
                id=key,
                name=info["name"],
                provider=self.id,
                context_window=0,
                supports_vision=False,
            )
            for key, info in COMFYUI_WORKFLOWS.items()
        ]

    async def validate_credentials(self, api_key: Optional[str] = None) -> bool:
        """Check if ComfyUI server is reachable."""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self._api_base}/object_info", timeout=5) as resp:
                    return resp.status == 200
        except Exception:
            return False

    async def generate_image(
        self, prompt: str, model: str = "sdxl", **kwargs
    ) -> Dict[str, Any]:
        """
        Generate an image via ComfyUI.
        Delegates to the local_image module.
        """
        from app.services.local_image import generate_image_local

        return await generate_image_local(prompt, model, **kwargs)
