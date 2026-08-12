from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.security.encryption import encrypt_key, decrypt_key
from app.security.auth.dependencies import get_current_user
from app.database import get_db

router = APIRouter(prefix="/api/api_keys")

import os

class ApiKeyRequest(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None

@router.post("")
async def save_api_key(request: ApiKeyRequest, user_id: dict = Depends(get_current_user)):
    db = get_db()
    
    # For local providers (lmstudio, ollama), we store URLs
    # For cloud providers, we encrypt the API key
    local_providers = {"lmstudio", "ollama"}
    
    if request.provider in local_providers:
        # For local providers, the api_key field contains the URL
        # Validate it's a URL (basic validation)
        url_to_store = request.api_key.strip()
        if not url_to_store.startswith(("http://", "https://")):
            # Try to add http:// if not present
            url_to_store = f"http://{url_to_store}"
        
        # Ensure URL ends with /v1 for OpenAI compatibility if not already
        if not url_to_store.endswith("/v1"):
            url_to_store = url_to_store.rstrip("/") + "/v1"
        
        encrypted_url = encrypt_key(url_to_store)
        
        # Check if table has base_url column
        try:
            db.execute(
                "INSERT OR REPLACE INTO api_keys (user_id, provider, encrypted_key, base_url) VALUES (?, ?, ?, ?)",
                (user_id["id"], request.provider, encrypted_url, encrypted_url)
            )
        except Exception:
            # Fallback if base_url column doesn't exist
            db.execute(
                "INSERT OR REPLACE INTO api_keys (user_id, provider, encrypted_key) VALUES (?, ?, ?)",
                (user_id["id"], request.provider, encrypted_url)
            )
    elif request.provider == "google_search" and request.base_url:
        # Google Search pairs an API key (encrypted_key) with a Programmable
        # Search Engine ID / cx (stored in base_url). Both are encrypted at rest.
        encrypted_key = encrypt_key(request.api_key)
        encrypted_cx = encrypt_key(request.base_url.strip())
        db.execute(
            "INSERT OR REPLACE INTO api_keys (user_id, provider, encrypted_key, base_url) VALUES (?, ?, ?, ?)",
            (user_id["id"], request.provider, encrypted_key, encrypted_cx)
        )
    else:
        # For cloud providers, encrypt the API key
        encrypted = encrypt_key(request.api_key)
        db.execute(
            "INSERT OR REPLACE INTO api_keys (user_id, provider, encrypted_key) VALUES (?, ?, ?)",
            (user_id["id"], request.provider, encrypted)
        )
    
    db.commit()
    return {"message": "Key saved"}

@router.get("")
async def list_api_keys(user_id: dict = Depends(get_current_user)):
    db = get_db()
    # Try to get base_url if column exists
    try:
        keys = db.execute(
            "SELECT provider, created_at, base_url FROM api_keys WHERE user_id = ?", (user_id["id"],)
        ).fetchall()
        key_list = [{"provider": k[0], "created_at": k[1], "has_base_url": bool(k[2])} for k in keys]
    except Exception:
        # Fallback if base_url column doesn't exist
        keys = db.execute(
            "SELECT provider, created_at FROM api_keys WHERE user_id = ?", (user_id["id"],)
        ).fetchall()
        key_list = [{"provider": k[0], "created_at": k[1]} for k in keys]
    
    existing_providers = {k["provider"] for k in key_list}
    
    # Check environment variables for keys
    env_mapping = {
        "OPENAI_API_KEY": "openai",
        "ANTHROPIC_API_KEY": "anthropic", 
        "GOOGLE_API_KEY": "google",
        "XAI_API_KEY": "xai",
        "DEEPSEEK_API_KEY": "deepseek"
    }
    
    for env_var, provider in env_mapping.items():
        if os.getenv(env_var) and provider not in existing_providers:
            key_list.append({
                "provider": provider,
                "created_at": "Configured via Environment"
            })
            
    return {"keys": key_list}

@router.get("/{provider}")
async def get_api_key(provider: str, user_id: dict = Depends(get_current_user)):
    db = get_db()
    # Try to get base_url if column exists
    try:
        result = db.execute(
            "SELECT encrypted_key, base_url FROM api_keys WHERE user_id = ? AND provider = ?",
            (user_id["id"], provider)
        ).fetchone()
    except Exception:
        # Fallback if base_url column doesn't exist
        result = db.execute(
            "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
            (user_id["id"], provider)
        ).fetchone()
        result = (result[0], None) if result else None

    if result:
        decrypted_key = decrypt_key(result[0])
        response = {"api_key": decrypted_key}
        
        # If we have a base_url, decrypt and add it
        if result[1]:
            try:
                decrypted_url = decrypt_key(result[1])
                response["base_url"] = decrypted_url
            except:
                pass
                
        return response
    else:
        raise HTTPException(404, "API key not found for this provider")

@router.delete("/{provider}")
async def delete_api_key(provider: str, user_id: dict = Depends(get_current_user)):
    db = get_db()
    db.execute(
        "DELETE FROM api_keys WHERE user_id = ? AND provider = ?",
        (user_id["id"], provider)
    )
    db.commit()
    return {"message": "Key deleted"}

@router.post("/{provider}/test")
async def test_api_key(provider: str, user_id: dict = Depends(get_current_user)):
    """Test if an API key is valid by making a simple API call"""
    db = get_db()
    
    # Get the API key from database
    try:
        result = db.execute(
            "SELECT encrypted_key, base_url FROM api_keys WHERE user_id = ? AND provider = ?",
            (user_id["id"], provider)
        ).fetchone()
    except Exception:
        # Fallback if base_url column doesn't exist
        result = db.execute(
            "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
            (user_id["id"], provider)
        ).fetchone()
        result = (result[0], None) if result else None

    if not result:
        raise HTTPException(404, "API key not found for this provider")
    
    decrypted_key = decrypt_key(result[0])
    
    # For local providers, we need to test URL connectivity
    local_providers = {"lmstudio", "ollama"}
    if provider in local_providers:
        # Test URL connectivity
        import aiohttp
        import asyncio
        
        url = decrypted_key
        if not url.startswith(("http://", "https://")):
            url = f"http://{url}"
        
        # Ensure URL ends with /v1 for OpenAI compatibility
        if not url.endswith("/v1"):
            url = url.rstrip("/") + "/v1"
        
        try:
            # Try to connect to the URL
            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Try to get models endpoint
                test_url = f"{url.rstrip('/v1')}/models" if provider == "lmstudio" else f"{url.rstrip('/v1')}/api/tags"
                async with session.get(test_url) as response:
                    if response.status == 200:
                        return {"valid": True, "message": f"Successfully connected to {provider}"}
                    else:
                        return {"valid": False, "message": f"Connection failed with status {response.status}"}
        except asyncio.TimeoutError:
            return {"valid": False, "message": "Connection timeout"}
        except Exception as e:
            return {"valid": False, "message": f"Connection error: {str(e)}"}
    elif provider in {"google_search", "perplexity"}:
        # Web-search providers — test the key against their API directly.
        from app.search import get_search_provider
        provider_instance = get_search_provider(provider)
        try:
            cx = None
            if provider == "google_search" and result[1]:
                cx = decrypt_key(result[1])  # stored cx in base_url
            ok, msg = await provider_instance.test(api_key=decrypted_key, cx=cx)
            return {"valid": ok, "message": msg}
        except Exception as e:
            return {"valid": False, "message": f"Search provider test failed: {str(e)}"}
    else:
        # For cloud providers, test by fetching models
        from app.services.model_registry import get_model_registry
        
        try:
            model_registry = get_model_registry()
            strategy = model_registry.get_strategy(provider, user_id["id"])
            
            if not strategy:
                return {"valid": False, "message": f"Unsupported provider: {provider}"}
            
            # Get a session and test the API key
            session = await model_registry.get_session()
            models = await strategy.fetch_models(decrypted_key, session)
            
            if models:
                return {"valid": True, "message": f"API key is valid. Found {len(models)} models."}
            else:
                return {"valid": False, "message": "API key appears invalid or no models found."}
                
        except Exception as e:
            return {"valid": False, "message": f"API key test failed: {str(e)}"}
