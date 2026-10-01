"""OpenCode CLI — non-interactive one-shot and native resume support."""
import re
from .base import AgentDef

_SESSION = re.compile(r"\bses_[A-Za-z0-9_-]+\b")

def resume(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("opencode", "--session", session_id)

def resume_run(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("opencode", "run", "--session", session_id)

def extract_session_id(output: str) -> str | None:
    match = _SESSION.search(output or "")
    return match.group(0) if match else None



AGENT = AgentDef(
    name="opencode",
    cmd="opencode",
    run=("opencode", "run"),
    install="npm install -g opencode-ai",
    config_dir="~/.config/opencode",
    config_name="opencode.jsonc",
    resume=resume,
    resume_run=resume_run,
    extract_session_id=extract_session_id,
)
