"""
Runtime Installer — executes host-level runtime installs via subprocess.
Runs on native host — subprocess.run() works directly.
"""
import logging
import shutil
import subprocess
import sys
from typing import Dict, Optional
from .detector import RuntimeType

logger = logging.getLogger(__name__)


def _venv_pip(subcommand: str) -> str:
    """A pip command that targets this service's own venv.

    Never a bare `pip`: these run with shell=True, so `pip` resolves to whatever is first on
    PATH — on macOS that is Homebrew's python, which refuses outright (PEP 668
    externally-managed-environment) and would install into the wrong interpreter anyway.
    `python -m pip` is not enough either: install.sh builds the venv with uv, which ships no
    pip of its own, so prefer uv against our interpreter and keep `-m pip` for pip-based venvs.
    """
    if shutil.which("uv"):
        return f"uv pip {subcommand} --python {sys.executable}"
    # pip prompts before uninstalling; uv has no -y and does not need one.
    return f"{sys.executable} -m pip {subcommand}{' -y' if subcommand.startswith('uninstall') else ''}"


class RuntimeInstaller:
    """Installs runtimes on the host via subprocess."""

    INSTALL_COMMANDS = {
        "mlx": (_venv_pip("install mlx mlx-lm mlx-optiq"),),
        "comfyui": ("git clone https://github.com/comfyanonymous/ComfyUI ~/ComfyUI", f"{sys.executable} -m pip install -r ~/ComfyUI/requirements.txt",),
    }

    UNINSTALL_COMMANDS = {
        "mlx": (_venv_pip("uninstall mlx mlx-lm mlx-optiq"),),
        "comfyui": ("rm -rf ~/ComfyUI",),
    }

    START_COMMANDS = {
        "comfyui": ("cd ~/ComfyUI && python main.py --port 8188 --listen 0.0.0.0 &",),
    }

    STOP_COMMANDS = {
        "comfyui": ("kill $(lsof -ti:8188) 2>/dev/null || true",),
    }

    def _run(self, cmd: str, timeout: int = 600) -> Dict:
        """Run a shell command and return structured result."""
        logger.info(f"Running: {cmd}")
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            if result.returncode != 0:
                return {"success": False, "error": f"Command failed: {cmd}\n{result.stderr[:500]}", "command": cmd}
            return {"success": True, "command": cmd}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"Command timed out: {cmd}", "command": cmd}
        except Exception as e:
            return {"success": False, "error": str(e), "command": cmd}

    def install_gguf_gpu(self) -> Dict:
        """Rebuild llama-cpp-python with GPU flags based on detected hardware."""
        from app.hardware.detection import detect_gpu_cli
        gpu = detect_gpu_cli()
        if not gpu:
            return {"success": False, "error": "No GPU detected on this system"}
        # Find the venv python
        import os
        venv_python = os.path.expanduser("~/.lmwebui/.venv/bin/python")
        if os.path.exists(venv_python):
            cmd = f"CMAKE_ARGS='{gpu['flags']}' FORCE_CMAKE=1 {venv_python} -m pip install llama-cpp-python --upgrade --force-reinstall"
        else:
            cmd = f"CMAKE_ARGS='{gpu['flags']}' FORCE_CMAKE=1 pip install llama-cpp-python --upgrade --force-reinstall"
        result = self._run(cmd, timeout=900)
        if result["success"]:
            result["message"] = f"llama-cpp-python rebuilt with {gpu['backend']} ({gpu['device']})"
        return result

    def install(self, runtime_type: str) -> Dict:
        """Install a runtime on the host. Returns success/error."""
        cmds = self.INSTALL_COMMANDS.get(runtime_type)
        if not cmds:
            return {"success": False, "error": f"No install command for {runtime_type}"}
        for cmd in cmds:
            logger.info(f"Running: {cmd}")
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=600)
                if result.returncode != 0:
                    return {"success": False, "error": f"Command failed: {cmd}\n{result.stderr[:500]}", "command": cmd}
            except subprocess.TimeoutExpired:
                return {"success": False, "error": f"Command timed out: {cmd}", "command": cmd}
            except Exception as e:
                return {"success": False, "error": str(e), "command": cmd}
        return {"success": True, "runtime_type": runtime_type}

    def uninstall(self, runtime_type: str) -> Dict:
        """Uninstall a runtime from the host."""
        cmds = self.UNINSTALL_COMMANDS.get(runtime_type)
        if not cmds:
            return {"success": False, "error": f"No uninstall command for {runtime_type}"}
        for cmd in cmds:
            try:
                subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
            except Exception as e:
                logger.warning(f"Uninstall command warning: {e}")
        return {"success": True, "runtime_type": runtime_type}

    def start(self, runtime_type: str) -> Dict:
        """Start a runtime process."""
        cmds = self.START_COMMANDS.get(runtime_type)
        if not cmds:
            return {"success": False, "error": f"No start command for {runtime_type}"}
        for cmd in cmds:
            subprocess.Popen(cmd, shell=True)
        return {"success": True, "runtime_type": runtime_type}

    def stop(self, runtime_type: str) -> Dict:
        """Stop a runtime process."""
        cmds = self.STOP_COMMANDS.get(runtime_type)
        if not cmds:
            return {"success": False, "error": f"No stop command for {runtime_type}"}
        for cmd in cmds:
            subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return {"success": True, "runtime_type": runtime_type}


# Singleton
_installer: Optional[RuntimeInstaller] = None


def get_runtime_installer() -> RuntimeInstaller:
    global _installer
    if _installer is None:
        _installer = RuntimeInstaller()
    return _installer
