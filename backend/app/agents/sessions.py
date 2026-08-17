"""Per-agent chat sessions: cwd + transcript for multi-turn context, plus run tracking.

Sessions run in a dedicated app-managed workspace `~/.lmwebui/agenthub/session/{agent}/{sid}` (so
agents don't hit root-folder trust/restriction issues) and are persisted to `index.json` there, so
runs + transcripts survive a restart and are enumerable per agent.
"""
from __future__ import annotations

import json
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
        self._load()

    def _session_root(self):
        return get_data_dir().parent / "agenthub" / "session"

    def _index_path(self):
        return self._session_root() / "index.json"

    def _workspace(self, agent: str) -> str:
        d = self._session_root() / agent
        d.mkdir(parents=True, exist_ok=True)
        return str(d)

    def _serializable(self) -> dict:
        # Drop the transient active_run (mid-flight run); everything else is plain JSON.
        return {sid: {k: v for k, v in s.items() if k != "active_run"}
                for sid, s in self._sessions.items()}

    def _persist(self) -> None:
        try:
            p = self._index_path()
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(self._serializable()), encoding="utf-8")
        except OSError:
            pass

    def _load(self) -> None:
        try:
            p = self._index_path()
            if p.exists():
                data = json.loads(p.read_text(encoding="utf-8"))
                self._sessions = {sid: {**s, "active_run": None} for sid, s in data.items()}
        except (OSError, ValueError):
            self._sessions = {}

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
            "claude_session_id": None,
        }
        self._persist()
        return sid

    def get(self, sid: str) -> dict | None:
        return self._sessions.get(sid)

    def append(self, sid: str, role: str, content: str) -> None:
        s = self._sessions.get(sid)
        if s:
            s["transcript"].append({"role": role, "content": content})
            self._persist()

    def set_claude_session(self, sid: str, claude_session_id: str | None) -> None:
        """Record the claude session id this lm-webui session maps to (for --resume)."""
        s = self._sessions.get(sid)
        if s:
            s["claude_session_id"] = claude_session_id
            self._persist()

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
        try:
            shutil.rmtree(s["cwd"])
        except Exception:
            pass
        self._persist()
        return True

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
        self._persist()
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
