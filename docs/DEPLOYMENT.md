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

## External runtimes

Install host runtimes outside the application container:

```bash
python -m pip install -e cli
lm-webui-host status
lm-webui-host runtime install ollama
```

For Ollama, the default endpoint is usually `http://host.docker.internal:11434`. On Linux, Compose provides the host gateway alias. If the host runtime is not reachable, verify its bind address and firewall. Use the admin Runtime Manager to register and test the endpoint.

Supported initial runtime categories:

- Ollama
- OpenAI-compatible local services
- vLLM through its OpenAI-compatible API
- llama.cpp server
- Native MLX on Apple Silicon

## Office deployment

For a small office or SMB deployment:

1. Run LM-WebUI on a trusted internal server.
2. Install Ollama, vLLM, or another runtime on the host or a dedicated runtime machine.
3. Register the runtime from the admin Runtime Manager.
4. Approve the models users may access.
5. Create users through the admin user-management menu.
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
