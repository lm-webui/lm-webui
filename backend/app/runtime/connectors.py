"""Small connectors for runtimes installed outside the LM-WebUI container."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
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
            data = self._get("/api/tags" if self.runtime_type == "ollama" else "/v1/models")
            models = data.get("models", data.get("data", [])) if isinstance(data, dict) else []
            return {"status": "ready", "reachable": True, "models": len(models), "error": None}
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            return {"status": "unavailable", "reachable": False, "models": 0, "error": str(exc)}

    def models(self) -> dict:
        return self._get("/api/tags" if self.runtime_type == "ollama" else "/v1/models")


def connector_for(runtime_type: str, endpoint: str) -> RuntimeConnector:
    if runtime_type not in {"ollama", "openai_compatible", "vllm", "llamacpp"}:
        raise ValueError(f"Unsupported external runtime: {runtime_type}")
    return RuntimeConnector(runtime_type, endpoint)
