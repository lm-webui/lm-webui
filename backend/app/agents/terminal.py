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
from collections import deque


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
        self._queue: asyncio.Queue = asyncio.Queue()
        # Bounded output buffer for reconnect replay. ponytail: deque(maxlen); a full backlog drops
        # the oldest bytes — acceptable, the CLI restates context if the user needs it.
        self._backlog: deque[bytes] = deque(maxlen=backlog)
        self._exit_code: int | None = None

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    def backlog(self) -> bytes:
        """All output since the session started (for replay to a reconnecting client)."""
        return b"".join(self._backlog)

    async def start(self) -> None:
        master, slave = pty.openpty()
        _set_win_size(slave, self._cols, self._rows)
        self._master = master
        self._proc = await asyncio.create_subprocess_exec(
            *self.cmd, cwd=self.cwd, start_new_session=True,
            stdin=slave, stdout=slave, stderr=slave,
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
        self._queue.put_nowait(data)

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
        self._queue.put_nowait(None)  # sentinel: end of output

    async def output(self):
        """Yield raw output bytes until the session closes (then stops)."""
        while True:
            data = await self._queue.get()
            if data is None:
                return
            yield data

    def write(self, data: bytes) -> None:
        if self._master is not None:
            try:
                os.write(self._master, data)
            except OSError:
                pass

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
    """Owns live terminal sessions by (agent, sid); one process per key."""

    def __init__(self):
        self._sessions: dict[tuple[str, str], TerminalSession] = {}

    def get(self, agent: str, sid: str) -> TerminalSession | None:
        return self._sessions.get((agent, sid))

    async def get_or_create(self, agent: str, sid: str, cmd: list[str], cwd: str) -> TerminalSession:
        key = (agent, sid)
        ts = self._sessions.get(key)
        if ts is None or ts._master is None:  # dead/reaped → respawn
            ts = TerminalSession(agent, cmd, cwd)
            await ts.start()
            self._sessions[key] = ts
        return ts

    def drop(self, agent: str, sid: str) -> None:
        self._sessions.pop((agent, sid), None)
