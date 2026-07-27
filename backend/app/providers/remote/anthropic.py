"""
Anthropic (Claude) Provider Implementation
"""
import logging
from typing import List, Optional
import aiohttp
from ..base import BaseProvider
from ..schemas import ModelMetadata

logger = logging.getLogger(__name__)

class AnthropicProvider(BaseProvider):
    """Provider for Anthropic (Claude) API. Uses x-api-key auth header."""

    def __init__(self, provider_id: str = "anthropic", name: str = "Anthropic", api_base: str = "https://api.anthropic.com/v1"):
        super().__init__(provider_id, name, api_base)

    async def list_models(self, api_key: str = None) -> List[ModelMetadata]:
        session = await self.get_session()
        key = self._decrypt_api_key(api_key)
        if not key:
            return []
        try:
            async with session.get(
                f"{self._api_base}/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"}
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                return [
                    ModelMetadata(id=m["id"], name=m["id"], provider=self.id, context_window=128000)
                    for m in data.get("data", []) if "claude" in m.get("id", "")
                ]
        except Exception as e:
            logger.error(f"Failed to list models for {self.id}: {e}")
            return []
