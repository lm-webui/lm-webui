"""PromptBuilder — the only place that merges typed capability results into LLM messages."""
from __future__ import annotations

import re
from typing import Any, List

from .results import FileResult, MultimodalResult, RetrievalResult, SearchResult, VisionResult
from app.core.prompts import CONTEXT_INTRO, VISION_SECTION, SEARCH_HEADER


def _vision_section(r: VisionResult) -> str:
    return VISION_SECTION + r.text


def _multimodal_section(r: MultimodalResult) -> str:
    parts = []
    if r.text_chunks:
        parts.append("Retrieved context (text):")
        parts.extend(f"[{i+1}] {chunk}" for i, chunk in enumerate(r.text_chunks))
    if r.image_refs:
        parts.append("Matching images: " + ", ".join(
            ref.get("media_path", "") for ref in r.image_refs))
    return "\n\n".join(parts)


def _file_section(r: FileResult) -> str:
    return r.text


def _retrieval_section(r: RetrievalResult) -> str:
    return "\n\n".join(
        f"[{i+1}] {chunk}" for i, chunk in enumerate(r.chunks)
    )


def _search_section(r: SearchResult) -> str:
    lines = [SEARCH_HEADER]
    for i, item in enumerate(r.items, 1):
        title = item.get("title", "")
        url = item.get("url", "")
        snippet = item.get("snippet", "")
        lines.append(f"[{i}] {title} ({url})" + (f" — {snippet}" if snippet else ""))
    return "\n".join(lines)


# Rough token estimate (chars / 4) — good enough for prompt budgeting.
def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


# Signals that the current request depends on prior context (pronouns/references) —
# only then do we inject full conversation history. A standalone request gets minimal history.
_FOLLOWUP_RE = re.compile(
    r"\b(it|this|that|those|they|them|the above|the (file|doc|pdf|image|picture|chart)|"
    r"go (deeper|further)|more (detail|on)|explain|refer|mention|earlier|before|"
    r"continue|go on|proceed|again)\b", re.I)


def _is_followup(message: str) -> bool:
    m = (message or "").strip()
    return bool(m.rstrip().endswith("?") or _FOLLOWUP_RE.search(m))


def _trim(sections: List[str], budget: int) -> List[str]:
    """Keep sections in priority order while the total stays within `budget`."""
    used = 0
    kept: List[str] = []
    for s in sections:
        cost = _approx_tokens(s)
        if used + cost > budget:
            break
        used += cost
        kept.append(s)
    return kept


def build_messages(
    user_message: str,
    results: List[Any],
    conversation_id: str,
    system_prompt: str = "",
) -> List[dict]:
    """Construct messages from user_message + typed results + conversation history.

    Enforces a bounded prompt so generation time stays consistent regardless of history
    length: capability context is capped to `context_token_budget`, history (summary +
    recent messages) to `history_token_budget`, and the current user message is always kept.
    Full history is injected only for follow-ups that reference prior context.
    """
    from app.chat.service import get_conversation_summary, get_last_n_messages
    from app.core.config_manager import get_config
    try:
        ctx_budget = get_config().rag.context_token_budget
        hist_budget = get_config().rag.history_token_budget
    except Exception:
        ctx_budget, hist_budget = 2000, 4000

    # 1. Capability results → bounded context.
    sections = []
    for r in results:
        if isinstance(r, FileResult) and r.text:
            sections.append(_file_section(r))
        elif isinstance(r, RetrievalResult) and r.chunks:
            sections.append(_retrieval_section(r))
        elif isinstance(r, MultimodalResult) and (r.text_chunks or r.image_refs):
            sections.append(_multimodal_section(r))
        elif isinstance(r, SearchResult) and r.items:
            sections.append(_search_section(r))
        elif isinstance(r, VisionResult) and r.text:
            sections.append(_vision_section(r))
    context = "\n\n".join(_trim(sections, ctx_budget))

    from app.core.prompts import DEFAULT_SYSTEM_PROMPT
    system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
    if context:
        system_prompt += CONTEXT_INTRO + context

    # 2. Bounded history — only for follow-ups that reference prior context. The summary is
    #    merged into the system prompt (one system message), recent messages added as turns.
    followup = _is_followup(user_message)
    if followup:
        summary = get_conversation_summary(conversation_id)
        if summary:
            system_prompt += f"\n\nConversation Summary (prior turns): {summary}"
        recent = get_last_n_messages(conversation_id, n=5)  # chronological (oldest first)
        # Keep newest messages that fit the budget (drop oldest first).
        kept: List[dict] = []
        used = 0
        for m in recent:
            cost = _approx_tokens(m["content"])
            if used + cost > hist_budget:
                break
            kept.append(m)
            used += cost

    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    if followup:
        messages.extend(kept)

    # 3. Current user message — always kept (the anchor).
    messages.append({"role": "user", "content": user_message})
    return messages
