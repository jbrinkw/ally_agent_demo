// Test script to generate a corrected external_tool_agents.py file
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Setup for ES Modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database setup
const dbDir = path.join(__dirname, 'db');
const db = new Database(path.join(dbDir, 'tools.db'));

// Fixed MCP tool code generator
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
        
        return asyncio.run(_${toolFunctionName}())
    except Exception as e:
        return f"Error calling MCP tool '${tool.name}': {str(e)}"`;
}

// MCP server tools data (hardcoded since they're in database with broken code)
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

// Helper function to generate Python agent file content with fixes
function generateFixedPythonAgentFileContent(enabledTools, enabledToolGroups = null) {
  let pythonFileContent = `from agents import Agent, function_tool\n`;
  // Add necessary imports
  const imports = ['random', 'os', 'asyncio'];
  imports.forEach(imp => {
    pythonFileContent += `import ${imp}\n`;
  });
  pythonFileContent += `\n`;

  const externalToolsListEntries = [];

  // Generate individual enabled tools (skip for now)
  enabledTools.forEach(tool => {
    // Only process non-MCP tools here
    if (!['get_email_body', 'get_recent_emails_summary', 'send_email_tool'].includes(tool.name)) {
      const agentVarName = tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      const actualToolFuncName = toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${agentVarName}_tool_func`;

      pythonFileContent += `\n# --- ${tool.name.replace(/"/g, '\\\"')} --- \n`;
      pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
      
      const escapedInstructions = tool.description.replace(/\'/g, "\\'").replace(/\"/g, '\\"').replace(/\n/g, ' ');
      const escapedName = tool.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
      pythonFileContent += `${agentVarName}_agent = Agent(\n`;
      pythonFileContent += `    name="${escapedName}",\n`;
      pythonFileContent += `    instructions="${escapedInstructions}",\n`;
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
      
      // Check if this is the MCP Server Tools group
      if (group.name === 'MCP Server Tools') {
        // Generate fixed MCP tools
        mcpServerTools.forEach(mcpTool => {
          const fixedCode = generateFixedMCPToolCode(mcpTool, 'http://localhost:8000/mcp', mcpTool.parameters);
          pythonFileContent += `# MCP Tool: ${mcpTool.name}\n`;
          pythonFileContent += `# Server URL: http://localhost:8000/mcp\n`;
          pythonFileContent += `# Description: ${mcpTool.description}\n\n`;
          pythonFileContent += `${fixedCode}\n\n`;
        });
        
        // Create agent with MCP tools
        const toolFunctionNames = mcpServerTools.map(tool => tool.name.replace(/[^a-zA-Z0-9_]/g, '_'));
        
        pythonFileContent += `${groupVarName}_agent = Agent(\n`;
        pythonFileContent += `    name="MCP Server Tools",\n`;
        pythonFileContent += `    instructions="You are a specialized email management assistant. Here are your capabilities: 1. Sending emails: Use the 'send_email_tool' by collecting recipient_email, subject_line, and body_content from the user. Confirm details before sending. 2. Reading recent email summaries: Utilize the 'get_recent_emails_summary' to provide a list of email senders and subjects. If email_inbox.csv is missing, report the error to the user. 3. Reading a specific email's body: Execute 'get_email_body' when a subject is given. If the subject is ambiguous, refer to summaries from 'get_recent_emails_summary' for clarification. Match subjects case-insensitively. Always relay the outcome from any tool call back to the user. Respond in plain text only. Do not use any Markdown formatting.",\n`;
        pythonFileContent += `    tools=[${toolFunctionNames.join(', ')}]\n`;
        pythonFileContent += `)\n\n`;
      } else {
        // Handle other tool groups normally
        group.tools.forEach(tool => {
          pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
        });
        
        const escapedGroupInstructions = group.instructions.replace(/\'/g, "\\'").replace(/\"/g, '\\"').replace(/\n/g, ' ');
        const escapedGroupName = group.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const toolFunctionNames = group.tools.map(tool => {
          const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
          return toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}_tool_func`;
        });
        
        pythonFileContent += `${groupVarName}_agent = Agent(\n`;
        pythonFileContent += `    name="${escapedGroupName}",\n`;
        pythonFileContent += `    instructions="${escapedGroupInstructions}",\n`;
        pythonFileContent += `    tools=[${toolFunctionNames.join(', ')}]\n`;
        pythonFileContent += `)\n\n`;
      }

      // Add to external tools list
      const groupDescriptionForExport = `Call this tool for tasks related to ${group.name.toLowerCase().replace(/"/g, '\\"').replace(/\n/g, ' ')}.`;
      externalToolsListEntries.push(
        `    ${groupVarName}_agent.as_tool(\n` +
        `        tool_name="get_${groupVarName}_from_specialist_agent",\n` +
        `        tool_description="${groupDescriptionForExport.replace(/'/g, "\\'").replace(/\n/g, ' ')}"\n` +
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

try {
  console.log('=== GENERATING FIXED EXTERNAL TOOLS FILE ===');
  
  // Get all tool groups
  const allGroupsStmt = db.prepare(`
    SELECT tg.id, tg.name, tg.instructions
    FROM tool_groups tg
    ORDER BY tg.name ASC
  `);
  const allGroups = allGroupsStmt.all();
  
  // Get tool groups with their tools (but we'll fix MCP tools manually)
  const enabledToolGroups = allGroups.map(group => {
    const groupToolsStmt = db.prepare(`
      SELECT t.id, t.name, t.description, t.code
      FROM tools t
      JOIN tool_group_tools tgt ON t.id = tgt.tool_id
      WHERE tgt.tool_group_id = ?
      ORDER BY t.name ASC
    `);
    const groupTools = groupToolsStmt.all(group.id);
    return {
      ...group,
      tools: groupTools
    };
  });
  
  console.log('Generating fixed external tools with:');
  enabledToolGroups.forEach(group => {
    console.log(`- Group "${group.name}" with ${group.tools.length} tools`);
  });
  
  // Generate with no individual tools and all tool groups
  const enabledTools = [];
  const pythonFileContent = generateFixedPythonAgentFileContent(enabledTools, enabledToolGroups);
  const filePath = path.join(__dirname, 'external_tool_agents.py');
  
  fs.writeFileSync(filePath, pythonFileContent);
  console.log(`\n✅ FIXED external_tool_agents.py generated successfully!`);
  console.log(`✅ File saved at: ${filePath}`);
  
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
} 