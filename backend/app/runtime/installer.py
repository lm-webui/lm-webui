"""
Runtime Installer — executes host-level runtime installs via subprocess.
Runs on native host — subprocess.run() works directly.
"""
import logging
import subprocess
import sys
from typing import Dict, Optional
from .detector import RuntimeType

logger = logging.getLogger(__name__)


class RuntimeInstaller:
    """Installs runtimes on the host via subprocess."""

    INSTALL_COMMANDS = {
        "mlx": ("pip install mlx mlx-lm mlx-optiq",),
        "comfyui": ("git clone https://github.com/comfyanonymous/ComfyUI ~/ComfyUI", f"{sys.executable} -m pip install -r ~/ComfyUI/requirements.txt",),
    }

    UNINSTALL_COMMANDS = {
        "mlx": ("pip uninstall mlx mlx-lm mlx-optiq -y",),
        "comfyui": ("rm -rf ~/ComfyUI",),
    }

    START_COMMANDS = {
        "comfyui": ("cd ~/ComfyUI && python main.py --port 8188 --listen 0.0.0.0 &",),
    }

    STOP_COMMANDS = {
        "comfyui": ("kill $(lsof -ti:8188) 2>/dev/null || true",),
    }

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
