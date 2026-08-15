"""
Projects Routes — CRUD for project workspaces with custom system prompts.
"""
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/projects")


@router.get("")
async def list_projects(user_id: dict = Depends(get_current_user)):
    """List all projects for the current user."""
    db = get_db()
    projects = db.execute(
        "SELECT id, name, system_prompt, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id["id"],),
    ).fetchall()

    # Get conversation counts for each project
    result = []
    for p in projects:
        count = db.execute(
            "SELECT COUNT(*) FROM conversations WHERE user_id = ? AND json_extract(metadata, '$.project_id') = ?",
            (user_id["id"], p[0]),
        ).fetchone()[0]
        result.append({
            "id": p[0],
            "name": p[1],
            "system_prompt": p[2],
            "conversation_count": count,
            "created_at": p[3],
            "updated_at": p[4],
        })
    return {"projects": result}


@router.post("")
async def create_project(data: dict, user_id: dict = Depends(get_current_user)):
    """Create a new project."""
    name = data.get("name", "").strip()
    system_prompt = data.get("system_prompt", "").strip()
    if not name:
        raise HTTPException(422, "Project name is required")
    if not system_prompt:
        raise HTTPException(422, "System prompt is required")

    project_id = f"proj_{uuid.uuid4().hex}"
    now = datetime.now()
    db = get_db()
    db.execute(
        "INSERT INTO projects (id, user_id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (project_id, user_id["id"], name, system_prompt, now, now),
    )
    db.commit()
    return {
        "id": project_id,
        "name": name,
        "system_prompt": system_prompt,
        "created_at": now.isoformat(),
    }


@router.put("/{project_id}")
async def update_project(project_id: str, data: dict, user_id: dict = Depends(get_current_user)):
    """Update a project's name or system prompt."""
    db = get_db()
    existing = db.execute(
        "SELECT id FROM projects WHERE id = ? AND user_id = ?",
        (project_id, user_id["id"]),
    ).fetchone()
    if not existing:
        raise HTTPException(404, "Project not found")

    name = data.get("name", "").strip()
    system_prompt = data.get("system_prompt", "").strip()
    if not name:
        raise HTTPException(422, "Project name is required")
    if not system_prompt:
        raise HTTPException(422, "System prompt is required")

    db.execute(
        "UPDATE projects SET name = ?, system_prompt = ?, updated_at = ? WHERE id = ?",
        (name, system_prompt, datetime.now(), project_id),
    )
    db.commit()
    return {"message": "Project updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str, user_id: dict = Depends(get_current_user)):
    """Delete a project."""
    db = get_db()
    existing = db.execute(
        "SELECT id FROM projects WHERE id = ? AND user_id = ?",
        (project_id, user_id["id"]),
    ).fetchone()
    if not existing:
        raise HTTPException(404, "Project not found")
    conversations = db.execute(
        "SELECT id, metadata FROM conversations WHERE user_id = ? AND json_extract(metadata, '$.project_id') = ?",
        (user_id["id"], project_id),
    ).fetchall()
    for conversation_id, metadata in conversations:
        values = json.loads(metadata or "{}")
        values.pop("project_id", None)
        db.execute(
            "UPDATE conversations SET metadata = ?, updated_at = ? WHERE id = ?",
            (json.dumps(values), datetime.now(), conversation_id),
        )
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    db.commit()
    return {"message": "Project deleted"}


@router.get("/{project_id}/conversations")
async def list_project_conversations(project_id: str, user_id: dict = Depends(get_current_user)):
    """List conversations belonging to a project."""
    db = get_db()
    project = db.execute(
        "SELECT id FROM projects WHERE id = ? AND user_id = ?",
        (project_id, user_id["id"]),
    ).fetchone()
    if not project:
        raise HTTPException(404, "Project not found")
    convs = db.execute(
        "SELECT id, title, created_at, updated_at, message_count FROM conversations WHERE user_id = ? AND json_extract(metadata, '$.project_id') = ? ORDER BY updated_at DESC",
        (user_id["id"], project_id),
    ).fetchall()
    return {
        "conversations": [
            {
                "id": c[0],
                "title": c[1] or "New Chat",
                "created_at": c[2],
                "updated_at": c[3],
                "message_count": c[4],
            }
            for c in convs
        ]
    }
