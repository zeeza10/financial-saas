import fs from 'node:fs';
import path from 'node:path';

/**
 * Static migration check verifying every CREATE TABLE in public schema has
 * corresponding ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY statements.
 */
const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const combined = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');
const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi;
const tables = new Set();
let match;
while ((match = createRe.exec(combined)) !== null) {
  tables.add(match[1].toLowerCase());
}

const missing = [];
for (const table of tables) {
  const enableRe = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  const forceRe = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i');
  if (!enableRe.test(combined) || !forceRe.test(combined)) {
    missing.push(table);
  }
}

if (missing.length > 0) {
  console.error('RLS coverage check failed for public tables:', missing.join(', '));
  process.exit(1);
}

console.log(`Static RLS coverage check passed for ${tables.size} public table(s).`);
