---
title: Architecture
description: Understand the modular backend, providers, runtimes, and frontend structure.
section: Project
order: 3
---

# System Architecture

## Overview

LM-WebUI is a React + FastAPI application with a modular monolith backend and a feature-based frontend. It provides chat and image generation through multiple AI providers under a single dashboard.

## Frontend

**Stack:** React 19, TypeScript, Vite, Tailwind CSS, Zustand

The frontend is organized by feature area (chat, images, models, sessions), backed by Zustand stores and a shared API/WebSocket client. UI primitives are shadcn/ui plus a small set of custom components.

## Backend

**Stack:** FastAPI, SQLite, aiohttp

The backend is a modular monolith. Key modules:

- **routes** — REST + WebSocket endpoints
- **providers** — AI provider implementations (`remote/` for cloud APIs, `local/` for local runtimes)
- **orchestrator** — chat flow controller (Smart-Modality entry point)
- **modality** — intent classifier + execution planner (decides whether a request is plain chat, RAG, search, image, or vision)
- **capabilities** — capability executor (chat, vision, retrieve/search, image generation)
- **chat / memory** — session and message persistence, context assembly + summarization
- **agents** — the Agent Hub: per-provider CLI adapters (`app/agents/providers.py`), a stream-json
  interactive runner (`runner.py`), session + run tracking (`sessions.py`), `--help`-parsed command
  discovery (`registry.py`), and routes under `routes/agents.py`
- **database** — SQLite schema + connection pool
- **hardware / runtime** — GPU/CPU detection and external runtime metadata; `vision_runtime` manages the `llama-server` subprocess for Vision
- **security** — JWT auth + encryption
- **services / files** — image generation, file storage, model management

## Data Flow

### Chat
```
User → WebSocket/REST → Orchestrator → Intent Classifier → Execution Plan
     → Capability Executor → Chat/Vision Capability → Provider → LLM → Stream → UI
```

### Vision
```
User attaches image → Smart-Modality (VISION) → Vision Capability
     → ensure llama-server → launch llama-server --model <main> --mmproj <mmproj>
     → VL provider (OpenAI-compatible)
        ├─ simple query ("what's in this image") → VL answers directly → Stream → UI
        └─ complex query → VL describes → description injected → selected chat model
                          → composes final answer → Stream → UI
```

### Image Generation (Studio)
```
Studio → POST /api/images/generate → Handler → API/ComfyUI → Save → Gallery
```

### Model Management
```
Model Selector → GET /api/models/* → Model Registry → Provider.list_models()
```

### Agent Hub chat
```
UI → POST /api/agents/{agent}/chat/stream (SSE) → spawn `claude -p --resume <id>` (stream-json)
     → stream output / prompt / run frames → persist claude session id → SSE to UI
```

Multi-turn model: Claude owns its transcript on disk; each turn spawns a **fresh** `--resume <id>`
process (no persistent subprocess to keep alive), so sessions survive backend restarts. Tool
permissions run with `--dangerously-skip-permissions` so agents execute unattended.

## Supported Providers

| Provider | Type | Chat | Images |
|---|---|---|---|
| OpenAI | Cloud | ✅ | ✅ |
| Google Gemini | Cloud | ✅ | ✅ |
| Anthropic (Claude) | Cloud | ✅ | ❌ |
| DeepSeek | Cloud (OpenAI-compatible) | ✅ | ❌ |
| xAI | Cloud (OpenAI-compatible) | ✅ | ❌ |
| vLLM | Self-hosted (OpenAI-compatible) | ✅ | ❌ |
| Ollama | Local | ✅ | ❌ |
| GGUF (llama.cpp) | In-container | ✅ | Vision ✅ (via llama-server) · Gen ❌ |
| MLX | External (host server) | ✅ | ❌ |
| ComfyUI | External (host server) | ❌ | ✅ (image generation) |

## Key Design Decisions

- **Single WebSocket** for all streaming (no SSE, no separate reasoning WS)
- **Shared save pipeline** for image generation (single DB transaction)
- **SQLite with WAL mode** for zero-config persistence
- **Connection pool** with 50 connections for concurrent access
- **Cookie-based auth** with JWT + refresh tokens
- **Runtime architecture** — the Runtime Manager orchestrates inference engines and formats in two tiers: (1) **managed** — the llama.cpp engine (GGUF format) bundled in-container with hardware-aware defaults and UI-configurable engine params; (2) **detected** — the MLX framework (`mlx-lm`) and the ComfyUI workflow runtime run on the host, discovered via HTTP probes on `localhost` (native) or `host.docker.internal` (Docker). Ollama and vLLM are standard API providers (Settings → API Keys), not managed runtimes.
