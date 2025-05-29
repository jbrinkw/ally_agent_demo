// Import necessary modules.
// Express is a web application framework for Node.js, used for building web servers and APIs.
import express from 'express';
// better-sqlite3 is a library for interacting with SQLite databases. It offers a simple API.
import Database from 'better-sqlite3';
// path is a built-in Node.js module for working with file and directory paths.
import path from 'path';
// url is a built-in Node.js module that provides utilities for URL resolution and parsing.
import { fileURLToPath } from 'url';
import session from 'express-session';
// import sessionFileStore from 'session-file-store'; // No longer using session-file-store
import connectSqlite3 from 'connect-sqlite3'; // Using connect-sqlite3 instead
import Papa from 'papaparse';
import fs from 'fs'; // Import File System module
import OpenAI from 'openai';
import { spawn } from 'child_process'; // For spawning Python processes to test MCP servers

// const FileStore = sessionFileStore(session); // Old store
const SQLiteStore = connectSqlite3(session); // New store for connect-sqlite3

// --- OpenAI Setup ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '', // Make sure to set this environment variable
});

// --- Setup for ES Modules __dirname ---
// In ES modules, __dirname (which gives the directory name of the current module) isn't available directly.
// This code recreates it.
// import.meta.url gives the URL of the current module file.
const __filename = fileURLToPath(import.meta.url); // Converts the file URL to a file path.
const __dirname = path.dirname(__filename); // Gets the directory name from the file path.

// --- Ensure 'db' directory exists ---
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("Created 'db' directory for databases.");
}

// --- Initialize Express Application ---
const app = express(); // Create an instance of an Express application.
const port = 3000; // Define the port number the server will listen on.

// --- Session Setup ---
// This should be configured before your routes that need to access sessions.
app.use(session({
  // store: new FileStore({ path: './sessions', ttl: 3600, retries: 0 }), // Old file store config
  store: new SQLiteStore({
    db: 'sessions.sqlite', // Filename for the session database
    dir: './db',          // Directory to store the session database file
    table: 'sessions'     // Name of the table to store sessions
  }),
  secret: 'your new secret key for sqlite sessions', // Replace with a strong secret
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  cookie: {
    // secure: true, // Uncomment in production if using HTTPS
    httpOnly: true, // Helps prevent XSS attacks
    maxAge: 1000 * 60 * 60 * 24 // Cookie valid for 24 hours
  }
}));

// Middleware to make enabled tools and groups available in all templates
app.use((req, res, next) => {
  if (!req.session.enabledTools) {
    req.session.enabledTools = []; // Initialize enabled tools as an empty array
  }
  if (!req.session.enabledToolGroups) {
    req.session.enabledToolGroups = []; // Initialize enabled tool groups as an empty array
  }
  res.locals.enabledTools = req.session.enabledTools;
  res.locals.enabledToolsCount = req.session.enabledTools.length;
  res.locals.enabledToolGroups = req.session.enabledToolGroups;
  res.locals.enabledToolGroupsCount = req.session.enabledToolGroups.length;
  res.locals.totalEnabledCount = req.session.enabledTools.length + req.session.enabledToolGroups.length;
  next();
});

// --- Database Setup ---
// const db = new Database('tools.db'); // Old path
const db = new Database(path.join(dbDir, 'tools.db')); // New path within 'db' directory

// Create the 'tools' table in the database if it doesn't already exist.
// REMOVED input_desc and output_desc columns
db.exec(`
  CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL, -- This will now store agent instructions
    code TEXT -- This will now store the Python tool function code
  )
`);

// Create the 'tool_groups' table for grouping tools together
db.exec(`
  CREATE TABLE IF NOT EXISTS tool_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL, -- Instructions for the combined agent
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create the junction table for tool_groups and tools many-to-many relationship
db.exec(`
  CREATE TABLE IF NOT EXISTS tool_group_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_group_id INTEGER NOT NULL,
    tool_id INTEGER NOT NULL,
    FOREIGN KEY (tool_group_id) REFERENCES tool_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
    UNIQUE(tool_group_id, tool_id)
  )
`);

// --- Middleware Configuration ---
// Middleware functions are functions that have access to the request object (req), the response object (res), 
// and the next middleware function in the application's request-response cycle.

// This middleware parses incoming requests with URL-encoded payloads (e.g., from HTML forms).
// `express.urlencoded({ extended: false })` is used for parsing data submitted via HTML forms (POST requests).
// `extended: false` means it uses the classic `querystring` library for parsing.
app.use(express.urlencoded({ extended: false }));

// This middleware parses incoming JSON payloads (needed for API routes)
app.use(express.json());

// This middleware serves static files (like CSS, JavaScript, images) from the 'public' directory.
// `path.join(__dirname, 'public')` creates an absolute path to the 'public' directory.
// So, if you have a file `public/css/style.css`, it can be accessed via `http://localhost:3000/css/style.css`.
app.use(express.static(path.join(__dirname, 'public')));

// --- View Engine Setup ---
// This configures EJS (Embedded JavaScript) as the template engine for rendering dynamic HTML pages.
app.set('view engine', 'ejs'); // Sets EJS as the view engine.
// This tells Express where to find the EJS template files (in the 'views' directory).
app.set('views', path.join(__dirname, 'views'));


// --- Routes ---
// Routes define how the application responds to client requests to specific endpoints (URIs) and HTTP methods.

/**
 * GET / - Home page: Display a list of all tools.
 * Fetches all tools from the database, prepares a preview for the description (first 2 lines),
 * and renders the 'index.ejs' template to display them.
 */
app.get('/', (req, res) => {
  try {
    // Select only relevant columns, ordered by name.
    const stmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
    const tools = stmt.all();

    const toolsWithPreview = tools.map(tool => ({
      ...tool,
      preview: tool.description.split('\n').slice(0, 2).join('\n')
    }));

    // Check for success message
    let successMessage = null;
    if (req.query.message === 'external_tools_updated') {
      successMessage = 'External tools file successfully updated!';
    } else if (req.query.message === 'mcp_imported') {
      successMessage = 'MCP server tools successfully imported and tool group created!';
    }

    res.render('index', { 
      tools: toolsWithPreview, 
      title: 'All Tools',
      successMessage 
    });
  } catch (error) {
    console.error("Failed to fetch tools:", error);
    res.status(500).send("Failed to load tools.");
  }
});

/**
 * GET /tool/:id - Tool Detail Page: Display details for a specific tool.
 * Fetches a single tool by its ID from the database.
 * Renders the 'tool.ejs' template to show all its information.
 */
app.get('/tool/:id', (req, res) => {
  try {
    // `req.params.id` gets the 'id' parameter from the URL (e.g., if URL is /tool/123, req.params.id is '123').
    // Prepare a SQL statement to select all columns for a tool with the given ID.
    const stmt = db.prepare('SELECT * FROM tools WHERE id = ?');
    const tool = stmt.get(req.params.id); // Execute the statement and get the single tool.

    if (tool) {
      // If the tool is found:
      // Prepare the code for display in a <pre> tag by ensuring newlines are correctly formatted.
      // SQLite might store newlines as \r\n, which <pre> might not render as expected without this.
      tool.formattedCode = tool.code ? tool.code.replace(/\r\n/g, '\n') : '';
      // Render the 'tool.ejs' template, passing the tool data and its name as the title.
      res.render('tool', { tool, title: tool.name });
    } else {
      // If no tool is found with that ID, send a 404 (Not Found) response.
      res.status(404).send('Tool not found');
    }
  } catch (error) {
    // If an error occurs, log it and send a 500 response.
    console.error("Failed to fetch tool:", error);
    res.status(500).send("Failed to load tool details.");
  }
});

/**
 * GET /new - New Tool Form Page: Display a form to add a new tool.
 * Renders the 'form.ejs' template with empty data and an action URL for creating a new tool.
 */
app.get('/new', (req, res) => {
  // Render the 'form.ejs' template.
  // Pass an empty tool object ({}), the action URL for the form submission ('/new'),
  // and a title for the page.
  res.render('form', { tool: {}, action: '/new', title: 'Add New Tool' });
});

/**
 * POST /new - Create New Tool: Handle the submission of the new tool form.
 * Extracts tool data from the request body, validates it, inserts it into the database,
 * and then redirects to the home page.
 */
app.post('/new', (req, res) => {
  const { name, description, code } = req.body; // Removed input_desc, output_desc
  if (!name || !description) {
    return res.status(400).send("Name and Description (Agent Instructions) are required.");
  }
  try {
    const stmt = db.prepare('INSERT INTO tools (name, description, code) VALUES (?, ?, ?)');
    const info = stmt.run(name, description, code);
    console.log(`Tool added with ID: ${info.lastInsertRowid}`);
    res.redirect('/');
  } catch (error) {
    console.error("Failed to add tool:", error);
    res.status(500).send("Failed to add tool.");
  }
});

/**
 * GET /edit/:id - Edit Tool Form Page: Display a form to edit an existing tool.
 * Fetches the tool by ID and renders 'form.ejs' pre-filled with the tool's data.
 */
app.get('/edit/:id', (req, res) => {
  try {
    const toolId = req.params.id; // Get the tool ID from the URL parameter.
    const stmt = db.prepare('SELECT * FROM tools WHERE id = ?');
    const tool = stmt.get(toolId); // Fetch the tool from the database.

    if (tool) {
      // If the tool is found, render the 'form.ejs' template.
      // Pass the fetched 'tool' data to pre-fill the form fields.
      // Set the 'title' for the page.
      // Set the 'action' URL for the form submission to '/edit/:id'.
      res.render('form', { 
        tool, 
        title: `Edit Tool: ${tool.name}`,
        action: `/edit/${tool.id}` 
      });
    } else {
      // If no tool is found with that ID, send a 404 response.
      res.status(404).send('Tool not found');
    }
  } catch (error) {
    // If an error occurs, log it and send a 500 response.
    console.error("Failed to fetch tool for editing:", error);
    res.status(500).send("Failed to load tool for editing.");
  }
});

/**
 * POST /edit/:id - Update Existing Tool: Handle submission of the edit tool form.
 * Extracts updated data, validates it, updates the tool in the database,
 * and redirects to the tool's detail page.
 */
app.post('/edit/:id', (req, res) => {
  const { name, description, code } = req.body; // Removed input_desc, output_desc
  const toolId = req.params.id; // Get tool ID from URL.

  // Basic validation.
  if (!name || !description) {
    return res.status(400).send("Name and Description (Agent Instructions) are required.");
  }

  try {
    // Prepare SQL statement to update an existing tool.
    const stmt = db.prepare('UPDATE tools SET name = ?, description = ?, code = ? WHERE id = ?');
    // Execute the update statement with the new data and the tool ID.
    const info = stmt.run(name, description, code, toolId);

    if (info.changes > 0) {
      // `info.changes` tells how many rows were affected. If > 0, update was successful.
      console.log(`Tool updated with ID: ${toolId}`);
      res.redirect(`/tool/${toolId}`); // Redirect to the updated tool's detail page.
    } else {
      // If no rows were changed (e.g., tool ID not found), send a 404.
      res.status(404).send('Tool not found or no changes made.');
    }
  } catch (error) {
    // If an error occurs, log it and send a 500 response.
    console.error("Failed to update tool:", error);
    res.status(500).send("Failed to update tool.");
  }
});

/**
 * POST /delete/:id - Delete Tool: Handle request to delete a tool.
 * Deletes the tool with the given ID from the database and redirects to the home page.
 */
app.post('/delete/:id', (req, res) => {
  const toolId = req.params.id; // Get tool ID from URL.
  try {
    // Prepare SQL statement to delete a tool by its ID.
    const stmt = db.prepare('DELETE FROM tools WHERE id = ?');
    const info = stmt.run(toolId); // Execute the delete statement.

    if (info.changes > 0) {
      // If a row was deleted, log it and redirect to home page.
      console.log(`Tool deleted with ID: ${toolId}`);
      res.redirect('/');
    } else {
      // If no tool was deleted (e.g., ID not found), send a 404.
      res.status(404).send('Tool not found.');
    }
  } catch (error) {
    // If an error occurs, log it and send a 500 response.
    console.error("Failed to delete tool:", error);
    res.status(500).send("Failed to delete tool.");
  }
});

/**
 * GET /tool-groups - Display all tool groups
 */
app.get('/tool-groups', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT tg.id, tg.name, tg.instructions,
             COUNT(tgt.tool_id) as tool_count
      FROM tool_groups tg
      LEFT JOIN tool_group_tools tgt ON tg.id = tgt.tool_group_id
      GROUP BY tg.id, tg.name, tg.instructions
      ORDER BY tg.name ASC
    `);
    const toolGroups = stmt.all();

    const toolGroupsWithPreview = toolGroups.map(group => ({
      ...group,
      preview: group.instructions.split('\n').slice(0, 2).join('\n')
    }));

    // Check for success message
    const successMessage = req.query.message === 'external_tools_updated' ? 
      'External tools file successfully updated!' : null;

    res.render('tool-groups', { 
      toolGroups: toolGroupsWithPreview, 
      title: 'Tool Groups',
      successMessage 
    });
  } catch (error) {
    console.error("Failed to fetch tool groups:", error);
    res.status(500).send("Failed to load tool groups.");
  }
});

/**
 * GET /tool-group/:id - Display details for a specific tool group
 */
app.get('/tool-group/:id', (req, res) => {
  try {
    const groupId = req.params.id;
    const groupStmt = db.prepare('SELECT * FROM tool_groups WHERE id = ?');
    const toolGroup = groupStmt.get(groupId);

    if (!toolGroup) {
      return res.status(404).send('Tool group not found');
    }

    // Get tools in this group
    const toolsStmt = db.prepare(`
      SELECT t.id, t.name, t.description, t.code
      FROM tools t
      JOIN tool_group_tools tgt ON t.id = tgt.tool_id
      WHERE tgt.tool_group_id = ?
      ORDER BY t.name ASC
    `);
    const groupTools = toolsStmt.all(groupId);

    res.render('tool-group-detail', { 
      toolGroup, 
      tools: groupTools, 
      title: toolGroup.name 
    });
  } catch (error) {
    console.error("Failed to fetch tool group:", error);
    res.status(500).send("Failed to load tool group details.");
  }
});

/**
 * GET /new-tool-group - Display form to create a new tool group
 */
app.get('/new-tool-group', (req, res) => {
  try {
    // Get all available tools
    const stmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
    const allTools = stmt.all();
    
    res.render('tool-group-form', { 
      toolGroup: {}, 
      selectedToolIds: [],
      allTools, 
      action: '/new-tool-group', 
      title: 'Create New Tool Group' 
    });
  } catch (error) {
    console.error("Failed to load tools for new tool group:", error);
    res.status(500).send("Failed to load form.");
  }
});

/**
 * POST /new-tool-group - Handle creation of new tool group
 */
app.post('/new-tool-group', (req, res) => {
  const { name, instructions, toolIds } = req.body;
  
  if (!name || !instructions) {
    return res.status(400).send("Name and Instructions are required.");
  }

  try {
    db.transaction(() => {
      // Insert the tool group
      const groupStmt = db.prepare('INSERT INTO tool_groups (name, instructions) VALUES (?, ?)');
      const groupInfo = groupStmt.run(name, instructions);
      const groupId = groupInfo.lastInsertRowid;

      // Insert tool associations if any tools were selected
      if (toolIds && toolIds.length > 0) {
        const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
        const toolIdArray = Array.isArray(toolIds) ? toolIds : [toolIds];
        
        for (const toolId of toolIdArray) {
          toolAssocStmt.run(groupId, parseInt(toolId, 10));
        }
      }
    })();

    console.log(`Tool group "${name}" created successfully`);
    res.redirect('/tool-groups');
  } catch (error) {
    console.error("Failed to create tool group:", error);
    res.status(500).send("Failed to create tool group.");
  }
});

/**
 * GET /edit-tool-group/:id - Display form to edit an existing tool group
 */
app.get('/edit-tool-group/:id', (req, res) => {
  try {
    const groupId = req.params.id;
    
    // Get the tool group
    const groupStmt = db.prepare('SELECT * FROM tool_groups WHERE id = ?');
    const toolGroup = groupStmt.get(groupId);

    if (!toolGroup) {
      return res.status(404).send('Tool group not found');
    }

    // Get all available tools
    const allToolsStmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
    const allTools = allToolsStmt.all();

    // Get currently selected tools for this group
    const selectedToolsStmt = db.prepare('SELECT tool_id FROM tool_group_tools WHERE tool_group_id = ?');
    const selectedToolRows = selectedToolsStmt.all(groupId);
    const selectedToolIds = selectedToolRows.map(row => row.tool_id);

    res.render('tool-group-form', { 
      toolGroup, 
      selectedToolIds,
      allTools, 
      action: `/edit-tool-group/${groupId}`, 
      title: `Edit Tool Group: ${toolGroup.name}` 
    });
  } catch (error) {
    console.error("Failed to load tool group for editing:", error);
    res.status(500).send("Failed to load tool group for editing.");
  }
});

/**
 * POST /edit-tool-group/:id - Handle updating an existing tool group
 */
app.post('/edit-tool-group/:id', (req, res) => {
  const { name, instructions, toolIds } = req.body;
  const groupId = req.params.id;
  
  if (!name || !instructions) {
    return res.status(400).send("Name and Instructions are required.");
  }

  try {
    db.transaction(() => {
      // Update the tool group
      const groupStmt = db.prepare('UPDATE tool_groups SET name = ?, instructions = ? WHERE id = ?');
      const info = groupStmt.run(name, instructions, groupId);

      if (info.changes === 0) {
        throw new Error('Tool group not found');
      }

      // Delete existing tool associations
      const deleteStmt = db.prepare('DELETE FROM tool_group_tools WHERE tool_group_id = ?');
      deleteStmt.run(groupId);

      // Insert new tool associations if any tools were selected
      if (toolIds && toolIds.length > 0) {
        const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
        const toolIdArray = Array.isArray(toolIds) ? toolIds : [toolIds];
        
        for (const toolId of toolIdArray) {
          toolAssocStmt.run(groupId, parseInt(toolId, 10));
        }
      }
    })();

    console.log(`Tool group "${name}" updated successfully`);
    res.redirect(`/tool-group/${groupId}`);
  } catch (error) {
    console.error("Failed to update tool group:", error);
    res.status(500).send("Failed to update tool group.");
  }
});

/**
 * POST /delete-tool-group/:id - Delete a tool group
 */
app.post('/delete-tool-group/:id', (req, res) => {
  const groupId = req.params.id;
  try {
    const stmt = db.prepare('DELETE FROM tool_groups WHERE id = ?');
    const info = stmt.run(groupId);

    if (info.changes > 0) {
      console.log(`Tool group deleted with ID: ${groupId}`);
      res.redirect('/tool-groups');
    } else {
      res.status(404).send('Tool group not found.');
    }
  } catch (error) {
    console.error("Failed to delete tool group:", error);
    res.status(500).send("Failed to delete tool group.");
  }
});

/**
 * POST /generate-instructions - Generate instructions using OpenAI based on selected tools
 */
app.post('/generate-instructions', express.json(), async (req, res) => {
  try {
    const { toolIds, tools: mcpTools, groupName } = req.body;
    
    let tools = [];
    
    // Handle MCP tools passed directly (for import flow)
    if (mcpTools && Array.isArray(mcpTools)) {
      tools = mcpTools;
    } 
    // Handle regular tool IDs (for existing tool group creation)
    else if (toolIds && toolIds.length > 0) {
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
      }

      // Fetch tool details
      const placeholders = toolIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT id, name, description FROM tools WHERE id IN (${placeholders})`);
      tools = stmt.all(...toolIds.map(id => parseInt(id, 10)));

      if (tools.length === 0) {
        return res.status(404).json({ error: 'No tools found for the selected IDs.' });
      }
    } else {
      return res.status(400).json({ error: 'No tools provided for instruction generation.' });
    }

    // Check if OpenAI API key is configured (for MCP tools flow)
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    // Create the system prompt based on email specialist pattern
    const systemPrompt = `You are an AI assistant that writes concise, clear instructions for specialized agents. 

Look at this example from an email specialist agent:
"You are a specialized email assistant. You have several capabilities: 
1. Sending emails: If the user wants to send an email, gather all necessary details (recipient, subject, body, optional attachment path), then use the '_send_email_tool'. Remind the user about GMAIL environment variables for sending. 
2. Reading recent email summaries: If the user asks to check their emails or see recent emails, use the '_get_recent_emails_summary' tool to list senders and subjects from their simulated inbox. You can use the output of this tool to help identify specific emails later. 
3. Reading a specific email's body: To use the '_get_email_body' tool, you need the exact subject line. 
   If the user provides the subject, you can directly use the '_get_email_body' tool. 
   If the subject is not clear, you can use the email summaries from '_get_recent_emails_summary' to help the user identify the correct subject, then ask them to confirm the subject they want to read before calling '_get_email_body'. 
Always relay the outcome (success, data, or error message) from any tool call back to the user. 
If sending an email, prepend your response with EMAIL SENT or EMAIL NOT SENT based on the tool outcome. 
Respond in plain text only. Do not use any Markdown formatting."

Write similar concise instructions that:
1. Start with "You are a specialized [domain] assistant" based on the tools
2. List each capability with brief, direct guidance
3. Include key usage notes for each tool
4. End with "Always relay the outcome from any tool call back to the user. Respond in plain text only. Do not use any Markdown formatting."

Keep it concise and practical - focus on essential usage patterns only.`;

    // Create the user prompt with tool information
    const toolDescriptions = tools.map((tool, index) => 
      `${index + 1}. **${tool.name}**: ${tool.description.split('\n').slice(0, 3).join(' ')}`
    ).join('\n');

    const userPrompt = `Please generate instructions for an agent that will have access to these tools:

${toolDescriptions}

The agent should be able to use these tools effectively to help users with related tasks.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const generatedInstructions = completion.choices[0]?.message?.content;

    if (!generatedInstructions) {
      return res.status(500).json({ error: 'Failed to generate instructions from OpenAI.' });
    }

    res.json({ success: true, instructions: generatedInstructions });

  } catch (error) {
    console.error('Failed to generate instructions:', error);
    
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key.' });
    } else if (error.status === 429) {
      return res.status(429).json({ error: 'OpenAI API rate limit exceeded. Please try again later.' });
    }
    
    res.status(500).json({ error: 'Failed to generate instructions: ' + error.message });
  }
});

/**
 * GET /import-mcp-server - Display form to import MCP server
 */
app.get('/import-mcp-server', (req, res) => {
  res.render('import-mcp-server', { title: 'Import MCP Server' });
});

/**
 * POST /api/mcp-server/discover - Discover tools from MCP server
 */
app.post('/api/mcp-server/discover', async (req, res) => {
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
    const tempScriptPath = path.join(__dirname, 'temp_mcp_discover.py');
    fs.writeFileSync(tempScriptPath, pythonScript);

    // Execute the Python script
    const pythonProcess = spawn('python', [tempScriptPath, serverUrl], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

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
    });

    // Set a timeout for the discovery process
    setTimeout(() => {
      pythonProcess.kill();
      res.status(500).json({
        success: false,
        error: 'MCP server discovery timed out'
      });
    }, 30000); // 30 second timeout

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
app.post('/import-mcp-server', async (req, res) => {
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

// Function to properly escape and format instructions as a single-line string
function formatInstructions(instructions) {
  return instructions
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/'/g, "\\'")    // Escape single quotes
    .replace(/\n/g, ' ')     // Replace newlines with spaces
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .trim();
}

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

// Helper function to generate Python code for MCP tools (legacy support)
function generateMCPToolCode(tool, serverUrl) {
  const parameters = tool.parameters || [];
  return generateFixedMCPToolCode(tool, serverUrl, parameters);
}

/**
 * POST /tools/toggle/:id - Toggle a tool on/off for enabled tools.
 * Adds or removes the tool ID from the session enabledTools array.
 */
app.post('/tools/toggle/:id', (req, res) => {
  const toolId = parseInt(req.params.id, 10);
  if (req.session.enabledTools.includes(toolId)) {
    req.session.enabledTools = req.session.enabledTools.filter(id => id !== toolId);
  } else {
    req.session.enabledTools.push(toolId);
  }
  // Redirect back to the page the user was on, or to home page
  res.redirect(req.headers.referer || '/'); 
});

/**
 * POST /tool-groups/toggle/:id - Toggle a tool group on/off for enabled tool groups.
 * Adds or removes the tool group ID from the session enabledToolGroups array.
 */
app.post('/tool-groups/toggle/:id', (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  if (req.session.enabledToolGroups.includes(groupId)) {
    req.session.enabledToolGroups = req.session.enabledToolGroups.filter(id => id !== groupId);
  } else {
    req.session.enabledToolGroups.push(groupId);
  }
  // Redirect back to the page the user was on, or to tool groups page
  res.redirect(req.headers.referer || '/tool-groups'); 
});

/**
 * POST /tools/update-external - Update external_tool_agents.py from enabled tools and tool groups.
 */
app.post('/tools/update-external', (req, res) => {
  try {
    const hasEnabledTools = req.session.enabledTools && req.session.enabledTools.length > 0;
    const hasEnabledGroups = req.session.enabledToolGroups && req.session.enabledToolGroups.length > 0;

    let enabledTools = [];
    let enabledToolGroups = [];

    // Fetch enabled individual tools
    if (hasEnabledTools) {
      const toolPlaceholders = req.session.enabledTools.map(() => '?').join(',');
      const toolStmt = db.prepare(`SELECT id, name, description, code FROM tools WHERE id IN (${toolPlaceholders}) ORDER BY name ASC`);
      enabledTools = toolStmt.all(...req.session.enabledTools);
    }

    // Fetch enabled tool groups with their tools
    if (hasEnabledGroups) {
      const groupPlaceholders = req.session.enabledToolGroups.map(() => '?').join(',');
      const groupStmt = db.prepare(`
        SELECT tg.id, tg.name, tg.instructions
        FROM tool_groups tg 
        WHERE tg.id IN (${groupPlaceholders}) 
        ORDER BY tg.name ASC
      `);
      const groups = groupStmt.all(...req.session.enabledToolGroups);
      
      // For each group, get its tools
      enabledToolGroups = groups.map(group => {
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
    }

    const pythonFileContent = generatePythonAgentFileContent(enabledTools, enabledToolGroups);
    const filePath = path.join(__dirname, 'external_tool_agents.py');

    fs.writeFileSync(filePath, pythonFileContent);
    console.log(`external_tool_agents.py updated locally from enabled tools and groups at ${filePath}`);
    
    // Redirect back to appropriate page with a success message
    const fromPage = req.headers.referer;
    if (fromPage && fromPage.includes('/tool-groups')) {
      res.redirect('/tool-groups?message=external_tools_updated');
    } else {
      res.redirect('/?message=external_tools_updated');
    }

  } catch (error) {
    console.error("Failed to update local external_tool_agents.py:", error);
    res.status(500).send("Error updating local external tools file.");
  }
});



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

// --- Helper function to generate Python agent file content ---
function generatePythonAgentFileContent(enabledTools, enabledToolGroups = null) {
  let pythonFileContent = `from agents import Agent, function_tool\n`;
  const imports = ['random', 'os', 'asyncio'];
  imports.forEach(imp => {
    pythonFileContent += `import ${imp}\n`;
  });
  pythonFileContent += `\n`;

  const externalToolsListEntries = [];

  // Generate individual enabled tools (handle MCP tools specially, skip others that are MCP tools)
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



// --- Start the Server ---
// This starts the HTTP server and makes it listen for incoming requests on the defined port.
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  // This message will be printed to the console when the server starts successfully.
});

// --- Example Tool (Seed Data) - Updated to new format ---
const randomAgentInstructions = `You are a specialized random number agent. Use the '_generate_actual_random_number' tool to get a random number. Then, return it in a string format like: \'Here\\\'s a random number for you: [number]\'`;
const randomAgentCode = `@function_tool
def _generate_actual_random_number() -> int:
    """Generates a random integer between 1 and 100 (inclusive)."""
    return random.randint(1, 100)`;

const fileReaderAgentInstructions = `You are a specialized file reader agent. Use the '_read_test_data_file_content' tool to read the contents of 'test_data.txt'. Return the content obtained from the tool, or the error message if the tool provides one.`;
const fileReaderAgentCode = `@function_tool
def _read_test_data_file_content() -> str:
    """Reads the content of 'test_data.txt' from the current working directory and returns it."""
    file_path = "test_data.txt"
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return f"Error: The file '{file_path}' was not found."
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"`;

const exampleToolsData = [
  {
    name: "Random Number Specialist",
    description: randomAgentInstructions,
    code: randomAgentCode
  },
  {
    name: "File Reader Specialist",
    description: fileReaderAgentInstructions,
    code: fileReaderAgentCode
  }
];

// Seed database with example tools if they don't exist
exampleToolsData.forEach(toolData => {
  const existingTool = db.prepare('SELECT id FROM tools WHERE name = ?').get(toolData.name);
  if (!existingTool) {
    try {
      const stmt = db.prepare('INSERT INTO tools (name, description, code) VALUES (?, ?, ?)');
      stmt.run(toolData.name, toolData.description, toolData.code);
      console.log(`Example tool "${toolData.name}" added to the database.`);
    } catch (error) {
      console.error(`Failed to add example tool "${toolData.name}":`, error);
    }
  }
}); 

// Seed database with example tool group if it doesn't exist
const existingGroup = db.prepare('SELECT id FROM tool_groups WHERE name = ?').get('Sample Helper Group');
if (!existingGroup) {
  try {
    db.transaction(() => {
      // Create the tool group
      const groupStmt = db.prepare('INSERT INTO tool_groups (name, instructions) VALUES (?, ?)');
      const groupInfo = groupStmt.run(
        'Sample Helper Group',
        'You are a helpful assistant that can generate random numbers and read files. Use the available tools to help users with these tasks. Always be friendly and helpful in your responses.'
      );
      const groupId = groupInfo.lastInsertRowid;

      // Get the sample tools to add to the group
      const randomTool = db.prepare('SELECT id FROM tools WHERE name = ?').get('Random Number Specialist');
      const fileTool = db.prepare('SELECT id FROM tools WHERE name = ?').get('File Reader Specialist');

      if (randomTool && fileTool) {
        const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
        toolAssocStmt.run(groupId, randomTool.id);
        toolAssocStmt.run(groupId, fileTool.id);
        console.log(`Example tool group "Sample Helper Group" created with 2 tools.`);
      }
    })();
  } catch (error) {
    console.error('Failed to create example tool group:', error);
  }
}