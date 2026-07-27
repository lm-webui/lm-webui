"""
Provider Interface
Defines the protocol that all model providers must implement.
"""
from typing import Protocol, List, Dict, Optional, Any, AsyncGenerator
from .schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent
import aiohttp

class Provider(Protocol):
    """Protocol for AI Model Providers."""
    
    @property
    def id(self) -> str:
        """Unique identifier for the provider (e.g., 'openai', 'ollama')."""
        ...
        
    @property
    def name(self) -> str:
        """Display name for the provider."""
        ...

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List available models."""
        ...

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        """Generate a complete response (non-streaming)."""
        ...

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        """Stream a response as a sequence of events."""
        ...

    async def validate_credentials(self, api_key: Optional[str] = None) -> bool:
        """Validate API key or connectivity."""
        ...

    async def get_session(self) -> Optional[aiohttp.ClientSession]:
        """Get the HTTP session used by this provider (if any)."""
        ...
