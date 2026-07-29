# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.2] — 2026-07-29

Native host migration. Runtime Manager refocused, CLI wrapper, LAN access, portable install.

### Added
- **Native host install** — `curl -fsSL https://lmwebui.com/install.sh | sh` replaces Docker as primary distribution. Python venv + systemd/launchd service, no Docker required.
- **`lm-webui` CLI** — `start|stop|restart|status|logs|update` commands. `lm-webui update` pulls latest code from GitHub, preserves `~/.lmwebui/data/`, `models/`, `media/`, `secrets/`, `config.yaml`.
- **GGUF engine config in UI** — context window slider (1K–32K), GPU acceleration toggle, KV cache quality dropdown in Runtime Manager. Settings persist per-session, overridable via `GGUF_*` env vars.
- **LAN access panel** — QR code + LAN IP in Profile → Access. Mobile users scan to open on the same network.
- **Hardware-aware GGUF defaults** — flash_attn, n_gpu_layers, cache_type auto-configured from host hardware detection.

### Changed
- **Runtime Manager refocused** — now manages 3 runtimes: GGUF (in-container), MLX (in-process on Apple Silicon), ComfyUI (external). Ollama and vLLM moved to Settings → API Providers.
- **MLX inference** — reverted from external server to in-process `mlx_lm.load()`. Now works directly on macOS with full Metal acceleration.
- **Default port 8000 → 7070** — avoids conflicts with common dev servers. All configs, proxies, docs updated.
- **Directory structure** — data, models, config live in `~/.lmwebui/` (overridable via `LMWEBUI_HOME`). No Docker volume layer.
- **Detection uses localhost** — runtime probes use `localhost` instead of `host.docker.internal`.
- **Model paths moved** — from `./backend/models` to `./.lmwebui/models` (outside repo checkout, survives `rm -rf`).
- **Secrets moved** — from `./backend/.secrets` to `./.lmwebui/secrets`.

### Removed
- **Docker as primary distribution** — Docker Compose kept as alternative for server deployments, but `install.sh` no longer depends on Docker.
- **Ollama/vLLM from Runtime Manager** — configured via Settings → API Providers (standard provider pattern).
- **In-container MLX server** — MLX now runs in-process natively.
- **`RuntimeInstaller` module** — replaced with `RuntimeInstaller` using real `subprocess.run()` on host.
- **`APP_RUNTIME_DEFAULT_ENDPOINT`** — no longer needed.

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
