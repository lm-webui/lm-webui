"""OpenCode CLI — non-interactive one-shot (`opencode run`)."""
from .base import AgentDef



AGENT = AgentDef(
    name="opencode",
    cmd="opencode",
    run=("opencode", "run"),
    install='npm install -g --prefix "{prefix}" opencode-ai',
    config_dir="~/.config/opencode",
    config_name="opencode.jsonc",
)
