"""Agent Hub registry — detect() status derivation + 24h TTL cache."""
import time

import pytest

from app.agents.registry import _detect_cache, detect, detect_all


@pytest.fixture(autouse=True)
def clear_cache():
    _detect_cache.clear()
    yield
    _detect_cache.clear()


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
