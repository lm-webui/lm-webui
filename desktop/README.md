# LM-WebUI Desktop

Cross-platform Tauri wrapper for the existing LM-WebUI React frontend and FastAPI backend.

## Development

Install the desktop CLI dependencies, then run `npm run dev`. Development uses
the existing Vite frontend and backend service. Set `LMWEBUI_BACKEND` to a
locally built backend executable to exercise packaged startup.

## Build

From this directory:

```sh
npm run build:sidecar
npm run build
```

The sidecar must be built on the target operating system and architecture.
