# LM-WebUI Desktop

Cross-platform Tauri shell for the LM-WebUI frontend and FastAPI backend.

The app does **not** contain a backend. It is a browser window pointed at the backend you
install from this repo, which serves the frontend itself. That keeps the package a few MB
instead of a few hundred, and it means the backend you run is the real one — with the
native MLX, llama.cpp and Vulkan runtimes — rather than a frozen copy.

## Prerequisite

The backend must be installed and running first:

```sh
curl -fsSL https://lmwebui.com/install.sh | bash
lm-web-ui start
```

The installer registers a launchd (macOS) or systemd (Linux) service on port **7070** with
`KeepAlive`, so it starts at login and stays up. Check it with `lm-web-ui status`.

Data lives in `~/.lmwebui` — `data/`, `models/`, `media/`, `config.yaml`. The desktop app
owns none of it.

## Development

```sh
npm run dev
```

That starts the Vite dev server on port 5177 (the backend trusts it by default) and opens
the app against it. You still need the backend running for anything beyond the UI shell.

## Build

```sh
npm run build
```

Produces the bundle under `src-tauri/target/release/bundle/`. On a machine without the
backend installed the app opens a status page and swaps in the real UI as soon as
`http://localhost:7070/api/health` answers.

## macOS signing

`bundle.macOS.signingIdentity` is `"-"`, which is Tauri's ad-hoc signature. It seals the
bundle so macOS reads it as an unidentified developer rather than as a damaged file —
without it, `codesign --verify` fails and Gatekeeper shows "LM-WebUI is damaged and can't
be opened" with no way to override.

Ad-hoc is not notarization, so users still have to allow the app once on first launch
(System Settings → Privacy & Security → Open Anyway), or clear the download flag directly:

```sh
xattr -dr com.apple.quarantine /Applications/LM-WebUI.app
```

Removing that restriction means signing with a Developer ID certificate and notarizing:
set `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` in CI. Tauri picks them up on its own; a
real identity replaces the `"-"`.
