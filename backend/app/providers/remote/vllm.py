"""
vLLM provider — a local OpenAI-compatible server.

Inherits an empty `MODEL_HINTS`, so `/models` is listed unfiltered: the server serves whatever
model was launched, named with no vendor prefix to match against.
"""
from .openai_compat import OpenAICompatProvider


class VLLMProvider(OpenAICompatProvider):
    """A local vLLM server."""

    def __init__(self, api_base: str = "http://localhost:7070/v1"):
        super().__init__(provider_id="vllm", name="vLLM", api_base=api_base)
