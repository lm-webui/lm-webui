"""Hermes CLI — non-interactive one-shot (`hermes -z`)."""
from .base import AgentDef



# `npm install -g hermes` is NOT the Hermes Agent — that name belongs to an unrelated JS message
# bus (segmentio/hermes), which would put a wrong `hermes` on PATH and then report as installed.
# Hermes is NousResearch's, distributed by its own installer.
#
# That installer takes no prefix and cannot be redirected, so the trailing ln runs after it in the
# host terminal — where the login shell can see where the binary landed — and links it into the
# canonical dir. Not load-bearing: the login-shell PATH fallback in registry.ensure_agent_path()
# finds it wherever it went.
AGENT = AgentDef(
    name="hermes",
    cmd="hermes",
    run=("hermes", "-z"),
    install=(
        "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent"
        "/main/scripts/install.sh | bash; "
        'h=$(command -v hermes) && ln -sf "$h" "{prefix}/bin/hermes" || true'
    ),
    config_dir="~/.hermes",
    config_name="config.yaml",
)
