# LM-WebUI Backend

FastAPI backend for LM-WebUI: AI model management, real-time streaming, multimodal processing, and retrieval-augmented generation.

- **Runtime**: Python 3.13 · **HTTP**: `0.0.0.0:7070`
- **Stack**: FastAPI, WebSockets, SQLite, LanceDB, SigLIP2, llama.cpp/MLX

## Quick Start

```bash
cd backend
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt

# dev (auto-reload)
uvicorn app.main:app --host 0.0.0.0 --port 7070 --reload

# prod
uvicorn app.main:app --host 0.0.0.0 --port 7070
```

### Verify

```bash
curl http://localhost:7070/api/health
# {"status":"ready","ready":true,"message":...,"progress":100,"version":"0.7.7"}
```

### Configuration

Settings come from `config.yaml` (checked in) and environment variables. Create `.env` to override:

```
BACKEND_HOST=0.0.0.0
BACKEND_PORT=7070
DATABASE_URL=sqlite:///./data/app.db
```

## Features

| Area | Function |
|---|---|
| **Auth & Security** | JWT with refresh tokens, API keys, encryption of stored secrets |
| **Streaming** | Real-time WebSocket token streaming (chat + multimodal) |
| **Providers** | OpenAI-compatible (OpenAI, DeepSeek, xAI, vLLM), Gemini, Anthropic, Ollama, ComfyUI, MLX |
| **GGUF / llama.cpp** | Download from HuggingFace, upload, validate, serve; vision via `llama-server` |
| **MLX** | Apple Silicon inference via `mlx-lm`, one-click model download |
| **RAG** | LanceDB vector+FTS hybrid, BGE-small embeddings, FlashRank rerank |
| **Multimodal RAG** | Late-fusion retrieval: SigLIP2 shared latent (text + vision tables), Reciprocal Rank Fusion |
| **Files & OCR** | Upload, text extraction, OCR, chunking, citation tracking |
| **Hardware** | Auto-detect CPU / CUDA / ROCm / Metal with memory & layer tuning |
| **Governance** | Usage analytics, admin dashboard, orgs, per-provider/model token tracking |

## Project Structure

```
backend/
├── app/
│   ├── main.py             # FastAPI entry point, router registration, /api/health
│   ├── routes/             # HTTP + WebSocket API endpoints
│   ├── rag/                # RAG pipeline (embed, chunk, store, rerank, late-fusion)
│   ├── providers/          # Provider adapters (remote + local: ollama, comfyui, mlx)
│   ├── runtime/            # Inference engine lifecycle (llama.cpp, mlx, comfyui)
│   ├── modality/           # Smart-Modality router
│   ├── orchestrator/       # Per-session orchestration
│   ├── security/           # JWT auth, encryption, api keys
│   ├── hardware/           # Device detection & optimization
│   ├── database/           # SQLite layer + migrations
│   ├── files/              # Upload / OCR / extraction
│   ├── services/           # Business logic
│   ├── governance/         # Usage, admin, orgs
│   ├── memory/             # Persistent memory
│   └── search/             # Web search
├── tests/                  # Pytest suite
├── config.yaml             # Runtime configuration
└── requirements.txt        # Python dependencies
```

## Testing

```bash
cd backend
make install-dev     # install dev + test deps
make test            # pytest
make test-cov        # pytest with coverage
make lint            # linting
```

Or directly: `pip install -r requirements-test.txt && pytest`

## Development

1. Add a router in `app/routes/` (or a feature under `app/<feature>/`)
2. Register it in `app/main.py` via `app.include_router(...)`
3. Follow PEP 8, type hints, docstrings, and add tests in `tests/`

## Links

- **Main project**: [github.com/lm-webui/lm-webui](https://github.com/lm-webui/lm-webui)
- **Docs**: [`../docs/`](../docs/) · **Issues**: [GitHub Issues](https://github.com/lm-webui/lm-webui/issues)
