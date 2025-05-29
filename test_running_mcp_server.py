#!/usr/bin/env python3
"""
Test script to verify the running MCP server via HTTP/SSE endpoint
This tests the actual running server that the web UI should connect to
"""

import asyncio
import json
import sys
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def test_running_mcp_server():
    """Test connecting to the running MCP server via SSE"""
    print("🧪 Testing Running MCP Server via HTTP/SSE")
    print("=" * 50)
    
    server_url = "http://localhost:8001/sse"
    print(f"🔗 Connecting to: {server_url}")
    
    try:
        # Connect using SSE client (same as web UI should do)
        async with sse_client(server_url) as (read, write):
            session = ClientSession(read, write)
            await session.initialize()
            
            print("✅ Successfully connected and initialized!")
            print()
            
            # List tools
            tools_result = await session.list_tools()
            
            print(f"📋 Found {len(tools_result.tools)} tools:")
            print()
            
            tool_info_list = []
            for i, tool in enumerate(tools_result.tools, 1):
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
            
            # Test calling a tool
            print("🚀 Testing tool call: get_recent_emails_summary")
            try:
                result = await session.call_tool("get_recent_emails_summary", {})
                print(f"📧 Result: {result}")
                print()
            except Exception as e:
                print(f"❌ Error calling tool: {e}")
                print()
            
            # Simulate the JSON response the UI would get
            result = {
                'success': True,
                'tools': tool_info_list,
                'serverName': 'Email Specialist Server'
            }
            
            print("🔧 JSON Response (what UI should receive):")
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

async def main():
    """Main test function"""
    print("🧪 Running MCP Server Test via HTTP/SSE")
    print("=" * 60)
    print("Testing connection to the actual running MCP server")
    print("that the web UI should be able to connect to")
    print("=" * 60)
    
    # Test connection
    result = await test_running_mcp_server()
    
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS")
    print("=" * 60)
    print(f"MCP HTTP/SSE Connection: {'✅ SUCCESS' if result['success'] else '❌ FAILED'}")
    
    if result['success']:
        print("\n🎉 Success! The MCP server is working correctly.")
        print("The web UI should be able to connect using the same method.")
    else:
        print("\n⚠️  Connection failed. This explains why the web UI can't connect.")
        print("We need to debug the server configuration.")

if __name__ == "__main__":
    asyncio.run(main()) 