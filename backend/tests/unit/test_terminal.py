"""PTY terminal session + per-session registry — regression test for the Bug-1 (approval
routing) fix: two concurrent sessions for the same agent must resolve to distinct PTYs."""
import asyncio

import pytest

from app.agents.terminal import TerminalRegistry, TerminalSession


async def _pump_output(ts: TerminalSession, n: float) -> list[bytes]:
    out: list[bytes] = []
    try:
        async for data in ts.output():
            out.append(data)
    except asyncio.CancelledError:
        pass
    return out


def test_backlog_bounded():
    """Ring buffer drops the oldest bytes past its cap — bounded memory per session."""
    ts = TerminalSession("claude", ["true"], "/tmp", backlog=3)
    for chunk in (b"a", b"b", b"c", b"d", b"e"):
        ts._backlog.append(chunk)
    assert ts.backlog() == b"cde"


@pytest.mark.asyncio
async def test_concurrent_sessions_are_distinct():
    """Bug-1 regression: two sessions for the same agent resolve to separate TerminalSessions."""
    reg = TerminalRegistry()
    a = await reg.get_or_create("claude", "sid-A", ["/bin/sleep", "30"], "/tmp")
    b = await reg.get_or_create("claude", "sid-B", ["/bin/sleep", "30"], "/tmp")
    try:
        assert a is not b, "distinct sessions must not share a PTY/process"
        # Same (agent, sid) is idempotent — the registry reuses the live session.
        assert await reg.get_or_create("claude", "sid-A", ["/bin/sleep", "30"], "/tmp") is a
        assert reg.get("claude", "sid-A") is a
        assert reg.get("claude", "sid-B") is b
    finally:
        await a.close()
        await b.close()
    reg.drop("claude", "sid-A")
    reg.drop("claude", "sid-B")


@pytest.mark.asyncio
async def test_terminal_echo_and_exit():
    """The pty actually pipes bytes: run `cat`, write input, read it back, then exit."""
    ts = TerminalSession("cat", ["/bin/cat"], "/tmp")
    await ts.start()
    out = asyncio.create_task(_pump_output(ts, 3.0))
    ts.write(b"hello\n")
    # cat echoes "hello" (from its own read) then we read it on the pty master.
    ts.write(b"\x04")  # Ctrl-D → EOF → cat exits
    chunks = await asyncio.wait_for(asyncio.gather(out), timeout=3.0)
    text = b"".join(chunks[0]).decode(errors="replace")
    assert "hello" in text
    # exit_code is set by the async _wait task — poll briefly for it.
    for _ in range(50):
        if ts.exit_code is not None:
            break
        await asyncio.sleep(0.05)
    assert ts.exit_code == 0
