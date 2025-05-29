#!/usr/bin/env python3
"""
Test script to verify the running MCP server via HTTP endpoint using FastMCP Client
"""

import asyncio
import json
from fastmcp import Client

async def test_http_mcp_server():
    """Test connecting to the running MCP server via HTTP"""
    print("🧪 Testing HTTP MCP Server")
    print("=" * 40)
    
    server_url = "http://localhost:8000/mcp"
    print(f"🔗 Connecting to: {server_url}")
    
    try:
        # Connect using FastMCP Client
        client = Client(server_url)
        
        async with client:
            print("✅ Successfully connected!")
            
            # List tools
            tools = await client.list_tools()
            print(f"📋 Found {len(tools)} tools:")
            
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
            
            # Test calling a tool
            print("🚀 Testing tool call: get_recent_emails_summary")
            result = await client.call_tool("get_recent_emails_summary", {})
            print(f"📧 Result: {result}")
            
            # Simulate the JSON response the UI would get
            result = {
                'success': True,
                'tools': tool_info_list,
                'serverName': 'Email Specialist Server'
            }
            
            print("\n🔧 JSON Response (what UI should receive):")
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

if __name__ == "__main__":
    result = asyncio.run(test_http_mcp_server())
    print(f"\n{'✅ SUCCESS' if result['success'] else '❌ FAILED'}: HTTP MCP test") 