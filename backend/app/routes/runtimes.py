"""
Runtime Routes
API endpoints for runtime management (GGUF, MLX, ComfyUI only).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import List, Optional
from app.runtime import (
    RuntimeRegistry,
    RuntimeDetector,
    RuntimeType,
    MLXManager,
    get_runtime_registry,
    get_runtime_detector,
    get_mlx_manager,
)
from app.runtime.detector import HOST_INTERNAL
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
    """
    Get all managed runtimes and their status.
    Returns: GGUF (in-container), MLX (external), ComfyUI (external).
    """
    registry = get_runtime_registry()
    return {
        "runtimes": registry.get_runtime_info_for_ui()
    }


@router.post("/scan")
async def scan_runtimes(_: dict = Depends(require_permission("runtime.view"))):
    """
    Scan host.docker.internal for running external runtimes (MLX, ComfyUI).
    Returns detected runtimes. They are not auto-registered — user confirms.
    """
    detector = get_runtime_detector()
    import asyncio
    detected = await detector.detect_external_all()
    return {"detected": detected}


@router.post("/external")
async def register_external_runtime(
    request: RuntimeConfigRequest,
    _: dict = Depends(require_permission("runtime.configure"))
):
    """Register an external runtime endpoint (MLX, ComfyUI, or API provider)."""
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
        raise HTTPException(404, f"Runtime '{runtime_type}' is not registered or has no endpoint")
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
        raise HTTPException(404, f"Runtime '{runtime_type}' is not registered or has no endpoint")
    try:
        return connector_for(runtime_type, runtime["endpoint"]).models()
    except Exception as exc:
        raise HTTPException(502, f"Runtime unavailable: {exc}")


@router.get("/mlx/scripts")
async def get_mlx_scripts(_: dict = Depends(require_permission("runtime.view"))):
    """
    Get MLX management shell commands.
    MLX runs on macOS host — these scripts help install, manage, and clean up.
    """
    manager = get_mlx_manager()
    return {
        "runtime": "mlx",
        "platform": "macOS (Apple Silicon)" if manager.is_apple_silicon() else "macOS",
        "scripts": manager.get_scripts(),
        "setup_guide": manager.get_setup_guide(),
    }


@router.get("/mlx/status")
async def get_mlx_status(_: dict = Depends(require_permission("runtime.view"))):
    """
    Get MLX compatibility and status.
    Returns whether the host is Apple Silicon and whether MLX server is detected.
    """
    manager = get_mlx_manager()
    is_apple = manager.is_apple_silicon()

    if not is_apple:
        return {
            "runtime": "mlx",
            "available": False,
            "reason": "MLX requires Apple Silicon (M-series) hardware",
            "hardware_detected": False,
        }

    # Probe for MLX server on host
    detector = get_runtime_detector()
    import asyncio
    detected = await detector.detect_external_all()
    mlx_info = detected.get("mlx", {})

    return {
        "runtime": "mlx",
        "available": True,
        "hardware_detected": True,
        "server_running": mlx_info.get("installed", False),
        "endpoint": mlx_info.get("endpoint"),
        "port": mlx_info.get("port"),
    }
