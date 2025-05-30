"""
OAuth 2.0 FastAPI server for serving user external tool files.
Implements a full OAuth 2.0 authorization server with client credentials and authorization code flows.

Features:
- OAuth 2.0 Authorization Server
- JWT Access Token validation
- Client Credentials flow for machine-to-machine
- Authorization Code flow for interactive applications
- Token introspection endpoint
- Secure user tool file serving

Run with: uvicorn api_server:app --port 8080 --reload
"""

from fastapi import FastAPI, HTTPException, Depends, status, Request, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2AuthorizationCodeBearer
from fastapi.responses import PlainTextResponse, RedirectResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import sqlite3
import os
import secrets
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
from urllib.parse import urlencode, parse_qs
import json

app = FastAPI(
    title="Ally Agent OAuth 2.0 API", 
    version="2.0.0",
    description="OAuth 2.0 protected API for user external tools"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8501"],  # Frontend and Streamlit
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# OAuth 2.0 Configuration
SECRET_KEY = os.getenv("OAUTH_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Bearer token authentication
security = HTTPBearer()

# Database path
DB_PATH = Path(__file__).parent / "db" / "tools.db"

def get_db_connection():
    """Get database connection"""
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Database not found")
    return sqlite3.connect(str(DB_PATH))

def init_oauth_tables():
    """Initialize OAuth 2.0 database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # OAuth clients table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS oauth_clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                client_secret_hash TEXT NOT NULL,
                client_name TEXT NOT NULL,
                redirect_uris TEXT,  -- JSON array of allowed redirect URIs
                grant_types TEXT DEFAULT 'authorization_code,client_credentials',
                user_id INTEGER,  -- Associated user for this client
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        
        # OAuth authorization codes table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                redirect_uri TEXT,
                scope TEXT,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        
        # OAuth access tokens table (for token introspection and revocation)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS oauth_access_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                scope TEXT,
                expires_at DATETIME NOT NULL,
                revoked BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        
        conn.commit()
        
        # Create default OAuth clients for existing users
        cursor.execute("SELECT id, name FROM users")
        users = cursor.fetchall()
        
        for user_id, user_name in users:
            # Check if client already exists
            cursor.execute("SELECT client_id FROM oauth_clients WHERE user_id = ?", (user_id,))
            if cursor.fetchone():
                continue
                
            # Create OAuth client for user
            client_id = f"ally_agent_user_{user_id}"
            client_secret = secrets.token_urlsafe(32)
            client_secret_hash = pwd_context.hash(client_secret)
            
            cursor.execute("""
                INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, user_id, redirect_uris)
                VALUES (?, ?, ?, ?, ?)
            """, (
                client_id, 
                client_secret_hash, 
                f"{user_name} OAuth Client", 
                user_id,
                json.dumps(["http://localhost:8501/oauth/callback", "urn:ietf:wg:oauth:2.0:oob"])
            ))
            
            print(f"Created OAuth client for user {user_name}: {client_id} / {client_secret}")
        
        conn.commit()
        
    finally:
        conn.close()

# Initialize OAuth tables on startup
init_oauth_tables()

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Dict[str, Any]:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def authenticate_client(client_id: str, client_secret: str) -> Optional[Dict[str, Any]]:
    """Authenticate OAuth client"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT client_id, client_secret_hash, client_name, user_id
            FROM oauth_clients 
            WHERE client_id = ?
        """, (client_id,))
        
        client = cursor.fetchone()
        if not client:
            return None
            
        if not pwd_context.verify(client_secret, client[1]):
            return None
            
        return {
            "client_id": client[0],
            "client_name": client[2],
            "user_id": client[3]
        }
    finally:
        conn.close()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    # Get user info from database
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, name FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        return {"id": user[0], "name": user[1]}
    finally:
        conn.close()

def generate_external_tools_content(user_id: int) -> str:
    """Generate external_tool_agents.py content for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get user's enabled individual tools
        cursor.execute("""
            SELECT t.id, t.name, t.description, t.code
            FROM tools t
            JOIN user_tool_selections uts ON t.id = uts.tool_id
            WHERE uts.user_id = ? AND uts.enabled = 1
            ORDER BY t.name ASC
        """, (user_id,))
        enabled_tools = cursor.fetchall()
        
        # Get user's enabled tool groups with their tools
        cursor.execute("""
            SELECT tg.id, tg.name, tg.instructions
            FROM tool_groups tg
            JOIN user_tool_group_selections utgs ON tg.id = utgs.tool_group_id
            WHERE utgs.user_id = ? AND utgs.enabled = 1
            ORDER BY tg.name ASC
        """, (user_id,))
        enabled_groups = cursor.fetchall()
        
        # For each enabled group, get its tools
        enabled_tool_groups = []
        for group in enabled_groups:
            cursor.execute("""
                SELECT t.id, t.name, t.description, t.code
                FROM tools t
                JOIN tool_group_tools tgt ON t.id = tgt.tool_id
                WHERE tgt.tool_group_id = ?
                ORDER BY t.name ASC
            """, (group[0],))
            group_tools = cursor.fetchall()
            
            enabled_tool_groups.append({
                'id': group[0],
                'name': group[1],
                'instructions': group[2],
                'tools': [{'id': t[0], 'name': t[1], 'description': t[2], 'code': t[3]} for t in group_tools]
            })
        
        # Generate the file content
        content = generate_file_content(enabled_tools, enabled_tool_groups)
        return content
    
    finally:
        conn.close()

def generate_file_content(enabled_tools, enabled_tool_groups):
    """Generate the actual Python file content"""
    content = """from agents import Agent, function_tool
import random
import os
import asyncio


"""
    
    # Add individual tools
    tool_agents = []
    for tool in enabled_tools:
        tool_id, name, description, code = tool
        safe_name = name.replace(' ', '_').replace('-', '_').lower()
        
        content += f"# --- {name} ---\n"
        if code:
            content += f"{code}\n\n"
        
        content += f"{safe_name}_agent = Agent(\n"
        content += f'    name="{name}",\n'
        content += f'    instructions="""{description}""",\n'
        if code and '@function_tool' in code:
            # Extract function name from code
            lines = code.split('\n')
            func_name = None
            for line in lines:
                if line.strip().startswith('def ') and '(' in line:
                    func_name = line.strip().split('def ')[1].split('(')[0]
                    break
            if func_name:
                content += f'    tools=[{func_name}]\n'
        content += ")\n\n"
        
        tool_agents.append(f"{safe_name}_agent")
    
    # Add tool groups
    for group in enabled_tool_groups:
        safe_group_name = group['name'].replace(' ', '_').replace('-', '_').lower()
        
        content += f"# --- {group['name']} Tool Group ---\n"
        
        # Add all tools in the group
        group_tools = []
        for tool in group['tools']:
            tool_name = tool['name']
            safe_tool_name = tool_name.replace(' ', '_').replace('-', '_').lower()
            
            if tool['code']:
                content += f"{tool['code']}\n\n"
                group_tools.append(safe_tool_name)
        
        content += f"{safe_group_name}_agent = Agent(\n"
        content += f'    name="{group["name"]}",\n'
        content += f'    instructions="""{group["instructions"]}""",\n'
        if group_tools:
            content += f"    tools=[{', '.join(group_tools)}]\n"
        content += ")\n\n"
        
        tool_agents.append(f"{safe_group_name}_agent")
    
    # Add the external_tools list
    content += "# List of directly usable tool objects to be imported by the main agent file\n"
    content += "external_tools = [\n"
    
    for i, agent in enumerate(tool_agents):
        agent_name = agent.replace('_agent', '')
        content += f"    {agent}.as_tool(\n"
        content += f'        tool_name="get_{agent_name}_from_specialist_agent",\n'
        content += f'        tool_description="Call this tool for tasks related to {agent_name}."\n'
        content += "    )"
        if i < len(tool_agents) - 1:
            content += ","
        content += "\n"
    
    content += "]\n"
    
    return content

# OAuth 2.0 Authorization Server Endpoints

@app.get("/oauth/authorize")
async def authorize(
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str = "read:tools",
    state: Optional[str] = None
):
    """OAuth 2.0 Authorization endpoint"""
    
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Unsupported response_type")
    
    # Verify client exists and redirect URI is allowed
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT client_name, redirect_uris, user_id 
            FROM oauth_clients 
            WHERE client_id = ?
        """, (client_id,))
        
        client = cursor.fetchone()
        if not client:
            raise HTTPException(status_code=400, detail="Invalid client_id")
        
        allowed_uris = json.loads(client[1])
        if redirect_uri not in allowed_uris:
            raise HTTPException(status_code=400, detail="Invalid redirect_uri")
        
        # For simplicity, auto-approve for the client's associated user
        user_id = client[2]
        if not user_id:
            raise HTTPException(status_code=400, detail="Client not associated with a user")
        
        # Generate authorization code
        auth_code = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=10)  # 10 minute expiry
        
        cursor.execute("""
            INSERT INTO oauth_authorization_codes 
            (code, client_id, user_id, redirect_uri, scope, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (auth_code, client_id, user_id, redirect_uri, scope, expires_at))
        
        conn.commit()
        
        # Redirect back with authorization code
        params = {"code": auth_code}
        if state:
            params["state"] = state
            
        redirect_url = f"{redirect_uri}?{urlencode(params)}"
        return RedirectResponse(url=redirect_url)
        
    finally:
        conn.close()

@app.post("/oauth/token")
async def token_endpoint(
    grant_type: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    scope: str = Form("read:tools")
):
    """OAuth 2.0 Token endpoint"""
    
    # Authenticate client
    client = authenticate_client(client_id, client_secret)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid client credentials",
            headers={"WWW-Authenticate": "Basic"}
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if grant_type == "authorization_code":
            if not code or not redirect_uri:
                raise HTTPException(status_code=400, detail="Missing code or redirect_uri")
            
            # Verify authorization code
            cursor.execute("""
                SELECT user_id, expires_at, used
                FROM oauth_authorization_codes
                WHERE code = ? AND client_id = ? AND redirect_uri = ?
            """, (code, client_id, redirect_uri))
            
            auth_code_data = cursor.fetchone()
            if not auth_code_data:
                raise HTTPException(status_code=400, detail="Invalid authorization code")
            
            user_id, expires_at_str, used = auth_code_data
            expires_at = datetime.fromisoformat(expires_at_str)
            
            if used or datetime.utcnow() > expires_at:
                raise HTTPException(status_code=400, detail="Authorization code expired or already used")
            
            # Mark code as used
            cursor.execute("""
                UPDATE oauth_authorization_codes 
                SET used = 1 
                WHERE code = ?
            """, (code,))
            
        elif grant_type == "client_credentials":
            # For client credentials flow, use the client's associated user
            user_id = client["user_id"]
            if not user_id:
                raise HTTPException(status_code=400, detail="Client not associated with a user")
                
        else:
            raise HTTPException(status_code=400, detail="Unsupported grant_type")
        
        # Create access token
        token_data = {
            "sub": str(user_id),
            "client_id": client_id,
            "scope": scope,
            "token_type": "access_token"
        }
        
        access_token = create_access_token(token_data)
        expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60
        
        # Store token hash for introspection/revocation
        token_hash = hashlib.sha256(access_token.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        cursor.execute("""
            INSERT INTO oauth_access_tokens 
            (token_hash, client_id, user_id, scope, expires_at)
            VALUES (?, ?, ?, ?, ?)
        """, (token_hash, client_id, user_id, scope, expires_at))
        
        conn.commit()
        
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": expires_in,
            "scope": scope
        }
        
    finally:
        conn.close()

@app.post("/oauth/introspect")
async def introspect_token(
    token: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...)
):
    """OAuth 2.0 Token Introspection endpoint"""
    
    # Authenticate client
    client = authenticate_client(client_id, client_secret)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid client credentials"
        )
    
    try:
        payload = verify_token(token)
        
        # Check if token is in database and not revoked
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT revoked, expires_at 
                FROM oauth_access_tokens 
                WHERE token_hash = ?
            """, (token_hash,))
            
            token_data = cursor.fetchone()
            if token_data and token_data[0]:  # revoked
                return {"active": False}
            
            return {
                "active": True,
                "client_id": payload.get("client_id"),
                "scope": payload.get("scope"),
                "sub": payload.get("sub"),
                "exp": payload.get("exp"),
                "iat": payload.get("iat")
            }
        finally:
            conn.close()
            
    except JWTError:
        return {"active": False}

# Protected API Endpoints

@app.get("/")
async def root():
    return {
        "message": "Ally Agent OAuth 2.0 API", 
        "version": "2.0.0",
        "authorization_endpoint": "/oauth/authorize",
        "token_endpoint": "/oauth/token",
        "introspection_endpoint": "/oauth/introspect"
    }

@app.get("/api/users/me", response_class=PlainTextResponse)
async def get_my_external_tools(current_user = Depends(get_current_user)):
    """Get external tools file content for the authenticated user (OAuth 2.0 protected)"""
    try:
        content = generate_external_tools_content(current_user["id"])
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating external tools: {str(e)}")

@app.get("/api/users/{user_id}/external-tools", response_class=PlainTextResponse)
async def get_user_external_tools(user_id: int, current_user = Depends(get_current_user)):
    """Get external tools file content for a specific user (OAuth 2.0 protected)"""
    
    # Verify user has access to this user_id
    if current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only access your own external tools"
        )
    
    try:
        content = generate_external_tools_content(user_id)
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating external tools: {str(e)}")

@app.get("/api/oauth/clients/me")
async def get_my_oauth_clients(current_user = Depends(get_current_user)):
    """Get OAuth client credentials for the authenticated user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT client_id, client_name, redirect_uris, grant_types, created_at
            FROM oauth_clients 
            WHERE user_id = ?
        """, (current_user["id"],))
        
        clients = cursor.fetchall()
        return [
            {
                "client_id": client[0],
                "client_name": client[1], 
                "redirect_uris": json.loads(client[2]),
                "grant_types": client[3].split(","),
                "created_at": client[4]
            }
            for client in clients
        ]
    finally:
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080) 