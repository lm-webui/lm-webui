"""
WebSocket Protocol Layer - Production Ready

Provides WebSocket endpoints following prompt32.md architecture:
- Full WebSocket for client ↔ backend
- No SSE, no mixed streaming paths
- Transport layer only, no business logic
"""
import asyncio
import logging
from typing import Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from app.security.auth.dependencies import get_current_user
from app.orchestrator.controller import get_orchestrator
from app.chat.schemas import ChatRequest
from app.chat.events import ModelEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ws")


async def websocket_chat(
    websocket: WebSocket,
    user_id: int = Depends(get_current_user)
):
    """
    Production WebSocket endpoint for streaming chat following prompt32.md
    
    Protocol format:
    - Send: {"type": "chat", "sessionId": "...", "message": "...", "model": "..."}
    - Send: {"type": "cancel", "sessionId": "..."}
    - Receive: ModelEvent objects (typing, token, error, done, cancelled)
    
    Transport layer only - delegates all business logic to OrchestratorController.
    """
    await websocket.accept()
    
    # Extract user ID
    user_id_int = user_id
    if isinstance(user_id, dict):
        user_id_int = user_id.get("id") or user_id.get("user_id")
    
    # Get orchestrator
    controller = get_orchestrator()
    
    try:
        # Send connection confirmation
        await safe_send_json(websocket, {
            "type": "connection_established",
            "user_id": user_id_int,
            "timestamp": int(asyncio.get_event_loop().time() * 1000)
        })
        
        while True:
            # Receive message with timeout
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=300  # 5 minute timeout
                )
            except asyncio.TimeoutError:
                # Send heartbeat check
                await safe_send_json(websocket, {
                    "type": "heartbeat_required",
                    "message": "Please respond to maintain connection"
                })
                continue
            
            message_type = data.get("type")
            
            if message_type == "chat":
                await _handle_chat_message(websocket, data, controller, user_id_int)
                
            elif message_type == "cancel":
                await _handle_cancel_message(websocket, data, controller)
                
            elif message_type == "heartbeat":
                await safe_send_json(websocket, {
                    "type": "heartbeat_response",
                    "timestamp": int(asyncio.get_event_loop().time() * 1000)
                })
                
            else:
                await safe_send_json(websocket, ModelEvent.error(
                    f"Unknown message type: {message_type}"
                ).to_dict())
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id_int}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id_int}: {str(e)}")
        try:
            await safe_send_json(websocket, ModelEvent.error(
                f"Connection error: {str(e)}"
            ).to_dict())
        except:
            pass


async def _handle_chat_message(
    websocket: WebSocket,
    data: Dict[str, Any],
    controller,
    user_id: int
) -> None:
    """Handle chat message following prompt32.md format"""
    try:
        # Validate required fields
        if not data.get("sessionId"):
            await safe_send_json(websocket, ModelEvent.error(
                "Missing sessionId"
            ).to_dict())
            return
        
        if not data.get("message"):
            await safe_send_json(websocket, ModelEvent.error(
                "Missing message"
            ).to_dict())
            return
        
        # Create ChatRequest
        request = ChatRequest.from_dict(data)
        
        # Get conversation_id from request or data
        conversation_id = request.conversationId or data.get("conversationId")
        
        # Process through controller with user_id and conversation_id
        async for event in controller.process_request(request, user_id, conversation_id):
            await safe_send_json(websocket, event.to_dict())
            
    except Exception as e:
        logger.error(f"Chat message handling error: {e}")
        await safe_send_json(websocket, ModelEvent.error(
            f"Message processing error: {str(e)}"
        ).to_dict())


async def _handle_cancel_message(
    websocket: WebSocket,
    data: Dict[str, Any],
    controller
) -> None:
    """Handle cancel message"""
    try:
        session_id = data.get("sessionId")
        if not session_id:
            await safe_send_json(websocket, ModelEvent.error(
                "Missing sessionId for cancel"
            ).to_dict())
            return
        
        # Cancel the session
        was_cancelled = await controller.cancel_chat(session_id)
        
        if was_cancelled:
            await safe_send_json(websocket, ModelEvent.cancelled().to_dict())
        else:
            await safe_send_json(websocket, ModelEvent.error(
                "Session not found or not streaming"
            ).to_dict())
            
    except Exception as e:
        logger.error(f"Cancel message handling error: {e}")
        await safe_send_json(websocket, ModelEvent.error(
            f"Cancel error: {str(e)}"
        ).to_dict())


async def safe_send_json(websocket: WebSocket, data: Dict[str, Any]) -> bool:
    """
    Safely send JSON to a websocket, handling disconnections gracefully.
    
    Returns True if successful, False if connection is closed.
    """
    try:
        # Check basic state
        if (websocket.client_state.name == "DISCONNECTED" or 
            websocket.application_state.name == "DISCONNECTED"):
            return False
            
        await websocket.send_json(data)
        return True
    except (RuntimeError, WebSocketDisconnect):
        # Connection closed during send
        return False
    except Exception as e:
        # Other errors (e.g. serialization)
        logger.error(f"WebSocket send error: {e}")
        return False


# Health check endpoint for monitoring
@router.get("/health")
async def websocket_health():
    """WebSocket service health check"""
    controller = get_orchestrator()
    
    return {
        "status": "healthy",
        "endpoints": {
            "chat": "/ws/chat",
            "multimodal": "/ws/multimodal"
        },
        "architecture": "prompt32.md compliant",
        "transport": "WebSocket only",
        "streaming": "ModelEvent based"
    }


@router.get("/capabilities")
async def websocket_capabilities(
    user_id: int = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get WebSocket streaming capabilities with new architecture
    """
    return {
        "user_id": user_id,
        "endpoints": {
            "chat_streaming": "/ws/chat",
            "multimodal_analysis": "/ws/multimodal"
        },
        "protocol": {
            "message_format": {
                "chat": '{"type": "chat", "sessionId": "...", "message": "...", "model": "..."}',
                "cancel": '{"type": "cancel", "sessionId": "..."}'
            },
            "event_types": ["typing", "token", "error", "complete", "cancelled"],
            "timeout": 300,
            "heartbeat_support": True
        },
        "features": {
            "rag_integration": True,
            "anti_hallucination": True,
            "concurrency_prevention": True,
            "cancellation_support": True,
            "unified_provider_interface": True
        },
        "supported_providers": [
            "openai", "claude", "gemini", "grok",
            "deepseek", "lmstudio", "ollama", "gguf"
        ]
    }