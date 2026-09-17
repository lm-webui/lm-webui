---
title: Troubleshooting
description: Common LM-WebUI issues and how to fix them
---

# Troubleshooting

Common issues when running LM-WebUI and how to resolve them. If the steps below don't help, gather logs (see [Where to look](#where-to-look)) before opening an issue.

## Server won't start, or is unreachable

- **Let the CLI diagnose it first.** `lm-webui status` reports the cause when the service doesn't answer: whether an uvicorn process is running, whether port `7070` is free and who holds it if not, whether the virtualenv is intact, whether `config.yaml` parses, and the last lines of the service log. It prints the same diagnosis after a failed `lm-webui start`. A reachable-but-broken service reports `Reason:` with the exception class instead.
- **Port 7070 already in use.** LM-WebUI listens on port `7070`. The bind address is fixed in the service definition — the systemd unit `/etc/systemd/system/lmwebui.service`, or the launchd plist `~/Library/LaunchAgents/com.lmwebui.server.plist`. `server.host`/`server.port` in `config.yaml` are **not read**; editing them does nothing. To move the port, edit the service definition (or re-run `install.sh` to regenerate it) and also update `PORT` in `~/.lmwebui/lmwebui`, which prints the URL and probes health.
- **Check health.** Run `lm-webui status` or open `GET http://localhost:7070/api/health`. If it reports `Not reachable`, the server process isn't up — check `lm-webui logs`.
- **No account yet.** `lm-webui status` warns when no user is registered. There is no setup token: the first account to register becomes admin. On a machine reachable from an untrusted network, register before leaving it exposed.

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

When Vision isn't ready and you send an image, the chat shows a clear notice ("⚠️ Vision isn't ready…") and
answers the text without image analysis rather than failing silently.

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

## `lm-webui update` fails

`update` downloads the latest release tarball and installs it over the current one. The frontend
ships prebuilt inside that tarball, so **nothing is compiled on your machine** and `npm`/`node` are
not required. Common failures:

- **The download failed.** `update` fetches from
  `https://github.com/lm-webui/lm-webui/releases/latest/download/lm-webui.tar.gz`. A proxy, VPN or
  offline machine fails here; the message names the URL so you can fetch it by hand.
- **Root-owned files block the replace.** If part of `~/.lmwebui` is owned by `root` (from a prior
  `sudo` run), the copy can't write. `update` repairs ownership first; if it can't, run
  `sudo chown -R $(whoami) ~/.lmwebui` and retry.
- **Service files locked.** `update` stops the service first. If something else holds the files,
  stop it and retry.

## Frontend is stale after an update

The web UI is served from `web/dist`, which is replaced wholesale from the release tarball on every
update. So a stale UI is no longer a build problem — check, in order:

- **The service didn't restart.** `lm-webui version` reports the running version; if it is unchanged,
  the update failed before its final restart.
- **Browser cache.** `index.html` is served fresh, but a cached copy can linger — hard-reload the page.
- **You are running from a source checkout.** A checkout is not an install: the installed tree lives
  at `~/.lmwebui`, and editing files in a clone has no effect on it. Use `npm run dev` in the clone
  for development, or `lm-webui update` to move the install forward.

## Local provider (Ollama / LM Studio / vLLM) won't connect

- The server URL must start with `http://` or `https://` and point to a localhost or private IP — the Settings page validates this.
- Make sure the local server is actually running and reachable at that URL before saving/testing.

## Where to look

- **Logs:** `lm-webui logs` — macOS `~/.lmwebui/logs/stdout.log` and `~/.lmwebui/logs/stderr.log`; Linux `journalctl -u lmwebui -f`. uvicorn and the app's logging both write to **stderr**, so read `stderr.log` when a startup fails.
- **Data:** `~/.lmwebui/data/` (preserved across updates).
- **Models:** `~/.lmwebui/models/`.
- **Status:** `lm-webui status`.
