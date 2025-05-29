#!/usr/bin/env python3
"""
Test script to verify MCP discovery functionality
This simulates what the Node.js app does when discovering MCP servers
"""

import asyncio
import json
import sys
from email_specialist_mcp import mcp as email_mcp_server
from fastmcp import Client

async def test_local_mcp_discovery():
    """Test discovering tools from our local email MCP server"""
    print("🧪 Testing Local MCP Server Discovery")
    print("=" * 50)
    
    try:
        # Test with our local FastMCP server (not via URL but directly)
        async with Client(email_mcp_server) as client:
            tools = await client.list_tools()
            
            print(f"📋 Found {len(tools)} tools:")
            print()
            
            tool_info_list = []
            for i, tool in enumerate(tools, 1):
                tool_info = {
                    'name': tool.name,
                    'description': tool.description or '',
                    'parameters': []
                }
                
                # Extract parameters from input schema
                if hasattr(tool, 'inputSchema') and tool.inputSchema:
                    if 'properties' in tool.inputSchema:
                        tool_info['parameters'] = list(tool.inputSchema['properties'].keys())
                
                tool_info_list.append(tool_info)
                
                print(f"   {i}. {tool.name}")
                print(f"      Description: {tool.description}")
                if tool_info['parameters']:
                    print(f"      Parameters: {', '.join(tool_info['parameters'])}")
                print()
            
            # Simulate the JSON response the UI would get
            result = {
                'success': True,
                'tools': tool_info_list,
                'serverName': 'Email Specialist MCP Server'
            }
            
            print("🔧 JSON Response (what UI would receive):")
            print(json.dumps(result, indent=2))
            
            return result
            
    except Exception as e:
        error_result = {
            'success': False,
            'error': f'Failed to connect to MCP server: {str(e)}'
        }
        print(f"❌ Error: {e}")
        print("🔧 Error JSON Response:")
        print(json.dumps(error_result, indent=2))
        return error_result

async def test_mcp_tool_call():
    """Test calling an MCP tool directly"""
    print("\n🚀 Testing MCP Tool Call")
    print("=" * 50)
    
    try:
        async with Client(email_mcp_server) as client:
            # Test getting recent emails summary
            result = await client.call_tool("get_recent_emails_summary", {})
            print(f"📧 get_recent_emails_summary result:")
            print(result)
            print()
            
            # Test getting a specific email body
            result2 = await client.call_tool("get_email_body", {
                "subject": "Meeting Reminder"
            })
            print(f"📧 get_email_body result:")
            print(result2)
            
            return True
            
    except Exception as e:
        print(f"❌ Error calling MCP tool: {e}")
        return False

async def main():
    """Main test function"""
    print("🧪 MCP UI Integration Test")
    print("=" * 60)
    print("Testing the MCP discovery and tool calling functionality")
    print("that will be used by the web UI")
    print("=" * 60)
    
    # Test 1: Discovery
    discovery_result = await test_local_mcp_discovery()
    
    # Test 2: Tool calling
    tool_call_success = await test_mcp_tool_call()
    
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS")
    print("=" * 60)
    print(f"MCP Discovery:     {'✅ SUCCESS' if discovery_result['success'] else '❌ FAILED'}")
    print(f"MCP Tool Calling:  {'✅ SUCCESS' if tool_call_success else '❌ FAILED'}")
    
    if discovery_result['success'] and tool_call_success:
        print("\n🎉 All tests passed! MCP integration is working.")
        print("You can now test the web UI by:")
        print("1. Go to http://localhost:3000/tool-groups")
        print("2. Click 'Import MCP Server'")
        print("3. For testing local server, you can simulate the discovery")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")

if __name__ == "__main__":
    asyncio.run(main()) 