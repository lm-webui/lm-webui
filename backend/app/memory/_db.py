"""Shared SQLite access for the memory package.

Deliberately local rather than imported from `app.chat.service`: chat imports memory (through the
prompt builder and the orchestrator), so depending on it from here would point the wrong way.
"""
from contextlib import contextmanager

from app.database import get_db


@contextmanager
def db_ctx():
    """Connection scoped to one call and closed on the way out."""
    db = get_db()
    try:
        yield db
    finally:
        db.close()
