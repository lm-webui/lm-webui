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

            # 3. Context (file references + web search)
            context = ""
            if chat_request.file_references:
                context = self._get_file_context(chat_request.file_references)

            # 3b. Web search — inject results as context when search mode is enabled
            if chat_request.webSearch and chat_request.message.strip():
                try:
                    import requests
                    from urllib.parse import quote
                    import re
                    query = chat_request.message.strip()[:200]
                    # Use DuckDuckGo HTML search for real web results
                    resp = requests.post(
                        "https://html.duckduckgo.com/html/",
                        data={"q": query},
                        headers={"User-Agent": "Mozilla/5.0"},
                        timeout=10,
                    )
                    if resp.status_code == 200:
                        results = []
                        # Extract result blocks: <a rel="nofollow" href="...">title</a>
                        for a_tag in re.findall(r'<a rel="nofollow" href="(https?://[^"]+)"[^>]*>(.*?)</a>', resp.text):
                            url, title = a_tag
                            title = re.sub(r'<[^>]+>', '', title).strip()
                            results.append(f"- [{title}]({url})")
                            if len(results) >= 5:
                                break
                        if results:
                            context += ("\n\n" if context else "") + "Web search results:\n" + "\n".join(results)
                            logger.info(f"Web search returned {len(results)} results for: {query[:60]}...")
                        else:
                            logger.warning(f"Web search returned 0 results for: {query[:60]}...")
                    else:
                        logger.warning(f"Web search returned status {resp.status_code}")
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
            try:
                import asyncio
                if hasattr(provider, '_session') and provider._session and not provider._session.closed:
                    asyncio.ensure_future(provider._session.close())
            except Exception:
                pass
            yield ModelEvent.done()
            
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

    def _construct_messages(self, user_message: str, context: str, conversation_id: str, system_prompt: str = "") -> list:
        """Construct messages with history, summary, and context."""
        messages = []

        # System Prompt — use user's custom prompt if set, otherwise default
        system_prompt = system_prompt or "You are a helpful AI assistant."
        if context:
            system_prompt += f"\n\nWeb search results are provided below. Use them to answer the user's question factually. If the results contain relevant information, cite them in your answer. If the results don't contain enough information, say so and use your own knowledge.\n\n{context}"
            
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
