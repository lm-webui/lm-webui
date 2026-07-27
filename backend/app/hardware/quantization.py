"""
Quantization mapping and helper functions for hardware backends
Provides recommended quantizations and fallback logic
"""
import re
import logging
from typing import List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Quantization hierarchy from highest to lowest quality
QUANT_HIERARCHY = {
    'metal': ['Q8_K_M', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'Q4_K_S', 'Q4_0'],
    'cuda': ['Q8_K_M', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'Q4_K_S', 'Q4_0'],
    'rocm': ['Q8_K_M', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'Q4_K_S', 'Q4_0'],
    'cpu': ['Q4_K_S', 'Q4_0', 'Q5_K_S', 'Q5_K_M', 'Q6_K', 'Q8_K_M'],
}

# VRAM requirements per quantization (rough estimates in MB per billion parameters)
VRAM_REQUIREMENTS = {
    'Q8_K_M': 8500, 'Q6_K': 6500, 'Q5_K_M': 5500,
    'Q4_K_M': 4500, 'Q4_K_S': 4000, 'Q4_0': 3800,
    'FP16': 2000, 'BF16': 2000,
}


def recommended_quants_for_backend(backend: str) -> List[str]:
    """Get recommended quantizations for a specific backend."""
    return QUANT_HIERARCHY.get(backend, QUANT_HIERARCHY['cpu']).copy()


def _is_quant_supported(quant: str, backend: str) -> bool:
    """Check if quantization is supported by backend."""
    if backend == 'cpu':
        return True
    elif backend in ('cuda', 'rocm', 'metal'):
        return quant in VRAM_REQUIREMENTS
    return False


def _quant_fits_vram(quant: str, vram_mb: int, model_params: Optional[int] = None) -> bool:
    """Check if quantization fits in available VRAM."""
    if model_params is None:
        return True
    params_billions = model_params / 1_000_000_000
    vram_required = VRAM_REQUIREMENTS.get(quant, 5000) * params_billions
    return vram_required * 1.2 <= vram_mb


def pick_best_quant(model_quant: str, backend: str, vram_mb: int, model_params: Optional[int] = None) -> str:
    """Pick the best quantization for a model based on backend and available VRAM."""
    if _is_quant_supported(model_quant, backend) and _quant_fits_vram(model_quant, vram_mb, model_params):
        return model_quant

    for quant in recommended_quants_for_backend(backend):
        if _is_quant_supported(quant, backend) and _quant_fits_vram(quant, vram_mb, model_params):
            logger.info(f"Selected quantization {quant} for {backend} with {vram_mb}MB VRAM")
            return quant

    for quant in recommended_quants_for_backend('cpu'):
        if _quant_fits_vram(quant, vram_mb, model_params):
            logger.warning(f"Fallback to CPU-safe quantization {quant} due to VRAM constraints")
            return quant

    logger.warning("Using fallback quantization Q4_0 due to VRAM constraints")
    return "Q4_0"


def estimate_model_vram(model_path: str, quant: Optional[str] = None) -> int:
    """Estimate VRAM usage for a model based on file size."""
    try:
        model_size_mb = Path(model_path).stat().st_size / (1024 * 1024)
        if quant:
            quant_factor = _get_quant_size_factor(quant)
        else:
            quant = _extract_quant_from_filename(model_path)
            quant_factor = _get_quant_size_factor(quant) if quant else 1.0
        # Conservative 2x model size, capped at 32GB
        return min(int(model_size_mb * 2.0), 32 * 1024)
    except Exception as e:
        logger.warning(f"Could not estimate VRAM usage: {e}")
        return 4096


def _get_quant_size_factor(quant: str) -> float:
    factors = {
        'FP16': 2.0, 'BF16': 2.0,
        'Q8_K_M': 1.0, 'Q8_0': 1.0,
        'Q6_K': 0.75,
        'Q5_K_M': 0.625, 'Q5_K_S': 0.625,
        'Q4_K_M': 0.5, 'Q4_K_S': 0.5, 'Q4_0': 0.5,
    }
    return factors.get(quant, 1.0)


def _extract_quant_from_filename(model_path: str) -> Optional[str]:
    """Extract quantization type from filename."""
    filename = Path(model_path).name.upper()
    patterns = [
        r'(Q[2-8]_[A-Z]+_[A-Z]+)', r'(Q[2-8]_[A-Z]+)',
        r'(Q[2-8]_[0-9])', r'(Q[2-8]K)', r'(FP16|BF16)',
    ]
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            return match.group(1)
    return None


# Public alias
extract_quant_from_filename = _extract_quant_from_filename
