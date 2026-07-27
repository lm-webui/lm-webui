"""Deprecated in-container installer.

Runtime installation is now performed by ``lm-webui-host`` outside the
application container. This module remains only for migration compatibility.
"""
import os
import sys
import shutil
import logging
import subprocess
import asyncio
from typing import Dict, Optional
from .detector import RuntimeType, get_runtime_detector

logger = logging.getLogger(__name__)


class RuntimeInstaller:
    """
    Installs runtimes using CLI or Docker.
    
    Installation Methods:
    - CLI: curl/pip installers (primary for local runtimes)
    - Docker: Container runtime (optional for vector DB)
    """
    
    def __init__(self):
        self._detector = get_runtime_detector()
    
    async def install(
        self, 
        runtime_type: RuntimeType,
        **options
    ) -> Dict:
        """
        Install a runtime.
        
        Args:
            runtime_type: The runtime to install
            **options: Additional installation options
            
        Returns:
            Installation result
        """
        logger.info(f"Installing runtime: {runtime_type.value}")
        
        if runtime_type == RuntimeType.OLLAMA:
            return await self._install_ollama(**options)
        elif runtime_type == RuntimeType.GGUF:
            return await self._install_gguf(**options)
        elif runtime_type == RuntimeType.MLX:
            return await self._install_mlx(**options)
        elif runtime_type == RuntimeType.VLLM:
            return await self._install_vllm(**options)
        elif runtime_type == RuntimeType.COMFYUI:
            return await self._install_comfyui(**options)
        else:
            return {
                "success": False,
                "error": f"Unknown runtime type: {runtime_type}"
            }
    
    async def _install_ollama(self, **options) -> Dict:
        """Install Ollama using the official installer script."""
        try:
            # Check if already installed
            if shutil.which("ollama"):
                return {
                    "success": True,
                    "message": "Ollama is already installed",
                    "already_installed": True
                }
            
            # Run the installer script
            install_cmd = 'curl -fsSL https://ollama.ai/install.sh | sh'
            
            logger.info("Running Ollama installer...")
            result = subprocess.run(
                install_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minutes timeout
            )
            
            if result.returncode == 0:
                # Verify installation
                if shutil.which("ollama"):
                    return {
                        "success": True,
                        "message": "Ollama installed successfully",
                        "path": shutil.which("ollama")
                    }
            
            return {
                "success": False,
                "error": result.stderr or "Installation failed"
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Installation timed out"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _install_gguf(self, **options) -> Dict:
        """Install llama-cpp-python for GGUF support."""
        try:
            # Check if already installed
            try:
                import llama_cpp
                return {
                    "success": True,
                    "message": "llama-cpp-python is already installed",
                    "version": llama_cpp.__version__,
                    "already_installed": True
                }
            except ImportError:
                pass
            
            # Install via pip
            # Try Metal version first for Mac, otherwise CPU
            import platform
            extra = ""
            if platform.system() == "Darwin" and platform.machine() == "arm64":
                extra = "[metal]"
            
            cmd = f"pip install llama-cpp-python{extra}"
            
            logger.info(f"Running: {cmd}")
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=600  # 10 minutes for compilation
            )
            
            if result.returncode == 0:
                try:
                    import llama_cpp
                    return {
                        "success": True,
                        "message": "llama-cpp-python installed successfully",
                        "version": llama_cpp.__version__
                    }
                except ImportError:
                    pass
            
            return {
                "success": False,
                "error": result.stderr or "Installation failed"
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Installation timed out (compilation can take a while)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _install_mlx(self, **options) -> Dict:
        """Install MLX + mlx-lm + optiq for Apple Silicon."""
        try:
            import platform
            if platform.system() != "Darwin" or platform.machine() != "arm64":
                return {"success": False, "error": "MLX is only available on Apple Silicon Macs"}

            # Check each package
            missing = []
            try:
                import mlx
            except ImportError:
                missing.append("mlx")
            try:
                import mlx_lm
            except ImportError:
                missing.append("mlx-lm")
            try:
                import optiq
            except ImportError:
                missing.append("mlx-optiq")

            if not missing:
                return {"success": True, "message": "MLX stack already installed", "already_installed": True}

            cmds = []
            if "mlx" in missing or "mlx-lm" in missing:
                cmds.append("pip install mlx mlx-lm")
            if "mlx-optiq" in missing:
                cmds.append("pip install mlx-optiq")

            for cmd in cmds:
                logger.info(f"Running: {cmd}")
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
                if result.returncode != 0:
                    return {"success": False, "error": result.stderr or f"{cmd} failed"}

            return {"success": True, "message": "MLX + mlx-lm + optiq installed"}

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    
    async def _install_vllm(self, **options) -> Dict:
        """Install vLLM via pip."""
        try:
            import importlib
            if importlib.util.find_spec("vllm"):
                return {"success": True, "message": "vLLM is already installed", "already_installed": True}
        except ImportError:
            pass
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "vllm"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return {"success": True, "message": "vLLM installed successfully"}
        return {"success": False, "error": result.stderr or "pip install failed"}

    async def _install_comfyui(self, **options) -> Dict:
        """Install ComfyUI via git clone + pip."""
        comfy_dir = os.path.expanduser("~/ComfyUI")
        if os.path.isfile(os.path.join(comfy_dir, "main.py")):
            return {"success": True, "message": "ComfyUI is already installed", "already_installed": True}
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "clone", "https://github.com/comfyanonymous/ComfyUI.git", comfy_dir,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            if proc.returncode != 0:
                return {"success": False, "error": "Failed to clone ComfyUI repository"}
            pip_proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install", "-r", os.path.join(comfy_dir, "requirements.txt"),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await pip_proc.communicate()
            if pip_proc.returncode != 0:
                return {"success": False, "error": "pip install failed for ComfyUI requirements"}
            return {"success": True, "message": "ComfyUI installed successfully", "path": comfy_dir}
        except FileNotFoundError:
            return {"success": False, "error": "git is required to install ComfyUI"}

    
    async def uninstall(self, runtime_type: RuntimeType) -> Dict:
        """Uninstall a runtime."""
        logger.info(f"Uninstalling runtime: {runtime_type.value}")
        
        if runtime_type == RuntimeType.OLLAMA:
            return await self._uninstall_ollama()
        else:
            return {
                "success": False,
                "error": f"Cannot automatically uninstall {runtime_type.value}. Please uninstall manually."
            }
    
    async def _uninstall_ollama(self) -> Dict:
        """Uninstall Ollama."""
        try:
            if not shutil.which("ollama"):
                return {
                    "success": True,
                    "message": "Ollama is not installed"
                }
            
            # Note: Ollama doesn't have an official uninstaller
            # Provide instructions
            return {
                "success": False,
                "error": "Please uninstall Ollama manually",
                "install_hint": "rm -rf ~/.ollama"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    


# Singleton instance
_installer: Optional[RuntimeInstaller] = None


def get_runtime_installer() -> RuntimeInstaller:
    """Get the runtime installer instance."""
    global _installer
    if _installer is None:
        _installer = RuntimeInstaller()
    return _installer
