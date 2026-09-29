"""Process-local lifecycle and bounded admission for local runtimes."""
from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Optional


@dataclass
class RuntimeSnapshot:
    runtime: str
    state: str = "unloaded"
    model: Optional[str] = None
    active: int = 0
    queued: int = 0
    last_used: Optional[float] = None
    last_error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "runtime": self.runtime,
            "state": self.state,
            "model": self.model,
            "active_generations": self.active,
            "queued_generations": self.queued,
            "last_used": self.last_used,
            "last_error": self.last_error,
        }


class RuntimeBusyError(RuntimeError):
    """Raised when a local runtime cannot accept another request."""

    def __init__(self, runtime: str, queued: int):
        self.runtime = runtime
        self.queued = queued
        super().__init__(f"{runtime} runtime is busy")


class RuntimeLifecycle:
    def __init__(self, runtime: str, *, max_active: int = 1, max_queue: int = 8):
        self.runtime = runtime
        self.max_active = max(1, max_active)
        self.max_queue = max(0, max_queue)
        self._condition = asyncio.Condition()
        self._snapshot = RuntimeSnapshot(runtime=runtime)

    def snapshot(self) -> dict:
        return self._snapshot.as_dict()

    def set_model(self, model: Optional[str], state: str = "ready") -> None:
        self._snapshot.model = model
        self._snapshot.state = state if model else "unloaded"
        self._snapshot.last_error = None

    def set_state(self, state: str, error: Optional[str] = None) -> None:
        self._snapshot.state = state
        self._snapshot.last_error = error

    def mark_unloaded(self) -> None:
        self._snapshot.model = None
        self._snapshot.state = "unloaded"
        self._snapshot.last_used = time.time()

    @asynccontextmanager
    async def generation(self, model: Optional[str] = None) -> AsyncIterator[float]:
        queued = False
        async with self._condition:
            if self._snapshot.active >= self.max_active:
                if self._snapshot.queued >= self.max_queue:
                    raise RuntimeBusyError(self.runtime, self._snapshot.queued)
                self._snapshot.queued += 1
                queued = True
                try:
                    await self._condition.wait_for(
                        lambda: self._snapshot.active < self.max_active
                    )
                finally:
                    self._snapshot.queued = max(0, self._snapshot.queued - 1)
            self._snapshot.active += 1
            self._snapshot.model = model or self._snapshot.model
            self._snapshot.state = "generating"
            self._snapshot.last_used = time.time()
        started = time.monotonic()
        try:
            yield started
        finally:
            async with self._condition:
                self._snapshot.active = max(0, self._snapshot.active - 1)
                self._snapshot.last_used = time.time()
                self._snapshot.state = "ready" if self._snapshot.model else "unloaded"
                self._condition.notify(1)


_LIFECYCLES = {
    "gguf": RuntimeLifecycle(
        "gguf",
        max_active=int(os.getenv("LMWEBUI_LOCAL_MAX_ACTIVE", "1")),
        max_queue=int(os.getenv("LMWEBUI_LOCAL_MAX_QUEUE", "8")),
    ),
    "mlx": RuntimeLifecycle(
        "mlx",
        max_active=int(os.getenv("LMWEBUI_LOCAL_MAX_ACTIVE", "1")),
        max_queue=int(os.getenv("LMWEBUI_LOCAL_MAX_QUEUE", "8")),
    ),
}


def lifecycle_for(runtime: str) -> RuntimeLifecycle:
    if runtime not in _LIFECYCLES:
        _LIFECYCLES[runtime] = RuntimeLifecycle(runtime)
    return _LIFECYCLES[runtime]


def lifecycle_snapshots() -> dict[str, dict]:
    return {name: lifecycle.snapshot() for name, lifecycle in _LIFECYCLES.items()}
