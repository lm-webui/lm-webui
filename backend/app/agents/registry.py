"""Detect the host CLI agents (claude, codex, opencode, hermes)."""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Each agent owns its complete definition in its own module (see base.AgentDef); this tuple is the
# registration list. Explicit rather than a package scan: adding an agent means a new module plus
# one line here, and a mistake is a loud ImportError instead of a silently absent agent.
from . import claude, codex, hermes, opencode
from .base import AgentDef

_AGENT_MODULES = (claude, codex, opencode, hermes)

AGENTS: dict[str, AgentDef] = {m.AGENT.name: m.AGENT for m in _AGENT_MODULES}


# ── Per-agent dispatch ────────────────────────────────────────────────────
# These five used to live in providers.py, which existed only to keep a second table in sync with
# AGENTS. They are tolerant of an unknown agent on purpose: runner.py relies on spawn_cmd returning
# [] to raise its own "No spawn command for agent" error, and a direct index would KeyError one line
# earlier and turn that guard into dead code.

def is_interactive(agent: str) -> bool:
    """True for a CLI driven by a stream-json session — picks the SSE path in routes/agents.py."""
    a = AGENTS.get(agent)
    return bool(a and a.interactive)


def context_file(agent: str) -> str:
    """Filename the connected-agents manifest is written to inside the run cwd."""
    a = AGENTS.get(agent)
    return a.context_file if a else "AGENTS.md"


def spawn_cmd(agent: str, cwd: str, model: str = "", skill: str = "",
              resume_id: str = "") -> list[str]:
    a = AGENTS.get(agent)
    return a.spawn(cwd, model, skill, resume_id) if a and a.spawn else []


def normalize(agent: str, ev: dict):
    a = AGENTS.get(agent)
    return a.normalize(ev) if a and a.normalize else None


def prepare_workspace(agent: str, cwd: str) -> None:
    a = AGENTS.get(agent)
    if a and a.prepare_workspace:
        a.prepare_workspace(cwd)


# detect() spawns a `--version` subprocess per call; throttle it so re-opens of the agent
# list / Manage tab don't re-spawn subprocesses every time. (ponytail: naive dict cache, fine for
# the handful of agents here.)
#
# Two TTLs, because the two verdicts are not equally trustworthy. "installed" is stable — nothing
# removes a binary on its own. "missing" is a guess with a short shelf life: the user may be
# running the installer right now, and the UI polls for the result.
_DETECT_TTL = 86400   # 24h — an installed agent stays installed
_MISSING_TTL = 30     # 30s — re-probe cheaply, an install may be in flight
_detect_cache: dict[str, tuple[float, dict]] = {}


# ── Where agent binaries live, and how the service finds them ─────────────
_LOGIN_PATH_TIMEOUT = 3   # seconds, once per process
_AGENT_PATH_READY = False


def bin_dir() -> Path:
    """Canonical agent-bin dir: <base_dir>/bin, i.e. ~/.lmwebui/bin.

    Already FIRST on both the systemd and launchd PATH (`install.sh`), and already where
    llama-server installs — so targeting it needs no service-unit change.
    """
    from app.core.config_manager import get_config
    return Path(get_config().paths.base_dir).expanduser() / "bin"


def _login_shell_path() -> str:
    """The user's interactive login PATH, or "" on any failure. Bounded, never raises."""
    if sys.platform == "win32":
        return ""
    shell = os.environ.get("SHELL") or shutil.which("bash") or ""
    if not shell or not os.path.exists(shell):
        return ""
    try:
        # -lic, not -lc: zsh sources .zshrc only for *interactive* shells, and .zshrc is where
        # most users put PATH. This is the same environment the GUI-terminal install ran in.
        r = subprocess.run([shell, "-lic", 'printf %s "$PATH"'], capture_output=True,
                           text=True, stdin=subprocess.DEVNULL, timeout=_LOGIN_PATH_TIMEOUT)
    except (OSError, subprocess.SubprocessError):
        return ""                     # no shell / hung / broken rc
    # Take the LAST PATH-shaped line: a chatty rc (p10k, nvm, motd) prints to stdout first.
    for line in reversed((r.stdout or "").splitlines()):
        line = line.strip()
        if line and " " not in line and "/" in line:
            return line
    return ""


# An "activated environment" is a bin dir a user's shell picked up by sourcing an activate
# script — a venv in .zshrc, a conda env, a project's .venv. Those dirs carry python/pip/uvicorn
# and are session state: they are not where a global CLI is installed, and inheriting them into a
# long-running service means a bare `python` or `uvicorn` can silently resolve to an unrelated
# project's virtualenv. They are dropped from the login-shell PATH for that reason.
#
# Keyed on spec'd/standard markers, never on path names, so the behaviour is the same on any
# machine:
#   • PEP 405 puts `pyvenv.cfg` at the environment ROOT — created by `python -m venv`, `uv venv`,
#     poetry, hatch, pdm, and everything else that follows the standard.
#   • conda/mamba put `conda-meta/` at the environment root.
#   • pre-PEP 405 `virtualenv` has no root marker, but ships `activate` INSIDE bin/.
# pyenv/asdf shims and package-manager dirs (nix, Homebrew, ~/.local/bin, nvm) carry none of these
# and are deliberately kept — they are how a user legitimately installs tools.
#
# Incomplete by nature: an environment manager inventing a new marker needs a new entry here.
# That is why the filter is defence in depth, not the guarantee — see ensure_agent_path().
_ENV_ROOT_MARKERS = ("pyvenv.cfg", "conda-meta")
_ENV_BIN_MARKERS = ("activate",)


def _is_activated_env(bin_dir: str) -> bool:
    """True when this PATH entry is an activated environment's bin dir, not a place tools live.

    Errs toward keeping: an unrecognised layout is left on PATH, because a wrong drop loses agent
    detection while a wrong keep is only the (inert) situation this filter exists to avoid.
    """
    d = Path(bin_dir)
    try:
        if any((d.parent / m).exists() for m in _ENV_ROOT_MARKERS):
            return True
        return any((d / m).exists() for m in _ENV_BIN_MARKERS)
    except OSError:
        return False


def ensure_agent_path() -> None:
    """Put bin_dir first, the service PATH next, the login-shell PATH last. Once per process.

    Appending is the point: the login shell may only ADD entries, never shadow a binary the pinned
    service PATH already resolves. Widening os.environ (rather than resolving paths at each call
    site) means shutil.which, every create_subprocess_exec and each CLI's own child lookups all
    inherit it.

    Activated-environment dirs are dropped from the login-shell contribution only — the service
    PATH is the operator's and is taken as given.

    THE INVARIANT THAT MAKES THIS SAFE: no backend code may invoke an interpreter by bare name.
    Use sys.executable, or an absolute path like <base_dir>/.venv/bin/python. The filter above
    cannot know every environment manager that will ever exist, so the thing that actually
    guarantees a service never runs someone's venv is that nothing ever asks for a bare `python`.
    test_agents.py::test_backend_never_spawns_a_bare_interpreter enforces this.

    ponytail: process-global, so it also affects the llama-server/runtime `shutil.which` checks
    outside the agent hub — those can only gain resolvable names, never lose one.
    """
    global _AGENT_PATH_READY
    if _AGENT_PATH_READY:
        return
    _AGENT_PATH_READY = True
    parts = [str(bin_dir())]
    parts += [p for p in os.environ.get("PATH", "").split(os.pathsep) if p]
    parts += [p for p in _login_shell_path().split(os.pathsep)
              if p and not _is_activated_env(p)]
    os.environ["PATH"] = os.pathsep.join(dict.fromkeys(parts))   # dedupe, first wins


def resolve(name: str) -> str | None:
    """Absolute path to an agent's CLI, or None. The lookup order falls out of ensure_agent_path()."""
    ensure_agent_path()
    return shutil.which(AGENTS[name].cmd)


def install_cmd(name: str) -> str:
    """The exact command shown to the user and run in the host terminal.

    Installers deliberately use their native user-level defaults. Detection adds the user's login
    PATH, so existing global installs are found without relocating them into ~/.lmwebui.
    """
    return AGENTS[name].install


def detect(name: str, refresh: bool = False) -> dict:
    """Return install/version/status info for one agent.

    Cached, with a shorter TTL for a `missing` verdict than an `installed` one — see _MISSING_TTL.
    Pass refresh=True to bypass the cache entirely.
    """
    now = time.time()
    cached = _detect_cache.get(name)
    if not refresh and cached:
        ttl = _DETECT_TTL if cached[1].get("installed") else _MISSING_TTL
        if now - cached[0] < ttl:
            return cached[1]
    cfg = AGENTS[name]
    path = resolve(name)
    version = None
    if path:
        try:
            # Probe the resolved absolute path, not the bare name: otherwise detection can
            # succeed via a path the spawn later cannot use.
            r = subprocess.run([path, *cfg.version_flag],
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
    command = install_cmd(name)
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
    command = install_cmd(name)
    return {
        "config": {
            "id": info["id"], "installed": info["installed"],
            "version": info["version"], "path": info["path"],
            "run": cfg.run, "install": command,
        },
        "install_cmd": command,
        "accepts_model": bool(cfg.model_flag),
        "accepts_skill": bool(cfg.skill_flag),
    }
