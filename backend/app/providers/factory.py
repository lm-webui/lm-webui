"""
Provider Factory
Manages the lifecycle and instantiation of model providers.
"""
from typing import Dict, Optional, Type
from .interface import Provider
from .remote.openai import OpenAIProvider
from .remote.gemini import GeminiProvider
from .remote.anthropic import AnthropicProvider
from .local.gguf import GGUFProvider
from .local.ollama import OllamaProvider
from .local.mlx import MLXProvider
from .local.comfyui import ComfyUIProvider


class ProviderFactory:
    """Factory for creating and managing provider instances."""

    _instances: Dict[str, Provider] = {}
    # Providers that are OpenAI-compatible with a custom base URL.
    # Keyed by provider_id -> (class, default_api_base)
    _openai_compat: Dict[str, tuple] = {
        "xai": (OpenAIProvider, "https://api.x.ai/v1"),
        "deepseek": (OpenAIProvider, "https://api.deepseek.com/v1"),
        "vllm": (OpenAIProvider, "http://localhost:7070/v1"),
    }
    _registry: Dict[str, Type[Provider]] = {
        "openai": OpenAIProvider,  # covers any OpenAI-compatible endpoint
        "google": GeminiProvider,  # Google Gemini
        "gemini": GeminiProvider,  # alias
        "anthropic": AnthropicProvider,  # Anthropic (Claude)
        **{k: v[0] for k, v in _openai_compat.items()},
        "ollama": OllamaProvider,  # local via Ollama
        "gguf": GGUFProvider,      # direct llama.cpp
        "mlx": MLXProvider,        # Apple Silicon MLX
        "comfyui": ComfyUIProvider,  # local ComfyUI image gen
    }

    @classmethod
    def register(cls, provider_id: str, provider_class: Type[Provider]):
        """Register a new provider class."""
        cls._registry[provider_id] = provider_class

    @classmethod
    def get_provider(cls, provider_id: str, **kwargs) -> Optional[Provider]:
        """Get or create a provider instance."""
        if provider_id not in cls._registry:
            return None

        # Auto-set api_base for OpenAI-compatible providers (xai, deepseek, vllm)
        if provider_id in cls._openai_compat and "api_base" not in kwargs:
            _, default_base = cls._openai_compat[provider_id]
            kwargs["api_base"] = default_base

        # For now, we use singletons for providers unless specific config is passed
        if provider_id in cls._instances and not kwargs:
            return cls._instances[provider_id]

        try:
            provider_class = cls._registry[provider_id]
            instance = provider_class(**kwargs)

            if not kwargs:
                cls._instances[provider_id] = instance

            return instance
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to instantiate provider {provider_id}: {e}")
            return None

    @classmethod
    def list_providers(cls) -> Dict[str, Type[Provider]]:
        return cls._registry

    @classmethod
    def get_provider_ids(cls) -> list:
        return list(cls._registry.keys())
