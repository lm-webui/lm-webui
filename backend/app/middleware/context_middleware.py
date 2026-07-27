"""
Unified Context Middleware
Attaches user context to every request from JWT (cookie or Bearer).
"""

from fastapi import Request
from typing import Optional, Dict, Any
from jose import jwt
from app.security.auth.core import get_secret_key


class RequestContext:
    """Unified request context container"""

    def __init__(self, user_id: Optional[int] = None,
                 conversation_id: Optional[str] = None,
                 message_id: Optional[str] = None):
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.message_id = message_id

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            "message_id": self.message_id,
        }

    def is_authenticated(self) -> bool:
        return self.user_id is not None


async def extract_context_from_request(request: Request) -> RequestContext:
    """Extract user context from JWT in Authorization header or cookie."""
    context = RequestContext()
    conversation_id = request.headers.get("X-Conversation-ID")
    message_id = request.headers.get("X-Message-ID")
    if conversation_id:
        context.conversation_id = conversation_id
    if message_id:
        context.message_id = message_id

    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    if not token:
        token = request.cookies.get("access_token")

    if token:
        try:
            payload = jwt.decode(token, get_secret_key(), algorithms=["HS256"])
            context.user_id = int(payload.get("sub"))
        except jwt.InvalidTokenError:
            pass

    return context


async def attach_context_middleware(request: Request, call_next):
    """Middleware: attach request context, then call next."""
    request.state.context = await extract_context_from_request(request)
    return await call_next(request)
