"""
Unified Chat Route
Single entry point with ChatGPT-style architecture using ModelRegistry
Implements: UI history ≠ LLM context ≠ Memory ≠ RAG
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
import logging
import json

from app.security.auth.dependencies import get_current_user
from app.orchestrator.controller import get_orchestrator
from app.chat.schemas import ChatRequest
from app.chat.events import ModelEvent
from app.chat.service import save_message
from app.services.formatter import format_llm_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")

# ... (Helper functions like extract_file_issues_from_context, build_prompt etc can be removed if unused) ...

@router.post("")
async def chat_completion(
    request: dict,
    raw_request: Request,
    user_id: dict = Depends(get_current_user)
):
    """
    Single chat completion endpoint using Orchestrator (v2.0)
    """
    # Lazy load components from app state
    # DEBUG: Log all received parameters
    logger.debug(f"📡 Chat request received: {request}")
    
    message = request.get("message", "")
    if not message:
        raise HTTPException(400, "Message is required")

    user_id_int = user_id["id"]
    
    try:
        # Get Orchestrator
        orchestrator = get_orchestrator()
        
        # Prepare Request Object - ensure model is never None
        model = request.get("model") or "gpt-4.1-mini"
            
        chat_req = ChatRequest(
            message=message,
            sessionId=request.get("session_id") or "rest-session", # Fallback
            model=model,
            provider=request.get("provider", "openai"),
            conversationId=request.get("conversation_id"),
            webSearch=request.get("web_search", False),
            file_references=request.get("file_references", []),
            isImageMode=request.get("is_image_mode", False),
        )
        
        # Determine Conversation ID (or let orchestrator handle it, but we need it for response)
        # The orchestrator handles ensure_conversation_exists, but returns a stream.
        # We need to capture the conversation_id. 
        # Currently Orchestrator uses passed ID or generates one from sessionId.
        conversation_id = chat_req.conversationId
        
        # Process Request (Collect Stream)
        full_response = ""
        generated_image_url = None
        sources_payload = {"context_used": {}, "sources": [], "retrieved_images": []}

        actual_conversation_id = conversation_id

        # Collect the stream; raise a 500 only AFTER the generator closes so the
        # orchestrator's async generator isn't aborted mid-iteration (avoiding
        # "async generator ignored GeneratorExit" + unhandled task exceptions).
        error_msg = None
        async for event in orchestrator.process_request(chat_req, user_id_int, conversation_id or "new"):
            if event.type == "token" and event.content:
                full_response += event.content
            elif event.type == "image" and event.data:
                generated_image_url = event.data.get("image_url")
            elif event.type == "metadata" and event.content:
                if isinstance(event.content, dict):
                    cid = event.content.get("conversation_id")
                    if cid:
                        actual_conversation_id = cid
            elif event.type == "sources" and event.data:
                sources_payload = event.data
            elif event.type == "error":
                error_msg = event.content
                break

        if error_msg:
            raise HTTPException(500, f"Orchestrator error: {error_msg}")

        # Post-processing (Formatting)
        if not request.get("show_raw_response", False):
            try:
                full_response = format_llm_response(text=full_response, model_type=chat_req.provider)
            except Exception:
                pass

        return {
            "response": full_response,
            "conversation_id": actual_conversation_id,
            "image_url": generated_image_url,
            "context_used": sources_payload["context_used"],
            "sources": sources_payload["sources"],
            "retrieved_images": sources_payload["retrieved_images"],
        }
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(500, f"LLM error: {str(e)}")


@router.post("/stream")
async def chat_stream(
    request: dict,
    user_id: dict = Depends(get_current_user),
):
    """Server-Sent-Events streaming chat. Yields each ModelEvent as an SSE data frame.

    Consumers read `data: {event.to_json()}` lines; event types include status, sources,
    token, image, error, complete.
    """
    message = request.get("message", "")
    if not message:
        raise HTTPException(400, "Message is required")
    user_id_int = user_id["id"]

    chat_req = ChatRequest(
        message=message,
        sessionId=request.get("session_id") or "rest-session",
        model=request.get("model") or "gpt-4.1-mini",
        provider=request.get("provider", "openai"),
        conversationId=request.get("conversation_id"),
        webSearch=request.get("web_search", False),
        file_references=request.get("file_references", []),
    )

    orchestrator = get_orchestrator()
    conversation_id = chat_req.conversationId or "new"

    async def event_stream():
        try:
            async for event in orchestrator.process_request(chat_req, user_id_int, conversation_id):
                yield f"data: {event.to_json()}\n\n"
        except Exception as exc:
            logger.error(f"Stream error: {exc}")
            yield f"data: {ModelEvent.error(str(exc)).to_json()}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
