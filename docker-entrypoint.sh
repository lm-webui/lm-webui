#!/bin/bash
set -e

echo "🚀 Starting Container Entrypoint..."

# 1. Environment Validation
if [ ! -f "$CONFIG_PATH" ]; then
    echo "⚠️  Warning: Config file not found at $CONFIG_PATH. Using defaults."
fi

# 2. Auto-detect GPU and set backend
detect_gpu() {
    echo "🔍 Detecting GPU hardware..."
    
    # Priority order: NVIDIA > Intel Arc > AMD ROCm > Apple Silicon > CPU
    
    # Check for NVIDIA GPU (via nvidia-smi or nvidia-container-cli)
    if command -v nvidia-smi &> /dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
        echo "✅ NVIDIA GPU detected: $GPU_NAME"
        echo "   Using CUDA backend for optimal performance"
        return 0  # 0 = GPU detected
    elif nvidia-container-cli -l &> /dev/null 2>&1; then
        echo "✅ NVIDIA GPU detected via nvidia-container-cli"
        return 0
    fi
    
    # Check for Intel Arc GPU (via sysfs or oneAPI tools)
    if [ -d "/sys/class/drm/card0" ]; then
        # Check for Intel GPU in device info
        if lspci 2>/dev/null | grep -qi "intel.*arc\|intel.*gpu"; then
            echo "✅ Intel Arc GPU detected"
            echo "   Using SYCL backend for Intel Arc optimization"
            return 2  # 2 = Intel Arc
        fi
    fi
    
    # Check for oneAPI/SYCL runtime
    if command -v sycl-ls &> /dev/null; then
        if sycl-ls 2>/dev/null | grep -qi "intel"; then
            echo "✅ Intel GPU detected via oneAPI"
            return 2
        fi
    fi
    
    # Check for AMD GPU (ROCm)
    if command -v rocm-smi &> /dev/null; then
        ROCM_GPU=$(rocm-smi --showproductname 2>/dev/null | grep -i "card\|gpu" | head -1 || echo "AMD GPU")
        echo "✅ AMD GPU detected (ROCm): $ROCM_GPU"
        echo "   Using ROCm backend for AMD GPU optimization"
        return 3  # 3 = AMD ROCm
    fi
    
    # Check for Apple Silicon (macOS - Metal)
    if [[ "$OSTYPE" == "darwin"* ]] && [[ "$(uname -m)" == "arm64" ]]; then
        echo "🍎 Apple Silicon detected"
        echo "   Note: Metal acceleration requires native installation (not Docker)"
        echo "   Using CPU backend for Docker container"
        return 4  # 4 = Apple Silicon (CPU fallback)
    fi
    
    # No GPU detected
    echo "💻 No GPU detected - using CPU mode"
    return 5  # 5 = CPU only
}

# Detect and configure
detect_gpu
GPU_TYPE=$?

# Set backend based on detection
if [ "$FORCED_BACKEND" != "auto" ]; then
    echo "⚡ Using forced backend: $FORCED_BACKEND"
else
    case $GPU_TYPE in
        0)
            export FORCED_BACKEND=cuda
            echo "⚡ Backend: CUDA (NVIDIA)"
            ;;
        2)
            export FORCED_BACKEND=sycl
            echo "⚡ Backend: SYCL (Intel Arc)"
            ;;
        3)
            export FORCED_BACKEND=rocm
            echo "⚡ Backend: ROCm (AMD)"
            ;;
        4)
            export FORCED_BACKEND=cpu
            echo "⚡ Backend: CPU (Apple Silicon - Metal not available in Docker)"
            ;;
        5|*)
            export FORCED_BACKEND=cpu
            echo "⚡ Backend: CPU"
            ;;
    esac
fi

# 3. Set GPU-specific environment variables
case $FORCED_BACKEND in
    cuda)
        export NVIDIA_VISIBLE_DEVICES=all
        export NVIDIA_DRIVER_CAPABILITIES=compute,utility
        ;;
    sycl)
        export SYCL_CACHE_DISABLE=0
        export SYCL_DEVICE_FILTER=level_zero
        ;;
    rocm)
        export HIP_VISIBLE_DEVICES=0
        ;;
esac

# 4. Start Backend (Uvicorn)
echo "🔥 Starting Uvicorn Server (backend: $FORCED_BACKEND)..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 1 \
    --log-level info
