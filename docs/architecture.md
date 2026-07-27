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

```
web/src/
├── components/     # UI components (shadcn/ui + custom)
│   ├── chat/       # Message bubbles, composer, loading
│   ├── models/     # Model selector, runtime manager
│   ├── settings/   # Settings modal with tabs
│   └── ui/         # Shadcn primitives
├── features/       # Domain logic
│   ├── chat/       # Chat service + creation hooks
│   ├── images/     # Studio (image gen), Gallery
│   ├── models/     # Model fetching + management
│   └── sessions/   # Session management
├── store/          # Zustand stores (chat, reasoning)
├── services/       # WebSocket client
└── utils/          # API client, model providers, storage
```

## Backend

**Stack:** FastAPI, SQLite, aiohttp

```
backend/app/
├── routes/         # REST + WebSocket endpoints
├── providers/      # AI provider implementations
│   ├── remote/     # OpenAI, Gemini
│   └── local/      # Ollama, GGUF, MLX
├── services/       # Image generation, file storage, model management
├── orchestrator/   # Chat flow controller
├── chat/           # Chat session + message persistence
├── database/       # SQLite schema + connection pool
├── hardware/       # GPU/CPU detection
├── memory/         # Context assembly + summarization
├── runtime/        # Runtime detection and external runtime metadata
└── security/       # JWT auth + encryption
```

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
| Ollama | Local | ✅ | ❌ |
| GGUF (llama.cpp) | Local | ✅ | ❌ |
| MLX | Local | ✅ | ❌ |
| ComfyUI | Local | ❌ | ✅ |

## Key Design Decisions

- **Single WebSocket** for all streaming (no SSE, no separate reasoning WS)
- **Shared save pipeline** for image generation (single DB transaction)
- **SQLite with WAL mode** for zero-config persistence
- **Connection pool** with 50 connections for concurrent access
- **Cookie-based auth** with JWT + refresh tokens
