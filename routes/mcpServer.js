/**
 * MCP Server Routes
 * 
 * Handles MCP server discovery and import functionality.
 */

import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Helper function to generate Python code for MCP tools
 */
function generateMCPToolCode(tool, serverUrl) {
  const parameters = tool.parameters || [];
  const toolFunctionName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
  
  // Clean up description for proper Python docstring formatting
  const cleanDescription = (tool.description || 'MCP tool from external server')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim();
  
  // Handle optional parameters properly
  const parameterSignature = parameters.map(param => {
    if (param === 'attachment_file_path') {
      return `${param}: str = None`;
    }
    return `${param}: str`;
  }).join(', ');
  
  // Build parameter dictionary
  let paramDictCode;
  if (parameters.includes('attachment_file_path')) {
    const requiredParams = parameters.filter(p => p !== 'attachment_file_path');
    if (requiredParams.length > 0) {
      paramDictCode = `params = {${requiredParams.map(p => `"${p}": ${p}`).join(', ')}}
                if attachment_file_path:
                    params["attachment_file_path"] = attachment_file_path
                result = await client.call_tool("${tool.name}", params)`;
    } else {
      paramDictCode = `params = {}
                if attachment_file_path:
                    params["attachment_file_path"] = attachment_file_path
                result = await client.call_tool("${tool.name}", params)`;
    }
  } else {
    const paramDict = parameters.length > 0 ? `{${parameters.map(p => `"${p}": ${p}`).join(', ')}}` : '{}';
    paramDictCode = `result = await client.call_tool("${tool.name}", ${paramDict})`;
  }
  
  return `@function_tool
def ${toolFunctionName}(${parameterSignature}) -> str:
    """
    ${cleanDescription}
    
    Parameters:
${parameters.map(param => `    ${param} (str): Parameter for the MCP tool`).join('\n')}
    
    Returns:
    str: Result from the MCP server
    """
    try:
        from fastmcp import Client
        import asyncio
        
        async def _${toolFunctionName}():
            client = Client("${serverUrl}")
            async with client:
                ${paramDictCode}
                return str(result)
        
        # Handle both cases: running in event loop (like Streamlit) and standalone
        try:
            # Try to get the current running loop
            loop = asyncio.get_running_loop()
            # If we're in a running loop, we need to use a different approach
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _${toolFunctionName}())
                return future.result()
        except RuntimeError:
            # No running loop, we can use asyncio.run() safely
            return asyncio.run(_${toolFunctionName}())
    except Exception as e:
        return f"Error calling MCP tool '${tool.name}': {str(e)}"`;
}

/**
 * Format instructions to properly escape for Python strings
 */
function formatInstructions(instructions) {
  return instructions
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/'/g, "\\'")    // Escape single quotes
    .replace(/\n/g, ' ')     // Replace newlines with spaces
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .trim();
}

/**
 * Configure MCP server routes
 */
export function configureMCPRoutes(db) {

  /**
   * GET /import-mcp-server - Display MCP server import form
   */
  router.get('/import-mcp-server', (req, res) => {
    res.render('import-mcp-server', { title: 'Import MCP Server' });
  });

  /**
   * POST /api/mcp-server/discover - Discover tools from MCP server
   */
  router.post('/api/mcp-server/discover', async (req, res) => {
    try {
      const { serverUrl } = req.body;
      
      if (!serverUrl) {
        return res.status(400).json({ success: false, error: 'Server URL is required' });
      }

      // Create a Python script to test the MCP server connection
      const pythonScript = `
import asyncio
import json
import sys
import traceback
from fastmcp import Client
from urllib.parse import urlparse
import httpx

async def discover_mcp_server(server_url):
    try:
        # Parse the URL to determine connection type
        parsed_url = urlparse(server_url)
        
        # For HTTP/HTTPS URLs, use FastMCP Client with URL
        if parsed_url.scheme in ['http', 'https']:
            # Try to connect using FastMCP Client
            client = Client(server_url)
            
            async with client:
                # List tools
                tools = await client.list_tools()
                
                # Extract tool information
                tool_info_list = []
                for tool in tools:
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
                
                return {
                    'success': True,
                    'tools': tool_info_list,
                    'serverName': 'MCP Server'
                }
        else:
            return {
                'success': False,
                'error': 'Only HTTP/HTTPS MCP servers are supported for import'
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': f'Failed to connect to MCP server: {str(e)}'
        }

if __name__ == '__main__':
    import sys
    server_url = sys.argv[1] if len(sys.argv) > 1 else ''
    result = asyncio.run(discover_mcp_server(server_url))
    print(json.dumps(result))
`;

      // Write the Python script to a temporary file
      const tempScriptPath = path.join(__dirname, '..', 'temp_mcp_discover.py');
      fs.writeFileSync(tempScriptPath, pythonScript);

      // Execute the Python script
      const pythonProcess = spawn('python', [tempScriptPath, serverUrl], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let responseCompleted = false; // Track if response has been sent

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          console.warn('Failed to delete temp file:', e);
        }

        // Only send response if we haven't already
        if (!responseCompleted) {
          responseCompleted = true;
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              res.json(result);
            } catch (parseError) {
              console.error('Failed to parse Python output:', stdout);
              res.status(500).json({
                success: false,
                error: 'Failed to parse MCP discovery result'
              });
            }
          } else {
            console.error('Python script failed:', stderr);
            res.status(500).json({
              success: false,
              error: 'Failed to discover MCP server tools'
            });
          }
        }
      });

      // Set a timeout for the discovery process
      const timeoutId = setTimeout(() => {
        // Only send timeout response if we haven't already sent one
        if (!responseCompleted) {
          responseCompleted = true;
          pythonProcess.kill();
          res.status(500).json({
            success: false,
            error: 'MCP server discovery timed out'
          });
        }
      }, 30000); // 30 second timeout

      // Clear timeout if process completes normally
      pythonProcess.on('close', () => {
        clearTimeout(timeoutId);
      });

    } catch (error) {
      console.error('MCP discovery error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during MCP discovery'
      });
    }
  });

  /**
   * POST /import-mcp-server - Handle MCP server import and tool group creation
   */
  router.post('/import-mcp-server', async (req, res) => {
    try {
      const { serverUrl, name, instructions, toolsData } = req.body;
      
      if (!serverUrl || !name || !instructions || !toolsData) {
        return res.status(400).send('All fields are required');
      }

      const tools = JSON.parse(toolsData);
      
      if (!Array.isArray(tools) || tools.length === 0) {
        return res.status(400).send('No tools found to import');
      }

      let toolIds = [];

      db.transaction(() => {
        // Create tools first
        for (const tool of tools) {
          // Generate tool code for MCP tool
          const toolCode = generateMCPToolCode(tool, serverUrl);
          
          // Insert tool into database
          const toolStmt = db.prepare('INSERT INTO tools (name, description, code) VALUES (?, ?, ?)');
          const toolInfo = toolStmt.run(
            tool.name,
            tool.description || 'MCP tool from external server',
            toolCode
          );
          toolIds.push(toolInfo.lastInsertRowid);
        }

        // Create tool group
        const groupStmt = db.prepare('INSERT INTO tool_groups (name, instructions) VALUES (?, ?)');
        const groupInfo = groupStmt.run(name, instructions);
        const groupId = groupInfo.lastInsertRowid;

        // Associate tools with group
        const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
        for (const toolId of toolIds) {
          toolAssocStmt.run(groupId, toolId);
        }
      })();

      console.log(`MCP server imported: ${tools.length} tools, group "${name}" created`);
      res.redirect('/tool-groups?message=mcp_imported');

    } catch (error) {
      console.error('Failed to import MCP server:', error);
      res.status(500).send('Failed to import MCP server');
    }
  });

  return router;
}

export default configureMCPRoutes; 