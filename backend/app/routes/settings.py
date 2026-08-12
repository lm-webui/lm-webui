"""
Settings Routes

This module provides routes for application settings management.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.database import get_db
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/settings")

class SettingsUpdate(BaseModel):
    # Basic settings
    theme: str = "dark"
    language: str = "en"
    auto_refresh: bool = True
    max_tokens: int = 8000

    # API Keys and endpoints
    openAIKey: str = ""
    ollamaEndpoint: str = "http://localhost:11434"
    lmStudioEndpoint: str = "http://localhost:1234"
    xaiKey: str = ""
    anthropicKey: str = ""
    geminiKey: str = ""
    deepSeekKey: str = ""

    # Model settings
    selectedLLM: str = "openai"
    streamingEnabled: bool = True
    temperature: float = 0.7
    topP: float = 0.9
    systemPrompt: str = "You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions."

    # Defaults
    selectedSearchEngine: str = "duckduckgo"
    searxngUrl: str = ""
    defaultImageProvider: str = "openai"
    defaultImageModel: str = ""
    defaultVisionModel: str = ""
    selectedModel: str = ""

    # UI settings
    showRawResponse: bool = False
    autoTitleGeneration: bool = True
    codeFormatting: bool = True
    markdownRendering: bool = True

@router.get("")
async def get_settings(user_id: dict = Depends(get_current_user)):
    """Get user settings"""
    db = get_db()

    # Get basic settings from users table
    user_settings = db.execute(
        "SELECT theme, language, auto_refresh, max_tokens FROM users WHERE id = ?",
        (user_id["id"],)
    ).fetchone()

    # Get extended settings from user_settings table
    extended_settings = db.execute(
        "SELECT settings_json FROM user_settings WHERE user_id = ?",
        (user_id["id"],)
    ).fetchone()

    # Default settings
    default_settings = {
        "theme": "dark",
        "language": "en",
        "auto_refresh": True,
        "max_tokens": 8000,
        "openAIKey": "",
        "ollamaEndpoint": "http://localhost:11434",
        "lmStudioEndpoint": "http://localhost:1234",
        "xaiKey": "",
        "anthropicKey": "",
        "geminiKey": "",
        "deepSeekKey": "",
        "selectedLLM": "",
        "streamingEnabled": True,
        "temperature": 0.7,
        "topP": 0.9,
        "systemPrompt": "You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions.",
        "selectedSearchEngine": "duckduckgo",
        "searxngUrl": "http://127.0.0.1:8080",
        "selectedModel": "",
        "defaultVisionModel": "",
        "showRawResponse": False,
        "autoTitleGeneration": True,
        "codeFormatting": True,
        "markdownRendering": True
    }

    # Merge user settings with defaults
    if user_settings:
        default_settings.update({
            "theme": user_settings[0] or "dark",
            "language": user_settings[1] or "en",
            "auto_refresh": bool(user_settings[2]) if user_settings[2] is not None else True,
            "max_tokens": user_settings[3] or 8000
        })

    # Merge extended settings
    if extended_settings and extended_settings[0]:
        import json
        try:
            extended = json.loads(extended_settings[0])
            default_settings.update(extended)
        except:
            pass

    return default_settings

@router.put("")
@router.post("")
async def update_settings(settings: SettingsUpdate, user_id: dict = Depends(get_current_user)):
    """Update user settings"""
    db = get_db()

    # Check if user exists
    user = db.execute("SELECT id FROM users WHERE id = ?", (user_id["id"],)).fetchone()
    if not user:
        raise HTTPException(404, "User not found")

    # Update basic settings in users table
    db.execute(
        "UPDATE users SET theme = ?, language = ?, auto_refresh = ?, max_tokens = ? WHERE id = ?",
        (settings.theme, settings.language, settings.auto_refresh, settings.max_tokens, user_id["id"])
    )

    # Update extended settings in user_settings table
    import json
    extended_settings = {
        "openAIKey": settings.openAIKey,
        "ollamaEndpoint": settings.ollamaEndpoint,
        "lmStudioEndpoint": settings.lmStudioEndpoint,
        "xaiKey": settings.xaiKey,
        "anthropicKey": settings.anthropicKey,
        "geminiKey": settings.geminiKey,
        "deepSeekKey": settings.deepSeekKey,
        "selectedLLM": settings.selectedLLM,
        "streamingEnabled": settings.streamingEnabled,
        "temperature": settings.temperature,
        "topP": settings.topP,
        "systemPrompt": settings.systemPrompt,
        "selectedSearchEngine": settings.selectedSearchEngine,
        "searxngUrl": settings.searxngUrl or "",
        "selectedModel": settings.selectedModel,
        "defaultImageProvider": settings.defaultImageProvider,
        "defaultImageModel": settings.defaultImageModel,
        "defaultVisionModel": settings.defaultVisionModel,
        "showRawResponse": settings.showRawResponse,
        "autoTitleGeneration": settings.autoTitleGeneration,
        "codeFormatting": settings.codeFormatting,
        "markdownRendering": settings.markdownRendering
    }

    # Insert or update extended settings
    db.execute(
        "INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)",
        (user_id["id"], json.dumps(extended_settings))
    )

    db.commit()

    return {"message": "Settings updated", "settings": settings.dict()}

class VisionModelUpdate(BaseModel):
    model: str = ""


@router.post("/vision")
async def set_default_vision_model(req: VisionModelUpdate, user_id: dict = Depends(get_current_user)):
    """Set just the user's default vision model (used by GGUF vision 'load')."""
    import json
    db = get_db()
    row = db.execute(
        "SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id["id"],)
    ).fetchone()
    settings = json.loads(row[0]) if row and row[0] else {}
    settings["defaultVisionModel"] = req.model.strip()
    db.execute(
        "INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)",
        (user_id["id"], json.dumps(settings)),
    )
    db.commit()
    return {"message": "Default vision model updated", "defaultVisionModel": settings["defaultVisionModel"]}


class SearxngProbeRequest(BaseModel):
    base_url: str = ""


@router.post("/search/connectivity")
async def test_searxng_connectivity(req: SearxngProbeRequest):
    """Probe a SearXNG instance URL for reachability + JSON API."""
    from app.search import get_search_provider
    provider = get_search_provider("searxng")
    ok, msg = await provider.test(base_url=req.base_url.strip() or None)
    return {"valid": ok, "message": msg}


@router.get("/themes")
async def get_available_themes():
    """Get available theme options"""
    return {
        "themes": [
            {"id": "dark", "name": "Dark"},
            {"id": "light", "name": "Light"},
            {"id": "system", "name": "System"}
        ]
    }

@router.get("/languages")
async def get_available_languages():
    """Get available language options"""
    return {
        "languages": [
            {"id": "en", "name": "English"},
            {"id": "id", "name": "Indonesian"},
            {"id": "es", "name": "Spanish"},
            {"id": "fr", "name": "French"}
        ]
    }
