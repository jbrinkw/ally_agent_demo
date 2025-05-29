import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.join(__dirname, 'db');
const db = new Database(path.join(dbDir, 'tools.db'));

// Check all tools in the database
const allTools = db.prepare('SELECT id, name, description, code FROM tools ORDER BY id').all();
console.log(`=== ALL ${allTools.length} TOOLS IN DATABASE ===`);
allTools.forEach(tool => {
  console.log(`\n--- Tool ID: ${tool.id}, Name: "${tool.name}" ---`);
  console.log('Description:', tool.description.substring(0, 100) + '...');
  console.log('Code preview:');
  const codeLines = tool.code ? tool.code.split('\n') : ['No code'];
  codeLines.slice(0, 5).forEach((line, i) => {
    console.log(`  ${i+1}: ${line}`);
  });
  if (codeLines.length > 5) {
    console.log(`  ... (${codeLines.length - 5} more lines)`);
  }
});

db.close(); 