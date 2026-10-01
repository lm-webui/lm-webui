"""
Google Gemini Provider — official google-genai SDK.
"""
import logging
import asyncio
from typing import List, Optional, AsyncGenerator
from ..base import BaseProvider
from ..schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent
from app.database import get_db
from app.security.encryption import decrypt_key

logger = logging.getLogger(__name__)

# The one action that means "this model produces content we can show". Embedding and AQA models
# are excluded so they stay out of the model picker, while the `-image` variants of the chat
# models (gemini-2.5-flash-image) pass — they used to be dropped by a `"gemini" in name` name
# check, which is why the dynamic image-model fetch always came back empty. Older Model payloads
# omit the field entirely; those fall back to the name check.
_GENERATIVE_ACTION = "generateContent"


def _can_generate(model, name: str) -> bool:
    actions = getattr(model, "supported_actions", None)
    if not actions:
        return "gemini" in name.lower()
    return _GENERATIVE_ACTION in actions


class GeminiProvider(BaseProvider):
    """Provider for Google Gemini chat models via google-genai SDK."""

    def __init__(self):
        super().__init__("google", "Google Gemini")

    def _get_client(self, api_key: str = None):
        from google import genai
        # The key goes to the SDK verbatim. Modern keys are `AQ.`-prefixed auth tokens and the
        # older `AIza` ones are traffic strings; the SDK picks the right auth path from the value,
        # so nothing here may inspect, trim or length-check the key.
        return genai.Client(api_key=api_key) if api_key else genai.Client()

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        key = self._decrypt_api_key(api_key)
        try:
            client = self._get_client(key)
            loop = asyncio.get_event_loop()

            def _list():
                models = []
                resp = client.models.list()
                # google-genai may return an object with .models, or a directly iterable list.
                items = resp.models if hasattr(resp, "models") else list(resp)
                for m in items:
                    name = m.name.split("/")[-1] if "/" in m.name else m.name
                    if _can_generate(m, name):
                        models.append(ModelMetadata(
                            id=name,
                            name=name,
                            provider=self.id,
                            context_window=getattr(m, "input_token_limit", 32000),
                        ))
                return models

            return await loop.run_in_executor(None, _list)
        except Exception as e:
            logger.warning(f"Gemini list_models error: {e}")
            return []

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        raise NotImplementedError("Use stream()")

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        key = self._decrypt_api_key(request.api_key)
        model = request.model or "gemini-2.5-flash"

        # Convert messages to Gemini format
        contents = []
        for msg in (request.messages or []):
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})

        yield ModelEvent.typing()

        try:
            from google.genai import types

            client = self._get_client(key)
            config = types.GenerateContentConfig(
                max_output_tokens=request.max_tokens or 4096,
            )

            # `client.aio` is the SDK's async surface. The previous sync call ran in a thread
            # pool and accumulated every chunk into one string before yielding, so the client
            # received the whole answer in a single event and the UI could not paint it
            # incrementally. Yield per chunk instead.
            stream = await client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            )
            total = 0
            async for chunk in stream:
                if chunk.text:
                    total += len(chunk.text)
                    yield ModelEvent.token(chunk.text)

            yield ModelEvent.done()
            logger.info(f"Gemini response: {total} chars")

        except Exception as e:
            logger.error(f"Gemini stream error: {e}")
            yield ModelEvent.error(str(e))
