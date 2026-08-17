"""Invoke a CLI agent non-interactively, streaming its output; interactive via provider adapters."""
import asyncio
import json
from typing import AsyncGenerator, AsyncIterator

from .registry import AGENTS
from .providers import spawn_cmd, normalize


class InteractiveSession:
    """Persistent bidirectional claude session (stream-json).

    Spawns `claude -p --input-format stream-json --output-format stream-json` and keeps it alive
    across turns so the conversation carries context. A reader task parses stdout JSONL into an
    `asyncio.Queue` of normalized events; `send_message`/`answer` write user/tool-result frames to
    stdin. Events consumed via `events()`.
    """

    def __init__(self, cwd: str, agent: str = "claude", model: str = "", system_prompt: str = ""):
        self._cwd = cwd
        self._agent = agent
        self._model = model
        self._system_prompt = system_prompt
        self._proc = None
        self._queue: asyncio.Queue = asyncio.Queue()
        self._reader_task: asyncio.Task | None = None

    def _cmd(self) -> list[str]:
        return spawn_cmd(self._agent, self._cwd, self._model, self._system_prompt)

    async def start(self) -> None:
        self._proc = await asyncio.create_subprocess_exec(
            *self._cmd(),
            cwd=self._cwd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._reader_task = asyncio.create_task(self._read())

    async def _read(self) -> None:
        """Read stdout JSONL, normalize each frame into the queue."""
        assert self._proc and self._proc.stdout
        try:
            async for raw in self._proc.stdout:
                raw = raw.decode(errors="replace").strip()
                if not raw:
                    continue
                try:
                    ev = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                await self._push(normalize(self._agent, ev))
        except asyncio.CancelledError:
            pass

    async def _push(self, events: list[dict] | None) -> None:
        if not events:
            return
        for e in events:
            await self._queue.put(e)

    async def events(self) -> AsyncIterator[dict]:
        """Yield normalized events: {type: output|prompt|result|complete|error, ...}."""
        while True:
            ev = await self._queue.get()
            yield ev
            if ev.get("type") in ("complete", "error"):
                break

    async def send_message(self, text: str) -> None:
        frame = {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}
        await self._write(json.dumps(frame))

    async def answer(self, tool_use_id: str, approve: bool) -> None:
        """Approve/deny a tool-use permission ask (writes a stream-json result frame)."""
        subtype = "success" if approve else "error"
        content = ([{"type": "tool_result", "tool_use_id": tool_use_id,
                     "content": [{"type": "text", "text": "Approved by user"}]}]
                   if approve else
                   [{"type": "tool_result", "tool_use_id": tool_use_id,
                     "content": [{"type": "text", "text": "Denied by user"}], "is_error": True}])
        frame = {"type": "result", "subtype": subtype, "content": content}
        await self._write(json.dumps(frame))

    async def _write(self, line: str) -> None:
        assert self._proc and self._proc.stdin
        self._proc.stdin.write((line + "\n").encode())
        await self._proc.stdin.drain()

    async def close(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
        if self._proc:
            try:
                self._proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                self._proc.kill()


async def run(agent: str, prompt: str, cwd: str, holder: dict | None = None) -> AsyncGenerator[str, None]:
    """Run the agent once with `prompt`, yielding decoded stdout lines as they arrive.

    `holder` (if given) receives `{"returncode": <int>}` on exit, so the caller can read the
    process status after consuming the stream.
    """
    cmd = [*AGENTS[agent]["run"], prompt]
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=cwd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    async for line in proc.stdout:
        yield line.decode(errors="replace")
    rc = await proc.wait()
    if holder is not None:
        holder["returncode"] = rc


async def run_collect(agent: str, prompt: str, cwd: str) -> str:
    """Run the agent once and return the full output as text (non-streaming)."""
    parts: list[str] = []
    async for line in run(agent, prompt, cwd):
        parts.append(line)
    return "".join(parts)
