"""PromptBuilder — the only place that merges typed capability results into LLM messages."""
from __future__ import annotations

from typing import Any, List

from .results import FileResult, MultimodalResult, RetrievalResult, SearchResult, VisionResult
from app.core.prompts import CONTEXT_INTRO, VISION_SECTION, SEARCH_HEADER, SEARCH_INTRO


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
    lines = [SEARCH_INTRO, SEARCH_HEADER]
    for i, item in enumerate(r.items, 1):
        title = item.get("title", "")
        url = item.get("url", "")
        # Page text when it was fetched, else the provider's snippet — never both, the section is
        # token-budgeted and the snippet only repeats the opening of the page.
        text = item.get("content") or item.get("snippet") or ""
        lines.append(f"[{i}] {title} ({url})\n{text}" if text else f"[{i}] {title} ({url})")
    return "\n".join(lines)


# Rough token estimate (chars / 4) — good enough for prompt budgeting.
def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _trim(sections: List[str], budget: int) -> List[str]:
    """Keep sections in priority order while the total stays within `budget`.

    The section that overflows is TRUNCATED, not dropped. Dropping it was silent and total: web
    search fetches up to three pages of up to 12k chars each (`search.fetch.MAX_CHARS`) — ~9k tokens
    — against this budget's 2000, so the entire search section was discarded before the prompt. The
    model then had no web context, no `SEARCH_INTRO`, and reported "I cannot search the web" while
    the search had in fact run and returned results. Partial context is worth far more than none.

    The kept end is the head: both section kinds lead with what the model needs to interpret the
    rest (SEARCH_INTRO and the numbered result list for search; the citation index for retrieval)
    and the bulk follows, so a tail-truncation would keep text and discard its framing.
    """
    used = 0
    kept: List[str] = []
    for s in sections:
        cost = _approx_tokens(s)
        if used + cost <= budget:
            used += cost
            kept.append(s)
            continue
        remaining = budget - used
        if remaining > 0:
            kept.append(s[: remaining * 4])          # inverse of _approx_tokens
        break
    return kept


# How many turns to fetch before budget-trimming. Deliberately larger than what usually fits:
# the budget trims anyway, so this only ever adds context on long conversations.
HISTORY_FETCH = 20


def build_messages(
    user_message: str,
    results: List[Any],
    conversation_id: str,
    user_id: int,
    system_prompt: str = "",
    info: dict | None = None,
) -> List[dict]:
    """Construct messages from user_message + typed results + conversation history.

    Enforces a bounded prompt so generation time stays consistent regardless of history
    length: capability context is capped to `context_token_budget`, history (summary +
    recent messages) to `history_token_budget`, and the current user message is always kept.

    History is injected on every turn — the budget is the only limiter. Pass `info` to receive
    what was injected (currently `{"memory": bool}`) without re-querying for it.
    """
    from app.memory import assemble
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

    # 2. Bounded history — ALWAYS, not only for follow-up-shaped messages. The old gate required a
    #    "?" or a pronoun, so "write a README" arrived with no conversation at all and the model
    #    had to guess what the conversation was about. hist_budget is the only limiter now.
    #    The summary goes into the system prompt (one system message); recent turns become messages.
    #    One call, so the owner is applied to both reads in the same place.
    mem = assemble(conversation_id, user_id, limit=HISTORY_FETCH)

    # The summary is history too, so it spends the same budget the turns below draw on — and it
    # goes in first, because it is the only source for turns the window already dropped. Counting
    # it is what `history_token_budget` ("summary + recent messages") always claimed and never did.
    used = 0
    summary_in_prompt = False
    if mem.summary:
        cost = _approx_tokens(mem.summary)
        # A summary longer than the entire budget would starve every recent turn and leave a
        # prompt made only of a summary — the worst of both. Recency wins; skip it.
        if cost <= hist_budget:
            system_prompt += f"\n\nConversation Summary (prior turns): {mem.summary}"
            used = cost
            summary_in_prompt = True
    if info is not None:
        # What was INJECTED, not what merely exists — a skipped summary is not used memory.
        info["memory"] = summary_in_prompt

    # Fetch generously and let the budget trim: a short conversation costs nothing extra, a long
    # one gives the model far more to work with than the old fixed 5. `used` carries the summary's
    # share, so the two together stay inside hist_budget.
    kept: List[dict] = []
    for m in reversed(mem.recent):      # walk newest → oldest, stop when the budget is spent
        cost = _approx_tokens(m["content"])
        if used + cost > hist_budget:
            break
        kept.insert(0, m)               # re-reverse into chronological order
        used += cost

    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(kept)

    # 3. Current user message — always kept (the anchor).
    messages.append({"role": "user", "content": user_message})
    return messages
