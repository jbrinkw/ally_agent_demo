"""
Simple FastAPI server for serving user external tool files via API key authentication.
This is a proof-of-concept implementation.

Usage:
- Users get automatic API key/secret generation when created
- No user ID required - server identifies user from credentials
- Endpoint: GET /api/users/me (authentication via HTTP Basic Auth)

Run with: uvicorn api_server:app --port 8080 --reload
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import PlainTextResponse
import sqlite3
import os
from pathlib import Path

app = FastAPI(title="Ally Agent External Tools API", version="1.0.0")
security = HTTPBasic()

# Database path
DB_PATH = Path(__file__).parent / "db" / "tools.db"

def get_db_connection():
    """Get database connection"""
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Database not found")
    return sqlite3.connect(str(DB_PATH))

def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """Authenticate user with API key and secret"""
    api_key = credentials.username
    api_secret = credentials.password
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Find user by API credentials
        cursor.execute("""
            SELECT u.id, u.name 
            FROM users u
            JOIN user_api_credentials c ON u.id = c.user_id
            WHERE c.api_key = ? AND c.api_secret = ?
        """, (api_key, api_secret))
        
        user = cursor.fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API credentials",
                headers={"WWW-Authenticate": "Basic"},
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
        
        # Generate the file content (simplified version of the externalToolsGenerator)
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

@app.get("/")
async def root():
    return {"message": "Ally Agent External Tools API", "version": "1.0.0"}

@app.get("/api/users/{user_id}/external-tools", response_class=PlainTextResponse)
async def get_user_external_tools(user_id: int, current_user = Depends(authenticate_user)):
    """Get external tools file content for a user"""
    
    # Verify user has access to this user_id (users can only access their own tools)
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

@app.get("/api/users/me", response_class=PlainTextResponse)
async def get_my_external_tools(current_user = Depends(authenticate_user)):
    """Get external tools file content for the authenticated user"""
    try:
        content = generate_external_tools_content(current_user["id"])
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating external tools: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080) 