"""
Base Provider Implementation
Provides common functionality for all providers.
"""
from typing import List, Dict, Optional, AsyncGenerator
import aiohttp
import logging
from .interface import Provider
from .schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent
from app.security.encryption import decrypt_key

logger = logging.getLogger(__name__)

class BaseProvider(Provider):
    """Base class for providers with common utility methods."""
    
    def __init__(self, provider_id: str, name: str, api_base: Optional[str] = None):
        self._id = provider_id
        self._name = name
        self._api_base = api_base
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def id(self) -> str:
        return self._id

    @property
    def name(self) -> str:
        return self._name

    async def get_session(self) -> Optional[aiohttp.ClientSession]:
        """Lazy load or return existing session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    def _decrypt_api_key(self, api_key: Optional[str]) -> Optional[str]:
        """Decrypt API key if present."""
        if not api_key:
            return None
        try:
            return decrypt_key(api_key)
        except Exception as e:
            # If plain text or failed
            if len(api_key) > 50 and "=" in api_key:
                 logger.warning(f"Failed to decrypt key for {self.id}: {e}")
            return api_key

    async def validate_credentials(self, api_key: Optional[str] = None) -> bool:
        """Default validation check (can be overridden)."""
        try:
            await self.list_models(api_key)
            return True
        except Exception:
            return False

    async def _handle_stream_error(self, error: Exception, model: str) -> AsyncGenerator[ModelEvent, None]:
        """Helper to yield error event."""
        logger.error(f"Stream error for {model}: {error}")
        yield ModelEvent.error(str(error))

    async def close(self):
        """Close the session."""
        if self._session and not self._session.closed:
            await self._session.close()
