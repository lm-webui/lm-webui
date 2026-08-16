"""Agent Hub routes — chat wrapper around host CLI agents (admin-only)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.security.auth.dependencies import require_permission
from app.agents.registry import AGENTS, detect_all, profile
from app.agents.runner import run
from app.agents.parser import parse
from app.agents.sessions import sessions

router = APIRouter(prefix="/api/agents", tags=["agents"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class SessionCreate(BaseModel):
    pass


@router.get("", dependencies=[Depends(require_permission("agents.run"))])
async def list_agents():
    return {"agents": detect_all()}


@router.get("/{agent}/profile", dependencies=[Depends(require_permission("agents.run"))])
async def get_profile(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return profile(agent)


@router.get("/{agent}/sessions", dependencies=[Depends(require_permission("agents.run"))])
async def list_sessions(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"sessions": sessions.list(agent)}


@router.post("/{agent}/sessions", dependencies=[Depends(require_permission("agents.run"))])
async def create_session(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"session_id": sessions.create(agent)}


@router.delete("/{agent}/sessions/{sid}", dependencies=[Depends(require_permission("agents.run"))])
async def delete_session(agent: str, sid: str):
    if not sessions.delete(sid):
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@router.post("/{agent}/chat", dependencies=[Depends(require_permission("agents.run"))])
async def chat(agent: str, req: ChatRequest):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    msg = req.message.strip()
    if not msg:
        raise HTTPException(400, "Message is required")

    sid = req.session_id or sessions.create(agent)
    s = sessions.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")

    # Give the agent recent context from this session's transcript.
    history = s["transcript"][-6:]
    context = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    prompt = f"{context}\n\nuser: {msg}" if context else msg

    try:
        raw = await run(agent, prompt, s["cwd"])
    except Exception as exc:
        raise HTTPException(500, f"Agent run failed: {exc}")

    blocks = parse(agent, raw)
    sessions.append(sid, "user", msg)
    if blocks:
        sessions.append(sid, "assistant", blocks[-1].get("content", ""))
    return {"session_id": sid, "blocks": blocks}
