import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

class TestErrorHandlers:
    """Test error handling middleware and handlers"""
    
    def test_404_not_found(self, client):
        """Test 404 error handling for non-existent endpoints"""
        response = client.get("/non-existent-endpoint")
        assert response.status_code == 404
        assert "error" in response.json()
        assert "message" in response.json()
    
    def test_405_method_not_allowed(self, client):
        """Test 405 error handling for invalid HTTP methods"""
        # Try POST on a GET-only endpoint
        response = client.post("/api/auth/me")
        assert response.status_code == 405
        assert "error" in response.json()
    
    def test_422_validation_error(self, client):
        """Test 422 error handling for validation errors"""
        # Try to register with invalid data
        invalid_data = {
            "email": "",  # Empty email
            "password": "short"  # Too short password
        }
        response = client.post("/api/auth/register", json=invalid_data)
        assert response.status_code == 422
        assert "detail" in response.json()
    
    def test_500_internal_server_error(self, client, mocker):
        """Test 500 error handling for internal server errors"""
        # Mock an endpoint to raise an exception
        from app.main import app
        from fastapi import FastAPI
        
        # Create a test endpoint that raises an exception
        @app.get("/test-error")
        async def test_error():
            raise Exception("Test internal server error")
        
        try:
            response = client.get("/test-error")
            assert response.status_code == 500
            assert "error" in response.json()
            assert "Internal Server Error" in response.json()["message"]
        finally:
            # Remove the test endpoint
            app.routes = [route for route in app.routes if route.path != "/test-error"]
    
    def test_custom_error_response_format(self, client):
        """Test that error responses follow consistent format"""
        # Test 404
        response = client.get("/non-existent-endpoint")
        assert response.status_code == 404
        error_data = response.json()
        
        # Check consistent error format
        assert "error" in error_data
        assert "message" in error_data
        assert "timestamp" in error_data
        assert isinstance(error_data["timestamp"], str)
        
        # Test 405
        response = client.post("/api/auth/me")
        assert response.status_code == 405
        error_data = response.json()
        assert "error" in error_data
        assert "message" in error_data
    
    def test_cors_headers_present(self, client):
        """Test CORS headers are present in error responses"""
        response = client.get("/non-existent-endpoint")
        
        # Check CORS headers
        assert "access-control-allow-origin" in response.headers
        assert "access-control-allow-credentials" in response.headers
        assert "access-control-allow-methods" in response.headers
        assert "access-control-allow-headers" in response.headers
    
    def test_error_response_content_type(self, client):
        """Test error responses have correct content type"""
        response = client.get("/non-existent-endpoint")
        assert response.status_code == 404
        assert "application/json" in response.headers["content-type"]
