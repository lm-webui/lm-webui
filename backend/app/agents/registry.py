"""Detect the host CLI agents (claude, codex, opencode, hermes)."""
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from app.core.config_manager import get_data_dir

# Per-agent: how to run non-interactively + how to get the version.
# install is a best-effort hint shown in the UI, not a verified package name (ponytail).
AGENTS = {
    "claude": {
        "cmd": "claude", "version_flag": ["--version"], "run": ["claude", "-p"],
        "install": "npm install -g @anthropic-ai/claude-code",
    },
    "codex": {
        "cmd": "codex", "version_flag": ["--version"], "run": ["codex", "exec", "--json"],
        "install": "npm install -g @openai/codex",
    },
    "opencode": {
        "cmd": "opencode", "version_flag": ["--version"], "run": ["opencode", "run"],
        "install": "npm install -g opencode-ai",
    },
    "hermes": {
        "cmd": "hermes", "version_flag": ["--version"], "run": ["hermes", "run"],
        "install": "npm install -g hermes",
    },
}


def detect(name: str) -> dict:
    """Return install/version info for one agent."""
    cfg = AGENTS[name]
    path = shutil.which(cfg["cmd"])
    version = None
    if path:
        try:
            r = subprocess.run([cfg["cmd"], *cfg["version_flag"]],
                               capture_output=True, text=True, timeout=10)
            version = ((r.stdout or r.stderr).strip() or "").splitlines()[0] or None
        except Exception:
            version = None
    return {"id": name, "installed": bool(path), "version": version, "path": path}


def detect_all() -> list:
    return [detect(n) for n in AGENTS]


def launch_install_terminal(name: str) -> dict:
    """Open the host terminal with the trusted registry install command."""
    command = AGENTS[name]["install"]
    if sys.platform == "darwin":
        apple_script = (
            'tell application "Terminal" to do script '
            + json.dumps(f"{command}; echo; echo 'Installation finished. Close this window.'; exec $SHELL")
            + '\ntell application "Terminal" to activate'
        )
        subprocess.Popen(["osascript", "-e", apple_script])
    elif sys.platform == "win32":
        subprocess.Popen(["cmd", "/K", command], creationflags=subprocess.CREATE_NEW_CONSOLE)
    else:
        terminal = next((shutil.which(x) for x in (
            "x-terminal-emulator", "gnome-terminal", "konsole", "xterm"
        ) if shutil.which(x)), None)
        if not terminal:
            raise RuntimeError("No supported host terminal was found")
        subprocess.Popen([terminal, "-e", "bash", "-lc", f"{command}; echo; read -r -p 'Press Enter to close...' "])
    return {"launched": True, "agent": name, "command": command}


# ── Real CLI command surface (parsed from the installed CLI's --help) ─────────
# ponytail: naive TTL cache; fine unless many agents + rapid re-opens matter.
_HELP_TTL = 60
_help_cache: dict[str, tuple[float, list[dict]]] = {}

_SKIP_HEADERS = {"usage", "arguments", "options", "commands", "aliases", "description", "examples"}


def _parse_help(text: str) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        # Flag: "  --model <m>   Use model X" or "  -p, --print".
        fm = re.match(r"^\s+(-{1,2}[\w-]+)(?:[, ]+(-{1,2}[\w-]+))?", line)
        if fm:
            label = fm.group(1)
            if label not in seen:
                seen.add(label)
                items.append({"id": label, "label": label, "hint": stripped[:80]})
            continue
        # Bare subcommand: "  exec   Run codex non-interactively" (token is column-aligned, so
        # 2+ spaces after it; a wrapped description line has a single space and is skipped).
        sm = re.match(r"^\s{2,}([a-z][a-z0-9-]*)\s{2,}\S", line)
        if sm:
            label = sm.group(1)
            if label.lower() not in _SKIP_HEADERS and label not in seen:
                seen.add(label)
                items.append({"id": label, "label": label, "hint": stripped[:80]})
    return items[:60]


def cli_commands(name: str) -> list[dict]:
    """The real `--help`-derived command/flag list for an installed CLI agent."""
    now = time.time()
    cached = _help_cache.get(name)
    if cached and now - cached[0] < _HELP_TTL:
        return cached[1]
    items: list[dict] = []
    cmd = AGENTS.get(name, {}).get("cmd")
    if cmd and shutil.which(cmd):
        try:
            r = subprocess.run([cmd, "--help"], capture_output=True, text=True, timeout=10)
            items = _parse_help((r.stdout or "") + (r.stderr or ""))
        except Exception:
            items = []
    _help_cache[name] = (now, items)
    return items


def profile(name: str) -> dict:
    """Merge detect() with the registry run/install cmds, and ensure per-agent
    memory.md + skill.md exist under the agent workspace, returning their contents."""
    cfg = AGENTS[name]
    info = detect(name)
    d = get_data_dir() / "agents" / name
    d.mkdir(parents=True, exist_ok=True)

    def _read(filename: str) -> str:
        p = d / filename
        if not p.exists():
            p.write_text("", encoding="utf-8")
        return p.read_text(encoding="utf-8")

    return {
        "config": {
            "id": info["id"], "installed": info["installed"],
            "version": info["version"], "path": info["path"],
            "run": cfg["run"], "install": cfg["install"],
        },
        "memory": _read("memory.md"),
        "skill": _read("skill.md"),
        "install_cmd": cfg["install"],
    }


# ── Installed Claude skills/plugins ─────────────────────────────────────────
# Claude Code surfaces installed skills/plugins as "/<plugin>:<skill>" slash commands (and plain
# "/<skill>" for user-level skills under ~/.claude/skills). Discover them from the host so the
# Agent Hub's "/" menu reflects whatever the CLI has installed — no per-skill UI code needed.
def _skill_desc(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    if not text.startswith("---"):
        return ""
    parts = text.split("---", 2)
    if len(parts) < 3:
        return ""
    fm = parts[1]
    for i, line in enumerate(fm.splitlines()):
        if line.strip().startswith("description:"):
            d = line.split(":", 1)[1].strip().strip(">").strip()
            if not d:
                rest = fm.splitlines()[i + 1:]
                d = next((l.strip().strip(">").strip() for l in rest if l.strip()), "")
            return d[:80] or ""
    return ""


def _skill_cmd(skill_dir: Path, prefix: str = ""):
    f = skill_dir / "SKILL.md"
    if not f.exists():
        return None
    name = skill_dir.name
    label = f"/{prefix}:{name}" if prefix else f"/{name}"
    return {"id": label.lstrip("/"), "label": label, "hint": _skill_desc(f)}


def _claude_skills() -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    home = Path.home() / ".claude"
    # User-level skills: ~/.claude/skills/<name>/SKILL.md -> /<name>
    skills_root = home / "skills"
    if skills_root.is_dir():
        for d in sorted(skills_root.iterdir()):
            if d.is_dir():
                cmd = _skill_cmd(d)
                if cmd and cmd["id"] not in seen:
                    seen.add(cmd["id"]); out.append(cmd)
    # Installed plugins: installed_plugins.json -> installPath/skills/<name>/SKILL.md -> /<plugin>:<name>
    ip = home / "plugins" / "installed_plugins.json"
    if ip.exists():
        try:
            data = json.loads(ip.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        for key, entries in (data.get("plugins") or {}).items():
            plugin_id = key.split("@")[0] or key
            for e in entries or []:
                skills_dir = Path(e.get("installPath") or "") / "skills"
                if not skills_dir.is_dir():
                    continue
                for d in sorted(skills_dir.iterdir()):
                    if d.is_dir():
                        cmd = _skill_cmd(d, prefix=plugin_id)
                        if cmd and cmd["id"] not in seen:
                            seen.add(cmd["id"]); out.append(cmd)
    return out


def discover_skills(name: str) -> list[dict]:
    """Installed skills/plugins for an agent (currently claude; others have none)."""
    return _claude_skills() if name == "claude" else []
