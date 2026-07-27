"""
Runtime Routes
API endpoints for runtime management.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import List, Optional
from app.runtime import (
    RuntimeRegistry,
    RuntimeDetector,
    get_runtime_registry,
    get_runtime_detector,
)
from app.runtime.detector import RuntimeType
from app.security.auth.dependencies import require_permission
from app.runtime.connectors import connector_for

router = APIRouter(prefix="/api/runtimes", tags=["runtimes"])


class InstallRequest(BaseModel):
    """Request to install a runtime."""
    runtime_type: str
    options: Optional[dict] = None


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
    Get all runtimes and their status.
    
    Returns:
        List of runtimes with installation status
    """
    registry = get_runtime_registry()
    return {
        "runtimes": registry.get_runtime_info_for_ui()
    }


@router.get("/{runtime_type}")
async def get_runtime(runtime_type: str, _: dict = Depends(require_permission("runtime.view"))):
    """Get statusuntime_type: str of a specific runtime."""
    registry = get_runtime_registry()
    runtime = registry.get_runtime(runtime_type)
    
    if not runtime:
        detector = get_runtime_detector()
        try:
            rt = RuntimeType(runtime_type)
            runtime = detector.detect(rt)
        except ValueError:
            raise HTTPException(404, f"Unknown runtime: {runtime_type}")
    
    return {"runtime_type": runtime_type, **runtime}


@router.post("/install")
async def install_runtime(request: InstallRequest, _: dict = Depends(require_permission("runtime.install"))):
    """
    Install a runtime.
    
    Args:
        request.runtime_type: Type of runtime to install
        request.options: Additional installation options
        
    Returns:
        Installation result
    """
    # Runtime packages belong on the host, not in the application container.
    # The host CLI performs installation and the Runtime Manager then tests/registers it.
    if request.runtime_type not in {item.value for item in RuntimeType}:
        raise HTTPException(400, f"Unknown runtime type: {request.runtime_type}")
    return {
        "success": False,
        "requires_host_cli": True,
        "runtime_type": request.runtime_type,
        "command": f"lm-webui-host runtime install {request.runtime_type}",
        "message": "Install runtimes on the host with the LM-WebUI host CLI, then register and test the endpoint here.",
    }


@router.delete("/{runtime_type}")
async def uninstall_runtime(runtime_type: str, _: dict = Depends(require_permission("runtime.install"))):
    """
    Uninstall a runtime.
    
    Note: Not all runtimes can be automatically uninstalled.
    """
    try:
        rt = RuntimeType(runtime_type)
    except ValueError:
        raise HTTPException(400, f"Unknown runtime type: {runtime_type}")
    
    return {
        "success": False,
        "requires_host_cli": True,
        "runtime_type": runtime_type,
        "command": f"lm-webui-host runtime uninstall {runtime_type}",
        "message": "Runtime removal must be performed on the host, outside the application container.",
    }


@router.post("/refresh")
async def refresh_runtimes(_: dict = Depends(require_permission("runtime.view"))):
    """Refresh runtime detection."""
    registry = get_runtime_registry()
    return {
        "runtimes": registry.get_runtime_info_for_ui()
    }


@router.post("/external")
async def register_external_runtime(request: RuntimeConfigRequest, _: dict = Depends(require_permission("runtime.configure"))):
    if request.runtime_type not in {"ollama", "openai_compatible", "vllm", "llamacpp"}:
        raise HTTPException(400, "Unsupported external runtime")
    registry = get_runtime_registry()
    registry.register_runtime(request.runtime_type, {
        "name": request.name or request.runtime_type,
        "endpoint": request.endpoint.rstrip("/"),
        "enabled": request.enabled,
        "source": "external",
    })
    return {"runtime": registry.get_runtime(request.runtime_type)}


@router.post("/{runtime_type}/test")
async def test_external_runtime(runtime_type: str, _: dict = Depends(require_permission("runtime.view"))):
    runtime = get_runtime_registry().get_runtime(runtime_type)
    if not runtime or not runtime.get("endpoint"):
        raise HTTPException(404, "External runtime is not configured")
    try:
        result = connector_for(runtime_type, runtime["endpoint"]).health()
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"runtime_type": runtime_type, **result}


@router.get("/{runtime_type}/models")
async def external_runtime_models(runtime_type: str, _: dict = Depends(require_permission("runtime.view"))):
    runtime = get_runtime_registry().get_runtime(runtime_type)
    if not runtime or not runtime.get("endpoint"):
        raise HTTPException(404, "External runtime is not configured")
    try:
        return connector_for(runtime_type, runtime["endpoint"]).models()
    except Exception as exc:
        raise HTTPException(502, f"Runtime unavailable: {exc}")
