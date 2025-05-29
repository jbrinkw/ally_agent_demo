from agents import Agent, function_tool
import random
import os
import asyncio


# --- File Reader Specialist --- 
@function_tool
def _read_test_data_file_content() -> str:
    """Reads the content of 'test_data.txt' from the current working directory and returns it."""
    file_path = "test_data.txt"
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return f"Error: The file '{file_path}' was not found."
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"

file_reader_specialist_agent = Agent(
    name="File Reader Specialist",
    instructions="You are a specialized file reader agent. Use the \'_read_test_data_file_content\' tool to read the contents of \'test_data.txt\'. Return the content obtained from the tool, or the error message if the tool provides one.",
    tools=[_read_test_data_file_content]
)


# --- Random Number Specialist --- 
@function_tool
def _generate_actual_random_number() -> int:
    """Generates a random integer between 1 and 100 (inclusive)."""
    return random.randint(1, 100)

random_number_specialist_agent = Agent(
    name="Random Number Specialist",
    instructions="You are a specialized random number agent. Use the \'_generate_actual_random_number\' tool to get a random number. Then, return it in a string format like: \'Here\\'s a random number for you: [number]\'",
    tools=[_generate_actual_random_number]
)


# --- MCP Server Tools Tool Group --- 
# MCP Tool: get_email_body
# Server URL: http://localhost:8000/mcp
# Description: 
    Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email 
    that matches the given subject (case-insensitive). 
    Returns a 'not found' message if no match.
    

from fastmcp import Client
import asyncio

async def get_email_body(subject: str):
    """
    
    Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email 
    that matches the given subject (case-insensitive). 
    Returns a 'not found' message if no match.
    
    
    Parameters:
    subject (str): Parameter for the MCP tool
    
    Returns:
    str: Result from the MCP server
    """
    try:
        client = Client("http://localhost:8000/mcp")
        async with client:
            result = await client.call_tool("get_email_body", {"subject": subject})
            return str(result)
    except Exception as e:
        return f"Error calling MCP tool 'get_email_body': {str(e)}"

# For use with @function_tool decorator:
# @function_tool
# def get_email_body_tool(subject: str) -> str:
#     return asyncio.run(get_email_body(subject))


# MCP Tool: get_recent_emails_summary
# Server URL: http://localhost:8000/mcp
# Description: 
    Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries 
    (sender and subject) for all emails. Returns an error string if the inbox file is not found.
    

from fastmcp import Client
import asyncio

async def get_recent_emails_summary():
    """
    
    Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries 
    (sender and subject) for all emails. Returns an error string if the inbox file is not found.
    
    
    Parameters:

    
    Returns:
    str: Result from the MCP server
    """
    try:
        client = Client("http://localhost:8000/mcp")
        async with client:
            result = await client.call_tool("get_recent_emails_summary", {})
            return str(result)
    except Exception as e:
        return f"Error calling MCP tool 'get_recent_emails_summary': {str(e)}"

# For use with @function_tool decorator:
# @function_tool
# def get_recent_emails_summary_tool() -> str:
#     return asyncio.run(get_recent_emails_summary())


# MCP Tool: send_email_tool
# Server URL: http://localhost:8000/mcp
# Description:  
    Sends an email with the provided details. 
    Requires recipient_email, subject_line, and body_content. 
    attachment_file_path is optional. 
    Returns a status message indicating success or failure.
    Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    

from fastmcp import Client
import asyncio

async def send_email_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str):
    """
     
    Sends an email with the provided details. 
    Requires recipient_email, subject_line, and body_content. 
    attachment_file_path is optional. 
    Returns a status message indicating success or failure.
    Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    
    
    Parameters:
    recipient_email (str): Parameter for the MCP tool
    subject_line (str): Parameter for the MCP tool
    body_content (str): Parameter for the MCP tool
    attachment_file_path (str): Parameter for the MCP tool
    
    Returns:
    str: Result from the MCP server
    """
    try:
        client = Client("http://localhost:8000/mcp")
        async with client:
            result = await client.call_tool("send_email_tool", {"recipient_email": recipient_email, "subject_line": subject_line, "body_content": body_content, "attachment_file_path": attachment_file_path})
            return str(result)
    except Exception as e:
        return f"Error calling MCP tool 'send_email_tool': {str(e)}"

# For use with @function_tool decorator:
# @function_tool
# def send_email_tool_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str) -> str:
#     return asyncio.run(send_email_tool(recipient_email, subject_line, body_content, attachment_file_path))


mcp_server_tools_agent = Agent(
    name="MCP Server Tools",
    instructions="You are a specialized email management assistant. Here are your capabilities:  1. Sending emails: Use the \'send_email_tool\' by collecting recipient_email, subject_line, and body_content from the user. Confirm details before sending.  2. Reading recent email summaries: Utilize the \'get_recent_emails_summary\' to provide a list of email senders and subjects. If email_inbox.csv is missing, report the error to the user.  3. Reading a specific email\'s body: Execute \'get_email_body\' when a subject is given. If the subject is ambiguous, refer to summaries from \'get_recent_emails_summary\' for clarification. Match subjects case-insensitively.  Always relay the outcome from any tool call back to the user. Respond in plain text only. Do not use any Markdown formatting.",
    tools=[get_email_body, get_recent_emails_summary, send_email_tool]
)


# List of directly usable tool objects to be imported by the main agent file
external_tools = [
    file_reader_specialist_agent.as_tool(
        tool_name="get_file_reader_specialist_from_specialist_agent",
        tool_description="Call this tool for tasks related to file reader specialist."
    ),
    random_number_specialist_agent.as_tool(
        tool_name="get_random_number_specialist_from_specialist_agent",
        tool_description="Call this tool for tasks related to random number specialist."
    ),
    mcp_server_tools_agent.as_tool(
        tool_name="get_mcp_server_tools_from_specialist_agent",
        tool_description="Call this tool for tasks related to mcp server tools."
    )
]
