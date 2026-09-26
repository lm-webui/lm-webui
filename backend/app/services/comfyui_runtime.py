"""ComfyUI Runtime — manages a headless ComfyUI server subprocess.

The managed engine, the way `llama-server` is for GGUF. The process shape mirrors
`app/runtime/vision_runtime.py`: one Popen handle, `running` is `poll() is None`, a health
loop that exits early when the child dies, and a log tail for diagnosis.

Layout (all under the app's managed root, never the user's home):

    <base_dir>/comfyui/                 engine (git clone, its own .venv)
    <base_dir>/comfyui/models/checkpoints/*.safetensors
    <base_dir>/logs/comfyui.log

ComfyUI gets a **dedicated venv** because it needs torch, which the app venv deliberately
does not carry — installing its requirements into `sys.executable` would drag ~2-5 GB of
torch into the backend's own interpreter.

The server binds 127.0.0.1 only. ComfyUI ships no authentication, so `--listen 0.0.0.0`
(which the retired shell command used) would expose a remote-code-execution surface to the
whole LAN via its /prompt endpoint.
"""
import asyncio
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8188


# ── Locations ─────────────────────────────────────────────────────────────

def engine_dir() -> Path:
    """Where the ComfyUI engine lives.

    `COMFYUI_DIR` env wins, then an explicit `comfyui.dir` in config, else the managed
    default under the app's root. Resolved fresh each call so tests and config reloads
    (e.g. LMWEBUI_BASE_DIR) are picked up.
    """
    override = os.getenv("COMFYUI_DIR", "").strip()
    if not override:
        try:
            from app.core.config_manager import get_config
            override = (get_config().comfyui.dir or "").strip()
        except Exception:
            override = ""
    if override:
        return Path(override).expanduser().resolve()
    from app.core.config_manager import get_base_dir
    return get_base_dir() / "comfyui"


def checkpoints_dir() -> Path:
    """ComfyUI's own checkpoint folder inside the managed engine."""
    return engine_dir() / "models" / "checkpoints"


def qwen_models_dir(kind: str) -> Path:
    return engine_dir() / "models" / {
        "diffusion": "diffusion_models",
        "text_encoder": "text_encoders",
        "vae": "vae",
    }[kind]


def venv_python() -> Path:
    """The engine venv's interpreter (torch lives here, not in the app venv)."""
    venv = engine_dir() / ".venv"
    if sys.platform == "win32":
        return venv / "Scripts" / "python.exe"
    return venv / "bin" / "python"


def log_path() -> Path:
    from app.core.config_manager import get_base_dir
    return get_base_dir() / "logs" / "comfyui.log"


def port() -> int:
    raw = os.getenv("COMFYUI_PORT", "")
    if not raw:
        try:
            from app.core.config_manager import get_config
            return int(get_config().comfyui.port)
        except Exception:
            return DEFAULT_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_PORT


# ── Runtime ───────────────────────────────────────────────────────────────

class ComfyUIRuntime:
    """Manages the ComfyUI server process for this app."""

    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._stderr: Optional[object] = None
        self._lock = asyncio.Lock()
        self.last_error: str = ""

    # ── State ──────────────────────────────────────────────────────────
    @property
    def installed(self) -> bool:
        """True when the engine has been cloned (independent of whether it is running)."""
        return (engine_dir() / "main.py").is_file()

    @property
    def has_venv(self) -> bool:
        return venv_python().is_file()

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def base_url(self) -> str:
        # Always loopback, and always the same value the process was started with.
        return f"http://127.0.0.1:{port()}"

    def checkpoints(self) -> List[str]:
        """Installed checkpoint filenames, from disk (works while stopped)."""
        directory = checkpoints_dir()
        if not directory.is_dir():
            return []
        return sorted(
            f.name for f in directory.iterdir()
            if f.is_file() and f.suffix.lower() in (".safetensors", ".ckpt")
        )

    # ── Launch ─────────────────────────────────────────────────────────
    def _gpu_flags(self) -> List[str]:
        """Map detected hardware to ComfyUI flags.

        Deliberately minimal: ComfyUI picks CUDA/MPS automatically from the torch build, so
        the only things worth forcing are the CPU-only case and a low-VRAM hint. Adding
        `--force-fp16` (as the retired code did for every GPU) would break FP32-only models.

        ponytail: a VRAM threshold, not a measurement — tune if users hit OOM on 6-8 GB cards.
        """
        try:
            from app.hardware.detection import detect_gpu_cli
            gpu = detect_gpu_cli()
        except Exception:
            gpu = None
        if not gpu:
            return ["--cpu"]
        vram = gpu.get("vram_gb") or 0
        if 0 < vram < 6:
            return ["--lowvram"]
        return []

    async def adopt_existing(self) -> bool:
        """True if something is already serving on our port.

        A ComfyUI child outlives the backend that spawned it — the app restarts (upgrade,
        crash, `lm-web-ui restart`) and the engine keeps running. Without this, the fresh
        backend reports `running: false` and `start()` would spawn a second instance on a
        port that is already bound, which fails in a confusing way.
        """
        return await self._healthy()

    async def start(self) -> bool:
        """Start the server and wait for it to answer /system_stats. Idempotent."""
        if self.running:
            return True
        if not self.installed:
            self.last_error = f"ComfyUI is not installed at {engine_dir()}"
            return False
        if not self.has_venv:
            self.last_error = (
                f"ComfyUI has no virtualenv at {venv_python()} — reinstall the runtime"
            )
            return False

        async with self._lock:
            if self.running:
                return True
            # Someone else's ComfyUI (ours from a previous backend, or an external one on
            # the same port) is already answering — use it rather than fight it for the port.
            if await self.adopt_existing():
                self.last_error = ""
                logger.info("ComfyUI already serving on %s — adopting", self.base_url)
                return True

            log = log_path()
            try:
                log.parent.mkdir(parents=True, exist_ok=True)
                self._stderr = open(log, "a")
            except Exception:
                self._stderr = subprocess.DEVNULL

            argv = [
                str(venv_python()), "main.py",
                "--port", str(port()),
                # Explicit, not inherited: ComfyUI's own default is 127.0.0.1, but this is a
                # security property and must not drift with an upstream default change.
                "--listen", "127.0.0.1",
                "--disable-auto-launch",
                "--disable-metadata",
                *self._gpu_flags(),
            ]
            logger.info("Launching ComfyUI: %s (cwd=%s)", " ".join(argv), engine_dir())
            try:
                self._process = subprocess.Popen(
                    argv,
                    cwd=str(engine_dir()),
                    stdout=subprocess.DEVNULL,
                    stderr=self._stderr,
                )
            except Exception as exc:
                self.last_error = f"Failed to launch ComfyUI: {exc}"
                logger.warning(self.last_error)
                return False

            timeout = 180
            try:
                from app.core.config_manager import get_config
                timeout = int(get_config().comfyui.startup_timeout_s)
            except Exception:
                pass

            # A cold start imports torch and loads no model, so this is slower than
            # llama-server's — hence the longer budget. Poll rather than sleep the whole way.
            for _ in range(timeout):
                if not self.running:
                    self.last_error = self._last_log_lines(log)
                    logger.warning("ComfyUI exited early: %s", self.last_error)
                    return False
                if await self._healthy():
                    self.last_error = ""
                    logger.info("ComfyUI ready on %s", self.base_url)
                    return True
                await asyncio.sleep(1)

            self.last_error = self._last_log_lines(log)
            logger.warning("ComfyUI not ready (timed out) — %s", self.last_error)
            return False

    def stop(self) -> None:
        if not self._process:
            return
        self._process.terminate()
        try:
            self._process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self._process.kill()
            try:
                self._process.wait(timeout=5)
            except Exception:
                pass
        self._process = None
        logger.info("ComfyUI stopped")

    # ── Health / info ──────────────────────────────────────────────────
    async def _healthy(self) -> bool:
        return (await self.system_stats()) is not None

    async def system_stats(self) -> Optional[Dict]:
        """GET /system_stats — readiness plus version and device info in one call.

        Returns None when the server is not answering. Preferred over `GET /` (which the
        old detector used): that returns an HTML page, so anything parsing it as JSON
        reported a running server as unreachable.
        """
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{self.base_url}/system_stats", timeout=3) as r:
                    if r.status != 200:
                        return None
                    return await r.json()
        except Exception:
            return None

    async def describe(self) -> Dict:
        """Everything the status route and the UI need, in one round trip.

        `running` means the server answers, not merely that we hold a Popen handle — a
        ComfyUI started by a previous backend process is still up and still ours to report.
        """
        stats = await self.system_stats() if (self.installed or self.running) else None

        described: Dict = {
            "installed": self.installed,
            "running": self.running or stats is not None,
            "ready": bool(stats),
            "port": port(),
            "endpoint": self.base_url,
            "engine_dir": str(engine_dir()),
            "checkpoints": self.checkpoints(),
            "last_error": self.last_error,
            "install_status": _install_state["status"],
            "hardware_backend": _install_state["hardware_backend"],
            "hardware_device": _install_state["hardware_device"],
            "version": None,
            "device": None,
            "vram_gb": None,
        }
        if not stats:
            return described
        described.update({
            "version": (stats.get("system") or {}).get("comfyui_version"),
            "device": ((stats.get("devices") or [{}])[0]).get("name"),
            "device_type": ((stats.get("devices") or [{}])[0]).get("type"),
            "vram_gb": round((((stats.get("devices") or [{}])[0]).get("vram_total") or 0)
                             / (1024 ** 3), 1) or None,
        })
        return described

    @staticmethod
    def _last_log_lines(log: Path, n: int = 8) -> str:
        """Tail the server log — the only place a failed import or missing dep shows up."""
        try:
            if log.exists():
                lines = log.read_text(errors="ignore").splitlines()
                return " | ".join(lines[-n:])
        except Exception:
            pass
        return f"see {log}"


# ── Model catalog ─────────────────────────────────────────────────────────
#
# The single source of truth for "which image model can I pick". Both the download route
# (routes/comfyui.py) and the generation path (services/local_image.py) read this. They used
# to hold independent ideas of the filename — generation built `"sdxl" + ".safetensors"` while
# the only preset installed `sd_xl_base_1.0.safetensors`, so every run failed validation.
#
# `filename` is the literal name ComfyUI sees in models/checkpoints and is what goes into the
# graph's ckpt_name. `default_*` are the sampler settings that suit each family.
MODEL_CATALOG: Dict[str, Dict] = {
    "sdxl": {
        "name": "SDXL Base 1.0",
        "filename": "sd_xl_base_1.0.safetensors",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
        "size": "~6.9 GB",
        "default_width": 1024,
        "default_height": 1024,
        "default_steps": 25,
    },
    "sd15": {
        "name": "Stable Diffusion 1.5",
        "filename": "v1-5-pruned-emaonly.safetensors",
        "url": "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
        "size": "~4 GB",
        "default_width": 512,
        "default_height": 512,
        "default_steps": 25,
    },
    "qwen-image-2.1-q4": {
        "name": "Qwen Image 2.1 (Q4_K_M)", "qwen": True,
        "filename": "qwen-image-2.1-Q4_K_M.gguf", "size": "~4.60 GB",
        "url": "https://huggingface.co/abenzerps/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q4_K_M.gguf",
        "default_width": 1024, "default_height": 1024, "default_steps": 25,
    },
    "qwen-image-2.1-q5": {
        "name": "Qwen Image 2.1 (Q5_K_M)", "qwen": True,
        "filename": "qwen-image-2.1-Q5_K_M.gguf", "size": "~5.22 GB",
        "url": "https://huggingface.co/abenzerps/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q5_K_M.gguf",
        "default_width": 1024, "default_height": 1024, "default_steps": 25,
    },
    "qwen-image-2.1-q6": {
        "name": "Qwen Image 2.1 (Q6_K)", "qwen": True,
        "filename": "qwen-image-2.1-Q6_K.gguf", "size": "~5.88 GB",
        "url": "https://huggingface.co/abenzerps/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q6_K.gguf",
        "default_width": 1024, "default_height": 1024, "default_steps": 25,
    },
}

QWEN_ASSETS: Dict[str, Dict] = {
    "qwen-image-text-encoder": {
        "name": "Qwen Image 2.1 text encoder", "filename": "qwen3vl_8b_int8_convrot.safetensors",
        "url": "https://huggingface.co/abenzerps/Qwen-Image-2.1-GGUF/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors",
        "kind": "text_encoder", "size": "~9.35 GB",
    },
    "qwen-image-vae": {
        "name": "Qwen Image 2.1 VAE", "filename": "qwen_image_2.1_vae_bf16.safetensors",
        "url": "https://huggingface.co/abenzerps/Qwen-Image-2.1-GGUF/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors",
        "kind": "vae", "size": "~676 MB",
    },
}


def qwen_asset_entries() -> List[Dict]:
    assets = list(QWEN_ASSETS.items())
    assets += [(key, {**value, "kind": "diffusion"}) for key, value in MODEL_CATALOG.items() if value.get("qwen")]
    return [{"id": key, **value} for key, value in assets]


def qwen_missing(model: str) -> List[str]:
    entry = MODEL_CATALOG.get((model or "").strip().lower())
    if not entry or not entry.get("qwen"):
        return []
    paths = [qwen_models_dir("diffusion") / entry["filename"]]
    paths += [qwen_models_dir(item["kind"]) / item["filename"] for item in QWEN_ASSETS.values()]
    return [str(path.relative_to(engine_dir())) for path in paths if not path.is_file()]


def available_models() -> List[str]:
    """Model values the image generator can resolve right now."""
    models = set(comfyui_runtime.checkpoints())
    models.update(key for key, entry in MODEL_CATALOG.items()
                 if entry.get("qwen") and not qwen_missing(key))
    return sorted(models)


def catalog_entries() -> List[Dict]:
    """Catalog in the shape the presets route/UI expect."""
    return [{"id": key, **meta} for key, meta in MODEL_CATALOG.items()]


def checkpoint_for(model: str) -> Optional[str]:
    """The checkpoint filename a model key requires, or None if the key is unknown."""
    entry = MODEL_CATALOG.get((model or "").strip().lower())
    return entry["filename"] if entry else None


# ── Install ───────────────────────────────────────────────────────────────

REPO = "https://github.com/comfyanonymous/ComfyUI"
GGUF_REPO = "https://github.com/city96/ComfyUI-GGUF"

# One install at a time, and the UI polls this for progress. Mirrors the shape of
# gguf_downloader's task dict so the frontend can treat them alike.
_install_state: Dict = {
    "status": "idle",     # idle | running | completed | failed
    "step": "",
    "error": None,
    "log_tail": "",
    "hardware_backend": None,
    "hardware_device": None,
}


def install_state() -> Dict:
    return {
        **_install_state,
        "installed": comfyui_runtime.installed,
        "engine_dir": str(engine_dir()),
        "qwen_gguf_node": (engine_dir() / "custom_nodes" / "ComfyUI-GGUF" / "nodes.py").is_file(),
    }


def _hardware_route() -> Dict[str, str]:
    """Return the shared detector's install route without importing Torch."""
    try:
        from app.hardware.detection import detect_gpu_cli
        gpu = detect_gpu_cli()
    except Exception:
        gpu = None
    if gpu:
        return {"backend": gpu["backend"], "device": gpu["device"]}
    try:
        from app.hardware.detection import detect_hardware
        hardware = detect_hardware()
        if hardware.get("backend") != "cpu":
            return {
                "backend": hardware["backend"],
                "device": hardware.get("device", hardware["backend"]),
            }
    except Exception:
        pass
    return {"backend": "cpu", "device": "CPU"}


def _tail(text: str, n: int = 6) -> str:
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    return " | ".join(lines[-n:])


async def _run_step(label: str, cmd: str, timeout: int) -> bool:
    """Run one install step, streaming its output into the task's log tail.

    Runs in the event loop via a subprocess (not subprocess.run) so the multi-gigabyte
    torch download doesn't block every other request for its duration.
    """
    _install_state.update(step=label, log_tail="")
    logger.info("ComfyUI install [%s]: %s", label, cmd)

    proc = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        async with asyncio.timeout(timeout):
            async for raw in proc.stdout:
                line = raw.decode(errors="ignore").rstrip()
                if line:
                    _install_state["log_tail"] = _tail(
                        (_install_state["log_tail"] + "\n" + line)[-4000:]
                    )
    except asyncio.TimeoutError:
        proc.kill()
        _install_state.update(status="failed", error=f"{label} timed out")
        return False

    code = await proc.wait()
    if code != 0:
        _install_state.update(
            status="failed",
            error=f"{label} failed (exit {code}): {_install_state['log_tail']}",
        )
        return False
    return True


def _torch_args() -> str:
    """torch install args.

    On Linux with no GPU, plain `pip install torch` pulls ~2.5 GB of CUDA wheels that can
    never be used — point at the CPU index instead. macOS arm64 wheels already carry MPS,
    and a detected NVIDIA/ROCm GPU wants the default index.
    """
    route = _hardware_route()
    if route["backend"] in {"cpu", "vulkan"} and sys.platform.startswith("linux"):
        return "--index-url https://download.pytorch.org/whl/cpu"
    return ""


async def install() -> None:
    """Clone, build a dedicated venv, install torch + requirements.

    Deliberately not in install.sh: torch is 2-5 GB and most users never generate images.
    """
    if _install_state["status"] == "running":
        return

    import shlex
    from app.runtime.installer import _venv_pip  # reuse the uv-vs-pip choice

    route = _hardware_route()
    _install_state.update(
        status="running", step="starting", error=None, log_tail="",
        hardware_backend=route["backend"], hardware_device=route["device"],
    )
    target = engine_dir()
    venv = target / ".venv"
    py = venv_python()
    try:
        target.parent.mkdir(parents=True, exist_ok=True)

        if not (target / "main.py").is_file():
            ok = await _run_step(
                "cloning ComfyUI",
                f"git clone --depth 1 {shlex.quote(REPO)} {shlex.quote(str(target))}",
                timeout=900,
            )
            if not ok:
                return
        else:
            # Already cloned (reinstall after a failed venv step) — leave the checkout alone.
            logger.info("ComfyUI already cloned at %s", target)

        if not py.is_file():
            maker = (
                f"uv venv {shlex.quote(str(venv))}"
                if __import__("shutil").which("uv")
                else f"{shlex.quote(sys.executable)} -m venv {shlex.quote(str(venv))}"
            )
            if not await _run_step("creating virtualenv", maker, timeout=300):
                return

        if not await _run_step(
            "installing torch",
            f"{_venv_pip('install torch torchvision torchaudio', str(py))} {_torch_args()}".strip(),
            timeout=3600,
        ):
            return

        node_dir = target / "custom_nodes" / "ComfyUI-GGUF"
        if not (node_dir / "nodes.py").is_file():
            if not await _run_step("installing ComfyUI-GGUF", f"git clone --depth 1 {shlex.quote(GGUF_REPO)} {shlex.quote(str(node_dir))}", 900):
                return
        requirements = node_dir / "requirements.txt"
        if requirements.is_file() and not await _run_step(
            "installing ComfyUI-GGUF requirements",
            _venv_pip(f"install -r {shlex.quote(str(requirements))}", str(py)), 900,
        ):
            return

        if not await _run_step(
            "installing ComfyUI requirements",
            _venv_pip(f"install -r {shlex.quote(str(target / 'requirements.txt'))}", str(py)),
            timeout=1800,
        ):
            return

        _install_state.update(status="completed", step="done", error=None)
        logger.info("ComfyUI installed at %s", target)
    except Exception as exc:  # never leave the task stuck in "running"
        logger.exception("ComfyUI install failed")
        _install_state.update(status="failed", error=str(exc))


def uninstall() -> Dict:
    """Remove the managed engine. Only ever touches the managed directory."""
    import shutil
    comfyui_runtime.stop()
    target = engine_dir()
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
    _install_state.update(status="idle", step="", error=None, log_tail="")
    return {"success": True, "engine_dir": str(target)}


# Global singleton
comfyui_runtime = ComfyUIRuntime()
