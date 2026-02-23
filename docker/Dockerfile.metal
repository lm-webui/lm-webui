# ==============================================================================
# METAL / MACOS DOCKERFILE (CPU FALLBACK)
# ==============================================================================
# NOTE: Docker on macOS (even with VirtioFS/Rosetta) does NOT support Metal GPU 
# acceleration for Compute tasks (like PyTorch/MPS). 
# This image provides a CPU-optimized fallback for development on Mac.
# For true Metal acceleration, run the application NATIVELY (without Docker).
# ==============================================================================

# --- Stage 1: Build Frontend (Static Assets) ---
FROM node:24-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
# Install dependencies for build
RUN npm ci
COPY frontend/ ./ 
# Output: /frontend/dist
RUN npm run build

# --- Stage 2: Runtime Environment (CPU Fallback) ---
FROM python:3.12-slim-bookworm

WORKDIR /backend

# 1. System Dependencies
RUN apt-get update && apt-get install -y \
    libgomp1 libstdc++6 curl git build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Python Environment
ENV PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

# 3. Install CPU-only PyTorch (MPS not available in Docker)
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 4. Install llama-cpp-python (CPU fallback)
# We compile for ARM64 CPU if running on Apple Silicon Docker
RUN pip install llama-cpp-python==0.3.16 \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

# 5. Install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# 6. Copy Application Code
COPY backend/ ./

# 7. Copy Frontend Assets from Builder Stage
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# 8. Create Persistent Directories
RUN mkdir -p /backend/data/qdrant_db \
             /backend/media/uploads \
             /backend/data/memory \
             /backend/data/models \
             /backend/app/persistent_build

# 9. Environment
ENV PYTHONPATH=/backend
ENV CONFIG_PATH=/backend/config.yaml
ENV FORCED_BACKEND=cpu

EXPOSE 8000

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
