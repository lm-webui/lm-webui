"""
Chat Request Schemas and Exceptions

Defines the ChatRequest dataclass and RAGContextError as specified in prompt32.md.
"""
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
import uuid


@dataclass
class ChatRequest:
    """Chat request following prompt32.md format"""
    sessionId: str
    message: str
    model: str
    provider: Optional[str] = "openai"
    file_references: Optional[List[dict]] = None
    metadata: Optional[Dict[str, Any]] = None
    # Reasoning-specific fields
    conversationId: Optional[str] = None
    webSearch: Optional[bool] = False
    searchProvider: Optional[str] = "duckduckgo"
    projectId: Optional[str] = None
    isImageMode: Optional[bool] = False
    
    def __post_init__(self):
        """Generate job_id for tracking"""
        self.job_id = f"job_{uuid.uuid4()}"
        # Ensure metadata includes reasoning fields for backward compatibility
        if self.metadata is None:
            self.metadata = {}
        if self.conversationId and "conversationId" not in self.metadata:
            self.metadata["conversationId"] = self.conversationId
        if "webSearch" not in self.metadata:
            self.metadata["webSearch"] = self.webSearch
        if "searchProvider" not in self.metadata:
            self.metadata["searchProvider"] = self.searchProvider
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ChatRequest':
        """Create ChatRequest from dictionary (WebSocket message)"""
        # Extract reasoning-specific fields
        conversationId = data.get("conversationId")
        webSearch = data.get("webSearch", False)
        searchProvider = data.get("searchProvider", "duckduckgo")
        
        # Get metadata if provided
        metadata = data.get("metadata", {})
        # Merge reasoning fields into metadata for backward compatibility
        if conversationId and "conversationId" not in metadata:
            metadata["conversationId"] = conversationId
        if "webSearch" not in metadata:
            metadata["webSearch"] = webSearch
        if "searchProvider" not in metadata:
            metadata["searchProvider"] = searchProvider
        
        return cls(
            sessionId=data["sessionId"],
            message=data["message"],
            model=data.get("model", "gpt-4.1-mini"),
            provider=data.get("provider", "openai"),
            file_references=data.get("file_references"),
            metadata=metadata,
            conversationId=conversationId,
            webSearch=webSearch,
            searchProvider=searchProvider,
        )


class RAGContextError(Exception):
    """Raised when RAG is required but no documents found"""
    def __init__(self, message: str = "No relevant documents found"):
        super().__init__(message)
        self.message = message


class ChatValidationError(Exception):
    """Raised when chat request validation fails"""
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class RAGResult:
    """Structured RAG result for validation"""
    documents: List[str]
    context: str
    source_count: int
    
    @property
    def has_documents(self) -> bool:
        return len(self.documents) > 0 and any(doc.strip() for doc in self.documents)
    
    @classmethod
    def from_context(cls, context: str) -> 'RAGResult':
        """Create RAGResult from context string"""
        documents = [context] if context.strip() else []
        return cls(
            documents=documents,
            context=context,
            source_count=len(documents)
        )