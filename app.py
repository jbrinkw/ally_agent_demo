"""
Ally Agent Demo - Streamlit Chat Interface

This is the main chat interface for interacting with the AI agent and its tools.
It uses agent_core.py for agent management to avoid source file reload issues.

Run with: streamlit run agent.py
Access at: http://localhost:8501

The agent will automatically select appropriate tools based on user requests.
"""

import streamlit as st
from app import AgentManager

# Initialize agent manager in session state
if 'agent_manager' not in st.session_state:
    st.session_state.agent_manager = AgentManager()

# Streamlit App
st.title("Chat with My Multi-Tool Agent")

# Sidebar for API credentials and external tools fetching
with st.sidebar:
    st.header("🔑 API Integration")
    st.write("Fetch external tools from your user account")
    
    # API credentials input
    api_key = st.text_input("API Key", type="password", placeholder="ak_...")
    api_secret = st.text_input("API Secret", type="password", placeholder="as_...")
    
    # Fetch button
    if st.button("🔄 Fetch My External Tools", type="primary"):
        if api_key and api_secret:
            try:
                import requests
                from requests.auth import HTTPBasicAuth
                
                # Make API request using the /me endpoint (auto-detects user)
                response = requests.get(
                    "http://localhost:8080/api/users/me",
                    auth=HTTPBasicAuth(api_key, api_secret),
                    timeout=10
                )
                
                if response.status_code == 200:
                    # Save the external tools file
                    with open("external_tool_agents.py", "w") as f:
                        f.write(response.text)
                    
                    st.success("✅ External tools file updated successfully!")
                    st.info("🔄 Reloading tools... You can start using them immediately!")
                    
                    # Force reload of tools and recreate agent
                    try:
                        # Reload tools using agent manager
                        tool_count = st.session_state.agent_manager.reload_tools()
                        st.success(f"🎉 Tools loaded and ready to use! ({tool_count} tools available)")
                    except Exception as reload_error:
                        st.warning(f"⚠️ Tools saved but reload failed: {reload_error}. You may need to restart Streamlit.")
                    
                elif response.status_code == 401:
                    st.error("❌ Authentication failed. Please check your API credentials.")
                elif response.status_code == 403:
                    st.error("❌ Access denied. You can only access your own tools.")
                else:
                    st.error(f"❌ Error fetching tools: {response.status_code}")
                    
            except requests.exceptions.ConnectionError:
                st.error("❌ Could not connect to API server. Make sure it's running on port 8080.")
            except Exception as e:
                st.error(f"❌ Error: {str(e)}")
        else:
            st.warning("⚠️ Please enter both API Key and API Secret")
    
    st.markdown("---")
    st.caption("💡 Get your API credentials from the User Management page")

if "messages" not in st.session_state:
    st.session_state.messages = []

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

if prompt := st.chat_input("What would you like to ask?"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        full_response = ""
        try:
            message_placeholder.text("Assistant is thinking...")
            
            # Use agent manager to run the agent
            result = st.session_state.agent_manager.run_agent(st.session_state.messages)
            full_response = result.final_output
            message_placeholder.markdown(full_response) 
        except Exception as e:
            full_response = f"Sorry, an error occurred: {e}"
            message_placeholder.error(full_response)
        
    st.session_state.messages.append({"role": "assistant", "content": full_response})

# To run the Streamlit app, save this file (e.g., agent.py) 
# and then run `streamlit run agent.py` in your terminal.
