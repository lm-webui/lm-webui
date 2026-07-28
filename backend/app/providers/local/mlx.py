"""
MLX Server Provider — connects to mlx_lm.server on macOS host via HTTP.
mlx_lm.server exposes an OpenAI-compatible API at /v1/chat/completions.
The server runs on the host (not in Docker) at host.docker.internal:8090.
"""
import asyncio
import json
import logging
from typing import List, AsyncGenerator, Optional

import aiohttp

from ..base import BaseProvider
from ..schemas import ModelMetadata, GenerateRequest, ModelEvent

logger = logging.getLogger(__name__)

MLX_DEFAULT_ENDPOINT = "http://host.docker.internal:8090/v1"


class MLXProvider(BaseProvider):
    """Provider for MLX inference server running on macOS host."""

    def __init__(self, endpoint: Optional[str] = None, base_url: Optional[str] = None):
        # Accept both endpoint and base_url for flexibility
        server = endpoint or base_url or MLX_DEFAULT_ENDPOINT
        base = server.rstrip("/")
        # Ensure /v1 suffix
        if not base.endswith("/v1"):
            base += "/v1"
        super().__init__("mlx", "MLX (Apple Silicon)", api_base=base)

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List models loaded in the MLX server via GET /v1/models."""
        session = await self.get_session()
        if not session:
            return []
        try:
            async with session.get(f"{self._api_base}/models") as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                models = []
                for m in data.get("data", []):
                    models.append(ModelMetadata(
                        id=m.get("id", "unknown"),
                        name=m.get("id", "unknown"),
                        provider=self.id,
                        context_window=4096,
                    ))
                return models
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.debug(f"MLX server not reachable at {self._api_base}: {e}")
            return []

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        """Stream chat completion from mlx_lm.server via POST /v1/chat/completions."""
        session = await self.get_session()
        if not session:
            yield ModelEvent.error("MLX server session unavailable")
            return

        payload = {
            "model": request.model,
            "messages": request.messages,
            "max_tokens": request.max_tokens or 4096,
            "temperature": request.temperature or 0.7,
            "stream": True,
        }
        if request.top_p is not None:
            payload["top_p"] = request.top_p

        try:
            async with session.post(
                f"{self._api_base}/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.error(f"MLX server error {resp.status}: {text}")
                    yield ModelEvent.error(f"MLX server: {text[:200]}")
                    return

                # Parse SSE stream
                buffer = ""
                async for chunk in resp.content:
                    buffer += chunk.decode("utf-8", errors="replace")
                    lines = buffer.split("\n")
                    buffer = lines.pop()  # keep incomplete line
                    for line in lines:
                        line = line.strip()
                        if not line or line == "data: [DONE]":
                            continue
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line[6:])
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                token = delta.get("content", "")
                                if token:
                                    yield ModelEvent.token(token)
                            except json.JSONDecodeError:
                                continue

                yield ModelEvent.done()

        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.error(f"MLX server connection error: {e}")
            yield ModelEvent.error(f"Cannot reach MLX server at {self._api_base}")
        except Exception as e:
            logger.error(f"MLX streaming error: {e}")
            yield ModelEvent.error(str(e))

    async def generate(self, request: GenerateRequest):
        raise NotImplementedError("Use stream() for MLX inference")
