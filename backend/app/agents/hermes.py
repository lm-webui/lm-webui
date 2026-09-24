"""Hermes CLI — non-interactive one-shot (`hermes -z`)."""
from .base import AgentDef



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
)
