/**
 * Database Configuration and Setup
 * 
 * Handles SQLite database initialization, schema creation, and exports the database instance.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
function initializeSchema() {
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

  // Create a default user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const defaultUser = db.prepare('INSERT INTO users (name) VALUES (?)').run('Default User');
    console.log('Created default user with ID:', defaultUser.lastInsertRowid);
  }

  console.log('Database schema initialized successfully with user management');
}

// Initialize the schema
initializeSchema();

export default db; 