"""Agent Hub routes — chat wrapper around host CLI agents (admin-only)."""
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.security.auth.dependencies import require_permission
from app.security.auth.core import verify_token
from app.agents.registry import (
    AGENTS, detect, detect_all, forget, install_cmd, profile, launch_install_terminal,
)
from app.agents.runner import run, InteractiveSession
from app.agents.terminal import TerminalRegistry
from app.agents import agent_files as af
from app.agents.registry import is_interactive, context_file
from app.agents.parser import parse
from app.agents.sessions import sessions

router = APIRouter(prefix="/api/agents", tags=["agents"])

logger = logging.getLogger(__name__)

# Live print-mode process per *session*, so approval requests reach the exact process that
# emitted them. Keyed by agent it was not: two sessions for one agent clobbered each other and
# /answer approved a tool call in the other tab's run.
_live_sessions: dict[str, InteractiveSession] = {}

# PTY-backed interactive sessions, owned per (agent, session_id) so concurrent sessions can't
# cross-route input/approvals (the per-agent global map above was the bug).
terminals = TerminalRegistry()

# Native interactive command per agent (bare `cmd` drops into the CLI's TUI).
TERMINAL_CMD = {name: [cfg.cmd] for name, cfg in AGENTS.items()}


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    model: Optional[str] = None  # claude --model (applies to the next session spawn)
    skill: Optional[str] = None  # skill id → appended system prompt


def _resolve_session(agent: str, req: ChatRequest, owner_id: int):
    """Get-or-create the session.

    Returns (sid, s, transcript_prompt). The transcript prompt is only used by the non-interactive
    one-shot path (codex/opencode/hermes); interactive claude resumes via `--resume` instead, so its
    context comes from claude's own on-disk session, not this concatenation.
    """
    sid = req.session_id or sessions.create(agent, owner_id=owner_id)
    s = sessions.get(sid)
    if not s or s.get("agent") != agent or s.get("owner_id") != owner_id:
        raise HTTPException(404, "Session not found")
    history = s["transcript"][-6:]
    context = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    prompt = f"{context}\n\nuser: {req.message}" if context else req.message
    return sid, s, prompt


@router.get("", dependencies=[Depends(require_permission("agents.use"))])
async def list_agents(refresh: bool = False):
    """Installed CLI agents on the backend's own machine.

    Deliberately *not* host-bridged: the host bridge covers runtimes only (it has no install,
    file, chat or terminal routes), so listing host agents here would show install state that
    every other route in this file cannot act on. Pass `?refresh=true` to bypass the 24h
    detect cache (the UI does this after an install).
    """
    return {"agents": detect_all(refresh=refresh)}


@router.get("/{agent}/profile", dependencies=[Depends(require_permission("agents.use"))])
async def get_profile(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return profile(agent)


@router.post("/{agent}/install", dependencies=[Depends(require_permission("agents.install"))])
async def install_agent(agent: str, update: bool = False,
                        current_user: dict = Depends(require_permission("agents.install"))):
    """Run the trusted per-agent install command in an Agent Hub terminal tab.

    update=True relaunches the install command even when already installed (npm install -g always
    fetches the latest, so the install command *is* the update command).

    The install runs in one of our own ptys rather than a host GUI terminal, so its output streams
    to the browser and survives a reload. The host terminal stays as the fallback for when the pty
    cannot be started at all.
    """
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    if not update and detect(agent)["installed"]:
        return {"launched": False, "installed": True, "agent": agent}

    command = install_cmd(agent)
    sid = sessions.create(agent, owner_id=current_user["id"], install=True,
                          terminal_cmd=["bash", "-lc", command])
    try:
        # `bash -lc` so the installers inherit a login PATH — they shell out to npm/curl.
        # get_or_create keeps the process alive across WebSocket disconnects, so closing the tab
        # mid-install does not abort it; reconnecting replays the backlog.
        await terminals.get_or_create(agent, sid, ["bash", "-lc", command], sessions.get(sid)["cwd"])
    except Exception as exc:
        logger.warning("In-terminal install failed for %s (%s); falling back to host terminal", agent, exc)
        sessions.delete(sid)
        try:
            result = launch_install_terminal(agent)
        except RuntimeError as host_exc:
            # No host terminal either (headless / Docker). The UI offers the command to copy.
            raise HTTPException(409, str(host_exc))
        forget(agent)
        return {**result, "session_id": None}

    # The 24h detect cache would otherwise keep reporting 'missing' for the rest of the day.
    forget(agent)
    return {"launched": True, "installed": False, "agent": agent,
            "command": command, "session_id": sid}


@router.get("/{agent}/sessions", dependencies=[Depends(require_permission("agents.use"))])
async def list_sessions(agent: str, current_user: dict = Depends(require_permission("agents.use"))):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"sessions": sessions.list(agent, current_user["id"], current_user.get("role") == "admin")}


@router.post("/{agent}/sessions", dependencies=[Depends(require_permission("agents.use"))])
async def create_session(agent: str, current_user: dict = Depends(require_permission("agents.use"))):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"session_id": sessions.create(agent, owner_id=current_user["id"])}


@router.delete("/{agent}/sessions/{sid}", dependencies=[Depends(require_permission("agents.manage"))])
async def delete_session(agent: str, sid: str,
                         current_user: dict = Depends(require_permission("agents.manage"))):
    # Deleting the session is what reaps its PTY now that a disconnect only detaches.
    s = sessions.get(sid)
    if not s or s.get("agent") != agent or (s.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(404, "Session not found")
    await terminals.close(agent, sid)
    if not sessions.delete(sid):
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@router.get("/{agent}/sessions/{sid}", dependencies=[Depends(require_permission("agents.use"))])
async def get_session(agent: str, sid: str,
                      current_user: dict = Depends(require_permission("agents.use"))):
    """Return a session's transcript so the UI can restore a resumed chat."""
    s = sessions.get(sid)
    if not s or s.get("agent") != agent or (s.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(404, "Session not found")
    return {"session_id": sid, "transcript": s.get("transcript", [])}


@router.post("/{agent}/sessions/{sid}/compact", dependencies=[Depends(require_permission("agents.manage"))])
async def compact_session(agent: str, sid: str,
                          current_user: dict = Depends(require_permission("agents.manage"))):
    """Reset a session's context: clear the transcript + claude session id (next run starts fresh).

    ponytail: the old claude session lingers on disk as an orphan — acceptable; claude has no CLI
    to delete a session by id.
    """
    s = sessions.get(sid)
    if not s or s.get("agent") != agent or (s.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(404, "Session not found")
    s["transcript"] = []
    sessions.set_claude_session(sid, None)
    return {"ok": True}


@router.get("/{agent}/runs", dependencies=[Depends(require_permission("agents.use"))])
async def list_runs(agent: str, current_user: dict = Depends(require_permission("agents.use"))):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    admin = current_user.get("role") == "admin"
    return {"runs": sessions.list_runs(agent, current_user["id"], admin)}


@router.get("/{agent}/usage", dependencies=[Depends(require_permission("agents.use"))])
async def agent_usage(agent: str, current_user: dict = Depends(require_permission("agents.use"))):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    admin = current_user.get("role") == "admin"
    runs = sessions.list_runs(agent, current_user["id"], admin)
    session_history = [
        {"sid": s["sid"], "created_at": s.get("created_at"),
         "run_count": len((sessions.get(s["sid"]) or {}).get("runs", []))}
        for s in sessions.list(agent, current_user["id"], admin)
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


@router.get("/{agent}/files", dependencies=[Depends(require_permission("agents.use"))])
async def get_agent_files(agent: str):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    return {"dir": str(af.config_dir(agent)), "files": af.agent_files(agent)}


@router.put("/{agent}/files/{name}", dependencies=[Depends(require_permission("agents.manage"))])
async def put_agent_file(agent: str, name: str, body: dict):
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    try:
        path = af.save(agent, name, body.get("content", ""))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, "path": path}


def _reject_unsupported(agent: str, req: ChatRequest) -> None:
    """400 rather than silently ignoring a field the CLI cannot take.

    Only claude documents --model / --append-system-prompt (registry.AGENTS). The other three
    used to accept `model` and `skill` and drop them on the floor.
    """
    cfg = AGENTS[agent]
    if req.model and not cfg.model_flag:
        raise HTTPException(400, f"{agent} does not accept a model")
    if req.skill and not cfg.skill_flag:
        raise HTTPException(400, f"{agent} does not accept a skill")


@router.post("/{agent}/chat/stream", dependencies=[Depends(require_permission("agents.use"))])
async def chat_stream(agent: str, req: ChatRequest,
                      current_user: dict = Depends(require_permission("agents.use"))):
    """SSE streaming chat. Yields status/output/run/complete frames as `data: {json}\\n\\n`."""
    if agent not in AGENTS:
        raise HTTPException(404, "Unknown agent")
    msg = req.message.strip()
    if not msg:
        raise HTTPException(400, "Message is required")
    _reject_unsupported(agent, req)
    sid, s, prompt = _resolve_session(agent, req, current_user["id"])

    async def _sse(payload: dict):
        return f"data: {json.dumps(payload)}\n\n"

    def _finish(sid: str, msg: str, run_info: dict | None) -> None:
        """Record the turn's transcript. Shared by both paths."""
        sessions.append(sid, "user", msg)
        if run_info and run_info.get("output"):
            blocks = parse(agent, run_info["output"])
            if blocks:
                sessions.append(sid, "assistant", blocks[-1].get("content", ""))

    async def event_stream():
        if not detect(agent)["installed"]:
            command = install_cmd(agent)
            yield await _sse({"type": "status", "data": {"status": "not_installed"}})
            yield await _sse({
                "type": "error",
                "content": f"{agent} is not installed here. Run this where the backend runs:\n\n$ {command}",
            })
            yield await _sse({"type": "install", "data": {"agent": agent, "command": command}})
            yield await _sse({"type": "complete"})
            return

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
            try:
                await live.start()
                _live_sessions[sid] = live
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
                    elif ev["type"] == "tool_result":
                        yield await _sse({"type": "tool_result", "data": ev["data"]})
                    elif ev["type"] == "error":
                        # The CLI died without a result frame (runner._read always sends one).
                        run_info = sessions.end_run(sid, ev.get("exit_code", 1))
                        _finish(sid, msg, run_info)
                        yield await _sse({"type": "run", "data": run_info})
                        yield await _sse({"type": "error", "content": ev.get("content", "Agent failed")})
                        yield await _sse({"type": "complete"})
                        break
                    elif ev["type"] == "complete":
                        run_info = sessions.end_run(sid, 0, usage=ev.get("usage"),
                                                    cost_usd=ev.get("cost_usd"),
                                                    context_window=ev.get("context_window"))
                        _finish(sid, msg, run_info)
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
                if _live_sessions.get(sid) is live:
                    _live_sessions.pop(sid, None)
                await live.close()
            return

        # Non-interactive one-shot path.
        holder: dict = {}
        sessions.start_run(sid)
        try:
            yield await _sse({"type": "status", "data": {"status": "running", "session_id": sid}})
            async for line in run(agent, prompt, s["cwd"], holder):
                sessions.append_output(sid, line)
                yield await _sse({"type": "output", "content": line})
            rc = holder.get("returncode", 1)
            run_info = sessions.end_run(sid, rc)
            _finish(sid, msg, run_info)
            if rc != 0:
                yield await _sse({
                    "type": "error",
                    "content": f"{agent} exited with code {rc}.",
                })
            yield await _sse({"type": "run", "data": run_info})
            yield await _sse({"type": "complete"})
        except Exception as exc:
            yield await _sse({"type": "error", "content": str(exc)})
        finally:
            # Runs on client disconnect too — without it the run stays `running` forever.
            sessions.fail_run(sid)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{agent}/answer", dependencies=[Depends(require_permission("agents.use"))])
async def answer_agent(agent: str, body: dict):
    """Resolve a permission request from the live Claude stream.

    Keyed by session_id, not agent: with two sessions open on one agent the old per-agent map
    answered whichever process happened to be registered last.
    """
    live = _live_sessions.get(body.get("session_id") or "")
    prompt_id = body.get("prompt_id")
    if not live or not prompt_id:
        raise HTTPException(409, "No live agent permission request")
    await live.answer(prompt_id, bool(body.get("approve")))
    return {"ok": True}


@router.post("/{agent}/auto-approve", dependencies=[Depends(require_permission("agents.use"))])
async def auto_approve_agent(agent: str, body: dict):
    """Allow subsequent permission requests for the given live session."""
    live = _live_sessions.get(body.get("session_id") or "")
    if not live:
        raise HTTPException(409, "No live agent session")
    live.auto_approve()
    return {"ok": True}


@router.websocket("/{agent}/terminal/{sid}")
async def agent_terminal(ws: WebSocket, agent: str, sid: str, access_token: str = Cookie(None)):
    """Bidirectional raw terminal for one (agent, session): bytes in/out over WebSocket.

    Input from the browser is written straight into the pty; the agent's raw output (prompts,
    spinners, colors, sub-agents) streams back. One process per (agent, sid) — owned and scoped by
    session, so concurrent sessions never cross-route. This is the primary interactive surface;
    `/chat/stream` + `/answer` remain as the structured fallback.
    """
    # Admin-only, same gate as the HTTP routes (WebSocket can't take a Depends).
    try:
        payload = verify_token(access_token) if access_token else None
    except Exception:
        payload = None
    if not payload or not ({"agents.use", "agents.run"} & set(payload.get("permissions", []))):
        await ws.close(code=4403)
        return
    if agent not in AGENTS or agent not in TERMINAL_CMD:
        await ws.close(code=4404)
        return
    s = sessions.get(sid)
    if not s or s.get("agent") != agent:
        await ws.close(code=4404)
        return
    if s.get("owner_id") != payload["id"] and payload.get("role") != "admin":
        await ws.close(code=4403)
        return
    # An install session's terminal is running the install command precisely *because* the agent
    # is not installed yet, so the not-installed guard must not apply to it.
    detected = None if s.get("install") else detect(agent)
    if detected is not None and not detected["installed"]:
        await ws.close(code=4403, reason="agent not installed")
        return

    # Detection resolves the CLI using the service/login PATH. Reuse that absolute path for the
    # PTY: systemd/launchd often cannot resolve the user's globally installed CLI by bare name.
    cmd = s.get("terminal_cmd") or ([detected["path"]] if detected and detected.get("path") else TERMINAL_CMD[agent])
    if s.get("install") and terminals.get(agent, sid) is None:
        # Install jobs are not conversational sessions. Never replay a persisted install record
        # by rerunning its command after a backend restart.
        await ws.close(code=4409, reason="terminal job no longer available")
        return
    await ws.accept()
    try:
        ts = await terminals.get_or_create(agent, sid, cmd, s["cwd"])
    except Exception as exc:
        logger.exception("Could not start %s terminal", agent)
        await ws.send_json({"type": "terminal_error", "message": f"Could not start terminal: {exc}"})
        await ws.close(code=1011, reason="terminal start failed")
        return
    token, mode = ts.attach(payload["id"])
    await ws.send_json({"type": "attached", "mode": mode})
    try:
        await ws.send_bytes(ts.backlog())  # replay history to a reconnecting client
    except Exception:
        pass

    async def pump_out():
        async for data in ts.output():
            try:
                await ws.send_bytes(data)
            except Exception:
                return

    out_task = asyncio.create_task(pump_out())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            # Binary frames are raw pty input; text frames are control (turn, resize, heartbeat).
            if "bytes" in msg and isinstance(msg.get("bytes"), bytes):
                if ts.can_write(token):
                    ts.write(msg["bytes"])
                else:
                    await ws.send_json({"type": "input_rejected", "reason": "turn_required"})
            elif "text" in msg:
                try:
                    ctrl = json.loads(msg["text"])
                    if ctrl.get("type") == "request_turn":
                        granted = ts.request_turn(token, payload["id"], payload.get("role") == "admin")
                        await ws.send_json({"type": "turn_granted" if granted else "turn_denied"})
                    elif ctrl.get("type") == "release_turn":
                        await ws.send_json({"type": "turn_released", "ok": ts.release_turn(token)})
                    elif ctrl.get("type") == "heartbeat":
                        await ws.send_json({"type": "heartbeat", "ok": ts.heartbeat(token)})
                    elif ctrl.get("type") == "resize" and ts.can_write(token):
                        ts.resize(int(ctrl.get("cols") or 0), int(ctrl.get("rows") or 0))
                except (ValueError, TypeError):
                    pass
    finally:
        # Detach, do not kill: the CLI keeps running so a reconnect replays the backlog and
        # switching tabs/agents doesn't terminate an in-flight session. Reaped by
        # DELETE /{agent}/sessions/{sid}, or by the registry when the process exits on its own.
        out_task.cancel()
        try:
            await out_task
        except asyncio.CancelledError:
            pass
        ts.detach(token)
