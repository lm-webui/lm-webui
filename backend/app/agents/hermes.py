"""Hermes CLI — non-interactive one-shot and native resume support."""
import re
from .base import AgentDef

_SESSION = re.compile(r"\b\d{8}_\d{6}_[0-9a-f]{6,8}\b", re.I)

def resume(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("hermes", "--resume", session_id)

def resume_run(cwd: str, session_id: str) -> tuple[str, ...]:
    return ("hermes", "chat", "--resume", session_id, "-q")

def extract_session_id(output: str) -> str | None:
    match = _SESSION.search(output or "")
    return match.group(0) if match else None



# `npm install -g hermes` is NOT the Hermes Agent — that name belongs to an unrelated JS message
# bus (segmentio/hermes), which would put a wrong `hermes` on PATH and then report as installed.
# Hermes is NousResearch's, distributed by its own installer.
#
# That installer takes no prefix and cannot be redirected. The login-shell PATH fallback in
# registry.ensure_agent_path() finds the binary wherever the installer puts it.
AGENT = AgentDef(
    name="hermes",
    cmd="hermes",
    run=("hermes", "-z"),
    install=(
        "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent"
        "/main/scripts/install.sh | bash"
    ),
    config_dir="~/.hermes",
    config_name="config.yaml",
    resume=resume,
    resume_run=resume_run,
    extract_session_id=extract_session_id,
)
