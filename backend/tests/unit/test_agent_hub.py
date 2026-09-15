"""Agent Hub — the four behaviours that were silently broken.

Each test here corresponds to a bug that produced no error at all: output that never parsed,
config files created by a read, invalid config written to disk, and a run that never ended.
"""
import asyncio

import pytest

from app.agents import agent_files as af
from app.agents.parser import parse


def test_parse_reads_jsonl(tmp_path):
    """Agents emit one JSON object per line, not one JSON document.

    Parsing the whole blob as a single document always failed, so every agent silently fell
    through to "return the raw text" and the per-agent adapters were unreachable.
    """
    raw = "\n".join([
        '{"type":"system","session_id":"abc"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"first"}]}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"second"}]}}',
    ])
    blocks = parse("claude", raw)
    assert [b["content"] for b in blocks] == ["first", "second"]


def test_parse_falls_back_to_plain_text():
    """Output that is not JSON at all is still readable."""
    assert parse("codex", "boom: not json") == [{"type": "text", "content": "boom: not json"}]
    assert parse("codex", "   ") == []


def test_resolving_files_creates_nothing(tmp_path, monkeypatch):
    """A GET must not write the CLI's real config into the user's home."""
    monkeypatch.setattr(af, "app_dir", lambda agent: tmp_path / "app" / agent)
    monkeypatch.setattr(af, "config_path", lambda agent: tmp_path / "home" / f"{agent}.json")

    files = af.agent_files("claude")
    assert [f["name"] for f in files] == ["config", "skill.md", "memory.md"]
    assert all(f["exists"] is False and f["content"] == "" for f in files)
    assert not tmp_path.exists() or not any(tmp_path.rglob("*")), "read created files"


def test_save_rejects_invalid_json(tmp_path, monkeypatch):
    """A broken config is refused rather than written over the real one."""
    target = tmp_path / ".claude" / "settings.json"
    monkeypatch.setattr(af, "config_path", lambda agent: target)
    monkeypatch.setattr(af, "app_dir", lambda agent: tmp_path / "app" / agent)

    with pytest.raises(ValueError):
        af.save("claude", "config", '{"permissions": ,}')

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('{"permissions": {"defaultMode": "default"}}', encoding="utf-8")
    af.save("claude", "config", '{"permissions": {"defaultMode": "acceptEdits"}}')
    assert "acceptEdits" in target.read_text(encoding="utf-8")
    # The backup holds the previous *valid* content.
    assert "defaultMode" in target.with_suffix(".json.bak").read_text(encoding="utf-8")


def test_save_refuses_oversized_content(tmp_path, monkeypatch):
    monkeypatch.setattr(af, "app_dir", lambda agent: tmp_path / "app" / agent)
    monkeypatch.setattr(af, "config_path", lambda agent: tmp_path / "config.json")
    monkeypatch.setattr(af, "MAX_FILE_BYTES", 10)
    with pytest.raises(ValueError):
        af.save("claude", "memory.md", "x" * 11)


def test_events_terminate_when_process_dies_without_result(monkeypatch):
    """The stream must end even when the CLI exits mid-turn.

    `_read` used to return silently on EOF, leaving `events()` blocked on an empty queue
    forever: the SSE response never closed and the run stayed marked `running`.
    """
    from app.agents.runner import InteractiveSession

    async def scenario():
        session = InteractiveSession("/tmp", agent="claude")

        class DeadStdout:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration  # stdout already closed, no `result` frame

        class DeadProc:
            stdout = DeadStdout()
            returncode = 1

            async def wait(self):
                return 1

        session._proc = DeadProc()
        await session._read()

        events = [ev async for ev in session.events()]
        assert events, "process died without emitting any event"
        assert events[-1]["type"] == "error"

    asyncio.run(scenario())
