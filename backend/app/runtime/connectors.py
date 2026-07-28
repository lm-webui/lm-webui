"""Connectors for external runtimes (MLX, ComfyUI) and API providers (Ollama, vLLM, etc.)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json


@dataclass
class RuntimeConnector:
    runtime_type: str
    endpoint: str

    def _get(self, path: str) -> Any:
        request = Request(self.endpoint.rstrip("/") + path, headers={"Accept": "application/json"})
        with urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))

    def health(self) -> dict:
        try:
            data = self._get(self._health_path())
            models = self._extract_models(data)
            return {"status": "ready", "reachable": True, "models": models, "error": None}
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            return {"status": "unavailable", "reachable": False, "models": 0, "error": str(exc)}

    def models(self) -> dict:
        return self._get(self._models_path())

    def _health_path(self) -> str:
        paths = {
            "mlx": "/v1/models",
            "comfyui": "/",
            "ollama": "/api/tags",
            "openai_compatible": "/v1/models",
            "vllm": "/v1/models",
            "llamacpp": "/v1/models",
        }
        return paths.get(self.runtime_type, "/v1/models")

    def _models_path(self) -> str:
        paths = {
            "mlx": "/v1/models",
            "comfyui": "/api/models",
            "ollama": "/api/tags",
            "openai_compatible": "/v1/models",
            "vllm": "/v1/models",
            "llamacpp": "/v1/models",
        }
        return paths.get(self.runtime_type, "/v1/models")

    def _extract_models(self, data: Any) -> int:
        if not isinstance(data, dict):
            return 0
        for key in ("models", "data"):
            if key in data and isinstance(data[key], list):
                return len(data[key])
        return 1 if data else 0


def connector_for(runtime_type: str, endpoint: str) -> RuntimeConnector:
    """Get a connector for the given runtime type."""
    supported = {"mlx", "comfyui", "ollama", "openai_compatible", "vllm", "llamacpp"}
    if runtime_type not in supported:
        raise ValueError(f"Unsupported runtime: {runtime_type}. Supported: {', '.join(sorted(supported))}")
    return RuntimeConnector(runtime_type, endpoint)
