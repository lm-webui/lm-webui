"""
API Token Routes — CRUD for programmatic API tokens with scoped permissions.
"""
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/tokens")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.get("")
async def list_tokens(user_id: dict = Depends(get_current_user)):
    """List API tokens for the current user (showing only name and prefix, not full token)."""
    db = get_db()
    rows = db.execute(
        """SELECT id, name, SUBSTR(token_hash, 1, 8) as prefix, last_used_at, expires_at, created_at
           FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC""",
        (user_id["id"],),
    ).fetchall()
    return {
        "tokens": [
            {
                "id": r[0],
                "name": r[1],
                "prefix": r[2] + "...",
                "last_used_at": r[3],
                "expires_at": r[4],
                "created_at": r[5],
            }
            for r in rows
        ]
    }


@router.post("")
async def create_token(data: dict, user_id: dict = Depends(get_current_user)):
    """Create a new API token. Returns the full token once."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(422, "Token name is required")

    raw_token = f"lmu_{secrets.token_urlsafe(32)}"
    token_hash = _hash_token(raw_token)
    expires_in = data.get("expires_in_days", 365)
    expires_at = (datetime.now() + timedelta(days=expires_in)).isoformat()

    db = get_db()
    token_id = f"tok_{uuid.uuid4().hex}"
    db.execute(
        "INSERT INTO api_tokens (id, user_id, name, token_hash, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        (token_id, user_id["id"], name, token_hash, "[]", expires_at),
    )
    db.commit()
    return {"id": token_id, "name": name, "token": raw_token, "expires_at": expires_at}


@router.delete("/{token_id}")
async def delete_token(token_id: str, user_id: dict = Depends(get_current_user)):
    """Delete an API token."""
    db = get_db()
    db.execute(
        "DELETE FROM api_tokens WHERE id = ? AND user_id = ?",
        (token_id, user_id["id"]),
    )
    db.commit()
    return {"message": "Token deleted"}
