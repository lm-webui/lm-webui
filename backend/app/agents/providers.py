"""Compatibility registry for per-agent adapters."""
from . import claude, codex, opencode, hermes

PROVIDERS = {
    "claude": {"interactive": True, "spawn": claude.spawn, "normalize": claude.normalize, "prepare_workspace": claude.prepare_workspace, "context_file": "CLAUDE.md"},
    "codex": {"interactive": False, "normalize": codex.normalize, "context_file": "AGENTS.md"},
    "opencode": {"interactive": False, "normalize": opencode.normalize, "context_file": "AGENTS.md"},
    "hermes": {"interactive": False, "normalize": hermes.normalize, "context_file": "AGENTS.md"},
}

def is_interactive(agent: str) -> bool:
    return bool(PROVIDERS.get(agent, {}).get("interactive"))

def context_file(agent: str) -> str:
    return PROVIDERS.get(agent, {}).get("context_file", "AGENTS.md")

def spawn_cmd(agent: str, cwd: str, model: str = "", skill: str = "", resume_id: str = "") -> list[str]:
    spawn = PROVIDERS.get(agent, {}).get("spawn")
    return spawn(cwd, model, skill, resume_id) if spawn else []

def normalize(agent: str, ev: dict):
    normalizer = PROVIDERS.get(agent, {}).get("normalize")
    return normalizer(ev) if normalizer else None

def prepare_workspace(agent: str, cwd: str) -> None:
    prepare = PROVIDERS.get(agent, {}).get("prepare_workspace")
    if prepare:
        prepare(cwd)
