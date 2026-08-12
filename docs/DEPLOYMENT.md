---
title: Deployment
description: Deploy LM-WebUI with the native service manager, or as a Docker container.
section: Operate
order: 4
---

# Deployment

LM-WebUI runs as a native application managed by a service, with hardware-specific runtimes (MLX, ComfyUI) connected through the admin Runtime Manager. A Docker image is also available as an alternative for containerized environments.

```text
LM-WebUI service → runtime connector → host runtime
```

## Recommended native installation

Requirements:

- Python 3.10+
- Node.js (for building the frontend)
- git

Run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash
```

This installs the application to `~/.lmwebui/` (configurable via `LMWEBUI_HOME`):

- Application code under `app/` and `web/`
- Data under `data/`
- Models under `models/`
- Logs under `logs/`

It registers a `systemd` service (Linux) or `launchd` service (macOS), installs an `lm-webui` CLI (`start|stop|restart|status|logs|update`), and starts the app on `http://localhost:7070`.

Check readiness with:

```bash
lm-webui status
curl http://localhost:7070/api/health
```

The app serves both the frontend and API. It does not install host drivers or host runtimes.

## Docker (alternative)

For containerized deployments, a Docker image bundles the application in one container:

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
docker compose up -d --build
```

Open `http://localhost:7070`. Check readiness with:

```bash
curl http://localhost:7070/api/health
docker compose ps
```

The container serves both the frontend and API. It does not install host drivers or host runtimes.

## Persistence

Native install keeps data on the host under `~/.lmwebui/`. Docker uses volumes mounted into the container:

| Data | Native | Docker |
| --- | --- | --- |
| SQLite/application data | `~/.lmwebui/data` | volume `app_data` → `/backend/data` |
| Generated media/uploads | `~/.lmwebui/data` | volume `app_media` → `/backend/media` |
| Local models | `~/.lmwebui/models` | `./.lmwebui/models` → `/backend/models` |
| Secrets | `~/.lmwebui/.secrets` | `./.lmwebui/secrets` → `/backend/.secrets` |

Back up the data and models before upgrades. Never commit `.env`, `.secrets`, API keys, databases, or model files.

## GGUF engine tuning

GGUF (llama.cpp) is bundled with hardware-aware defaults. Override via environment variables on the `lm-webui` service in `docker-compose.yml` (Docker) or in the native service environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `GGUF_N_CTX` | 4096 | Context window (1024–32768) |
| `GGUF_N_GPU_LAYERS` | -1 | GPU layers (-1=all, 0=CPU) |
| `GGUF_FLASH_ATTN` | 1 | Flash attention (1=on, 0=off) |
| `GGUF_CACHE_TYPE_K` | q8_0 | Key cache (f16, q8_0, q4_0) |
| `GGUF_CACHE_TYPE_V` | q8_0 | Value cache (f16, q8_0, q4_0) |
| `GGUF_N_THREADS` | 0 | CPU threads (0=auto) |

Context window, GPU toggle, and KV cache quality are also adjustable from the Runtime Manager UI (Settings → Runtime Manager). Env vars serve as system defaults; UI changes apply per-session.

### Vision (llama-server)

Vision models are served by `llama-server`. The installer (`install.sh`) installs it as part of the GGUF
runtime and adds it to the service `PATH`. If you deploy manually (e.g. Docker), ensure `llama-server` is on
the backend service `PATH` or Vision will report not-ready. Vision bundles live in `models/vision/<model>/`
and consist of a main GGUF plus its `mmproj`.

`CORS_ORIGINS` is a comma-separated allowlist of browser origins (defaults to `http://localhost:5177,
http://localhost:7070`). Browsers reject `*` together with credentials, so add your deployed origin here.

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

1. Run LM-WebUI on a trusted internal server (native install or Docker).
2. GGUF (llama.cpp engine) inference is available immediately — bundled with hardware-accelerated defaults.
3. For additional engines and runtimes:
   - Install the MLX framework on a macOS workstation, or Ollama/vLLM/ComfyUI on any host machine.
   - The Runtime Manager auto-detects running services via `localhost` (native) or `host.docker.internal` (Docker) probes.
   - Connect with one click from the admin Runtime Manager UI.
4. Configure API providers (OpenAI, Anthropic, Google, Ollama, vLLM) in Settings → API Providers.
5. Create users through the admin user-management menu.

> **Runtime Manager scope**: Manages inference engines and formats — llama.cpp (GGUF engine config), MLX (engine on Apple Silicon), and ComfyUI (image workflow runtime). Ollama and vLLM are configured as API providers, not managed runtimes.

Normal users cannot install runtimes, change endpoints, or control host services.

## Operations

Native install:

```bash
lm-webui start
lm-webui stop
lm-webui restart
lm-webui status
lm-webui logs
lm-webui update
```

Docker:

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

GPU drivers and kernel components must be installed through the host operating system. LM-WebUI does not install them automatically.

See [CLI reference](./cli.md), [Architecture](./architecture.md), and [Security](../SECURITY.md).
