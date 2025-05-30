/**
 * Individual Tools Routes
 * 
 * Handles all routes related to individual tool CRUD operations.
 */

import express from 'express';

const router = express.Router();

/**
 * Configure tools routes with database and external tools generator
 */
export function configureToolsRoutes(db, externalToolsGenerator) {

  /**
   * GET / - Home page: Display a list of all tools.
   */
  router.get('/', (req, res) => {
    try {
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
   * GET /tool/:id - Tool Detail Page
   */
  router.get('/tool/:id', (req, res) => {
    try {
      const stmt = db.prepare('SELECT * FROM tools WHERE id = ?');
      const tool = stmt.get(req.params.id);

      if (tool) {
        tool.formattedCode = tool.code ? tool.code.replace(/\r\n/g, '\n') : '';
        res.render('tool', { tool, title: tool.name });
      } else {
        res.status(404).send('Tool not found');
      }
    } catch (error) {
      console.error("Failed to fetch tool:", error);
      res.status(500).send("Failed to load tool.");
    }
  });

  /**
   * GET /new - New Tool Form
   */
  router.get('/new', (req, res) => {
    res.render('form', { 
      tool: { name: '', description: '', code: '' }, 
      title: 'Add New Tool',
      action: '/new'
    });
  });

  /**
   * POST /new - Create New Tool
   */
  router.post('/new', (req, res) => {
    const { name, description, code } = req.body;
    try {
      const stmt = db.prepare('INSERT INTO tools (name, description, code) VALUES (?, ?, ?)');
      const info = stmt.run(name, description, code);
      console.log(`Tool "${name}" created with ID: ${info.lastInsertRowid}`);
      res.redirect(`/tool/${info.lastInsertRowid}`);
    } catch (error) {
      console.error("Failed to create tool:", error);
      res.status(500).send("Failed to create tool.");
    }
  });

  /**
   * GET /edit/:id - Edit Tool Form
   */
  router.get('/edit/:id', (req, res) => {
    try {
      const stmt = db.prepare('SELECT * FROM tools WHERE id = ?');
      const tool = stmt.get(req.params.id);
      
      if (tool) {
        res.render('form', { 
          tool, 
          title: `Edit Tool: ${tool.name}`,
          action: `/edit/${tool.id}`
        });
      } else {
        res.status(404).send('Tool not found');
      }
    } catch (error) {
      console.error("Failed to fetch tool for editing:", error);
      res.status(500).send("Failed to load tool for editing.");
    }
  });

  /**
   * POST /edit/:id - Update Tool
   */
  router.post('/edit/:id', (req, res) => {
    const { name, description, code } = req.body;
    const toolId = req.params.id;
    
    try {
      const stmt = db.prepare('UPDATE tools SET name = ?, description = ?, code = ? WHERE id = ?');
      const changes = stmt.run(name, description, code, toolId);
      
      if (changes.changes > 0) {
        console.log(`Tool "${name}" updated successfully`);
        res.redirect(`/tool/${toolId}`);
      } else {
        res.status(404).send('Tool not found');
      }
    } catch (error) {
      console.error("Failed to update tool:", error);
      res.status(500).send("Failed to update tool.");
    }
  });

  /**
   * POST /delete/:id - Delete Tool
   */
  router.post('/delete/:id', (req, res) => {
    const toolId = req.params.id;
    
    try {
      const stmt = db.prepare('DELETE FROM tools WHERE id = ?');
      const changes = stmt.run(toolId);
      
      if (changes.changes > 0) {
        console.log(`Tool with ID ${toolId} deleted successfully`);
        res.redirect('/');
      } else {
        res.status(404).send('Tool not found');
      }
    } catch (error) {
      console.error("Failed to delete tool:", error);
      res.status(500).send("Failed to delete tool.");
    }
  });

  /**
   * POST /tools/toggle/:id - Toggle tool on/off
   */
  router.post('/tools/toggle/:id', (req, res) => {
    const toolId = parseInt(req.params.id, 10);
    if (req.session.enabledTools.includes(toolId)) {
      req.session.enabledTools = req.session.enabledTools.filter(id => id !== toolId);
    } else {
      req.session.enabledTools.push(toolId);
    }
    res.redirect(req.headers.referer || '/'); 
  });

  /**
   * POST /tools/update-external - Update external_tool_agents.py
   */
  router.post('/tools/update-external', (req, res) => {
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

      externalToolsGenerator.generateExternalToolsFile(enabledTools, enabledToolGroups);
      
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

  return router;
}

export default configureToolsRoutes; 