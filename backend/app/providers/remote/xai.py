"""
xAI (Grok) provider.

OpenAI-compatible: everything except the identity and `MODEL_HINTS` comes from
`openai_compat.py`.
"""
from .openai_compat import OpenAICompatProvider


class XAIProvider(OpenAICompatProvider):
    """api.x.ai."""

    MODEL_HINTS = ("grok",)

    def __init__(self, api_base: str = "https://api.x.ai/v1"):
        super().__init__(provider_id="xai", name="xAI", api_base=api_base)
