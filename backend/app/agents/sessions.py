"""Per-agent chat sessions: cwd + transcript for multi-turn context."""
import os
import uuid
import shutil
from datetime import datetime, timezone

from app.core.config_manager import get_data_dir


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
            {"sid": sid, **{k: v for k, v in s.items() if k != "transcript"}}
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
        return True


sessions = AgentSessions()
