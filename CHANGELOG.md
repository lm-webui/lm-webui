# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-07-28

### Changed
- Runtime Manager refocused to 3 managed runtimes: GGUF (in-container), MLX (external on macOS host), ComfyUI (external)
- Ollama and vLLM moved to Settings → API Providers (standard provider pattern, not managed runtimes)
- MLX now detected and connected as external server — install `mlx_lm.server` on macOS host, WebUI connects via HTTP API
- GGUF engine config adjustable from Runtime Manager UI (context window slider, GPU toggle, KV cache quality)
- Hardware-aware GGUF defaults — flash_attn, n_gpu_layers, cache_type auto-configured from host hardware
- Model storage moved from `./backend/models` to `./.lmwebui/models` (outside repo checkout — survives `rm -rf`)
- Secrets moved from `./backend/.secrets` to `./.lmwebui/secrets`
- Runtime detection uses HTTP probing on `host.docker.internal` — no host agent, no Docker socket needed
- MLX provider rewritten as HTTP client — connects to `mlx_lm.server` instead of in-process `mlx_lm.load()`

### Removed
- Ollama and vLLM from Runtime Manager UI (configured via Settings → API Providers)
- `/api/runtimes/install` endpoint (runtime installation delegated to host CLI)
- `RuntimeInstaller` module — replaced with `MLXManager` (setup scripts for host-side install)

## [0.5.0] — 2026-07-27

A fresh foundation. Stripped unused systems, hardened core auth, cleaned the entire repo, and prepared for the next generation.

### Added
- Remember-me toggle on login — session cookies vs persistent, survives browser restart
- Configurable JWT token TTLs via `APP_SECURITY_*` environment variables
- Usage analytics dashboard with per-user breakdown and CSV export
- Artifacts system — versioned structured document storage with project/conversation association
- Multi-provider image generation studio (OpenAI, Gemini, ComfyUI)
- Runtime Manager — detect, register, and test Ollama, vLLM, GGUF, MLX, ComfyUI

### Changed
- Login persistence fixed — `SameSite=None` + no `Secure` was silently dropping cookies on Chrome restart. Changed to `SameSite=Lax` (same-origin; no HTTPS needed)
- Token TTLs moved from hardcoded values to `config_manager` — now set via env vars or `config.yaml`
- README rewritten end-to-end — current features, accurate architecture, working installation flow
- CI workflows repaired — `frontend/` → `web/`, removed references to deleted modules and variant Dockerfiles
- `.gitignore` stripped of 30+ stale entries, added missing coverage/pytest-cache patterns

### Removed
- **Outdated RAG module** — chunking, embedding, vector store, hybrid search, reranker, OCR, web search. Replaced by direct file context injection via `media_library.extracted_text`
- **Outdated Reasoning module** — service, session, formatters, parser. Core streaming remains
- **Docker publish CI matrix** — replaced with single-image build
- **Root npm dev dependencies** — `concurrently` and `cross-env` no longer shipped in Docker image

### Planning
- Lightweight RAG evaluated — LanceDB selected (disk-first, hybrid search). Implementation deferred to next release

---

## [0.3.1] — 2026-03-19

- Advanced reasoning visibility in streaming
- Parallel chat and extended model support
- Improved WebSocket event structure

## [0.3.0] — 2026-03-10

- JWT authentication with refresh tokens
- Parallel inference and batch processing API
- Backend API standardization and UI improvements

## [0.2.0] — 2026-02-15

- WebSocket streaming and multi-provider (OpenAI, Gemini)
- RAG pipeline with Qdrant *(removed in 0.5.0)*
- FastAPI backend migration

## [0.1.0] — 2026-01-20

- Initial release: GGUF via llama.cpp, basic chat, hardware detection (CUDA, ROCm, Metal)
