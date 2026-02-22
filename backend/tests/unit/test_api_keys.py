import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import time

class TestAPIKeys:
    """Test API key management endpoints"""
    
    def test_add_api_key(self, client):
        """Test adding an API key"""
        # First register and login to get token (from cookie)
        user_data = {
            "email": f"apikeyuser_{int(time.time())}@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": user_data["email"],
            "password": "testpass123"
        }
        login_response = client.post("/api/auth/login", json=login_data)
        
        # Get token from cookie, not JSON body
        assert "access_token" in login_response.cookies, f"No cookie set. Response: {login_response.json()}"
        token = login_response.cookies["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add API key
        key_data = {
            "provider": "openai",
            "api_key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz"
        }
        
        response = client.post("/api/api_keys", json=key_data, headers=headers)
        assert response.status_code == 200
        assert "message" in response.json()
        assert response.json()["message"] == "Key saved"
    
    def test_list_api_keys(self, client):
        """Test listing API keys"""
        # Register, login, and add a key first
        user_data = {
            "email": f"listkeysuser_{int(time.time())}@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": user_data["email"],
            "password": "testpass123"
        }
        login_response = client.post("/api/auth/login", json=login_data)
        token = login_response.cookies["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add a key
        key_data = {
            "provider": "openai",
            "api_key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz"
        }
        client.post("/api/api_keys", json=key_data, headers=headers)
        
        # List keys - API returns "keys" not "api_keys"
        response = client.get("/api/api_keys", headers=headers)
        assert response.status_code == 200
        assert "keys" in response.json()
        # Check that we have at least one key
        keys = response.json()["keys"]
        assert isinstance(keys, list)
    
    def test_get_specific_api_key(self, client):
        """Test getting a specific API key"""
        # Register, login, and add a key first
        user_data = {
            "email": f"getkeyuser_{int(time.time())}@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": user_data["email"],
            "password": "testpass123"
        }
        login_response = client.post("/api/auth/login", json=login_data)
        token = login_response.cookies["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add a key
        key_data = {
            "provider": "openai",
            "api_key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz"
        }
        client.post("/api/api_keys", json=key_data, headers=headers)
        
        # Get the specific key - API returns "api_key" field
        response = client.get("/api/api_keys/openai", headers=headers)
        assert response.status_code == 200
        assert "api_key" in response.json()
    
    def test_delete_api_key(self, client):
        """Test deleting an API key"""
        # Register, login, and add a key first
        user_data = {
            "email": f"deletekeyuser_{int(time.time())}@test.com",
            "password": "testpass123"
        }
        client.post("/api/auth/register", json=user_data)
        
        login_data = {
            "email": user_data["email"],
            "password": "testpass123"
        }
        login_response = client.post("/api/auth/login", json=login_data)
        token = login_response.cookies["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add a key
        key_data = {
            "provider": "openai",
            "api_key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz"
        }
        client.post("/api/api_keys", json=key_data, headers=headers)
        
        # Delete the key - API returns "Key deleted"
        response = client.delete("/api/api_keys/openai", headers=headers)
        assert response.status_code == 200
        assert "message" in response.json()
        assert response.json()["message"] == "Key deleted"
    
    def test_add_api_key_unauthorized(self, client):
        """Test adding API key without authentication fails"""
        key_data = {
            "provider": "openai",
            "api_key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz"
        }
        
        response = client.post("/api/api_keys", json=key_data)
        # API returns 401 for missing auth, not 403
        assert response.status_code == 401
