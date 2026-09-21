"""PTY-backed interactive terminal session + per-session registry for Agent Hub.

Each agent runs inside a pseudo-terminal so its native interactive CLI (prompts, sub-agents,
spinners, colors, cursor, arrow-key selection) works unchanged. One session per (agent, sid),
owned independently — no global name-keyed map, so concurrent sessions can't cross-route input.

ponytail: `create_subprocess_exec` with the pty slave as stdin/stdout/stderr + start_new_session.
No manual fork/TIOCSCTTY dance — `isatty()` is what the CLIs actually gate on, and that's satisfied
by the slave fd. If a CLI turns out to need a controlling tty, switch to `pty.fork()`.
"""
import asyncio
import fcntl
import os
import pty
import struct
import termios
import time
import uuid
from collections import deque


def _pty_env() -> dict:
    """Environment for the pty child.

    TERM is the reason this exists. The backend runs under launchd/systemd, whose environment
    carries no TERM, and the child inherited that — while `isatty()` still passed on the pty
    slave, so nothing looked wrong server-side. Every TUI gates on TERM, so an agent CLI started
    without it drops colour, full-screen redraw and readline line-editing: it looked like a dumb
    pipe rather than a terminal.

    A TERM that is deliberately set is left alone; only unset/dumb is replaced.
    """
    env = dict(os.environ)
    if env.get("TERM", "") in ("", "dumb"):
        env["TERM"] = "xterm-256color"
    env.setdefault("COLORTERM", "truecolor")
    # CLIs emit box-drawing and emoji; without a UTF-8 locale they come through as mojibake.
    if not env.get("LANG") and not env.get("LC_ALL"):
        env["LANG"] = "en_US.UTF-8"
    return env


def _set_controlling_tty() -> None:
    """Make the pty slave the child's controlling terminal.

    Runs in the forked child (preexec_fn), after Popen has already dup2'd the slave onto fd 0
    and — because start_new_session=True — called setsid(). That leaves the child a session
    leader with *no* controlling terminal, which is the subtle half of the pty setup:
    TIOCSWINSZ still sets the window size and the program can read it, but the kernel has no
    foreground process group for that tty, so it never delivers SIGWINCH. Full-screen TUIs
    therefore never redraw after the browser is resized, even though resize "works".

    Deliberately one syscall: preexec_fn runs in a forked child of a threaded process, so
    anything that allocates or takes a lock risks deadlocking before exec.
    """
    try:
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)
    except OSError:
        pass


def _set_win_size(fd: int, cols: int, rows: int) -> None:
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


class TerminalSession:
    """A live interactive agent in a pty, streaming raw bytes in/out."""

    def __init__(self, agent: str, cmd: list[str], cwd: str, cols: int = 120, rows: int = 30,
                 backlog: int = 8192):
        self.agent = agent
        self.cmd = cmd
        self.cwd = cwd
        self._cols, self._rows = cols, rows
        self._proc: asyncio.subprocess.Process | None = None
        self._master: int | None = None
        # Each attachment gets its own queue. A shared queue makes two devices compete for
        # chunks, so each viewer sees only a random half of the terminal output.
        self._subscribers: set[asyncio.Queue] = set()
        self._attachments: dict[str, int] = {}
        self._controller: str | None = None
        self._controller_user: int | None = None
        self._lease_until = 0.0
        # Bounded output buffer for reconnect replay. ponytail: deque(maxlen); a full backlog drops
        # the oldest bytes — acceptable, the CLI restates context if the user needs it.
        self._backlog: deque[bytes] = deque(maxlen=backlog)
        self._exit_code: int | None = None

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def alive(self) -> bool:
        """True while the pty is still open — i.e. the CLI process is running."""
        return self._master is not None

    def backlog(self) -> bytes:
        """All output since the session started (for replay to a reconnecting client)."""
        return b"".join(self._backlog)

    def attach(self, user_id: int) -> tuple[str, str]:
        token = uuid.uuid4().hex
        self._attachments[token] = user_id
        self._expire_controller()
        if self._controller is None:
            self._grant(token)
            return token, "controller"
        return token, "viewer"

    def detach(self, token: str) -> None:
        self._attachments.pop(token, None)
        if token == self._controller:
            self._controller = None
            self._controller_user = None
            self._lease_until = 0

    def request_turn(self, token: str, user_id: int, admin: bool = False) -> bool:
        self._expire_controller()
        if token not in self._attachments or self._attachments[token] != user_id:
            return False
        if self._controller is None or admin:
            self._grant(token)
            return True
        return token == self._controller

    def release_turn(self, token: str) -> bool:
        self._expire_controller()
        if token != self._controller:
            return False
        self._controller = None
        self._controller_user = None
        self._lease_until = 0
        return True

    def can_write(self, token: str) -> bool:
        self._expire_controller()
        return token == self._controller

    def _grant(self, token: str) -> None:
        self._controller = token
        self._controller_user = self._attachments[token]
        self._lease_until = time.monotonic() + 60

    def _expire_controller(self) -> None:
        if self._controller and time.monotonic() >= self._lease_until:
            token = self._controller
            self._controller = None
            self._controller_user = None
            self._lease_until = 0

    async def start(self) -> None:
        master, slave = pty.openpty()
        _set_win_size(slave, self._cols, self._rows)
        self._master = master
        self._proc = await asyncio.create_subprocess_exec(
            *self.cmd, cwd=self.cwd, start_new_session=True,
            stdin=slave, stdout=slave, stderr=slave,
            env=_pty_env(), preexec_fn=_set_controlling_tty,
        )
        os.close(slave)
        loop = asyncio.get_running_loop()
        loop.add_reader(master, self._pump)
        asyncio.create_task(self._wait())

    def _pump(self) -> None:
        # Called on the event loop by add_reader — safe to put_nowait directly.
        try:
            data = os.read(self._master, 65536)
        except OSError:
            self._teardown()
            return
        if not data:
            self._teardown()
            return
        self._backlog.append(data)
        for queue in tuple(self._subscribers):
            queue.put_nowait(data)

    async def _wait(self) -> None:
        assert self._proc is not None
        try:
            self._exit_code = await self._proc.wait()
        finally:
            self._teardown()

    def _teardown(self) -> None:
        if self._master is not None:
            loop = asyncio.get_running_loop()
            try:
                loop.remove_reader(self._master)
            except (OSError, ValueError):
                pass
            try:
                os.close(self._master)
            except OSError:
                pass
            self._master = None
        for queue in tuple(self._subscribers):
            queue.put_nowait(None)  # sentinel: end of output

    async def output(self):
        """Yield raw output for one attachment until the session closes."""
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                data = await queue.get()
                if data is None:
                    return
                yield data
        finally:
            self._subscribers.discard(queue)

    def write(self, data: bytes) -> None:
        if self._master is not None:
            try:
                os.write(self._master, data)
            except OSError:
                pass

    def heartbeat(self, token: str) -> bool:
        if self.can_write(token):
            self._lease_until = time.monotonic() + 60
            return True
        return False

    def resize(self, cols: int, rows: int) -> None:
        if self._master is not None:
            _set_win_size(self._master, cols, rows)

    async def close(self) -> None:
        if self._proc is not None and self._proc.returncode is None:
            try:
                self._proc.kill()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                pass
        self._teardown()


class TerminalRegistry:
    """Owns live terminal sessions by (agent, sid); one process per key.

    A session outlives the WebSocket that opened it: disconnecting detaches, it does not kill,
    so the client can reconnect and replay the backlog. The process is reaped when its session
    is deleted, or by the registry noticing it exited.

    ponytail: an abandoned session keeps its CLI process until the session is deleted. Add an
    idle reaper if unattended tabs ever pile up on a shared deployment.
    """

    def __init__(self):
        self._sessions: dict[tuple[str, str], TerminalSession] = {}

    def get(self, agent: str, sid: str) -> TerminalSession | None:
        return self._sessions.get((agent, sid))

    async def get_or_create(self, agent: str, sid: str, cmd: list[str], cwd: str) -> TerminalSession:
        key = (agent, sid)
        ts = self._sessions.get(key)
        if ts is None or not ts.alive:  # dead/reaped → respawn
            ts = TerminalSession(agent, cmd, cwd)
            await ts.start()
            self._sessions[key] = ts
        return ts

    def drop(self, agent: str, sid: str) -> None:
        self._sessions.pop((agent, sid), None)

    async def close(self, agent: str, sid: str) -> None:
        """Kill and forget a session's process — for when the session itself is deleted."""
        ts = self._sessions.pop((agent, sid), None)
        if ts is not None:
            await ts.close()
