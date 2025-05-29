import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.join(__dirname, 'db');
const db = new Database(path.join(dbDir, 'tools.db'));

// Check MCP tools in the database
const mcpTools = db.prepare('SELECT id, name, code FROM tools WHERE id IN (3,4,5)').all();
console.log('=== MCP TOOLS IN DATABASE ===');
mcpTools.forEach(tool => {
  console.log(`--- Tool: ${tool.name} ---`);
  console.log(tool.code);
  console.log('');
});

db.close(); 