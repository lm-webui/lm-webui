"""
Ollama Provider Implementation
"""
from typing import List, Optional

import aiohttp

from ..remote.openai_compat import OpenAICompatProvider
from ..schemas import ModelMetadata
import logging

logger = logging.getLogger(__name__)


class OllamaProvider(OpenAICompatProvider):
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
        """List ALL Ollama models via /api/tags.

        Overrides the inherited `/models` call because `/api/tags` is Ollama's native endpoint
        and reports model names as the user sees them locally.
        """
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
            logger.warning(f"Ollama model list failed: {e}")
            return []
