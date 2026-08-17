"""Per-agent chat sessions: cwd + transcript for multi-turn context, plus run tracking."""
from __future__ import annotations

import asyncio
import os
import uuid
import shutil
from datetime import datetime, timezone

from app.core.config_manager import get_data_dir

# Bound the retained run history per session.
_MAX_RUNS = 20


class AgentSessions:
    def __init__(self):
        self._sessions: dict[str, dict] = {}

    def _workspace(self, agent: str) -> str:
        d = get_data_dir() / "agents" / agent
        d.mkdir(parents=True, exist_ok=True)
        return str(d)

    def create(self, agent: str) -> str:
        sid = uuid.uuid4().hex[:8]
        cwd = os.path.join(self._workspace(agent), sid)
        os.makedirs(cwd, exist_ok=True)
        self._sessions[sid] = {
            "agent": agent, "cwd": cwd,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "transcript": [],
            "runs": [],
            "active_run": None,
        }
        return sid

    def get(self, sid: str) -> dict | None:
        return self._sessions.get(sid)

    def append(self, sid: str, role: str, content: str) -> None:
        s = self._sessions.get(sid)
        if s:
            s["transcript"].append({"role": role, "content": content})

    def list(self, agent: str | None = None) -> list[dict]:
        return [
            {"sid": sid, **{k: v for k, v in s.items() if k not in ("transcript", "runs", "active_run")}}
            for sid, s in self._sessions.items()
            if agent is None or s["agent"] == agent
        ]

    def delete(self, sid: str) -> bool:
        s = self._sessions.pop(sid, None)
        if not s:
            return False
        live = s.get("live")
        if live is not None:
            try:
                asyncio.create_task(live.close())
            except Exception:
                pass
        try:
            shutil.rmtree(s["cwd"])
        except Exception:
            pass
        return True

    # ── Interactive (stream-json) live session ──────────────────────────────

    def set_live(self, sid: str, live) -> None:
        s = self._sessions.get(sid)
        if s:
            s["live"] = live

    def get_live(self, sid: str):
        s = self._sessions.get(sid)
        return s.get("live") if s else None

    def close_live(self, sid: str) -> None:
        s = self._sessions.get(sid)
        live = s.get("live") if s else None
        if live is not None:
            asyncio.create_task(live.close())
            s["live"] = None

    # ── Run tracking (activity timeline) ────────────────────────────────────

    def start_run(self, sid: str) -> dict | None:
        s = self._sessions.get(sid)
        if not s:
            return None
        run = {
            "run_id": uuid.uuid4().hex[:8],
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "ended_at": None,
            "exit_code": None,
            "tokens": 0,
            "output": "",
        }
        s["active_run"] = run
        return run

    def append_output(self, sid: str, text: str) -> None:
        s = self._sessions.get(sid)
        if s and s["active_run"]:
            s["active_run"]["output"] += text

    def end_run(self, sid: str, exit_code: int, usage: dict | None = None,
                cost_usd: float | None = None, context_window: int | None = None) -> dict | None:
        s = self._sessions.get(sid)
        if not s or not s["active_run"]:
            return None
        run = s["active_run"]
        run["exit_code"] = exit_code
        run["status"] = "done" if exit_code == 0 else "failed"
        run["ended_at"] = datetime.now(timezone.utc).isoformat()
        # Real agent-reported usage when available (interactive claude); else chars/4 estimate.
        if usage:
            run["input_tokens"] = usage.get("input_tokens", 0)
            run["output_tokens"] = usage.get("output_tokens", 0)
            run["tokens"] = run["input_tokens"] + run["output_tokens"]
        else:
            run["tokens"] = len(run["output"]) // 4
        run["cost_usd"] = cost_usd
        run["context_window"] = context_window
        s["runs"].append(run)
        s["runs"] = s["runs"][-_MAX_RUNS:]
        s["active_run"] = None
        return run

    def fail_run(self, sid: str) -> None:
        s = self._sessions.get(sid)
        if s and s["active_run"]:
            self.end_run(sid, 1)

    def list_runs(self, agent: str | None = None) -> list[dict]:
        """All completed runs across the agent's sessions, newest first."""
        runs: list[dict] = []
        for s in self._sessions.values():
            if agent is None or s["agent"] == agent:
                runs.extend(s["runs"])
        runs.sort(key=lambda r: r.get("started_at") or "", reverse=True)
        return runs


sessions = AgentSessions()
