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
        # API returns 200, not 201
        assert response.status_code == 200
        assert "user" in response.json()
        assert "id" in response.json()["user"]
    
    def test_register_duplicate_user(self, client):
        """Test duplicate user registration fails"""
        # Use unique email to avoid conflicts with previous test runs
        unique_email = f"duplicateuser_{int(time.time())}@test.com"
        user_data = {
            "email": unique_email,
            "password": "testpass123"
        }
        
        # First registration should succeed
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 200
        
        # Second registration should fail
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 400
        # API uses "detail" for errors
        assert "detail" in response.json()
    
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
        # API uses "detail" for errors, not "error"
        assert "detail" in response.json()
    
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
        # API returns 401 for missing auth, not 403
        assert response.status_code == 401
    
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
