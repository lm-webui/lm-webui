import os

from app.services import host_agent


def test_host_agent_disabled_without_both_settings(monkeypatch):
    monkeypatch.delenv("LMWEBUI_HOST_AGENT_URL", raising=False)
    monkeypatch.delenv("LMWEBUI_HOST_AGENT_TOKEN", raising=False)
    assert not host_agent.enabled()


def test_host_agent_enabled_with_url_and_token(monkeypatch):
    monkeypatch.setenv("LMWEBUI_HOST_AGENT_URL", "http://127.0.0.1:8765")
    monkeypatch.setenv("LMWEBUI_HOST_AGENT_TOKEN", "test-token")
    assert host_agent.enabled()
