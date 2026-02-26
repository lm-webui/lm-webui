"""
Hardware detection module for LLM-WebUI
Auto-detects CPU, CUDA, ROCm, Metal, SYCL, and Vulkan
Provides optimal settings for PyTorch and Llama.cpp
"""
import os
import platform
import logging
import subprocess
import psutil
from typing import Dict, Optional, List, Any

logger = logging.getLogger(__name__)

class HardwareDetector:
    """Hardware detection and backend selection"""
    
    def __init__(self):
        self._detected_hardware = None
        self._available_backends = []
        
    def detect_hardware(self) -> Dict:
        """
        Detect available hardware and select optimal backend
        Priority: CUDA/ROCm > Metal > SYCL > Vulkan > CPU
        """
        if self._detected_hardware:
            return self._detected_hardware
            
        hardware_info = {
            "backend": "cpu",
            "device": "CPU",
            "vram_mb": 0,
            "system_ram_mb": int(psutil.virtual_memory().total / (1024 * 1024)),
            "cpu_cores": psutil.cpu_count(),
            "platform": platform.system(),
            "architecture": platform.machine(),
            "available_backends": ["cpu"],
            "driver_version": None,
            "cuda_version": None,
            "rocm_version": None,
            "sycl_version": None,
            "vulkan_version": None
        }
        
        # 1. Check CUDA (NVIDIA)
        cuda_info = self._detect_cuda()
        if cuda_info:
            hardware_info.update(cuda_info)
            hardware_info["available_backends"].append("cuda")
            hardware_info["backend"] = "cuda"
            
        # 2. Check ROCm (AMD)
        rocm_info = self._detect_rocm()
        if rocm_info:
            hardware_info.update(rocm_info)
            hardware_info["available_backends"].append("rocm")
            if hardware_info["backend"] == "cpu": # Prefer ROCm if no CUDA
                hardware_info["backend"] = "rocm"
                
        # 3. Check Metal (Apple Silicon)
        metal_info = self._detect_metal()
        if metal_info:
            hardware_info.update(metal_info)
            hardware_info["available_backends"].append("metal")
            if hardware_info["backend"] == "cpu":
                hardware_info["backend"] = "metal"

        # 4. Check SYCL (Intel Arc/iGPU)
        sycl_info = self._detect_sycl()
        if sycl_info:
            hardware_info.update(sycl_info)
            hardware_info["available_backends"].append("sycl")
            if hardware_info["backend"] == "cpu":
                hardware_info["backend"] = "sycl"

        # 5. Check Vulkan (Universal Fallback for GPU)
        vulkan_info = self._detect_vulkan()
        if vulkan_info:
            hardware_info.update(vulkan_info)
            hardware_info["available_backends"].append("vulkan")
            if hardware_info["backend"] == "cpu":
                hardware_info["backend"] = "vulkan"
            
        self._detected_hardware = hardware_info
        self._available_backends = hardware_info["available_backends"]
        
        logger.info(f"Detected hardware: {hardware_info['backend']} backend on {hardware_info['device']}")
        logger.info(f"Available backends: {hardware_info['available_backends']}")
        
        return hardware_info
    
    def _detect_cuda(self) -> Optional[Dict]:
        """Detect CUDA-capable NVIDIA GPU"""
        try:
            import torch
            if torch.cuda.is_available():
                device_count = torch.cuda.device_count()
                if device_count > 0:
                    device_name = torch.cuda.get_device_name(0)
                    vram_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
                    
                    cuda_version = None
                    try: cuda_version = torch.version.cuda
                    except: pass
                        
                    return {
                        "backend": "cuda",
                        "device": device_name,
                        "vram_mb": vram_mb,
                        "cuda_version": cuda_version,
                        "driver_version": self._get_nvidia_driver_version()
                    }
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"CUDA detection failed: {e}")
        return None
    
    def _detect_rocm(self) -> Optional[Dict]:
        """Detect ROCm-capable AMD GPU"""
        try:
            import torch
            # Check for ROCm via PyTorch HIP support
            if hasattr(torch, 'version') and hasattr(torch.version, 'hip') and torch.version.hip:
                device_count = torch.cuda.device_count() if torch.cuda.is_available() else 0
                if device_count > 0:
                    device_name = torch.cuda.get_device_name(0)
                    vram_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
                    
                    return {
                        "backend": "rocm",
                        "device": device_name,
                        "vram_mb": vram_mb,
                        "rocm_version": torch.version.hip
                    }
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"ROCm detection failed: {e}")
            
        # Fallback CLI check
        try:
            result = subprocess.run(['rocminfo'], capture_output=True, text=True)
            if result.returncode == 0:
                return {
                    "backend": "rocm",
                    "device": "AMD GPU (ROCm)",
                    "vram_mb": 4096, # Fallback
                    "rocm_version": self._get_rocm_version()
                }
        except (FileNotFoundError, subprocess.SubprocessError):
            pass
        return None
    
    def _detect_metal(self) -> Optional[Dict]:
        """Detect Apple Silicon with Metal support"""
        try:
            import torch
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                # Estimate VRAM
                total_ram_gb = psutil.virtual_memory().total / (1024**3)
                metal_vram_gb = self._estimate_metal_vram(total_ram_gb)
                
                return {
                    "backend": "metal",
                    "device": "Apple Silicon (MPS)",
                    "vram_mb": int(metal_vram_gb * 1024),
                    "metal_support": True
                }
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"Metal detection failed: {e}")
        return None

    def _detect_sycl(self) -> Optional[Dict]:
        """Detect Intel XPU/SYCL"""
        try:
            import torch
            if hasattr(torch, 'xpu') and torch.xpu.is_available():
                device_name = torch.xpu.get_device_name(0)
                vram_mb = torch.xpu.get_device_properties(0).total_memory // (1024 * 1024)
                return {
                    "backend": "sycl",
                    "device": device_name,
                    "vram_mb": vram_mb,
                    "sycl_support": True
                }
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"SYCL detection failed: {e}")
        return None

    def _detect_vulkan(self) -> Optional[Dict]:
        """Detect Vulkan support (Generic GPU/CPU acceleration)"""
        try:
            # Check for vulkaninfo
            result = subprocess.run(['vulkaninfo', '--summary'], capture_output=True, text=True)
            if result.returncode == 0:
                # Basic check passed
                return {
                    "backend": "vulkan",
                    "device": "Vulkan Device",
                    "vulkan_support": True
                }
        except (FileNotFoundError, subprocess.SubprocessError):
            pass
        return None
    
    def _estimate_metal_vram(self, total_ram_gb: float) -> float:
        """Estimate available Metal VRAM based on system RAM"""
        if total_ram_gb >= 64: return min(48.0, total_ram_gb * 0.75)
        elif total_ram_gb >= 32: return min(24.0, total_ram_gb * 0.75)
        else: return min(total_ram_gb * 0.65, total_ram_gb - 2) # Leave 2GB for OS
    
    def _get_nvidia_driver_version(self) -> Optional[str]:
        try:
            return subprocess.run(['nvidia-smi', '--query-gpu=driver_version', '--format=csv,noheader'], 
                                  capture_output=True, text=True).stdout.strip()
        except: return None
    
    def _get_rocm_version(self) -> Optional[str]:
        try:
            return subprocess.run(['rocminfo', '--version'], capture_output=True, text=True).stdout.strip()
        except: return None
    
    def get_available_backends(self) -> List[str]:
        if not self._available_backends: self.detect_hardware()
        return self._available_backends.copy()

    def get_torch_device(self) -> str:
        """Get PyTorch device string"""
        if not self._detected_hardware: self.detect_hardware()
        backend = self._detected_hardware["backend"]
        
        if backend == "cuda" or backend == "rocm": return "cuda"
        if backend == "metal": return "mps"
        if backend == "sycl": return "xpu"
        # PyTorch Vulkan support is experimental/limited, default to CPU for torch ops
        # Llama.cpp can still use Vulkan
        return "cpu"

    def get_llamacpp_settings(self) -> Dict[str, Any]:
        """Get optimal settings for llama-cpp-python"""
        if not self._detected_hardware: self.detect_hardware()
        backend = self._detected_hardware["backend"]
        
        # Optimize thread count: Use physical cores if possible
        # psutil.cpu_count(logical=False) returns physical cores
        # If None (failure), fall back to logical count
        physical_cores = psutil.cpu_count(logical=False) or psutil.cpu_count()
        # Reserve 1-2 cores for OS/Python overhead
        n_threads = max(1, physical_cores - 2 if physical_cores > 4 else physical_cores - 1)

        settings = {
            "n_gpu_layers": 0,
            "main_gpu": 0,
            "use_mmap": True,
            "use_mlock": False,
            "n_threads": n_threads,
            "n_threads_batch": n_threads, # Use same threads for batch processing
            "flash_attn": False # Default off, enabled by service based on backend
        }
        
        if backend in ["cuda", "rocm", "metal", "sycl", "vulkan"]:
            settings["n_gpu_layers"] = -1  # Offload all layers
            # Enable Flash Attention for GPU backends (massive speedup)
            settings["flash_attn"] = True
            
        return settings


# Global instance
_hardware_detector = HardwareDetector()

def detect_hardware() -> Dict:
    return _hardware_detector.detect_hardware()

def get_torch_device() -> str:
    return _hardware_detector.get_torch_device()

def get_llamacpp_settings() -> Dict[str, Any]:
    return _hardware_detector.get_llamacpp_settings()

def get_hardware_status() -> Dict:
    status = detect_hardware()
    # Circular import prevention if quantization needs hardware
    try:
        from .quantization import recommended_quants_for_backend
        status["recommended_quants"] = recommended_quants_for_backend(status["backend"])
    except ImportError:
        status["recommended_quants"] = []
    return status


def check_gguf_compatibility(model_path: str) -> Dict:
    """
    Check hardware compatibility for GGUF model
    
    Args:
        model_path: Path to GGUF model file
        
    Returns:
        Dictionary with compatibility info matching what gguf.py expects
    """
    import os
    from pathlib import Path
    
    # Get hardware info
    hardware = detect_hardware()
    
    # Initialize result structure
    result = {
        "compatible": True,
        "warnings": [],
        "requirements": {
            "vram_gb_required": 0,
            "cpu_ram_gb_required": 0,
            "note": "Estimates based on model size"
        },
        "hardware": {
            "gpu_available": hardware["backend"] != "cpu",
            "gpu_vram_gb": hardware.get("vram_mb", 0) / 1024,
            "cpu_ram_gb": hardware.get("system_ram_mb", 0) / 1024
        }
    }
    
    try:
        # Check if file exists
        if not os.path.exists(model_path):
            result["compatible"] = False
            result["warnings"].append(f"Model file not found: {model_path}")
            return result
        
        # Get file size
        file_size_bytes = Path(model_path).stat().st_size
        file_size_gb = file_size_bytes / (1024**3)
        
        # Estimate VRAM requirements (rough estimate: 2x file size for inference)
        vram_required_gb = file_size_gb * 2.0
        
        # Estimate CPU RAM requirements (rough estimate: 1.5x file size)
        cpu_ram_required_gb = file_size_gb * 1.5
        
        # Update requirements
        result["requirements"]["vram_gb_required"] = round(vram_required_gb, 2)
        result["requirements"]["cpu_ram_gb_required"] = round(cpu_ram_required_gb, 2)
        
        # Check if we have enough VRAM
        if hardware["backend"] != "cpu":
            available_vram_gb = hardware.get("vram_mb", 0) / 1024
            if vram_required_gb > available_vram_gb:
                result["warnings"].append(
                    f"Model may not fit in GPU VRAM: {vram_required_gb:.1f}GB required, "
                    f"{available_vram_gb:.1f}GB available"
                )
                # Not necessarily incompatible, just a warning
        
        # Check if we have enough CPU RAM
        available_cpu_ram_gb = hardware.get("system_ram_mb", 0) / 1024
        if cpu_ram_required_gb > available_cpu_ram_gb:
            result["warnings"].append(
                f"Model may exceed available RAM: {cpu_ram_required_gb:.1f}GB required, "
                f"{available_cpu_ram_gb:.1f}GB available"
            )
        
        # Check file extension
        if not model_path.lower().endswith('.gguf'):
            result["warnings"].append("File does not have .gguf extension")
        
        # Try to get quantization info from filename
        filename = Path(model_path).name.upper()
        quant_types = ['Q8', 'Q6', 'Q5', 'Q4', 'Q3', 'Q2', 'FP16', 'BF16']
        quant_found = None
        for quant in quant_types:
            if quant in filename:
                quant_found = quant
                break
        
        if quant_found:
            # Add quantization info to requirements
            result["requirements"]["quantization"] = quant_found
            
            # Check if quantization is appropriate for hardware
            if hardware["backend"] == "cpu" and quant_found in ['FP16', 'BF16']:
                result["warnings"].append(
                    f"{quant_found} quantization is optimized for GPU, may be slow on CPU"
                )
        
        # Check model size category
        if file_size_gb > 20:
            result["warnings"].append("Very large model (>20GB), may be slow to load")
        elif file_size_gb > 10:
            result["warnings"].append("Large model (>10GB), ensure sufficient resources")
        
        logger.info(f"GGUF compatibility check for {Path(model_path).name}: "
                   f"{'Compatible' if result['compatible'] else 'Incompatible'}, "
                   f"{len(result['warnings'])} warnings")
        
    except Exception as e:
        logger.error(f"Error checking GGUF compatibility: {e}")
        result["warnings"].append(f"Error during compatibility check: {str(e)}")
    
    return result
