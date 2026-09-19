#!/bin/bash

# LM WebUI - One-Line Installation Script
# Usage: curl -fsSL https://lmwebui.com/install.sh | bash

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

LMWEBUI_HOME="${LMWEBUI_HOME:-$HOME/.lmwebui}"
# The one source: a release tarball. There is no git-clone path — two source layouts meant every
# consumer branched on them, and the branches drifted apart.
RELEASE_URL="https://github.com/lm-webui/lm-webui/releases/latest/download/lm-webui.tar.gz"
# The desktop app is a separate release asset, fetched here rather than linked, because how it
# is downloaded decides whether macOS will open it at all. See install_macos_app().
#
# DESKTOP_DMG_URL is only the conventional name. The tarball is always published by CI under a
# fixed name, but the DMG has shipped as both LM-WebUI-macos-arm64.dmg (release-dmg.sh) and
# Tauri's own LM-WebUI_<version>_<arch>.dmg (a hand-uploaded build), so any hardcoded path 404s
# the moment the name changes. resolve_desktop_dmg_url() asks what the release actually carries.
RELEASE_API="https://api.github.com/repos/lm-webui/lm-webui/releases/latest"
DESKTOP_DMG_URL="https://github.com/lm-webui/lm-webui/releases/latest/download/LM-WebUI-macos-arm64.dmg"

print_banner() {
  echo -e "${BLUE}"
  cat << 'EOF'
██       ███     ███     ██      ██ ███████ ███████  ██    ██ ██
██       ████   ████     ██      ██ ██      ██    ██ ██    ██ ██
██       ██ ██ ██ ██     ██  ██  ██ █████   ███████  ██    ██ ██
██       ██  ███  ██     ██ ████ ██ ██      ██    ██ ██    ██ ██
 ███████ ██       ██      ███  ███  ███████ ███████   ██████  ██
EOF
  echo -e "${NC}"
  echo "  All-in-one LLM Runtime & AI Interface"
  echo "  https://lmwebui.com"
  echo ""
}

check_prerequisites() {
  log_info "Checking prerequisites..."

  # Install uv (fast, self-contained Python manager) if missing
  if ! command -v uv &>/dev/null; then
    log_info "Installing uv (Python package manager)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null || log_warning "uv install failed — will use system Python"
    export PATH="$HOME/.local/bin:$PATH"
  fi
  if command -v uv &>/dev/null; then
    log_success "Using uv $(uv --version 2>/dev/null | awk '{print $2}')"
  else
    # Fallback: system Python 3.10+ (for systems where uv install is blocked)
    if command -v python3 &>/dev/null; then PYTHON=$(command -v python3)
    elif command -v python &>/dev/null; then PYTHON=$(command -v python)
    else log_error "Python 3.10+ required. Install: https://www.python.org/downloads/"; exit 1; fi
    PY_VER=$($PYTHON --version 2>&1 | grep -Eo '[0-9]+\.[0-9]+' | head -1)
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1); PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
      log_error "Python 3.10+ required (found $PY_VER)."; exit 1
    fi
    log_success "Using Python $PY_VER at $PYTHON"
    # Bootstrap pip if missing (fixes VPS without python3-pip)
    $PYTHON -m ensurepip --upgrade 2>/dev/null || true
    if ! $PYTHON -m pip --version &>/dev/null; then log_error "pip not available"; exit 1; fi
  fi
  log_success "All prerequisites satisfied"
}

check_sudo() {
  # Prompt for the sudo password up front so later sudo steps (venv ownership
  # fix, CLI symlink, systemd service) don't each need a password — or fail
  # silently in a non-interactive context.
  [ "$(id -u)" = "0" ] && return 0   # already root
  command -v sudo &>/dev/null || return 0
  log_info "Requesting sudo privileges (needed for system-level setup)..."
  if ! sudo -v 2>/dev/null; then
    log_warning "Sudo unavailable — skipping system-level steps (CLI symlink, service)."
  fi
}

setup_environment() {
  log_info "Setting up environment at $LMWEBUI_HOME..."
  if [ ! -w "$LMWEBUI_HOME" ]; then
    log_warning "Fixing ownership of $LMWEBUI_HOME..."
    sudo mkdir -p "$LMWEBUI_HOME" && sudo chown -R "$(whoami)" "$LMWEBUI_HOME" || {
      log_error "Cannot write to $LMWEBUI_HOME. Run: sudo chown -R $(whoami) $LMWEBUI_HOME"; exit 1; }
  fi
  # bin/ is where agent CLIs install (npm --prefix) and where llama-server goes; both service
  # units already put it FIRST on PATH, so create it up front rather than lazily.
  mkdir -p "$LMWEBUI_HOME"/{bin,data/sql_db,data/vectors,media/uploads,media/generated/images,models/gguf,models/mlx,models/vision,cache/fastembed,cache/flashrank,secrets,logs}
  log_success "Directory structure created"
}

export_bin_path() {
  # Put $LMWEBUI_HOME/bin on the user's interactive PATH, once. Agent CLIs install there
  # (npm --prefix), so without this the user's OWN shell cannot see an agent the app installed.
  # Idempotent: re-running the installer must not append the line again.
  # .zshrc is what `zsh -lic` sources, which is the probe the backend uses to widen its own PATH.
  local marker="$LMWEBUI_HOME/bin"
  local line="export PATH=\"$marker:\$PATH\""
  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    [ -f "$rc" ] || continue
    grep -qF "$marker" "$rc" && continue
    printf '\n# LM-WebUI agent CLIs\n%s\n' "$line" >> "$rc"
  done
}

setup_repository() {
  # Resolve ONE source — a release tarball — and hand it to the CLI's __install-tree, which is the
  # only implementation of "replace the code, keep the user's data" (and holds the config.yaml
  # guard). This function used to hold a second implementation plus a git-clone path; the two
  # copies drifted, and this one's config guard was missing from the CLI's.
  log_info "Setting up application code..."
  local tmp="/tmp/lmwebui-release-$$" tgz="" downloaded=""
  rm -rf "$tmp"; mkdir -p "$tmp"

  # A local tarball first, so a hand-built or already-downloaded one works offline.
  if [ -f "./lm-webui.tar.gz" ]; then
    log_info "Using local ./lm-webui.tar.gz"
    tgz="./lm-webui.tar.gz"
  else
    log_info "Downloading latest release..."
    tgz="/tmp/lmwebui-$$.tar.gz"; downloaded="$tgz"
    if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tgz" "$RELEASE_URL"; then
      log_error "Could not download $RELEASE_URL"
      log_error "Fetch it manually, then re-run this installer from that directory."
      exit 1
    fi
  fi

  if ! tar -tzf "$tgz" >/dev/null 2>&1; then
    log_error "Not a readable .tar.gz archive: $tgz"; exit 1
  fi
  tar -xzf "$tgz" -C "$tmp" --strip-components=1
  # Only ever delete what we downloaded — never the user's own ./lm-webui.tar.gz.
  if [ -n "$downloaded" ]; then rm -f "$downloaded"; fi

  # Fail here rather than half-way through replacing an install. The release workflow asserts the
  # same two files before uploading, so this only fires on a corrupt or truncated download.
  if [ ! -f "$tmp/app/main.py" ] || [ ! -f "$tmp/web/dist/index.html" ]; then
    log_error "Release archive is missing app/main.py or web/dist/index.html"
    rm -rf "$tmp"; exit 1
  fi

  # Publish the CLI, then let it do the replacement — so the CLI that mutates the install is
  # byte-identical to the one that will later run `lm-webui update`.
  if ! cp "$tmp/lmwebui" "$LMWEBUI_HOME/lmwebui"; then
    log_error "No lmwebui in the release archive"; rm -rf "$tmp"; exit 1
  fi
  # LMWEBUI_HOME is assigned, not exported, in this script: pass it explicitly or the child
  # silently targets ~/.lmwebui. `bash <path>` so this doesn't depend on the exec bit, which
  # install_cli() only sets later.
  if ! LMWEBUI_HOME="$LMWEBUI_HOME" bash "$LMWEBUI_HOME/lmwebui" __install-tree "$tmp"; then
    log_error "Installing the release tree failed"; rm -rf "$tmp"; exit 1
  fi

  rm -rf "$tmp"
  log_success "Application code installed at $LMWEBUI_HOME"
}

install_dependencies() {
  log_info "Installing Python dependencies..."
  if [ -d "$LMWEBUI_HOME/.venv" ] && [ -n "$(find "$LMWEBUI_HOME/.venv" ! -user "$(whoami)" 2>/dev/null | head -1)" ]; then
    log_warning "Fixing .venv ownership (stale non-user files)..."
    chown -R "$(whoami)" "$LMWEBUI_HOME/.venv" 2>/dev/null || sudo chown -R "$(whoami)" "$LMWEBUI_HOME/.venv" 2>/dev/null || {
      log_error "Run: sudo chown -R $(whoami) $LMWEBUI_HOME/.venv"; return 1; }
  fi
  if command -v uv &>/dev/null; then
    uv venv "$LMWEBUI_HOME/.venv" --python 3.12 --clear 2>/dev/null || uv venv "$LMWEBUI_HOME/.venv" --clear
    export VIRTUAL_ENV="$LMWEBUI_HOME/.venv"
    uv pip install -r "$LMWEBUI_HOME/requirements.txt" --quiet
  else
    $PYTHON -m venv "$LMWEBUI_HOME/.venv"
    source "$LMWEBUI_HOME/.venv/bin/activate"
    $PYTHON -m ensurepip --upgrade 2>/dev/null || true
    pip install --upgrade pip --quiet 2>&1 || true
    pip install -r "$LMWEBUI_HOME/requirements.txt" --quiet
  fi
  log_success "Dependencies installed"
}

install_llamacpp() {
  log_info "Installing llama-cpp-python (CPU)..."
  # CPU build — fast, works everywhere
  if command -v uv &>/dev/null; then
    uv pip install --python "$LMWEBUI_HOME/.venv/bin/python" llama-cpp-python --quiet 2>/dev/null || \
    uv pip install llama-cpp-python --quiet 2>/dev/null || \
    log_warning "llama-cpp-python install failed — GGUF inference unavailable"
  else
    source "$LMWEBUI_HOME/.venv/bin/activate"
    pip install llama-cpp-python --quiet 2>&1 || log_warning "llama-cpp-python install failed — GGUF inference unavailable"
  fi
}

ensure_llama_server() {
  # llama-server is the multimodal engine (Vision); install it as part of the
  # GGUF runtime so Vision isn't left depending on an unmanaged binary.
  if command -v llama-server &>/dev/null; then
    log_success "  llama-server already available"
    return
  fi
  log_info "Installing llama-server..."
  # $LMWEBUI_HOME, not $HOME/.lmwebui — the service units put $LMWEBUI_HOME/bin on PATH, so
  # hardcoding the default home downloads the binary somewhere the service cannot see it.
  local bin_dir="$LMWEBUI_HOME/bin"
  mkdir -p "$bin_dir"
  # macOS: brew formula if present
  if [ "$(uname)" = "Darwin" ] && command -v brew &>/dev/null; then
    brew install llama.cpp 2>/dev/null && { log_success "  llama-server installed via brew"; export PATH="$bin_dir:$PATH"; return; }
  fi
  # Fallback: llama.cpp release binary for this platform (non-Windows assets are .tar.gz)
  local os="$([ "$(uname)" = "Darwin" ] && echo macos || echo ubuntu)"
  local arch="$([ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ] && echo arm64 || echo x64)"
  local tag="$(curl -fsSL https://api.github.com/repos/ggml-org/llama.cpp/releases/latest 2>/dev/null | grep -m1 '"tag_name"' | sed 's/.*"\([^"]*\)".*/\1/')"
  local url="https://github.com/ggml-org/llama.cpp/releases/latest/download/llama-$tag-bin-$os-$arch.tar.gz"
  if [ -n "$tag" ] && curl -fsSL -o /tmp/llama-bin.tar.gz "$url" 2>/dev/null && tar -xzf /tmp/llama-bin.tar.gz -C "$bin_dir" 2>/dev/null; then
    # llama.cpp tarballs unpack to a versioned top-level folder; find the real binary.
    local src="$(find "$bin_dir" -type f -name llama-server | head -1)"
    if [ -n "$src" ]; then
      # Shared-library build: copy the binary AND its sibling lib*.so so the
      # loader can resolve libllama-server-impl.so etc. from $bin_dir.
      local src_dir="$(dirname "$src")"
      cp "$src_dir/"* "$bin_dir/" 2>/dev/null
      rm -rf "$src_dir"
      chmod +x "$bin_dir/llama-server"
      export PATH="$bin_dir:$PATH"
      export_bin_path   # persist for future shells (idempotent)
      command -v llama-server &>/dev/null && log_success "  llama-server installed to $bin_dir" && return
    fi
  fi
  log_warning "  Could not install llama-server automatically — Vision needs it."
  log_warning "  Install llama.cpp manually: https://github.com/ggml-org/llama.cpp/releases"
}

check_gguf_runtime() {
  log_info "Checking llama.cpp runtime..."
  missing=0
  for bin in llama-server llama-cli llama-bench llama-quantize; do
    if command -v "$bin" &>/dev/null; then
      log_success "  $bin: found"
    else
      log_warning "  $bin: not found"
      missing=1
    fi
  done
  if command -v llama-server &>/dev/null; then
    log_info "  llama-server version: $(llama-server --version 2>&1 | head -1)"
  fi
  if [ "$missing" -eq 1 ]; then
    log_warning "llama.cpp CLI binaries missing — GGUF inference still works via llama-cpp-python,"
    log_warning "but Vision (VL) models require the llama-server binary. Install it from llama.cpp releases."
  else
    log_success "llama.cpp runtime OK — vision ready."
  fi
}

install_service() {
  log_info "Installing service..."
  case "$(uname)" in
    Linux)
      cat > /tmp/lmwebui.service << SERVICEEOF
[Unit]
Description=LM-WebUI
After=network.target
[Service]
Type=simple
User=$USER
WorkingDirectory=$LMWEBUI_HOME
Environment=LMWEBUI_HOME=$LMWEBUI_HOME
# config.yaml hardcodes base_dir: ~/.lmwebui; pin it to the real home so an overridden
# LMWEBUI_HOME can't leave the agent bin dir and the installer pointing at different places.
Environment=LMWEBUI_BASE_DIR=$LMWEBUI_HOME
Environment=PATH=$LMWEBUI_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$LMWEBUI_HOME/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 7070
Restart=on-failure
[Install]
WantedBy=multi-user.target
SERVICEEOF
      if command -v systemctl &>/dev/null; then
        sudo mv /tmp/lmwebui.service /etc/systemd/system/lmwebui.service
        sudo systemctl daemon-reload && sudo systemctl enable lmwebui
        sudo systemctl stop lmwebui 2>/dev/null || true
        sudo systemctl start lmwebui
        log_success "systemd service installed"
      fi ;;
    Darwin)
      PLIST_PATH="$HOME/Library/LaunchAgents/com.lmwebui.server.plist"
      # Kill any root-owned uvicorn processes holding port 7070
      ROOT_PID=$(ps aux | grep "uvicorn.*7070" | grep "^root" | awk '{print $2}' 2>/dev/null)
      if [ -n "$ROOT_PID" ]; then
        log_warning "Killing stale root process PID $ROOT_PID on port 7070..."
        sudo kill -9 "$ROOT_PID" 2>/dev/null || true
        sleep 1
      fi
      cat > /tmp/com.lmwebui.server.plist << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.lmwebui.server</string>
<key>ProgramArguments</key><array><string>$LMWEBUI_HOME/.venv/bin/uvicorn</string><string>app.main:app</string><string>--host</string><string>0.0.0.0</string><string>--port</string><string>7070</string></array>
<key>WorkingDirectory</key><string>$LMWEBUI_HOME</string>
<key>EnvironmentVariables</key><dict><key>LMWEBUI_HOME</key><string>$LMWEBUI_HOME</string><key>LMWEBUI_BASE_DIR</key><string>$LMWEBUI_HOME</string><key>PATH</key><string>$LMWEBUI_HOME/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$LMWEBUI_HOME/logs/stdout.log</string>
<key>StandardErrorPath</key><string>$LMWEBUI_HOME/logs/stderr.log</string>
</dict></plist>
PLISTEOF
      mkdir -p "$HOME/Library/LaunchAgents" && mv /tmp/com.lmwebui.server.plist "$PLIST_PATH"
      launchctl unload "$PLIST_PATH" 2>/dev/null || true
      sleep 1
      launchctl load "$PLIST_PATH" && log_success "launchd service installed" ;;
  esac
}

install_cli() {
  # The script itself is published in setup_repository(), from the release tarball. There is
  # deliberately no inline fallback: a second copy is what let the installed CLI drift from the one
  # in the repo. setup_repository() already fails if the archive has no lmwebui, so this is only a
  # belt-and-braces guard against writing a reduced version.
  if [ ! -f "$LMWEBUI_HOME/lmwebui" ]; then
    log_warning "Service CLI not found in the source tree — skipping CLI install."
    return 0
  fi
  chmod +x "$LMWEBUI_HOME/lmwebui"
  if [ -d "/usr/local/bin" ]; then
    ln -sf "$LMWEBUI_HOME/lmwebui" /usr/local/bin/lm-webui 2>/dev/null && log_success "CLI: lm-webui" || {
      sudo ln -sf "$LMWEBUI_HOME/lmwebui" /usr/local/bin/lm-webui 2>/dev/null && log_success "CLI: lm-webui" || {
        log_info "Install CLI: sudo ln -sf $LMWEBUI_HOME/lmwebui /usr/local/bin/lm-webui"
      }
    }
  fi
}

resolve_desktop_dmg_url() {
  # Print the download URL of the newest release's DMG asset, or nothing if it has none.
  #
  # The asset name is not dependable (see DESKTOP_DMG_URL), so ask the API instead of guessing.
  # python3 is already required by this installer — lan_ip() and the version checks use it.
  curl -fsSL --max-time 20 "$RELEASE_API" 2>/dev/null | python3 -c '
import sys, json
try:
    assets = json.load(sys.stdin).get("assets", [])
except Exception:
    sys.exit(0)
dmg = [a["browser_download_url"] for a in assets
       if a.get("name", "").endswith(".dmg") and a.get("browser_download_url")]
print(dmg[0] if dmg else "")
' 2>/dev/null
}

install_macos_app() {
  # Apple Silicon only — the published DMG is arm64.
  #
  # The app is downloaded with curl rather than clicked from the releases page, and that is the
  # entire point of this step. Browsers tag every download with com.apple.quarantine, and
  # Gatekeeper only consults spctl for quarantined files. The app is ad-hoc signed (it has no
  # Developer ID — see desktop/README.md), which spctl always reports as "rejected", so a
  # browser-downloaded copy is refused with "Apple cannot check it for malicious software"
  # while this byte-identical file opens normally. curl sets no quarantine attribute, so the
  # check never runs and no signature change is needed.
  [ "$(uname)" = "Darwin" ] || return 0
  if [ "$(uname -m)" != "arm64" ]; then
    log_info "Desktop app: skipping (the published DMG is Apple Silicon only)."
    return 0
  fi
  command -v hdiutil >/dev/null 2>&1 || return 0

  # Opt-in, always. The app is a GUI extra on top of the CLI and the web UI, and it is the only
  # thing this installer writes outside $LMWEBUI_HOME — it lands in /Applications. Linux never
  # reaches this function at all, and on macOS a plain `curl | bash` must not silently drop an
  # app into /Applications, so the default answer is no.
  #
  #   unset            ask (default no)
  #   LMWEBUI_INSTALL_APP=1   install without asking, for scripted setups
  #   LMWEBUI_INSTALL_APP=0   never
  case "${LMWEBUI_INSTALL_APP:-ask}" in
    0|false|no)
      log_info "Desktop app: skipped (LMWEBUI_INSTALL_APP=$LMWEBUI_INSTALL_APP)."
      return 0 ;;
    1|true|yes) ;;
    *)
      # stdin is this script itself when it runs as `curl | bash`, so a plain `read` would
      # consume the script. Ask the terminal instead. The subshell probe is not the same as
      # `-r`: the device can exist yet be unopenable (no controlling terminal), and a bare
      # failed redirection would print a raw "device not configured" error mid-install.
      if ( : < /dev/tty ) 2>/dev/null; then
        printf "%s" "   Also install the desktop app to /Applications? [y/N] "
        local reply=""
        read -r reply < /dev/tty || true
        case "$reply" in
          [yY]*) ;;
          *)
            log_info "Desktop app: skipped. Re-run with LMWEBUI_INSTALL_APP=1, or install the DMG from the releases page."
            return 0 ;;
        esac
      else
        log_info "Desktop app: skipped — no terminal to confirm. Use LMWEBUI_INSTALL_APP=1 to install it."
        return 0
      fi ;;
  esac

  local dest="/Applications/LM-WebUI.app"
  [ -d "$dest" ] && log_info "Desktop app: replacing the existing /Applications/LM-WebUI.app."

  log_info "Downloading desktop app..."
  local url
  url="$(resolve_desktop_dmg_url)"
  [ -n "$url" ] || url="$DESKTOP_DMG_URL"

  local work; work="$(mktemp -d)"
  local dmg="$work/LM-WebUI.dmg"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$dmg" "$url"; then
    log_warning "Desktop app download failed — skipping. Get it from the releases page."
    rm -rf "$work"; return 0
  fi

  local mnt="$work/mnt"; mkdir -p "$mnt"
  if ! hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mnt" >/dev/null 2>&1; then
    log_warning "Desktop app image would not mount — skipping."
    rm -rf "$work"; return 0
  fi
  if [ ! -d "$mnt/LM-WebUI.app" ]; then
    log_warning "No LM-WebUI.app inside the disk image — skipping."
    hdiutil detach "$mnt" >/dev/null 2>&1 || true; rm -rf "$work"; return 0
  fi

  rm -rf "$dest"
  if cp -R "$mnt/LM-WebUI.app" /Applications/ 2>/dev/null; then
    # Belt and braces. curl sets no quarantine, but if anything in the fetch chain ever did, the
    # app would be blocked exactly as a browser download is.
    xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
    log_success "Desktop app: /Applications/LM-WebUI.app"
  else
    log_warning "Could not copy the app into /Applications — skipping."
  fi

  hdiutil detach "$mnt" >/dev/null 2>&1 || true
  rm -rf "$work"
}

wait_for_ready() {
  log_info "Waiting for application to start..."
  local spin='-\|/'
  local i=0
  for attempt in $(seq 1 30); do
    if curl -fsS "http://localhost:7070/api/health" 2>/dev/null | grep -q '"ready":true'; then
      printf "\r\033[K"; log_success "LM-WebUI is running and healthy!"; return
    fi
    printf "\r\033[K  %s starting..." "${spin:i%4:1}"
    i=$(( i + 1 ))
    sleep 2
  done
  printf "\r\033[K"
  log_error "Not ready. Check logs at $LMWEBUI_HOME/logs/"; exit 1
}

show_instructions() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}🚀 LM-WebUI Installation Complete!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  # The CLI owns the URL line, the LAN address and the first-run notice — don't duplicate it here.
  "$LMWEBUI_HOME/lmwebui" status 2>/dev/null || echo -e "  ${YELLOW}http://localhost:7070${NC}"
  echo ""
  echo -e "${BLUE}CLI:${NC}  ${YELLOW}lm-webui status | start | stop | restart | open | logs | update${NC}"
  echo -e "${BLUE}Data:${NC} ${YELLOW}$LMWEBUI_HOME${NC}"
  echo -e "${BLUE}Next:${NC} Download GGUF models in Runtime Manager → Settings"
  echo -e "${GREEN}Enjoy! 🤖${NC}"
}

cleanup() { log_warning "Installation interrupted"; exit 1; }
trap cleanup INT TERM
trap 'rm -rf /tmp/lmwebui-release-$$ /tmp/lmwebui-$$.tar.gz' EXIT

main() {
  print_banner
  log_info "Starting LM-WebUI installation..."
  check_prerequisites
  check_sudo
  setup_environment
  export_bin_path
  # setup_repository lays the tree down and consumes the config template, so it owns config
  # creation too — there is no separate ensure_config step any more.
  setup_repository
  install_dependencies
  install_llamacpp
  ensure_llama_server
  check_gguf_runtime
  install_service
  install_cli
  install_macos_app
  wait_for_ready
  show_instructions
}
main
