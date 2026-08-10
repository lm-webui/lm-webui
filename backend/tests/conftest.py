import pytest
from fastapi.testclient import TestClient
from app.main import app
import sys
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

@pytest.fixture
def client():
    """FastAPI TestClient fixture"""
    return TestClient(app)

@pytest.fixture
def auth_headers():
    """Authentication headers fixture"""
    return {"Authorization": "Bearer test-token"}

@pytest.fixture(autouse=True)
def mock_env_vars(monkeypatch):
    """Mock environment variables for tests"""
    monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-testing-only")
    monkeypatch.setenv("FERNET_KEY", "test-fernet-key-for-testing-only")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("APP_AUTH_ALLOW_REGISTRATION", "true")

@pytest.fixture
def mock_db_session(mocker):
    """Mock database session"""
    mock_session = mocker.MagicMock()
    mocker.patch("app.db.database.get_db", return_value=mock_session)
    return mock_session