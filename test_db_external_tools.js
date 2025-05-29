// Test script to read all tool groups from database and generate external_tool_agents.py
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

// Helper function to generate Python agent file content (copied from app.js)
function generatePythonAgentFileContent(enabledTools, enabledToolGroups = null) {
  let pythonFileContent = `from agents import Agent, function_tool\n`;
  // Add necessary imports - can be made more dynamic later if needed
  const imports = new Set(['random', 'os', 'asyncio']); // Default imports

  imports.forEach(imp => {
    pythonFileContent += `import ${imp}\n`;
  });
  pythonFileContent += `\n`;

  const externalToolsListEntries = [];

  // Generate individual enabled tools
  enabledTools.forEach(tool => {
    // Sanitize agent name for Python variable/function names
    const agentVarName = tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    // Attempt to extract function name from the tool's code
    const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    const actualToolFuncName = toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${agentVarName}_tool_func`;

    // Add the Python tool function code
    pythonFileContent += `\n# --- ${tool.name.replace(/"/g, '\\\"')} --- \n`;
    pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
    
    // Add the Agent definition
    const escapedInstructions = tool.description.replace(/\'/g, "\\'").replace(/\"/g, '\\"').replace(/\n/g, ' ');
    const escapedName = tool.name.replace(/"/g, '\\"').replace(/\n/g, ' ');
    pythonFileContent += `${agentVarName}_agent = Agent(\n`;
    pythonFileContent += `    name="${escapedName}",\n`;
    pythonFileContent += `    instructions="${escapedInstructions}",\n`;
    pythonFileContent += `    tools=[${actualToolFuncName}]\n`;
    pythonFileContent += `)\n\n`;

    // Prepare entry for external_tools list
    const toolDescriptionForExport = `Call this tool for tasks related to ${tool.name.toLowerCase().replace(/"/g, '\\"').replace(/\n/g, ' ')}.`;
    externalToolsListEntries.push(
      `    ${agentVarName}_agent.as_tool(\n` +
      `        tool_name="get_${agentVarName}_from_specialist_agent",\n` +
      `        tool_description="${toolDescriptionForExport.replace(/'/g, "\\'").replace(/\n/g, ' ')}"\n` +
      `    )`
    );
  });

  // Generate tool groups if provided
  if (enabledToolGroups && enabledToolGroups.length > 0) {
    enabledToolGroups.forEach(group => {
      const groupVarName = group.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      
      // Add comment for the group
      pythonFileContent += `\n# --- ${group.name.replace(/"/g, '\\\"')} Tool Group --- \n`;
      
      // Add all the tool functions for this group
      group.tools.forEach(tool => {
        pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
      });
      
      // Create the agent with all tools
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
  console.log('=== DATABASE INSPECTION ===');
  
  // Check what tool groups exist
  const allGroupsStmt = db.prepare(`
    SELECT tg.id, tg.name, tg.instructions,
           COUNT(tgt.tool_id) as tool_count
    FROM tool_groups tg
    LEFT JOIN tool_group_tools tgt ON tg.id = tgt.tool_group_id
    GROUP BY tg.id, tg.name, tg.instructions
    ORDER BY tg.name ASC
  `);
  const allGroups = allGroupsStmt.all();
  
  console.log(`Found ${allGroups.length} tool groups:`);
  allGroups.forEach(group => {
    console.log(`- ID: ${group.id}, Name: "${group.name}", Tools: ${group.tool_count}`);
    console.log(`  Instructions: ${group.instructions.substring(0, 100)}...`);
  });
  
  // Check what individual tools exist
  const allToolsStmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
  const allTools = allToolsStmt.all();
  
  console.log(`\nFound ${allTools.length} individual tools:`);
  allTools.forEach(tool => {
    console.log(`- ID: ${tool.id}, Name: "${tool.name}"`);
  });
  
  console.log('\n=== GENERATING EXTERNAL TOOLS FILE WITH ALL TOOL GROUPS ===');
  
  // Get all tool groups with their tools (like the web server does)
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
  
  console.log('Tool groups with their tools:');
  enabledToolGroups.forEach(group => {
    console.log(`- Group "${group.name}" has ${group.tools.length} tools:`);
    group.tools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
  });
  
  // Generate using no individual tools (empty array) and all tool groups
  const enabledTools = []; // Empty - using only tool groups
  const pythonFileContent = generatePythonAgentFileContent(enabledTools, enabledToolGroups);
  const filePath = path.join(__dirname, 'external_tool_agents.py');
  
  fs.writeFileSync(filePath, pythonFileContent);
  console.log(`\n✅ external_tool_agents.py generated successfully at ${filePath}`);
  console.log(`✅ Generated file contains ${enabledToolGroups.length} tool groups`);
  
  // Show a preview of what was generated
  console.log('\n=== PREVIEW OF GENERATED FILE ===');
  const lines = pythonFileContent.split('\n');
  console.log('First 20 lines:');
  lines.slice(0, 20).forEach((line, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}: ${line}`);
  });
  
  console.log(`\n... (${lines.length - 40} lines omitted) ...\n`);
  
  console.log('Last 20 lines:');
  lines.slice(-20).forEach((line, index) => {
    const lineNum = lines.length - 20 + index + 1;
    console.log(`${String(lineNum).padStart(2, '0')}: ${line}`);
  });
  
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
} 