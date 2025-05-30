"""
Ally Agent Demo - Streamlit Chat Interface with OAuth 2.0

This is the main chat interface for interacting with the AI agent and its tools.
It imports tools from both internal_tool_agents.py (built-in tools) and 
external_tool_agents.py (generated from OAuth 2.0 protected API) and creates a unified chat experience.

Run with: streamlit run agent.py
Access at: http://localhost:8501

The agent will automatically select appropriate tools based on user requests.
OAuth 2.0 authentication is used to fetch user-specific external tools.
"""

import os
from dotenv import load_dotenv
from agents import Agent, Runner
import streamlit as st
import asyncio

# === TOOL IMPORTS ===
# This section imports tools from both internal and external sources

# Attempt to import external tools
external_tools = [] # Default to empty list
try:
    from external_tool_agents import external_tools as ext_tools_list
    if isinstance(ext_tools_list, list):
        external_tools = ext_tools_list
        if not external_tools:
            print("Info: 'external_tools' list from external_tool_agents.py is empty.")
    else:
        print("Warning: 'external_tools' from external_tool_agents.py is not a list. Defaulting to no external tools.")
except (ImportError, ModuleNotFoundError):
    print("Info: external_tool_agents.py not found or error during import. Proceeding with no external tools.")

# Attempt to import internal tools
internal_tools_list = [] # Default to empty list
try:
    from internal_tool_agents import internal_tools_list as int_tools_list
    if isinstance(int_tools_list, list):
        internal_tools_list = int_tools_list
        if not internal_tools_list:
            print("Info: 'internal_tools_list' from internal_tool_agents.py is empty.")
    else:
        print("Warning: 'internal_tools_list' from internal_tool_agents.py is not a list. Defaulting to no internal tools.")
except (ImportError, ModuleNotFoundError):
    print("Info: internal_tool_agents.py not found or error during import. Proceeding with no internal tools.")

# Load environment variables from .env file
load_dotenv()

# Retrieve the OpenAI API Key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# --- Agent Definitions and Tool Preparations ---
# No local tools defined in agent.py anymore
# All tools are now loaded from external_tool_agents.py and internal_tool_agents.py

all_assistant_tools = external_tools + internal_tools_list

if not all_assistant_tools:
    print("Warning: No tools were loaded for the assistant agent. It will have limited capabilities.")

# Create the orchestrator agent with generic instructions
assistant_agent_instructions = (
    "You are a helpful orchestrator assistant. You have a set of specialized agents available as tools to help with specific user requests. "
    "To determine your capabilities and how to respond to a user query, you MUST consult the names and descriptions of your available tools. "
    "Consider the full conversation history provided to understand the context of the user's current query. "
    "Select the most appropriate tool based on the user's intent as inferred from their query and the tool's description. "
    "If no tool seems appropriate for the user's request, or if no tools are available, clearly state that you cannot fulfill the request with your current set of tools. "
    "Respond in plain text only. Do not use any Markdown formatting."
)

assistant_agent = Agent(
    name="Assistant",
    instructions=assistant_agent_instructions,
    tools=all_assistant_tools, 
    model="gpt-4o-mini"
)
# --- End of Agent Definitions ---

# Check for API Key before starting Streamlit app
if not OPENAI_API_KEY:
    st.error("Error: OPENAI_API_KEY is not set. Please ensure it is in your .env file or set as an environment variable. The application cannot start without it.")
    st.stop()

# Streamlit App
st.title("🤖 Chat with My Multi-Tool Agent")
st.caption("Powered by OAuth 2.0 authentication")

# Sidebar for OAuth 2.0 credentials and external tools fetching
with st.sidebar:
    st.header("🔐 OAuth 2.0 Integration")
    st.write("Fetch external tools using OAuth 2.0")
    
    # OAuth credentials input
    client_id = st.text_input("OAuth Client ID", placeholder="ally_agent_user_1", help="Your OAuth client ID from the user management page")
    client_secret = st.text_input("OAuth Client Secret", type="password", placeholder="Enter your client secret", help="Your OAuth client secret from the user management page")
    
    # Token management section
    if "oauth_token" in st.session_state and "token_expires_at" in st.session_state:
        import time
        if time.time() < st.session_state.token_expires_at:
            st.success("✅ Valid OAuth token")
            expires_in = int(st.session_state.token_expires_at - time.time())
            st.caption(f"Token expires in {expires_in // 60}m {expires_in % 60}s")
        else:
            st.warning("⚠️ OAuth token expired")
            if st.button("🔄 Refresh Token"):
                if "oauth_client" in st.session_state:
                    del st.session_state.oauth_client
                if "oauth_token" in st.session_state:
                    del st.session_state.oauth_token
                if "token_expires_at" in st.session_state:
                    del st.session_state.token_expires_at
                st.rerun()
    
    # Authentication and fetch button
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("🔑 Authenticate", type="primary", help="Get OAuth access token"):
            if client_id and client_secret:
                try:
                    from oauth_client import OAuth2Client
                    import time
                    
                    # Create OAuth client
                    oauth_client = OAuth2Client(client_id, client_secret)
                    
                    # Perform client credentials flow
                    with st.spinner("Authenticating with OAuth 2.0..."):
                        token_response = oauth_client.client_credentials_flow()
                    
                    # Store in session state
                    st.session_state.oauth_client = oauth_client
                    st.session_state.oauth_token = token_response["access_token"]
                    st.session_state.token_expires_at = time.time() + token_response.get("expires_in", 1800)
                    
                    st.success("✅ OAuth authentication successful!")
                    st.info("Now you can fetch your external tools.")
                    
                except Exception as e:
                    st.error(f"❌ OAuth authentication failed: {str(e)}")
            else:
                st.warning("⚠️ Please enter both Client ID and Client Secret")
    
    with col2:
        if st.button("📥 Fetch Tools", help="Download external tools using OAuth token"):
            if "oauth_client" in st.session_state and st.session_state.oauth_client.is_token_valid():
                try:
                    with st.spinner("Fetching external tools..."):
                        tools_content = st.session_state.oauth_client.get_external_tools()
                    
                    # Save the external tools file
                    with open("external_tool_agents.py", "w") as f:
                        f.write(tools_content)
                    
                    st.success("✅ External tools updated successfully!")
                    st.info("Please restart the app to load new tools.")
                    
                    # Show preview of tools
                    with st.expander("📄 Preview of fetched tools"):
                        st.code(tools_content[:500] + "..." if len(tools_content) > 500 else tools_content, language="python")
                    
                except Exception as e:
                    st.error(f"❌ Error fetching tools: {str(e)}")
            else:
                st.warning("⚠️ Please authenticate first or token has expired")
    
    st.markdown("---")
    
    # OAuth client information section
    if client_id and client_secret:
        with st.expander("🔍 OAuth Client Info"):
            st.caption("**Client ID:** " + client_id)
            st.caption("**Authorization Server:** http://localhost:8080")
            st.caption("**Grant Type:** Client Credentials")
            st.caption("**Scope:** read:tools")
            
            if st.button("🔍 Introspect Token", help="Check token validity and claims"):
                if "oauth_client" in st.session_state:
                    try:
                        introspection = st.session_state.oauth_client.introspect_token()
                        st.json(introspection)
                    except Exception as e:
                        st.error(f"Token introspection failed: {str(e)}")
                else:
                    st.warning("No active OAuth client")
    
    st.markdown("---")
    st.caption("💡 Get your OAuth credentials from the User Management page")
    st.caption("🔧 Make sure the OAuth server is running on port 8080")

# Main chat interface
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display existing messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat input
if prompt := st.chat_input("What would you like to ask?"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        full_response = ""
        try:
            message_placeholder.text("Assistant is thinking...")
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            result = Runner.run_sync(assistant_agent, st.session_state.messages)
            full_response = result.final_output
            message_placeholder.markdown(full_response) 
        except Exception as e:
            full_response = f"Sorry, an error occurred: {e}"
            message_placeholder.error(full_response)
        
    st.session_state.messages.append({"role": "assistant", "content": full_response})

# Footer with OAuth status
st.markdown("---")
st.caption("🔐 **Authentication Status:**")
if "oauth_token" in st.session_state:
    import time
    if time.time() < st.session_state.get("token_expires_at", 0):
        st.caption("✅ Authenticated with OAuth 2.0")
    else:
        st.caption("⚠️ OAuth token expired - please re-authenticate")
else:
    st.caption("❌ Not authenticated - external tools unavailable")

# To run the Streamlit app, save this file (e.g., agent.py) 
# and then run `streamlit run agent.py` in your terminal.
