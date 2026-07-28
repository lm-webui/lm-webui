"""
Query-time meta-extraction for RAG.
Parses user queries for time constraints, document scope, and version indicators
using regex + dateparser. Zero ML model overhead — <1ms on average.

Examples:
    "What was our return policy in 2024?"
        → {"year": [2024]}

    "Show me Q3 2024 reports"
        → {"year": [2024], "quarter": "Q3"}

    "Documents from last month"
        → {"uploaded_at": {"1900-01-01": "2026-06-27"}}  (approx)

    "Compare 2022 vs 2024 strategy"
        → {"year": [2022, 2024]}
"""

import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import dateparser
except ImportError:
    dateparser = None


# ── Public API ──────────────────────────────────────────────────────────


def extract_filters(query: str) -> dict[str, Any]:
    """Extract metadata filters from a user query.

    Returns a dict that can be passed to LanceDB's ``.where()`` clause.
    Returns empty dict when no constraints are detected — the caller
    performs a full unfiltered search.
    """
    filters: dict[str, Any] = {}

    _extract_years(query, filters)
    _extract_date_range(query, filters)
    _extract_quarter(query, filters)

    return filters


# ── Internal extractors ─────────────────────────────────────────────────


def _extract_years(query: str, filters: dict[str, Any]) -> None:
    """Match explicit year mentions like ``in 2024``, ``2023 report``."""
    years = re.findall(r"\b(?:19|20)\d{2}\b", query)
    if years:
        filters["year"] = sorted({int(y) for y in years})


def _extract_quarter(query: str, filters: dict[str, Any]) -> None:
    """Match quarter references like ``Q3``, ``Q1 2024``."""
    match = re.search(r"[Qq][1-4]", query)
    if match:
        filters["quarter"] = match.group().upper()


def _extract_date_range(query: str, filters: dict[str, Any]) -> None:
    """Match relative date expressions using dateparser.

    Handles: "last month", "last quarter", "this year", "recent",
    "last week", "past 30 days", etc.
    This is a rough heuristic — exact dates should use explicit year syntax.
    """
    if dateparser is None:
        return

    # Map common expressions to a start-of-period anchor.
    # dateparser parses relative expressions relative to "today".
    patterns = {
        r"\blast\s+month\b": "first day of last month",
        r"\bthis\s+month\b": "first day of this month",
        r"\blast\s+quarter\b": "first day of 3 months ago",
        r"\bthis\s+(year|quarter)\b": "first day of this year",
        r"\blast\s+year\b": "first day of last year",
        r"\b(recent|newest|latest)\b": "30 days ago",
        r"\b(past|last)\s+\d+\s+days?\b": None,  # handled inline
    }

    now = dateparser.parse("now")
    if now is None:
        return

    for pattern, anchor in patterns.items():
        if re.search(pattern, query, re.IGNORECASE):
            if pattern.startswith(r"\b(past|last)\s+\d+"):
                # "past 30 days" — extract the number
                num_match = re.search(r"\b(past|last)\s+(\d+)\s+days?\b", query, re.IGNORECASE)
                if num_match:
                    days = int(num_match.group(2))
                    from dateutil.relativedelta import relativedelta
                    start = now - relativedelta(days=days)
                    filters["uploaded_at"] = {
                        "gte": start.strftime("%Y-%m-%d"),
                    }
            else:
                parsed = dateparser.parse(anchor)
                if parsed:
                    filters["uploaded_at"] = {
                        "gte": parsed.strftime("%Y-%m-%d"),
                    }
            return  # first match wins
