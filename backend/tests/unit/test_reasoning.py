"""Quick tests for reasoning module - tests session management without heavy dependencies."""
import pytest
from unittest.mock import patch, MagicMock
from app.reasoning.service import ReasoningService, ReasoningSession


class TestReasoningSession:
    """Test ReasoningSession class."""
    
    def test_session_creation(self):
        """Test creating a reasoning session."""
        session = ReasoningSession("test-session-1")
        
        assert session.session_id == "test-session-1"
        assert session.conversation_id is None
        assert session.state == "active"
        assert session.steps == []
        assert session.current_step == 0
    
    def test_session_with_conversation(self):
        """Test session with conversation ID."""
        session = ReasoningSession("test-session-2", conversation_id="conv-123")
        
        assert session.session_id == "test-session-2"
        assert session.conversation_id == "conv-123"
    
    def test_add_step(self):
        """Test adding a reasoning step."""
        session = ReasoningSession("test-session-3")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "analysis", "content": "Step 1"})
        
        assert len(session.steps) == 1
        assert session.steps[0]["type"] == "analysis"
        assert session.steps[0]["content"] == "Step 1"
        assert session.steps[0]["index"] == 0
        assert "timestamp" in session.steps[0]
    
    def test_add_multiple_steps(self):
        """Test adding multiple steps."""
        session = ReasoningSession("test-session-4")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "analysis", "content": "Step 1"})
            session.add_step({"type": "reasoning", "content": "Step 2"})
            session.add_step({"type": "conclusion", "content": "Step 3"})
        
        assert len(session.steps) == 3
        assert session.current_step == 2
        assert session.steps[0]["index"] == 0
        assert session.steps[1]["index"] == 1
        assert session.steps[2]["index"] == 2
    
    def test_get_steps(self):
        """Test getting all steps."""
        session = ReasoningSession("test-session-5")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "test", "content": "A"})
            session.add_step({"type": "test", "content": "B"})
        
        steps = session.get_steps()
        assert len(steps) == 2
        assert steps[0]["content"] == "A"
        assert steps[1]["content"] == "B"
    
    def test_get_current_step(self):
        """Test getting current step."""
        session = ReasoningSession("test-session-6")
        
        # No steps yet
        assert session.get_current_step() is None
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "test", "content": "Step 1"})
            session.add_step({"type": "test", "content": "Step 2"})
        
        current = session.get_current_step()
        assert current is not None
        assert current["content"] == "Step 2"
    
    def test_to_dict(self):
        """Test converting session to dictionary."""
        session = ReasoningSession("test-session-7", conversation_id="conv-456")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "test", "content": "Step"})
        
        data = session.to_dict()
        
        assert data["session_id"] == "test-session-7"
        assert data["state"] == "active"
        assert len(data["steps"]) == 1
        assert data["total_steps"] == 1
        assert "created_at" in data
    
    def test_callback_registration(self):
        """Test callback registration and emission."""
        session = ReasoningSession("test-session-8")
        
        callback_results = []
        
        def test_callback(event_type, data):
            callback_results.append((event_type, data))
        
        session.register_callback(test_callback)
        
        with patch('app.reasoning.service.save_reasoning_step'):
            session.add_step({"type": "test", "content": "Step"})
        
        # Callback should have been called
        assert len(callback_results) == 1
        assert callback_results[0][0] == "reasoning_step"


class TestReasoningService:
    """Test ReasoningService class."""
    
    @pytest.fixture
    def reasoning_service(self):
        """Create a fresh reasoning service."""
        return ReasoningService()
    
    def test_start_session(self, reasoning_service):
        """Test starting a reasoning session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            session = reasoning_service.start_session("session-1")
        
        assert session["session_id"] == "session-1"
        assert session["state"] == "active"
        assert "session-1" in reasoning_service._sessions
    
    def test_start_session_with_metadata(self, reasoning_service):
        """Test starting session with metadata."""
        with patch('app.reasoning.service.save_reasoning_session'):
            session = reasoning_service.start_session(
                "session-2",
                metadata={"model": "gpt-4", "provider": "openai"}
            )
        
        assert session["metadata"]["model"] == "gpt-4"
        assert session["metadata"]["provider"] == "openai"
    
    def test_start_duplicate_session(self, reasoning_service):
        """Test starting duplicate session returns existing."""
        with patch('app.reasoning.service.save_reasoning_session'):
            session1 = reasoning_service.start_session("session-3")
            session2 = reasoning_service.start_session("session-3")
        
        # Should return the same session
        assert session1["session_id"] == session2["session_id"]
    
    def test_get_session(self, reasoning_service):
        """Test getting a session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-4")
        
        session = reasoning_service.get_session("session-4")
        assert session is not None
        assert session["session_id"] == "session-4"
    
    def test_get_nonexistent_session(self, reasoning_service):
        """Test getting non-existent session."""
        session = reasoning_service.get_session("nonexistent")
        assert session is None
    
    def test_add_step_to_session(self, reasoning_service):
        """Test adding step to session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-5")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            result = reasoning_service.add_step("session-5", {
                "type": "analysis",
                "content": "Test step"
            })
        
        assert len(result["steps"]) == 1
        assert result["steps"][0]["content"] == "Test step"
    
    def test_add_step_to_nonexistent_session(self, reasoning_service):
        """Test adding step to non-existent session."""
        with pytest.raises(ValueError, match="not found"):
            reasoning_service.add_step("nonexistent", {"type": "test"})
    
    def test_finish_session(self, reasoning_service):
        """Test finishing a session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-6")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            reasoning_service.add_step("session-6", {"type": "test", "content": "A"})
            reasoning_service.add_step("session-6", {"type": "test", "content": "B"})
        
        summary = reasoning_service.finish_session("session-6")
        
        assert summary["state"] == "completed"
        assert summary["total_steps"] == 2
        # Check the session data has completed_at (not the summary)
        session_data = reasoning_service.get_session("session-6")
        assert "completed_at" in session_data
    
    def test_finish_nonexistent_session(self, reasoning_service):
        """Test finishing non-existent session."""
        result = reasoning_service.finish_session("nonexistent")
        assert "error" in result
    
    def test_cancel_session(self, reasoning_service):
        """Test cancelling a session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-7")
        
        result = reasoning_service.cancel_session("session-7")
        
        assert result["state"] == "cancelled"
        assert "cancelled_at" in result
    
    def test_branch_session(self, reasoning_service):
        """Test branching a session."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-8")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            reasoning_service.add_step("session-8", {"content": "Step 1"})
            reasoning_service.add_step("session-8", {"content": "Step 2"})
            reasoning_service.add_step("session-8", {"content": "Step 3"})
        
        # Branch from step 1
        branch_id = reasoning_service.branch_session("session-8", step_index=1)
        
        assert branch_id.startswith("session-8_branch_")
        
        # Check branch has correct steps
        branch = reasoning_service.get_session(branch_id)
        assert len(branch["steps"]) == 2  # Steps 0 and 1
        assert branch["metadata"]["parent_session"] == "session-8"
        assert branch["metadata"]["branch_point"] == 1
    
    def test_branch_nonexistent_session(self, reasoning_service):
        """Test branching non-existent session."""
        with pytest.raises(ValueError, match="not found"):
            reasoning_service.branch_session("nonexistent", step_index=0)
    
    def test_branch_invalid_step(self, reasoning_service):
        """Test branching from invalid step index."""
        with patch('app.reasoning.service.save_reasoning_session'):
            reasoning_service.start_session("session-9")
        
        with patch('app.reasoning.service.save_reasoning_step'):
            reasoning_service.add_step("session-9", {"content": "Step"})
        
        with pytest.raises(ValueError, match="does not exist"):
            reasoning_service.branch_session("session-9", step_index=10)
