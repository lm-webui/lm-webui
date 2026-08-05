try:
    import setproctitle
    setproctitle.setproctitle("lm-webui")
except ImportError:
    pass

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import logging
import re
import time

logger = logging.getLogger(__name__)
import datetime
import asyncio
import json
import os
from contextlib import asynccontextmanager

# ── App version from single source (repo root package.json) ──
_APP_VERSION = "0.0.0"
_base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _rel in ["package.json", "../package.json"]:
    _v_path = os.path.join(_base_dir, _rel)
    try:
        _APP_VERSION = json.load(open(_v_path))["version"]
        break
    except Exception:
        continue
import sys
import json
import yaml
from enum import Enum
from pathlib import Path
from app.middleware.context_middleware import attach_context_middleware
from app.routes import auth, api_keys, chat, context, history, sessions, settings, system, download, hardware, upload, models_api, gguf, image_generation, websocket, runtimes, mlx, projects, admin, usage, orgs, api_tokens, artifacts
from app.database import init_db
import os
from dotenv import load_dotenv

# Import the new configuration manager
from app.core.config_manager import (
    config_manager,
    get_config,
    get_paths_config,
    get_security_config,
    get_llm_config,
    get_server_config,
    get_media_dir,
    get_data_dir,
    get_database_path,
    setup_logging,
    is_development
)

# Load environment variables from .env file
load_dotenv()

# Setup logging based on configuration
setup_logging()

# Get configuration
config = get_config()
paths_config = get_paths_config()
security_config = get_security_config()
llm_config = get_llm_config()
server_config = get_server_config()

# Define Base Paths using configuration manager
BASE_DIR = Path(__file__).resolve().parent.parent

def get_app_version():
    """Extract version from package.json in repository root"""
    try:
        package_json_path = BASE_DIR.parent / "package.json"
        with open(package_json_path, "r") as f:
            return json.load(f).get("version", "v1")
    except Exception:
        return "v1"

APP_VERSION = get_app_version()

# Get media and data directories from configuration
MEDIA_DIR = get_media_dir()
DATA_DIR_DEFAULT = get_data_dir()

# --- Initialization States ---
class InitStatus(str, Enum):
    INITIALIZING = "initializing"
    LOADING_CONFIG = "loading_config"
    LOADING_DATABASE = "loading_database"
    LOADING_MODELS = "loading_models"
    READY = "ready"
    ERROR = "error"

# Global App State
app_state = {
    "status": InitStatus.INITIALIZING,
    "message": "Booting container...",
    "progress": 0,
    "error": None,
    "config": {}
}

print(
        rf"""
██       ███     ███     ██      ██ ███████ ███████  ██    ██ ██
██       ████   ████     ██      ██ ██      ██    ██ ██    ██ ██
██       ██ ██ ██ ██     ██  ██  ██ █████   ███████  ██    ██ ██
██       ██  ███  ██     ██ ████ ██ ██      ██    ██ ██    ██ ██
 ███████ ██       ██      ███  ███  ███████ ███████   ██████  ██

{APP_VERSION} - All-in-one LLM Runtime & AI Interface .
https://lmwebui.com
""")


def initialize_timezone():
    """Auto-detect and set system timezone for storage timestamp"""

    # 1. Check if TZ is already explicitly set (respect deployment config)
    if os.environ.get('TZ'):
        print(f"✅ TZ already set: {os.environ['TZ']}")
        return

    # 2. Auto-detect timezone using reliable methods
    detected_tz = None

    # Method A: time.localtime().tm_zone (most reliable)
    try:
        local_time = time.localtime()
        if hasattr(local_time, 'tm_zone') and local_time.tm_zone:
            detected_tz = local_time.tm_zone
            print(f"✅ Detected timezone via time.localtime(): {detected_tz}")
    except Exception as e:
        print(f"⚠️ time.localtime() detection failed: {e}")

    # Method B: datetime.astimezone() (fallback)
    if not detected_tz:
        try:
            dt = datetime.datetime.now()
            tz_info = dt.astimezone().tzinfo
            if tz_info:
                detected_tz = str(tz_info)
                print(f"✅ Detected timezone via datetime.astimezone(): {detected_tz}")
        except Exception as e:
            print(f"⚠️ datetime.astimezone() detection failed: {e}")

    # 3. Set detected timezone
    if detected_tz:
        os.environ['TZ'] = detected_tz
        try:
            time.tzset()  # Apply timezone change to Python runtime
            print(f"✅ Timezone set to: {detected_tz}")
        except Exception as e:
            print(f"⚠️ Failed to apply timezone change: {e}")
    else:
        print("❌ Could not detect timezone - using system default")

# Initialize timezone before app startup
initialize_timezone()

# Configure logging to filter sensitive information
class SensitiveDataFilter(logging.Filter):
    def filter(self, record):
        # Redact API keys from log messages
        if hasattr(record, 'msg'):
            # Redact API keys in query parameters
            record.msg = re.sub(r'api_key=[^&\s]+', 'api_key=***REDACTED***', str(record.msg))
            # Redact API keys in request bodies (basic pattern)
            record.msg = re.sub(r'"api_key"\s*:\s*"[^"]+"', '"api_key": "***REDACTED***"', str(record.msg))
            record.msg = re.sub(r"'api_key'\s*:\s*'[^']+'", "'api_key': '***REDACTED***'", str(record.msg))
        return True

# Apply filter to all loggers
for handler in logging.getLogger().handlers:
    handler.addFilter(SensitiveDataFilter())

# --- Lifespan Manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run DB init synchronously first so tables exist before any request
    from app.database import init_db
    init_db()

    # Startup: Run remaining initialization in background
    task = asyncio.create_task(initialize_app())

    yield
    # No per-session cleanup needed — orchestrator handles session lifecycle

app = FastAPI(lifespan=lifespan)


# Health check shortcut at /api/health (used by StartupGuard)
@app.get("/api/health")
async def health():
    return {
        "status": app_state.get("status", "initializing"),
        "ready": app_state.get("status") == InitStatus.READY,
        "message": app_state.get("message", "Starting..."),
        "progress": app_state.get("progress", 0),
        "version": _APP_VERSION,
    }


# CORS — allow any origin (safe for local AI tool with JWT auth)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Methods"
    ],
)

# --- Router Registration ---
app.include_router(auth.router)
app.include_router(api_keys.router)
app.include_router(chat.router)
app.include_router(context.router)
app.include_router(history.router)
app.include_router(sessions.router)
app.include_router(settings.router)
app.include_router(system.router)
app.include_router(download.router)
app.include_router(hardware.router)
app.include_router(upload.router)
app.include_router(models_api.router)
app.include_router(gguf.router)
app.include_router(image_generation.router)
app.include_router(websocket.router)
app.include_router(runtimes.router)
app.include_router(mlx.router)
app.include_router(projects.router)
app.include_router(admin.router)
app.include_router(usage.router)
app.include_router(orgs.router)
app.include_router(api_tokens.router)
app.include_router(artifacts.router)

# Serve the active Vite build in the single production container. API routes
# are registered first so /api/* is never shadowed by the SPA fallback.
# SPA catch-all — serve index.html for any non-API path (React Router handles the rest).
WEB_DIST = BASE_DIR / "web" / "dist"
SPA_INDEX = WEB_DIST / "index.html"


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_serve(full_path: str):
    # Let API routes handle their own paths
    if full_path.startswith("api/") or full_path.startswith("_"):
        raise HTTPException(status_code=404, detail="Not found")
    # Serve static files with extension (css, js, images, etc.)
    file_path = WEB_DIST / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    # SPA fallback — return index.html for any other path
    if SPA_INDEX.exists():
        return FileResponse(SPA_INDEX)
    raise HTTPException(status_code=404, detail="Not found")

# --- Helper: Load Config ---
def load_config():
    """Deprecated: Use config_manager instead"""
    import warnings
    warnings.warn("load_config() is deprecated. Use config_manager instead.", DeprecationWarning)
    return config_manager.to_dict()

# --- Background Initialization Task ---
async def initialize_app():
    """Smart initialization sequence using configuration manager"""
    try:
        # Phase 1: Config
        app_state["status"] = InitStatus.LOADING_CONFIG
        app_state["progress"] = 10
        app_state["config"] = config_manager.to_dict()

        # Use configuration from config_manager
        data_dir = str(DATA_DIR_DEFAULT)
        model_name = llm_config.model_name

        await asyncio.sleep(0.5) # UI visual pacing

        # Phase 2: Ensure storage directories exist
        app_state["status"] = InitStatus.LOADING_DATABASE
        app_state["message"] = "Initializing storage directories..."
        app_state["progress"] = 30

        # AI Models load
        app_state["status"] = InitStatus.LOADING_MODELS
        app_state["message"] = f"Loading {model_name}... (This may take a moment)"
        app_state["progress"] = 50

        # Pre-warm RAG module if enabled (downloads embedding model in background)
        try:
            if config_manager.get_config().rag.enabled:
                from app.rag.processor import RAGProcessor
                rag_p = RAGProcessor()
                rag_p.ensure_ready()
                app_state.setdefault("rag_ready", True)
                logger.info("RAG processor initialized")
        except Exception:
            logger.info("RAG not configured — skipping")

        # Ensure media directories exist and are writable
        media_dirs = [
            MEDIA_DIR,
            MEDIA_DIR / "thumbnails",
            MEDIA_DIR / "generated" / "images",
            MEDIA_DIR / "generated" / "documents",
            MEDIA_DIR / "generated" / "exports",
            MEDIA_DIR / "uploads",
        ]
        for d in media_dirs:
            d.mkdir(parents=True, exist_ok=True)
            # Writable check
            probe = d / ".write_test"
            try:
                probe.touch(); probe.unlink()
            except OSError:
                print(f"❌ Media directory not writable: {d}")
                raise

        print(f"✅ Media directory: {MEDIA_DIR.resolve()}")

        # Finalize
        app_state["progress"] = 100
        app_state["status"] = InitStatus.READY
        app_state["message"] = "System Online"

    except Exception as e:
        app_state["status"] = InitStatus.ERROR
        app_state["message"] = "Startup Failed"
        app_state["error"] = str(e)
        app_state["progress"] = 0
        print(f"❌ CRITICAL INIT ERROR: {e}")

# Unified context middleware - attaches user/conversation context to all requests
@app.middleware("http")
async def context_middleware(request: Request, call_next):
    return await attach_context_middleware(request, call_next)

# Custom middleware to sanitize logs
@app.middleware("http")
async def sanitize_logs_middleware(request: Request, call_next):
    # Create a sanitized version of the URL for logging
    sanitized_url = str(request.url)
    # Redact API keys from URL query parameters
    sanitized_url = re.sub(r'api_key=[^&\s]+', 'api_key=***REDACTED***', sanitized_url)

    # Log sanitized request
    print(f"Request: {request.method} {sanitized_url}")

    response = await call_next(request)
    return response
