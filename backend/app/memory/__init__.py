"""Conversation memory: the recent-turn window plus a rolling summary of what fell out of it.

`assemble()` is the single entry point for the generation path, on purpose. Scoping is the thing
easiest to get wrong here — with two separate reads, a caller can pass the owner to one and forget
the other, and the failure is silent: another user's turns land in a prompt with nothing raising.
One call that takes the owner once and applies it to both makes that mistake unrepresentable.

The summariser and the maintenance helpers are exported for the orchestrator and the routes, which
need them by name rather than as part of a turn.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .history import get_conversation_messages, get_recent_turns
from .summaries import (
    SUMMARY_TOKEN_THRESHOLD,
    SUMMARISE_FETCH_LIMIT,
    delete_summary,
    generate_summary,
    get_summary,
    get_unsummarized_messages,
    save_summary,
    should_summarize,
)

# How much of the recent window to fetch before the caller trims to its token budget. A fetch
# ceiling, not an injection target — the budget is what actually bounds the prompt.
RECENT_TURNS_FETCH = 20


@dataclass
class MemoryContext:
    """What a single turn should remember: the summary of older turns, and the recent ones."""

    summary: Optional[str] = None
    recent: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def has_summary(self) -> bool:
        return bool(self.summary)


def assemble(conversation_id: str, user_id: int,
             limit: int = RECENT_TURNS_FETCH) -> MemoryContext:
    """Everything a turn needs from memory, scoped to `user_id` once and applied to both reads."""
    return MemoryContext(
        summary=get_summary(conversation_id, user_id),
        recent=get_recent_turns(conversation_id, user_id, limit),
    )


__all__ = [
    "MemoryContext",
    "RECENT_TURNS_FETCH",
    "SUMMARY_TOKEN_THRESHOLD",
    "SUMMARISE_FETCH_LIMIT",
    "assemble",
    "delete_summary",
    "generate_summary",
    "get_conversation_messages",
    "get_recent_turns",
    "get_summary",
    "get_unsummarized_messages",
    "save_summary",
    "should_summarize",
]
