"""
Ollama Provider Implementation
"""
from typing import List, Optional

import aiohttp

from ..remote.openai import OpenAIProvider
from ..schemas import ModelMetadata
import logging

logger = logging.getLogger(__name__)


class OllamaProvider(OpenAIProvider):
    """Provider for Ollama (Local)."""

    def __init__(self, base_url: str = "http://localhost:11434/v1"):
        if not base_url.endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
        super().__init__(
            provider_id="ollama",
            name="Ollama",
            api_base=base_url
        )

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List models via OpenAI-compatible /v1/models (Ollama 0.3.5+),
        falling back to /api/tags for older versions."""
        # Try OpenAI-compatible endpoint first
        try:
            return await super().list_models(api_key)
        except Exception:
            pass

        # Fallback: /api/tags (older Ollama versions)
        base = self._api_base.rstrip("/v1") if self._api_base else "http://localhost:11434"
        session = await self.get_session()
        if not session:
            return []
        try:
            async with session.get(f"{base}/api/tags") as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                models = []
                for m in data.get("models", []):
                    name = m.get("name", "")
                    if name:
                        models.append(ModelMetadata(
                            id=name,
                            name=name,
                            provider=self.id,
                            context_window=4096,
                        ))
                return models
        except (aiohttp.ClientError, Exception) as e:
            logger.warning(f"Ollama model list fallback failed: {e}")
            return []
