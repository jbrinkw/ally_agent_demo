/**
 * External Tools Generator Service
 * 
 * Generates the external_tool_agents.py file from enabled tools and tool groups.
 * Handles both regular tools and MCP tools with proper code generation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MCP server tools data for special handling
const mcpServerTools = [
  {
    name: 'get_email_body',
    description: 'Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email that matches the given subject (case-insensitive). Returns a "not found" message if no match.',
    parameters: ['subject']
  },
  {
    name: 'get_recent_emails_summary', 
    description: 'Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries (sender and subject) for all emails. Returns an error string if the inbox file is not found.',
    parameters: []
  },
  {
    name: 'send_email_tool',
    description: 'Sends an email with the provided details. Requires recipient_email, subject_line, and body_content. attachment_file_path is optional. Returns a status message indicating success or failure. Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.',
    parameters: ['recipient_email', 'subject_line', 'body_content', 'attachment_file_path']
  }
];

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
 * Generate fixed MCP tool code
 */
function generateFixedMCPToolCode(tool, serverUrl, parameters) {
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
 * Generate the complete Python agent file content
 */
export function generatePythonAgentFileContent(enabledTools, enabledToolGroups = null) {
  let pythonFileContent = `from agents import Agent, function_tool\n`;
  const imports = ['random', 'os', 'asyncio'];
  imports.forEach(imp => {
    pythonFileContent += `import ${imp}\n`;
  });
  pythonFileContent += `\n`;

  const externalToolsListEntries = [];

  // Generate individual enabled tools
  enabledTools.forEach(tool => {
    // Check if this is an individual MCP tool and handle it specially
    if (['get_email_body', 'get_recent_emails_summary', 'send_email_tool'].includes(tool.name)) {
      // Find the corresponding MCP tool definition
      const mcpTool = mcpServerTools.find(mcp => mcp.name === tool.name);
      if (mcpTool) {
        const fixedCode = generateFixedMCPToolCode(mcpTool, 'http://localhost:8000/mcp', mcpTool.parameters);
        pythonFileContent += `\n# --- ${tool.name.replace(/"/g, '\\\"')} --- \n`;
        pythonFileContent += `# MCP Tool: ${mcpTool.name}\n`;
        pythonFileContent += `# Server URL: http://localhost:8000/mcp\n`;
        pythonFileContent += `# Description: ${mcpTool.description}\n\n`;
        pythonFileContent += `${fixedCode}\n\n`;
        
        const agentVarName = tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        const formattedInstructions = formatInstructions(tool.description);
        const formattedName = tool.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const actualToolFuncName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
        
        pythonFileContent += `${agentVarName}_agent = Agent(\n`;
        pythonFileContent += `    name="${formattedName}",\n`;
        pythonFileContent += `    instructions="${formattedInstructions}",\n`;
        pythonFileContent += `    tools=[${actualToolFuncName}]\n`;
        pythonFileContent += `)\n\n`;

        const toolDescriptionForExport = `Call this tool for tasks related to ${tool.name.toLowerCase().replace(/"/g, '\\"').replace(/\n/g, ' ')}.`;
        externalToolsListEntries.push(
          `    ${agentVarName}_agent.as_tool(\n` +
          `        tool_name="get_${agentVarName}_from_specialist_agent",\n` +
          `        tool_description="${toolDescriptionForExport.replace(/'/g, "\\'").replace(/\n/g, ' ')}"\n` +
          `    )`
        );
      }
    } else {
      const agentVarName = tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      const actualToolFuncName = toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${agentVarName}_tool_func`;

      pythonFileContent += `\n# --- ${tool.name.replace(/"/g, '\\\"')} --- \n`;
      pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
      
      const formattedInstructions = formatInstructions(tool.description);
      const formattedName = tool.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
      
      pythonFileContent += `${agentVarName}_agent = Agent(\n`;
      pythonFileContent += `    name="${formattedName}",\n`;
      pythonFileContent += `    instructions="${formattedInstructions}",\n`;
      pythonFileContent += `    tools=[${actualToolFuncName}]\n`;
      pythonFileContent += `)\n\n`;

      const toolDescriptionForExport = `Call this tool for tasks related to ${tool.name.toLowerCase().replace(/"/g, '\\"').replace(/\n/g, ' ')}.`;
      externalToolsListEntries.push(
        `    ${agentVarName}_agent.as_tool(\n` +
        `        tool_name="get_${agentVarName}_from_specialist_agent",\n` +
        `        tool_description="${toolDescriptionForExport.replace(/'/g, "\\'").replace(/\n/g, ' ')}"\n` +
        `    )`
      );
    }
  });

  // Generate tool groups
  if (enabledToolGroups && enabledToolGroups.length > 0) {
    enabledToolGroups.forEach(group => {
      const groupVarName = group.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      
      pythonFileContent += `\n# --- ${group.name.replace(/"/g, '\\\"')} Tool Group --- \n`;
      
      // Check if this group contains MCP tools (by tool names)
      const mcpToolNames = ['get_email_body', 'get_recent_emails_summary', 'send_email_tool'];
      const groupToolNames = group.tools.map(tool => tool.name);
      const isMCPGroup = mcpToolNames.some(mcpName => groupToolNames.includes(mcpName));
      
      if (isMCPGroup) {
        // Generate fixed MCP tools for any MCP tools in this group
        group.tools.forEach(tool => {
          const mcpTool = mcpServerTools.find(mcp => mcp.name === tool.name);
          if (mcpTool) {
            // This is an MCP tool, generate fixed code
            const fixedCode = generateFixedMCPToolCode(mcpTool, 'http://localhost:8000/mcp', mcpTool.parameters);
            pythonFileContent += `# MCP Tool: ${mcpTool.name}\n`;
            pythonFileContent += `# Server URL: http://localhost:8000/mcp\n`;
            pythonFileContent += `# Description: ${mcpTool.description}\n\n`;
            pythonFileContent += `${fixedCode}\n\n`;
          } else {
            // This is a regular tool in an MCP group, use its existing code
            pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
          }
        });
        
        // Create agent with all tools in the group
        const toolFunctionNames = group.tools.map(tool => {
          const mcpTool = mcpServerTools.find(mcp => mcp.name === tool.name);
          if (mcpTool) {
            return tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
          } else {
            const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            return toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}_tool_func`;
          }
        });
        
        const formattedGroupInstructions = formatInstructions(group.instructions);
        const formattedGroupName = group.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
        
        pythonFileContent += `${groupVarName}_agent = Agent(\n`;
        pythonFileContent += `    name="${formattedGroupName}",\n`;
        pythonFileContent += `    instructions="${formattedGroupInstructions}",\n`;
        pythonFileContent += `    tools=[${toolFunctionNames.join(', ')}]\n`;
        pythonFileContent += `)\n\n`;
      } else {
        // Handle other tool groups normally
        group.tools.forEach(tool => {
          pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
        });
        
        const formattedGroupInstructions = formatInstructions(group.instructions);
        const formattedGroupName = group.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const toolFunctionNames = group.tools.map(tool => {
          const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
          return toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}_tool_func`;
        });
        
        pythonFileContent += `${groupVarName}_agent = Agent(\n`;
        pythonFileContent += `    name="${formattedGroupName}",\n`;
        pythonFileContent += `    instructions="${formattedGroupInstructions}",\n`;
        pythonFileContent += `    tools=[${toolFunctionNames.join(', ')}]\n`;
        pythonFileContent += `)\n\n`;
      }

      // Add to external tools list
      const groupDescriptionForExport = `Call this tool for tasks related to ${group.name.toLowerCase().replace(/"/g, '\\"').replace(/\n/g, ' ')}.`;
      externalToolsListEntries.push(
        `    ${groupVarName}_agent.as_tool(\n` +
        `        tool_name="get_${groupVarName}_from_specialist_agent",\n` +
        `        tool_description="${formatInstructions(groupDescriptionForExport)}"\n` +
        `    )`
      );
    });
  }

  pythonFileContent += `\n# List of directly usable tool objects to be imported by the main agent file\n`;
  pythonFileContent += `external_tools = [\n`;
  if (externalToolsListEntries.length > 0) {
    pythonFileContent += externalToolsListEntries.join(',\n');
  }
  pythonFileContent += `\n]\n`;
  return pythonFileContent;
}

/**
 * Generate and save the external_tool_agents.py file
 */
export function generateExternalToolsFile(enabledTools, enabledToolGroups) {
  const pythonFileContent = generatePythonAgentFileContent(enabledTools, enabledToolGroups);
  const filePath = path.join(__dirname, '..', 'external_tool_agents.py');
  
  fs.writeFileSync(filePath, pythonFileContent);
  console.log(`external_tool_agents.py updated locally from enabled tools and groups at ${filePath}`);
  
  return filePath;
} 