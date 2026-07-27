"""
Hardware acceleration module for LLM-WebUI
Auto-detects hardware (CPU, CUDA, ROCm, Metal) and provides optimized settings.
"""

from .detection import detect_hardware, get_hardware_status
from .quantization import recommended_quants_for_backend, pick_best_quant

__all__ = [
    'detect_hardware',
    'get_hardware_status',
    'recommended_quants_for_backend',
    'pick_best_quant',
]
