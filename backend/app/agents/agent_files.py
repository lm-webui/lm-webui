"""Per-agent config/skill/memory resolver + safe editor.

Each host CLI keeps its real config in the user's home, in a different place/format. This module
resolves, per agent, the "config" file (the real one in the home dir) plus the app-managed
skill.md / memory.md (kept in the app agent workspace). `save()` backs up a real config file
before overwriting it, so a bad edit is undoable.

Resolving is **read-only**: it reports whether a file exists and never creates one. Creating the
CLI's real config as a side effect of a GET meant merely opening the Agent Hub wrote
`~/.claude/settings.json` (etc.) into the user's home for an agent that was never installed.
"""
import json
import shutil
from pathlib import Path

from app.core.config_manager import get_data_dir
from app.agents import registry

# Mirrors MAX_FILE_BYTES in web/src/features/agents/agentFileKinds.ts, which warns the user
# before they get here. This copy is the one that is enforced.
MAX_FILE_BYTES = 256_000


def config_dir(agent: str) -> Path:
    """The agent's real config directory, from its own module's definition."""
    a = registry.AGENTS.get(agent)
    return Path(a.config_dir if a else "~/.config").expanduser()


def config_path(agent: str) -> Path:
    """Absolute path of the agent's real config file.

    The config lives in the per-agent definition (claude.py, codex.py, …) rather than a table here,
    so adding an agent no longer means editing this module. Hermes' config is YAML: editable and
    backed up, but not validated — there is no YAML parser on this path (see `validate`).

    Deliberately a module-level function called through the module global by agent_files()/save(),
    not an inlined lookup — the tests monkeypatch it, and an inlined version would write into the
    real ~/.claude during a test run.
    """
    a = registry.AGENTS.get(agent)
    if not a:
        return Path("~/.config/config.json").expanduser()
    return Path(a.config_dir).expanduser() / a.config_name


def app_dir(agent: str) -> Path:
    return get_data_dir() / "agents" / agent


def agent_files(agent: str) -> list[dict]:
    """Resolve the config/skill/memory triplet for an agent. Creates nothing."""
    files = [
        {"name": "config", "label": "Config", "path": str(config_path(agent)), "kind": "config"},
        {"name": "skill.md", "label": "Skill", "path": str(app_dir(agent) / "skill.md"), "kind": "app"},
        {"name": "memory.md", "label": "Memory", "path": str(app_dir(agent) / "memory.md"), "kind": "app"},
    ]
    for f in files:
        p = Path(f["path"])
        f["exists"] = p.is_file()
        f["content"] = read(p) if f["exists"] else ""
    return files


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def validate(name: str, path: Path, content: str) -> None:
    """Reject content that would break the CLI. Raises ValueError (mapped to 400 by the route).

    Only `.json` is checked: `.jsonc`/`.toml`/`.yaml` have no parser here, so they are written as
    typed. (ponytail: add a real parser per format when a broken save actually bites.)
    """
    size = len(content.encode("utf-8"))
    if size > MAX_FILE_BYTES:
        raise ValueError(
            f"{name} is {size} bytes, over the {MAX_FILE_BYTES} byte limit"
        )
    if path.suffix == ".json" and content.strip():
        try:
            json.loads(content)
        except ValueError as exc:
            raise ValueError(f"{name} is not valid JSON: {exc}") from exc


def save(agent: str, name: str, content: str) -> str:
    """Write content to the named file (config|skill.md|memory.md), returning its path."""
    files = {f["name"]: f for f in agent_files(agent)}
    if name not in files:
        raise ValueError(f"Unknown file: {name}")
    info = files[name]
    p = Path(info["path"])
    validate(name, p, content or "")

    # Back up the previous version, but only a *valid* one — otherwise a broken edit would
    # overwrite the last known-good copy and there would be nothing left to restore from.
    if info["kind"] == "config" and p.is_file():
        try:
            validate(name, p, p.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass  # current file is already broken; keep the existing .bak
        else:
            try:
                shutil.copyfile(p, p.with_suffix(p.suffix + ".bak"))
            except OSError:
                pass

    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content or "", encoding="utf-8")
    return str(p)


def connected_manifest(agent: str) -> str:
    """Markdown manifest for the running agent listing the OTHER agents' files.

    Paths only — no reads, no writes. This runs on every chat turn.
    """
    lines = ["## Connected agents", "You can coordinate with these host agents. Read their "
             "config/skill/memory when relevant:"]
    # Iterate the registry rather than a copy of its keys — a second list here silently went stale
    # whenever an agent was added or removed.
    for other in registry.AGENTS:
        if other == agent:
            continue
        lines.append(
            f"- **{other}**: config `{config_path(other)}` · "
            f"skill `{app_dir(other) / 'skill.md'}` · "
            f"memory `{app_dir(other) / 'memory.md'}`"
        )
    return "\n".join(lines)
