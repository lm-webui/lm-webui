import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

class TestErrorHandlers:
    """Test error handling middleware and handlers"""
    
    def test_405_method_not_allowed(self, client):
        """Test 405 error handling for invalid HTTP methods"""
        # Try POST on a GET-only endpoint
        response = client.post("/api/auth/me")
        assert response.status_code == 405
        # API uses "detail" for errors
        assert "detail" in response.json()
    
    def test_401_unauthorized(self, client):
        """Test 401 error for protected endpoint without auth"""
        response = client.get("/api/auth/me")
        assert response.status_code == 401
        assert "detail" in response.json()
    
    def test_error_response_content_type(self, client):
        """Test error responses have correct content type"""
        response = client.post("/api/auth/me")
        assert response.status_code == 405
        assert "application/json" in response.headers["content-type"]
