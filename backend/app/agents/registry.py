"""Detect the host CLI agents (claude, codex, opencode, hermes)."""
import shutil
import subprocess

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
