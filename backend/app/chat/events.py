"""
Model Event System for Unified Streaming

Defines the ModelEvent dataclass and event types as specified in prompt32.md.
All providers must yield normalized ModelEvent objects.
"""
from dataclasses import dataclass
from typing import Optional, Dict, Any
import json


@dataclass
class ModelEvent:
    """Unified event model for all provider streaming"""
    type: str  # "token", "tool_call", "tool_result", "error", "complete", "typing", "cancelled"
    content: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = {"type": self.type}
        if self.content is not None:
            result["content"] = self.content
        if self.data is not None:
            result["data"] = self.data
        return result
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict())
    
    @classmethod
    def token(cls, content: str) -> 'ModelEvent':
        """Create a token event"""
        return cls(type="token", content=content)
    
    @classmethod
    def typing(cls) -> 'ModelEvent':
        """Create a typing indicator event"""
        return cls(type="typing")
    
    @classmethod
    def done(cls) -> 'ModelEvent':
        """Create a completion event"""
        return cls(type="complete")
    
    @classmethod
    def error(cls, message: str) -> 'ModelEvent':
        """Create an error event with simple message"""
        return cls(type="error", content=message)
    
    @classmethod
    def cancelled(cls) -> 'ModelEvent':
        """Create a cancellation event"""
        return cls(type="cancelled")
    
    @classmethod
    def metadata(cls, data: Dict[str, Any]) -> 'ModelEvent':
        """Create a metadata event"""
        return cls(type="metadata", data=data)

    @classmethod
    def status(cls, stage: str, message: str) -> 'ModelEvent':
        """Create a pipeline-stage indicator event (e.g. searching web, retrieving docs)."""
        return cls(type="status", data={"stage": stage, "message": message})

    @classmethod
    def sources(cls, data: Dict[str, Any]) -> 'ModelEvent':
        """Create a structured context event (context_used + sources + retrieved_images)."""
        return cls(type="sources", data=data)


# Event type constants for type safety
EVENT_TYPES = {
    "TOKEN": "token",
    "TOOL_CALL": "tool_call", 
    "TOOL_RESULT": "tool_result",
    "ERROR": "error",
    "DONE": "complete",
    "TYPING": "typing",
    "CANCELLED": "cancelled"
}