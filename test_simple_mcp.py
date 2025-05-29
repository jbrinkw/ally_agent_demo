#!/usr/bin/env python3
"""
Simple test using in-memory FastMCP client to verify the server works
"""

import asyncio
from fastmcp import Client
from email_specialist_mcp import mcp as email_mcp_server

async def test_in_memory():
    """Test the MCP server using in-memory client"""
    print("🧪 Testing MCP Server In-Memory")
    print("=" * 40)
    
    try:
        # Create client pointing directly to server instance
        client = Client(email_mcp_server)
        
        async with client:
            # List tools
            tools = await client.list_tools()
            print(f"📋 Found {len(tools)} tools:")
            for i, tool in enumerate(tools, 1):
                print(f"   {i}. {tool.name}")
                print(f"      Description: {tool.description}")
            print()
            
            # Test calling a tool
            print("🚀 Testing tool call: get_recent_emails_summary")
            result = await client.call_tool("get_recent_emails_summary", {})
            print(f"📧 Result: {result}")
            
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_in_memory())
    print(f"\n{'✅ SUCCESS' if success else '❌ FAILED'}: In-memory test") 