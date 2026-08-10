# LM WebUI 🛡️

**LM-WebUI** is a self-hosted private multimodal AI workspace with runtime manager. It combines multimodal chat, and image generation with multi-model (local and cloud models) compatible, file context, and provider orchestration in one interface — built for privacy-first and sovereign AI systems.

<p align="center">
  <img src="./assets/demo.png" width="1080" />
</p>

<p align="center">
  <a href="https://github.com/lm-webui/lm-webui/actions">
    <img src="https://img.shields.io/badge/development-active-green" />
  </a>
  <a href="https://github.com/lm-webui/lm-webui/releases">
    <img src="https://img.shields.io/badge/release-v0.7.0-blue" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-black" />
  </a>
  <a href="https://lmwebui.com">
    <img src="https://img.shields.io/badge/Website-lmwebui.com-orange" />
  </a>
</p>

<p align="center">
  <b>Run AI on your control</b>
</p>

---

Built open-source for the community, developers, system integrators, and organizations that require **local inference, reproducibility, and infrastructure-level control**, lm-webui bridges the power of modern cloud LLM features with the integrity of local data ownership.

Run fully offline, integrate with cloud APIs when needed, and deploy across environments without sacrificing performance, privacy, or sovereignty.

---

## 🚀 Quick Start

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash
```

This will install Python dependencies, create `~/.lmwebui/` for data and models, build the frontend, and start the service.

Open `http://localhost:7070`.

### Manual / Development

```bash
# 1. Clone and set up backend
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
cd backend
# Using uv (recommended, fast): uv venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt
# Or using pip: python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uv venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt

# 2. Start backend
uvicorn app.main:app --host 0.0.0.0 --port 7070

# 3. In another terminal, start frontend dev server
cd web
npm install
npm run dev
```

The web client runs on the configured Vite port and proxies API requests to the FastAPI backend on port `7070`.

---

## ⚡ Core Features

| Feature | Capabilities |
|---|---|
| **Authentication** | Secure JWT-based authentication with httpOnly cookies, refresh tokens, session persistence, and role-based permissions. Remember-me toggle for session control. |
| **Chat** | Multi-provider chat through OpenAI, Gemini, Anthropic, DeepSeek, xAI, vLLM, Ollama, GGUF (llama.cpp), and MLX. Streaming responses, code rendering, Mermaid diagrams, conversation management, and search. Smart-Modality routes each request to the right capability (plain chat, RAG, search, image, vision). |
| **Vision** | Multimodal image understanding with image-text-to-text (VL) GGUF models served through `llama-server`. Simple queries ("what's in this image") use the VL directly; complex ones pair a small VL's visual description with your selected text model for the final answer. Vision bundles pair a main GGUF with an `mmproj` in `models/vision/<model>/`. |
| **Image Generation** | Dedicated Image Studio with prompt, size, quality, and seed controls. Gallery for browsing and reuse. Supports OpenAI, Google Gemini, and local ComfyUI runtimes. |
| **Projects** | Group related conversations with reusable custom system prompts. Ideal for recurring workflows like code review, research, or team-specific assistant configurations. |
| **File Context** | Upload files for conversation context. Image and document processing (incl. OCR), upload status, file references with conversations, and citation display in chat. |
| **GGUF Runtime** | Built-in GGUF model lifecycle — download from HuggingFace, upload, validate, and serve models locally. Vision via `llama-server`. Background, single-flight download queue that survives closing the UI. |
| **MLX Runtime** | Inference on Apple Silicon via mlx-lm. Model download from HuggingFace with one click. Seamless chat integration. |
| **Hardware Detection** | Automatic detection of CPU, CUDA, ROCm, and Apple Metal with dynamic memory and layer optimization for efficient local execution. |
| **Runtime Manager** | Manage GGUF (in-container with hardware-accelerated defaults), MLX (Apple Silicon in-process), and ComfyUI (image generation). Ollama and vLLM are configured as API providers in Settings. |
| **Artifacts** | Persistent structured document storage with versioning, project and conversation association, and soft-delete support. |
| **Usage Analytics** | Token and request tracking per provider and model. Admin dashboard with usage summaries, per-user breakdowns, and CSV export. |
| **Self-Hosted Ready** | Native Python service, zero external telemetry, offline-capable. Data in `~/.lmwebui/`. Docker deployment also available. |

---

## 🤗 GGUF Runtime Highlights

- **Model Management**: Upload and download GGUF models with progress tracking
- **Vision Models**: Image-text-to-text (VL) GGUF models served via `llama-server`, paired with their `mmproj` in `models/vision/<model>/`
- **Background Downloads**: Single-flight queue (one at a time) that continues even if you close the UI; progress resyncs on reopen
- **HuggingFace Integration**: Direct download from HuggingFace repositories
- **Hardware Compatibility**: Automatic model validation for your system
- **Local Registry**: Manage and organize local GGUF models
- **Seamless Integration**: Use GGUF models directly in chat conversations

---

## 📖 Documentation

For detailed documentation, see the [`docs/`](./docs/) directory:

- **[Getting Started](./docs/getting-started.md)** — Complete setup guide
- **[Features](./docs/features.md)** — Detailed feature documentation
- **[Architecture](./docs/architecture.md)** — Backend, frontend, provider, and runtime design
- **[Deployment](./docs/DEPLOYMENT.md)** — Production deployment guides
- **[CLI](./docs/cli.md)** — Host CLI reference
- **[Contributing](./CONTRIBUTING.md)** — How to contribute to the project
- **[Security](./SECURITY.md)** — Security政策和 practices

---

## </> Architecture Overview

LM-WebUI is a React + FastAPI application with a modular monolith backend and a feature-based frontend.

```
lm-webui/
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── routes/        # REST + WebSocket API endpoints
│   │   ├── providers/     # AI provider implementations (remote + local)
│   │   ├── orchestrator/  # Chat flow controller and streaming
│   │   ├── modality/      # Intent classifier + execution planner (Smart-Modality)
│   │   ├── capabilities/  # Capability executor (chat, vision, RAG, search, image)
│   │   ├── services/      # Models, images, files, audit, usage tracking
│   │   ├── chat/          # Session and message persistence
│   │   ├── database/      # SQLite schema, migrations, connection pool
│   │   ├── hardware/      # GPU/CPU detection and quantization
│   │   ├── memory/        # Context assembly and conversation summarization
│   │   ├── runtime/       # Runtime detection + vision_runtime (llama-server)
│   │   └── security/      # JWT authentication, encryption, RBAC
│   └── tests/             # Backend tests
├── web/                   # React 19 + TypeScript frontend
│   ├── src/
│   │   ├── components/    # UI components (shadcn/ui + custom)
│   │   ├── features/      # Domain logic (chat, images, models, sessions)
│   │   ├── store/         # Zustand state management
│   │   ├── services/      # WebSocket client and API services
│   │   └── utils/         # API client, providers, helpers
│   └── dist/              # Built frontend (served by backend in production)
└── docs/                  # Canonical documentation
```

The backend is a modular monolith. Providers implement a shared interface, the orchestrator coordinates chat execution, and the frontend consumes REST and WebSocket APIs.

### Data Flow

```
Chat:     User → WebSocket/REST → Orchestrator → Provider → LLM → Stream → UI
Images:   Studio → POST /api/images/generate → Handler → API/ComfyUI → Save → Gallery
Models:   Model Selector → GET /api/models/* → Model Registry → Provider.list_models()
```

---

## 🔧 Development Commands

```bash
npm run dev          # Start both backend and web client
npm run build        # Build the web client (output: web/dist/)
npm run typecheck    # TypeScript checks
npm run test         # Frontend tests
npm run lint         # Frontend linting
npm run format       # Format frontend code
```

---

## 🚢 Deployment

### Native service (recommended)

The `install.sh` script sets up a systemd (Linux) or launchd (macOS) service running on port 7070.

```bash
curl -fsSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash
```

Data, models, and config live in `~/.lmwebui/` (override with `LMWEBUI_HOME` environment variable).

### Docker (alternative)

For containerized server deployments, Docker Compose is available in the repository:

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
docker compose up --build
```

Open `http://localhost:7070`.

### Persistence

| Data | Location |
|---|---|
| SQLite / application data | Docker volume → `/backend/data` |
| Generated media / uploads | Docker volume → `/backend/media` |
| Local models | `./.lmwebui/models` → `/backend/models` |
| Secrets | `./.lmwebui/secrets` → `/backend/.secrets` |

See [Host CLI](./docs/cli.md) and [Deployment](./docs/DEPLOYMENT.md) for setup, runtime endpoints, and troubleshooting.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **Website**: [lmwebui.com](https://lmwebui.com)
- **GitHub**: [github.com/lm-webui/lm-webui](https://github.com/lm-webui/lm-webui)
- **Issues**: [GitHub Issues](https://github.com/lm-webui/lm-webui/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lm-webui/lm-webui/discussions)

---

<p align="center">
  <b>Let's shape the future of local AI together 🤜🤛</b>
</p>
