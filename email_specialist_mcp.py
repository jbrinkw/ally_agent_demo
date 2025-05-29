#!/usr/bin/env python3
"""
Email Specialist FastMCP Server

This MCP server provides email-related functionality including sending emails,
reading email summaries, and getting specific email bodies from a simulated inbox.
"""

import csv
import os
from fastmcp import FastMCP
from send_email import send_email  # Assuming send_email.py is in the same directory

# Constants
EMAIL_INBOX_FILE = "email_inbox.csv"

# Create FastMCP server
mcp = FastMCP("Email Specialist Server")

@mcp.tool()
def send_email_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str = None) -> str:
    """ 
    Sends an email with the provided details. 
    Requires recipient_email, subject_line, and body_content. 
    attachment_file_path is optional. 
    Returns a status message indicating success or failure.
    Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    """
    return send_email(recipient_email, subject_line, body_content, attachment_file_path)

@mcp.tool()
def get_recent_emails_summary() -> list[dict[str, str]] | str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries 
    (sender and subject) for all emails. Returns an error string if the inbox file is not found.
    """
    summaries = []
    try:
        with open(EMAIL_INBOX_FILE, 'r', newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                summaries.append({"sender": row['sender'], "subject": row['subject']})
        if not summaries:
            return "The simulated inbox is empty."
        return summaries
    except FileNotFoundError:
        return f"Error: The simulated email inbox file '{EMAIL_INBOX_FILE}' was not found."
    except Exception as e:
        return f"Error reading simulated inbox: {e}"

@mcp.tool()
def get_email_body(subject: str) -> str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email 
    that matches the given subject (case-insensitive). 
    Returns a 'not found' message if no match.
    """
    try:
        with open(EMAIL_INBOX_FILE, 'r', newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row['subject'].lower() == subject.lower():
                    return row['body']
        return f"Email not found with subject '{subject}'."
    except FileNotFoundError:
        return f"Error: The simulated email inbox file '{EMAIL_INBOX_FILE}' was not found."
    except Exception as e:
        return f"Error reading simulated inbox: {e}"

if __name__ == "__main__":
    # Run the server with streamable-http transport (recommended over SSE)
    print("🚀 Starting Email MCP Server with Streamable HTTP transport on http://localhost:8000")
    print("📧 Server endpoints:")
    print("   - MCP HTTP: http://localhost:8000/mcp")
    print("   - Use this URL in the web UI: http://localhost:8000/mcp")
    print()
    mcp.run(transport="streamable-http", host="localhost", port=8000) 