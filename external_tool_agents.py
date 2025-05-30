from agents import Agent, function_tool
import random
import os
import asyncio


# --- MCP Email Server Tool Group ---
@function_tool
def get_email_body(subject: str) -> str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email      that matches the given subject (case-insensitive).      Returns a 'not found' message if no match.
    
    Parameters:
    subject (str): Parameter for the MCP tool
    
    Returns:
    str: Result from the MCP server
    """
    try:
        from fastmcp import Client
        import asyncio
        
        async def _get_email_body():
            client = Client("http://localhost:8000/mcp/")
            async with client:
                result = await client.call_tool("get_email_body", {"subject": subject})
                return str(result)
        
        # Handle both cases: running in event loop (like Streamlit) and standalone
        try:
            # Try to get the current running loop
            loop = asyncio.get_running_loop()
            # If we're in a running loop, we need to use a different approach
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_email_body())
                return future.result()
        except RuntimeError:
            # No running loop, we can use asyncio.run() safely
            return asyncio.run(_get_email_body())
    except Exception as e:
        return f"Error calling MCP tool 'get_email_body': {str(e)}"

@function_tool
def get_recent_emails_summary() -> str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries      (sender and subject) for all emails. Returns an error string if the inbox file is not found.
    
    Parameters:

    
    Returns:
    str: Result from the MCP server
    """
    try:
        from fastmcp import Client
        import asyncio
        
        async def _get_recent_emails_summary():
            client = Client("http://localhost:8000/mcp/")
            async with client:
                result = await client.call_tool("get_recent_emails_summary", {})
                return str(result)
        
        # Handle both cases: running in event loop (like Streamlit) and standalone
        try:
            # Try to get the current running loop
            loop = asyncio.get_running_loop()
            # If we're in a running loop, we need to use a different approach
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_recent_emails_summary())
                return future.result()
        except RuntimeError:
            # No running loop, we can use asyncio.run() safely
            return asyncio.run(_get_recent_emails_summary())
    except Exception as e:
        return f"Error calling MCP tool 'get_recent_emails_summary': {str(e)}"

@function_tool
def send_email_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str = None) -> str:
    """
    Sends an email with the provided details.      Requires recipient_email, subject_line, and body_content.      attachment_file_path is optional.      Returns a status message indicating success or failure.     Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    
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
            client = Client("http://localhost:8000/mcp/")
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

mcp_email_server_agent = Agent(
    name="MCP Email Server",
    instructions="""**MCP Server Tools Instructions**

1. **What the Tool Group Does:**  
   The MCP Server Tools facilitate email management, allowing you to send emails, retrieve recent email summaries, and fetch the body of specific emails from a simulated inbox.

2. **When to Use It:**  
   Use this tool group when you need to communicate via email, review incoming messages, or extract detailed content from specific emails in your simulated inbox.

3. **How the Tools Work Together:**  
   - Start by using **get_recent_emails_summary** to check your inbox for new messages. This tool provides a quick overview (sender and subject) of recent emails.
   - If you need more details, utilize **get_email_body** with a specific subject to retrieve the content of an email.
   - Finally, when you want to send a response or new communication, employ **send_email_tool**. Ensure you provide the recipient's email, subject, and body content, and confirm that your Gmail credentials are set up correctly. 

These tools collectively streamline email interactions and management.""",
    tools=[get_email_body, get_recent_emails_summary, send_email_tool]
)

# List of directly usable tool objects to be imported by the main agent file
external_tools = [
    mcp_email_server_agent.as_tool(
        tool_name="get_mcp_email_server_from_specialist_agent",
        tool_description="Call this tool for tasks related to mcp_email_server."
    )
]
