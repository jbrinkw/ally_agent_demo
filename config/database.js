/**
 * Database Configuration and Setup
 * 
 * Handles SQLite database initialization, schema creation, and exports the database instance.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Setup for ES Modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure 'db' directory exists
const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("Created 'db' directory for databases.");
}

// Initialize database
const db = new Database(path.join(dbDir, 'tools.db'));

// Create database schema
async function initializeSchema() {
  // Create the 'users' table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create the 'tools' table
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

  // Create user-specific tool selections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tool_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tool_id INTEGER NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
      UNIQUE(user_id, tool_id)
    )
  `);

  // Create user-specific tool group selections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tool_group_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tool_group_id INTEGER NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tool_group_id) REFERENCES tool_groups(id) ON DELETE CASCADE,
      UNIQUE(user_id, tool_group_id)
    )
  `);

  // Create user API credentials table (legacy)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_api_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      api_secret TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id)
    )
  `);

  // Create OAuth 2.0 tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT NOT NULL,
      client_name TEXT NOT NULL,
      redirect_uris TEXT,
      grant_types TEXT DEFAULT 'authorization_code,client_credentials',
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      redirect_uri TEXT,
      scope TEXT,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_access_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      scope TEXT,
      expires_at DATETIME NOT NULL,
      revoked BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create a default user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const defaultUser = db.prepare('INSERT INTO users (name) VALUES (?)').run('Default User');
    console.log('Created default user with ID:', defaultUser.lastInsertRowid);
  }

  // Generate API credentials for users who don't have them (legacy support)
  const usersWithoutCreds = db.prepare(`
    SELECT u.id, u.name 
    FROM users u 
    LEFT JOIN user_api_credentials c ON u.id = c.user_id 
    WHERE c.user_id IS NULL
  `).all();

  if (usersWithoutCreds.length > 0) {
    const insertCredStmt = db.prepare('INSERT INTO user_api_credentials (user_id, api_key, api_secret) VALUES (?, ?, ?)');
    
    usersWithoutCreds.forEach(user => {
      const apiKey = 'ak_' + crypto.randomBytes(16).toString('hex');
      const apiSecret = 'as_' + crypto.randomBytes(32).toString('hex');
      insertCredStmt.run(user.id, apiKey, apiSecret);
      console.log(`Generated legacy API credentials for user "${user.name}" (ID: ${user.id})`);
    });
  }

  // Generate OAuth clients for users who don't have them
  const usersWithoutOAuth = db.prepare(`
    SELECT u.id, u.name 
    FROM users u 
    LEFT JOIN oauth_clients oc ON u.id = oc.user_id 
    WHERE oc.user_id IS NULL
  `).all();

  if (usersWithoutOAuth.length > 0) {
    const insertOAuthStmt = db.prepare(`
      INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, user_id, redirect_uris, grant_types) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const user of usersWithoutOAuth) {
      const clientId = `ally_agent_user_${user.id}`;
      const clientSecret = crypto.randomBytes(32).toString('base64url');
      const clientSecretHash = await bcrypt.hash(clientSecret, 10);
      const clientName = `${user.name} OAuth Client`;
      const redirectUris = JSON.stringify([
        "http://localhost:8501/oauth/callback",
        "urn:ietf:wg:oauth:2.0:oob"
      ]);
      
      insertOAuthStmt.run(
        clientId, 
        clientSecretHash, 
        clientName, 
        user.id, 
        redirectUris,
        'authorization_code,client_credentials'
      );
      
      console.log(`Generated OAuth client for user "${user.name}" (ID: ${user.id}): ${clientId}`);
      console.log(`  Client Secret: ${clientSecret} (store this securely - shown once)`);
    }
  }

  console.log('Database schema initialized successfully with user management and OAuth 2.0');
}

// Initialize the schema
await initializeSchema();

export default db; 