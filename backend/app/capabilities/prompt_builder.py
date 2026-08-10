"""PromptBuilder — the only place that merges typed capability results into LLM messages."""
from __future__ import annotations

from typing import Any, List

from .results import FileResult, RetrievalResult, SearchResult, VisionResult


def _vision_section(r: VisionResult) -> str:
    return f"Vision description of the attached image:\n{r.text}"


def _file_section(r: FileResult) -> str:
    return r.text


def _retrieval_section(r: RetrievalResult) -> str:
    return "\n\n".join(
        f"[{i+1}] {chunk}" for i, chunk in enumerate(r.chunks)
    )


def _search_section(r: SearchResult) -> str:
    lines = []
    for i, item in enumerate(r.items):
        title = item.get("title", "")
        url = item.get("url", "")
        snippet = item.get("snippet", "")
        lines.append(f"- [{title}]({url})" + (f" — {snippet}" if snippet else ""))
    return "Web search results:\n" + "\n".join(lines)


def build_messages(
    user_message: str,
    results: List[Any],
    conversation_id: str,
    system_prompt: str = "",
) -> List[dict]:
    """Construct messages from user_message + typed results + conversation history."""
    from app.chat.service import get_conversation_summary, get_last_n_messages

    sections = []
    for r in results:
        if isinstance(r, FileResult) and r.text:
            sections.append(_file_section(r))
        elif isinstance(r, RetrievalResult) and r.chunks:
            sections.append(_retrieval_section(r))
        elif isinstance(r, SearchResult) and r.items:
            sections.append(_search_section(r))
        elif isinstance(r, VisionResult) and r.text:
            sections.append(_vision_section(r))

    context = "\n\n".join(sections)

    system_prompt = system_prompt or "You are a helpful AI assistant."
    if context:
        system_prompt += (
            "\n\nRelevant context is provided below (from web search or your knowledge base). "
            "Use it to answer the user's question factually, citing numbered sources as [n] "
            "where referenced. If the context doesn't contain enough information, say so and "
            "use your own knowledge.\n\n" + context
        )
    messages: List[dict] = [{"role": "system", "content": system_prompt}]

    summary = get_conversation_summary(conversation_id)
    if summary:
        messages.append({"role": "system", "content": f"Conversation Summary: {summary}"})

    for msg in get_last_n_messages(conversation_id, n=5):
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages
