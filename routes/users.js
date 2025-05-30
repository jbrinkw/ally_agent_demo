/**
 * Users Routes
 * 
 * Handles user management and selection functionality with OAuth 2.0 support.
 */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

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
      // Fetch all users with their OAuth credentials
      const usersStmt = db.prepare(`
        SELECT u.id, u.name, u.created_at, 
               oc.client_id, oc.client_name,
               c.api_key, c.api_secret
        FROM users u
        LEFT JOIN oauth_clients oc ON u.id = oc.user_id
        LEFT JOIN user_api_credentials c ON u.id = c.user_id
        ORDER BY u.name ASC
      `);
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
   * GET /users/:id/oauth-secret - Get OAuth client secret (one-time view)
   */
  router.get('/users/:id/oauth-secret', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    
    try {
      // Get OAuth client secret from database (for one-time display)
      // Note: This is typically only shown once when the client is created
      // In a real system, you'd store a hash and never retrieve the plain secret
      
      // For demonstration, we'll generate a temporary display secret
      // In practice, this would be shown only during client creation
      const clientStmt = db.prepare(`
        SELECT client_id, client_name
        FROM oauth_clients 
        WHERE user_id = ?
      `);
      const client = clientStmt.get(userId);
      
      if (!client) {
        return res.status(404).json({ error: 'OAuth client not found' });
      }
      
      // Generate a new client secret and update the database
      const newClientSecret = crypto.randomBytes(32).toString('base64url');
      const clientSecretHash = await bcrypt.hash(newClientSecret, 10);
      
      const updateStmt = db.prepare(`
        UPDATE oauth_clients 
        SET client_secret_hash = ? 
        WHERE user_id = ?
      `);
      updateStmt.run(clientSecretHash, userId);
      
      res.json({
        client_id: client.client_id,
        client_secret: newClientSecret,
        warning: "This secret will only be shown once. Please save it securely."
      });
      
    } catch (error) {
      console.error("Failed to retrieve OAuth secret:", error);
      res.status(500).json({ error: "Failed to retrieve OAuth secret" });
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
   * POST /create-user - Create New User with OAuth Client
   */
  router.post('/create-user', async (req, res) => {
    const { userName } = req.body;
    
    if (!userName || userName.trim() === '') {
      return res.status(400).send('User name is required');
    }

    try {
      await db.transaction(async () => {
        // Create user
        const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
        const result = stmt.run(userName.trim());
        const userId = result.lastInsertRowid;
        
        // Generate OAuth client credentials
        const clientId = `ally_agent_user_${userId}`;
        const clientSecret = crypto.randomBytes(32).toString('base64url');
        const clientSecretHash = await bcrypt.hash(clientSecret, 10);
        const clientName = `${userName} OAuth Client`;
        const redirectUris = JSON.stringify([
          "http://localhost:8501/oauth/callback",
          "urn:ietf:wg:oauth:2.0:oob"
        ]);
        
        // Store OAuth client
        const oauthStmt = db.prepare(`
          INSERT INTO oauth_clients 
          (client_id, client_secret_hash, client_name, user_id, redirect_uris, grant_types)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        oauthStmt.run(
          clientId, 
          clientSecretHash, 
          clientName, 
          userId, 
          redirectUris,
          'authorization_code,client_credentials'
        );
        
        // Also generate legacy API credentials for backward compatibility
        const apiKey = 'ak_' + crypto.randomBytes(16).toString('hex');
        const apiSecret = 'as_' + crypto.randomBytes(32).toString('hex');
        
        const credStmt = db.prepare('INSERT INTO user_api_credentials (user_id, api_key, api_secret) VALUES (?, ?, ?)');
        credStmt.run(userId, apiKey, apiSecret);
        
        console.log(`New user "${userName}" created with ID ${userId}`);
        console.log(`OAuth Client ID: ${clientId}`);
        console.log(`OAuth Client Secret: ${clientSecret} (shown once)`);
        
        // Store the client secret temporarily in session for display
        req.session.newClientSecret = {
          userId,
          clientId,
          clientSecret,
          userName
        };
      });
      
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