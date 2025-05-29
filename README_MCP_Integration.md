# MCP Integration Testing with OpenAI Agent SDK

This directory contains a comprehensive test suite for integrating the FastMCP Email Specialist Server with the OpenAI Agent SDK.

## Overview

The integration allows OpenAI agents to seamlessly use MCP (Model Context Protocol) servers as tool providers. This specific test focuses on the email specialist functionality, demonstrating how LLMs can:

1. **List email summaries** - Get sender and subject information from a simulated inbox
2. **Read specific emails** - Retrieve full email bodies by subject matching
3. **Send emails** - Compose and send emails with attachments
4. **Execute workflows** - Combine multiple email operations in sequence

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenAI        │    │   FastMCP       │    │   Email         │
│   Agent SDK     │◄──►│   Server        │◄──►│   Tools         │
│                 │    │                 │    │                 │
│ - Agent         │    │ - Tool Registry │    │ - send_email    │
│ - Instructions  │    │ - MCP Protocol  │    │ - get_summaries │
│ - Model         │    │ - Validation    │    │ - get_body      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Files

### Core Integration Files
- **`test_mcp_integration.py`** - Main test suite that runs automated tests
- **`setup_mcp_test.py`** - Setup script to prepare the environment
- **`requirements_mcp_test.txt`** - Python dependencies for testing

### Supporting Files (Required)
- **`email_specialist_mcp.py`** - FastMCP server with email tools
- **`send_email.py`** - Email sending functionality
- **`email_inbox.csv`** - Simulated email inbox data

## Quick Start

### 1. Run Setup Script
```bash
python setup_mcp_test.py
```
This will:
- Check Python version (3.8+ required)
- Install dependencies from `requirements_mcp_test.txt`
- Create test email data if missing
- Verify all required files exist
- Check for OpenAI API key

### 2. Set OpenAI API Key
```bash
# On Unix/Linux/Mac
export OPENAI_API_KEY=your_api_key_here

# On Windows
set OPENAI_API_KEY=your_api_key_here
```

### 3. Run Integration Tests
```bash
python test_mcp_integration.py
```

## Manual Installation

If you prefer to set up manually:

```bash
# Install dependencies
pip install -r requirements_mcp_test.txt

# Or install individually
pip install openai-agents fastmcp openai

# Set API key
export OPENAI_API_KEY=your_api_key_here
```

## Test Details

### Test Suite Components

The `MCPIntegrationTester` class runs 5 comprehensive tests:

#### 1. **MCP Server Tools Registration Test**
- Verifies that all expected tools are registered with the MCP server
- Checks tool names, descriptions, and parameters
- Expected tools: `send_email_tool`, `get_recent_emails_summary`, `get_email_body`

#### 2. **Email Summaries Test**
- Tests the `get_recent_emails_summary` tool
- Prompt: "I need to check my recent emails. Can you show me a summary of all the emails in my inbox?"
- Verifies the agent can retrieve and display email sender/subject information

#### 3. **Specific Email Body Test**
- Tests the `get_email_body` tool
- Prompt: "Can you get me the body of the email with the subject 'Project Update'?"
- Verifies the agent can retrieve full email content by subject matching

#### 4. **Send Email Test**
- Tests the `send_email_tool`
- Prompt: "Send an email to 'test@example.com' with subject 'MCP Integration Test'..."
- Verifies the agent can compose and send emails

#### 5. **Complete Email Workflow Test**
- Tests multiple tools in sequence
- Prompt: "Show me email summary, get 'Meeting' email body, then send a reply..."
- Verifies the agent can chain operations together

### Test Email Data

The test suite uses simulated email data with these emails:
- **Project Update** from boss@company.com
- **Meeting Tomorrow** from colleague@company.com  
- **Vacation Request Approved** from hr@company.com
- **Contract Review** from client@external.com

## Integration Architecture

### OpenAI Agent Configuration
```python
agent = Agent(
    name="Email Assistant Tester",
    instructions="You are an email assistant...",
    model="gpt-4o-mini",
    mcp_servers=[email_mcp_server]  # ← MCP server integration
)
```

### MCP Server Setup
```python
from fastmcp import FastMCP
mcp = FastMCP("Email Specialist Server")

@mcp.tool()
def send_email_tool(recipient_email: str, subject_line: str, body_content: str):
    # Tool implementation
    pass
```

## Expected Output

When running successfully, you'll see:
```
🧪 MCP Email Specialist Integration Test Suite
================================================================================
🔧 Setting up test environment...
✅ Email data file email_inbox.csv already exists
✅ MCP Integration Tester initialized successfully!
🔧 Agent 'Email Assistant Tester' created with email MCP server

🚀 Starting MCP Integration Tests
================================================================================

============================================================
🧪 Testing: MCP Server Tools Registration
============================================================
📋 Found 3 tools in MCP server:
   1. send_email_tool
      Description: Sends an email with the provided details...
      Parameters: recipient_email, subject_line, body_content, attachment_file_path

   2. get_recent_emails_summary
      Description: Reads the simulated email inbox...

   3. get_email_body
      Description: Reads the simulated email inbox...
      Parameters: subject

✅ All expected tools found in MCP server!

[... additional test output ...]

📊 TEST RESULTS SUMMARY
================================================================================
MCP Tools Registration   ✅ PASSED
Email Summaries          ✅ PASSED
Specific Email Body      ✅ PASSED
Send Email              ✅ PASSED
Complete Workflow       ✅ PASSED

🎯 Overall Results: 5/5 tests passed
🎉 All tests passed! MCP integration is working correctly.
```

## Troubleshooting

### Common Issues

1. **Missing OpenAI API Key**
   ```
   ❌ OPENAI_API_KEY environment variable not set!
   ```
   **Solution**: Set the environment variable with your OpenAI API key

2. **Missing Dependencies**
   ```
   ModuleNotFoundError: No module named 'agents'
   ```
   **Solution**: Run `pip install -r requirements_mcp_test.txt`

3. **Missing Files**
   ```
   ❌ email_specialist_mcp.py missing
   ```
   **Solution**: Ensure all required files are in the same directory

4. **Email Data Missing**
   ```
   Error: The simulated email inbox file 'email_inbox.csv' was not found.
   ```
   **Solution**: Run `setup_mcp_test.py` to create test data

### Debug Mode

For more detailed output, you can modify the test script to include debug information:
```python
# In test_mcp_integration.py, add debug prints
print(f"Debug: Agent response type: {type(response)}")
print(f"Debug: Response messages: {len(response.messages)}")
```

## Advanced Usage

### Custom Test Scenarios

You can add custom test scenarios by extending the `MCPIntegrationTester` class:

```python
async def test_custom_scenario(self):
    """Test a custom email scenario"""
    test_prompt = "Your custom test prompt here"
    
    try:
        response = self.agent.run(test_prompt)
        print(response.messages[-1].content)
        return True
    except Exception as e:
        print(f"❌ Error in custom test: {e}")
        return False
```

### Multiple MCP Servers

The OpenAI Agent SDK supports multiple MCP servers:
```python
agent = Agent(
    name="Multi-Tool Agent",
    instructions="Use all available tools...",
    model="gpt-4o-mini",
    mcp_servers=[email_mcp_server, another_mcp_server]
)
```

## Contributing

To add new tests or improve the integration:

1. Fork the repository
2. Add your test methods to `MCPIntegrationTester`
3. Update the `run_all_tests` method to include new tests
4. Test thoroughly with `python test_mcp_integration.py`
5. Submit a pull request

## References

- [OpenAI Agent SDK Documentation](https://openai.github.io/openai-agents-python/)
- [FastMCP Documentation](https://gofastmcp.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Integration Guide](https://openai.github.io/openai-agents-python/mcp/) 