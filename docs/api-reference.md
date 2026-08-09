---
title: API Reference
description: LM-WebUI backend API endpoints and WebSocket streaming
---

# API Reference

LM-WebUI exposes a REST API on the backend server plus a WebSocket channel for streaming chat. Unless noted, every endpoint below lives under the base URL and requires an authenticated session.

- **Base URL:** `http://<host>:7070/api` (default host `0.0.0.0`, port `7070`)
- **Authentication:** JWT access token stored in httpOnly cookies (bcrypt-hashed passwords). Log in via `/api/auth/login`; the client then sends cookies automatically.
- **Health:** `GET /api/health` returns service status (used by the `lm-webui status` CLI).

## Streaming (WebSocket)

- **`/ws`** — Chat streaming and cancellation. Send a chat message as JSON to receive assistant tokens incrementally; a cancel message aborts the in-flight response.

## Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Log in, set JWT httpOnly cookies |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/refresh` | Rotate the access token using the refresh cookie |
| POST | `/api/auth/logout` | Log out, clear cookies |
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/auth/status` | Auth/session status |

## API Keys

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/api_keys` | List stored API keys (per user) |
| POST | `/api/api_keys` | Save an API key/endpoint for a provider |
| GET | `/api/api_keys/{provider}` | Read a provider's key |
| DELETE | `/api/api_keys/{provider}` | Remove a provider's key |
| POST | `/api/api_keys/{provider}/test` | Test a provider connection |

## Chat & Sessions

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/chat` | Send a chat message |
| POST | `/api/sessions` | Create a session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/current` | Current session |
| DELETE | `/api/sessions/{session_id}` | Delete a session |

## Settings & System

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings` | Read user settings |
| PUT/POST | `/api/settings` | Update user settings |
| GET | `/api/settings/themes` | Available themes |
| GET | `/api/settings/languages` | Available languages |
| GET | `/api/system/health` | Service health |
| GET | `/api/system/info` | Runtime/version info |
| GET | `/api/system/stats` | System stats |

## Conversation History & Context

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/history/conversations` | List conversations |
| GET | `/api/history/conversation/{id}` | Messages in a conversation |
| DELETE | `/api/history/conversation/{id}` | Delete a conversation |
| POST | `/api/history/conversation/{id}/archive` | Archive a conversation |
| POST | `/api/history/conversation/{id}/restore` | Restore an archived conversation |
| POST | `/api/history/conversation/{id}/title` | Set a conversation title |
| POST | `/api/history/conversation/{id}/generate-title` | Auto-generate a title |
| PATCH | `/api/history/conversation/{id}/metadata` | Update conversation metadata |
| GET | `/api/history/conversation/{id}/files` | Files attached to a conversation |
| GET | `/api/history/stats` | History statistics |
| GET | `/api/context/{conversation_id}` | Conversation context (RAG) |

## Models

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/models/api` | List configured models |
| GET | `/api/models/api/all` | All available models |
| GET | `/api/models/api/dynamic` | Dynamic model list |
| POST | `/api/models/api/refresh` | Force-refresh model lists |

## GGUF / Local Models

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/models/resolve` | Resolve a HuggingFace GGUF repo |
| POST | `/api/models/download` | Start a GGUF download (single-flight queue; returns `task_id`) |
| GET | `/api/models/download/status/{task_id}` | Download task progress |
| WS | `/api/models/download-ws/{task_id}` | Download progress over WebSocket |
| GET | `/api/models/downloads` | List active/queued download tasks (background resync) |
| GET | `/api/models/local` | Installed local models |
| POST | `/api/models/upload` | Upload a local model file |
| GET | `/api/models/compatibility/{model_name}` | Compatibility check |
| DELETE | `/api/models/{model_name}` | Remove a text GGUF model |
| DELETE | `/api/models/vision/{model_name}` | Remove a vision bundle (`models/vision/<name>/`) |
| GET/POST | `/api/models/gguf/config` | Read/update GGUF engine config |
| GET | `/api/models/gguf/gpu` | GPU detection + acceleration status |
| POST | `/api/models/gguf/gpu-install` | Rebuild llama-cpp with GPU |

## MLX (Apple Silicon)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/mlx/models` | Installed MLX models |
| POST | `/api/mlx/resolve` | Resolve an MLX repo |
| POST | `/api/mlx/download` | Start an MLX download (returns `task_id`) |
| GET | `/api/mlx/download/status/{task_id}` | MLX download progress |
| DELETE | `/api/mlx/models/{model_name}` | Remove an MLX model |

## Runtimes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/runtimes` | Runtime status (GGUF, MLX, external) |
| POST | `/api/runtimes/scan` | Scan for installed runtimes |
| POST | `/api/runtimes/external` | Register an external runtime |
| POST | `/api/runtimes/{type}/test` | Test a runtime connection |
| GET | `/api/runtimes/{type}/models` | Models for a runtime |
| POST | `/api/runtimes/{type}/install` | Install a runtime |
| POST | `/api/runtimes/{type}/uninstall` | Uninstall a runtime |
| GET | `/api/runtimes/mlx/status` | MLX runtime status |
| GET | `/api/runtimes/gguf/health` | GGUF runtime executables + version (llama-server, llama-cli, …) |
| GET | `/api/runtimes/vision/status` | Vision status — installed bundles, llama-server, running state |

## Image Generation

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/images/generate` | Generate an image |
| GET | `/api/images/history` | Image generation history |
| GET | `/api/images/models` | Available image models |
| GET | `/api/images/status` | Generation status |
| DELETE | `/api/images/history/{image_id}` | Delete a generated image |

## Files (Download / Upload)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/download/file` | Start a file download |
| GET | `/api/download/task/{task_id}` | Download task status |
| GET | `/api/download/files` | Downloaded files |
| DELETE | `/api/download/file/{filename}` | Delete a downloaded file |
| POST | `/api/upload/files` | Upload files |
| GET | `/api/upload/files/{file_id}/status` | Upload status |
| GET | `/api/upload/health` | Upload service health |
| DELETE | `/api/upload/files/{filename}` | Delete an uploaded file |

## Hardware & Projects

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/hardware` | Hardware summary |
| GET | `/api/hardware/info` | Detailed hardware info |
| GET/POST | `/api/projects` | List / create projects |
| PUT/DELETE | `/api/projects/{project_id}` | Update / delete a project |
| GET | `/api/projects/{project_id}/conversations` | Conversations in a project |

## Artifacts & Tokens

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/artifacts` | List artifacts |
| GET/PATCH/DELETE | `/api/artifacts/{artifact_id}` | Read / update / delete an artifact |
| POST | `/api/artifacts` | Create an artifact |
| POST | `/api/artifacts/from-conversation` | Generate a document from a conversation |
| GET/POST | `/api/tokens` | List / create API tokens |
| DELETE | `/api/tokens/{token_id}` | Revoke a token |

## Admin & Usage

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/admin/users` | List / create users (admin) |
| PATCH | `/api/admin/users/{user_id}/role` | Change a user's role |
| PATCH | `/api/admin/users/{user_id}/status` | Enable/disable a user |
| GET | `/api/usage` | Usage for the current user |
| GET | `/api/admin/usage/summary` | Aggregate usage (admin) |
| GET | `/api/admin/usage/users` | Per-user usage (admin) |
| GET | `/api/admin/usage/export` | Export usage data (admin) |
