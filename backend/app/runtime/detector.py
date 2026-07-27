"""
Runtime Detector
Detects installed runtimes on the system.
"""
import os
import shutil
import logging
import subprocess
from typing import Dict, List, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class RuntimeType(str, Enum):
    """Runtime types supported by LM-WebUI."""
    OLLAMA = "ollama"
    GGUF = "gguf"  # llama-cpp-python
    MLX = "mlx"
    VLLM = "vllm"
    COMFYUI = "comfyui"


class RuntimeDetector:
    """
    Detects installed runtimes on the system.
    
    Detection methods:
    - CLI commands (ollama, docker)
    - Python packages (mlx, llama-cpp)
    - Running services (localhost ports)
    """
    
    # Runtime detection configurations
    RUNTIME_CONFIGS = {
        RuntimeType.OLLAMA: {
            "type": "local_binary",
            "commands": ["ollama"],
            "ports": [11434],
            "install_hint": "Run: curl -fsSL https://ollama.ai/install.sh | sh"
        },
        RuntimeType.GGUF: {
            "type": "python_package",
            "packages": ["llama_cpp"],
            "models_dir": "models",
            "install_hint": "pip install llama-cpp-python"
        },
        RuntimeType.MLX: {
            "type": "python_package",
            "packages": ["mlx"],
            "install_hint": "pip install mlx mlx-lm && pip install mlx-optiq"
        },
        
        
        RuntimeType.VLLM: {
            "type": "python_package",
            "packages": ["vllm"],
            "install_hint": "pip install vllm"
        },
        RuntimeType.COMFYUI: {
            "type": "local_binary",
            "commands": [],
            "ports": [8188],
            "install_hint": "git clone https://github.com/comfyanonymous/ComfyUI && cd ComfyUI && pip install -r requirements.txt"
        }
    }
    
    def detect_all(self) -> Dict[str, Dict]:
        """
        Detect all runtimes.
        
        Returns:
            Dict mapping runtime type -> detection info
        """
        results = {}
        
        for runtime_type in RuntimeType:
            info = self.detect(runtime_type)
            if info["installed"]:
                results[runtime_type.value] = info
        
        return results
    
    def detect(self, runtime_type: RuntimeType) -> Dict:
        """
        Detect a specific runtime.
        
        Args:
            runtime_type: The runtime to detect
            
        Returns:
            status and details Dict with installation
        """
        config = self.RUNTIME_CONFIGS.get(runtime_type)
        if not config:
            return {
                "installed": False,
                "type": runtime_type.value,
                "error": "Unknown runtime type"
            }
        
        result = {
            "type": runtime_type.value,
            "installed": False,
            "version": None,
            "path": None,
            "port": None,
            "status": "not_installed"
        }
        
        # Try different detection methods based on runtime type
        detection_method = config.get("type", "local_binary")
        
        if detection_method == "local_binary":
            self._detect_binary(config, result)
        elif detection_method == "python_package":
            self._detect_package(config, result)
        elif detection_method == "docker":
            self._detect_docker(config, result)
        
        return result
    
    def _detect_binary(self, config: Dict, result: Dict) -> None:
        """Detect local binary runtime."""
        commands = config.get("commands", [])
        
        for cmd in commands:
            # Check if command exists
            path = shutil.which(cmd)
            if path:
                result["installed"] = True
                result["path"] = path
                result["status"] = "available"
                
                # Try to get version
                try:
                    version = subprocess.run(
                        [cmd, "--version"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if version.returncode == 0:
                        result["version"] = version.stdout.strip()
                except Exception:
                    pass
                
                break
        
        # Check ports if still not found
        if not result["installed"]:
            ports = config.get("ports", [])
            for port in ports:
                if self._is_port_open(port):
                    result["installed"] = True
                    result["port"] = port
                    result["status"] = "running"
                    break
    
    def _detect_package(self, config: Dict, result: Dict) -> None:
        """Detect Python package runtime."""
        packages = config.get("packages", [])
        
        for pkg in packages:
            try:
                # Try to import the package
                __import__(pkg.replace("-", "_"))
                result["installed"] = True
                result["status"] = "available"
                
                # Try to get version
                try:
                    import importlib.metadata
                    version = importlib.metadata.version(pkg)
                    result["version"] = version
                except Exception:
                    pass
                
                break
            except ImportError:
                continue
        
        # Check models directory for GGUF
        if not result["installed"] and config.get("models_dir"):
            models_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "..",
                config["models_dir"]
            )
            if os.path.exists(models_dir):
                gguf_files = [
                    f for f in os.listdir(models_dir)
                    if f.endswith(".gguf")
                ]
                if gguf_files:
                    result["installed"] = True
                    result["status"] = "available"
                    result["models_count"] = len(gguf_files)
    
    def _detect_docker(self, config: Dict, result: Dict) -> None:
        """Detect Docker container runtime."""
        containers = config.get("containers", [])
        
        # Check if docker is available
        if not shutil.which("docker"):
            result["status"] = "docker_not_available"
            return
        
        for container in containers:
            try:
                result_check = subprocess.run(
                    ["docker", "ps", "--filter", f"name={container}", "--format", "{{.Names}}"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if container in result_check.stdout:
                    result["installed"] = True
                    result["status"] = "running"
                    break
            except Exception:
                continue
        
        # Check ports
        if not result["installed"]:
            ports = config.get("ports", [])
            for port in ports:
                if self._is_port_open(port):
                    result["installed"] = True
                    result["port"] = port
                    result["status"] = "running"
                    break
    
    def _is_port_open(self, port: int) -> bool:
        """Check if a port is open."""
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        try:
            result = sock.connect_ex(("localhost", port))
            sock.close()
            return result == 0
        except Exception:
            return False
    
    def get_detection_info(self, runtime_type: RuntimeType) -> Dict:
        """Get detection info including install hints."""
        config = self.RUNTIME_CONFIGS.get(runtime_type, {})
        return {
            "type": runtime_type.value,
            "detection_method": config.get("type", "unknown"),
            "install_hint": config.get("install_hint", "Please install this runtime"),
            "commands": config.get("commands", []),
            "ports": config.get("ports", [])
        }


# Singleton instance
_detector: Optional[RuntimeDetector] = None


def get_runtime_detector() -> RuntimeDetector:
    """Get the runtime detector instance."""
    global _detector
    if _detector is None:
        _detector = RuntimeDetector()
    return _detector
