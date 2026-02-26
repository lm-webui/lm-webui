from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import logging
import re
import time
import datetime
import asyncio
from contextlib import asynccontextmanager
import sys
import json
import yaml
from enum import Enum
from pathlib import Path
from app.middleware.context_middleware import attach_context_middleware
from app.routes import auth, api_keys, chat, context, history, sessions, settings, system, download, hardware, intents, upload, models_api, gguf, image_generation, inference, semantic_search, rag, web_search, title_updates, websocket
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
    # Startup: Run initialization in background so API remains responsive
    task = asyncio.create_task(initialize_app())
    
    # Ensure clean slate for streaming sessions
    from app.streaming.session import clear_all_sessions
    clear_all_sessions()
    
    yield
    
    # Shutdown: Clean up all active sessions
    clear_all_sessions()
    
    # if not task.done():
    #     task.cancel()

app = FastAPI(lifespan=lifespan)

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

        # Phase 2: Knowledge Graph / Database
        app_state["status"] = InitStatus.LOADING_DATABASE
        app_state["message"] = f"Connecting to Knowledge Graph at {data_dir}..."
        app_state["progress"] = 30
        
        # Dynamic Import to prevent blocking main thread
        from app.memory.kg_manager import KGManager
        # Ensure directory exists
        memory_dir = os.path.join(data_dir, "memory")
        os.makedirs(memory_dir, exist_ok=True)
        
        # Ensure qdrant directory exists (same as RAGProcessor will use)
        qdrant_path = os.path.join(data_dir, "qdrant_db")
        os.makedirs(qdrant_path, exist_ok=True)
        
        # Pass the same qdrant path to KGManager to ensure consistent QdrantStore initialization
        kg_manager = KGManager(os.path.join(memory_dir, "memory.db"), qdrant_path=qdrant_path)
        app.state.kg_manager = kg_manager
        
        # AI Models load
        app_state["status"] = InitStatus.LOADING_MODELS
        app_state["message"] = f"Loading {model_name}... (This may take a moment)"
        app_state["progress"] = 50
        
        from app.rag.processor import RAGProcessor
        
        # Ensure media directories exist
        (MEDIA_DIR / "thumbnails").mkdir(parents=True, exist_ok=True)
        (MEDIA_DIR / "generated/images").mkdir(parents=True, exist_ok=True)
        (MEDIA_DIR / "generated/documents").mkdir(parents=True, exist_ok=True)
        (MEDIA_DIR / "generated/exports").mkdir(parents=True, exist_ok=True)
        (MEDIA_DIR / "uploads").mkdir(parents=True, exist_ok=True)

        # Pass explicit path to RAGProcessor
        rag_processor = RAGProcessor(qdrant_path=qdrant_path) 
        app.state.rag_processor = rag_processor
        
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

# Get allowed origins from security configuration
allowed_origins = security_config.allowed_origins

# Add CORS middleware with proper configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    expose_headers=["Content-Disposition", "Content-Length"],
    max_age=3600,
)

# Initialize database (Synchronous part)
try:
    print(f"🔄 Initializing database at {get_database_path()}...")
    init_db()
    print("✅ Database initialization successful")
except Exception as e:
    print(f"❌ CRITICAL ERROR during database initialization: {e}")
    if not is_development():
        print("🚨 Production environment detected - exiting to trigger container restart")
        sys.exit(1)
    else:
        print("⚠️ Development mode: continuing with degraded functionality")

# Include routes
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
app.include_router(intents.router)
app.include_router(upload.router)
app.include_router(models_api.router)
app.include_router(gguf.router)

app.include_router(image_generation.router)
app.include_router(inference.router)
app.include_router(semantic_search.router)
app.include_router(rag.router)
app.include_router(web_search.router)
app.include_router(title_updates.router)
app.include_router(websocket.router)

# Media directories are created in initialize_app using MEDIA_DIR
os.makedirs(str(BASE_DIR / "app/files"), exist_ok=True)
os.makedirs(str(BASE_DIR / ".secrets"), exist_ok=True)

# Ensure media directories exist before mounting static files
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
(MEDIA_DIR / "thumbnails").mkdir(parents=True, exist_ok=True)
(MEDIA_DIR / "generated").mkdir(parents=True, exist_ok=True)
(MEDIA_DIR / "uploads").mkdir(parents=True, exist_ok=True)

# Mount static files for thumbnails and generated content from MEDIA_DIR
app.mount("/thumbnails", StaticFiles(directory=MEDIA_DIR / "thumbnails"), name="thumbnails")
app.mount("/generated", StaticFiles(directory=MEDIA_DIR / "generated"), name="generated")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "auth": "jwt", "encryption": "fernet"}

@app.get("/api/health")
async def api_health():
    return {
        "status": app_state["status"],
        "message": app_state["message"],
        "progress": app_state["progress"],
        "ready": app_state["status"] == InitStatus.READY,
        "error": app_state.get("error")
    }

@app.get("/debug/context")
async def debug_context(request: Request):
    """Debug endpoint to check middleware context"""
    from app.middleware.context_middleware import get_request_context
    context = get_request_context(request)
    return {
        "user_id": context.user_id,
        "is_authenticated": context.is_authenticated(),
        "conversation_id": context.conversation_id,
        "auth_header": request.headers.get("Authorization", "None")[:20] + "..." if request.headers.get("Authorization") else "None"
    }

# --- Serve Frontend (SPA) ---
# Resolve the frontend dist path
# Order of preference:
# 1. Environment variable FRONTEND_PATH
# 2. Standard Docker path: /backend/frontend/dist
# 3. Development path relative to this file
env_frontend_path = os.environ.get("FRONTEND_PATH")
docker_frontend_path = Path("/backend/frontend/dist")
local_frontend_path = Path(__file__).resolve().parent.parent / "frontend" / "dist"

frontend_dist = None
if env_frontend_path and Path(env_frontend_path).exists():
    frontend_dist = Path(env_frontend_path)
elif docker_frontend_path.exists():
    frontend_dist = docker_frontend_path
elif local_frontend_path.exists():
    frontend_dist = local_frontend_path

if frontend_dist:
    print(f"✅ Frontend SPA detected at: {frontend_dist}")
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Prevent API calls from being caught by the SPA router
        if full_path.startswith("api/") or full_path.startswith("health") or \
           full_path.startswith("thumbnails") or full_path.startswith("generated") or \
           full_path.startswith("docs") or full_path.startswith("redoc") or \
           full_path.startswith("openapi.json"):
            return JSONResponse(status_code=404, content={"error": "Not found"})
        
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Fallback to index.html for SPA routing
        return FileResponse(frontend_dist / "index.html")
else:
    print("⚠️  WARNING: Frontend SPA distribution NOT FOUND. UI will be unavailable.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host=server_config.host, 
        port=server_config.port,
        reload=server_config.reload and is_development(),
        workers=server_config.workers
    )
