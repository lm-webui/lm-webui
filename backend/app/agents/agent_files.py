"""Per-agent config/skill/memory resolver + safe editor.

Each host CLI keeps its real config in the user's home, in a different place/format. This module
resolves, per agent, the "config" file (the real one in the home dir) plus the app-managed
skill.md / memory.md (kept in the app agent workspace). `save()` backs up a real config file before
overwriting it, so a bad edit is undoable.
"""
import shutil
from pathlib import Path

from app.core.config_manager import get_data_dir

# Real config file per agent, under the user's home.
_CONFIG_FILES = {
    "claude": ("~/.claude", "settings.json"),
    "codex": ("~/.codex", "config.toml"),
    "opencode": ("~/.config/opencode", "opencode.jsonc"),
    "hermes": ("~/.hermes", "config.json"),
}


def config_dir(agent: str) -> Path:
    rel, _ = _CONFIG_FILES.get(agent, ("~/.config", "config.json"))
    return Path(rel).expanduser()


def agent_files(agent: str) -> list[dict]:
    """Resolve the config/skill/memory triplet for an agent."""
    home_dir = config_dir(agent)
    app_dir = get_data_dir() / "agents" / agent

    config_path = home_dir / _CONFIG_FILES.get(agent, ("~/.config", "config.json"))[1]
    skill_path = app_dir / "skill.md"
    memory_path = app_dir / "memory.md"

    files = [
        {"name": "config", "label": "Config", "path": str(config_path), "kind": "config"},
        {"name": "skill.md", "label": "Skill", "path": str(skill_path), "kind": "app"},
        {"name": "memory.md", "label": "Memory", "path": str(memory_path), "kind": "app"},
    ]
    for f in files:
        p = Path(f["path"])
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_text("", encoding="utf-8")
        f["content"] = read(p)
    return files


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def save(agent: str, name: str, content: str) -> str:
    """Write content to the named file (config|skill.md|memory.md), returning its path."""
    files = {f["name"]: f for f in agent_files(agent)}
    if name not in files:
        raise ValueError(f"Unknown file: {name}")
    info = files[name]
    p = Path(info["path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    if info["kind"] == "config" and p.exists():
        try:
            shutil.copyfile(p, p.with_suffix(p.suffix + ".bak"))
        except OSError:
            pass
    p.write_text(content or "", encoding="utf-8")
    return str(p)


def connected_manifest(agent: str) -> str:
    """Markdown manifest for the running agent listing the OTHER agents' files."""
    lines = ["## Connected agents", "You can coordinate with these host agents. Read their "
             "config/skill/memory when relevant:"]
    for other in ("claude", "codex", "opencode", "hermes"):
        if other == agent:
            continue
        files = {f["name"]: f for f in agent_files(other)}
        lines.append(
            f"- **{other}**: config `{files['config']['path']}` · "
            f"skill `{files['skill.md']['path']}` · memory `{files['memory.md']['path']}`"
        )
    return "\n".join(lines)
