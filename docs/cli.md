# LM-WebUI CLI

LM-WebUI uses one application container. Hardware-specific runtimes run on the host or as separate services. The host CLI installs and checks those runtimes without giving the application container host-level privileges.

## Install the host CLI

From a checkout:

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

## Runtime commands

```bash
lm-webui-host runtime list
lm-webui-host runtime detect
lm-webui-host runtime test http://127.0.0.1:11434
```

Install supported host runtimes with confirmation:

```bash
lm-webui-host runtime install ollama
lm-webui-host runtime install mlx
lm-webui-host runtime install gguf
lm-webui-host runtime install vllm
```

Preview an installation without changing the host:

```bash
lm-webui-host runtime install ollama --dry-run
```

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

The default Compose setup persists data, media, models, and secrets separately. Runtime endpoints are configured in the admin Runtime Manager. For a host Ollama service, use `http://host.docker.internal:11434`; Linux deployments should use the host gateway configuration supplied by Compose.

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

If a runtime is reachable from the host but not from Docker, verify the endpoint uses `host.docker.internal`, the host firewall permits the connection, and the runtime is listening beyond an inaccessible loopback address where required. Do not expose runtime endpoints publicly unless the office network and runtime authentication are configured appropriately.
