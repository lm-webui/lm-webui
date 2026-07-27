"""
Unified Model Registry with Strategy Pattern

This module provides a centralized ModelRegistry that uses strategy pattern
for different provider types. Concrete strategies are now separated into:
- model_provider.py (API-based providers)
- model_local.py (Local hosting providers)

REFACTOR UPDATE: Now uses backend/app/providers/factory.py for decoupled providers.
Legacy adapters provided for backward compatibility.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, AsyncGenerator, Union
import asyncio
import aiohttp
import logging

from app.security.encryption import decrypt_key
from app.database import get_db

# New Provider System
from app.providers.factory import ProviderFactory
from app.providers.schemas import GenerateRequest, ModelEvent

logger = logging.getLogger(__name__)

# ============================================================================
# STRATEGY PATTERN: Provider Strategies (Base)
# ============================================================================

class ProviderStrategy(ABC):
    """Abstract base class for provider strategies"""
    
    @abstractmethod
    async def fetch_models(self, api_key: Optional[str] = None, session: Optional[aiohttp.ClientSession] = None) -> List[Dict[str, Any]]:
        """Fetch models from this provider"""
        pass
    
    @abstractmethod
    async def generate(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> str:
        """Generate response (non-streaming)"""
        pass

    @abstractmethod
    async def stream(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[str, None]:
        """Stream response"""
        pass
    
    # New method needed for legacy support
    @abstractmethod
    async def stream_chat(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[ModelEvent, None]:
        """Stream response as ModelEvent"""
        pass

    async def generate_image(self, model: str, prompt: str, api_key: str, session: aiohttp.ClientSession, **kwargs) -> Dict[str, Any]:
        """
        Generate image
        Returns: Dict with 'data' (bytes) or 'url' (str)
        """
        raise NotImplementedError(f"Image generation not supported by {self.get_provider_name()}")

    @abstractmethod
    def get_provider_name(self) -> str:
        """Get the provider name (frontend name)"""
        pass
    
    @abstractmethod
    def get_backend_name(self) -> str:
        """Get the backend provider name (API name)"""
        pass
    


class LegacyStrategyAdapter(ProviderStrategy):
    """Adapts a new Provider to the old ProviderStrategy interface."""
    
    def __init__(self, provider):
        self.provider = provider
        
    def get_provider_name(self) -> str:
        return self.provider.name.lower()
        
    def get_backend_name(self) -> str:
        return self.provider.id
        
    async def fetch_models(self, api_key: Optional[str] = None, session: Optional[aiohttp.ClientSession] = None) -> List[Dict[str, Any]]:
        # The new provider handles session internally usually, but we accept it here
        try:
            models = await self.provider.list_models(api_key)
            return [m.model_dump() for m in models]
        except Exception as e:
            logger.error(f"Adapter fetch_models error: {e}")
            return []
            
    async def generate(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> str:
        req = GenerateRequest(
            model=model,
            messages=messages,
            api_key=api_key,
            temperature=kwargs.get("temperature", 0.7),
            max_tokens=kwargs.get("max_tokens", 4000),
            stop=kwargs.get("stop")
        )
        resp = await self.provider.generate(req)
        return resp.content
        
    async def stream(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[str, None]:
        req = GenerateRequest(
            model=model,
            messages=messages,
            api_key=api_key,
            temperature=kwargs.get("temperature", 0.7),
            max_tokens=kwargs.get("max_tokens", 4000),
            stop=kwargs.get("stop"),
            stream=True
        )
        async for event in self.provider.stream(req):
            if event.type == "token" and event.content:
                yield event.content

    async def stream_chat(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[ModelEvent, None]:
        req = GenerateRequest(
            model=model,
            messages=messages,
            api_key=api_key,
            temperature=kwargs.get("temperature", 0.7),
            max_tokens=kwargs.get("max_tokens", 4000),
            stop=kwargs.get("stop"),
            stream=True
        )
        async for event in self.provider.stream(req):
            yield event
            
    # Proxy ensure_model for GGUF legacy calls
    def ensure_model(self, *args, **kwargs):
        if hasattr(self.provider, 'ensure_model'):
            return self.provider.ensure_model(*args, **kwargs)


# ============================================================================
# MODEL REGISTRY
# ============================================================================

class ModelRegistry:
    """
    Unified Model Registry that manages all model providers using strategy pattern.
    """
    
    def __init__(self):
        openai_provider = ProviderFactory.get_provider("openai")
        google_provider = ProviderFactory.get_provider("google")
        anthropic_provider = ProviderFactory.get_provider("anthropic")
        xai_provider = ProviderFactory.get_provider("xai")
        deepseek_provider = ProviderFactory.get_provider("deepseek")
        vllm_provider = ProviderFactory.get_provider("vllm")
        ollama_provider = ProviderFactory.get_provider("ollama")
        gguf_provider = ProviderFactory.get_provider("gguf")
        mlx_provider = ProviderFactory.get_provider("mlx")

        openai_adapter = LegacyStrategyAdapter(openai_provider) if openai_provider else None
        google_adapter = LegacyStrategyAdapter(google_provider) if google_provider else None
        anthropic_adapter = LegacyStrategyAdapter(anthropic_provider) if anthropic_provider else None
        xai_adapter = LegacyStrategyAdapter(xai_provider) if xai_provider else None
        deepseek_adapter = LegacyStrategyAdapter(deepseek_provider) if deepseek_provider else None
        vllm_adapter = LegacyStrategyAdapter(vllm_provider) if vllm_provider else None
        ollama_adapter = LegacyStrategyAdapter(ollama_provider) if ollama_provider else None
        gguf_adapter = LegacyStrategyAdapter(gguf_provider) if gguf_provider else None
        mlx_adapter = LegacyStrategyAdapter(mlx_provider) if mlx_provider else None

        self._strategies: Dict[str, Any] = {
            "openai": openai_adapter,
            "google": google_adapter,
            "gemini": google_adapter,
            "anthropic": anthropic_adapter,
            "xai": xai_adapter,
            "deepseek": deepseek_adapter,
            "vllm": vllm_adapter,
            "ollama": ollama_adapter,
            "gguf": gguf_adapter,
            "mlx": mlx_adapter,
        }
        self._cache = {}
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def close_session(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
    
    def get_strategy(self, provider: str, user_id: Optional[int] = None) -> Optional[Any]:
        """Get strategy for provider."""
        strategy = self._strategies.get(provider)

        # For Ollama, check if user has configured a custom URL
        if provider == "ollama" and user_id:
            api_keys = self.get_user_api_keys(user_id)
            if "ollama_url" in api_keys:
                new_provider = ProviderFactory.get_provider("ollama", base_url=api_keys["ollama_url"])
                if new_provider:
                    return LegacyStrategyAdapter(new_provider)

        return strategy

    def get_user_api_keys(self, user_id: int) -> Dict[str, str]:
        db = get_db()
        try:
            keys = db.execute(
                "SELECT provider, encrypted_key, base_url FROM api_keys WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            result = {}
            for p, k, url in keys:
                result[p] = k
                if p == "ollama" and url:
                    try:
                        result["ollama_url"] = decrypt_key(url)
                    except:
                        pass
            return result
        except Exception:
            keys = db.execute(
                "SELECT provider, encrypted_key FROM api_keys WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            return {p: k for p, k in keys}

    async def fetch_models_for_user(self, user_id: int) -> List[Dict[str, Any]]:
        session = await self.get_session()
        api_keys = self.get_user_api_keys(user_id)

        seen = set()
        tasks = []
        for provider, strategy in self._strategies.items():
            if strategy is None:
                continue
            # Skip aliases — same adapter object produces duplicate models
            adapter_id = id(strategy)
            if adapter_id in seen:
                continue
            seen.add(adapter_id)
            key = api_keys.get(provider) or api_keys.get(strategy.get_backend_name())
            tasks.append(strategy.fetch_models(key, session))
            
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_models = []
        for res in results:
            if isinstance(res, list): all_models.extend(res)
            
        return all_models

    async def fetch_models_for_provider(self, provider: str, user_id: int) -> List[Dict[str, Any]]:
        """Fetch models for a specific provider using user's API key"""
        strategy = self.get_strategy(provider, user_id)
        if not strategy:
            raise ValueError(f"Unsupported provider: {provider}")
        
        session = await self.get_session()
        api_keys = self.get_user_api_keys(user_id)
        
        key = api_keys.get(provider) or api_keys.get(strategy.get_backend_name())
        return await strategy.fetch_models(key, session)
    
    def get_kg_extraction_agent(self) -> str:
        """Ensure the 1B Knowledge Graph agent is ready and return its ID."""
        gguf_strategy = self.get_strategy("gguf")
        if hasattr(gguf_strategy, 'ensure_model'):
            filename = "Qwen3-1.7B-Q4_K_M.gguf"
            try:
                # Assuming ensure_model returns path or ID, but here we just need to ensure it exists
                # The ID convention is gguf:filename
                gguf_strategy.ensure_model(filename)
                return f"gguf:{filename}"
            except Exception as e:
                logger.error(f"Failed to prepare KG agent: {e}")
                return ""
        return ""

    async def get_model_context_window(self, model_id: str, user_id: int) -> int:
        """Get the context window for a specific model ID."""
        provider = "openai"
        if ":" in model_id:
            parts = model_id.split(":", 1)
            if parts[0] in self._strategies or parts[0] == "gguf":
                provider = parts[0]
        
        lower_id = model_id.lower()
        if "gpt-5" in lower_id: return 200000
        if "gpt-4" in lower_id: return 128000
        if "claude-4" in lower_id: return 200000
        if "claude-3" in lower_id: return 200000
        if "gemini-3" in lower_id: return 1000000
        if "gemini-2" in lower_id: return 1000000
        if "gemini-1.5" in lower_id: return 1000000
        if "llama-3" in lower_id: return 128000
        if "mistral" in lower_id: return 32000
        if "glm-4" in lower_id: return 128000
        if "deepseek" in lower_id: return 128000
        if "grok" in lower_id: return 1000000
        
        if provider == "gguf" or model_id.startswith("gguf:"):
             try:
                 models = await self.fetch_models_for_provider("gguf", user_id)
                 for m in models:
                     if m["id"] == model_id or m["name"] == model_id:
                         return m.get("context_window", 4096)
             except Exception:
                 pass
        
        return 4096

    def clear_cache(self, user_id: Optional[int] = None):
        self._cache.clear()

# Global ModelRegistry instance
_model_registry = None

def get_model_registry() -> ModelRegistry:
    global _model_registry
    if _model_registry is None:
        _model_registry = ModelRegistry()
    return _model_registry

