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


class GeminiProvider(BaseProvider):
    """Provider for Google Gemini chat models via google-genai SDK."""

    def __init__(self):
        super().__init__("google", "Google Gemini")

    def _get_client(self, api_key: str = None):
        from google import genai
        return genai.Client(api_key=api_key) if api_key else genai.Client()

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        key = self._decrypt_api_key(api_key)
        try:
            client = self._get_client(key)
            loop = asyncio.get_event_loop()

            def _list():
                models = []
                for m in client.models.list():
                    name = m.name.split("/")[-1] if "/" in m.name else m.name
                    if "gemini" in name.lower():
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
            client = self._get_client(key)
            loop = asyncio.get_event_loop()

            def _stream():
                full = ""
                config = {"max_output_tokens": request.max_tokens or 4096}
                response = client.models.generate_content_stream(
                    model=model,
                    contents=contents,
                    config=config,
                )
                for chunk in response:
                    if chunk.text:
                        full += chunk.text
                return full

            text = await loop.run_in_executor(None, _stream)
            if text:
                yield ModelEvent.token(text)
            yield ModelEvent.done()
            logger.info(f"Gemini response: {len(text)} chars")

        except Exception as e:
            logger.error(f"Gemini stream error: {e}")
            yield ModelEvent.error(str(e))
