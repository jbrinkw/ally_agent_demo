"""
OAuth 2.0 Client for Ally Agent API

This module provides OAuth 2.0 client functionality for integrating with the 
Ally Agent OAuth 2.0 authorization server.

Supports:
- Client Credentials flow (for machine-to-machine)
- Authorization Code flow (for interactive applications)
- Token management and automatic refresh
"""

import requests
import base64
import json
import time
from typing import Optional, Dict, Any
from urllib.parse import urlencode, parse_qs, urlparse
import secrets

class OAuth2Client:
    """OAuth 2.0 client for the Ally Agent API"""
    
    def __init__(
        self, 
        client_id: str, 
        client_secret: str, 
        authorization_server_url: str = "http://localhost:8080",
        redirect_uri: str = "http://localhost:8501/oauth/callback"
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.authorization_server_url = authorization_server_url.rstrip('/')
        self.redirect_uri = redirect_uri
        self.access_token = None
        self.token_expires_at = None
        
    def get_authorization_url(self, scope: str = "read:tools", state: Optional[str] = None) -> str:
        """Generate OAuth 2.0 authorization URL for authorization code flow"""
        if state is None:
            state = secrets.token_urlsafe(16)
            
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": scope,
            "state": state
        }
        
        return f"{self.authorization_server_url}/oauth/authorize?{urlencode(params)}"
    
    def exchange_authorization_code(
        self, 
        authorization_code: str, 
        redirect_uri: Optional[str] = None
    ) -> Dict[str, Any]:
        """Exchange authorization code for access token"""
        if redirect_uri is None:
            redirect_uri = self.redirect_uri
            
        token_data = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": authorization_code,
            "redirect_uri": redirect_uri
        }
        
        response = requests.post(
            f"{self.authorization_server_url}/oauth/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if response.status_code != 200:
            raise Exception(f"Token exchange failed: {response.status_code} - {response.text}")
            
        token_response = response.json()
        
        # Store token and expiration
        self.access_token = token_response["access_token"]
        self.token_expires_at = time.time() + token_response.get("expires_in", 3600)
        
        return token_response
    
    def client_credentials_flow(self, scope: str = "read:tools") -> Dict[str, Any]:
        """Perform client credentials flow to get access token"""
        token_data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": scope
        }
        
        response = requests.post(
            f"{self.authorization_server_url}/oauth/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if response.status_code != 200:
            raise Exception(f"Client credentials flow failed: {response.status_code} - {response.text}")
            
        token_response = response.json()
        
        # Store token and expiration
        self.access_token = token_response["access_token"]
        self.token_expires_at = time.time() + token_response.get("expires_in", 3600)
        
        return token_response
    
    def is_token_valid(self) -> bool:
        """Check if current access token is valid and not expired"""
        if not self.access_token or not self.token_expires_at:
            return False
        
        # Add 60 second buffer for clock skew
        return time.time() < (self.token_expires_at - 60)
    
    def get_external_tools(self) -> str:
        """Get external tools file content using OAuth 2.0 authentication"""
        if not self.is_token_valid():
            raise Exception("No valid access token. Please authenticate first.")
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "text/plain"
        }
        
        response = requests.get(
            f"{self.authorization_server_url}/api/users/me",
            headers=headers
        )
        
        if response.status_code == 401:
            raise Exception("Access token expired or invalid. Please re-authenticate.")
        elif response.status_code != 200:
            raise Exception(f"Failed to fetch external tools: {response.status_code} - {response.text}")
        
        return response.text
    
    def introspect_token(self, token: Optional[str] = None) -> Dict[str, Any]:
        """Introspect an access token to check its validity and claims"""
        if token is None:
            token = self.access_token
            
        if not token:
            raise Exception("No token provided for introspection")
        
        introspect_data = {
            "token": token,
            "client_id": self.client_id,
            "client_secret": self.client_secret
        }
        
        response = requests.post(
            f"{self.authorization_server_url}/oauth/introspect",
            data=introspect_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if response.status_code != 200:
            raise Exception(f"Token introspection failed: {response.status_code} - {response.text}")
            
        return response.json()

def create_oauth_client_from_credentials(client_id: str, client_secret: str) -> OAuth2Client:
    """Create an OAuth client and authenticate using client credentials flow"""
    client = OAuth2Client(client_id, client_secret)
    
    try:
        token_response = client.client_credentials_flow()
        print(f"Successfully authenticated. Token expires in {token_response.get('expires_in', 'unknown')} seconds.")
        return client
    except Exception as e:
        print(f"OAuth authentication failed: {e}")
        raise

def get_external_tools_with_oauth(client_id: str, client_secret: str) -> str:
    """Convenience function to get external tools using OAuth 2.0 client credentials"""
    client = create_oauth_client_from_credentials(client_id, client_secret)
    return client.get_external_tools()

# Example usage for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 3:
        print("Usage: python oauth_client.py <client_id> <client_secret>")
        sys.exit(1)
    
    client_id = sys.argv[1]
    client_secret = sys.argv[2]
    
    try:
        # Test client credentials flow
        client = create_oauth_client_from_credentials(client_id, client_secret)
        
        # Get external tools
        tools_content = client.get_external_tools()
        print("External tools content:")
        print(tools_content[:500] + "..." if len(tools_content) > 500 else tools_content)
        
        # Test token introspection
        introspection = client.introspect_token()
        print(f"\nToken introspection: {introspection}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1) 