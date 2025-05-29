from agents import Agent, function_tool
import random
import os
import asyncio


# --- send_email_tool --- 
# MCP Tool: send_email_tool
# Server URL: http://localhost:8000/mcp
# Description: Sends an email with the provided details. Requires recipient_email, subject_line, and body_content. attachment_file_path is optional. Returns a status message indicating success or failure. Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.

@function_tool
def send_email_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str = None) -> str:
    """
    Sends an email with the provided details. Requires recipient_email, subject_line, and body_content. attachment_file_path is optional. Returns a status message indicating success or failure. Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    
    Parameters:
    recipient_email (str): Parameter for the MCP tool
    subject_line (str): Parameter for the MCP tool
    body_content (str): Parameter for the MCP tool
    attachment_file_path (str): Parameter for the MCP tool
    
    Returns:
    str: Result from the MCP server
    """
    try:
        from fastmcp import Client
        import asyncio
        
        async def _send_email_tool():
            client = Client("http://localhost:8000/mcp")
            async with client:
                params = {"recipient_email": recipient_email, "subject_line": subject_line, "body_content": body_content}
                if attachment_file_path:
                    params["attachment_file_path"] = attachment_file_path
                result = await client.call_tool("send_email_tool", params)
                return str(result)
        
        # Handle both cases: running in event loop (like Streamlit) and standalone
        try:
            # Try to get the current running loop
            loop = asyncio.get_running_loop()
            # If we're in a running loop, we need to use a different approach
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _send_email_tool())
                return future.result()
        except RuntimeError:
            # No running loop, we can use asyncio.run() safely
            return asyncio.run(_send_email_tool())
    except Exception as e:
        return f"Error calling MCP tool 'send_email_tool': {str(e)}"

send_email_tool_agent = Agent(
    name="send_email_tool",
    instructions="Sends an email with the provided details. Requires recipient_email, subject_line, and body_content. attachment_file_path is optional. Returns a status message indicating success or failure. Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.",
    tools=[send_email_tool]
)


# List of directly usable tool objects to be imported by the main agent file
external_tools = [
    send_email_tool_agent.as_tool(
        tool_name="get_send_email_tool_from_specialist_agent",
        tool_description="Call this tool for tasks related to send_email_tool."
    )
]
