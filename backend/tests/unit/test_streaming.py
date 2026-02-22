"""Quick tests for streaming module - tests validation logic without heavy dependencies."""
import pytest
from unittest.mock import MagicMock, patch
from app.streaming.service import StreamingService


class TestStreamingValidation:
    """Test streaming parameter validation."""
    
    @pytest.fixture
    def streaming_service(self):
        """Create streaming service with mocked model registry."""
        with patch('app.streaming.service.get_model_registry') as mock_registry:
            mock_registry.return_value = MagicMock()
            service = StreamingService()
            return service
    
    def test_validate_empty_message(self, streaming_service):
        """Test validation fails for empty message."""
        result = streaming_service._validate_streaming_params(
            message="",
            provider="openai",
            model="gpt-4",
            conversation_history=None
        )
        assert result["valid"] is False
        assert "Message is required" in result["error"]
    
    def test_validate_whitespace_message(self, streaming_service):
        """Test validation fails for whitespace-only message."""
        result = streaming_service._validate_streaming_params(
            message="   \n\t  ",
            provider="openai",
            model="gpt-4",
            conversation_history=None
        )
        assert result["valid"] is False
        assert "Message is required" in result["error"]
    
    def test_validate_message_too_long(self, streaming_service):
        """Test validation fails for message over 10000 chars."""
        result = streaming_service._validate_streaming_params(
            message="x" * 10001,
            provider="openai",
            model="gpt-4",
            conversation_history=None
        )
        assert result["valid"] is False
        assert "too long" in result["error"]
    
    def test_validate_message_at_limit(self, streaming_service):
        """Test validation passes for message at 10000 chars."""
        result = streaming_service._validate_streaming_params(
            message="x" * 10000,
            provider="openai",
            model="gpt-4",
            conversation_history=None
        )
        assert result["valid"] is True
    
    def test_validate_invalid_provider(self, streaming_service):
        """Test validation fails for invalid provider."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="invalid_provider",
            model="some-model",
            conversation_history=None
        )
        assert result["valid"] is False
        assert "Invalid provider" in result["error"]
    
    def test_validate_valid_providers(self, streaming_service):
        """Test validation passes for all valid providers."""
        valid_providers = ["openai", "claude", "gemini", "grok", "deepseek", "lmstudio", "ollama", "gguf"]
        
        for provider in valid_providers:
            result = streaming_service._validate_streaming_params(
                message="Hello",
                provider=provider,
                model="model-name",
                conversation_history=None
            )
            assert result["valid"] is True, f"Provider {provider} should be valid"
    
    def test_validate_empty_model(self, streaming_service):
        """Test validation fails for empty model."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="openai",
            model="",
            conversation_history=None
        )
        assert result["valid"] is False
        assert "model name is required" in result["error"]
    
    def test_validate_short_model(self, streaming_service):
        """Test validation fails for single-char model."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="openai",
            model="x",
            conversation_history=None
        )
        assert result["valid"] is False
    
    def test_validate_invalid_conversation_history(self, streaming_service):
        """Test validation fails for non-list conversation history."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="openai",
            model="gpt-4",
            conversation_history="not a list"
        )
        assert result["valid"] is False
        assert "must be an array" in result["error"]
    
    def test_validate_valid_conversation_history(self, streaming_service):
        """Test validation passes for list conversation history."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="openai",
            model="gpt-4",
            conversation_history=[
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello!"}
            ]
        )
        assert result["valid"] is True
    
    def test_validate_empty_conversation_history(self, streaming_service):
        """Test validation passes for empty list conversation history."""
        result = streaming_service._validate_streaming_params(
            message="Hello",
            provider="openai",
            model="gpt-4",
            conversation_history=[]
        )
        assert result["valid"] is True
    
    def test_validate_all_valid_params(self, streaming_service):
        """Test validation passes for all valid parameters."""
        result = streaming_service._validate_streaming_params(
            message="Hello, how are you?",
            provider="openai",
            model="gpt-4",
            conversation_history=[
                {"role": "user", "content": "Hi"}
            ]
        )
        assert result["valid"] is True
        assert result["error"] is None


class TestStreamingPromptCreation:
    """Test prompt creation logic."""
    
    @pytest.fixture
    def streaming_service(self):
        """Create streaming service with mocked model registry."""
        with patch('app.streaming.service.get_model_registry') as mock_registry:
            mock_registry.return_value = MagicMock()
            service = StreamingService()
            return service
    
    def test_create_prompt_basic(self, streaming_service):
        """Test basic prompt creation."""
        prompt = streaming_service._create_prompt(
            message="Hello",
            conversation_history=None,
            deep_thinking=False,
            search_context=""
        )
        assert prompt == "Hello"
    
    def test_create_prompt_with_search_context(self, streaming_service):
        """Test prompt with search context."""
        prompt = streaming_service._create_prompt(
            message="What is AI?",
            conversation_history=None,
            deep_thinking=False,
            search_context="Search results here"
        )
        assert "Search results here" in prompt
        assert "What is AI?" in prompt
        assert "User Query:" in prompt
    
    def test_create_prompt_deep_thinking(self, streaming_service):
        """Test prompt with deep thinking mode."""
        prompt = streaming_service._create_prompt(
            message="Solve this problem",
            conversation_history=None,
            deep_thinking=True,
            search_context=""
        )
        assert "step-by-step reasoning" in prompt
        assert "<think" in prompt.lower()
        assert "</think" in prompt.lower()
    
    def test_create_prompt_deep_thinking_with_search(self, streaming_service):
        """Test deep thinking prompt with search context."""
        prompt = streaming_service._create_prompt(
            message="Analyze this",
            conversation_history=None,
            deep_thinking=True,
            search_context="Web results"
        )
        assert "step-by-step reasoning" in prompt
        assert "Web results" in prompt
