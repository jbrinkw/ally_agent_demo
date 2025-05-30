/**
 * Ally Agent Demo - Main Application
 * 
 * Simplified Express.js application that orchestrates the tool management system.
 * All complex logic has been moved to dedicated modules for better maintainability.
 */

import express from 'express';

// Import configuration modules
import db from './config/database.js';
import { configureMiddleware } from './config/middleware.js';

// Import services
import * as openaiService from './services/openaiService.js';
import * as externalToolsGenerator from './services/externalToolsGenerator.js';

// Import route modules
import { configureToolsRoutes } from './routes/tools.js';
import { configureToolGroupsRoutes } from './routes/toolGroups.js';
import { configureMCPRoutes } from './routes/mcpServer.js';
import { configureUsersRoutes } from './routes/users.js';

// Import utilities
import { seedDatabase } from './utils/seedData.js';

// === Application Setup ===
const app = express();
const port = 3000;

// Configure middleware (session, body parsing, static files, view engine)
configureMiddleware(app);

// === Route Configuration ===

// Configure main routes with dependencies
const toolsRouter = configureToolsRoutes(db, externalToolsGenerator);
const toolGroupsRouter = configureToolGroupsRoutes(db, openaiService);
const mcpRouter = configureMCPRoutes(db);
const usersRouter = configureUsersRoutes(db);

// Mount route modules
app.use('/', toolsRouter);            // Individual tools routes
app.use('/', toolGroupsRouter);       // Tool groups routes  
app.use('/', mcpRouter);              // MCP server routes
app.use('/', usersRouter);            // User management routes

// === Database Seeding ===
// Seed database with example data
seedDatabase(db);

// === Start Server ===
app.listen(port, () => {
  console.log(`🚀 Ally Agent Demo server running at http://localhost:${port}`);

}); 