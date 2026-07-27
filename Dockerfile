# --- Stage 1: Build Frontend ---
FROM node:24-alpine AS frontend-builder
WORKDIR /frontend
COPY package.json /package.json
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Stage 2: Runtime ---
FROM python:3.12-slim-bookworm
WORKDIR /backend

RUN apt-get update && apt-get install -y \
    libgomp1 libstdc++6 curl git build-essential cmake \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    APP_PATHS_DATA_DIR=/backend/data \
    APP_PATHS_MEDIA_DIR=/backend/media \
    MEDIA_DIR=/backend/media

RUN pip install --upgrade pip
COPY package.json /
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /frontend/dist ./web/dist

RUN mkdir -p /backend/data /backend/media/generated/images /backend/media/generated/documents /backend/media/uploads /backend/models /backend/.secrets

ENV PYTHONPATH=/backend

EXPOSE 8000

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
