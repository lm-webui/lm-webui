# LM WebUI 🛡️

**LM-WebUI** makes running local AI as easy as installing an app. No more juggling separate apps, model or vendor limitations, or runtime setup headaches. A built-in Runtime Manager manages inference engines and models for you, while chat, vision, image generation, and file context all live in one interface on your own machine. Built for privacy-first and sovereign AI systems.

![lm-webui](assets/lm-webui-header.png)

<p align="center">
  <a href="https://github.com/lm-webui/lm-webui/actions">
    <img src="https://img.shields.io/badge/development-active-green" />
  </a>
  <a href="https://github.com/lm-webui/lm-webui/releases">
    <img src="https://img.shields.io/badge/release-v0.7.7-blue" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-black" />
  </a>
  <a href="https://lmwebui.com">
    <img src="https://img.shields.io/badge/Website-lmwebui.com-orange" />
  </a>
</p>

<p align="center">
  <b>Run Local AI, Without the Complexity</b>
</p>

---

No more setup maze. **LM-WebUI makes local AI inference easier to run and use.** Install and manage inference runtimes, download models, and work with local AI instantly from one interface.

Powered by **Smart-Modality™**, an intent-routing system that automatically determines what each request needs, chat, files, RAG, web search, vision, or image generation. No manual model switching, no unnecessary processing, and reducing unnecessary context to achieve more efficient inference especially on low resource hardware. Make your local AI workflow multimodal without making it more complicated.

Run locally when you want, connect cloud APIs when you need, and keep control of your data.

Built open-source for developers, system integrators, and organizations that want **easy local inference, reproducibility, and infrastructure-level control** without the usual setup overhead.

<p align="center">
  <img src="./assets/demo.png" width="1080" />
</p>

---

## 🚀 Quick Start

### One-Line Install (Recommended)

Install LM-WebUI with one command:

```bash
curl -fsSL https://lmwebui.com/install.sh | bash
```

The installer sets up LM-WebUI as a system service and starts it automatically.

Open `http://localhost:7070` in your browser.

Your models, data, and configuration are stored locally under ~/.lmwebui/. You can change the location with the LMWEBUI_HOME environment variable.

---

## ⚡ Core Features

| Feature | Capabilities |
|---|---|
| **Smart-Modality™** | Automatically chooses the right path for each request, direct chat, RAG, web search, vision, or image generation. So, simple tasks stay fast without unnecessary processing, retrieval runs only when you need past data, and web search combines with RAG/vision (or is skipped for direct image questions). |
| **Runtime Manager** | Manages the inference engines and model formats below — llama.cpp (GGUF), MLX, and ComfyUI (image workflows). Ollama and vLLM are configured as API providers in Settings. |
| **Files & RAG** | Upload documents, images, and audio for conversation context. Extract/OCR content, upload status, file references, and citation display. Retrieval via **Multimodal Latent RAG**: a single query finds relevant text chunks and visually-matching images (SigLIP2 shared latent space), fused with Reciprocal Rank Fusion. |
| **Multimodal Retrieval** | Cross-modal search across docs, images, and audio in one latent index (SigLIP2 text + vision, CLAP-ready). A text query returns matching paragraphs and diagrams/charts in a single pass. |
| **Multimodal Vision** | Analyze images, screenshots, diagrams, and other visual content using compatible local vision models — auto-routed, no manual model switching. Simple image questions answer directly via the vision model; complex ones compose with RAG and web context.
| **Chat** | Chat with local or cloud AI models from one interface. Supports GGUF/llama.cpp, MLX, Ollama, vLLM, OpenAI, Gemini, Anthropic, DeepSeek, Grok, and more. Includes streaming, code rendering, Mermaid diagrams, tables, conversations, and web search.|
| **Image Generation** | Dedicated Image Studio with prompt, size, quality, and seed controls. Gallery for browsing and reuse. Supports OpenAI, Google Gemini, and local ComfyUI runtimes. |
| **Projects** | Group related conversations with reusable custom system prompts. Ideal for recurring workflows like code review, research, or team-specific assistant configurations. |
| **Voice & Video** | Transcribe voice notes and audio (ASR → text into the retrieval index) and summarize linked YouTube videos — queried just like documents. |
| **Hardware Detection** | Automatic detection of CPU, CUDA, ROCm, and Apple Metal with dynamic memory and layer optimization for efficient local execution. |
| **GGUF / llama.cpp** | Built-in GGUF model lifecycle, download from HuggingFace, upload, validate, and serve models locally via the llama.cpp engine. Vision through `llama-server`. Background, single-flight download queue that survives closing the UI. |
| **MLX** | Inference on Apple Silicon via the MLX framework (`mlx-lm`). Model download from HuggingFace with one click. Seamless chat integration. |
| **Artifacts** | Persistent structured document storage with versioning, project and conversation association, and soft-delete support. |
| **Usage Analytics** | Token and request tracking per provider and model. Admin dashboard with usage summaries, per-user breakdowns, and CSV export. |
| **Self-Hosted Ready** | Native Python service, zero external telemetry, offline-capable. Data in `~/.lmwebui/`. Docker deployment also available. |

---

##  MLX

- **Apple Silicon Optimized**: Native MLX inference (`mlx-lm`) without an additional model server
- **One-Click Setup**: Install and manage MLX from the Runtime Manager
- **Model Management**: Download, organize, or remove MLX models with one click
- **HuggingFace Integration**: Direct download support from HuggingFace MLX repositories
- **Seamless Integration**: Use MLX models directly in the chat interface
- **Automatic Detection**: Auto-detects Apple Silicon hardware and manages the MLX framework

---

## 🤗 GGUF / llama.cpp

- **Model Management**: Download, organize, or remove GGUF models with one click
- **Vision Models**: Image-text-to-text (VL) GGUF models that auto-pair with their `mmproj` file
- **HuggingFace Integration**: Direct download from HuggingFace repositories with auto-resolved quantization options
- **Hardware Awareness**: Detects available hardware and helps you choose a compatible engine and model
- **Seamless Integration**: Use GGUF models directly in the chat interface

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

## 🔧 Development Setup

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

## 🚢 Deployment

### Native One-line Install

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

We welcome and appreciate all kinds of contributions!

Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add or update tests where appropriate
5. Submit a pull request

Not ready to code? Bug reports, feature ideas, documentation improvements, and real-world testing are also valuable contributions. 🙏
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
