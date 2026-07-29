---
title: Deployment
description: Deploy LM-WebUI as one application container with external runtimes.
section: Operate
order: 4
---

# Deployment

LM-WebUI uses one application container. Hardware-specific runtimes run on the host or as separate services and are connected through the admin Runtime Manager.

```text
LM-WebUI container → runtime connector → host runtime
```

## Recommended Docker deployment

Requirements:

- Docker
- Docker Compose v2
- Python 3.10+ for the optional host CLI

Run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh -o install.sh
bash install.sh
```

Or run manually:

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
mkdir -p .lmwebui/models .lmwebui/secrets
docker compose up -d --build
```

Open `http://localhost:7070`. Check readiness with:

```bash
curl http://localhost:7070/api/health
docker compose ps
```

The container serves both the frontend and API. It does not install host drivers or host runtimes.

## Persistence

The default Compose deployment persists:

| Data | Location |
| --- | --- |
| SQLite/application data | Docker volume `app_data` → `/backend/data` |
| Generated media/uploads | Docker volume `app_media` → `/backend/media` |
| Local models | `./.lmwebui/models` → `/backend/models` |
| Secrets | `./.lmwebui/secrets` → `/backend/.secrets` |

Back up the Docker volumes and `./.lmwebui/models` before upgrades. Never commit `.env`, `.secrets`, API keys, databases, or model files.

## GGUF engine tuning

GGUF (llama.cpp) is bundled in-container with hardware-aware defaults. Override via environment variables on the `lm-webui` service in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GGUF_N_CTX` | 4096 | Context window (1024–32768) |
| `GGUF_N_GPU_LAYERS` | -1 | GPU layers (-1=all, 0=CPU) |
| `GGUF_FLASH_ATTN` | 1 | Flash attention (1=on, 0=off) |
| `GGUF_CACHE_TYPE_K` | q8_0 | Key cache (f16, q8_0, q4_0) |
| `GGUF_CACHE_TYPE_V` | q8_0 | Value cache (f16, q8_0, q4_0) |
| `GGUF_N_THREADS` | 0 | CPU threads (0=auto) |

Context window, GPU toggle, and KV cache quality are also adjustable from the Runtime Manager UI (Settings → Runtime Manager). Env vars serve as system defaults; UI changes apply per-session.

## External runtimes

Install host runtimes for hardware-accelerated local inference. The app connects to them via `localhost` (native) or `host.docker.internal` (Docker):

**MLX** (Apple Silicon macOS only):
```bash
pip install mlx mlx-lm mlx-optiq
mlx_lm.server --port 8090 --model <model-name>
```

**ComfyUI** (any platform):
```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI && pip install -r requirements.txt
python main.py --port 8188 --listen 0.0.0.0
```

**Ollama / vLLM** — configured as API providers in Settings → API Providers. No Runtime Manager integration needed. Enter the endpoint URL, test, and save.

The Runtime Manager auto-detects running external services via HTTP probes on `localhost` (native install) or `host.docker.internal` (Docker). No host agent, no Docker socket needed.

## Office deployment

For a small office or SMB deployment:

1. Run LM-WebUI on a trusted internal server with `docker compose up`.
2. GGUF (llama.cpp) inference is available immediately — bundled in-container with hardware-accelerated defaults.
3. For additional runtimes:
   - Install MLX on a macOS workstation, or Ollama/vLLM/ComfyUI on any host machine.
   - The Runtime Manager auto-detects running services via `localhost` (native) or `host.docker.internal` (Docker) probes.
   - Connect with one click from the admin Runtime Manager UI.
4. Configure API providers (OpenAI, Anthropic, Google, Ollama, vLLM) in Settings → API Providers.
5. Create users through the admin user-management menu.

> **Runtime Manager scope**: Manages GGUF (in-container engine config), MLX (external server on Apple Silicon), and ComfyUI (external server for image gen). Ollama and vLLM are configured as API providers, not managed runtimes.
6. Monitor metadata-only usage analytics.

Normal users cannot install runtimes, change endpoints, or control host services.

## Native accelerated deployment

Use native installation when maximum host acceleration is important, especially on Apple Silicon. Docker Desktop does not provide native Metal acceleration to Linux containers. MLX should therefore run natively on the host and be exposed through a supported local service when integration is required.

GPU drivers and kernel components must be installed through the host operating system. LM-WebUI does not install them automatically.

## Operations

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

Do not use the old GPU-specific Compose files as the default deployment path. They are retained only as advanced/experimental configurations while the external-runtime path is the supported installation model.

See [CLI reference](./cli.md), [Architecture](./architecture.md), and [Security](../SECURITY.md).
