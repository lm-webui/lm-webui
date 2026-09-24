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

You do not have to do this by hand. If the app starts and finds no working backend, it offers
to run the installer for you (see **First run** below), so the curl command above is the
equivalent by hand, not a prerequisite you must meet before the app is useful.

## First run

The app probes `http://127.0.0.1:7070/` and asks for the page it is about to load, not for a
health endpoint. The distinction is the whole point: a server whose install tree has been
deleted underneath it keeps answering `/api/health` from memory with `200 {"ready":true}`
while `/` returns a JSON 404, so a readiness check that trusts a status code will navigate
straight into `{"detail":"Not found"}`. Asking for `/` and requiring `text/html` cannot go
stale that way, and needs nothing from the backend beyond serving its own UI.

That probe sorts the machine into four states. Each gets one message and, where one can help,
one button:

| State | Detected by | What the app offers |
|---|---|---|
| `up` | `/` answers with HTML | Opens the app. No screen shown. |
| `no_ui` | Something answers, but `/` is not HTML | **Repair installation**, runs `lmwebui update` |
| `not_running` | Connection refused, `~/.lmwebui` exists | **Start the server**, runs `lmwebui start` |
| `not_installed` | Connection refused, no `~/.lmwebui` | **Install LM-WebUI**, runs the installer |

`no_ui` is the state that produced the incident above, and it is the one a status-code check
cannot see.

`install` is also the fallback for the other two. Both of them run a CLI that lives inside
`~/.lmwebui`, which is exactly the tree that is missing in the `no_ui` case, so "repair" would
otherwise have nothing to run.

The installer runs **in the app**, streaming its output into the window. There is no progress
bar because there is no honest percentage to show; the installer's own lines are the progress.
When the server comes up the window swaps to the UI on its own, so there is no "now reopen the
app" step. On a non-zero exit the log is deliberately kept on screen, since it is the only
record of what went wrong.

The log is capped at the last 500 lines (a pip install emits thousands), a second click while
a repair is running is rejected, and there is no cancel button: interrupting mid-`pip install`
leaves a half-built virtualenv, which is worse than waiting.

JavaScript sends an **action name** (`install`, `start`, `repair`), never a command string.
The three shell commands are constants in `lib.rs`, so nothing from the webview reaches a
shell. The installer is invoked with `LMWEBUI_INSTALL_APP=0` so it cannot offer to replace the
very app that is running it.

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

Produces the bundle under `src-tauri/target/release/bundle/`. On a machine whose backend is
not serving the UI, the app opens the onboarding page described below instead of a blank
window, and swaps in the real UI as soon as the backend serves it.

The release binary can be run directly (`src-tauri/target/release/lm-webui-desktop`) without
packaging a DMG. Use `npx tauri build --no-bundle` for that loop: a bare `cargo build
--release` omits the `custom-protocol` feature and will not serve the embedded page.

## Releasing the macOS DMG

```sh
./scripts/release-dmg.sh [tag]      # tag defaults to v<version in package.json>
```

Builds the DMG here and attaches it to an existing GitHub release. There is no CI job for
this: the build and the release are done on the same machine so the artifact that gets
tested is the artifact that ships. The script also re-checks the things that shipped broken
in 0.8.18 — signature, icon, and no bundled backend — because none of them make the build
fail on their own.

Needs only a macOS host, Rust, node, git and curl. `gh` is optional: with it the asset is
uploaded automatically, without it the script builds and verifies as usual and prints the
release page to drag the DMG onto.

The DMG is uploaded as versioned and stable **release assets**, never committed. The versioned
asset keeps the exact build visible in the release; the stable `LM-WebUI-macos-arm64.dmg` alias
lets the website and installer use one URL across releases.

Downloaders always get a Gatekeeper prompt, wherever the DMG is hosted — macOS quarantines
anything downloaded and a locally built DMG only opens because it was never quarantined. See
macOS signing below for the one thing that actually removes it.

### Installing the app via install.sh

`install.sh` can install this app, but only on Apple Silicon and only when asked. It fetches
the DMG with curl rather than sending users to a browser, for the reason above: curl sets no
quarantine attribute, so Gatekeeper never gets the chance to refuse the ad-hoc signature.

```sh
curl -fsSL https://lmwebui.com/install.sh | bash                      # backend only (default)
LMWEBUI_INSTALL_APP=1 curl -fsSL … | bash                             # also install the app
```

On macOS with a terminal it asks first, defaulting to no. Linux and Intel Macs skip it
entirely — the published DMG is arm64. It is the only thing this installer writes outside
`~/.lmwebui`, which is why it is never automatic.

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
