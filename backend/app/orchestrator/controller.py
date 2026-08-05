"""
Orchestrator Controller
Coordinates chat flow: Session → Context → Generation → Persistence.
"""
import logging
import asyncio
import time
from typing import AsyncGenerator, Optional, Dict, Any, List
from app.providers.schemas import ModelEvent, GenerateRequest
from app.providers.factory import ProviderFactory
from app.chat.schemas import ChatRequest
from app.chat.session_manager import get_chat_session_manager
from app.chat.service import (
    ensure_conversation_exists,
    save_message,
    get_last_n_messages,
    get_conversation_summary,
    should_summarize_conversation,
)
from app.chat.service import generate_conversation_summary_llm
from app.services.usage_tracking import record_usage, estimate_tokens

logger = logging.getLogger(__name__)

class OrchestratorController:
    """
    Central controller for handling chat interactions.
    """

    def __init__(self):
        self.session_manager = get_chat_session_manager()

    async def process_request(self,
                            chat_request: ChatRequest,
                            user_id: int,
                            conversation_id: str) -> AsyncGenerator[ModelEvent, None]:
        """
        Process a chat request through the full pipeline.
        """
        logger.info(f"Orchestrator processing request: {chat_request.sessionId}")
        usage_started = time.monotonic()

        # 1. Session & Conversation Management
        if not self.session_manager.start_streaming(chat_request.sessionId, chat_request.job_id):
            yield ModelEvent.error("Session already streaming")
            return

        try:
            # Ensure conversation exists
            actual_conversation_id = ensure_conversation_exists(
                conversation_id or chat_request.conversationId or chat_request.sessionId,
                user_id
            )

            # Yield metadata event with actual conversation ID
            yield ModelEvent.metadata({
                "conversation_id": actual_conversation_id,
                "session_id": chat_request.sessionId
            })

            # Save user message
            save_message(
                actual_conversation_id,
                user_id,
                "user",
                chat_request.message,
                {"attachments": chat_request.file_references} if chat_request.file_references else None,
                model=chat_request.model,
                provider=chat_request.provider
            )

            yield ModelEvent.typing()

            # 2. Provider Resolution (direct from request, no routing layer)
            provider_id = chat_request.provider
            model_id = chat_request.model

            # Check if user has a custom base URL stored (e.g. custom Ollama instance)
            base_url = None
            if provider_id == "ollama":
                from app.database import get_db
                from app.security.encryption import decrypt_key
                db = get_db()
                row = db.execute(
                    "SELECT base_url FROM api_keys WHERE user_id = ? AND provider = ?",
                    (user_id, "ollama"),
                ).fetchone()
                if row and row[0]:
                    try:
                        base_url = decrypt_key(row[0])
                    except Exception:
                        base_url = row[0]  # fallback: use raw value

            provider = ProviderFactory.get_provider(provider_id, base_url=base_url) if base_url else ProviderFactory.get_provider(provider_id)
            if not provider:
                yield ModelEvent.error(f"Provider {provider_id} not available")
                return
            # Debug: log provider api_base to catch key-vs-URL confusion
            api_base = getattr(provider, '_api_base', 'unknown')
            logger.info(f"Provider {provider_id} api_base: {api_base[:80] if api_base else 'None'}")

            # 3. Context (RAG retrieval + web search)
            context = ""
            if chat_request.file_references:
                context = self._get_file_context(chat_request.file_references)
            elif chat_request.requires_rag:
                # Optional query rewriting (#3, config-gated) — runs async on the loop
                # so short/pronoun-heavy follow-ups embed a self-contained query.
                rag_query = chat_request.message
                try:
                    from app.core.config_manager import get_config as _get_cfg
                    rag_cfg = _get_cfg().rag
                except Exception:
                    rag_cfg = None
                if rag_cfg is not None and getattr(rag_cfg, "query_rewrite", False) and actual_conversation_id:
                    try:
                        from app.chat.service import get_last_n_messages
                        from app.rag.query_rewriter import rewrite_query

                        _key = self._get_user_api_key(user_id, provider_id)
                        history = get_last_n_messages(actual_conversation_id, n=6)
                        rag_query = await rewrite_query(
                            chat_request.message, history, provider, model_id, _key
                        )
                    except Exception as exc:
                        logger.warning("Query rewrite skipped: %s", exc)
                        rag_query = chat_request.message
                # Run the blocking RAG retrieval (embed + vector search + rerank) in a
                # worker thread so it doesn't stall the FastAPI event loop.
                context = await asyncio.to_thread(self._retrieve_context, rag_query, user_id, actual_conversation_id)

            # 3b. Web search — inject results as context when search mode is enabled.
            # Uses the configured search engine (default duckduckgo), with SearXNG
            # and other providers available via the search registry.
            if chat_request.webSearch and chat_request.message.strip():
                try:
                    query = chat_request.message.strip()[:200]
                    engine = self._get_search_engine(user_id)
                    from app.search import get_search_provider
                    provider = get_search_provider(engine)
                    results = await provider.search(query)
                    if results:
                        lines = [
                            f"- [{r.title}]({r.url})" + (f" — {r.snippet}" if r.snippet else "")
                            for r in results
                        ]
                        context += ("\n\n" if context else "") + "Web search results:\n" + "\n".join(lines)
                        logger.info(f"Web search ({provider.name}) returned {len(results)} results for: {query[:60]}...")
                    else:
                        logger.warning(f"Web search ({provider.name}) returned 0 results for: {query[:60]}...")
                except Exception as e:
                    logger.warning(f"Web search failed: {e}")

            # Load user inference preferences from DB
            user_system_prompt = ""
            user_temperature = 0.7
            user_max_tokens = 4000
            user_top_p = None
            try:
                db = get_db()
                row = db.execute(
                    "SELECT settings_json FROM user_settings WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                if row and row[0]:
                    import json as _json
                    prefs = _json.loads(row[0])
                    user_system_prompt = prefs.get("systemPrompt", "")
                    user_temperature = prefs.get("temperature", user_temperature)
                    user_max_tokens = prefs.get("max_tokens", prefs.get("maxTokens", user_max_tokens))
                    if prefs.get("topP") is not None:
                        user_top_p = prefs["topP"]
            except Exception:
                pass  # fall back to defaults

            # Check for project-level system prompt override (from conversation metadata)
            project_id = None
            try:
                row = db.execute(
                    "SELECT metadata FROM conversations WHERE id = ?",
                    (actual_conversation_id,),
                ).fetchone()
                if row and row[0]:
                    import json as _json2
                    conv_meta = _json2.loads(row[0])
                    project_id = conv_meta.get("project_id")
            except Exception:
                pass
            if project_id:
                try:
                    db = get_db()
                    proj = db.execute(
                        "SELECT system_prompt FROM projects WHERE id = ? AND user_id = ?",
                        (project_id, user_id),
                    ).fetchone()
                    if proj:
                        user_system_prompt = proj[0]
                except Exception:
                    pass  # fall back to global prompt

            # 4. Prompt Construction (History + Context + custom system prompt)
            messages = self._construct_messages(
                chat_request.message,
                context,
                actual_conversation_id,
                system_prompt=user_system_prompt,
            )

            # 5. Generation
            # Resolve API key from user's stored keys
            from app.database import get_db as _get_db
            _db = _get_db()
            _row = _db.execute(
                "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, provider_id),
            ).fetchone()
            _api_key = _row[0] if _row else None

            req = GenerateRequest(
                model=model_id,
                messages=messages,
                stream=True,
                max_tokens=user_max_tokens,
                temperature=user_temperature,
                top_p=user_top_p,
                api_key=_api_key,
            )

            response_content = ""
            try:
                async for event in provider.stream(req):
                    if event.type == "token" and event.content:
                        response_content += event.content
                    yield event
            except Exception as e:
                logger.error(f"Generation Error: {e}")
                yield ModelEvent.error(str(e))
                return

            # 6. Save Assistant Response
            if response_content:
                save_message(
                    actual_conversation_id,
                    user_id,
                    "assistant",
                    response_content,
                    model=model_id,
                    provider=provider_id
                )
                record_usage(
                    user_id=user_id,
                    event_type="chat",
                    provider=provider_id,
                    model=model_id,
                    input_tokens=sum(estimate_tokens(str(m.get("content", ""))) for m in messages),
                    output_tokens=estimate_tokens(response_content),
                    duration_ms=int((time.monotonic() - usage_started) * 1000),
                )

            # 7. Background Tasks (Summary)
            # This should ideally be offloaded to a background task queue
            if should_summarize_conversation(actual_conversation_id):
                # Placeholder: Trigger summary generation
                pass

        finally:
            self.session_manager.stop_streaming(chat_request.sessionId)
            # Clean up provider's aiohttp session to avoid unclosed connector warnings
            # (asyncio is imported at module scope — no local import, or it would make
            # `asyncio` a function-local name and break earlier asyncio.to_thread calls).
            try:
                if hasattr(provider, '_session') and provider._session and not provider._session.closed:
                    asyncio.ensure_future(provider._session.close())
            except Exception:
                pass
            yield ModelEvent.done()

    def _get_user_api_key(self, user_id: int, provider_id: str) -> str | None:
        """Return the user's stored API key for a provider, if any."""
        try:
            from app.database import get_db
            db = get_db()
            row = db.execute(
                "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, provider_id),
            ).fetchone()
            return row[0] if row else None
        except Exception:
            return None

    def _get_search_engine(self, user_id: int) -> str:
        """Read the user's selected search engine (default duckduckgo)."""
        try:
            from app.database import get_db
            import json as _json
            db = get_db()
            row = db.execute(
                "SELECT settings_json FROM user_settings WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if row and row[0]:
                prefs = _json.loads(row[0])
                return prefs.get("selectedSearchEngine", "duckduckgo") or "duckduckgo"
        except Exception:
            pass
        return "duckduckgo"

    async def _get_file_context(self, file_references: list) -> str:
        """Read file content from media_library for context injection."""
        from app.database import get_db
        db = get_db()
        cursor = db.cursor()
        context_parts = []
        for ref in file_references:
            file_id = ref.get("media_id") or ref.get("id")
            if file_id:
                cursor.execute(
                    "SELECT filename, file_path, extracted_text FROM media_library WHERE id = ?",
                    (file_id,)
                )
                row = cursor.fetchone()
                if row and row[2]:  # extracted_text exists
                    context_parts.append(f"--- {row[0]} ---\n{row[2]}")
        return "\n\n".join(context_parts)

    def _retrieve_context(self, user_message: str, user_id: int, conversation_id: str | None = None) -> str:
        """Retrieve relevant context using RAG pipeline (LanceDB + FlashRank).

        Falls back to empty string if RAG is not configured. When RAG is enabled
        but yields no hits, returns an explicit note so the model can say so.
        Sources are numbered [n] so the model can cite them.
        """
        try:
            from app.core.config_manager import get_config
            cfg = get_config()
            if not cfg.rag.enabled:
                return ""
        except Exception:
            return ""

        try:
            from app.rag.query_parser import extract_filters
            from app.rag.embedder import embed_query
            from app.rag.vector_store import hybrid_search
            from app.rag.reranker import rerank

            # Step 1: Extract time/document filters from query
            filters = extract_filters(user_message)

            # Step 2: Embed query
            query_vec = embed_query(user_message)

            # Step 3: Hybrid search with filters (optionally scoped to the conversation)
            scope_conv = getattr(cfg.rag, "scope", "user") == "conversation"
            candidates = hybrid_search(
                query_vec, user_message,
                filters=filters or None,
                user_id=user_id,
                top_k=getattr(cfg.rag, "top_k_retrieval", 20),
                conversation_id=conversation_id if scope_conv else None,
            )
            if not candidates:
                return "No relevant documents were found in your knowledge base for this query."

            # Step 4: Dedup candidates BEFORE reranking so the reranker's limited
            # top-k slots aren't wasted on duplicate content (#6). Use a None-safe
            # dedup key so chunks missing chunk_id aren't silently dropped (#5).
            seen: set = set()
            unique: list = []
            for c in candidates:
                cid = c.get("chunk_id") or hash(c.get("text", ""))
                if cid in seen:
                    continue
                seen.add(cid)
                unique.append(c)

            top_chunks = rerank(user_message, unique, top_k=5)
            if not top_chunks:
                top_chunks = unique[:5]

            # Step 5: Assemble under a strict token budget so the injected context
            # stays bounded (avoids overflow, cost, "lost in the middle"). Use a
            # conservative chars/token ratio (#4) that's safe for code/JSON/non-English.
            budget = getattr(cfg.rag, "context_token_budget", 3000)
            parts: list[str] = []
            used_tokens = 0
            n = 0
            for c in top_chunks:
                text = c.get("text", "")
                source = c.get("file_name", "source")
                formatted = f"[{n+1}] {source}\n{text}"
                approx = max(1, len(formatted) // 3)
                if used_tokens + approx > budget:
                    break
                used_tokens += approx
                n += 1
                parts.append(formatted)

            if not parts:
                return "No relevant documents were found in your knowledge base for this query."
            return "\n\n".join(parts)

        except Exception as exc:
            logger.warning("RAG retrieval failed: %s", exc)
            return ""

    def _construct_messages(self, user_message: str, context: str, conversation_id: str, system_prompt: str = "") -> list:
        """Construct messages with history, summary, and context."""
        messages = []

        # System Prompt — use user's custom prompt if set, otherwise default
        system_prompt = system_prompt or "You are a helpful AI assistant."
        if context:
            system_prompt += f"\n\nRelevant context is provided below (from web search or your knowledge base). Use it to answer the user's question factually, citing numbered sources as [n] where referenced. If the context doesn't contain enough information, say so and use your own knowledge.\n\n{context}"

        messages.append({"role": "system", "content": system_prompt})

        # Conversation Summary
        summary = get_conversation_summary(conversation_id)
        if summary:
            messages.append({"role": "system", "content": f"Conversation Summary: {summary}"})

        # Recent History
        history = get_last_n_messages(conversation_id, n=5)
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Current Message
        messages.append({"role": "user", "content": user_message})

        return messages

    async def cancel_chat(self, session_id: str) -> bool:
        """Cancel an active chat session"""
        return self.session_manager.cancel_session(session_id)

# Singleton access
_orchestrator = None

def get_orchestrator() -> OrchestratorController:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = OrchestratorController()
    return _orchestrator
