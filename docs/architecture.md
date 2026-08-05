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
- **orchestrator** — chat flow controller
- **chat / memory** — session and message persistence, context assembly + summarization
- **database** — SQLite schema + connection pool
- **hardware / runtime** — GPU/CPU detection and external runtime metadata
- **security** — JWT auth + encryption
- **services / files** — image generation, file storage, model management

## Data Flow

### Chat
```
User → WebSocket/REST → Orchestrator → Provider → LLM → Stream → UI
```

### Image Generation (Studio)
```
Studio → POST /api/images/generate → Handler → API/ComfyUI → Save → Gallery
```

### Model Management
```
Model Selector → GET /api/models/* → Model Registry → Provider.list_models()
```

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
| GGUF (llama.cpp) | In-container | ✅ | ❌ |
| MLX | External (host server) | ✅ | ❌ |
| ComfyUI | External (host server) | ❌ | ✅ |

## Key Design Decisions

- **Single WebSocket** for all streaming (no SSE, no separate reasoning WS)
- **Shared save pipeline** for image generation (single DB transaction)
- **SQLite with WAL mode** for zero-config persistence
- **Connection pool** with 50 connections for concurrent access
- **Cookie-based auth** with JWT + refresh tokens
- **Runtime architecture** — runtimes split into two tiers: (1) **managed** — GGUF bundled in-container with hardware-aware defaults and UI-configurable engine params; (2) **detected** — MLX and ComfyUI run as external servers on the host, discovered via HTTP probes on `localhost` (native) or `host.docker.internal` (Docker). Ollama and vLLM are standard API providers (Settings → API Keys), not runtimes.
