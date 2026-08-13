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
VISION_NGL = os.getenv("VISION_NGL", "99")                   # GPU layers: an exact number (llama-server rejects 'auto'/'-1')
VISION_FLASH_ATTN = os.getenv("VISION_FLASH_ATTN", "on")     # FlashAttention on/off/auto
VISION_CACHE_K = os.getenv("VISION_CACHE_K", "q8_0")         # quantized KV cache → speed + memory
VISION_CACHE_V = os.getenv("VISION_CACHE_V", "q8_0")


def _ngl_value(raw: str) -> str:
    """llama-server's --ngl/--gpu-layers requires a number; coerce bad env values."""
    v = (raw or "99").strip().lower()
    if v in ("", "auto", "all", "-1", "none"):
        return "99"
    return v


class VisionRuntime:
    def __init__(self, port: int = VISION_PORT):
        self.model = ""  # configured vision model (e.g. "Qwen3-VL-2B-Instruct-1M-Q4_K_M")
        self._port = port
        self._process: Optional[subprocess.Popen] = None
        self._active_model = ""  # model currently loaded into llama-server
        self._stderr: Optional[object] = None
        self._lock = asyncio.Lock()
        self.last_error: str = ""

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
            # Fallback: any complete bundle (main GGUF + mmproj) so vision works out of the box
            # once a bundle is installed, even if the configured model string doesn't match.
            for d in vision_root.iterdir():
                if d.is_dir():
                    mains = [f for f in d.iterdir() if f.suffix.lower() == ".gguf" and "mmproj" not in f.name.lower()]
                    mmprojs = [f for f in d.iterdir() if f.suffix.lower() == ".gguf" and "mmproj" in f.name.lower()]
                    if mains and (mmprojs or (d / "mmproj.gguf").exists()):
                        return d
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

    def _tunables(self) -> dict:
        """Resolve launch knobs: config.yaml `vision:` section, overridden by VISION_* env vars."""
        try:
            from app.core.config_manager import get_config
            v = get_config().vision
            return {
                "port": int(os.getenv("VISION_PORT", str(v.port))),
                "ctx_size": int(os.getenv("VISION_CTX", str(v.ctx_size))),
                "ngl": _ngl_value(os.getenv("VISION_NGL", str(v.gpu_layers))),
                "flash_attn": os.getenv("VISION_FLASH_ATTN", v.flash_attn),
                "cache_k": os.getenv("VISION_CACHE_K", v.cache_type_k),
                "cache_v": os.getenv("VISION_CACHE_V", v.cache_type_v),
            }
        except Exception:
            return {
                "port": VISION_PORT,
                "ctx_size": VISION_CTX,
                "ngl": _ngl_value(VISION_NGL),
                "flash_attn": VISION_FLASH_ATTN,
                "cache_k": VISION_CACHE_K,
                "cache_v": VISION_CACHE_V,
            }

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
            t = self._tunables()
            self._port = t["port"]
            bundle = self.resolve_bundle()
            if not bundle:
                self.last_error = f"no vision bundle found for model {self.model!r}"
                logger.warning(self.last_error)
                return False
            server_bin = shutil.which("llama-server")
            if not server_bin:
                self.last_error = "llama-server binary not found on PATH"
                logger.warning(self.last_error)
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
                    "--ctx-size", str(t["ctx_size"]),
                    # --gpu-layers (not --ngl): llama-server v10330 rejects the --ngl alias.
                    "--gpu-layers", t["ngl"],
                    "--flash-attn", t["flash_attn"],
                    "--cache-type-k", t["cache_k"],
                    "--cache-type-v", t["cache_v"],
                ],
                stdout=subprocess.DEVNULL,
                stderr=self._stderr,
            )
            # Wait for the health endpoint; exit early if the process dies.
            for _ in range(60):
                if not self.running:
                    self.last_error = self._last_log_lines(log_path)
                    logger.warning("Vision llama-server exited early: %s", self.last_error)
                    return False
                if await self._healthy():
                    self._active_model = self.model
                    self.last_error = ""
                    logger.info("Vision runtime ready on %s", self.base_url)
                    return True
                await asyncio.sleep(1)
            self.last_error = self._last_log_lines(log_path)
            logger.warning("Vision runtime not ready (timed out) — %s", self.last_error)
            return False

    @staticmethod
    def _last_log_lines(log_path: Path, n: int = 6) -> str:
        """Return the last few lines of the llama-server log for diagnosis."""
        try:
            if log_path.exists():
                lines = log_path.read_text(errors="ignore").splitlines()
                return " | ".join(lines[-n:])
        except Exception:
            pass
        return "see llama-server.log"

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
