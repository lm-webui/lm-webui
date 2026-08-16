"""
Anthropic (Claude) Provider Implementation
"""
import logging
from typing import List, Optional
import aiohttp
from ..base import BaseProvider
from ..schemas import ModelMetadata

logger = logging.getLogger(__name__)

# Anthropic has no public model-listing endpoint — these are the supported Claude models.
_ANTHROPIC_MODELS = [
    "claude-opus-4-1",
    "claude-sonnet-4-5",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
]

class AnthropicProvider(BaseProvider):
    """Provider for Anthropic (Claude) API. Uses x-api-key auth header."""

    def __init__(self, provider_id: str = "anthropic", name: str = "Anthropic", api_base: str = "https://api.anthropic.com/v1"):
        super().__init__(provider_id, name, api_base)

    async def list_models(self, api_key: str = None) -> List[ModelMetadata]:
        # Anthropic exposes no public model-listing API — use the static model set.
        return [
            ModelMetadata(id=mid, name=mid, provider=self.id, context_window=200000)
            for mid in _ANTHROPIC_MODELS
        ]
