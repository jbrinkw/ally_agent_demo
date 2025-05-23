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

// const FileStore = sessionFileStore(session); // Old store
const SQLiteStore = connectSqlite3(session); // New store for connect-sqlite3

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

// Middleware to make cart available in all templates
app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = []; // Initialize cart as an empty array if it doesn't exist
  }
  res.locals.cart = req.session.cart;
  res.locals.cartItemCount = req.session.cart.length;
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

// --- Middleware Configuration ---
// Middleware functions are functions that have access to the request object (req), the response object (res), 
// and the next middleware function in the application's request-response cycle.

// This middleware parses incoming requests with URL-encoded payloads (e.g., from HTML forms).
// `express.urlencoded({ extended: false })` is used for parsing data submitted via HTML forms (POST requests).
// `extended: false` means it uses the classic `querystring` library for parsing.
app.use(express.urlencoded({ extended: false }));

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
    res.render('index', { tools: toolsWithPreview, title: 'All Tools' });
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
 * GET /cart - Display the cart page.
 * Fetches details for tools in the cart and renders the cart view.
 */
app.get('/cart', (req, res) => {
  try {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.render('cart', { tools: [], title: 'Your Shopping Cart', cartItemCount: 0 });
    }
    const placeholders = req.session.cart.map(() => '?').join(',');
    // Select necessary fields, description is now agent instructions
    const stmt = db.prepare(`SELECT id, name, description FROM tools WHERE id IN (${placeholders})`);
    const cartTools = stmt.all(...req.session.cart);
    const toolsWithPreview = cartTools.map(tool => ({
      ...tool,
      preview: tool.description.split('\n').slice(0, 2).join('\n') // Preview of agent instructions
    }));
    res.render('cart', { tools: toolsWithPreview, title: 'Your Shopping Cart' });
  } catch (error) {
    console.error("Failed to load cart:", error);
    res.status(500).send("Error loading your cart.");
  }
});

/**
 * POST /cart/add/:id - Add a tool to the cart.
 * Adds the tool ID to the session cart if not already present.
 */
app.post('/cart/add/:id', (req, res) => {
  const toolId = parseInt(req.params.id, 10);
  if (!req.session.cart.includes(toolId)) {
    req.session.cart.push(toolId);
  }
  // Redirect back to the page the user was on, or to home page
  res.redirect(req.headers.referer || '/'); 
});

/**
 * POST /cart/remove/:id - Remove a tool from the cart.
 * Removes the tool ID from the session cart.
 */
app.post('/cart/remove/:id', (req, res) => {
  const toolId = parseInt(req.params.id, 10);
  req.session.cart = req.session.cart.filter(id => id !== toolId);
  // Redirect back to the page the user was on, or to home page
  res.redirect(req.headers.referer || '/'); 
});

/**
 * GET /cart/export - Export cart items to a CSV file.
 */
app.get('/cart/export', (req, res) => {
  try {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.status(400).send("Your cart is empty. Nothing to export."); 
    }

    const placeholders = req.session.cart.map(() => '?').join(',');
    // Fetch all fields for the tools in the cart
    const stmt = db.prepare(`SELECT id, name, description, code FROM tools WHERE id IN (${placeholders})`);
    const toolsToExport = stmt.all(...req.session.cart);

    if (toolsToExport.length === 0) {
        return res.status(404).send("No tools found in cart for export.");
    }

    // Define CSV headers
    const fields = ['id', 'name', 'description', 'code'];
    const csvString = Papa.unparse({
        fields: fields,
        data: toolsToExport
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tools_export.csv"');
    res.status(200).end(csvString);

  } catch (error) {
    console.error("Failed to export cart to CSV:", error);
    res.status(500).send("Error exporting your cart.");
  }
});

// --- Helper function to generate Python agent file content ---
function generatePythonAgentFileContent(tools) {
  let pythonFileContent = `from agents import Agent, function_tool\n`;
  // Add necessary imports - can be made more dynamic later if needed
  const imports = new Set(['random', 'os']); // Default imports
  
  // Placeholder for more sophisticated import detection if necessary
  // For now, we'll rely on these common ones.
  // We could scan tool.code for 'import xyz' if more robustness is needed.

  imports.forEach(imp => {
    pythonFileContent += `import ${imp}\n`;
  });
  pythonFileContent += `\n`;

  const externalToolsListEntries = [];

  tools.forEach(tool => {
    // Sanitize agent name for Python variable/function names
    const agentVarName = tool.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    // Attempt to extract function name from the tool's code
    // This regex looks for "def function_name(" or "async def function_name("
    const toolFuncMatch = tool.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    const actualToolFuncName = toolFuncMatch && toolFuncMatch[1] ? toolFuncMatch[1] : `_${agentVarName}_tool_func`;

    // Add the Python tool function code
    pythonFileContent += `\n# --- ${tool.name.replace(/"/g, '\\\"')} --- \n`; // Escape quotes in tool name for comment
    pythonFileContent += `${tool.code.replace(/\r\n/g, '\n')}\n\n`;
    
    // Add the Agent definition
    // Ensure description (instructions) is properly escaped for a Python string literal
    const escapedInstructions = tool.description.replace(/\'/g, "\\\'").replace(/\"/g, '\\\"').replace(/\n/g, '\\n');
    pythonFileContent += `${agentVarName}_agent = Agent(\n`;
    pythonFileContent += `    name="${tool.name.replace(/"/g, '\\\"').replace(/\n/g, '\\n')}",\n`;
    pythonFileContent += `    instructions=(\n`;
    pythonFileContent += `        "${escapedInstructions}"\n`;
    pythonFileContent += `    ),\n`;
    pythonFileContent += `    tools=[${actualToolFuncName}]\n`;
    pythonFileContent += `)\n\n`;

    // Prepare entry for external_tools list
    // Ensure tool_description is properly escaped for a Python string literal
    const toolDescriptionForExport = `Call this tool for tasks related to ${tool.name.toLowerCase().replace(/"/g, '\\\"').replace(/\n/g, '\\n')}.`;
    externalToolsListEntries.push(
      `    ${agentVarName}_agent.as_tool(\n` +
      `        tool_name="get_${agentVarName}_from_specialist_agent",\n` +
      `        tool_description="${toolDescriptionForExport.replace(/'/g, "\\\'").replace(/\n/g, '\\n')}"\n` +
      `    )`
    );
  });

  pythonFileContent += `\n# List of directly usable tool objects to be imported by the main agent file\n`;
  pythonFileContent += `external_tools = [\n`;
  if (externalToolsListEntries.length > 0) {
    pythonFileContent += externalToolsListEntries.join(',\n');
  }
  pythonFileContent += `\n]\n`;
  return pythonFileContent;
}

/**
 * POST /cart/export-agent-py - Generate external_tool_agents.py from CART ITEMS and save locally.
 */
app.post('/cart/export-agent-py', (req, res) => {
  try {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.status(400).send("Your cart is empty. No tools to generate the agent file.");
    }

    const placeholders = req.session.cart.map(() => '?').join(',');
    // Fetch full details for tools in the cart
    const stmt = db.prepare(`SELECT id, name, description, code FROM tools WHERE id IN (${placeholders}) ORDER BY name ASC`);
    const toolsInCart = stmt.all(...req.session.cart);

    if (!toolsInCart || toolsInCart.length === 0) {
      // This case should ideally not happen if cart has IDs but DB doesn't find them
      return res.status(404).send("No tools found in the cart for agent file generation.");
    }

    const pythonFileContent = generatePythonAgentFileContent(toolsInCart);
    const filePath = path.join(__dirname, 'external_tool_agents.py');

    fs.writeFileSync(filePath, pythonFileContent);
    console.log(`external_tool_agents.py updated locally from cart items at ${filePath}`);
    
    // Redirect back to cart, maybe with a success message
    res.redirect('/cart?message=agent_file_updated');

  } catch (error) {
    console.error("Failed to update local external_tool_agents.py:", error);
    res.status(500).send("Error updating local agent file.");
  }
});

/**
 * GET /cart/download-agent-file - Download external_tool_agents.py generated from CART ITEMS.
 */
app.get('/cart/download-agent-file', (req, res) => {
  try {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.status(400).send("Your cart is empty. No tools to generate the agent file for download.");
    }

    const placeholders = req.session.cart.map(() => '?').join(',');
    // Fetch full details for tools in the cart
    const stmt = db.prepare(`SELECT id, name, description, code FROM tools WHERE id IN (${placeholders}) ORDER BY name ASC`);
    const toolsInCart = stmt.all(...req.session.cart);

    if (!toolsInCart || toolsInCart.length === 0) {
      return res.status(404).send("No tools found in the cart for agent file generation.");
    }

    const pythonFileContent = generatePythonAgentFileContent(toolsInCart);

    res.setHeader('Content-Type', 'text/x-python');
    res.setHeader('Content-Disposition', 'attachment; filename="external_tool_agents.py"');
    res.status(200).end(pythonFileContent);

  } catch (error) {
    console.error("Failed to generate agent file for download:", error);
    res.status(500).send("Error generating agent file for download.");
  }
});

/**
 * GET /cart/export-agent-py - Export all tools as an external_tool_agents.py file.
 */
app.get('/cart/export-agent-py', (req, res) => {
  try {
    const stmt = db.prepare('SELECT name, description, code FROM tools ORDER BY name ASC');
    const allTools = stmt.all();

    if (!allTools || allTools.length === 0) {
      return res.status(404).send("No tools found in the database to export.");
    }

    const pythonFileContent = generatePythonAgentFileContent(allTools); // Now uses allTools

    res.setHeader('Content-Type', 'text/x-python');
    res.setHeader('Content-Disposition', 'attachment; filename="external_tool_agents.py"');
    res.status(200).end(pythonFileContent);

  } catch (error) {
    console.error("Failed to export agents to Python file:", error);
    res.status(500).send("Error exporting agents.");
  }
});

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