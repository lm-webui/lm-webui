"""
Runtime Manager
Manages local inference (GGUF) and detected external runtimes (MLX, ComfyUI).
"""
from .registry import RuntimeRegistry, get_runtime_registry
from .detector import RuntimeDetector, RuntimeType, get_runtime_detector
from .installer import MLXManager, get_mlx_manager

__all__ = [
    "RuntimeRegistry",
    "RuntimeDetector",
    "MLXManager",
    "RuntimeType",
    "get_runtime_registry",
    "get_runtime_detector",
    "get_mlx_manager",
]
