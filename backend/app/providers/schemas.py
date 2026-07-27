"""
Provider Schemas
Defines the data structures for the Provider Interface.
"""
from typing import List, Dict, Optional, Any, Union
from pydantic import BaseModel, Field
from app.chat.events import ModelEvent

class ModelMetadata(BaseModel):
    """Metadata for a model available from a provider."""
    id: str
    name: str
    provider: str
    context_window: int = 4096
    supports_vision: bool = False
    type: str = "chat"  # chat, embedding, image
    
    # Hardware compatibility (optional, primarily for local models)
    hardware_compatibility: Optional[Dict[str, Any]] = None
    path: Optional[str] = None # For local models

class GenerateRequest(BaseModel):
    """Request structure for generation."""
    model: str
    messages: List[Dict[str, str]]
    api_key: Optional[str] = None
    max_tokens: int = 4000
    temperature: float = 0.7
    top_p: Optional[float] = None
    stream: bool = False
    stop: Optional[List[str]] = None
    
    # Additional parameters
    metadata: Optional[Dict[str, Any]] = None

class GenerateResponse(BaseModel):
    """Response structure for non-streaming generation."""
    content: str
    usage: Optional[Dict[str, int]] = None
    finish_reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
