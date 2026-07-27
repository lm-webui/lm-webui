# LM-WebUI

LM-WebUI is a self-hosted AI workspace for local and cloud models. It combines multimodal chat, image generation, model and runtime management, file context, and provider orchestration in one interface.

## What it includes

- Chat through OpenAI, Gemini, Anthropic, DeepSeek, xAI, vLLM, Ollama, GGUF, and MLX providers
- Image generation through OpenAI, Gemini, and local ComfyUI integrations
- GGUF and MLX model download and runtime management
- Hardware detection for CPU, CUDA, ROCm, and Apple Metal
- File uploads, context assembly, memory, and retrieval workflows
- Projects, sessions, authentication, encrypted API-key storage, and persistent SQLite data
- Docker deployment variants for CPU, CUDA, ROCm, Metal, and SYCL

## Quick start

### Docker

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
docker compose up --build
```

Open `http://localhost:7070`.

### Development

```bash
npm install
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..
npm run dev
```

The web client runs on the configured Vite port and proxies API requests to the FastAPI backend on port `8000`.

## Architecture

```text
backend/                 FastAPI application
  app/providers/         Remote and local model providers
  app/orchestrator/      Chat orchestration and streaming flow
  app/runtime/           Runtime detection and installation
  app/routes/            HTTP and WebSocket API routes
  app/services/          Models, images, files, and persistence services
  app/database/          SQLite schema and connection management
  app/security/          Authentication, encryption, and access control
web/                     React 19 + TypeScript application
landing/                 Public marketing and documentation website
docs/                    Canonical documentation source
```

The backend is a modular monolith. Providers implement a shared interface, the orchestrator coordinates chat execution, and the frontend consumes REST and WebSocket APIs.

## Documentation

Read the full documentation at [lm-webui.com/docs](https://lm-webui.com/docs).

- [Getting Started](docs/getting-started.md)
- [Features](docs/features.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

The files in `docs/` are the canonical source used by both GitHub and the documentation website.

## Development commands

```bash
npm run dev          # backend and web client
npm run build        # build the web client
npm run typecheck    # TypeScript checks
npm run test         # frontend tests
npm run lint         # frontend linting
```

## Deployment and runtimes

The recommended deployment is one LM-WebUI Docker container with runtimes installed outside the application container. Docker packages the web application, authentication, RBAC, projects, artifacts, and usage analytics; host runtimes provide hardware-specific inference.

```bash
docker compose up -d --build
```

Use the Runtime Manager as an administrator to register and test Ollama or another OpenAI-compatible local endpoint. Install host runtimes with the separate `lm-webui-host` CLI; the application container does not install drivers or modify the host operating system.

See [Host CLI](docs/cli.md) and [Deployment](docs/DEPLOYMENT.md) for setup, persistence, runtime endpoints, and troubleshooting.

## Project status

LM-WebUI is under active development. Interfaces, providers, and deployment options may change between releases. Check the documentation and changelog for current behavior.

## License

LM-WebUI is released under the MIT License. See [LICENSE](LICENSE).
