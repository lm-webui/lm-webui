#!/bin/bash
set -e

echo "🚀 Starting Container Entrypoint (2026 Edition)..."

# Environment Validation
if [ ! -f "$CONFIG_PATH" ]; then
    echo "⚠️  Warning: Config file not found at $CONFIG_PATH. Using defaults."
fi

# Hardware Detection Logic
detect_gpu() {
    echo "🔍 Detecting GPU hardware..."
    
    # --- NVIDIA ---
    if command -v nvidia-smi &> /dev/null; then
        echo "✅ NVIDIA GPU detected via nvidia-smi"
        return 0
    fi
    
    # --- INTEL ARC / BATTLEMAGE ---
    # Check for the Level Zero loader or the device nodes
    if [ -c "/dev/dri/renderD128" ] && lspci 2>/dev/null | grep -qi "Intel"; then
        echo "✅ Intel GPU detected (dri/render nodes found)"
        return 2
    fi

    # --- AMD ROCm (RDNA3/4) ---
    # In ROCm 7.x, checking for /dev/kfd is the most reliable "is compute ready" test
    if [ -c "/dev/kfd" ]; then
        echo "✅ AMD ROCm hardware detected (/dev/kfd is active)"
        return 3
    fi
    
    # No GPU detected
    echo "💻 No hardware acceleration nodes found - using CPU mode"
    return 5
}

# Auto-detect if set to auto
if [ "$FORCED_BACKEND" = "auto" ] || [ -z "$FORCED_BACKEND" ]; then
    # We use || true to prevent set -e from exiting the script when detect_gpu returns non-zero
    detect_gpu || GPU_TYPE=$?
    
    case ${GPU_TYPE:-5} in
        0) export FORCED_BACKEND=cuda ;;
        2) export FORCED_BACKEND=sycl ;;
        3) export FORCED_BACKEND=rocm ;;
        *) export FORCED_BACKEND=cpu ;;
    esac
fi

echo "⚡ Target Backend: $FORCED_BACKEND"

# Apply 2026-Specific Optimizations
case $FORCED_BACKEND in
    cuda)
        export NVIDIA_VISIBLE_DEVICES=all
        export NVIDIA_DRIVER_CAPABILITIES=compute,utility
        ;;
    sycl)
        # Modern Intel oneAPI 2025/2026 variable
        export ONEAPI_DEVICE_SELECTOR=level_zero:gpu
        export SYCL_CACHE_PERSISTENT=1
        ;;
    rocm)
        export HIP_VISIBLE_DEVICES=0
        # Helpful for non-officially supported cards (RX 6700, etc.)
        if [ -z "$HSA_OVERRIDE_GFX_VERSION" ]; then
            echo "💡 Tip: If GPU isn't responding, try setting HSA_OVERRIDE_GFX_VERSION"
        fi
        ;;
esac

# Final Permission Check (Only if a hardware backend was selected/detected)
if [[ "$FORCED_BACKEND" != "cpu" ]]; then
    if [ ! -w "/dev/dri/renderD128" ] && [ ! -w "/dev/kfd" ] && [ ! -c "/dev/nvidiactl" ]; then
        echo "❌ ERROR: Hardware backend ($FORCED_BACKEND) requested but device nodes are not accessible."
        echo "   Falling back to CPU mode."
        export FORCED_BACKEND=cpu
    fi
fi

# 5. Start Backend
echo "🚀 Launching Uvicorn on $FORCED_BACKEND..."
echo "Current directory: $(pwd)"
echo "Python version: $(python3 --version 2>&1 || python --version 2>&1)"
echo "Environment: CONFIG_PATH=$CONFIG_PATH, PYTHONPATH=$PYTHONPATH"

# Run with -u for unbuffered output to see logs immediately
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
