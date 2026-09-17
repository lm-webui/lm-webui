"""Agent Hub registry — detect() status derivation, cache TTLs, and agent binary resolution."""
import time
from pathlib import Path

import pytest

from app.agents import registry
from app.agents.registry import (
    _detect_cache, detect, detect_all, ensure_agent_path, install_cmd, resolve,
)

# The autouse fixture stubs _login_shell_path so no test spawns a real shell. The tests that
# exercise it need the original object, captured before any fixture patched the module attribute.
_REAL_LOGIN_SHELL_PATH = registry._login_shell_path


@pytest.fixture(autouse=True)
def clear_cache(monkeypatch):
    """Reset the detect cache and the one-shot PATH bootstrap, and keep both hermetic.

    detect() now routes through resolve() → ensure_agent_path(), which would spawn the user's real
    login shell on first call and mutate os.environ["PATH"] for the whole test process. Both are
    neutralised here; the tests that exercise them re-patch deliberately.
    """
    _detect_cache.clear()
    registry._AGENT_PATH_READY = False
    monkeypatch.setenv("PATH", "/usr/bin:/bin")          # auto-restored after each test
    monkeypatch.setattr(registry, "bin_dir", lambda: Path("/nonexistent-lmwebui-bin"))
    monkeypatch.setattr(registry, "_login_shell_path", lambda: "")
    yield
    _detect_cache.clear()
    registry._AGENT_PATH_READY = False


def test_detect_status_missing(monkeypatch):
    """No binary on PATH → missing, not installed, no version."""
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: None)
    info = detect("claude")
    assert info["status"] == "missing"
    assert info["installed"] is False
    assert info["version"] is None


def test_detect_status_ok(monkeypatch):
    """Binary on PATH with a readable version → ok."""
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: "/usr/bin/claude")
    monkeypatch.setattr("app.agents.registry.subprocess.run", lambda *a, **k: type(
        "R", (), {"stdout": "1.0.0\n", "stderr": ""})())
    info = detect("claude")
    assert info["status"] == "ok"
    assert info["installed"] is True
    assert info["version"] == "1.0.0"


def test_detect_status_degraded(monkeypatch):
    """Binary on PATH but --version unreadable → degraded."""
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: "/usr/bin/claude")

    def boom(*a, **k):
        raise RuntimeError("no")
    monkeypatch.setattr("app.agents.registry.subprocess.run", boom)
    info = detect("claude")
    assert info["status"] == "degraded"
    assert info["installed"] is True
    assert info["version"] is None


def test_detect_cache_hits_within_ttl(monkeypatch):
    """Second call within TTL does not re-run the subprocess."""
    calls = {"n": 0}
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: "/usr/bin/claude")

    def fake_run(*a, **k):
        calls["n"] += 1
        return type("R", (), {"stdout": "1.0.0\n", "stderr": ""})()
    monkeypatch.setattr("app.agents.registry.subprocess.run", fake_run)

    detect("claude")
    assert calls["n"] == 1
    detect("claude")  # cache hit
    assert calls["n"] == 1


def test_detect_refresh_bypasses_cache(monkeypatch):
    """refresh=True re-runs even when cached."""
    calls = {"n": 0}
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: "/usr/bin/claude")

    def fake_run(*a, **k):
        calls["n"] += 1
        return type("R", (), {"stdout": "1.0.0\n", "stderr": ""})()
    monkeypatch.setattr("app.agents.registry.subprocess.run", fake_run)

    detect("claude")
    detect("claude", refresh=True)
    assert calls["n"] == 2


def test_detect_all_covers_all_agents(monkeypatch):
    """detect_all returns every registry agent with a status."""
    monkeypatch.setattr("app.agents.registry.shutil.which", lambda _: None)
    out = detect_all()
    assert {d["id"] for d in out} == set(("claude", "codex", "opencode", "hermes"))
    assert all("status" in d for d in out)


# ── Agent binary resolution (the "installed but shows not installed" fix) ──
#
# The service runs with a pinned PATH that omits ~/.local/bin, npm's global prefix and Homebrew,
# so a bare shutil.which in the backend reports a correctly-installed agent as missing.

def test_resolve_prefers_base_dir_bin(monkeypatch, tmp_path):
    """<base_dir>/bin wins — that is where the app's own install commands put binaries."""
    bindir = tmp_path / "bin"
    bindir.mkdir()
    exe = bindir / "claude"
    exe.write_text("#!/bin/sh\n")
    exe.chmod(0o755)
    monkeypatch.setattr(registry, "bin_dir", lambda: bindir)
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    assert resolve("claude") == str(exe)


def test_resolve_falls_through_to_path(monkeypatch, tmp_path):
    """Not in bin_dir → still found on PATH (the agent was installed the ordinary way)."""
    other = tmp_path / "other"
    other.mkdir()
    exe = other / "codex"
    exe.write_text("#!/bin/sh\n")
    exe.chmod(0o755)
    monkeypatch.setenv("PATH", str(other))
    assert resolve("codex") == str(exe)


def test_resolve_none_when_absent(monkeypatch):
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    assert resolve("hermes") is None


def test_ensure_agent_path_order_and_dedupe(monkeypatch, tmp_path):
    """bin_dir first, service PATH next, login-shell PATH last — appended, never prepended, so the
    login shell can only ADD entries and cannot shadow what the pinned service PATH resolves."""
    bindir = tmp_path / "bin"
    monkeypatch.setattr(registry, "bin_dir", lambda: bindir)
    monkeypatch.setattr(registry, "_login_shell_path",
                        lambda: f"/home/u/.local/bin:{tmp_path}{registry.os.pathsep}/usr/bin")
    monkeypatch.setenv("PATH", "/usr/bin:/bin")

    ensure_agent_path()
    parts = registry.os.environ["PATH"].split(registry.os.pathsep)
    assert parts[0] == str(bindir)                 # our dir first
    assert parts.index("/bin") < parts.index("/home/u/.local/bin")   # service PATH before login PATH
    assert len(parts) == len(set(parts))           # deduped — /usr/bin appears in both sources


def test_ensure_agent_path_is_idempotent(monkeypatch, tmp_path):
    monkeypatch.setattr(registry, "bin_dir", lambda: tmp_path / "bin")
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    ensure_agent_path()
    once = registry.os.environ["PATH"]
    ensure_agent_path()
    assert registry.os.environ["PATH"] == once


def test_login_shell_path_takes_last_path_shaped_line(monkeypatch):
    """A chatty rc (p10k, nvm, motd) prints before the PATH — take the last PATH-shaped line."""
    monkeypatch.setattr(registry, "_login_shell_path", _REAL_LOGIN_SHELL_PATH)
    monkeypatch.setenv("SHELL", "/bin/zsh")
    monkeypatch.setattr(registry.os.path, "exists", lambda _: True)
    monkeypatch.setattr(registry.subprocess, "run", lambda *a, **k: type(
        "R", (), {"stdout": "Welcome to zsh\nnow using node v20\n/usr/local/bin:/usr/bin\n"})())
    assert registry._login_shell_path() == "/usr/local/bin:/usr/bin"


def test_login_shell_path_rejects_non_posix_and_timeouts(monkeypatch):
    """fish prints a space-separated PATH; a hung rc must not raise."""
    monkeypatch.setattr(registry, "_login_shell_path", _REAL_LOGIN_SHELL_PATH)
    monkeypatch.setenv("SHELL", "/bin/zsh")
    monkeypatch.setattr(registry.os.path, "exists", lambda _: True)
    monkeypatch.setattr(registry.subprocess, "run", lambda *a, **k: type(
        "R", (), {"stdout": "/usr/bin /bin\n"})())
    assert registry._login_shell_path() == ""

    def hang(*a, **k):
        raise registry.subprocess.TimeoutExpired(cmd="zsh", timeout=3)
    monkeypatch.setattr(registry.subprocess, "run", hang)
    assert registry._login_shell_path() == ""


def test_missing_verdict_has_a_short_ttl(monkeypatch):
    """A `missing` verdict is a guess — it re-probes quickly so an in-flight install is seen.
    An `installed` verdict is stable and is cached for the full day."""
    now = {"t": 1000.0}
    monkeypatch.setattr(registry.time, "time", lambda: now["t"])
    calls = {"n": 0}

    def which(_):
        calls["n"] += 1
        return None
    monkeypatch.setattr(registry.shutil, "which", which)

    detect("claude")
    now["t"] += 60                      # past _MISSING_TTL (30s)
    detect("claude")
    assert calls["n"] == 2

    calls["n"] = 0
    monkeypatch.setattr(registry.shutil, "which", lambda _: "/usr/bin/claude")
    monkeypatch.setattr(registry.subprocess, "run", lambda *a, **k: type(
        "R", (), {"stdout": "1.0.0\n", "stderr": ""})())
    _detect_cache.clear()
    detect("codex")
    now["t"] += 3600                    # well within _DETECT_TTL (24h)
    detect("codex")
    assert calls["n"] == 0              # second call was a cache hit


def test_install_cmd_carries_the_resolved_prefix(monkeypatch, tmp_path):
    """The command the user sees must target the canonical bin dir, not npm's own global prefix —
    and must have no unresolved placeholder left in it."""
    monkeypatch.setattr(registry, "bin_dir", lambda: tmp_path / "bin")
    monkeypatch.setattr("app.core.config_manager.get_config",
                        lambda: type("C", (), {"paths": type("P", (), {"base_dir": str(tmp_path)})()})())
    for name in ("claude", "codex", "opencode"):
        cmd = install_cmd(name)
        assert f'--prefix "{tmp_path}"' in cmd
    for name in ("claude", "codex", "opencode", "hermes"):
        assert "{" not in install_cmd(name)


# ── Activated environments must not leak into a service PATH ──────────────
#
# A login shell carries whatever the user activated in .zshrc. Those dirs hold python/pip/uvicorn
# and are session state, not tool install locations.

def _mkbin(root: Path, name: str, *markers: str) -> str:
    """Create <root>/<name>/bin plus any marker paths, and return the bin dir."""
    d = root / name
    (d / "bin").mkdir(parents=True)
    for m in markers:
        p = d / m
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch()
    return str(d / "bin")


def test_is_activated_env_markers(tmp_path):
    """Marker-based, so the behaviour is the same on any machine — and it never touches the
    directories a user legitimately installs tools into."""
    # Dropped.
    assert registry._is_activated_env(_mkbin(tmp_path, "venv", "pyvenv.cfg", "bin/activate"))
    assert registry._is_activated_env(_mkbin(tmp_path, "conda", "conda-meta/x"))
    assert registry._is_activated_env(_mkbin(tmp_path, "oldvenv", "bin/activate"))  # pre-PEP 405
    # Kept — these are how tools are legitimately installed.
    for name in ("pyenv", "asdf", "nix", "homebrew", "localbin", "nvm"):
        assert not registry._is_activated_env(_mkbin(tmp_path, name)), name


def test_is_activated_env_errs_toward_keeping(tmp_path):
    """An unrecognised layout stays on PATH: a wrong drop loses agent detection, a wrong keep only
    leaves the inert situation this filter exists to avoid."""
    assert not registry._is_activated_env(str(tmp_path / "does-not-exist"))


def test_ensure_agent_path_drops_activated_envs_only(monkeypatch, tmp_path):
    venv_bin = _mkbin(tmp_path, "proj/venv" if False else "venv", "pyvenv.cfg", "bin/activate")
    shims = tmp_path / "shims"
    shims.mkdir()
    monkeypatch.setattr(registry, "bin_dir", lambda: tmp_path / "ours")
    monkeypatch.setattr(registry, "_login_shell_path",
                        lambda: f"{venv_bin}{registry.os.pathsep}{shims}")
    monkeypatch.setenv("PATH", "/usr/bin:/bin")

    ensure_agent_path()
    parts = registry.os.environ["PATH"].split(registry.os.pathsep)
    assert str(shims) in parts          # legitimate dir kept
    assert venv_bin not in parts        # activated env dropped
    assert parts[0] == str(tmp_path / "ours")


def test_backend_never_spawns_a_bare_interpreter():
    """The universal guarantee behind the filter above.

    _is_activated_env cannot know every environment manager that will ever exist, so what actually
    stops a service from running someone's venv is that no backend code ever asks for a bare
    `python`/`uvicorn`/`pip`. Use sys.executable or an absolute path. See ensure_agent_path().
    """
    import re
    app_dir = Path(registry.__file__).resolve().parents[1]
    offenders = []
    for py in app_dir.rglob("*.py"):
        for lineno, line in enumerate(py.read_text(encoding="utf-8").splitlines(), 1):
            for tool in ("python", "python3", "pip", "pip3", "uvicorn"):
                if re.search(rf'\[\s*"{tool}"\s*[,\]]', line):
                    offenders.append(f"{py.relative_to(app_dir)}:{lineno}: {line.strip()[:70]}")
    assert not offenders, (
        "spawn interpreters absolutely (sys.executable or <base_dir>/.venv/bin/python), never by "
        "bare name — the service PATH can contain an activated environment:\n" + "\n".join(offenders)
    )
