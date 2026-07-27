"""
Chat Session Manager

Prevents parallel stream_chat calls per session and manages cancellation.
Follows prompt32.md requirements for concurrency prevention.
"""
import asyncio
import uuid
from typing import Dict, Optional, Set
from datetime import datetime, timedelta


class ChatSession:
    """Represents a chat session with streaming state"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.is_streaming = False
        self.abort_controller = None  # Can be used for provider-specific cancellation
        self.job_id: Optional[str] = None
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.active_tasks: Set[str] = set()  # Track task IDs for cleanup
    
    def start_streaming(self, job_id: str) -> bool:
        """Start streaming if not already streaming"""
        if self.is_streaming:
            return False
        self.is_streaming = True
        self.job_id = job_id
        self.last_activity = datetime.now()
        return True
    
    def stop_streaming(self):
        """Stop streaming"""
        self.is_streaming = False
        self.job_id = None
        self.last_activity = datetime.now()
        self.active_tasks.clear()
    
    def cancel(self):
        """Cancel the session"""
        self.is_streaming = False
        self.job_id = None
        self.active_tasks.clear()
    
    def is_expired(self, max_age_seconds: int = 3600) -> bool:
        """Check if session has expired"""
        return (datetime.now() - self.last_activity).seconds > max_age_seconds
    
    def add_task(self, task_id: str):
        """Add an active task to the session"""
        self.active_tasks.add(task_id)
    
    def remove_task(self, task_id: str):
        """Remove a completed task from the session"""
        self.active_tasks.discard(task_id)


class ChatSessionManager:
    """
    Manages chat sessions to prevent parallel stream_chat calls per session.
    
    Responsibilities per prompt32.md:
    - One active stream per session
    - Maintain session.is_streaming flag
    - Maintain abort_controller
    - Prevent parallel stream_chat calls
    - Ensure done event always emitted once
    """
    
    def __init__(self):
        self.sessions: Dict[str, ChatSession] = {}
    
    def get_session(self, session_id: str) -> ChatSession:
        """Get or create a session"""
        if session_id not in self.sessions:
            self.sessions[session_id] = ChatSession(session_id)
        return self.sessions[session_id]
    
    def can_start_streaming(self, session_id: str) -> bool:
        """Check if a new stream can be started for this session"""
        session = self.get_session(session_id)
        return not session.is_streaming
    
    def start_streaming(self, session_id: str, job_id: Optional[str] = None) -> bool:
        """
        Start streaming for a session.
        Returns True if successful, False if already streaming.
        """
        session = self.get_session(session_id)
        if session.is_streaming:
            return False
        
        if job_id is None:
            job_id = f"job_{uuid.uuid4()}"
        
        session.start_streaming(job_id)
        return True
    
    def stop_streaming(self, session_id: str):
        """Stop streaming for a session"""
        session = self.sessions.get(session_id)
        if session:
            session.stop_streaming()
    
    def cancel_session(self, session_id: str) -> bool:
        """Cancel a session and return True if it was active"""
        session = self.sessions.get(session_id)
        if session:
            was_streaming = session.is_streaming
            session.cancel()
            return was_streaming
        return False
    
    def cleanup_session(self, session_id: str):
        """Remove a session from memory"""
        self.sessions.pop(session_id, None)
    
    def cleanup_expired_sessions(self, max_age_seconds: int = 3600):
        """Clean up expired sessions"""
        expired = []
        for session_id, session in self.sessions.items():
            if session.is_expired(max_age_seconds):
                expired.append(session_id)
        
        for session_id in expired:
            self.cleanup_session(session_id)
        
        return len(expired)

    def get_active_sessions(self) -> Dict[str, Dict[str, any]]:
        """Get information about active sessions"""
        result = {}
        for session_id, session in self.sessions.items():
            if session.is_streaming:
                result[session_id] = {
                    "job_id": session.job_id,
                    "created_at": session.created_at.isoformat(),
                    "last_activity": session.last_activity.isoformat(),
                    "active_tasks": len(session.active_tasks)
                }
        return result


# Global session manager instance
_chat_session_manager = None

def get_chat_session_manager() -> ChatSessionManager:
    """Get global chat session manager instance"""
    global _chat_session_manager
    if _chat_session_manager is None:
        _chat_session_manager = ChatSessionManager()
    return _chat_session_manager