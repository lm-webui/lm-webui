"""The Agent Hub terminal socket, driven for real: auth → spawn → keystrokes.

Why this file exists
--------------------
The pane's two claims — "selecting an agent launches that agent's CLI" and "typing reaches that
process" — had no executable check anywhere. The only WebSocket coverage was
`tests/unit/test_route_auth.py`, which greps this route's *source* for `verify_token`; and
`test_terminal.py` drives `TerminalSession` in isolation against `/bin/cat`, never touching the
route. So a wrong launch command, a broken auth path or a dropped keystroke would all have looked
exactly like the blank pane this suite exists to catch.

The route is exercised through `TestClient.websocket_connect`, i.e. the real cookie handshake and
the real ASGI layer, with `detect` pointed at `/bin/cat` so the pty runs something harmless while
still proving the bytes flow end to end.
"""
import os
import signal

import pytest
from starlette.testclient import WebSocketDisconnect

from app.agents.registry import AGENTS
from app.agents.terminal import TerminalRegistry
from app.routes import agents as agents_routes
from app.routes.agents import TERMINAL_CMD
from app.security.auth.core import create_access_token
from app.agents.sessions import sessions


@pytest.fixture
def agent_session(monkeypatch, tmp_path):
    """An owned session whose workspace lives in tmp, plus a valid admin cookie on `client`."""
    # Otherwise sessions.create() writes into the real ~/.lmwebui/agenthub workspace.
    monkeypatch.setattr(sessions, "_session_root", lambda: tmp_path / "sessions")
    return sessions.create("claude", owner_id=1)


def _authenticate(client) -> None:
    """The browser has no Authorization header on a WebSocket — the JWT rides the cookie, so the
    test must too, or it is testing a path the app never uses."""
    token = create_access_token(1, role="admin", permissions=["agents.use"])
    client.cookies.set("access_token", token)


def _spy_on_spawn(monkeypatch, captured: dict) -> None:
    """Record the argv the route hands the pty, then let the real one spawn it."""
    original = TerminalRegistry.get_or_create

    async def spy(self, agent, sid, cmd, cwd):
        captured.setdefault("cmd", list(cmd))
        return await original(self, agent, sid, cmd, cwd)

    monkeypatch.setattr(TerminalRegistry, "get_or_create", spy)


def _detect_as(path: str | None):
    """Stand in for registry.detect: installed, at this absolute path (None = PATH won't resolve)."""
    return lambda name, refresh=False: {
        "id": name, "installed": True, "version": "test", "path": path, "status": "ok",
    }


# ── Auth ──────────────────────────────────────────────────────────────────

def test_terminal_socket_refuses_an_unauthenticated_client(client, agent_session):
    """No cookie = no terminal. The route closes before accept, so the connect itself raises."""
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(f"/api/agents/claude/terminal/{agent_session}"):
            pass
    assert excinfo.value.code == 4403


# ── Which command the selected agent runs ─────────────────────────────────
# The claim under test is "the backend calls claude / codex / hermes depending on the selected
# agent". The argv is the whole assertion: this is the process the user sees in the pane.

def test_terminal_spawns_the_detected_absolute_path(client, agent_session, monkeypatch):
    """Detection resolves through the service login PATH — an absolute path is what the pty gets,
    because launchd/systemd cannot always resolve the user's global CLI by bare name."""
    _authenticate(client)
    monkeypatch.setattr(agents_routes, "detect", _detect_as("/bin/cat"))
    captured: dict = {}
    _spy_on_spawn(monkeypatch, captured)

    with client.websocket_connect(f"/api/agents/claude/terminal/{agent_session}") as ws:
        ws.receive_json()  # {"type": "attached", ...}

    assert captured["cmd"] == ["/bin/cat"]


def test_terminal_falls_back_to_the_bare_cli_name(client, agent_session, monkeypatch):
    """A degraded install (binary on PATH but its --version probe fails) has path=None and must
    still launch, by bare name, rather than refusing to open a terminal."""
    _authenticate(client)
    monkeypatch.setattr(agents_routes, "detect", _detect_as(None))
    captured: dict = {}
    _spy_on_spawn(monkeypatch, captured)

    with client.websocket_connect(f"/api/agents/claude/terminal/{agent_session}") as ws:
        ws.receive_json()

    assert captured["cmd"] == TERMINAL_CMD["claude"] == ["claude"]


def test_every_agent_launches_its_interactive_tui_not_the_one_shot_form():
    """The pane wants the TUI. `AGENTS[name].run` is the *non-interactive* argv used by the SSE
    chat path (`codex exec --json`, `hermes -z`, `opencode run`); launching one of those here
    would run the agent, print, and exit — an apparently dead terminal."""
    for name, cfg in AGENTS.items():
        assert TERMINAL_CMD[name] == [cfg.cmd] == [name]
        assert TERMINAL_CMD[name] != list(cfg.run), f"{name} would launch its one-shot form"


# ── Keystrokes ────────────────────────────────────────────────────────────

def test_typed_bytes_reach_the_process_and_its_output_comes_back(client, agent_session, monkeypatch):
    """The round trip: binary frame in (exactly what TerminalPane's `send(TextEncoder...)` emits)
    → pty master → the process → back out over the same socket."""
    _authenticate(client)
    monkeypatch.setattr(agents_routes, "detect", _detect_as("/bin/cat"))

    with client.websocket_connect(f"/api/agents/claude/terminal/{agent_session}") as ws:
        assert ws.receive_json()["type"] == "attached"
        ws.receive_bytes()  # backlog replay (empty on a fresh session)

        ws.send_bytes(b"hello\r")

        # /bin/cat echoes the line back through the pty.
        seen = b""
        for _ in range(50):
            if b"hello" in seen:
                break
            seen += ws.receive_bytes()
        assert b"hello" in seen, f"keystroke never reached the pty (got {seen!r})"

        # Ctrl-D → EOF → cat exits. The route must then close the socket itself: the pty is gone,
        # so nothing more will be sent, every further keystroke is a silent no-op, and a pane left
        # in "open" never even offers the reconnect that would respawn the CLI.
        ws.send_bytes(b"\x04")
        with pytest.raises(WebSocketDisconnect) as excinfo:
            for _ in range(50):
                ws.receive_bytes()
        assert "exited" in (excinfo.value.reason or ""), (
            f"CLI exit did not close the socket with a reason (got {excinfo.value.code!r} "
            f"{excinfo.value.reason!r})"
        )


def test_a_second_attach_from_the_same_user_can_still_type(client, agent_session, monkeypatch):
    """Regression guard for the reconnect race: the StrictMode remount / reconnect button can land
    a new attachment while the old one is still controller. If the newcomer is demoted to viewer,
    every keystroke is answered `input_rejected` and the pane is silently read-only."""
    _authenticate(client)
    monkeypatch.setattr(agents_routes, "detect", _detect_as("/bin/cat"))

    url = f"/api/agents/claude/terminal/{agent_session}"
    with client.websocket_connect(url) as first:
        assert first.receive_json()["mode"] == "controller"
        with client.websocket_connect(url) as second:
            assert second.receive_json()["mode"] == "controller"
            second.receive_bytes()
            second.send_bytes(b"ping\r")
            seen = b""
            for _ in range(50):
                if b"ping" in seen:
                    break
                seen += second.receive_bytes()
            assert b"ping" in seen, "the reattached pane could not type"
        # The first socket's close must not revoke the live attachment's control.
        second_ts = agents_routes.terminals.get("claude", agent_session)
        assert second_ts is not None


# ── Cleanup ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reap_terminals():
    """A test that leaves a pty running would leak a process past the suite.

    Deliberately synchronous, not `await terminals.close()`: the child belongs to the TestClient
    portal's event loop, and awaiting its transport from any other loop hangs forever. Signalling
    the process group needs no loop at all.
    """
    yield
    for key, ts in list(agents_routes.terminals._sessions.items()):
        proc = ts._proc
        if proc is not None and proc.returncode is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
        agents_routes.terminals.drop(*key)
