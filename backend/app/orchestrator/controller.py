"""
Orchestrator Controller
Coordinates chat flow: Session → Context → Generation → Persistence.
"""
import logging
import asyncio
import time
from typing import AsyncGenerator, Optional, Dict, Any, List
from app.providers.schemas import ModelEvent
from app.providers.factory import ProviderFactory
from app.database import get_db
from app.chat.schemas import ChatRequest
from app.chat.session_manager import get_chat_session_manager
from app.chat.service import (
    ensure_conversation_exists,
    save_message,
    should_summarize_conversation,
)
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

        provider = None
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

            provider = ProviderFactory.get_provider(provider_id or "", base_url=base_url) if base_url else ProviderFactory.get_provider(provider_id or "")
            if not provider:
                yield ModelEvent.error(f"Provider {provider_id} not available")
                return
            # Debug: log provider api_base to catch key-vs-URL confusion
            api_base = getattr(provider, '_api_base', 'unknown')
            logger.info(f"Provider {provider_id} api_base: {api_base[:80] if api_base else 'None'}")

            # Follow-up: if this request carries no file refs, fall back to the conversation's
            # persisted attachments (metadata.attachments) so a later vision/RAG question about a
            # previously attached file works without re-attaching.
            if not chat_request.file_references and actual_conversation_id:
                try:
                    from app.chat.service import get_conversation_messages
                    persisted = []
                    for m in get_conversation_messages(actual_conversation_id) or []:
                        att = (m.get("metadata") or {}).get("attachments")
                        if isinstance(att, list):
                            persisted.extend(att)
                    if persisted:
                        chat_request.file_references = persisted
                except Exception:
                    pass  # fall back to no file refs

            # 3. Smart-Modality — plan which capabilities this request needs, then
            # execute the context-building capabilities (file-context/retrieve/search/vision).
            from app.modality import plan as modality_plan
            exec_plan = modality_plan(
                message=chat_request.message,
                file_references=chat_request.file_references,
                web_search=bool(chat_request.webSearch),
                image_mode=bool(getattr(chat_request, "isImageMode", False)),
            )

            from app.capabilities import CapabilityContext, execute_plan as run_capabilities
            ctx = CapabilityContext(
                chat_request=chat_request,
                user_id=user_id,
                provider_id=provider_id or "",
                model_id=model_id or "",
                provider=provider,
                conversation_id=actual_conversation_id,
            )
            await run_capabilities(exec_plan, ctx)

            # Vision not ready → surface a clear notice as streamed text (not a fatal error),
            # and continue so the text question is still answered.
            if exec_plan.vision and not getattr(ctx, "vision_ready", False) and getattr(ctx, "images", None):
                yield ModelEvent.token(
                    "⚠️ Vision isn't ready — install a vision model (main GGUF + mmproj) and set it as your "
                    "default vision model in Settings → Inference, then ensure llama-server is available. "
                    "Your message was answered without image analysis.\n\n"
                )

            # Load user inference preferences from DB
            try:
                db = get_db()
                row = db.execute(
                    "SELECT settings_json FROM user_settings WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                if row and row[0]:
                    import json as _json
                    prefs = _json.loads(row[0])
                    ctx.system_prompt = prefs.get("systemPrompt", "")
                    ctx.temperature = prefs.get("temperature", 0.7)
                    ctx.max_tokens = prefs.get("max_tokens", prefs.get("maxTokens", 4000))
                    if prefs.get("topP") is not None:
                        ctx.top_p = prefs["topP"]
            except Exception:
                pass  # fall back to defaults

            # Check for project-level system prompt override (from conversation metadata)
            project_id = None
            try:
                db = get_db()
                row = db.execute(
                    "SELECT metadata FROM conversations WHERE id = ?",
                    (actual_conversation_id,),
                ).fetchone()
                if row and row[0]:
                    import json as _json2
                    project_id = _json2.loads(row[0]).get("project_id")
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
                        ctx.system_prompt = proj[0]
                except Exception:
                    pass  # fall back to global prompt

            # 4/5. Image-generation intent — invoke the shared image engine, yield the
            # result as an "image" event (chat renders it; Image Studio stays the owner).
            if exec_plan.diffusion:
                from app.capabilities.image_gen import execute as image_gen_execute
                gen = await image_gen_execute(ctx)
                if gen.image_url:
                    yield ModelEvent(type="image", data={"image_url": gen.image_url, "prompt": chat_request.message})
                    # persist the generated image reference as the assistant reply
                    save_message(
                        actual_conversation_id,
                        user_id,
                        "assistant",
                        f"Generated image: {chat_request.message[:80]}",
                        metadata={"generatedImageUrl": gen.image_url},
                        model=model_id,
                        provider=provider_id,
                    )
                else:
                    yield ModelEvent.error("Image generation failed. Check your image provider.")
                return

            # 4/5. Build messages + request via the chat capability, then stream.
            from app.capabilities import chat_execute
            from app.capabilities.base import get_user_api_key
            ctx.api_key = get_user_api_key(user_id, provider_id or "")
            provider_to_use, req = await chat_execute(ctx)

            response_content = ""
            try:
                async for event in provider_to_use.stream(req):
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
                    input_tokens=sum(estimate_tokens(str(m.get("content", ""))) for m in ctx.messages),
                    output_tokens=estimate_tokens(response_content),
                    duration_ms=int((time.monotonic() - usage_started) * 1000),
                )

            # 7. Background Task: rolling conversation summary.
            # Runs after the response streams, in a separate asyncio task (the GGUF
            # inference inside is thread-offloaded), so it never blocks the reply.
            if should_summarize_conversation(actual_conversation_id):
                try:
                    from app.chat.service import generate_conversation_summary_llm, get_last_n_messages
                    hist = get_last_n_messages(actual_conversation_id, n=20)
                    asyncio.create_task(
                        generate_conversation_summary_llm(actual_conversation_id, hist, user_id)
                    )
                except Exception as exc:
                    logger.warning("Summary scheduling failed: %s", exc)

        finally:
            self.session_manager.stop_streaming(chat_request.sessionId)
            # Clean up provider's aiohttp session to avoid unclosed connector warnings
            # (asyncio is imported at module scope — no local import, or it would make
            # `asyncio` a function-local name and break earlier asyncio.to_thread calls).
            try:
                session = getattr(provider, '_session', None)
                if session and not session.closed:
                    asyncio.ensure_future(session.close())
            except Exception:
                pass
            yield ModelEvent.done()

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
