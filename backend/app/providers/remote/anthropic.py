"""
Anthropic (Claude) Provider Implementation
"""
import logging
from typing import List
import aiohttp
from ..base import BaseProvider
from ..schemas import ModelMetadata

logger = logging.getLogger(__name__)

# Only used when `GET /v1/models` cannot be reached. Deliberately short: it is exactly the kind
# of list that rots, which is why it is a fallback and not the source.
_ANTHROPIC_FALLBACK_MODELS = [
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-1",
    "claude-sonnet-4-5",
]


class AnthropicProvider(BaseProvider):
    """Provider for Anthropic (Claude) API. Uses x-api-key auth header."""

    _ANTHROPIC_VERSION = "2023-06-01"
    # Claude's catalogue is far smaller than this and the endpoint caps at 1000, so one page is
    # the whole list — no cursor walk. If that ever stops being true, follow `last_id`.
    _MODELS_PAGE_LIMIT = 100

    def __init__(self, provider_id: str = "anthropic", name: str = "Anthropic", api_base: str = "https://api.anthropic.com/v1"):
        super().__init__(provider_id, name, api_base)

    async def list_models(self, api_key: str = None) -> List[ModelMetadata]:
        """Live model list from `GET /v1/models`, which requires the key.

        This used to return a fixed list and ignore `api_key` entirely, so Claude models were
        offered to every user including those who had never saved an Anthropic key, and the list
        never tracked new releases.
        """
        key = self._decrypt_api_key(api_key)
        if not key:
            return []

        session = await self.get_session()
        try:
            async with session.get(
                f"{self._api_base}/models",
                params={"limit": self._MODELS_PAGE_LIMIT},
                headers={
                    "x-api-key": key,
                    "anthropic-version": self._ANTHROPIC_VERSION,
                },
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                # A rejected key must come back empty, not as the fallback list: the key-test
                # endpoint (`app/routes/api_keys.py`) reports "valid" on any non-empty result, so
                # falling back here would call a bad key good.
                if resp.status in (401, 403):
                    logger.warning(f"Anthropic list_models: key rejected (HTTP {resp.status})")
                    return []
                if resp.status != 200:
                    logger.warning(f"Anthropic list_models: HTTP {resp.status}")
                    return self._fallback_models()
                data = await resp.json()
        except Exception as e:
            logger.warning(f"Anthropic list_models error: {e}")
            return self._fallback_models()

        models = []
        for m in data.get("data", []):
            mid = m.get("id")
            if not mid:
                continue
            caps = m.get("capabilities") or {}
            models.append(ModelMetadata(
                id=mid,
                name=m.get("display_name") or mid,
                provider=self.id,
                context_window=m.get("max_input_tokens") or 200000,
                supports_vision=bool((caps.get("image_input") or {}).get("supported")),
            ))
        return models or self._fallback_models()

    def _fallback_models(self) -> List[ModelMetadata]:
        return [
            ModelMetadata(id=mid, name=mid, provider=self.id, context_window=200000)
            for mid in _ANTHROPIC_FALLBACK_MODELS
        ]
