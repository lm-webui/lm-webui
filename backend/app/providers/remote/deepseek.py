"""
DeepSeek provider.

OpenAI-compatible: everything except the identity and `MODEL_HINTS` comes from
`openai_compat.py`.
"""
from .openai_compat import OpenAICompatProvider


class DeepSeekProvider(OpenAICompatProvider):
    """api.deepseek.com."""

    MODEL_HINTS = ("deepseek",)

    def __init__(self, api_base: str = "https://api.deepseek.com/v1"):
        super().__init__(provider_id="deepseek", name="DeepSeek", api_base=api_base)
