# LM WebUI 🛡️

**LM-WebUI** is a unified Local AI interface and LLM runtime platform, built for privacy-first and sovereign AI systems.
Native support for run local GGUF model inference, Ollama, and API-based models like OpenAI and Gemini, with multimodal RAG pipelines, and persistent vector memory.

<p align="center">
  <img src="./assets/demo.png" width="1080" />
</p>

<p align="center">
  <a href="https://github.com/lm-webui/lm-webui/actions">
    <img src="https://img.shields.io/badge/development-active-green" />
  </a>
  <a href="https://github.com/lm-webui/lm-webui/releases">
    <img src="https://img.shields.io/badge/release-v0.1.0-blue" />
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

Built open-source for comunity, developers, system integrators, and organizations that require **local inference, reproducibility, and infrastructure-level control**, lm-webui bridges the power of modern cloud LLM features with the integrity of local data ownership.

Run fully offline, integrate with cloud APIs when needed, and deploy across environments without sacrificing performance, privacy, or sovereignty.

> ⚠️ **Work in Progress (WIP)**
> lm-webui is under active development. Features, APIs, and architecture may change as the project evolves. Contributions, feedback, and early testing are welcome, but expect breaking changes.

---

## 🚀 Quick Start

### One-Line Installation (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash
```

This will:

1. Check for Docker and Docker Compose
2. Clone the repository (if needed)
3. Set up environment configuration
4. Build and start the Docker containers
5. Provide access instructions

Access the application at `http://localhost:7070`

---

## ⚡ Core Features

| Feature                   | Capabilities                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**        | Secure JWT-based authentication with refresh tokens and persistent user sessions. Designed for multi-user deployments and role-aware environments. |
| **WebSocket Streaming**   | Bidirectional streaming with structured events, typing indicators, cancellation support, and step-by-step reasoning visibility.                    |
| **Hardware Acceleration** | Automatic CUDA, ROCm, and Metal detection with dynamic Memory and Layer optimization for efficient local execution across GPUs and CPUs.           |
| **GGUF Runtime**          | Built-in GGUF model lifecycle management download, load, quantize, and serve models locally with HuggingFace compatibility.                        |
| **RAG Engine**            | Modular retrieval pipeline powered by Qdrant for vector search, reranking, semantic chunking, and context injection.                               |
| **Multimodal Processing** | Image and document processing with OCR, embedding, and structured content extraction for unified chat workflows.                                   |
| **Knowledge Graph**       | Triplet-based semantic memory and entity relationship tracking to enhance long-term contextual understanding.                                      |
| **Self-Hosted Ready**     | Effortless on-prem, private cloud, and isolated deployments with no required external telemetry.                                                   |

### 🤗 GGUF Runtime Highlights

- **Model Management**: Upload/download GGUF models with progress tracking
- **HuggingFace Integration**: Direct download from HuggingFace repositories
- **Hardware Compatibility**: Automatic model validation for your system
- **Local Registry**: Manage and organize local GGUF models
- **Seamless Integration**: Use GGUF models directly in chat conversations

---

## 📖 Documentation

For detailed documentation, see the [`docs/`](./docs/) directory:

- **[Getting Started](./docs/getting-started.md)** - Complete setup guide
- **[Features](./docs/architecture.md)** - Detailed feature documentation
- **[Deployment](./docs/DEPLOYMENT.md)** - Production deployment guides
- **[Contributing](./CONTRIBUTING.md)** - How to contribute to the project

---

## </> Architecture Overview

lm-webui follows a modern microservices-inspired architecture:

```
lm-webui/
├── backend/           # FastAPI backend with WebSocket streaming
│   ├── app/          # Application code
│   │   ├── routes/   # API endpoints (chat, auth, gguf, etc.)
│   │   ├── streaming/# WebSocket streaming system
│   │   ├── rag/      # RAG pipeline with vector search
│   │   ├── services/ # Core services (GGUF, model management, etc.)
│   │   ├── hardware/ # Hardware acceleration detection
│   │   └── security/ # Authentication & encryption
│   └── tests/        # Backend tests
├── frontend/         # React/TypeScript frontend
│   ├── src/          # Source code
│   │   ├── components/# UI components
│   │   ├── services/ # API and WebSocket services
│   │   ├── hooks/    # Custom React hooks
│   │   └── types/    # TypeScript type definitions
│   └── __tests__/    # Frontend tests
└── docs/             # Documentation
```

---

## 🔧 Development

### Prerequisites

- **Backend**: Python 3.9+, PostgreSQL/SQLite
- **Frontend**: Node.js 16+, npm/yarn
- **Optional**: Docker, CUDA/ROCm for GPU acceleration

### Development Setup

For development work, you can use either the Docker-based setup or manual installation:

#### Docker-based Development

```bash
# Quick setup using the installation script
curl -sSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash

# Or manually with Docker Compose
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
docker-compose up --build
```

#### Manual Development Setup

```bash
# 1. Clone and setup
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui

# 2. Backend setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-test.txt  # For testing

# 3. Frontend setup
cd ../frontend
npm install

# 4. Run tests
cd ../backend && pytest
cd ../frontend && npm test
```

---

## 📝 Roadmap & Known Limitations

### Known Limitations

- Some multimodal pipelines are still experimental
- Hardware acceleration behavior may vary across GPU vendors
- RAG metadata handling is functional but not yet fully standardized
- Media library under development

### Roadmap (High-Level)

**Near-term**

- Stabilize core orchestration APIs and configuration schema
- Improve GGUF deployment automation and quantization presets
- Expand hardware detection and backend fallback logic

**Mid-term**

- Add stronger RAG governance (source versioning, metadata filters)
- Introduce model bundle validation and optional signature checks
- Improve workflow reproducibility and export/import support

**Long-term**

- Advanced scheduling for multi-GPU and multi-model workloads
- Adapter/LoRA management for task-specific fine-tuning
- Enterprise features

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/contributing.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **Website**: [lmwebui.com](https://lmwebui.com)
- **GitHub**: [github.com/lm-webui/lm-webui](https://github.com/lm-webui/lm-webui)
- **Issues**: [GitHub Issues](https://github.com/lm-webui/lm-webui/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lm-webui/lm-webui/discussions)

---

## ⭐ Star History

<p align="center">
  <a href="https://star-history.com/#lm-webui/lm-webui&Date">
    <img src="https://api.star-history.com/svg?repos=lm-webui/lm-webui&theme=dark"/>
  </a>
</p>

<p align="center">
  <b></b>Let’s shape the future of local AI together 🤜🤛</b>
</p>
