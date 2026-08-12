# LM WebUI 🛡️

**LM-WebUI** makes running local AI as easy as installing an app. No more juggling separate apps, model or vendor limitations, or runtime setup headaches. A built-in Runtime Manager will manages runtime and models for you, while chat, vision, image generation, and file context all live in one interface inside your own machine. Built for privacy-first and sovereign AI systems.

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
  <b>Local AI, without the setup maze</b>
</p>

---

No more setup maze. LM-WebUI makes local AI easier to install, manage, and use — download a model, choose a runtime, and start working from one interface. Smart-Modality automatically chooses the right path for each request, whether it is plain chat, RAG over your files, web search, vision, or image generation.

Run local AI offline when you want, connect cloud APIs when you need them, and keep control of your data and infrastructure.

Built open-source for developers, system integrators, and organizations that want local inference, reproducibility, and infrastructure-level control without the usual setup overhead.

---

## 🚀 Quick Start

### One-Line Install (Recommended)

Install LM-WebUI with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash
```

The installer sets up LM-WebUI as a system service and starts it automatically.

Open `http://localhost:7070` in your browser.

Your models, data, and configuration are stored locally under ~/.lmwebui/. You can change the location with the LMWEBUI_HOME environment variable.

### Development Setup

For contributors and developers who want to run LM-WebUI from source:

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui

# Start backend
cd backend
uv venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 7070

# In another terminal, start frontend
cd web
npm install
npm run dev
```

The development frontend runs on the configured Vite port and proxies API requests to the backend on port 7070.

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

##  MLX Runtime Highlights

- **Apple Silicon Optimized**: Native MLX inference without an additional model server
- **One-Click Runtime Setup**: Install and manage MLX directly from Runtime Manager
- **Model Management**: Download, organize, or remove MLX models with one click
- **HuggingFace Integration**: Direct download support from HuggingFace MLX repositories
- **Seamless Integration**: Use MLX models directly in chat interface
- **Automatic Detection**: Auto-detects Apple Silicon hardware and manages the MLX runtime

---

## 🤗 GGUF / llama.cpp Runtime Highlights

- **Model Management**: Download, organize, or remove GGUF models with one click
- **Vision Models**: Image-text-to-text (VL) GGUF models compatible with auto pair with each mmproj file
- **HuggingFace Integration**: Direct download from HuggingFace repositories and auto resolve quantization model options
- **Hardware Awareness**: Detects available hardware and helps you choose compatible runtime and model
- **Seamless Integration**: Use GGUF models directly in chat interface

---

## 📖 Documentation

For detailed documentation, see the [`docs/`](./docs/) directory:

- **[Getting Started](./docs/getting-started.md)** — Complete setup guide
- **[Features](./docs/features.md)** — Detailed feature documentation
- **[Architecture](./docs/architecture.md)** — Backend, frontend, provider, and runtime design
- **[Deployment](./docs/DEPLOYMENT.md)** — Production deployment guides
- **[CLI](./docs/cli.md)** — Host CLI reference
- **[Contributing](./CONTRIBUTING.md)** — How to contribute to the project
- **[Security](./SECURITY.md)** — Security policy and practices

---

## </> Architecture

LM-WebUI is a **React + FastAPI** application, a modular monolith backend and a feature-based frontend, orchestrated by a Smart-Modality router that routes each request to the right capability.

See **[docs/architecture.md](./docs/architecture.md)** for the full directory structure, module breakdown, data flows, and design decisions.

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

### Native One-line Install (recommended)

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
