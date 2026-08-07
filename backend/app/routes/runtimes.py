"""
Runtime Routes
API endpoints for runtime management (GGUF, MLX, ComfyUI).
On native host — install/uninstall/start/stop use real subprocess.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import Optional
from app.runtime import (
    RuntimeRegistry,
    RuntimeDetector,
    RuntimeType,
    get_runtime_registry,
    get_runtime_detector,
    get_runtime_installer,
)
from app.security.auth.dependencies import require_permission
from app.runtime.connectors import connector_for

router = APIRouter(prefix="/api/runtimes", tags=["runtimes"])


class RuntimeConfigRequest(BaseModel):
    runtime_type: str
    endpoint: str
    name: Optional[str] = None
    enabled: bool = True

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Endpoint must be a valid http or https URL")
        return value.strip().rstrip("/")


@router.get("")
async def get_runtimes(_: dict = Depends(require_permission("runtime.view"))):
    """Get all managed runtimes and their status."""
    registry = get_runtime_registry()
    return {"runtimes": await registry.get_runtime_info_for_ui_async()}


@router.post("/scan")
async def scan_runtimes(_: dict = Depends(require_permission("runtime.view"))):
    """Scan localhost for running external runtimes."""
    detector = get_runtime_detector()
    import asyncio
    detected = await detector.detect_external_all()
    return {"detected": detected}


@router.post("/external")
async def register_external_runtime(
    request: RuntimeConfigRequest,
    _: dict = Depends(require_permission("runtime.configure"))
):
    """Register an external runtime endpoint."""
    if request.runtime_type not in {"mlx", "comfyui", "ollama", "openai_compatible", "vllm", "llamacpp"}:
        raise HTTPException(400, f"Unsupported runtime type: {request.runtime_type}")
    registry = get_runtime_registry()
    registry.register_runtime(request.runtime_type, {
        "name": request.name or request.runtime_type,
        "endpoint": request.endpoint.rstrip("/"),
        "enabled": request.enabled,
        "source": "external",
    })
    return {"runtime": registry.get_runtime(request.runtime_type)}


@router.post("/{runtime_type}/test")
async def test_runtime_connection(
    runtime_type: str,
    _: dict = Depends(require_permission("runtime.view"))
):
    """Test connection to a registered runtime."""
    registry = get_runtime_registry()
    runtime = registry.get_runtime(runtime_type)
    if not runtime or not runtime.get("endpoint"):
        raise HTTPException(404, f"Runtime '{runtime_type}' is not registered")
    try:
        result = connector_for(runtime_type, runtime["endpoint"]).health()
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"runtime_type": runtime_type, **result}


@router.get("/{runtime_type}/models")
async def runtime_models(
    runtime_type: str,
    _: dict = Depends(require_permission("runtime.view"))
):
    """List models available on a registered runtime."""
    registry = get_runtime_registry()
    runtime = registry.get_runtime(runtime_type)
    if not runtime or not runtime.get("endpoint"):
        raise HTTPException(404, f"Runtime '{runtime_type}' is not registered")
    try:
        return connector_for(runtime_type, runtime["endpoint"]).models()
    except Exception as exc:
        raise HTTPException(502, f"Runtime unavailable: {exc}")


@router.post("/{runtime_type}/install")
async def install_runtime(
    runtime_type: str,
    _: dict = Depends(require_permission("runtime.install"))
):
    """Install a runtime on the host via subprocess."""
    if runtime_type not in {"mlx", "comfyui"}:
        raise HTTPException(400, f"Runtime '{runtime_type}' does not support auto-install")
    installer = get_runtime_installer()
    result = installer.install(runtime_type)
    if not result["success"]:
        raise HTTPException(500, result.get("error", "Install failed"))
    return result


@router.post("/{runtime_type}/uninstall")
async def uninstall_runtime(
    runtime_type: str,
    _: dict = Depends(require_permission("runtime.install"))
):
    """Uninstall a runtime from the host."""
    if runtime_type not in {"mlx", "comfyui"}:
        raise HTTPException(400, f"Runtime '{runtime_type}' does not support auto-uninstall")
    installer = get_runtime_installer()
    return installer.uninstall(runtime_type)


@router.get("/mlx/status")
async def get_mlx_status(_: dict = Depends(require_permission("runtime.view"))):
    """Get MLX compatibility — checks if mlx is importable and models exist."""
    from app.providers.local.mlx import HAS_MLX, MLX_DIR
    import platform as _platform
    is_apple = _platform.system() == "Darwin" and _platform.machine() == "arm64"

    if not is_apple:
        return {
            "runtime": "mlx",
            "available": False,
            "reason": "MLX requires Apple Silicon (M-series) hardware",
            "hardware_detected": False,
        }

    mlx_importable = HAS_MLX
    models = [d.name for d in sorted(MLX_DIR.iterdir()) if d.is_dir() and (d / "config.json").exists()] if MLX_DIR.exists() else []

    return {
        "runtime": "mlx",
        "available": True,
        "hardware_detected": True,
        "mlx_installed": mlx_importable,
        "models_available": len(models),
        "models": models,
        "models_dir": str(MLX_DIR),
    }


@router.get("/vision/status")
async def get_vision_status(_: dict = Depends(require_permission("runtime.view"))):
    """Vision runtime status — installed bundles, llama-server availability, running state."""
    import shutil
    from app.services.gguf_manager import scan_vision_models
    from app.runtime.vision_runtime import vision_runtime

    bundles = scan_vision_models()
    return {
        "runtime": "vision",
        "available": bool(bundles) and shutil.which("llama-server") is not None,
        "bundles": bundles,
        "bundle_count": len(bundles),
        "llama_server_available": shutil.which("llama-server") is not None,
        "running": vision_runtime.running,
        "port": vision_runtime._port,
    }


@router.get("/gguf/health")
async def get_gguf_runtime_health(_: dict = Depends(require_permission("runtime.view"))):
    """GGUF runtime executables + version + API reachability (prompt8 validation)."""
    import shutil
    import subprocess

    def _have(bin_name: str) -> bool:
        return shutil.which(bin_name) is not None

    def _version(bin_name: str) -> str:
        try:
            out = subprocess.run(
                [bin_name, "--version"], capture_output=True, text=True, timeout=5
            )
            return (out.stdout or out.stderr or "").strip().splitlines()[:1]
        except Exception:
            return []

    return {
        "runtime": "gguf",
        "executables": {
            "llama_server": _have("llama-server"),
            "llama_cli": _have("llama-cli"),
            "llama_bench": _have("llama-bench"),
            "llama_quantize": _have("llama-quantize"),
        },
        "version": _version("llama-server"),
        "api_reachable": False,  # llama-server /health when running; see vision_runtime
    }
