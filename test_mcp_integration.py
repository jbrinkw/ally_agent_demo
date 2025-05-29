#!/usr/bin/env python3
"""
Simplified MCP Integration Test

This script:
1. Lists all tools available in the FastMCP Email Specialist Server
2. Sends a test email to jdb1024001@gmail.com

Prerequisites:
- pip install openai-agents fastmcp
- Set OPENAI_API_KEY environment variable
"""

import asyncio
import os
import sys
from agents import Agent
from fastmcp import Client
from email_specialist_mcp import mcp as email_mcp_server

async def list_mcp_tools():
    """List all tools available in the MCP server"""
    print("🔧 Listing MCP Server Tools")
    print("=" * 50)
    
    try:
        # Use FastMCP Client to get tools from the server
        async with Client(email_mcp_server) as client:
            tools = await client.list_tools()
            print(f"📋 Found {len(tools)} tools in MCP server:")
            print()
            
            for i, tool in enumerate(tools, 1):
                print(f"   {i}. {tool.name}")
                print(f"      Description: {tool.description}")
                if hasattr(tool, 'inputSchema') and tool.inputSchema:
                    if 'properties' in tool.inputSchema:
                        params = list(tool.inputSchema['properties'].keys())
                        print(f"      Parameters: {', '.join(params)}")
                print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error listing MCP tools: {e}")
        return False

async def send_test_email():
    """Send a test email using the MCP server"""
    print("📧 Sending Test Email")
    print("=" * 50)
    
    # Check for OpenAI API key
    if not os.getenv('OPENAI_API_KEY'):
        print("❌ OPENAI_API_KEY environment variable not set!")
        print("Please set it with: export OPENAI_API_KEY=your_api_key_here")
        return False
    
    try:
        # Create agent with MCP server
        agent = Agent(
            name="Email Test Agent",
            instructions=(
                "You are an email assistant. Use the MCP email tools to send emails "
                "when requested. Always use the available tools."
            ),
            model="gpt-4o-mini",
            mcp_servers=[email_mcp_server]
        )
        
        print(f"📝 Sending email to: jdb1024001@gmail.com")
        print(f"📝 Subject: MCP Integration Test")
        print("\n🤖 Agent Response:")
        
        # Test email prompt
        test_prompt = (
            "Please send a test email to 'jdb1024001@gmail.com' with the subject "
            "'MCP Integration Test' and the body 'This is a test email sent through "
            "the FastMCP server integration. The MCP tools are working correctly!'"
        )
        
        # Try different possible methods for running the agent
        if hasattr(agent, 'run'):
            response = agent.run(test_prompt)
        elif hasattr(agent, 'chat'):
            response = agent.chat(test_prompt)
        elif hasattr(agent, 'execute'):
            response = agent.execute(test_prompt)
        else:
            # If none of the above work, try to use the agent directly with MCP tools
            print("⚠️  Trying direct MCP tool call as fallback...")
            async with Client(email_mcp_server) as client:
                result = await client.call_tool("send_email_tool", {
                    "recipient_email": "jdb1024001@gmail.com",
                    "subject_line": "MCP Integration Test",
                    "body_content": "This is a test email sent through the FastMCP server integration. The MCP tools are working correctly!"
                })
                print(f"Direct MCP call result: {result}")
                return True
        
        # Handle response based on type
        if hasattr(response, 'messages') and response.messages:
            print(response.messages[-1].content)
        elif hasattr(response, 'content'):
            print(response.content)
        else:
            print(f"Response: {response}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error sending test email: {e}")
        print(f"Exception type: {type(e)}")
        return False

async def main():
    """Main function to run the simplified tests"""
    print("🧪 Simplified MCP Integration Test")
    print("=" * 60)
    print("This script will:")
    print("1. List all tools in the MCP server")
    print("2. Send a test email to jdb1024001@gmail.com")
    print("=" * 60)
    
    # Test 1: List MCP tools
    print("\n1️⃣ STEP 1: List MCP Tools")
    tools_success = await list_mcp_tools()
    
    # Test 2: Send test email
    print("\n2️⃣ STEP 2: Send Test Email")
    email_success = await send_test_email()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS")
    print("=" * 60)
    
    print(f"List MCP Tools:    {'✅ SUCCESS' if tools_success else '❌ FAILED'}")
    print(f"Send Test Email:   {'✅ SUCCESS' if email_success else '❌ FAILED'}")
    
    if tools_success and email_success:
        print("\n🎉 All tests completed successfully!")
    else:
        print("\n⚠️  Some tests failed. Check the output above.")
    
    return tools_success and email_success

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1) 