"""
Runtime Detector
Detects managed runtimes: GGUF (in-container), MLX (external on Apple Silicon), ComfyUI (external).
"""
import os
import logging
from typing import Dict, List, Optional
from enum import Enum

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)


class RuntimeType(str, Enum):
    """Runtime types managed by LM-WebUI Runtime Manager."""
    GGUF = "gguf"  # llama-cpp-python (in-container)
    MLX = "mlx"    # Apple Silicon only (external server on host)
    COMFYUI = "comfyui"  # Image generation (external server on host)


# Host detection — use host.docker.internal in Docker, localhost otherwise
import os as _os
HOST_INTERNAL = "host.docker.internal" if _os.path.exists("/.dockerenv") else "localhost"
MLX_SERVER_PORT = 8090
COMFYUI_PORT = 8188


class RuntimeDetector:
    """
    Detects managed runtimes.

    Detection methods:
    - Python packages (llama-cpp-python in-container)
    - External server probing (MLX, ComfyUI on host.docker.internal)
    """

    # Runtime detection configurations — only managed runtimes
    RUNTIME_CONFIGS = {
        RuntimeType.GGUF: {
            "type": "python_package",
            "packages": ["llama_cpp"],
            "models_dir": "models",
            "managed": True,
        },
        RuntimeType.MLX: {
            "type": "external_server",
            "host_port": MLX_SERVER_PORT,
            "probe_path": "/v1/models",
            "managed": False,
        },
        RuntimeType.COMFYUI: {
            "type": "external_server",
            "host_port": COMFYUI_PORT,
            "probe_path": "/",
            "managed": False,
        },
    }

    def detect_all(self, include_external: bool = True) -> Dict[str, Dict]:
        """
        Detect all managed runtimes.

        Args:
            include_external: Whether to probe host.docker.internal for external runtimes

        Returns:
            Dict mapping runtime type -> detection info
        """
        results = {}

        # In-container detection (GGUF)
        for runtime_type in RuntimeType:
            config = self.RUNTIME_CONFIGS.get(runtime_type)
            if config and config.get("type") == "python_package":
                info = self.detect(runtime_type)
                results[runtime_type.value] = info

        # External server detection (MLX, ComfyUI)
        if include_external:
            import asyncio
            try:
                loop = asyncio.get_running_loop()
                ext_results = loop.run_until_complete(self.detect_external_all())
            except RuntimeError:
                # No running loop — create one
                ext_results = asyncio.run(self.detect_external_all())
            results.update(ext_results)

        return results

    async def detect_all_async(self, include_external: bool = True) -> Dict[str, Dict]:
        """
        Detect all managed runtimes asynchronously.
        Safe to call from within an async FastAPI endpoint (awaits external detection).
        """
        results = {}

        # In-container detection (GGUF) — synchronous
        for runtime_type in RuntimeType:
            config = self.RUNTIME_CONFIGS.get(runtime_type)
            if config and config.get("type") == "python_package":
                results[runtime_type.value] = self.detect(runtime_type)

        # External server detection (MLX, ComfyUI) — awaited, not run_until_complete
        if include_external:
            ext = await self.detect_external_all()
            results.update(ext)

        return results

    def detect(self, runtime_type: RuntimeType) -> Dict:
        """
        Detect a specific runtime.

        Args:
            runtime_type: The runtime to detect

        Returns:
            status and details Dict with detection info
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
            "status": "not_installed"
        }

        detection_method = config.get("type", "")

        if detection_method == "python_package":
            self._detect_package(config, result)

        return result

    def _detect_package(self, config: Dict, result: Dict) -> None:
        """Detect Python package runtime (GGUF in-container)."""
        packages = config.get("packages", [])

        for pkg in packages:
            try:
                __import__(pkg.replace("-", "_"))
                result["installed"] = True
                result["status"] = "available"

                try:
                    import importlib.metadata
                    version = importlib.metadata.version(pkg)
                    result["version"] = version
                except Exception:
                    pass

                break
            except ImportError:
                continue

        # Count GGUF models in models directory
        if result["installed"] and config.get("models_dir"):
            from app.core.config_manager import get_models_dir
            models_dir = str(get_models_dir() / "gguf")
            if os.path.exists(models_dir):
                gguf_files = [
                    f for f in os.listdir(models_dir)
                    if f.endswith(".gguf") and os.path.isfile(os.path.join(models_dir, f))
                ]
                result["models_count"] = len(gguf_files)

    async def detect_external_all(self) -> Dict[str, Dict]:
        """
        Probe host.docker.internal for running external runtimes (MLX, ComfyUI).

        Returns:
            Dict of detected runtime type -> status info
        """
        results = {}

        mlx = await self._probe_external("mlx")
        if mlx:
            results["mlx"] = mlx

        comfy = await self._probe_external("comfyui")
        if comfy:
            results["comfyui"] = comfy

        return results

    async def _probe_external(self, runtime_type: str) -> Optional[Dict]:
        """
        Probe a single external runtime on host.docker.internal.

        Args:
            runtime_type: The runtime type key

        Returns:
            Detection dict or None if not found
        """
        for rt in RuntimeType:
            if rt.value == runtime_type:
                config = self.RUNTIME_CONFIGS.get(rt)
                break
        else:
            return None

        if not config or config.get("type") != "external_server":
            return None

        port = config["host_port"]
        path = config["probe_path"]
        url = f"http://{HOST_INTERNAL}:{port}{path}"

        if httpx is None:
            logger.warning("httpx not available, skipping external runtime detection")
            return None

        try:
            async with httpx.AsyncClient(timeout=2) as client:
                resp = await client.get(url)
                if resp.status_code < 500:
                    return {
                        "type": runtime_type,
                        "installed": True,
                        "status": "running",
                        "port": port,
                        "endpoint": f"http://{HOST_INTERNAL}:{port}",
                    }
        except (httpx.ConnectError, httpx.TimeoutException, httpx.ReadError):
            pass
        except Exception as e:
            logger.debug(f"Error probing {runtime_type} at {url}: {e}")

        return None

    def get_detection_info(self, runtime_type: RuntimeType) -> Dict:
        """Get detection info including install hints."""
        config = self.RUNTIME_CONFIGS.get(runtime_type, {})
        hints = {
            RuntimeType.GGUF: "Bundled in-container — always available",
            RuntimeType.MLX: (
                "Install on macOS host:\n"
                "  pip install mlx mlx-lm mlx-optiq\n"
                "  mlx_lm.server --port 8090 --model <model>"
            ),
            RuntimeType.COMFYUI: (
                "Install on host:\n"
                "  git clone https://github.com/comfyanonymous/ComfyUI\n"
                "  cd ComfyUI && pip install -r requirements.txt\n"
                "  python main.py --port 8188"
            ),
        }
        return {
            "type": runtime_type.value,
            "detection_method": config.get("type", "unknown"),
            "install_hint": hints.get(runtime_type, config.get("install_hint", "")),
            "managed": config.get("managed", False),
        }


# Singleton instance
_detector: Optional[RuntimeDetector] = None


def get_runtime_detector() -> RuntimeDetector:
    """Get the runtime detector instance."""
    global _detector
    if _detector is None:
        _detector = RuntimeDetector()
    return _detector
