# --- Stage 1: Build Frontend (Static Assets) ---
FROM node:24-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
# Install dependencies for build
RUN npm ci
COPY frontend/ ./ 
# Output: /frontend/dist
RUN npm run build

# --- Stage 2: Runtime Environment ---
# Using NVIDIA CUDA base for GPU support (falls back to CPU if no GPU)
FROM nvidia/cuda:runtime-ubuntu22.04 AS runtime

WORKDIR /backend

# 1. Install system dependencies + Python
RUN apt-get update && apt-get install -y \
    python3.12 python3-pip python3-venv \
    libgomp1 libstdc++6 curl git \
    # NVIDIA Container Toolkit for GPU detection
    gnupg ca-certificates wget && \
    wget -qO - https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/3bf863cc.pub | apt-key add - && \
    echo "deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/ /" > /etc/apt/sources.list.d/cuda.list && \
    echo "deb https://developer.download.nvidia.com/compute/machine-learning/repos/ubuntu2204/x86_64/ /" > /etc/apt/sources.list.d/nvidia-ml.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    libnvidia-container-tools libnvidia-container1 && \
    rm -rf /var/lib/apt/lists/*

# 2. Python Environment Setup
ENV PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PIP_NO_CACHE_DIR=1

RUN pip3 install --upgrade pip

# Install PyTorch with CUDA support
RUN pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 3. Copy Application Code
COPY backend/requirements.txt ./backend/

# Install llama-cpp-python with CUDA support
RUN pip3 install llama-cpp-python[cuda]==0.3.16

# Install other dependencies (filter out platform-specific torch/llama-cpp)
RUN pip3 install \
    fastapi \
    uvicorn[standard] \
    pydantic \
    "requests>=2.32.0" \
    psutil \
    "aiohttp>=3.11.0" \
    aiofiles \
    websockets \
    sse-starlette \
    passlib[bcrypt] \
    pyjwt \
    "cryptography>=44.0.0" \
    python-jose[cryptography] \
    python-dotenv \
    python-multipart \
    tiktoken \
    huggingface-hub \
    "urllib3>=2.0.0" \
    ddgs \
    openai \
    anthropic \
    xai-sdk \
    google-genai==1.62.0 \
    qdrant-client==1.16.2 \
    easyocr==1.7.2 \
    "transformers[torch]==4.49.0" \
    "accelerate>=0.30.0" \
    sentence-transformers>=5.2.2 \
    rank-bm25 \
    pdfplumber \
    python-docx \
    python-pptx \
    pylightxl \
    xlrd \
    markdown \
    beautifulsoup4>=4.12.0 \
    "Pillow>=11.0.0" \
    "torchvision>=0.20.0"

# 4. Copy Backend Code
COPY backend/ ./backend/

# 5. Copy Frontend Assets
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# 6. Create Persistent Directories
RUN mkdir -p /backend/data/qdrant_db \
             /backend/media/uploads \
             /backend/data/memory \
             /backend/data/models \
             /backend/app/persistent_build

# 7. Environment Setup
ENV PYTHONPATH=/backend
ENV CONFIG_PATH=/backend/config.yaml
ENV FORCED_BACKEND=auto

# 8. Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

# 9. Entrypoint with GPU detection
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
