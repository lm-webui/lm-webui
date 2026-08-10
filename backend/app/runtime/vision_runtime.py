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
# Speed/perf flags for the vision llama-server subprocess (independent of the GGUF text backend).
VISION_CTX = int(os.getenv("VISION_CTX", "8192"))            # context for image tokens (not a speed lever)
VISION_NGL = int(os.getenv("VISION_NGL", "-1"))              # GPU layers (-1 = all) — big speed win
VISION_FLASH_ATTN = os.getenv("VISION_FLASH_ATTN", "on")     # FlashAttention on/off/auto
VISION_CACHE_K = os.getenv("VISION_CACHE_K", "q8_0")         # quantized KV cache → speed + memory
VISION_CACHE_V = os.getenv("VISION_CACHE_V", "q8_0")


class VisionRuntime:
    def __init__(self, port: int = VISION_PORT):
        self.model = ""  # configured vision model (e.g. "Qwen3-VL-2B-Instruct-1M-Q4_K_M")
        self._port = port
        self._process: Optional[subprocess.Popen] = None
        self._active_model = ""  # model currently loaded into llama-server
        self._stderr: Optional[object] = None
        self._lock = asyncio.Lock()

    # ── Bundle resolution ──────────────────────────────────────────────
    def _bundle_folder(self) -> Optional[Path]:
        from app.services.gguf_manager import get_models_base
        vision_root = get_models_base() / "vision"
        raw = (self.model or "").replace("\\", "/")
        name = raw.split("/")[-1]
        name = name[:-len(".gguf")] if name.lower().endswith(".gguf") else name
        if not name:
            return None
        folder = vision_root / name
        if folder.is_dir():
            return folder
        # Tolerant: match a bundle whose dir name is a (case-insensitive) substring of the model ref,
        # or vice versa — pick the longest match.
        if vision_root.is_dir():
            best, best_len = None, -1
            low = raw.lower()
            for d in vision_root.iterdir():
                if d.is_dir():
                    dn = d.name.lower()
                    if dn and (dn in low or low in dn) and len(dn) > best_len:
                        best, best_len = d, len(dn)
            if best is not None:
                return best
        return None

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
        # Fast path: already running with the requested model.
        if self.running and self._active_model == self.model:
            return True
        async with self._lock:
            if self.running and self._active_model == self.model:
                return True
            if self.running:
                # Model changed — stop and reload so the correct bundle is served.
                self.stop()
            bundle = self.resolve_bundle()
            if not bundle:
                logger.warning("Vision bundle not found for model %r", self.model)
                return False
            server_bin = shutil.which("llama-server")
            if not server_bin:
                logger.warning("llama-server binary not found on PATH")
                return False
            # Capture llama-server stderr for diagnosis (failures surface in the log).
            log_path = Path(os.environ.get("LMWEBUI_HOME", str(Path.home() / ".lmwebui"))) / "logs" / "llama-server.log"
            try:
                log_path.parent.mkdir(parents=True, exist_ok=True)
                self._stderr = open(log_path, "a")
            except Exception:
                self._stderr = subprocess.DEVNULL
            logger.info("Launching llama-server for %s (mmproj: %s)", bundle["main"].name, bundle["mmproj"].name)
            self._process = subprocess.Popen(
                [
                    server_bin,
                    "--model", str(bundle["main"]),
                    "--mmproj", str(bundle["mmproj"]),
                    "--host", "127.0.0.1",
                    "--port", str(self._port),
                    "--ctx-size", str(VISION_CTX),
                    "--ngl", str(VISION_NGL),
                    "--flash-attn", VISION_FLASH_ATTN,
                    "--cache-type-k", VISION_CACHE_K,
                    "--cache-type-v", VISION_CACHE_V,
                ],
                stdout=subprocess.DEVNULL,
                stderr=self._stderr,
            )
            # Wait for the health endpoint; exit early if the process dies.
            for _ in range(60):
                if not self.running:
                    return False
                if await self._healthy():
                    self._active_model = self.model
                    logger.info("Vision runtime ready on %s", self.base_url)
                    return True
                await asyncio.sleep(1)
            logger.warning("Vision runtime not ready (timed out) — see %s", log_path)
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
            self._active_model = ""
            logger.info("Vision runtime stopped")


# Global singleton
vision_runtime = VisionRuntime()
