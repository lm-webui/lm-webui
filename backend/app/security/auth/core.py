"""
Core Authentication Functions

This module provides the core authentication functionality including:
- JWT token creation and verification
- Password hashing and verification
- Secret key management
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from pathlib import Path
import secrets
import logging

logger = logging.getLogger(__name__)

# Persistent secret key management
def get_secret_key():
    """Get or create persistent JWT secret key from .secrets directory (migrated from legacy secrets/)"""
    secret_file = Path(".secrets/jwt_secret")
    secret_file.parent.mkdir(exist_ok=True)
    if secret_file.exists():
        # Read binary secret and convert to base64 string for JWT
        import base64
        secret_bytes = secret_file.read_bytes()
        return base64.urlsafe_b64encode(secret_bytes).decode()
    # Generate new secret as bytes and save
    secret_bytes = secrets.token_bytes(32)  # 32 bytes = 256 bits
    secret_file.write_bytes(secret_bytes)
    secret_file.chmod(0o600)
    # Return as base64 string
    import base64
    return base64.urlsafe_b64encode(secret_bytes).decode()

# Configuration
SECRET_KEY = get_secret_key()
ALGORITHM = "HS256"

# Password context - using pbkdf2_sha256 for better security
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def _get_token_expiry() -> tuple:
    """Read token expiry settings from config_manager (fallback: 60 min / 7 days)."""
    try:
        from app.core.config_manager import get_security_config
        cfg = get_security_config()
        return cfg.access_token_expire_minutes, cfg.refresh_token_expire_days
    except Exception:
        logger.debug("config_manager not available, using default token expiry")
        return 60, 7

# Token functions
def create_access_token(user_id: int, role: str = "user", permissions: list = None,
                        expires_delta: Optional[timedelta] = None) -> str:
    """Create access token with role and permissions.
    Default expiry: 60 minutes (configurable via APP_SECURITY_ACCESS_TOKEN_EXPIRE_MINUTES).
    """
    if expires_delta is None:
        minutes, _ = _get_token_expiry()
        expires_delta = timedelta(minutes=minutes)
    expire = datetime.utcnow() + expires_delta
    payload = {
        "sub": str(user_id),
        "role": role,
        "permissions": permissions or [],
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, ALGORITHM)

def create_refresh_token(user_id: int, role: str = "user", permissions: list = None,
                         expires_delta: Optional[timedelta] = None) -> str:
    """Create refresh token with role and permissions.
    Default expiry: 7 days (configurable via APP_SECURITY_REFRESH_TOKEN_EXPIRE_DAYS).
    """
    if expires_delta is None:
        _, days = _get_token_expiry()
        expires_delta = timedelta(days=days)
    expire = datetime.utcnow() + expires_delta
    payload = {
        "sub": str(user_id),
        "role": role,
        "permissions": permissions or [],
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, SECRET_KEY, ALGORITHM)

def verify_token(token: str) -> dict:
    """Verify token and return payload with id, role, permissions."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return {
        "id": int(payload["sub"]),
        "role": payload.get("role", "user"),
        "permissions": payload.get("permissions", []),
    }

# Password functions
def hash_password(password: str) -> str:
    """Hash a password using the configured context"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)
