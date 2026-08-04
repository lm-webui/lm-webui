# LM-WebUI CLI

LM-WebUI ships two command-line tools:

- **`lm-webui`** — the service manager for a native install (start/stop/restart/status/logs/update). Installed by `install.sh` and symlinked to `/usr/local/bin/lm-webui`.
- **`lm-webui-host`** — the host-runtime helper that installs and checks hardware-specific runtimes (MLX, ComfyUI) without giving the app host-level privileges.

## Service CLI (`lm-webui`)

The native install uses a service manager for the application:

```bash
lm-webui start       # Start the service (systemd on Linux, launchd on macOS)
lm-webui stop        # Stop the service
lm-webui restart     # Restart the service
lm-webui status      # Show health (checks GET /api/health)
lm-webui logs        # Follow service logs
lm-webui update      # Pull latest code, rebuild frontend, restart (preserves data)
```

Data lives in `~/.lmwebui/` (configurable via `LMWEBUI_HOME`): application code under `app/`/`web/`, data in `data/`, models in `models/`, logs in `logs/`.

## Host runtime CLI (`lm-webui-host`)

Install from a checkout:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e cli
```

Verify it:

```bash
lm-webui-host status
lm-webui-host doctor
```

## Runtime commands (MLX only)

MLX runs as an external server on macOS hosts. The CLI can install and manage it:

```bash
lm-webui-host runtime install mlx
lm-webui-host runtime list
lm-webui-host runtime test http://127.0.0.1:8090
```

Preview without changing the host:

```bash
lm-webui-host runtime install mlx --dry-run
```

**Other runtimes**: ComfyUI is installed by cloning its repository. Ollama and vLLM are configured as API providers in Settings → API Providers (no CLI needed). GGUF (llama.cpp) is bundled in-container — no host installation required.

The CLI does not install NVIDIA, AMD, Intel, or operating-system kernel drivers. Install those through the host operating system's supported vendor process.

## Docker commands

Start the single application container:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

The application is available at `http://localhost:7070`. Readiness is reported by:

```bash
curl http://localhost:7070/api/health
```

External runtime endpoints are detected automatically via HTTP probes on `localhost` (native) or `host.docker.internal` (Docker). For API providers (Ollama, vLLM), configure the endpoint URL in Settings → API Providers.

## Repository development commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test
npm run docker:build
npm run docker:dev
```

Backend checks:

```bash
python -m pip install -r backend/requirements.txt
PYTHONPATH=backend uvicorn app.main:app --reload
PYTHONPATH=backend python -m compileall backend/app
PYTHONPATH=backend pytest
```

## Runtime Manager permissions

Runtime changes are administrator-only. The application uses these permissions:

| Permission | Purpose |
| --- | --- |
| `runtime.view` | View runtime status and models |
| `runtime.configure` | Register or edit external runtime endpoints |
| `runtime.install` | Receive host installation instructions |
| `runtime.control` | Reserved for approved start/stop controls |

Normal users can use models made available by an administrator but cannot install runtimes, change endpoints, or control host services.

## Troubleshooting

Check the host runtime first:

```bash
lm-webui-host status
lm-webui-host runtime test http://127.0.0.1:11434
```

Then check the container:

```bash
docker compose ps
docker compose logs --tail=200 lm-webui
curl http://localhost:7070/api/health
```

If a runtime is reachable from the host but not from the app, verify the firewall permits the connection and the runtime is listening on `0.0.0.0` (not `127.0.0.1`). For Docker deployments, use `host.docker.internal` instead of `localhost`. Do not expose runtime endpoints publicly.
