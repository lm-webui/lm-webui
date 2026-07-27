"""
Hardware Routes
"""
from fastapi import APIRouter
from app.hardware import detect_hardware

router = APIRouter(prefix="/api/hardware")


@router.get("")
@router.get("/info")
async def hardware_info():
    """Get hardware info in the shape the frontend HardwareStatus expects."""
    hw = detect_hardware()

    return {
        "backend": hw.get("backend", "cpu"),
        "device": hw.get("device", ""),
        "vram_mb": hw.get("vram_mb", 0),
        "system_ram_mb": hw.get("system_ram_mb", 0),
        "cpu_cores": hw.get("cpu_cores", 0),
        "available_backends": hw.get("available_backends", ["cpu"]),
        "cuda_version": hw.get("cuda_version"),
        "rocm_version": hw.get("rocm_version"),
        "metal_support": hw.get("metal_support", False),
    }
