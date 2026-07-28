"""
GGUF Provider Implementation
Handles local GGUF models via llama-cpp-python with hardware-aware defaults.
"""
import logging
import asyncio
import os
from typing import List, Dict, Optional, Any, AsyncGenerator
from ..base import BaseProvider
from ..schemas import ModelMetadata, GenerateRequest, GenerateResponse, ModelEvent
from app.core.error_handlers import ModelNotFoundError, ProviderError

# Conditional import to allow running without llama-cpp installed (for testing/architecting)
try:
    from llama_cpp import Llama
    HAS_LLAMA_CPP = True
except ImportError:
    HAS_LLAMA_CPP = False

logger = logging.getLogger(__name__)

# Hardware-aware defaults — computed once at import time
try:
    from app.hardware.detection import get_llamacpp_settings
    _HW_SETTINGS = get_llamacpp_settings()
except Exception:
    _HW_SETTINGS = {}


def _resolve_model_path(name: str) -> Optional[str]:
    """Resolve a model name to an absolute path by searching models directories."""
    models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models"))
    gguf_dir = os.path.join(models_dir, "gguf")
    for base in [models_dir, gguf_dir]:
        candidate = os.path.join(base, name)
        if os.path.isfile(candidate):
            return candidate
        # Try with .gguf extension
        candidate_gguf = candidate + ".gguf" if not candidate.endswith(".gguf") else candidate
        if os.path.isfile(candidate_gguf):
            return candidate_gguf
    return None


class GGUFProvider(BaseProvider):
    """Provider for local GGUF models."""

    def __init__(self):
        super().__init__("gguf", "Local GGUF")
        self._models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models"))
        self._active_model = None
        self._active_model_path = None
        self._active_config = {}
        self._user_config: Dict[str, Any] = {}  # UI-driven overrides
        self._lock = asyncio.Lock()

    def get_config(self) -> Dict[str, Any]:
        """Return the effective config (env defaults + user overrides + active model)."""
        return {
            "n_ctx": self._resolve_param("GGUF_N_CTX", 4096, int),
            "n_gpu_layers": self._resolve_param("GGUF_N_GPU_LAYERS", _HW_SETTINGS.get("n_gpu_layers", -1), int),
            "flash_attn": self._resolve_param_bool("GGUF_FLASH_ATTN", _HW_SETTINGS.get("flash_attn", True)),
            "cache_type_k": self._resolve_param_str("GGUF_CACHE_TYPE_K", "q8_0"),
            "cache_type_v": self._resolve_param_str("GGUF_CACHE_TYPE_V", "q8_0"),
            "n_threads": self._resolve_param("GGUF_N_THREADS", _HW_SETTINGS.get("n_threads", 0), int),
            "use_mmap": self._resolve_param_bool("GGUF_USE_MMAP", _HW_SETTINGS.get("use_mmap", True)),
            "use_mlock": self._resolve_param_bool("GGUF_USE_MLOCK", _HW_SETTINGS.get("use_mlock", False)),
            "model_loaded": self._active_model_path is not None,
            "model_path": self._active_model_path,
        }

    def update_config(self, overrides: Dict[str, Any]) -> Dict[str, Any]:
        """Apply user-configurable overrides. Only accepts safe keys.
        Returns the updated effective config."""
        allowed = {"n_ctx", "n_gpu_layers", "cache_type_k", "cache_type_v"}
        for key, value in overrides.items():
            if key in allowed:
                self._user_config[key] = value
        # If a model is loaded, unload it so the next load picks up new config
        if self._active_model:
            self._active_model = None
            self._active_model_path = None
            self._active_config = {}
        return self.get_config()

    def _resolve_param(self, key: str, default: Any, cast: type) -> Any:
        """Resolve a param: user_config > env > default."""
        param = key.removeprefix("GGUF_").lower()
        if param in self._user_config:
            return self._user_config[param]
        try:
            val = os.environ.get(key)
            return cast(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    def _resolve_param_bool(self, key: str, default: bool) -> bool:
        param = key.removeprefix("GGUF_").lower()
        if param in self._user_config:
            val = self._user_config[param]
            if isinstance(val, bool):
                return val
            return str(val).lower() in ("1", "true", "yes")
        val = os.environ.get(key)
        if val is None:
            return default
        return val.lower() in ("1", "true", "yes")

    def _resolve_param_str(self, key: str, default: str) -> str:
        param = key.removeprefix("GGUF_").lower()
        if param in self._user_config:
            return str(self._user_config[param])
        return os.environ.get(key, default)

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List available GGUF models in the models directory."""
        models = []
        for base_dir in [self._models_dir, os.path.join(self._models_dir, "gguf")]:
            if not os.path.exists(base_dir):
                continue
            for f in sorted(os.listdir(base_dir)):
                if f.endswith(".gguf") and os.path.isfile(os.path.join(base_dir, f)):
                    full_path = os.path.join(base_dir, f)
                    models.append(ModelMetadata(
                        id=f,
                        name=f,
                        provider="gguf",
                        path=full_path,
                        type="chat"
                    ))
        return models

    # ── Adjustable parameters ──────────────────────────────────────────
    # These can be overridden via environment variables:
    #
    # GGUF_N_CTX            Context window size (default: 4096)
    # GGUF_N_GPU_LAYERS     GPU layers to offload (-1 = all, 0 = CPU only)
    # GGUF_FLASH_ATTN       Flash attention (1 = on, 0 = off)
    # GGUF_CACHE_TYPE_K     Key cache type: f16, q8_0, q4_0 (default: q8_0)
    # GGUF_CACHE_TYPE_V     Value cache type: f16, q8_0, q4_0 (default: q8_0)
    # GGUF_N_THREADS        Number of CPU threads (default: auto from HW detection)
    # GGUF_USE_MMAP         Memory-map model file (1 = on, 0 = off)
    # GGUF_USE_MLOCK        Lock model in RAM (1 = on, 0 = off)
    # ────────────────────────────────────────────────────────────────────

    def _load_model(self, model_path: str, n_ctx: Optional[int] = None):
        """Load the model into memory (blocking), using hardware-aware defaults."""
        if not HAS_LLAMA_CPP:
            raise ProviderError("gguf", "llama-cpp-python not installed")

        if self._active_model_path == model_path and self._active_model:
            return self._active_model

        # Resolve params: n_ctx from call arg > user_config > env > default
        cfg = self.get_config()
        n_ctx = n_ctx or cfg["n_ctx"]
        flash_attn = cfg["flash_attn"]
        n_gpu_layers = cfg["n_gpu_layers"]
        n_threads = cfg["n_threads"] or None
        cache_type_k = cfg["cache_type_k"]
        cache_type_v = cfg["cache_type_v"]
        use_mmap = cfg["use_mmap"]
        use_mlock = cfg["use_mlock"]

        config = {
            "n_ctx": n_ctx,
            "flash_attn": flash_attn,
            "n_gpu_layers": n_gpu_layers,
            "n_threads": n_threads,
            "cache_type_k": cache_type_k,
            "cache_type_v": cache_type_v,
            "use_mmap": use_mmap,
            "use_mlock": use_mlock,
        }

        logger.info(f"Loading GGUF model: {model_path} with config: {config}")

        try:
            self._active_model = Llama(
                model_path=model_path,
                n_ctx=n_ctx,
                flash_attn=flash_attn,
                n_gpu_layers=n_gpu_layers,
                n_threads=n_threads,
                cache_type_k=cache_type_k,
                cache_type_v=cache_type_v,
                use_mmap=use_mmap,
                use_mlock=use_mlock,
                verbose=False,
            )
            self._active_model_path = model_path
            self._active_config = config
            logger.info(f"Model loaded successfully. Active config: {config}")
            return self._active_model
        except Exception as e:
            self._active_model = None
            self._active_model_path = None
            self._active_config = {}
            logger.error(f"Failed to load model {model_path}: {e}")
            raise ProviderError("gguf", f"Failed to load model: {e}")

    # ── generate, stream, _generate_blocking follow ──
    # (unchanged from original — uses self._load_model above)

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        """Generate response (non-streaming)."""
        async with self._lock:
            # Find model path
            models = await self.list_models()
            model_meta = next((m for m in models if m.id == request.model), None)
            
            if not model_meta or not model_meta.path:
                raise ModelNotFoundError("gguf", f"Model {request.model} not found")
                
            try:
                # Offload blocking load/inference to thread
                response = await asyncio.to_thread(
                    self._generate_blocking, 
                    model_meta.path, 
                    request
                )
                return response
            except Exception as e:
                raise ProviderError("gguf", f"Generation failed: {e}")

    def _generate_blocking(self, model_path: str, request: GenerateRequest) -> GenerateResponse:
        """Blocking generation logic."""
        # Use appropriate context size - don't use max_tokens as n_ctx
        # Falls back to _load_model's default (4096, overridable via GGUF_N_CTX)
        n_ctx = getattr(request, 'n_ctx', None)
        llm = self._load_model(model_path, n_ctx)
        
        output = llm.create_chat_completion(
            messages=request.messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stop=request.stop or [],
            stream=False
        )
        
        content = output["choices"][0]["message"]["content"]
        usage = output.get("usage", {})
        
        return GenerateResponse(
            content=content,
            usage=usage,
            finish_reason=output["choices"][0]["finish_reason"]
        )

    async def stream(self, request: GenerateRequest) -> AsyncGenerator[ModelEvent, None]:
        """Stream response."""
        # Find model path
        models = await self.list_models()
        model_meta = next((m for m in models if m.id == request.model), None)
        
        if not model_meta or not model_meta.path:
            yield ModelEvent.error(f"Model {request.model} not found")
            return

        try:
            # Use appropriate context size - don't use max_tokens as n_ctx
            # max_tokens is how many to generate, n_ctx is context window
            # Falls back to _load_model's default (4096, overridable via GGUF_N_CTX)
            n_ctx = getattr(request, 'n_ctx', None)
            
            # We need to run the generator in a thread, but since it's an iterator, 
            # we can't just use asyncio.to_thread on the whole thing easily.
            # We'll use a queue.
            queue = asyncio.Queue()
            loop = asyncio.get_running_loop()
            
            def producer():
                try:
                    llm = self._load_model(model_meta.path, n_ctx)
                    stream = llm.create_chat_completion(
                        messages=request.messages,
                        max_tokens=request.max_tokens,
                        temperature=request.temperature,
                        stop=request.stop or [],
                        stream=True
                    )
                    
                    loop.call_soon_threadsafe(queue.put_nowait, ModelEvent.typing())
                    
                    for chunk in stream:
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            loop.call_soon_threadsafe(queue.put_nowait, ModelEvent.token(content))
                            
                    loop.call_soon_threadsafe(queue.put_nowait, ModelEvent.done())
                except Exception as e:
                    loop.call_soon_threadsafe(queue.put_nowait, ModelEvent.error(str(e)))
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, None)

            # Start producer thread
            import threading
            t = threading.Thread(target=producer, daemon=True)
            t.start()
            
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
                
        except Exception as e:
             yield ModelEvent.error(str(e))

# Singleton for routes to access
_gguf_provider: Optional[GGUFProvider] = None


def get_gguf_provider() -> GGUFProvider:
    global _gguf_provider
    if _gguf_provider is None:
        _gguf_provider = GGUFProvider()
    return _gguf_provider
