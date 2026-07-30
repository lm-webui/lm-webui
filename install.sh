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
BRANCH="${BRANCH:-main}"
REPO_URL="https://github.com/lm-webui/lm-webui.git"

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
  if command -v python3 &>/dev/null; then PYTHON=$(command -v python3)
  elif command -v python &>/dev/null; then PYTHON=$(command -v python)
  else log_error "Python 3.10+ required. Install: https://www.python.org/downloads/"; exit 1; fi
  PY_VER=$($PYTHON --version 2>&1 | grep -Eo '[0-9]+\.[0-9]+' | head -1)
  PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1); PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    log_error "Python 3.10+ required (found $PY_VER)."; exit 1
  fi
  log_success "Python $PY_VER found at $PYTHON"
  if ! $PYTHON -m pip --version &>/dev/null; then log_error "pip not installed"; exit 1; fi
  if ! command -v git &>/dev/null; then log_error "git required"; exit 1; fi
  log_success "All prerequisites satisfied"
}

setup_environment() {
  log_info "Setting up environment at $LMWEBUI_HOME..."
  if [ ! -w "$LMWEBUI_HOME" ]; then
    log_warning "Fixing ownership of $LMWEBUI_HOME..."
    sudo mkdir -p "$LMWEBUI_HOME" && sudo chown -R "$(whoami)" "$LMWEBUI_HOME" || {
      log_error "Cannot write to $LMWEBUI_HOME. Run: sudo chown -R $(whoami) $LMWEBUI_HOME"; exit 1; }
  fi
  mkdir -p "$LMWEBUI_HOME"/{data/sql_db,data/vectors,media/uploads,media/generated/images,models/gguf,models/mlx,cache/fastembed,cache/flashrank,secrets,logs}
  if [ ! -f "$LMWEBUI_HOME/config.yaml" ]; then
    cat > "$LMWEBUI_HOME/config.yaml" << CONFIGEOF
server:
  host: "0.0.0.0"
  port: 7070
database:
  url: "sqlite:///$LMWEBUI_HOME/data/sql_db/app.db"
paths:
  base_dir: "$LMWEBUI_HOME"
  data_dir: "$LMWEBUI_HOME/data"
  media_dir: "$LMWEBUI_HOME/media"
  models_dir: "$LMWEBUI_HOME/models"
CONFIGEOF
    log_success "Created config.yaml"
  fi
  log_success "Directory structure created"
}

setup_repository() {
  log_info "Setting up application code..."
  SRC_DIR=""; SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ -f "$SCRIPT_DIR/web/vite.config.ts" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
    SRC_DIR="$SCRIPT_DIR"; log_info "Using local repository at $SRC_DIR"
  else
    log_info "Cloning repository from $REPO_URL..."
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" /tmp/lmwebui-clone; SRC_DIR="/tmp/lmwebui-clone"
  fi
  if [ -f "$LMWEBUI_HOME/app/main.py" ]; then
    OWNER=$(stat -f '%Su' "$LMWEBUI_HOME/app/main.py" 2>/dev/null || stat -c '%U' "$LMWEBUI_HOME/app/main.py" 2>/dev/null || echo "")
    if [ "$OWNER" = "root" ]; then
      log_warning "Fixing root ownership..."
      chown -R "$(whoami)" "$LMWEBUI_HOME" 2>/dev/null || sudo chown -R "$(whoami)" "$LMWEBUI_HOME" 2>/dev/null || {
        log_error "Run: sudo chown -R $(whoami) $LMWEBUI_HOME"; exit 1; }
    fi
    cp "$SRC_DIR/web/vite.config.ts" "$LMWEBUI_HOME/web/vite.config.ts" 2>/dev/null || true
    cp "$SRC_DIR/package.json" "$LMWEBUI_HOME/package.json" 2>/dev/null || true
    cp "$SRC_DIR/scripts/lmwebui" "$LMWEBUI_HOME/lmwebui" 2>/dev/null || true
    rm -rf /tmp/lmwebui-clone 2>/dev/null || true
    log_info "Application config updated at $LMWEBUI_HOME"; return
  fi
  cp -r "$SRC_DIR/backend/"* "$LMWEBUI_HOME/"
  cp -r "$SRC_DIR/web" "$LMWEBUI_HOME/web"
  cp "$SRC_DIR/package.json" "$LMWEBUI_HOME/package.json"
  rm -rf /tmp/lmwebui-clone 2>/dev/null || true
  log_success "Application code installed"
}

build_frontend() {
  log_info "Building frontend..."
  if [ -f "$LMWEBUI_HOME/web/dist/index.html" ]; then log_info "Frontend already built"; return; fi
  if ! command -v npm &>/dev/null || ! command -v node &>/dev/null; then
    log_warning "Node.js/npm not found. Install Node.js from https://nodejs.org/"
    log_warning "Then: cd $LMWEBUI_HOME/web && npm install && npm run build"; return
  fi
  cd "$LMWEBUI_HOME/web" && npm install --quiet && npm run build
  log_success "Frontend built at $LMWEBUI_HOME/web/dist"
}

install_dependencies() {
  log_info "Installing Python dependencies..."
  $PYTHON -m venv "$LMWEBUI_HOME/.venv"
  source "$LMWEBUI_HOME/.venv/bin/activate"
  pip install --upgrade pip --quiet
  pip install -r "$LMWEBUI_HOME/requirements.txt" --quiet
  log_success "Dependencies installed"
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
<key>EnvironmentVariables</key><dict><key>LMWEBUI_HOME</key><string>$LMWEBUI_HOME</string></dict>
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
  if [ -f "scripts/lmwebui" ]; then
    cp "scripts/lmwebui" "$LMWEBUI_HOME/lmwebui"
  else
    cp "$LMWEBUI_HOME/lmwebui" "$LMWEBUI_HOME/lmwebui" 2>/dev/null || cat > "$LMWEBUI_HOME/lmwebui" << 'CLIEOF'
#!/bin/bash
LMWEBUI_HOME="${LMWEBUI_HOME:-$HOME/.lmwebui}"
case "${1:-status}" in
  start) case "$(uname)" in Linux) sudo systemctl start lmwebui 2>/dev/null || true ;;
    Darwin) launchctl load "$HOME/Library/LaunchAgents/com.lmwebui.server.plist" 2>/dev/null || true ;; esac ;;
  stop) case "$(uname)" in Linux) sudo systemctl stop lmwebui 2>/dev/null || true ;;
    Darwin) launchctl unload "$HOME/Library/LaunchAgents/com.lmwebui.server.plist" 2>/dev/null || true ;; esac ;;
  restart) "$0" stop 2>/dev/null; sleep 2; "$0" start 2>/dev/null ;;
  status) curl -sf http://localhost:7070/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('ready' if d.get('ready') else d.get('status','unknown'))" 2>/dev/null || echo "offline" ;;
  logs) case "$(uname)" in Linux) journalctl -u lmwebui -f 2>/dev/null || true ;;
    Darwin) tail -f "$LMWEBUI_HOME/logs/stdout.log" 2>/dev/null || true ;; esac ;;
  update)
    echo "Updating LM-WebUI..."
    OWNER=$(stat -f '%Su' "$LMWEBUI_HOME/app/main.py" 2>/dev/null || stat -c '%U' "$LMWEBUI_HOME/app/main.py" 2>/dev/null || echo "")
    [ "$OWNER" = "root" ] && chown -R "$(whoami)" "$LMWEBUI_HOME" 2>/dev/null || sudo chown -R "$(whoami)" "$LMWEBUI_HOME" 2>/dev/null || true
    TMP="/tmp/lmwebui-update-$$"
    git clone --depth 1 https://github.com/lm-webui/lm-webui.git "$TMP"
    rm -rf "$LMWEBUI_HOME/app" "$LMWEBUI_HOME/web"
    cp -r "$TMP/backend/"* "$LMWEBUI_HOME/"
    cp -r "$TMP/web" "$LMWEBUI_HOME/web"
    cp "$TMP/package.json" "$LMWEBUI_HOME/package.json"
    cp "$TMP/scripts/lmwebui" "$LMWEBUI_HOME/lmwebui"
    rm -rf "$TMP"
    source "$LMWEBUI_HOME/.venv/bin/activate" 2>/dev/null
    pip install --upgrade pip --quiet 2>/dev/null
    pip install -r "$LMWEBUI_HOME/requirements.txt" --upgrade --quiet 2>/dev/null
    command -v npm &>/dev/null && cd "$LMWEBUI_HOME/web" && rm -rf node_modules && npm install --quiet && npm run build
    "$0" restart 2>/dev/null; echo "✅ Updated" ;;
  *) echo "Usage: lm-webui <start|stop|restart|status|logs|update>" ;;
esac
CLIEOF
  fi
  chmod +x "$LMWEBUI_HOME/lmwebui"
  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    ln -sf "$LMWEBUI_HOME/lmwebui" /usr/local/bin/lm-webui && log_success "CLI: lm-webui"
  elif [ -d "/usr/local/bin" ]; then
    log_info "Install CLI: sudo ln -sf $LMWEBUI_HOME/lmwebui /usr/local/bin/lm-webui"
  fi
}

wait_for_ready() {
  log_info "Waiting for application to start..."
  for attempt in $(seq 1 30); do
    if curl -fsS "http://localhost:7070/api/health" 2>/dev/null | grep -q '"ready":true'; then
      log_success "LM-WebUI is running and healthy!"; return
    fi; sleep 2
  done
  log_error "Not ready. Check logs at $LMWEBUI_HOME/logs/"; exit 1
}

show_instructions() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}🚀 LM-WebUI Installation Complete!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "  ${YELLOW}http://localhost:7070${NC}"
  echo ""
  echo -e "${BLUE}CLI:${NC}  ${YELLOW}lm-webui status | start | stop | restart | logs | update${NC}"
  echo -e "${BLUE}Data:${NC} ${YELLOW}$LMWEBUI_HOME${NC}"
  echo -e "${BLUE}Next:${NC} Download GGUF models in Runtime Manager → Settings"
  echo -e "${GREEN}Enjoy! 🤖${NC}"
}

cleanup() { log_warning "Installation interrupted"; exit 1; }
trap cleanup INT TERM

main() {
  print_banner
  log_info "Starting LM-WebUI installation..."
  check_prerequisites
  setup_environment
  setup_repository
  build_frontend
  install_dependencies
  install_service
  install_cli
  wait_for_ready
  show_instructions
}
main
