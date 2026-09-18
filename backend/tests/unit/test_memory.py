"""Chat memory — the rolling summary must persist, and history must always be injected.

Regressions guarded here:

1. `generate_summary` used to compute a summary, return it, and never persist it, so
   `conversation_summaries` stayed empty and the whole long-term layer was inert. It was masked
   because the local model the old code needed did not exist, so generation bailed before it could
   have saved anything.
2. History was injected only for "follow-up-shaped" messages (a `?` or a pronoun), so
   "write a README" reached the model with no conversation at all.
3. `get_summary` / `get_recent_turns` / `get_conversation_messages` are now owner-scoped in the
   query. The scoping itself is exercised against a real SQLite file below.
"""
import sqlite3

import pytest

import app.memory as memory
from app.capabilities import prompt_builder as pb
from app.memory import MemoryContext, history, summaries

USER = 1
OTHER = 2


class _Provider:
    """Stands in for a real provider. `generate` is what the summariser awaits."""

    def __init__(self, content: str):
        self._content = content
        self.calls = []

    async def generate(self, request):
        self.calls.append(request)
        return type("R", (), {"content": self._content})()


@pytest.fixture
def saved(monkeypatch):
    """Capture summary writes instead of touching the real user database."""
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(summaries, "save_summary",
                        lambda cid, uid, summary: calls.append((cid, summary)) or True)
    monkeypatch.setattr(summaries, "get_summary", lambda cid, uid: None)
    return calls


def _use_provider(monkeypatch, provider):
    """Install a stand-in provider factory.

    `app.providers.factory` imports the MLX provider at module scope, which cannot load in a
    sandbox without Apple's metallib — and the summariser imports the factory *inside* the
    function, so replacing the module in sys.modules sidesteps the import entirely.
    """
    import sys
    import types

    mod = types.ModuleType("app.providers.factory")
    mod.ProviderFactory = type("ProviderFactory", (), {
        "get_provider": classmethod(lambda cls, pid, **kw: provider),
    })
    monkeypatch.setitem(sys.modules, "app.providers.factory", mod)


# ── the summary persists ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_summary_is_persisted(monkeypatch, saved):
    """The line that was missing. Without it the table is never written."""
    _use_provider(monkeypatch, _Provider("They discussed the deploy and chose Postgres."))
    out = await summaries.generate_summary(
        "conv_1", [{"role": "user", "content": "hi"}], user_id=USER,
        provider_id="openai", model_id="gpt-4o-mini",
    )
    assert out and "Postgres" in out
    assert saved == [("conv_1", out)], "the summary was computed but not saved"


@pytest.mark.asyncio
async def test_no_persist_when_provider_unavailable(monkeypatch, saved):
    """A missing/unconfigured provider must not write a bogus summary."""
    _use_provider(monkeypatch, None)
    out = await summaries.generate_summary(
        "conv_2", [{"role": "user", "content": "hi"}], user_id=USER, provider_id="nope",
    )
    assert out is None
    assert saved == []


@pytest.mark.asyncio
async def test_no_persist_on_empty_completion(monkeypatch, saved):
    """An empty completion must not overwrite a good summary with nothing."""
    _use_provider(monkeypatch, _Provider("   "))
    out = await summaries.generate_summary(
        "conv_3", [{"role": "user", "content": "hi"}], user_id=USER, provider_id="openai",
    )
    assert out is None
    assert saved == []


@pytest.mark.asyncio
async def test_no_messages_is_a_noop(monkeypatch, saved):
    out = await summaries.generate_summary("conv_4", [], user_id=USER, provider_id="openai")
    assert out is None and saved == []


@pytest.mark.asyncio
async def test_previous_summary_is_fed_back(monkeypatch, saved):
    """It must stay a ROLLING summary — the old one goes into the prompt."""
    monkeypatch.setattr(summaries, "get_summary", lambda cid, uid: "EARLIER: chose Postgres")
    p = _Provider("Updated summary")
    _use_provider(monkeypatch, p)
    await summaries.generate_summary(
        "conv_5", [{"role": "user", "content": "and now?"}], user_id=USER, provider_id="openai",
    )
    assert "EARLIER: chose Postgres" in p.calls[0].messages[-1]["content"]


# ── history is always injected into the prompt ────────────────────────────

@pytest.fixture
def history_stub(monkeypatch):
    """Three prior turns, no summary — stubbed at the one call the builder makes."""
    monkeypatch.setattr(memory, "assemble", lambda cid, uid, limit=20: MemoryContext(recent=[
        {"role": "user", "content": "we are building a parser"},
        {"role": "assistant", "content": "understood"},
        {"role": "user", "content": "it uses a stack"},
    ]))


def test_history_injected_for_a_plain_instruction(history_stub):
    """The regression: 'write a README' has no '?' and no pronoun, so the old gate dropped ALL
    history and the model had to guess what the conversation was about."""
    msgs = pb.build_messages("write a README", [], "conv_x", USER)
    contents = [m["content"] for m in msgs]
    assert any("we are building a parser" in c for c in contents)
    assert msgs[-1] == {"role": "user", "content": "write a README"}   # anchor is last


def test_summary_injected_and_reported(monkeypatch):
    monkeypatch.setattr(memory, "assemble", lambda cid, uid, limit=20:
                        MemoryContext(summary="They chose Postgres."))
    info: dict = {}
    msgs = pb.build_messages("next step?", [], "conv_y", USER, info=info)
    assert "Conversation Summary (prior turns): They chose Postgres." in msgs[0]["content"]
    assert info["memory"] is True


def test_memory_flag_false_without_a_summary(history_stub):
    """The flag used to be hardcoded False in the controller, so the UI badge could never light."""
    info: dict = {}
    pb.build_messages("hello", [], "conv_z", USER, info=info)
    assert info["memory"] is False


def test_history_budget_drops_the_oldest(monkeypatch):
    """Newest turns win when the budget is tight. The original loop walked oldest→newest and broke
    on budget, so it kept the OLDEST and dropped the newest — the opposite of its own comment."""
    long = "x" * 4000          # ~1000 tokens by the chars/4 estimate
    monkeypatch.setattr(memory, "assemble", lambda cid, uid, limit=20: MemoryContext(recent=[
        {"role": "user", "content": f"OLDEST {long}"},
        {"role": "assistant", "content": f"MIDDLE {long}"},
        {"role": "user", "content": f"NEWEST {long}"},
    ]))
    monkeypatch.setattr(pb, "_approx_tokens", lambda t: len(t) // 4)
    from app.core import config_manager
    monkeypatch.setattr(config_manager, "get_config", lambda: type("C", (), {
        "rag": type("R", (), {"context_token_budget": 100, "history_token_budget": 1100})()})())

    msgs = pb.build_messages("and then?", [], "conv_b", USER)
    joined = " ".join(m["content"] for m in msgs)
    assert "NEWEST" in joined
    assert "OLDEST" not in joined, "budget must drop the oldest turn, not the newest"


# ── owner scoping, against a real SQLite file ─────────────────────────────
#
# The IDOR this closes: GET /api/context/{id} used to return any user's summary and last 10
# messages to anyone who knew a conv_<uuid>. Scoping lives in the query, so these exercise SQL.

@pytest.fixture
def db(monkeypatch, tmp_path):
    """A throwaway database with two users, each owning one conversation."""
    conn = sqlite3.connect(str(tmp_path / "mem.db"))
    conn.executescript("""
        CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id INTEGER);
        CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, user_id INTEGER,
                               role TEXT, content TEXT, tokens INTEGER DEFAULT 0, metadata JSON,
                               created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, summary TEXT,
                                             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO conversations VALUES ('mine', 1), ('theirs', 2);
        INSERT INTO messages (id, conversation_id, user_id, role, content)
          VALUES ('m1','mine',1,'user','MY SECRET'), ('t1','theirs',2,'user','THEIR SECRET');
        INSERT INTO conversation_summaries (conversation_id, summary)
          VALUES ('mine','MY SUMMARY'), ('theirs','THEIR SUMMARY');
    """)
    conn.commit()

    from contextlib import contextmanager

    @contextmanager
    def fake_ctx():
        yield conn

    monkeypatch.setattr(history, "db_ctx", fake_ctx)
    monkeypatch.setattr(summaries, "db_ctx", fake_ctx)
    yield conn
    conn.close()


def test_recent_turns_are_owner_scoped(db):
    assert [m["content"] for m in history.get_recent_turns("theirs", USER)] == []
    assert [m["content"] for m in history.get_recent_turns("mine", USER)] == ["MY SECRET"]


def test_conversation_messages_are_owner_scoped(db):
    assert history.get_conversation_messages("theirs", USER) == []
    assert [m["content"] for m in history.get_conversation_messages("mine", USER)] == ["MY SECRET"]


def test_summary_is_owner_scoped(db):
    assert summaries.get_summary("theirs", USER) is None
    assert summaries.get_summary("mine", USER) == "MY SUMMARY"


def test_summary_write_refuses_another_users_conversation(db):
    """A write into someone else's conversation is worse than a read, so save_summary checks."""
    assert summaries.save_summary("theirs", USER, "INJECTED") is False
    assert summaries.get_summary("theirs", OTHER) == "THEIR SUMMARY"   # untouched
    assert summaries.save_summary("mine", USER, "UPDATED") is True
    assert summaries.get_summary("mine", USER) == "UPDATED"


def test_unsummarized_messages_are_owner_scoped(db):
    assert summaries.get_unsummarized_messages("theirs", USER) == []


def test_should_summarize_is_owner_scoped(db):
    """False for a conversation the caller does not own — it must not even count tokens for it."""
    assert summaries.should_summarize("theirs", USER, threshold=0) is False
