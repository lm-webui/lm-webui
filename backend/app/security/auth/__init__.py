"""
Centralized Authentication Module

This module consolidates all authentication functionality including:
- JWT token management
- Password hashing and verification
- User authentication and authorization
- Token refresh and validation
"""

from .core import (
    get_secret_key,
    create_access_token,
    create_refresh_token,
    verify_token,
    pwd_context,
    hash_password,
    verify_password
)

from .dependencies import get_current_user, require_permission, get_permissions_for_role, get_api_or_session_user

__all__ = [
    "get_secret_key",
    "create_access_token",
    "create_refresh_token",
    "verify_token",
    "pwd_context",
    "hash_password",
    "verify_password",
    "get_current_user",
    "require_permission",
    "get_permissions_for_role",
]
