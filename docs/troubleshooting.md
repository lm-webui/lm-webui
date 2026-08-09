---
title: Troubleshooting
description: Common LM-WebUI issues and how to fix them
---

# Troubleshooting

Common issues when running LM-WebUI and how to resolve them. If the steps below don't help, gather logs (see [Where to look](#where-to-look)) before opening an issue.

## Server won't start, or is unreachable

- **Port 7070 already in use.** LM-WebUI listens on port `7070` by default. Check with `lsof -i :7070` (macOS/Linux) and free it, or change the port in the server config.
- **Check health.** Run `lm-webui status` or open `GET http://localhost:7070/api/health`. If it reports `Not reachable`, the server process isn't up — check `lm-webui logs`.

## "Please select an AI provider before sending a message"

No provider/model is selected in the composer's model selector. Open the selector and choose a provider and a model before sending. Your typed prompt is preserved after this message, so you can pick a provider and resend without retyping.

## Vision shows "Not ready" after downloading a vision model

Vision needs three things, all reported by Runtime Manager → GGUF → Capabilities:

- **`llama-server` available.** It is installed by `install.sh` as part of the GGUF runtime. If missing, re-run
  `install.sh` or put a `llama-server` binary on the backend service `PATH`.
- **A complete vision bundle.** The model must be downloaded as a main GGUF **and** its `mmproj`, stored in
  `models/vision/<model>/`. If you downloaded only the model (no `mmproj`), Vision stays not-ready — re-open the
  vision download and download the pair.
- **Refresh.** After a download, Vision status refreshes automatically. If it still shows not-ready, use
  **Refresh** or reload the app.

## A model download seems stuck or stopped

GGUF downloads run in a single-flight queue in the background — only one runs at a time. If a download appears
"queued" it will start after the current one finishes. Closing the dialog does **not** stop the download; reopen
the downloader to resync live progress.

## Model selector is empty after adding a provider or a GGUF model

The model list can be stale if it was fetched before the change. Use the **refresh button** in the model selector's dropdown to re-fetch, or reload the app. Saving an API key or finishing a GGUF/MLX download should refresh the list automatically.

## GGUF / llama.cpp models don't load

- The **GGUF runtime** must be installed first — see the Runtime manager in the UI.
- Check the engine config and loaded model under **Runtime** → GGUF.
- If GPU acceleration is expected but not active, run the GPU install path (`POST /api/models/gguf/gpu-install`), which rebuilds `llama-cpp-python` with the detected GPU.
- Very large models with a small context window (`n_ctx`) can fail to allocate — reduce context or offload more layers to GPU.

## API-key save returns 403

API keys are stored per user and require an authenticated session. A `403` usually means the session expired — **log out and back in**, then retry. Local providers also validate that the server URL is `http(s)://` on localhost or a private IP.

## `lm-webui update` fails, or the frontend isn't rebuilt

The update script downloads the latest code, reinstalls Python deps, rebuilds the frontend, and restarts the service. Common failures:

- **Root-owned files block the rebuild.** If the web directory or `landing/.next` is owned by `root` (from a prior `sudo` build), the update can't write. Fix ownership: `sudo chown -R $(whoami) ~/.lmwebui` (or `landing/.next`).
- **`npm` not on PATH.** The frontend must be rebuilt during update (the server serves `web/dist`, which isn't committed). Ensure `npm`/`node` are on your PATH; the hardened update now fails loudly instead of silently skipping the rebuild.
- **Service files locked.** Stop the service before updating if files are in use. The current update stops the app first.

## Frontend is stale after an update

The web UI is served from `web/dist`, which is generated during the build and not committed. If the UI looks old after an update, the frontend rebuild was skipped or failed — re-run `lm-webui update` and confirm it reports `Frontend rebuilt.` If the build errors on a root-owned `landing/.next`, clear it with `sudo rm -rf <landing>/.next` and rebuild.

## Local provider (Ollama / LM Studio / vLLM) won't connect

- The server URL must start with `http://` or `https://` and point to a localhost or private IP — the Settings page validates this.
- Make sure the local server is actually running and reachable at that URL before saving/testing.

## Where to look

- **Logs:** `lm-webui logs` — macOS `~/lmwebui/logs/stdout.log`; Linux `journalctl -u lmwebui -f`.
- **Data:** `~/.lmwebui/data/` (preserved across updates).
- **Models:** `~/.lmwebui/models/`.
- **Status:** `lm-webui status`.
