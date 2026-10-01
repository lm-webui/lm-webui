"""Codex CLI — non-interactive one-shot and native resume support."""
import re
from .base import AgentDef

_SESSION = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.I)

def resume(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("codex", "resume", session_id)

def resume_run(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("codex", "exec", "resume", session_id)

def extract_session_id(output: str) -> str | None:
    match = _SESSION.search(output or "")
    return match.group(0) if match else None



AGENT = AgentDef(
    name="codex",
    cmd="codex",
    run=("codex", "exec", "--json"),
    install="npm install -g @openai/codex",
    config_dir="~/.codex",
    config_name="config.toml",
    resume=resume,
    resume_run=resume_run,
    extract_session_id=extract_session_id,
)
