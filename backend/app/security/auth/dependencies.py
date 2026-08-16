"""
Authentication Dependencies

This module provides FastAPI dependencies for authentication and authorization.
"""

import hashlib
from fastapi import HTTPException, Cookie, Depends, Header
from .core import verify_token
from app.database import get_db

# ── Permission constants ──────────────────────────────────────────────
ALL_PERMISSIONS = [
    "models.read", "models.install", "models.delete",
    "users.manage", "users.manage_roles",
    "settings.read", "settings.write",
    "billing.view", "billing.manage",
    "projects.manage",
    "audit.view",
    "runtime.view", "runtime.configure", "runtime.install", "runtime.control",
    "agents.run",  # admin-only: runs host CLI agents (claude/codex/opencode/hermes)
]

DEFAULT_USER_PERMISSIONS = [
    "models.read",
    "models.install",
    "settings.read",
    "projects.manage",
    "runtime.view",
]


def get_permissions_for_role(role: str) -> list:
    """Return permission list for a given role."""
    if role == "admin":
        return list(ALL_PERMISSIONS)
    return list(DEFAULT_USER_PERMISSIONS)


def get_current_user(access_token: str = Cookie(None)):
    """Dependency to get current user from JWT in access_token cookie.
    Role and permissions are read from the JWT payload — no DB query.
    """
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={
                "success": False,
                "error": "Authentication required",
                "message": "Please log in to access this resource",
            }
        )

    try:
        payload = verify_token(access_token)
        return {
            "id": payload["id"],
            "user_id": payload["id"],
            "authenticated": True,
            "role": payload["role"],
            "permissions": payload["permissions"],
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail={
                "success": False,
                "error": "Invalid access token",
                "message": "Please log in again",
            }
        )

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to ensure user has admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return current_user


def require_permission(permission: str):
    """Factory: returns a dependency that checks for a specific permission."""
    def checker(current_user: dict = Depends(get_current_user)):
        if permission not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=403,
                detail=f"Permission required: {permission}"
            )
        return current_user
    return checker


def get_api_or_session_user(
    authorization: str = Header(None),
    access_token: str = Cookie(None),
):
    """Try API key (Bearer token) first, fall back to session cookie."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        db = get_db()
        try:
            row = db.execute(
                """SELECT u.id, u.role, u.permissions
                   FROM api_tokens t JOIN users u ON u.id = t.user_id
                   WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))""",
                (token_hash,),
            ).fetchone()
            if row:
                # Update last_used_at asynchronously
                try:
                    db.execute("UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?", (token_hash,))
                    db.commit()
                except Exception:
                    pass
                permissions = __import__("json").loads(row[2]) if isinstance(row[2], str) else row[2]
                return {
                    "id": row[0],
                    "user_id": row[0],
                    "role": row[1],
                    "permissions": permissions,
                    "authenticated": True,
                    "api_key": True,
                }
        finally:
            db.close()
    return get_current_user(access_token)
