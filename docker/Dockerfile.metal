# Metal variant - optimized for macOS (Apple Silicon: M1/M2/M3/M4)
# Note: Docker on macOS doesn't support Metal GPU acceleration in containers
# For best performance on Apple Silicon, use native installation instead of Docker
# This variant provides CPU-only fallback for Docker Desktop on macOS
FROM python:3.13-slim-bookworm

WORKDIR /backend

# 1. System Dependencies
RUN apt-get update && apt-get install -y \
    libgomp1 libstdc++6 curl git \
    && rm -rf /var/lib/apt/lists/*

# 2. Python Environment
ENV PYTHONUNBUFFERED=1 PIP_ROOT_USER_ACTION=ignore

RUN pip install --no-cache-dir --upgrade pip

# 3. Install PyTorch (CPU fallback - Metal not available in Docker)
RUN pip install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 4. Install llama-cpp-python (CPU fallback)
RUN pip install --no-cache-dir llama-cpp-python==0.3.16

# 5. Install Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 6. Copy Application Code
COPY backend/ ./backend/

# 7. Create Persistent Directories
RUN mkdir -p /backend/data/qdrant_db \
             /backend/media/uploads \
             /backend/data/memory \
             /backend/data/models \
             /backend/app/persistent_build

# 8. Environment
ENV PYTHONPATH=/backend
ENV CONFIG_PATH=/backend/config.yaml
ENV FORCED_BACKEND=cpu

# Note: For native macOS (not Docker), use MLX integration
# MLX will be available via: pip install mlx
# This requires native installation, not Docker

EXPOSE 8000

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
