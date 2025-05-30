/**
 * Tool Groups Routes
 * 
 * Handles all routes related to tool group CRUD operations.
 */

import express from 'express';

const router = express.Router();

/**
 * Configure tool groups routes with database and OpenAI service
 */
export function configureToolGroupsRoutes(db, openaiService) {

  /**
   * GET /tool-groups - Tool Groups Page
   */
  router.get('/tool-groups', (req, res) => {
    try {
      // Fetch tool groups with tool count
      const groupStmt = db.prepare(`
        SELECT tg.id, tg.name, tg.instructions, tg.created_at,
               COUNT(tgt.tool_id) as tool_count
        FROM tool_groups tg
        LEFT JOIN tool_group_tools tgt ON tg.id = tgt.tool_group_id
        GROUP BY tg.id, tg.name, tg.instructions, tg.created_at
        ORDER BY tg.name ASC
      `);
      const toolGroups = groupStmt.all();

      // Get user-specific tool group enabled status
      let userEnabledGroups = [];
      if (req.session.currentUser) {
        const enabledStmt = db.prepare(`
          SELECT tool_group_id FROM user_tool_group_selections 
          WHERE user_id = ? AND enabled = 1
        `);
        userEnabledGroups = enabledStmt.all(req.session.currentUser.id).map(row => row.tool_group_id);
      }

      // Add enabled status to each group
      const toolGroupsWithStatus = toolGroups.map(group => ({
        ...group,
        isEnabled: userEnabledGroups.includes(group.id)
      }));

      // Check for success message
      let successMessage = null;
      if (req.query.message === 'external_tools_updated') {
        successMessage = 'External tools file successfully updated!';
      } else if (req.query.message === 'mcp_imported') {
        successMessage = 'MCP server tools successfully imported and tool group created!';
      }

      res.render('tool-groups', { 
        toolGroups: toolGroupsWithStatus,
        title: 'Tool Groups',
        successMessage
      });
    } catch (error) {
      console.error("Failed to fetch tool groups:", error);
      res.status(500).send("Failed to load tool groups.");
    }
  });

  /**
   * GET /tool-group/:id - Tool Group Detail Page
   */
  router.get('/tool-group/:id', (req, res) => {
    try {
      // Fetch tool group
      const groupStmt = db.prepare('SELECT * FROM tool_groups WHERE id = ?');
      const toolGroup = groupStmt.get(req.params.id);

      if (!toolGroup) {
        return res.status(404).send('Tool group not found');
      }

      // Fetch tools in this group
      const toolsStmt = db.prepare(`
        SELECT t.id, t.name, t.description, t.code
        FROM tools t
        JOIN tool_group_tools tgt ON t.id = tgt.tool_id
        WHERE tgt.tool_group_id = ?
        ORDER BY t.name ASC
      `);
      const tools = toolsStmt.all(req.params.id);

      // Format tools code for display
      const formattedTools = tools.map(tool => ({
        ...tool,
        formattedCode: tool.code ? tool.code.replace(/\r\n/g, '\n') : ''
      }));

      res.render('tool-group-detail', { 
        toolGroup, 
        tools: formattedTools,
        title: toolGroup.name 
      });
    } catch (error) {
      console.error("Failed to fetch tool group:", error);
      res.status(500).send("Failed to load tool group.");
    }
  });

  /**
   * GET /new-tool-group - New Tool Group Form
   */
  router.get('/new-tool-group', (req, res) => {
    try {
      // Fetch all available tools
      const toolsStmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
      const availableTools = toolsStmt.all();

      res.render('tool-group-form', { 
        toolGroup: { name: '', instructions: '' },
        availableTools,
        selectedToolIds: [],
        title: 'Create New Tool Group',
        action: '/new-tool-group'
      });
    } catch (error) {
      console.error("Failed to fetch tools for tool group form:", error);
      res.status(500).send("Failed to load tool group form.");
    }
  });

  /**
   * POST /new-tool-group - Create New Tool Group
   */
  router.post('/new-tool-group', (req, res) => {
    const { name, instructions, toolIds } = req.body;
    
    try {
      const toolIdsList = Array.isArray(toolIds) ? toolIds.map(id => parseInt(id, 10)) : 
                          toolIds ? [parseInt(toolIds, 10)] : [];

      db.transaction(() => {
        // Create tool group
        const groupStmt = db.prepare('INSERT INTO tool_groups (name, instructions) VALUES (?, ?)');
        const groupInfo = groupStmt.run(name, instructions);
        const groupId = groupInfo.lastInsertRowid;

        // Associate tools with group
        if (toolIdsList.length > 0) {
          const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
          toolIdsList.forEach(toolId => {
            toolAssocStmt.run(groupId, toolId);
          });
        }

        console.log(`Tool group "${name}" created with ${toolIdsList.length} tools`);
        res.redirect(`/tool-group/${groupId}`);
      })();
    } catch (error) {
      console.error("Failed to create tool group:", error);
      res.status(500).send("Failed to create tool group.");
    }
  });

  /**
   * GET /edit-tool-group/:id - Edit Tool Group Form
   */
  router.get('/edit-tool-group/:id', (req, res) => {
    try {
      // Fetch tool group
      const groupStmt = db.prepare('SELECT * FROM tool_groups WHERE id = ?');
      const toolGroup = groupStmt.get(req.params.id);

      if (!toolGroup) {
        return res.status(404).send('Tool group not found');
      }

      // Fetch all available tools
      const toolsStmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
      const availableTools = toolsStmt.all();

      // Fetch selected tools
      const selectedStmt = db.prepare('SELECT tool_id FROM tool_group_tools WHERE tool_group_id = ?');
      const selectedToolIds = selectedStmt.all(req.params.id).map(row => row.tool_id);

      res.render('tool-group-form', { 
        toolGroup,
        availableTools,
        selectedToolIds,
        title: `Edit Tool Group: ${toolGroup.name}`,
        action: `/edit-tool-group/${toolGroup.id}`
      });
    } catch (error) {
      console.error("Failed to fetch tool group for editing:", error);
      res.status(500).send("Failed to load tool group for editing.");
    }
  });

  /**
   * POST /edit-tool-group/:id - Update Tool Group
   */
  router.post('/edit-tool-group/:id', (req, res) => {
    const { name, instructions, toolIds } = req.body;
    const groupId = req.params.id;
    
    try {
      const toolIdsList = Array.isArray(toolIds) ? toolIds.map(id => parseInt(id, 10)) : 
                          toolIds ? [parseInt(toolIds, 10)] : [];

      db.transaction(() => {
        // Update tool group
        const groupStmt = db.prepare('UPDATE tool_groups SET name = ?, instructions = ? WHERE id = ?');
        const changes = groupStmt.run(name, instructions, groupId);

        if (changes.changes === 0) {
          throw new Error('Tool group not found');
        }

        // Remove existing tool associations
        const deleteStmt = db.prepare('DELETE FROM tool_group_tools WHERE tool_group_id = ?');
        deleteStmt.run(groupId);

        // Add new tool associations
        if (toolIdsList.length > 0) {
          const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
          toolIdsList.forEach(toolId => {
            toolAssocStmt.run(groupId, toolId);
          });
        }

        console.log(`Tool group "${name}" updated with ${toolIdsList.length} tools`);
        res.redirect(`/tool-group/${groupId}`);
      })();
    } catch (error) {
      console.error("Failed to update tool group:", error);
      res.status(500).send("Failed to update tool group.");
    }
  });

  /**
   * POST /delete-tool-group/:id - Delete Tool Group
   */
  router.post('/delete-tool-group/:id', (req, res) => {
    const groupId = req.params.id;
    
    try {
      const stmt = db.prepare('DELETE FROM tool_groups WHERE id = ?');
      const changes = stmt.run(groupId);
      
      if (changes.changes > 0) {
        console.log(`Tool group with ID ${groupId} deleted successfully`);
        res.redirect('/tool-groups');
      } else {
        res.status(404).send('Tool group not found');
      }
    } catch (error) {
      console.error("Failed to delete tool group:", error);
      res.status(500).send("Failed to delete tool group.");
    }
  });

  /**
   * POST /generate-instructions - Generate instructions using OpenAI
   */
  router.post('/generate-instructions', express.json(), async (req, res) => {
    try {
      const { groupName, toolIds, tools } = req.body;

      if (!groupName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Group name is required' 
        });
      }

      let toolsToProcess = [];

      // Handle two cases: existing database tools (toolIds) or raw tool objects (tools)
      if (toolIds && Array.isArray(toolIds) && toolIds.length > 0) {
        // Case 1: Existing database tools - fetch from database by IDs
        const placeholders = toolIds.map(() => '?').join(',');
        const toolStmt = db.prepare(`SELECT name, description FROM tools WHERE id IN (${placeholders})`);
        toolsToProcess = toolStmt.all(...toolIds);
      } else if (tools && Array.isArray(tools) && tools.length > 0) {
        // Case 2: Raw tool objects (e.g., from MCP discovery) - use directly
        toolsToProcess = tools.map(tool => ({
          name: tool.name,
          description: tool.description || 'MCP tool from external server'
        }));
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Either tool IDs or tool objects are required' 
        });
      }

      if (toolsToProcess.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid tools found' 
        });
      }

      const instructions = await openaiService.generateInstructions(groupName, toolsToProcess);

      res.json({ 
        success: true, 
        instructions 
      });

    } catch (error) {
      console.error('Failed to generate instructions:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to generate instructions' 
      });
    }
  });

  /**
   * POST /tool-groups/toggle/:id - Toggle tool group on/off
   */
  router.post('/tool-groups/toggle/:id', (req, res) => {
    const groupId = parseInt(req.params.id, 10);
    
    // Check if user is selected
    if (!req.session.currentUser) {
      return res.status(400).send('Please select a user first to manage tool group selections.');
    }

    const userId = req.session.currentUser.id;
    
    try {
      // Check current state in database
      const currentSelection = db.prepare(`
        SELECT enabled FROM user_tool_group_selections 
        WHERE user_id = ? AND tool_group_id = ?
      `).get(userId, groupId);

      if (currentSelection) {
        // Update existing selection
        const newEnabled = !currentSelection.enabled;
        db.prepare(`
          UPDATE user_tool_group_selections 
          SET enabled = ? 
          WHERE user_id = ? AND tool_group_id = ?
        `).run(newEnabled, userId, groupId);
        
        // Update session
        if (newEnabled) {
          if (!req.session.enabledToolGroups.includes(groupId)) {
            req.session.enabledToolGroups.push(groupId);
          }
        } else {
          req.session.enabledToolGroups = req.session.enabledToolGroups.filter(id => id !== groupId);
        }
      } else {
        // Create new selection (enabled)
        db.prepare(`
          INSERT INTO user_tool_group_selections (user_id, tool_group_id, enabled) 
          VALUES (?, ?, 1)
        `).run(userId, groupId);
        
        // Update session
        if (!req.session.enabledToolGroups.includes(groupId)) {
          req.session.enabledToolGroups.push(groupId);
        }
      }

      console.log(`Tool group ${groupId} toggled for user ${req.session.currentUser.name}`);
      res.redirect(req.headers.referer || '/tool-groups');
    } catch (error) {
      console.error("Failed to toggle tool group:", error);
      res.status(500).send("Failed to toggle tool group.");
    }
  });

  return router;
}

export default configureToolGroupsRoutes; 