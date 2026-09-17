# LM-WebUI CLI

LM-WebUI ships two command-line tools:

- **`lm-webui`** — the service manager for a native install (start/stop/restart/status/logs/update). Installed by `install.sh` and symlinked to `/usr/local/bin/lm-webui`. The installer publishes this script from the release tarball, and there is deliberately no second copy, so the installed CLI cannot drift from the one in the repository. It also owns `__install-tree`, the routine that lays a release down over an existing install; `install.sh` calls it rather than keeping its own copy — that duplication is exactly how a release tarball's `config.yaml` came to overwrite a live one on `update` while the installer guarded against it.
- **`lm-webui-host`** — the host-runtime helper that installs and checks hardware-specific runtimes (MLX, ComfyUI) without giving the app host-level privileges.

## Service CLI (`lm-webui`)

The native install uses a service manager for the application:

```bash
lm-webui start       # Start the service, wait for it, then print health + the URL to open
lm-webui stop        # Stop the service
lm-webui restart     # Restart the service (same output as start)
lm-webui status      # Show health (checks GET /api/health) + the URL to open
lm-webui open        # Open the dashboard in this machine's browser
lm-webui logs        # Follow service logs
lm-webui update      # Download the latest release, install it, restart (preserves data)
```

`update` installs the latest release tarball and restarts the service. The frontend ships prebuilt
inside that tarball, so nothing is compiled on your machine. Your `data/`, `media/`, `models/`,
`cache/`, `secrets/`, `logs/`, `.venv/` and `config.yaml` are left untouched — `config.yaml` is
only ever created when missing, or migrated after a backup when it is in an old format.

`start` and `status` print an `Open:` line with the dashboard address. The service binds
`0.0.0.0:7070`, so the CLI reports this machine's LAN IPv4 (e.g. `http://192.168.1.20:7070`) and
`http://localhost:7070` together — the LAN address is the one that works from another device.
`open` targets `localhost` rather than the LAN address: the browser is on this machine, and the
LAN address may be a VPN or virtual interface.

When the service does not answer, `status` prints why instead of only reporting failure: whether
an uvicorn process is running, whether port `7070` is free and who holds it if not, whether
`.venv/bin/uvicorn` exists, whether `config.yaml` parses, and the last lines of the service log.
Same for a failed `start`, which calls `status` after its wait.

`status` also warns when no account exists yet — `/api/auth/status` reports that unauthenticated,
and the first user to register becomes admin, so an operator on an untrusted network wants to
know before someone else registers first. There is no setup token.

The port is fixed at `7070` in the service definition (systemd unit / launchd plist) and in this
CLI. `server.host`/`server.port` in `config.yaml` are not read by anything — edit the service
definition instead (or re-run `install.sh` to regenerate it).

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
lm-webui-host status                        # JSON inventory of this host, no network calls
lm-webui-host doctor                        # check the running app, then the host inventory
lm-webui-host doctor --url http://host:7070 # or set LMWEBUI_APP_URL
```

`doctor` checks the app is reachable, prints its health status and the reason for a failed
startup, and warns when no account exists yet. Pass `--url` (or `LMWEBUI_APP_URL`) when the app is
not on this machine — in Docker behind `host.docker.internal`, or on another host entirely. Exit
codes: `0` healthy, `1` unreachable, `2` malformed URL. `status` stays purely local so scripts can
consume its JSON.

## Runtime commands

`runtime install` accepts the runtimes in the table below; the app's host bridge uses the same
list, so a runtime the bridge can install is never rejected by the CLI.

```bash
lm-webui-host runtime install mlx
lm-webui-host runtime test http://127.0.0.1:8090
```

Preview without changing the host:

```bash
lm-webui-host runtime install mlx --dry-run
```

| Runtime | What it installs | When you need it |
| --- | --- | --- |
| `mlx` | `mlx`, `mlx-lm`, `mlx-optiq` into the active Python | Apple Silicon hosts; MLX runs as an external server on macOS |
| `ollama` | Ollama via its install script | Hosting models through Ollama |
| `vllm` | `vllm` into the active Python | Hosting models through vLLM |
| `gguf` | `llama-cpp-python` into the active Python | GGUF/llama.cpp on the host |
| `comfyui` | clones ComfyUI to `~/ComfyUI` and installs its requirements | Image generation on the host |

Ollama and vLLM can also be configured as API providers in Settings → API Providers without the
CLI; GGUF (llama.cpp) is bundled in-container, so no host installation is required there.

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
