"""
Sessions Routes

This module provides routes for session management.
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/sessions")

@router.post("")
async def create_session(
    title: str = "New Chat",
    conversation_id: Optional[str] = None,
    metadata: Optional[str] = None,
    user_id: dict = Depends(get_current_user)
):
    """Create a new conversation (session) - Backend controls ID generation"""
    import uuid
    db = get_db()
    
    # Backend generates ID - ignore frontend-provided ID to prevent conflicts
    # Use UUID for uniqueness across all users and sessions
    conv_id = f"conv_{uuid.uuid4().hex}"
    
    # Check if conversation already exists (unlikely with UUID but safe)
    existing = db.execute(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id["id"])
    ).fetchone()
    
    if existing:
        print(f"🔄 Conversation already exists: {conv_id} with title: {existing[1]}")
        return {
            "conversation_id": conv_id,
            "title": existing[1] or title,
            "created_at": datetime.now().isoformat(),
            "exists": True
        }
    
    # Create conversation in database
    import json
    meta_value = metadata if metadata else "{}"
    db.execute(
        "INSERT INTO conversations (id, user_id, title, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (conv_id, user_id["id"], title, meta_value, datetime.now(), datetime.now())
    )
    db.commit()
    
    print(f"✅ Created new conversation: {conv_id} with title: {title} (backend-generated UUID)")
    
    return {
        "conversation_id": conv_id,
        "title": title,
        "created_at": datetime.now().isoformat(),
        "exists": False
    }

@router.get("")
async def list_sessions(user_id: dict = Depends(get_current_user)):
    """Get user conversations as sessions for frontend compatibility
    Requires authentication - consistent with upload routes pattern
    """
    db = get_db()

    # Get conversations for the user
    conversations = db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id["id"],)
    ).fetchall()

    # Get message counts for each conversation
    sessions = []
    for conv in conversations:
        message_count = db.execute(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = ?",
            (conv[0],)
        ).fetchone()[0]

        sessions.append({
            "session_id": conv[0],
            "title": conv[1] or "New Chat",
            "last_activity": conv[3] or conv[2],  # Use updated_at or created_at
            "message_count": message_count
        })

    return {
        "sessions": sessions,
        "authenticated": True
    }

@router.delete("/{session_id}")
async def delete_session(session_id: str, user_id: dict = Depends(get_current_user)):
    """Delete a conversation (session)"""
    db = get_db()

    # Verify conversation belongs to user
    conversation = db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (session_id, user_id["id"])
    ).fetchone()

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    # Delete messages first (foreign key constraint)
    db.execute("DELETE FROM messages WHERE conversation_id = ?", (session_id,))
    db.execute("DELETE FROM conversations WHERE id = ?", (session_id,))
    db.commit()

    return {"message": "Conversation deleted"}

@router.get("/current")
async def get_current_session(user_id: dict = Depends(get_current_user)):
    """Get current session information"""
    db = get_db()

    user = db.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?",
        (user_id["id"],)
    ).fetchone()

    if not user:
        raise HTTPException(404, "User not found")

    return {
        "session": {
            "user_id": user[0],
            "email": user[1],
            "created_at": user[2],
            "active": True
        }
    }
