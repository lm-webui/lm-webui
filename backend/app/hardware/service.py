"""
Unified Hardware Manager for LLM-WebUI

This module provides a centralized hardware manager that bridges hardware detection
with both llama.cpp and PyTorch systems. It ensures consistent hardware settings
for both systems and manages fallback strategies when hardware acceleration fails.
"""
import logging
import time
import os
import psutil
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from .detection import HardwareDetector, detect_hardware, get_torch_device, get_llamacpp_settings
from .quantization import QuantizationManager, estimate_model_vram, extract_quant_from_filename

logger = logging.getLogger(__name__)


class AccelerationBackend(Enum):
    """Enumeration of supported acceleration backends"""
    CPU = "cpu"
    CUDA = "cuda"
    ROCM = "rocm"
    METAL = "metal"
    SYCL = "sycl"
    VULKAN = "vulkan"


@dataclass
class HardwareProfile:
    """Hardware profile with comprehensive system information"""
    backend: AccelerationBackend
    device_name: str
    vram_mb: int
    system_ram_mb: int
    cpu_cores: int
    platform: str
    architecture: str
    available_backends: List[AccelerationBackend]
    driver_version: Optional[str] = None
    cuda_version: Optional[str] = None
    rocm_version: Optional[str] = None
    sycl_version: Optional[str] = None
    vulkan_version: Optional[str] = None
    metal_support: bool = False
    sycl_support: bool = False
    vulkan_support: bool = False


@dataclass
class ModelHardwareRequirements:
    """Hardware requirements for a specific model"""
    model_path: str
    estimated_vram_mb: int
    quantization: Optional[str]
    fits_vram: bool
    recommended_backend: AccelerationBackend
    fallback_backends: List[AccelerationBackend]


class UnifiedHardwareManager:
    """
    Unified hardware manager that provides consistent hardware settings
    for both llama.cpp and PyTorch systems.
    """
    
    def __init__(self):
        self._detector = HardwareDetector()
        self._quant_manager = QuantizationManager()
        self._hardware_profile: Optional[HardwareProfile] = None
        self._performance_monitor = {}
        self._fallback_history = {}
        self._context_window_cache = {}
        
    def get_hardware_profile(self) -> HardwareProfile:
        """Get or create hardware profile"""
        if self._hardware_profile is None:
            hw_info = self._detector.detect_hardware()
            
            # Convert backend string to enum
            backend_str = hw_info.get("backend", "cpu")
            backend = AccelerationBackend(backend_str)
            
            # Convert available backends to enums
            available_backends = [
                AccelerationBackend(b) for b in hw_info.get("available_backends", ["cpu"])
                if b in [e.value for e in AccelerationBackend]
            ]
            
            self._hardware_profile = HardwareProfile(
                backend=backend,
                device_name=hw_info.get("device", "CPU"),
                vram_mb=hw_info.get("vram_mb", 0),
                system_ram_mb=hw_info.get("system_ram_mb", 0),
                cpu_cores=hw_info.get("cpu_cores", 1),
                platform=hw_info.get("platform", "Unknown"),
                architecture=hw_info.get("architecture", "Unknown"),
                available_backends=available_backends,
                driver_version=hw_info.get("driver_version"),
                cuda_version=hw_info.get("cuda_version"),
                rocm_version=hw_info.get("rocm_version"),
                sycl_version=hw_info.get("sycl_version"),
                vulkan_version=hw_info.get("vulkan_version"),
                metal_support=hw_info.get("metal_support", False),
                sycl_support=hw_info.get("sycl_support", False),
                vulkan_support=hw_info.get("vulkan_support", False)
            )
            
            logger.info(f"Hardware profile created: {self._hardware_profile.backend.value} on {self._hardware_profile.device_name}")
        
        return self._hardware_profile
    
    def get_torch_settings(self) -> Dict[str, Any]:
        """
        Get optimized PyTorch settings for current hardware
        
        Returns:
            Dictionary with PyTorch device and optimization settings
        """
        profile = self.get_hardware_profile()
        
        settings = {
            "device": get_torch_device(),
            "dtype": "float32",  # Default dtype
            "memory_format": "contiguous_format",
            "allow_tf32": False,
            "cudnn_benchmark": False,
            "cudnn_deterministic": True
        }
        
        # Hardware-specific optimizations
        if profile.backend == AccelerationBackend.CUDA:
            settings["dtype"] = "float16"  # Use FP16 for CUDA
            settings["allow_tf32"] = True  # Enable TF32 for Ampere+
            settings["cudnn_benchmark"] = True  # Enable cuDNN benchmark
            
        elif profile.backend == AccelerationBackend.METAL:
            settings["dtype"] = "float16"  # Use FP16 for Metal
            
        elif profile.backend == AccelerationBackend.ROCM:
            settings["dtype"] = "float16"  # Use FP16 for ROCm
            
        elif profile.backend == AccelerationBackend.SYCL:
            settings["dtype"] = "bfloat16"  # Use BF16 for Intel XPU
            
        return settings
    
    def get_llamacpp_settings(self, model_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Get optimized llama.cpp settings for current hardware and model
        
        Args:
            model_path: Optional path to model for model-specific optimizations
            
        Returns:
            Dictionary with llama.cpp settings
        """
        profile = self.get_hardware_profile()
        
        # Get base settings from detection module
        settings = get_llamacpp_settings()
        
        # Enhance with hardware-specific optimizations
        if profile.backend in [AccelerationBackend.CUDA, AccelerationBackend.ROCM, AccelerationBackend.METAL]:
            # GPU backends can offload more layers
            if model_path:
                # Model-specific optimization
                model_reqs = self.assess_model_requirements(model_path)
                
                if model_reqs.fits_vram:
                    # Offload all layers to GPU
                    settings["n_gpu_layers"] = -1
                else:
                    # Partial offloading based on available VRAM
                    available_vram_ratio = profile.vram_mb / model_reqs.estimated_vram_mb
                    if available_vram_ratio >= 0.8:
                        settings["n_gpu_layers"] = -1  # Offload all
                    elif available_vram_ratio >= 0.5:
                        settings["n_gpu_layers"] = 32  # Partial offload
                    else:
                        settings["n_gpu_layers"] = 0  # CPU only
                        
            else:
                # No model info, use conservative settings
                settings["n_gpu_layers"] = -1 if profile.vram_mb > 4096 else 0
        
        # Thread optimization
        # Reuse detailed detection logic
        settings["n_threads"] = get_llamacpp_settings()["n_threads"]
        settings["n_threads_batch"] = get_llamacpp_settings()["n_threads_batch"]
        
        # Flash Attention
        settings["flash_attn"] = get_llamacpp_settings()["flash_attn"]

        # mlock optimization (lock model in RAM)
        # Only enable if we have plenty of RAM (e.g. > 16GB system RAM)
        if profile.system_ram_mb > 16384:
             settings["use_mlock"] = True

        # Batch size optimization
        if profile.backend == AccelerationBackend.METAL:
            # Metal benefits from smaller batches
            settings["n_batch"] = 512
            settings["n_ubatch"] = 512
        elif profile.backend in [AccelerationBackend.CUDA, AccelerationBackend.ROCM]:
            # CUDA/ROCm can handle larger batches
            settings["n_batch"] = 2048
            # Optimizing ubatch to match batch size for high-throughput
            settings["n_ubatch"] = 2048
        else:
            # CPU default
            settings["n_batch"] = 512
            settings["n_ubatch"] = 512
        
        # Context window optimization
        if model_path:
            settings["n_ctx"] = self.get_auto_context_window(model_path)
        elif profile.backend in [AccelerationBackend.CUDA, AccelerationBackend.ROCM]:
            # GPU backends can handle larger context
            settings["n_ctx"] = 8192
        else:
            # CPU/Metal default
            settings["n_ctx"] = 4096
        
        return settings
    
    def assess_model_requirements(self, model_path: str) -> ModelHardwareRequirements:
        """
        Assess hardware requirements for a specific model
        
        Args:
            model_path: Path to model file
            
        Returns:
            ModelHardwareRequirements object
        """
        profile = self.get_hardware_profile()
        
        # Estimate VRAM requirements
        estimated_vram = estimate_model_vram(model_path)
        
        # Extract quantization
        quantization = extract_quant_from_filename(model_path)
        
        # Check if model fits in VRAM
        fits_vram = estimated_vram <= profile.vram_mb if profile.vram_mb > 0 else True
        
        # Determine recommended backend
        recommended_backend = profile.backend
        fallback_backends = []
        
        if not fits_vram:
            # Model doesn't fit in VRAM, fallback to CPU
            recommended_backend = AccelerationBackend.CPU
            fallback_backends = [AccelerationBackend.CPU]
        else:
            # Model fits, check for alternative backends
            for backend in profile.available_backends:
                if backend != recommended_backend:
                    fallback_backends.append(backend)
        
        return ModelHardwareRequirements(
            model_path=model_path,
            estimated_vram_mb=estimated_vram,
            quantization=quantization,
            fits_vram=fits_vram,
            recommended_backend=recommended_backend,
            fallback_backends=fallback_backends
        )
    
    def get_optimal_backend_for_model(self, model_path: str) -> AccelerationBackend:
        """
        Get optimal backend for a specific model
        
        Args:
            model_path: Path to model file
            
        Returns:
            Optimal acceleration backend
        """
        model_reqs = self.assess_model_requirements(model_path)
        return model_reqs.recommended_backend
    
    def monitor_performance(self, backend: AccelerationBackend, operation: str, duration_ms: float):
        """
        Monitor performance of hardware operations
        
        Args:
            backend: Acceleration backend used
            operation: Type of operation (e.g., "inference", "embedding")
            duration_ms: Duration in milliseconds
        """
        key = f"{backend.value}:{operation}"
        
        if key not in self._performance_monitor:
            self._performance_monitor[key] = {
                "count": 0,
                "total_duration_ms": 0,
                "min_duration_ms": float('inf'),
                "max_duration_ms": 0,
                "last_updated": time.time()
            }
        
        stats = self._performance_monitor[key]
        stats["count"] += 1
        stats["total_duration_ms"] += duration_ms
        stats["min_duration_ms"] = min(stats["min_duration_ms"], duration_ms)
        stats["max_duration_ms"] = max(stats["max_duration_ms"], duration_ms)
        stats["last_updated"] = time.time()
        
        # Log performance periodically
        if stats["count"] % 10 == 0:
            avg_duration = stats["total_duration_ms"] / stats["count"]
            logger.info(f"Performance: {key} - avg: {avg_duration:.1f}ms, min: {stats['min_duration_ms']:.1f}ms, max: {stats['max_duration_ms']:.1f}ms")
    
    def get_performance_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        Get performance statistics for all monitored operations
        
        Returns:
            Dictionary with performance statistics
        """
        stats = {}
        for key, data in self._performance_monitor.items():
            if data["count"] > 0:
                avg_duration = data["total_duration_ms"] / data["count"]
                stats[key] = {
                    "count": data["count"],
                    "avg_duration_ms": avg_duration,
                    "min_duration_ms": data["min_duration_ms"],
                    "max_duration_ms": data["max_duration_ms"],
                    "last_updated": data["last_updated"]
                }
        return stats
    
    def record_fallback(self, from_backend: AccelerationBackend, to_backend: AccelerationBackend, reason: str):
        """
        Record a fallback from one backend to another
        
        Args:
            from_backend: Original backend
            to_backend: Fallback backend
            reason: Reason for fallback
        """
        key = f"{from_backend.value}->{to_backend.value}"
        
        if key not in self._fallback_history:
            self._fallback_history[key] = {
                "count": 0,
                "reasons": {},
                "last_occurrence": time.time()
            }
        
        history = self._fallback_history[key]
        history["count"] += 1
        history["last_occurrence"] = time.time()
        
        if reason not in history["reasons"]:
            history["reasons"][reason] = 0
        history["reasons"][reason] += 1
        
        logger.warning(f"Hardware fallback: {from_backend.value} -> {to_backend.value} due to: {reason}")
    
    def get_fallback_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        Get fallback statistics
        
        Returns:
            Dictionary with fallback statistics
        """
        return self._fallback_history.copy()
    
    def get_system_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive system summary
        
        Returns:
            Dictionary with system summary
        """
        profile = self.get_hardware_profile()
        
        return {
            "hardware_profile": {
                "backend": profile.backend.value,
                "device": profile.device_name,
                "vram_mb": profile.vram_mb,
                "system_ram_mb": profile.system_ram_mb,
                "cpu_cores": profile.cpu_cores,
                "available_backends": [b.value for b in profile.available_backends]
            },
            "performance_stats": self.get_performance_stats(),
            "fallback_stats": self.get_fallback_stats(),
            "timestamp": time.time()
        }

    def get_auto_context_window(self, model_path: str) -> int:
        """
        Calculate automatic context window based on model metadata and hardware reality.
        """
        # Check cache first
        if model_path in self._context_window_cache:
            return self._context_window_cache[model_path]

        # 1. READ MODEL NATIVE LIMIT (From GGUF Metadata)
        native_limit = 4096 # fallback
        try:
            from llama_cpp import Llama
            # Probe metadata via constructor
            temp_llm = Llama(model_path=model_path, n_ctx=16, verbose=False, n_gpu_layers=0)
            
            # Extract metadata from the model property
            # llama-cpp-python usually stores it in temp_llm.metadata
            metadata = getattr(temp_llm, 'metadata', {})
            
            # Common keys for context length in GGUF
            ctx_keys = ['llama.context_length', 'llm.context_length', 'phi3.context_length', 'gemma.context_length', 'qwen2.context_length']
            
            found_limit = None
            for key in ctx_keys:
                if key in metadata:
                    try:
                        val = metadata[key]
                        if isinstance(val, (bytes, str)):
                            found_limit = int(val)
                        elif isinstance(val, (int, float)):
                            found_limit = int(val)
                        if found_limit and found_limit > 0:
                            break
                    except:
                        continue
            
            if found_limit:
                native_limit = found_limit
            else:
                # Try internal properties that might be exposed
                for attr in ['n_ctx_train', 'context_length', 'max_position_embeddings']:
                    val = getattr(temp_llm, attr, None)
                    if val is not None and isinstance(val, (int, float)) and val > 0:
                        native_limit = int(val)
                        break
            
            # Final sanity check: if it's still 4096 but model is very large, it might be misreported
            if native_limit <= 4096:
                file_size_gb = os.path.getsize(model_path) / (1024**3)
                if file_size_gb > 8: native_limit = max(native_limit, 32768)
                elif file_size_gb > 4: native_limit = max(native_limit, 16384)
                elif file_size_gb > 2: native_limit = max(native_limit, 8192)

            del temp_llm
        except Exception as e:
            logger.warning(f"Could not read native context limit for {model_path}: {e}")
            # Fallback based on file size if metadata read fails
            file_size_gb = os.path.getsize(model_path) / (1024**3)
            if file_size_gb > 10: native_limit = 32768
            elif file_size_gb > 5: native_limit = 16384
            else: native_limit = 8192

        # 2. CALCULATE HARDWARE LIMIT (RAM Check)
        # In 2026, Q4 models use ~0.015GB per 1k context tokens
        available_gb = psutil.virtual_memory().available / (1024**3)
        usable_gb = max(0, available_gb - 2.0) # Reserve 2GB for OS/Apps
        hardware_limit = int((usable_gb / 0.015) * 1024)

        # 3. THE SMART MERGE
        final_window = min(native_limit, hardware_limit)
        
        # 4. Stability Cap (64k)
        STABILITY_CAP = 65536 
        result = min(final_window, STABILITY_CAP)
        
        # Ensure at least a minimum usable window
        result = max(result, 2048)
        
        # Log the detailed calculation for the user
        model_name = os.path.basename(model_path)
        logger.info(f"Context Window Calculation for {model_name}:")
        logger.info(f"  - Native Limit: {native_limit}")
        logger.info(f"  - Hardware Limit (RAM-based): {hardware_limit}")
        logger.info(f"  - Stability Cap: {STABILITY_CAP}")
        logger.info(f"  -> Final Calculated Limit: {result}")
        
        # Cache the result
        self._context_window_cache[model_path] = result
        
        return result


# Global instance
_hardware_manager = None

def get_hardware_manager() -> UnifiedHardwareManager:
    """Get global hardware manager instance"""
    global _hardware_manager
    if _hardware_manager is None:
        _hardware_manager = UnifiedHardwareManager()
    return _hardware_manager


# Convenience functions
def get_torch_settings() -> Dict[str, Any]:
    """Get optimized PyTorch settings"""
    return get_hardware_manager().get_torch_settings()

def get_optimized_llamacpp_settings(model_path: Optional[str] = None) -> Dict[str, Any]:
    """Get optimized llama.cpp settings"""
    return get_hardware_manager().get_llamacpp_settings(model_path)

def assess_model_hardware_requirements(model_path: str) -> ModelHardwareRequirements:
    """Assess hardware requirements for a model"""
    return get_hardware_manager().assess_model_requirements(model_path)

def get_system_summary() -> Dict[str, Any]:
    """Get comprehensive system summary"""
    return get_hardware_manager().get_system_summary()

def get_auto_context_window(model_path: str) -> int:
    """Helper function to get automatic context window for a model"""
    return get_hardware_manager().get_auto_context_window(model_path)
