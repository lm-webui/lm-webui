"""Private, user-owned structured artifacts."""
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.database import get_db
from app.security.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])
ALLOWED_TYPES = {"document", "report", "meeting_notes", "proposal", "content_brief"}

class ArtifactCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artifact_type: str = "document"
    content: dict = Field(default_factory=dict)
    project_id: str | None = None
    conversation_id: str | None = None

class ArtifactUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: dict | None = None

SELECT = """SELECT id, user_id, project_id, conversation_id, title, artifact_type,
content_json, format, version, status, created_at, updated_at FROM artifacts"""

def serialize(row):
    return {"id": row[0], "user_id": row[1], "project_id": row[2], "conversation_id": row[3],
            "title": row[4], "artifact_type": row[5], "content": json.loads(row[6]),
            "format": row[7], "version": row[8], "status": row[9], "created_at": row[10], "updated_at": row[11]}

def owned(db, artifact_id, user_id):
    return db.execute(SELECT + " WHERE id = ? AND user_id = ?", (artifact_id, user_id)).fetchone()

@router.get("")
async def list_artifacts(user: dict = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(SELECT + " WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC", (user["id"],)).fetchall()
    return {"artifacts": [serialize(row) for row in rows]}

@router.get("/{artifact_id}")
async def get_artifact(artifact_id: str, user: dict = Depends(get_current_user)):
    row = owned(get_db(), artifact_id, user["id"])
    if not row: raise HTTPException(404, "Artifact not found")
    return {"artifact": serialize(row)}

@router.post("", status_code=201)
async def create_artifact(data: ArtifactCreate, user: dict = Depends(get_current_user)):
    if data.artifact_type not in ALLOWED_TYPES: raise HTTPException(422, "Unsupported artifact type")
    db = get_db()
    if data.project_id and not db.execute("SELECT 1 FROM projects WHERE id = ? AND user_id = ?", (data.project_id, user["id"])).fetchone():
        raise HTTPException(404, "Project not found")
    if data.conversation_id and not db.execute("SELECT 1 FROM conversations WHERE id = ? AND user_id = ?", (data.conversation_id, user["id"])).fetchone():
        raise HTTPException(404, "Conversation not found")
    artifact_id = f"art_{uuid.uuid4().hex}"
    db.execute("INSERT INTO artifacts (id,user_id,project_id,conversation_id,title,artifact_type,content_json) VALUES (?,?,?,?,?,?,?)",
               (artifact_id, user["id"], data.project_id, data.conversation_id, data.title.strip(), data.artifact_type, json.dumps(data.content)))
    db.commit()
    return {"artifact": serialize(owned(db, artifact_id, user["id"]))}

@router.post("/from-conversation", status_code=201)
async def create_from_conversation(data: ArtifactCreate, user: dict = Depends(get_current_user)):
    if not data.conversation_id: raise HTTPException(422, "conversation_id is required")
    db = get_db()
    conversation = db.execute("SELECT title FROM conversations WHERE id = ? AND user_id = ?", (data.conversation_id, user["id"])).fetchone()
    if not conversation: raise HTTPException(404, "Conversation not found")
    messages = db.execute("SELECT role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC", (data.conversation_id, user["id"])).fetchall()
    content = {"blocks": [{"type": "heading", "text": data.title.strip()}] + [{"type": "paragraph", "role": m[0], "text": m[1], "created_at": m[2]} for m in messages]}
    return await create_artifact(ArtifactCreate(title=data.title, artifact_type=data.artifact_type, content=content, project_id=data.project_id, conversation_id=data.conversation_id), user)

@router.patch("/{artifact_id}")
async def update_artifact(artifact_id: str, data: ArtifactUpdate, user: dict = Depends(get_current_user)):
    db = get_db(); row = owned(db, artifact_id, user["id"])
    if not row: raise HTTPException(404, "Artifact not found")
    title = data.title.strip() if data.title is not None else row[4]
    content = data.content if data.content is not None else json.loads(row[6])
    db.execute("UPDATE artifacts SET title=?, content_json=?, version=version+1, updated_at=? WHERE id=? AND user_id=?", (title, json.dumps(content), datetime.utcnow().isoformat(), artifact_id, user["id"]))
    db.commit()
    return {"artifact": serialize(owned(db, artifact_id, user["id"]))}

@router.delete("/{artifact_id}")
async def delete_artifact(artifact_id: str, user: dict = Depends(get_current_user)):
    db = get_db(); result = db.execute("UPDATE artifacts SET status='deleted', updated_at=? WHERE id=? AND user_id=?", (datetime.utcnow().isoformat(), artifact_id, user["id"]))
    db.commit()
    if result.rowcount == 0: raise HTTPException(404, "Artifact not found")
    return {"success": True}
