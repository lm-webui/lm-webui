"""
Local Image Runtime — manages ComfyUI lifecycle (detect, install, launch).
Integrates with the existing runtime module for hardware detection.
"""
import logging
import os
import subprocess
import shutil
import asyncio
from typing import Optional
from app.runtime.detector import RuntimeDetector, RuntimeType

logger = logging.getLogger(__name__)

COMFYUI_DIR = os.path.expanduser(os.getenv("COMFYUI_DIR", "~/ComfyUI"))
COMFYUI_PORT = int(os.getenv("COMFYUI_PORT", "8188"))


class ComfyUIRuntime:
    """Manage a local ComfyUI instance."""

    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._detector = RuntimeDetector()

    @property
    def installed(self) -> bool:
        """Check if ComfyUI is installed."""
        main_py = os.path.join(COMFYUI_DIR, "main.py")
        return os.path.isfile(main_py)

    @property
    def running(self) -> bool:
        """Check if ComfyUI process is alive."""
        return self._process is not None and self._process.poll() is None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{COMFYUI_PORT}"

    async def install(self) -> bool:
        """Clone and install ComfyUI."""
        if self.installed:
            logger.info("ComfyUI already installed")
            return True

        logger.info("Installing ComfyUI...")
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "clone", "https://github.com/comfyanonymous/ComfyUI.git", COMFYUI_DIR,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            if proc.returncode != 0:
                logger.error("Failed to clone ComfyUI")
                return False

            # Install Python deps
            req_file = os.path.join(COMFYUI_DIR, "requirements.txt")
            if os.path.isfile(req_file):
                proc = await asyncio.create_subprocess_exec(
                    "pip", "install", "-r", req_file,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                )
                await proc.communicate()

            logger.info("ComfyUI installed successfully")
            return True
        except Exception as e:
            logger.error(f"ComfyUI install failed: {e}")
            return False

    async def launch(self) -> bool:
        """Launch ComfyUI as a managed subprocess."""
        if self.running:
            logger.info("ComfyUI already running")
            return True

        if not self.installed:
            logger.warning("ComfyUI not installed")
            return False

        # Detect hardware for GPU flags
        gpu_flags = []
        if self._detector.detect() == RuntimeType.CUDA:
            gpu_flags = ["--force-fp16"]
        elif self._detector.detect() == RuntimeType.METAL:
            gpu_flags = ["--force-fp16"]

        try:
            self._process = subprocess.Popen(
                ["python", "main.py", f"--port={COMFYUI_PORT}", *gpu_flags],
                cwd=COMFYUI_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info(f"ComfyUI launched on port {COMFYUI_PORT}")
            return True
        except Exception as e:
            logger.error(f"Failed to launch ComfyUI: {e}")
            return False

    def stop(self):
        """Stop ComfyUI."""
        if self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
            logger.info("ComfyUI stopped")

    def get_status(self) -> dict:
        """Get runtime status for UI display."""
        return {
            "installed": self.installed,
            "running": self.running,
            "url": self.url,
            "port": COMFYUI_PORT,
        }


# Global singleton
comfyui_runtime = ComfyUIRuntime()
