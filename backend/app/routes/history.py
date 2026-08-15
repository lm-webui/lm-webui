"""
History Routes

This module provides routes for conversation history management.
Uses unified conversation manager for consistent operations.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.security.auth.dependencies import get_current_user
from app.database import get_db
from app.chat.service import (
    get_user_conversations,
    get_conversation_messages,
    update_conversation_title,
    archive_conversation,
    restore_conversation,
    delete_conversation,
    get_conversation_stats
)
import os
import json
from datetime import datetime

router = APIRouter(prefix="/api/history")

@router.get("/conversations")
async def list_conversations(
    user_id: dict = Depends(get_current_user),
    state: str = "active"
):
    """Get list of user conversations with optional state filter"""
    valid_states = ["active", "archived", "all"]
    if state not in valid_states:
        raise HTTPException(400, f"Invalid state. Must be one of: {valid_states}")
    
    # Use unified conversation manager
    if state == "all":
        # Get both active and archived conversations
        active_conversations = get_user_conversations(user_id["id"], state="active")
        archived_conversations = get_user_conversations(user_id["id"], state="archived")
        conversations = active_conversations + archived_conversations
        # Sort by updated_at (descending)
        conversations.sort(key=lambda x: x["updated_at"], reverse=True)
    else:
        conversations = get_user_conversations(user_id["id"], state=state)
    
    return {
        "conversations": conversations
    }

@router.get("/conversation/{conversation_id}")
async def get_conversation(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Get specific conversation with messages"""
    # Use unified conversation manager
    messages = get_conversation_messages(conversation_id)
    
    # Verify conversation belongs to user and get title
    db = get_db()
    conv = db.execute(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id["id"])
    ).fetchone()
    
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    return {
        "conversation": {
            "id": conv[0],
            "title": conv[1],
            "messages": messages
        }
    }

@router.delete("/conversation/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Delete a conversation"""
    success = delete_conversation(conversation_id, user_id["id"])
    
    if not success:
        raise HTTPException(404, "Conversation not found or access denied")
    
    return {"message": "Conversation deleted"}

@router.post("/conversation/{conversation_id}/archive")
async def archive_conversation_endpoint(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Archive a conversation"""
    success = archive_conversation(conversation_id, user_id["id"])
    
    if not success:
        raise HTTPException(404, "Conversation not found or access denied")
    
    return {"message": "Conversation archived", "conversation_id": conversation_id, "state": "archived"}

@router.post("/conversation/{conversation_id}/restore")
async def restore_conversation_endpoint(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Restore an archived conversation"""
    success = restore_conversation(conversation_id, user_id["id"])
    
    if not success:
        raise HTTPException(404, "Conversation not found or access denied")
    
    return {"message": "Conversation restored", "conversation_id": conversation_id, "state": "active"}

@router.get("/stats")
async def get_conversation_stats_endpoint(user_id: dict = Depends(get_current_user)):
    """Get conversation statistics"""
    # Get stats using unified conversation manager
    db = get_db()
    
    # Get counts by state
    stats = db.execute(
        "SELECT state, COUNT(*) as count FROM conversations WHERE user_id = ? GROUP BY state",
        (user_id["id"],)
    ).fetchall()
    
    # Get total messages and tokens
    totals = db.execute(
        "SELECT SUM(message_count) as total_messages, SUM(total_tokens) as total_tokens FROM conversations WHERE user_id = ?",
        (user_id["id"],)
    ).fetchone()
    
    stats_dict = {row[0]: row[1] for row in stats}
    
    return {
        "stats": {
            "active": stats_dict.get("active", 0),
            "archived": stats_dict.get("archived", 0),
            "total": sum(stats_dict.values())
        },
        "totals": {
            "messages": totals[0] or 0,
            "tokens": totals[1] or 0
        }
    }

@router.post("/conversation/{conversation_id}/title")
async def update_conversation_title_endpoint(conversation_id: str, request: dict, user_id: dict = Depends(get_current_user)):
    """Update conversation title"""
    title = request.get("title")
    if not title:
        raise HTTPException(422, "Title is required")
    
    # Use unified conversation manager
    update_conversation_title(conversation_id, title)
    
    return {"message": "Title updated"}

@router.patch("/conversation/{conversation_id}/metadata")
async def update_conversation_metadata(
    conversation_id: str, request: dict,
    user_id: dict = Depends(get_current_user)
):
    """Update conversation metadata (e.g. project_id assignment)."""
    import json
    from datetime import datetime
    db = get_db()

    conv = db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id["id"]),
    ).fetchone()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    metadata = request.get("metadata", {})
    current = db.execute(
        "SELECT metadata FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id["id"]),
    ).fetchone()
    current_metadata = json.loads(current[0] or "{}") if current else {}
    current_metadata.update(metadata)
    metadata = current_metadata
    project_id = metadata.get("project_id")
    if project_id:
        project = db.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id["id"]),
        ).fetchone()
        if not project:
            raise HTTPException(404, "Project not found")
    elif "project_id" in metadata:
        metadata["project_id"] = None
    metadata_json = json.dumps(metadata)
    db.execute(
        "UPDATE conversations SET metadata = ?, updated_at = ? WHERE id = ?",
        (metadata_json, datetime.now(), conversation_id),
    )
    db.commit()
    return {"message": "Metadata updated", "metadata": metadata}

@router.post("/conversation/{conversation_id}/generate-title")
async def generate_conversation_title(
    conversation_id: str, 
    background_tasks: BackgroundTasks,
    user_id: dict = Depends(get_current_user)
):
    """Generate a title for a conversation using AI"""
    db = get_db()
    
    # Verify conversation belongs to user
    conv = db.execute(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id["id"])
    ).fetchone()
    
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    # Get first few messages from the conversation
    messages = db.execute(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 5",
        (conversation_id,)
    ).fetchall()
    
    if not messages:
        raise HTTPException(400, "No messages found in conversation")
    
    # Extract user messages for title generation
    user_messages = [msg[1] for msg in messages if msg[0] == "user"]
    if not user_messages:
        user_messages = [msg[1] for msg in messages[:1]]  # Use first message if no user messages
    
    # Generate title in background task
    background_tasks.add_task(
        generate_title_background,
        conversation_id,
        user_messages,
        user_id["id"]
    )
    
    return {
        "message": "Title generation started",
        "conversation_id": conversation_id,
        "status": "processing"
    }

async def generate_title_background(conversation_id: str, user_messages: list, user_id: int):
    """Background task to generate conversation title using AI"""
    try:
        # Use the first user message as context
        first_message = user_messages[0] if user_messages else ""
        
        # Truncate if too long
        if len(first_message) > 500:
            first_message = first_message[:497] + "..."
        
        # Generate title using LLM - use ModelRegistry with conversation's provider
        title = await generate_title_with_llm(first_message, conversation_id, user_id)
        
        if title:
            # Update conversation title in database
            db = get_db()
            db.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (title, datetime.now(), conversation_id, user_id)
            )
            db.commit()
            
            print(f"✅ Generated title for conversation {conversation_id}: {title}")

            # Title is returned via REST response — no real-time broadcast needed
        else:
            print(f"⚠️ Failed to generate title for conversation {conversation_id}")
            
    except Exception as e:
        print(f"❌ Title generation failed for conversation {conversation_id}: {e}")

async def generate_title_with_llm(message: str, conversation_id: str, user_id: int) -> str:
    """Generate a title using the conversation's own provider, with fallback."""
    try:
        # Use the conversation's own provider for title generation
        from app.database import get_db
        db = get_db()
        row = db.execute(
            "SELECT provider, model FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user_id),
        ).fetchone()

        provider = row[0] if row else "openai"
        model = row[1] if row else "gpt-4o-mini"

        from app.services.model_registry import get_model_registry
        model_registry = get_model_registry()
        strategy = model_registry.get_strategy(provider, user_id)

        if not strategy:
            return generate_fallback_title(message)

        api_keys = model_registry.get_user_api_keys(user_id)
        api_key = api_keys.get(provider) or api_keys.get(strategy.get_backend_name())

        # Build a standalone prompt asking for a short title
        prompt = f"Generate a concise title (max 6 words) for a conversation starting with: \"{message[:100]}\". Title:"

        messages = [
            {"role": "system", "content": "You are a helpful assistant that generates concise, descriptive titles for conversations."},
            {"role": "user", "content": prompt}
        ]
        
        # Generate title using the strategy
        session = await model_registry.get_session()
        title = await strategy.generate(
            model=model,
            messages=messages,
            api_key=api_key,
            session=session,
            max_tokens=20,
            temperature=0.7
        )
        
        # Clean up the title
        title = title.strip()
        title = title.replace('"', '').replace("'", "").strip()
        if title.endswith("."):
            title = title[:-1]
        
        print(f"✅ Generated title using {provider}/{model}: {title}")
        return title
        
    except Exception as e:
        print(f"❌ Title generation failed: {e}")
        # Fallback: Use simple heuristic
        return generate_fallback_title(message)

def generate_fallback_title(message: str) -> str:
    """Generate a fallback title using simple heuristics"""
    # Truncate and clean
    words = message.split()
    if len(words) > 10:
        title = " ".join(words[:8]) + "..."
    else:
        title = message
    
    # Remove special characters and limit length
    title = title.replace("\n", " ").replace("\r", " ").strip()
    if len(title) > 50:
        title = title[:47] + "..."
    
    return title

@router.get("/conversation/{conversation_id}/files")
async def get_conversation_files(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Get file references for a conversation"""
    db = get_db()
    
    # Verify conversation belongs to user
    conv = db.execute(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id["id"])
    ).fetchone()
    
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    # Get file references
    file_references = db.execute(
        "SELECT id, conversation_id, user_id, message_id, file_type, file_path, metadata, created_at FROM file_references WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,)
    ).fetchall()
    
    return {
        "files": [
            {
                "id": ref[0],
                "conversation_id": ref[1],
                "user_id": ref[2],
                "message_id": ref[3],
                "file_type": ref[4],
                "file_path": ref[5],
                "metadata": ref[6],
                "created_at": ref[7]
            }
            for ref in file_references
        ]
    }
