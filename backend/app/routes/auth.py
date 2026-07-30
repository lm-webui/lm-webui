"""
Authentication Routes

This module provides the FastAPI routes for authentication including:
- User registration and login
- Token refresh and logout
- User management
"""

from fastapi import APIRouter, HTTPException, Response, Depends, Cookie, Request
import os
from pydantic import BaseModel
from app.database import get_db
from app.security.auth.core import create_access_token, create_refresh_token, verify_token, pwd_context, hash_password, verify_password
from app.security.auth.dependencies import get_current_user, get_permissions_for_role
from app.services.audit import log_action

router = APIRouter(prefix="/api/auth")

class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = True

@router.post("/login")
async def login(req: LoginRequest, response: Response):
    """Login user and set JWT tokens as httpOnly cookies"""
    from app.database.sqlite.connection_pool import database_manager

    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id, password_hash, role, COALESCE(status, 'active') FROM users WHERE email = ?", (req.email,)).fetchone()
        if not user or not verify_password(req.password, user[1]):
            raise HTTPException(401, "Invalid credentials")

        user_id = user[0]
        role = user[2]
        if user[3] == "disabled":
            raise HTTPException(403, "Account disabled")
        conn.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))

        # Generate tokens with role and permissions
        permissions = get_permissions_for_role(role)
        access = create_access_token(user_id, role=role, permissions=permissions)
        refresh = create_refresh_token(user_id, role=role, permissions=permissions)

        # Set both tokens as httpOnly cookies
        # remember_me=true: persistent cookies (survive browser restart)
        # remember_me=false: session cookies (cleared on browser close)
        access_max_age = 60*60 if req.remember_me else None
        refresh_max_age = 7*24*60*60 if req.remember_me else None

        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
            max_age=access_max_age
        )

        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
            max_age=refresh_max_age
        )

        log_action(user_id=user_id, action="user.login")
        log_action(user_id=user_id, action="user.register")
        return {"user": {"id": user_id, "email": req.email, "role": role}, "access_token": access}

@router.post("/refresh")
async def refresh(response: Response, refresh_token: str = Cookie(None)):
    """Refresh access token using refresh token cookie and set new access token as httpOnly cookie"""
    if not refresh_token:
        raise HTTPException(401, "No refresh token")

    try:
        payload = verify_token(refresh_token)
        new_access = create_access_token(payload["id"], role=payload["role"], permissions=payload["permissions"])

        # Set new access token as httpOnly cookie — works over HTTP on any local network
        response.set_cookie(
            key="access_token",
            value=new_access,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
            max_age=60*60
        )

        return {"message": "Token refreshed successfully", "access_token": new_access}
    except:
        raise HTTPException(401, "Invalid refresh token")

@router.post("/logout")
async def logout(response: Response):
    """Logout user by clearing both token cookies"""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    log_action(action="user.logout")
    return {"message": "Logged out"}

@router.post("/register")
async def register(req: LoginRequest, response: Response):
    """Register a new user and set JWT tokens as httpOnly cookies"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        if os.getenv("APP_AUTH_ALLOW_REGISTRATION", "true").lower() == "false":
            existing_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if existing_count > 0:
                raise HTTPException(403, "Public registration is disabled")
        # Check if user already exists
        cursor = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(400, "User already exists")
        
        # Determine role - first user is admin
        cursor = conn.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        role = "admin" if user_count == 0 else "user"
        
        # Create user
        password_hash = hash_password(req.password)
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
            (req.email, password_hash, role)
        )
        user_id = cursor.lastrowid
        
        # Generate tokens with role and permissions
        permissions = get_permissions_for_role(role)
        access = create_access_token(user_id, role=role, permissions=permissions)
        refresh = create_refresh_token(user_id, role=role, permissions=permissions)
        
        # Set both tokens as httpOnly cookies — works over HTTP on any local network
        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
            max_age=60*60
        )

        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
            max_age=7*24*60*60
        )

        return {"user": {"id": user_id, "email": req.email, "role": role}, "access_token": access}

@router.get("/me")
async def get_current_user_info(user_id: dict = Depends(get_current_user)):
    """Get current user information using standardized dependency"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id, email, role, COALESCE(status, 'active') FROM users WHERE id = ?", (user_id["id"],)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        return {"id": user[0], "email": user[1], "role": user[2], "status": user[3]}

@router.get("/status")
async def get_auth_status():
    """Check if any user exists in the system"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
        return {"hasUser": user is not None}
