import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import time

class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_register_user_success(self, client):
        """Test successful user registration"""
        user_data = {
            "email": f"testuser_{int(time.time())}@test.com",
            "password": "testpass123"
        }
        
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 201
        assert "user" in response.json()
        assert "id" in response.json()["user"]
    
    def test_register_duplicate_user(self, client):
        """Test duplicate user registration fails"""
        user_data = {
            "email": "duplicateuser@test.com",
            "password": "testpass123"
        }
        
        # First registration should succeed
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 201
        
        # Second registration should fail
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 400
        assert "error" in response.json()
    
    def test_login_success(self, client):
        """Test successful login"""
        # First register a user
        user_data = {
            "email": "loginuser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        # Then login
        login_data = {
            "email": "loginuser@test.com",
            "password": "testpass123"
        }
        
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code == 200
        # Token is in cookie, not JSON body
        assert "access_token" in response.cookies
        # Check if refresh token cookie was set
        assert "refresh_token" in response.cookies
    
    def test_login_wrong_password(self, client):
        """Test login with wrong password fails"""
        # First register a user
        user_data = {
            "email": "wrongpassuser@test.com",
            "password": "correctpass"
        }
        client.post("/api/auth/register", json=user_data)
        
        # Try login with wrong password
        login_data = {
            "email": "wrongpassuser@test.com",
            "password": "wrongpass"
        }
        
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code == 401
        assert "error" in response.json()
    
    def test_protected_endpoint_with_token(self, client):
        """Test accessing protected endpoint with valid token"""
        # Register and login to get token
        user_data = {
            "email": "protecteduser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": "protecteduser@test.com",
            "password": "testpass123"
        }
        login_response = client.post("/api/auth/login", json=login_data)
        token = login_response.cookies["access_token"]
        
        # Access protected endpoint
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        assert "email" in response.json()
        assert response.json()["email"] == "protecteduser@test.com"
    
    def test_protected_endpoint_without_token(self, client):
        """Test accessing protected endpoint without token fails"""
        response = client.get("/api/auth/me")
        assert response.status_code == 403  # FastAPI returns 403 for missing auth header
    
    def test_token_refresh(self, client):
        """Test token refresh functionality"""
        # Register and login
        user_data = {
            "email": "refreshuser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": "refreshuser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/login", json=login_data)
        
        # Refresh token
        response = client.post("/api/auth/refresh")
        assert response.status_code == 200
        assert "access_token" in response.cookies
    
    def test_logout(self, client):
        """Test logout functionality"""
        # Register and login
        user_data = {
            "email": "logoutuser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": "logoutuser@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/login", json=login_data)
        
        # Logout
        response = client.post("/api/auth/logout")
        assert response.status_code == 200
        
        # Try to refresh after logout (should fail)
        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
    
    @pytest.mark.parametrize("invalid_data,expected_status", [
        ({"email": "", "password": "pass"}, 422),  # Empty email
        ({"email": "user", "password": ""}, 422),  # Empty password
        ({"email": "user", "password": "short"}, 422),  # Short password
        ({"email": "a" * 51 + "@test.com", "password": "validpass"}, 422),  # Too long email
    ])
    def test_register_validation(self, client, invalid_data, expected_status):
        """Test registration validation"""
        response = client.post("/api/auth/register", json=invalid_data)
        assert response.status_code == expected_status
    
    @pytest.mark.parametrize("invalid_data,expected_status", [
        ({"email": "", "password": "pass"}, 422),  # Empty email
        ({"email": "user", "password": ""}, 422),  # Empty password
    ])
    def test_login_validation(self, client, invalid_data, expected_status):
        """Test login validation"""
        response = client.post("/api/auth/login", json=invalid_data)
        assert response.status_code == expected_status
