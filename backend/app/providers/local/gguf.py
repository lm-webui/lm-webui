"""
GGUF Provider Implementation
Handles local GGUF models via llama-cpp-python.
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

class GGUFProvider(BaseProvider):
    """Provider for local GGUF models."""
    
    def __init__(self):
        super().__init__("gguf", "Local GGUF")
        self._models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models"))
        self._active_model = None
        self._active_model_path = None
        self._lock = asyncio.Lock()

    async def list_models(self, api_key: Optional[str] = None) -> List[ModelMetadata]:
        """List available GGUF models in the models directory."""
        if not os.path.exists(self._models_dir):
            return []
            
        models = []
        for f in os.listdir(self._models_dir):
            if f.endswith(".gguf"):
                models.append(ModelMetadata(
                    id=f,
                    name=f,
                    provider="gguf",
                    path=os.path.join(self._models_dir, f),
                    type="chat"
                ))
        return models

    def _load_model(self, model_path: str, n_ctx: int = 4096):
        """Load the model into memory (blocking)."""
        if not HAS_LLAMA_CPP:
            raise ProviderError("gguf", "llama-cpp-python not installed")
            
        if self._active_model_path == model_path and self._active_model:
            return self._active_model
            
        logger.info(f"Loading GGUF model: {model_path}")
        try:
            # Basic loading strategy - can be enhanced with hardware detection later
            self._active_model = Llama(
                model_path=model_path,
                n_ctx=n_ctx,
                verbose=False
            )
            self._active_model_path = model_path
            return self._active_model
        except Exception as e:
            logger.error(f"Failed to load model {model_path}: {e}")
            raise ProviderError("gguf", f"Failed to load model: {e}")

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
        n_ctx = getattr(request, 'n_ctx', None) or 2048
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
            n_ctx = getattr(request, 'n_ctx', None) or 2048
            
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
