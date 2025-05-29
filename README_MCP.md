# Email Specialist FastMCP Server

This directory contains a FastMCP server implementation for email-related functionality.

## Overview

The `email_specialist_mcp.py` script creates a FastMCP server that provides three main tools:

1. **send_email_tool**: Send emails with attachments
2. **get_recent_emails_summary**: Get summaries of emails in the simulated inbox
3. **get_email_body**: Get the full body of a specific email by subject

## Prerequisites

1. Install FastMCP:
   ```bash
   pip install fastmcp
   ```

2. Set up environment variables for email functionality:
   ```bash
   # For sending emails (optional)
   export GMAIL_USERNAME=your_gmail_username
   export GMAIL_PASSWORD=your_gmail_app_password
   ```

## Usage

### Running the Server

```bash
python email_specialist_mcp.py
```

### Testing the Server

You can test the server using the FastMCP client:

```python
import asyncio
from fastmcp import Client
from email_specialist_mcp import mcp

async def test_email_tools():
    async with Client(mcp) as client:
        # Test getting email summaries
        result = await client.call_tool("get_recent_emails_summary", {})
        print("Email summaries:", result)
        
        # Test getting a specific email body
        result = await client.call_tool("get_email_body", {"subject": "Meeting tomorrow"})
        print("Email body:", result)

asyncio.run(test_email_tools())
```

## Files Required

- `email_inbox.csv`: Simulated email inbox file
- `send_email.py`: Email sending functionality

## Migration Note

This FastMCP server replaces the email specialist functionality that was previously part of `internal_tool_agents.py`. The email specialist has been completely migrated to this standalone MCP server. 