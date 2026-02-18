"""
Authentication Routes

This module provides the FastAPI routes for authentication including:
- User registration and login
- Token refresh and logout
- User management
"""

from fastapi import APIRouter, HTTPException, Response, Depends, Cookie, Request
from pydantic import BaseModel
from app.database import get_db
from app.security.auth.core import create_access_token, create_refresh_token, verify_token, pwd_context, hash_password, verify_password
from app.security.auth.dependencies import get_current_user
from app.core.config_manager import is_development

router = APIRouter(prefix="/api/auth")

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(req: LoginRequest, response: Response):
    """Login user and set JWT tokens as httpOnly cookies"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id, password_hash FROM users WHERE email = ?", (req.email,)).fetchone()
        if not user or not verify_password(req.password, user[1]):
            raise HTTPException(401, "Invalid credentials")
        
        user_id = user[0]
        
        # Generate tokens
        access = create_access_token(user_id)
        refresh = create_refresh_token(user_id)
        
        # Set both tokens as httpOnly cookies with security attributes
        # Use secure=True in production, secure=False in development
        secure_cookie = not is_development()
        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=secure_cookie,
            samesite="lax" if is_development() else "strict",
            max_age=60*60  # 60 minutes
        )
        
        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=secure_cookie,
            samesite="lax" if is_development() else "strict",
            max_age=7*24*60*60  # 7 days
        )
        
        return {"user": {"id": user_id, "email": req.email}}

@router.post("/refresh")
async def refresh(response: Response, refresh_token: str = Cookie(None)):
    """Refresh access token using refresh token cookie and set new access token as httpOnly cookie"""
    if not refresh_token:
        raise HTTPException(401, "No refresh token")
    
    try:
        user_id = verify_token(refresh_token)
        new_access = create_access_token(user_id)
        
        # Set new access token as httpOnly cookie
        # Use secure=True in production, secure=False in development
        secure_cookie = not is_development()
        response.set_cookie(
            key="access_token",
            value=new_access,
            httponly=True,
            secure=secure_cookie,
            samesite="lax" if is_development() else "strict",
            max_age=60*60  # 60 minutes
        )
        
        return {"message": "Token refreshed successfully"}
    except:
        raise HTTPException(401, "Invalid refresh token")

@router.post("/logout")
async def logout(response: Response):
    """Logout user by clearing both token cookies"""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}

@router.post("/register")
async def register(req: LoginRequest, response: Response):
    """Register a new user and set JWT tokens as httpOnly cookies"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        # Check if user already exists
        cursor = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(400, "User already exists")
        
        # Create user
        password_hash = hash_password(req.password)
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (req.email, password_hash)
        )
        user_id = cursor.lastrowid
        
        # Generate tokens
        access = create_access_token(user_id)
        refresh = create_refresh_token(user_id)
        
        # Set both tokens as httpOnly cookies with security attributes
        # Use secure=True in production, secure=False in development
        secure_cookie = not is_development()
        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=secure_cookie,
            samesite="lax" if is_development() else "strict",
            max_age=60*60  # 60 minutes
        )
        
        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=secure_cookie,
            samesite="lax" if is_development() else "strict",
            max_age=7*24*60*60  # 7 days
        )
        
        return {"user": {"id": user_id, "email": req.email}}

@router.get("/me")
async def get_current_user_info(user_id: dict = Depends(get_current_user)):
    """Get current user information using standardized dependency"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id["id"],)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        return {"id": user[0], "email": user[1]}

@router.get("/status")
async def get_auth_status():
    """Check if any user exists in the system"""
    from app.database.sqlite.connection_pool import database_manager
    
    with database_manager.transaction() as conn:
        user = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
        return {"hasUser": user is not None}
