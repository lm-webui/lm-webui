"""Small, provider-neutral records and limits for tool execution."""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional


class ToolLimitError(RuntimeError):
    pass


@dataclass
class ToolBudget:
    max_calls: int = 8
    max_output_chars: int = 32_000
    timeout_seconds: int = 120
    calls: int = 0
    _seen: set[str] = field(default_factory=set)

    def reserve(self, tool_name: str, arguments: Any) -> str:
        if self.calls >= self.max_calls:
            raise ToolLimitError("Tool-call limit reached")
        normalized = json.dumps(arguments, sort_keys=True, separators=(",", ":"), default=str)
        call_key = hashlib.sha256(f"{tool_name}\0{normalized}".encode()).hexdigest()
        if call_key in self._seen:
            raise ToolLimitError("Duplicate tool call")
        self._seen.add(call_key)
        self.calls += 1
        return call_key

    def truncate(self, output: str) -> str:
        return (output or "")[: self.max_output_chars]


@dataclass
class ToolExecutionRecord:
    call_id: str
    tool_name: str
    arguments_summary: str = ""
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    status: str = "running"
    result_summary: str = ""
    error: Optional[str] = None
    approval_state: str = "not_required"
    cancelled: bool = False
    isolated: bool = False
    timeout_seconds: int = 120
    output_chars: int = 0

    def finish(self, *, status: str, result: str = "", error: Optional[str] = None) -> None:
        self.finished_at = time.time()
        self.status = status
        self.result_summary = result[:1000]
        self.output_chars = len(result)
        self.error = error

    def as_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "tool_name": self.tool_name,
            "arguments_summary": self.arguments_summary,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "status": self.status,
            "result_summary": self.result_summary,
            "error": self.error,
            "approval_state": self.approval_state,
            "cancelled": self.cancelled,
            "isolated": self.isolated,
            "timeout_seconds": self.timeout_seconds,
            "output_chars": self.output_chars,
        }
