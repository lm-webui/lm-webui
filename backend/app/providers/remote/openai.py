"""
OpenAI (api.openai.com) provider.

The wire protocol lives in `openai_compat.py`; this module is only the OpenAI-specific part.
"""
from .openai_compat import OpenAICompatProvider


class OpenAIProvider(OpenAICompatProvider):
    """api.openai.com.

    The hints keep embeddings and speech models (`whisper-1`, `text-embedding-3-*`) out of the
    chat model picker — `/models` reports the whole account catalogue, not just chat models.
    """

    MODEL_HINTS = ("gpt", "o1", "o3", "o4")

    def __init__(self, provider_id: str = "openai", name: str = "OpenAI", api_base: str = "https://api.openai.com/v1"):
        super().__init__(provider_id, name, api_base)
