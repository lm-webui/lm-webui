# --- Stage 1: Build Frontend (Static Assets) ---
FROM node:24-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
# Install dependencies for build
RUN npm ci
COPY frontend/ ./
# Output: /frontend/dist
RUN npm run build

# --- Stage 2: Runtime Environment (Python 3.12) ---
# Using 3.12 for stable llama-cpp-python wheels
FROM python:3.13-slim-bookworm

WORKDIR /backend

# 1. System Dependencies (Minimal Runtime)
# libgomp1 for vector math, curl for healthchecks, git/build-essential for JIT compilation if needed
RUN apt-get update && apt-get install -y \
    libgomp1 \
    libstdc++6 \
    curl \
    git \
    build-essential \
    ninja-build \
    pkg-config \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# 2. Python Dependencies (Layered for caching)
COPY backend/requirements.txt ./backend/

# Set build args for llama-cpp-python to ensure CPU build works if wheels are missing
ENV CMAKE_ARGS="-DGGML_CPU=on"

# Upgrade pip to handle modern wheels
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --root-user-action=ignore -r backend/requirements.txt

# 3. Copy Application Code
COPY backend/ ./backend/
# config.yaml is included in backend/ directory

# 4. Copy Frontend Assets (Served by FastAPI/Nginx)
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# 5. Create Persistent Directories (Aligned with config.yaml)
RUN mkdir -p /backend/data/qdrant_db \
             /backend/media/uploads \
             /backend/data/memory \
             /backend/data/models \
             /backend/app/persistent_build

# 6. Environment Setup
ENV PYTHONPATH=/backend
ENV CONFIG_PATH=/backend/config.yaml

# 7. Healthcheck (Checks FastAPI endpoint)
# Note: Using /api/health as defined in main.py
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

# 8. Entrypoint
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
