/**
 * Users Routes
 * 
 * Handles user management and selection functionality.
 */

import express from 'express';

const router = express.Router();

/**
 * Configure users routes with database
 */
export function configureUsersRoutes(db) {

  /**
   * GET /users - User Management Page
   */
  router.get('/users', (req, res) => {
    try {
      // Fetch all users
      const usersStmt = db.prepare('SELECT id, name, created_at FROM users ORDER BY name ASC');
      const users = usersStmt.all();

      // Get current user from session
      const currentUser = req.session.currentUser || null;

      res.render('users', { 
        users,
        currentUser,
        title: 'User Management'
      });
    } catch (error) {
      console.error("Failed to fetch users:", error);
      res.status(500).send("Failed to load users.");
    }
  });

  /**
   * POST /select-user - Select Current User
   */
  router.post('/select-user', (req, res) => {
    const { userId } = req.body;
    
    try {
      // Fetch user details
      const userStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
      const user = userStmt.get(userId);

      if (!user) {
        return res.status(404).send('User not found');
      }

      // Store current user in session
      req.session.currentUser = {
        id: user.id,
        name: user.name
      };

      // Clear any existing tool/group selections from session
      req.session.enabledTools = [];
      req.session.enabledToolGroups = [];

      // Load user's tool selections
      const toolSelectionsStmt = db.prepare(`
        SELECT tool_id FROM user_tool_selections 
        WHERE user_id = ? AND enabled = 1
      `);
      const toolSelections = toolSelectionsStmt.all(userId);
      req.session.enabledTools = toolSelections.map(row => row.tool_id);

      // Load user's tool group selections
      const groupSelectionsStmt = db.prepare(`
        SELECT tool_group_id FROM user_tool_group_selections 
        WHERE user_id = ? AND enabled = 1
      `);
      const groupSelections = groupSelectionsStmt.all(userId);
      req.session.enabledToolGroups = groupSelections.map(row => row.tool_group_id);

      console.log(`User ${user.name} selected. Loaded ${req.session.enabledTools.length} tools and ${req.session.enabledToolGroups.length} tool groups.`);
      
      res.redirect(req.headers.referer || '/');
    } catch (error) {
      console.error("Failed to select user:", error);
      res.status(500).send("Failed to select user.");
    }
  });

  /**
   * POST /create-user - Create New User
   */
  router.post('/create-user', (req, res) => {
    const { userName } = req.body;
    
    if (!userName || userName.trim() === '') {
      return res.status(400).send('User name is required');
    }

    try {
      const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
      const result = stmt.run(userName.trim());
      
      console.log(`New user "${userName}" created with ID ${result.lastInsertRowid}`);
      res.redirect('/users');
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).send('User name already exists');
      }
      console.error("Failed to create user:", error);
      res.status(500).send("Failed to create user.");
    }
  });

  /**
   * POST /delete-user/:id - Delete User
   */
  router.post('/delete-user/:id', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    
    try {
      // Check if this is the current user
      if (req.session.currentUser && req.session.currentUser.id === userId) {
        // Clear session if deleting current user
        req.session.currentUser = null;
        req.session.enabledTools = [];
        req.session.enabledToolGroups = [];
      }

      const stmt = db.prepare('DELETE FROM users WHERE id = ?');
      const changes = stmt.run(userId);
      
      if (changes.changes > 0) {
        console.log(`User with ID ${userId} deleted successfully`);
        res.redirect('/users');
      } else {
        res.status(404).send('User not found');
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).send("Failed to delete user.");
    }
  });

  return router;
}

export default configureUsersRoutes; 