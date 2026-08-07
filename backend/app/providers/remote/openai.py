"""
OpenAI Provider Implementation
"""
import logging
from typing import List, AsyncGenerator, Dict, Any
import aiohttp
from ..base import BaseProvider
from ..schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent
from app.core.error_handlers import ProviderError

logger = logging.getLogger(__name__)

class OpenAIProvider(BaseProvider):
    """Provider for OpenAI API."""

    # Cache: models that reject temperature entirely (omit it)
    _no_temp_models: set = set()
    # Cache: models that only accept temperature=1 (GPT-5 Nano, etc.)
    _default_temp_models: set = set()

    def __init__(self, provider_id: str = "openai", name: str = "OpenAI", api_base: str = "https://api.openai.com/v1"):
        super().__init__(provider_id, name, api_base)

    def _build_payload(self, request: GenerateRequest, stream: bool = False) -> Dict[str, Any]:
        """Build the API payload, conditionally excluding unsupported params."""
        model_lower = request.model.lower() if request.model else ""
        needs_completion_tokens = (
            model_lower.startswith("o") or
            model_lower.startswith("gpt-5") or
            "gpt-image" in model_lower
        )
        max_key = "max_completion_tokens" if needs_completion_tokens else "max_tokens"

        messages = request.messages
        # Vision: attach images to the last user message as OpenAI multimodal content.
        if getattr(request, "images", None):
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].get("role") == "user":
                    text = messages[i].get("content", "") or ""
                    content: list = [{"type": "text", "text": text}]
                    content += [
                        {"type": "image_url", "image_url": {"url": uri}}
                        for uri in request.images
                    ]
                    messages = [*messages]
                    messages[i] = {"role": "user", "content": content}
                    break

        payload = {
            "model": request.model,
            "messages": messages,
            max_key: request.max_tokens,
            "stream": stream,
        }

        # Priority: 1) user setting → 2) fallback 0.7 → 3) model-compatible value
        if request.model in self._no_temp_models:
            pass  # omit temperature entirely (o-series)
        elif request.model in self._default_temp_models:
            payload["temperature"] = 1  # only 1 accepted (GPT-5 Nano)
        else:
            payload["temperature"] = request.temperature  # user's setting or 0.7 default
            if request.top_p is not None:
                payload["top_p"] = request.top_p

        return payload

    async def _handle_unsupported_error(self, text: str, request: GenerateRequest) -> bool:
        """Check error for temperature issues. Cache model and return True if retryable."""
        if '"temperature"' not in text:
            return False
        # Model rejects temperature entirely (o-series)
        if '"unsupported_parameter"' in text:
            self._no_temp_models.add(request.model)
            logger.info(f"Cached {request.model} as no-temperature model")
            return True
        # Model only accepts temperature=1 (GPT-5 Nano unsupported_value)
        if '"unsupported_value"' in text:
            self._default_temp_models.add(request.model)
            logger.info(f"Cached {request.model} as default-temperature-only model")
            return True
        return False

    async def list_models(self, api_key: str = None) -> List[ModelMetadata]:
        session = await self.get_session()
        key = self._decrypt_api_key(api_key)
        
        if not key:
            return []

        try:
            async with session.get(
                f"{self._api_base}/models",
                headers={"Authorization": f"Bearer {key}"}
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                
                models = []
                for m in data.get("data", []):
                    # Filter logic (simplified)
                    mid = m["id"]
                    if "gpt" in mid or "o1" in mid or "o3" in mid:
                        models.append(ModelMetadata(
                            id=mid,
                            name=mid,
                            provider=self.id,
                            context_window=128000, # Simplified
                            supports_vision="vision" in mid or "gpt-4o" in mid
                        ))
                return models
        except Exception as e:
            logger.error(f"Failed to list models for {self.id}: {e}")
            return []

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        session = await self.get_session()
        key = self._decrypt_api_key(request.api_key)

        payload = self._build_payload(request, stream=False)

        try:
            async with session.post(
                f"{self._api_base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120)
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    # Retry without temperature if unsupported (o-series, etc.)
                    if await self._handle_unsupported_error(text, request):
                        payload2 = self._build_payload(request, stream=False)
                        async with session.post(
                            f"{self._api_base}/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json=payload2,
                            timeout=aiohttp.ClientTimeout(total=120)
                        ) as retry:
                            if retry.status != 200:
                                t2 = await retry.text()
                                raise ProviderError(self.id, f"API Error {retry.status}: {t2}")
                            data = await retry.json()
                            choice = data["choices"][0]
                            return GenerateResponse(
                                content=choice["message"]["content"],
                                finish_reason=choice["finish_reason"],
                                usage=data.get("usage")
                            )
                    raise ProviderError(self.id, f"API Error {resp.status}: {text}")

                data = await resp.json()
                choice = data["choices"][0]
                return GenerateResponse(
                    content=choice["message"]["content"],
                    finish_reason=choice["finish_reason"],
                    usage=data.get("usage")
                )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(self.id, str(e))

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        session = await self.get_session()
        key = self._decrypt_api_key(request.api_key)
        payload = self._build_payload(request, stream=True)

        yield ModelEvent.typing()

        try:
            async with session.post(
                f"{self._api_base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120)
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    if await self._handle_unsupported_error(text, request):
                        payload2 = self._build_payload(request, stream=True)
                        async with session.post(
                            f"{self._api_base}/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json=payload2,
                            timeout=aiohttp.ClientTimeout(total=120)
                        ) as retry:
                            if retry.status != 200:
                                t2 = await retry.text()
                                yield ModelEvent.error(f"API Error {retry.status}: {t2}")
                                return
                            async for line in retry.content:
                                line = line.decode('utf-8').strip()
                                if line.startswith('data: ') and line != 'data: [DONE]':
                                    try:
                                        import json
                                        data = json.loads(line[6:])
                                        delta = data["choices"][0]["delta"]
                                        content = delta.get("content")
                                        if content:
                                            yield ModelEvent.token(content)
                                    except:
                                        continue
                            yield ModelEvent.done()
                            return
                    yield ModelEvent.error(f"API Error {resp.status}: {text}")
                    return

                async for line in resp.content:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: ') and line != 'data: [DONE]':
                        try:
                            import json
                            data = json.loads(line[6:])
                            delta = data["choices"][0]["delta"]
                            content = delta.get("content")
                            if content:
                                yield ModelEvent.token(content)
                        except:
                            continue

            yield ModelEvent.done()

        except Exception as e:
            yield ModelEvent.error(str(e))
