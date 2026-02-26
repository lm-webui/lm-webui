"""
Local Model Strategies for Model Registry

Contains strategies for GGUF (llama-cpp), Ollama, and LM Studio.
"""

import json
import logging
import asyncio
import threading
import aiohttp
from typing import Dict, List, Optional, Any, AsyncGenerator
from .base_provider import BaseProviderStrategy
from .model_provider import OpenAIStrategy
from app.chat.events import ModelEvent
from app.core.error_handlers import (
    ProviderError,
    ModelNotFoundError
)

logger = logging.getLogger(__name__)

class LMStudioStrategy(OpenAIStrategy):
    """Strategy for LM Studio (OpenAI Compatible)"""
    def __init__(self, base_url: Optional[str] = None):
        super().__init__()
        self._frontend_name = "lmstudio"
        self._backend_name = "lmstudio"
        # Use provided base_url or default
        self._api_base = base_url or "http://localhost:1234/v1"
        # Ensure URL ends with /v1 for OpenAI compatibility
        if not self._api_base.endswith("/v1"):
            self._api_base = self._api_base.rstrip("/") + "/v1"
    
    async def fetch_models(self, api_key: Optional[str] = None, session: Optional[aiohttp.ClientSession] = None) -> List[Dict[str, Any]]:
        # For LM Studio, the "api_key" is actually the URL
        # We'll use a dummy key since LM Studio doesn't require authentication
        try:
            return await super().fetch_models("lm-studio", session)
        except Exception as e:
            logger.warning(f"Failed to fetch LM Studio models: {e}")
            return []

    async def generate(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> str:
        # api_key might contain URL, but we use self._api_base
        return await super().generate(model, messages, "lm-studio", session, **kwargs)

    async def stream(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[str, None]:
        async for chunk in super().stream(model, messages, "lm-studio", session, **kwargs):
            yield chunk

    async def stream_chat(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[ModelEvent, None]:
        """Stream chat with ModelEvent objects for unified streaming"""
        async for event in super().stream_chat(model, messages, "lm-studio", session, **kwargs):
            yield event


class OllamaStrategy(OpenAIStrategy):
    """Strategy for Ollama (OpenAI Compatible)"""
    def __init__(self, base_url: Optional[str] = None):
        super().__init__()
        self._frontend_name = "ollama"
        self._backend_name = "ollama"
        # Use provided base_url or default
        self._api_base = base_url or "http://localhost:11434/v1"
        # Ensure URL ends with /v1 for OpenAI compatibility
        if not self._api_base.endswith("/v1"):
            self._api_base = self._api_base.rstrip("/") + "/v1"
    
    async def fetch_models(self, api_key: Optional[str] = None, session: Optional[aiohttp.ClientSession] = None) -> List[Dict[str, Any]]:
        try:
            return await super().fetch_models("ollama", session)
        except Exception as e:
            logger.warning(f"Failed to fetch Ollama models: {e}")
            return []

    async def generate(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> str:
        return await super().generate(model, messages, "ollama", session, **kwargs)

    async def stream(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[str, None]:
        async for chunk in super().stream(model, messages, "ollama", session, **kwargs):
            yield chunk

    async def stream_chat(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[ModelEvent, None]:
        """Stream chat with ModelEvent objects for unified streaming"""
        async for event in super().stream_chat(model, messages, "ollama", session, **kwargs):
            yield event


class GGUFStrategy(BaseProviderStrategy):
    """Strategy for local GGUF models with hardware acceleration"""
    
    def __init__(self):
        super().__init__(
            frontend_name="gguf",
            backend_name="gguf"
        )
        self._hardware_info = None
        self._llama_settings = None
    
    def _get_hardware_info(self):
        """Get hardware information with caching"""
        if self._hardware_info is None:
            from app.hardware.detection import detect_hardware
            self._hardware_info = detect_hardware()
        return self._hardware_info
    
    def _get_optimized_llama_settings(self, model_path: str = None):
        """Get optimized llama.cpp settings for current hardware and model"""
        from app.hardware.service import get_optimized_llamacpp_settings
        
        # Use the unified hardware manager for optimized settings
        settings = get_optimized_llamacpp_settings(model_path)
        
        return settings

    def ensure_model(self, model_filename: str, repo_id: str = "bartowski/Llama-3.2-1B-Instruct-GGUF") -> str:
        """
        Ensure a specific GGUF model exists locally.
        Downloads from HuggingFace if missing.
        Returns the absolute path to the model.
        """
        import os
        from huggingface_hub import hf_hub_download
        
        # Construct path relative to backend/models
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../models"))
        os.makedirs(base_dir, exist_ok=True)
        
        model_path = os.path.join(base_dir, model_filename)
        
        if not os.path.exists(model_path):
            logger.info(f"Downloading missing model {model_filename} from {repo_id}...")
            try:
                # Download to the specific directory
                hf_hub_download(
                    repo_id=repo_id,
                    filename=model_filename,
                    local_dir=base_dir,
                    local_dir_use_symlinks=False
                )
                logger.info(f"Model downloaded to {model_path}")
            except Exception as e:
                logger.error(f"Failed to download model: {e}")
                raise e
                
        return model_path
    
    async def fetch_models(self, api_key: Optional[str] = None, session: Optional[aiohttp.ClientSession] = None) -> List[Dict[str, Any]]:
        try:
            self._log_request("fetch_models", "fetch_models")
            
            from app.services.gguf_manager import list_local_models
            from pathlib import Path
            local_models = list_local_models()
            
            hw_info = self._get_hardware_info()
            backend = hw_info.get("backend", "cpu")
            
            models = []
            for m in local_models:
                model_path = m['path']
                model_name = Path(m['name']).stem

                # Automatic Context Window Setup
                from app.hardware.service import get_auto_context_window
                context_window = get_auto_context_window(model_path)

                # Get hardware compatibility info
                try:
                    from app.hardware.quantization import estimate_model_vram
                    estimated_vram = estimate_model_vram(model_path)
                    fits_vram = estimated_vram <= hw_info.get("vram_mb", 0) if hw_info.get("vram_mb", 0) > 0 else True
                    
                    models.append({
                        "id": f"gguf:{model_name}",
                        "name": model_name,
                        "provider": self._backend_name,
                        "context_window": context_window,
                        "supports_vision": False,
                        "path": model_path,
                        "hardware_compatibility": {
                            "backend": backend,
                            "estimated_vram_mb": int(estimated_vram),
                            "available_vram_mb": hw_info.get("vram_mb", 0),
                            "fits_vram": fits_vram,
                            "recommended": fits_vram or backend == "cpu"
                        }
                    })
                except Exception as e:
                    logger.warning(f"Could not assess hardware compatibility for {model_name}: {e}")
                    # Fallback without hardware info
                    models.append({
                        "id": f"gguf:{model_name}",
                        "name": model_name,
                        "provider": self._backend_name,
                        "context_window": context_window,
                        "supports_vision": False,
                        "path": model_path
                    })
            
            self._log_response("fetch_models", "fetch_models", True, model_count=len(models))
            return models
        except Exception as e:
            logger.error(f"Error fetching GGUF models: {e}")
            self._log_response("fetch_models", "fetch_models", False, error=str(e))
            return []

    async def generate(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> str:
        self._log_request(model, "generate", message_count=len(messages))
        
        # Resolve model path
        from app.services.gguf_manager import list_local_models
        local_models = list_local_models()
        
        # Strip 'gguf:' prefix if present
        if model.startswith('gguf:'):
            model = model[5:]  # Remove 'gguf:' prefix
            logger.info(f"GGUFStrategy: Stripped 'gguf:' prefix, using model name: {model}")
        
        model_path = next((m["path"] for m in local_models if m["name"] == model or m["name"].replace(".gguf", "") == model), None)
        
        if not model_path:
            # Log available models for debugging
            available_names = [m["name"] for m in local_models]
            error_msg = f"GGUF model not found: {model}. Available models: {available_names}"
            logger.error(error_msg)
            self._log_response(model, "generate", False, error=error_msg)
            raise ModelNotFoundError(
                provider=self._backend_name,
                message=f"Model '{model}' not found",
                details={"model": model, "available_models": available_names}
            )

        try:
            # Run blocking inference in thread pool with hardware optimization
            result = await asyncio.to_thread(self._run_inference, model_path, messages, **kwargs)
            self._log_response(model, "generate", True, response_length=len(result))
            return result
        except Exception as e:
            error_msg = f"GGUF inference error: {str(e)}"
            logger.error(error_msg)
            self._log_response(model, "generate", False, error=str(e))
            raise ProviderError(
                provider=self._backend_name,
                message=f"Inference failed for model '{model}'",
                details={"model": model, "error": str(e), "error_type": e.__class__.__name__}
            )

    def _run_inference(self, model_path: str, messages: List[Dict[str, str]], **kwargs):
        from llama_cpp import Llama
        
        try:
            settings = self._get_optimized_llama_settings(model_path)
            # Use detected n_ctx from settings unless overridden
            n_ctx = kwargs.get("n_ctx", settings.get("n_ctx", 32768))
            
            llm = Llama(
                model_path=model_path,
                n_ctx=n_ctx, 
                n_threads=settings["n_threads"],
                n_threads_batch=settings.get("n_threads_batch", settings["n_threads"]),
                n_gpu_layers=settings["n_gpu_layers"],
                n_batch=settings.get("n_batch", 512),
                n_ubatch=settings.get("n_ubatch", 512),
                main_gpu=settings.get("main_gpu", 0),
                use_mmap=settings.get("use_mmap", True),
                use_mlock=settings.get("use_mlock", False),
                flash_attn=settings.get("flash_attn", False), # Enable Flash Attention if supported
                verbose=False
            )
            
            response = llm.create_chat_completion(
                messages=messages,
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 4096),
                stop=kwargs.get("stop", ["User:", "###"]),
                stream=False
            )
            
            return response["choices"][0]["message"]["content"].strip()
            
        except Exception as e:
            logger.warning(f"Chat completion failed, falling back to manual prompt: {e}")
            full_prompt = ""
            for msg in messages:
                role = msg["role"].title()
                full_prompt += f"{role}: {msg['content']}\n\n"
            full_prompt += "Assistant: "
            
            settings = self._get_optimized_llama_settings(model_path)
            
            llm = Llama(
                model_path=model_path,
                n_ctx=min(16384, settings.get("n_ctx", 16384)),
                n_threads=settings["n_threads"],
                n_gpu_layers=settings["n_gpu_layers"],
                use_mmap=settings.get("use_mmap", True),
                use_mlock=settings.get("use_mlock", False),
                verbose=False
            )
            
            output = llm(
                full_prompt,
                max_tokens=kwargs.get("max_tokens", 1024),
                temperature=kwargs.get("temperature", 0.7),
                stop=["User:", "###"],
                echo=False
            )
            return output["choices"][0]["text"].strip()

    async def stream(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[str, None]:
        self._log_request(model, "stream", message_count=len(messages))
        
        # Resolve model path
        from app.services.gguf_manager import list_local_models
        local_models = list_local_models()
        
        # Strip 'gguf:' prefix if present
        if model.startswith('gguf:'):
            model = model[5:]  # Remove 'gguf:' prefix
            logger.info(f"GGUFStrategy: Stripped 'gguf:' prefix, using model name: {model}")
        
        model_path = next((m["path"] for m in local_models if m["name"] == model or m["name"].replace(".gguf", "") == model), None)
        
        if not model_path:
            # Log available models for debugging
            available_names = [m["name"] for m in local_models]
            error_msg = f"GGUF model not found: {model}. Available models: {available_names}"
            logger.error(error_msg)
            self._log_response(model, "stream", False, error=error_msg)
            raise ModelNotFoundError(
                provider=self._backend_name,
                message=f"Model '{model}' not found",
                details={"model": model, "available_models": available_names}
            )
        
        from llama_cpp import Llama
        
        settings = self._get_optimized_llama_settings(model_path)
        queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        # Use detected n_ctx from settings unless overridden
        n_ctx = kwargs.get("n_ctx", settings.get("n_ctx", 32768))
        
        def producer():
            try:
                llm = Llama(
                    model_path=model_path,
                    n_ctx=n_ctx,
                    n_threads=settings["n_threads"],
                    n_gpu_layers=settings["n_gpu_layers"],
                    use_mmap=settings.get("use_mmap", True),
                    use_mlock=settings.get("use_mlock", False),
                    flash_attn=settings.get("flash_attn", False),
                    n_batch=settings.get("n_batch", 512),
                    n_ubatch=settings.get("n_ubatch", 512),
                    verbose=False
                )
                
                try:
                    stream = llm.create_chat_completion(
                        messages=messages,
                        temperature=kwargs.get("temperature", 0.7),
                        max_tokens=kwargs.get("max_tokens", 4096),
                        stop=kwargs.get("stop", ["User:", "###"]),
                        stream=True
                    )
                    
                    for chunk in stream:
                        if "choices" in chunk and len(chunk["choices"]) > 0:
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta and delta["content"]:
                                asyncio.run_coroutine_threadsafe(queue.put(delta["content"]), loop)
                except Exception as e:
                    logger.warning(f"Streaming chat completion failed: {e}")
                    try:
                        response = self._run_inference(model_path, messages, **kwargs)
                        asyncio.run_coroutine_threadsafe(queue.put(response), loop)
                    except Exception as inner_e:
                        logger.error(f"Fallback inference failed: {inner_e}")
                        
            except Exception as e:
                logger.error(f"GGUF Producer Error: {e}")
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        thread = threading.Thread(target=producer, daemon=True)
        thread.start()
        
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
            
            self._log_response(model, "stream", True)
        except Exception as e:
            logger.error(f"GGUF stream error: {e}")
            self._log_response(model, "stream", False, error=str(e))
            raise ProviderError(
                provider=self._backend_name,
                message=f"Streaming failed for model '{model}'",
                details={"model": model, "error": str(e), "error_type": e.__class__.__name__}
            )

    async def stream_chat(self, model: str, messages: List[Dict[str, str]], api_key: str, session: aiohttp.ClientSession, **kwargs) -> AsyncGenerator[ModelEvent, None]:
        """Stream chat with ModelEvent objects for unified streaming"""
        # Use the common implementation pattern from base class
        async for event in self._stream_with_events(model, messages, api_key, session, **kwargs):
            yield event
