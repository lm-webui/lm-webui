"""
Ollama Provider Implementation
"""
from typing import List, Optional, Dict, Any
from ..remote.openai import OpenAIProvider
from ..schemas import ModelMetadata

class OllamaProvider(OpenAIProvider):
    """Provider for Ollama (Local)."""
    
    def __init__(self, base_url: str = "http://localhost:11434/v1"):
        # Ensure it ends with /v1
        if not base_url.endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
            
        super().__init__(
            provider_id="ollama",
            name="Ollama",
            api_base=base_url
        )

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        try:
            return await super().list_models(api_key)
        except Exception:
            # Ollama might be offline
            return []
