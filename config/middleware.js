/**
 * Middleware Configuration
 * 
 * Configures and exports all Express middleware including session management,
 * body parsing, static files, and view engine setup.
 */

import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLiteStore = connectSqlite3(session);

/**
 * Configure all middleware for the Express app
 */
export function configureMiddleware(app) {
  // Session Setup
  app.use(session({
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
    // Initialize session variables if they don't exist
    if (!req.session.enabledTools) {
      req.session.enabledTools = []; // Initialize enabled tools as an empty array
    }
    if (!req.session.enabledToolGroups) {
      req.session.enabledToolGroups = []; // Initialize enabled tool groups as an empty array
    }
    if (!req.session.currentUser) {
      // Auto-select the default user if no user is selected
      // This will be set properly when database is available
      req.session.currentUser = null;
    }
    
    // Make session data available in all templates
    res.locals.enabledTools = req.session.enabledTools;
    res.locals.enabledToolsCount = req.session.enabledTools.length;
    res.locals.enabledToolGroups = req.session.enabledToolGroups;
    res.locals.enabledToolGroupsCount = req.session.enabledToolGroups.length;
    res.locals.totalEnabledCount = req.session.enabledTools.length + req.session.enabledToolGroups.length;
    res.locals.currentUser = req.session.currentUser; // Make current user available in all templates
    next();
  });

  // Body parsing middleware
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // Static files middleware
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // View Engine Setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  console.log('Middleware configured successfully');
} 