"""
Ally Agent Demo - Streamlit Chat Interface

This is the main chat interface for interacting with the AI agent and its tools.
It imports tools from both internal_tool_agents.py (built-in tools) and 
external_tool_agents.py (generated from web UI) and creates a unified chat experience.

Run with: streamlit run agent.py
Access at: http://localhost:8501

The agent will automatically select appropriate tools based on user requests.
"""

import os
from dotenv import load_dotenv
from agents import Agent, Runner
import streamlit as st
import asyncio

# === TOOL IMPORTS ===
# This section imports tools from both internal and external sources

# Attempt to import external tools (now only random number)
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
    model="gpt-4.1-mini"
)
# --- End of Agent Definitions ---

# Check for API Key before starting Streamlit app
if not OPENAI_API_KEY:
    st.error("Error: OPENAI_API_KEY is not set. Please ensure it is in your .env file or set as an environment variable. The application cannot start without it.")
    st.stop()

# Streamlit App
st.title("Chat with My Multi-Tool Agent")

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

# To run the Streamlit app, save this file (e.g., agent.py) 
# and then run `streamlit run agent.py` in your terminal.
