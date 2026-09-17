"""Codex CLI — non-interactive one-shot (`codex exec --json`)."""
from .base import AgentDef



AGENT = AgentDef(
    name="codex",
    cmd="codex",
    run=("codex", "exec", "--json"),
    install='npm install -g --prefix "{prefix}" @openai/codex',
    config_dir="~/.codex",
    config_name="config.toml",
)
