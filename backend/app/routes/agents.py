"""Agent Hub routes — chat wrapper around host CLI agents (admin-only)."""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.security.auth.dependencies import require_permission
from app.agents.registry import AGENTS, detect_all, profile, discover_skills
from app.agents.runner import run, run_collect, InteractiveSession
from app.agents import agent_files as af
from app.agents.providers import is_interactive, context_file
from app.agents.parser import parse
from app.agents.sessions import sessions

router = APIRouter(prefix="/api/agents", tags=["agents"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    model: Optional[str] = None  # claude --model (applies to the next session spawn)
    skill: Optional[str] = None  # skill id → appended system prompt


def _resolve_session(agent: str, req: ChatRequest):
    """Get-or-create the session.

    Returns (sid, s, transcript_prompt). The transcript prompt is only used by the non-interactive
    one-shot path (codex/opencode/hermes); interactive claude resumes via `--resume` instead, so its
    context comes from claude's own on-disk session, not this concatenation.
    """
    sid = req.session_id or sessions.create(agent)
    s = sessions.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    history = s["transcript"][-6:]
    context = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    prompt = f"{context}\n\nuser: {req.message}" if context else req.message
    return sid, s, prompt


@router.get("", dependencies=[Depends(require_permission("agents.run"))])
async def list_agents():
    return {"agents": detect_all()}


@router.get("/{agent}/profile", dependencies=[Depends(require_permission("agents.run"))])
async def get_profile(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return profile(agent)


@router.get("/{agent}/commands", dependencies=[Depends(require_permission("agents.run"))])
async def get_commands(agent: str):
    """Installed skills/plugins (Claude) surfaced as slash commands — no per-skill UI code."""
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"skills": discover_skills(agent)}


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


@router.get("/{agent}/sessions/{sid}", dependencies=[Depends(require_permission("agents.run"))])
async def get_session(agent: str, sid: str):
    """Return a session's transcript so the UI can restore a resumed chat."""
    s = sessions.get(sid)
    if not s or s.get("agent") != agent:
        raise HTTPException(404, "Session not found")
    return {"session_id": sid, "transcript": s.get("transcript", [])}


@router.post("/{agent}/sessions/{sid}/compact", dependencies=[Depends(require_permission("agents.run"))])
async def compact_session(agent: str, sid: str):
    """Reset a session's context: clear the transcript + claude session id (next run starts fresh).

    ponytail: the old claude session lingers on disk as an orphan — acceptable; claude has no CLI
    to delete a session by id.
    """
    s = sessions.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    s["transcript"] = []
    sessions.set_claude_session(sid, None)
    return {"ok": True}


@router.get("/{agent}/runs", dependencies=[Depends(require_permission("agents.run"))])
async def list_runs(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"runs": sessions.list_runs(agent)}


@router.get("/{agent}/usage", dependencies=[Depends(require_permission("agents.run"))])
async def agent_usage(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    runs = sessions.list_runs(agent)
    session_history = [
        {"sid": s["sid"], "created_at": s.get("created_at"),
         "run_count": len((sessions.get(s["sid"]) or {}).get("runs", []))}
        for s in sessions.list(agent)
    ]
    session_history.sort(key=lambda s: s.get("created_at") or "", reverse=True)
    return {
        "run_count": len(runs),
        "last_run_at": runs[0].get("started_at") if runs else None,
        "total_input_tokens": sum(r.get("input_tokens") or 0 for r in runs),
        "total_output_tokens": sum(r.get("output_tokens") or 0 for r in runs),
        "total_cost_usd": round(sum(r.get("cost_usd") or 0 for r in runs), 6),
        "context_window": runs[0].get("context_window") if runs else None,
        "session_count": len(session_history),
        "sessions": session_history[:10],
    }


@router.get("/{agent}/files", dependencies=[Depends(require_permission("agents.run"))])
async def get_agent_files(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"dir": str(af.config_dir(agent)), "files": af.agent_files(agent)}


@router.put("/{agent}/files/{name}", dependencies=[Depends(require_permission("agents.run"))])
async def put_agent_file(agent: str, name: str, body: dict):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    try:
        path = af.save(agent, name, body.get("content", ""))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, "path": path}


@router.post("/{agent}/chat", dependencies=[Depends(require_permission("agents.run"))])
async def chat(agent: str, req: ChatRequest):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    msg = req.message.strip()
    if not msg:
        raise HTTPException(400, "Message is required")
    sid, s, prompt = _resolve_session(agent, req)

    try:
        raw = await run_collect(agent, prompt, s["cwd"])
    except Exception as exc:
        raise HTTPException(500, f"Agent run failed: {exc}")

    blocks = parse(agent, raw)
    sessions.append(sid, "user", msg)
    if blocks:
        sessions.append(sid, "assistant", blocks[-1].get("content", ""))
    return {"session_id": sid, "blocks": blocks}


@router.post("/{agent}/chat/stream", dependencies=[Depends(require_permission("agents.run"))])
async def chat_stream(agent: str, req: ChatRequest):
    """SSE streaming chat. Yields status/output/run/complete frames as `data: {json}\\n\\n`."""
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    msg = req.message.strip()
    if not msg:
        raise HTTPException(400, "Message is required")
    sid, s, prompt = _resolve_session(agent, req)
    sessions.start_run(sid)

    async def _sse(payload: dict):
        return f"data: {json.dumps(payload)}\n\n"

    async def event_stream():
        if is_interactive(agent):
            # Fresh stream-json session per turn (claude), resumed via `--resume <id>` so the
            # conversation carries context across turns AND across server restarts (zeto-style:
            # claude owns its transcript on disk). No persistent process to keep alive or answer.
            if req.model:
                s["model"] = req.model
            if req.skill:
                s["system_prompt"] = req.skill
            live = InteractiveSession(s["cwd"], agent=agent,
                                      model=s.get("model") or "", system_prompt=s.get("system_prompt") or "",
                                      resume_id=s.get("claude_session_id") or "")
            await live.start()
            try:
                # Connected-agent manifest the running agent auto-reads (claude → CLAUDE.md).
                try:
                    (Path(s["cwd"]) / context_file(agent)).write_text(
                        af.connected_manifest(agent), encoding="utf-8")
                except OSError:
                    pass
                sessions.start_run(sid)
                await live.send_message(msg)
                yield await _sse({"type": "status", "data": {"status": "running", "session_id": sid}})
                async for ev in live.events():
                    if ev["type"] == "output":
                        sessions.append_output(sid, ev.get("content", ""))
                        yield await _sse({"type": "output", "content": ev["content"]})
                    elif ev["type"] == "prompt":
                        yield await _sse({"type": "prompt", "data": ev["data"]})
                    elif ev["type"] == "tool":
                        yield await _sse({"type": "tool", "data": ev["data"]})
                    elif ev["type"] == "complete":
                        run_info = sessions.end_run(sid, 0, usage=ev.get("usage"),
                                                    cost_usd=ev.get("cost_usd"),
                                                    context_window=ev.get("context_window"))
                        sessions.append(sid, "user", msg)
                        if run_info and run_info.get("output"):
                            blocks = parse(agent, run_info["output"])
                            if blocks:
                                sessions.append(sid, "assistant", blocks[-1].get("content", ""))
                        yield await _sse({"type": "run", "data": run_info})
                        yield await _sse({"type": "complete"})
                        break
                # Persist claude's session id (captured from the system frame) so the next turn resumes.
                if live.session_id:
                    sessions.set_claude_session(sid, live.session_id)
            except Exception as exc:
                sessions.fail_run(sid)
                yield await _sse({"type": "error", "content": str(exc)})
            finally:
                await live.close()
            return

        # Non-interactive one-shot path.
        holder: dict = {}
        try:
            yield await _sse({"type": "status", "data": {"status": "running"}})
            async for line in run(agent, prompt, s["cwd"], holder):
                sessions.append_output(sid, line)
                yield await _sse({"type": "output", "content": line})
            rc = holder.get("returncode", 1)
            run_info = sessions.end_run(sid, rc)
            sessions.append(sid, "user", msg)
            if run_info and run_info.get("output"):
                blocks = parse(agent, run_info["output"])
                if blocks:
                    sessions.append(sid, "assistant", blocks[-1].get("content", ""))
            yield await _sse({"type": "run", "data": run_info})
            yield await _sse({"type": "complete"})
        except Exception as exc:
            sessions.fail_run(sid)
            yield await _sse({"type": "error", "content": str(exc)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
