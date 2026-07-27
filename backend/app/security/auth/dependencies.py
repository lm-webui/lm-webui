"""
Authentication Dependencies

This module provides FastAPI dependencies for authentication and authorization.
"""

from fastapi import HTTPException, Cookie, Depends
from .core import verify_token
from app.database import get_db

def get_current_user(access_token: str = Cookie(None)):
    """Dependency to get current user from access token cookie
    Returns consistent dictionary format for provider-level workflow compatibility
    Uses consistent strict authentication pattern across all routes
    """
    if not access_token:
        raise HTTPException(
            status_code=401, 
            detail={
                "success": False,
                "error": "Authentication required",
                "message": "Please log in to access this resource"
            }
        )
    
    try:
        user_id = verify_token(access_token)
        
        # Fetch role from database with guaranteed connection closure
        role = "user"
        db = None
        try:
            db = get_db()
            cursor = db.execute("SELECT role FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            if row and row['role']:
                role = row['role']
        except Exception as e:
            # Default to user on DB error (fail closed)
            print(f"⚠️ Error fetching user role in dependency: {e}")
        finally:
            if db:
                try:
                    db.close()
                except:
                    pass

        # Return consistent dictionary format for provider-level workflow
        return {
            "id": user_id,
            "user_id": user_id,
            "authenticated": True,
            "role": role
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail={
                "success": False,
                "error": "Invalid access token",
                "message": "Please log in again"
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
