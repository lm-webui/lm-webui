"""
Vision Runtime — manages a `llama-server` subprocess serving a vision bundle.

A vision bundle lives at `models/vision/<model>/` and contains:
    <model>.gguf      (main LLM)
    mmproj.gguf       (multimodal projector)

The runtime launches llama-server with `--model <main> --mmproj <mmproj>`
and exposes an OpenAI-compatible `/v1/chat/completions` endpoint that the
vision provider calls. Graceful if the binary or bundle is unavailable.
"""
import logging
import os
import shutil
import subprocess
import asyncio
from pathlib import Path
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)

VISION_PORT = int(os.getenv("VISION_PORT", "8081"))


class VisionRuntime:
    def __init__(self, port: int = VISION_PORT):
        self.model = ""  # configured vision model (e.g. "Qwen3-VL-2B-Instruct-1M-Q4_K_M")
        self._port = port
        self._process: Optional[subprocess.Popen] = None

    # ── Bundle resolution ──────────────────────────────────────────────
    def _bundle_folder(self) -> Optional[Path]:
        from app.services.gguf_manager import get_models_base
        name = Path(self.model or "").name  # last segment
        name = name[:-len(".gguf")] if name.endswith(".gguf") else name
        if not name:
            return None
        folder = get_models_base() / "vision" / name
        return folder if folder.is_dir() else None

    def resolve_bundle(self) -> Optional[dict]:
        """Return {main, mmproj} paths if a complete vision bundle exists."""
        folder = self._bundle_folder()
        if not folder:
            return None
        mains = [f for f in folder.iterdir()
                 if f.suffix.lower() == ".gguf" and "mmproj" not in f.name.lower()]
        mmprojs = [f for f in folder.iterdir()
                   if f.suffix.lower() == ".gguf" and "mmproj" in f.name.lower()]
        mmproj = mmprojs[0] if mmprojs else (folder / "mmproj.gguf")
        if not mains or not mmproj.exists():
            return None
        return {"main": mains[0], "mmproj": mmproj}

    # ── Lifecycle ──────────────────────────────────────────────────────
    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self._port}/v1"

    async def start(self) -> bool:
        if self.running:
            return True
        bundle = self.resolve_bundle()
        if not bundle:
            logger.warning("Vision bundle not found for model %r", self.model)
            return False
        server_bin = shutil.which("llama-server")
        if not server_bin:
            logger.warning("llama-server binary not found on PATH")
            return False
        logger.info("Launching llama-server for %s (mmproj: %s)", bundle["main"].name, bundle["mmproj"].name)
        self._process = subprocess.Popen(
            [
                server_bin,
                "--model", str(bundle["main"]),
                "--mmproj", str(bundle["mmproj"]),
                "--host", "127.0.0.1",
                "--port", str(self._port),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait for the health endpoint.
        for _ in range(120):
            if not self.running:
                return False
            if await self._healthy():
                logger.info("Vision runtime ready on %s", self.base_url)
                return True
            await asyncio.sleep(1)
        logger.warning("Vision runtime not ready (timed out)")
        return False

    async def _healthy(self) -> bool:
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"http://127.0.0.1:{self._port}/health", timeout=3) as r:
                    return r.status == 200
        except Exception:
            return False

    def stop(self) -> None:
        if self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
            logger.info("Vision runtime stopped")


# Global singleton
vision_runtime = VisionRuntime()
