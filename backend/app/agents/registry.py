"""Detect the host CLI agents (claude, codex, opencode, hermes)."""
import json
import shutil
import subprocess
import sys
import time

# Per-agent: how to run non-interactively + how to get the version.
#
# `install` is shown to the user and run verbatim, so every entry here is a package/URL that was
# actually resolved. `npm install -g hermes` is NOT the Hermes Agent — that name belongs to an
# unrelated JS message bus (segmentio/hermes), which would put a wrong `hermes` on PATH and then
# report as installed. Hermes is NousResearch's, distributed by its own installer.
#
# `model_flag`/`skill_flag` are present only where the CLI documents them. An agent without the
# flag rejects those request fields (routes/agents.py) instead of silently dropping them.
AGENTS = {
    "claude": {
        "cmd": "claude", "version_flag": ["--version"], "run": ["claude", "-p"],
        "install": "npm install -g @anthropic-ai/claude-code",
        "model_flag": "--model", "skill_flag": "--append-system-prompt",
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
        "cmd": "hermes", "version_flag": ["--version"], "run": ["hermes", "-z"],
        "install": (
            "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent"
            "/main/scripts/install.sh | bash"
        ),
    },
}


# detect() spawns a `--version` subprocess per call; throttle it so re-opens of the agent
# list / Manage tab don't re-spawn subprocesses every time. 24h TTL. (ponytail: naive dict cache,
# fine for the handful of agents here.)
_DETECT_TTL = 86400  # 24h
_detect_cache: dict[str, tuple[float, dict]] = {}


def detect(name: str, refresh: bool = False) -> dict:
    """Return install/version/status info for one agent (24h TTL cache; pass refresh=True to bypass)."""
    now = time.time()
    cached = _detect_cache.get(name)
    if not refresh and cached and now - cached[0] < _DETECT_TTL:
        return cached[1]
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
    status = "ok" if path and version else "degraded" if path else "missing"
    info = {"id": name, "installed": bool(path), "version": version, "path": path, "status": status}
    _detect_cache[name] = (now, info)
    return info


def detect_all(refresh: bool = False) -> list:
    return [detect(n, refresh=refresh) for n in AGENTS]


def forget(name: str) -> None:
    """Drop a cached detection so the next detect() re-probes. Called after an install launches,
    otherwise the 24h TTL means the UI keeps reporting 'missing' for a day."""
    _detect_cache.pop(name, None)


def launch_install_terminal(name: str) -> dict:
    """Open the host terminal with the trusted registry install command.

    Raises RuntimeError when no terminal can be opened — including on a headless/Docker backend,
    where the answer is the copyable command rather than a launch. The route maps that to 409.
    """
    command = AGENTS[name]["install"]
    try:
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
                raise RuntimeError("No host terminal available — copy the command and run it yourself")
            subprocess.Popen([terminal, "-e", "bash", "-lc", f"{command}; echo; read -r -p 'Press Enter to close...' "])
    except OSError as exc:
        raise RuntimeError(f"Could not open a host terminal: {exc}") from exc
    return {"launched": True, "agent": name, "command": command}


def profile(name: str) -> dict:
    """Merge detect() with the registry's run/install commands.

    Read-only: the skill.md/memory.md bodies used to be resolved here too, which duplicated
    agent_files.agent_files() and created the files as a side effect of a GET. The files route
    owns them; this returns only what it is actually read for (install_cmd).
    """
    cfg = AGENTS[name]
    info = detect(name)
    return {
        "config": {
            "id": info["id"], "installed": info["installed"],
            "version": info["version"], "path": info["path"],
            "run": cfg["run"], "install": cfg["install"],
        },
        "install_cmd": cfg["install"],
        "accepts_model": bool(cfg.get("model_flag")),
        "accepts_skill": bool(cfg.get("skill_flag")),
    }
