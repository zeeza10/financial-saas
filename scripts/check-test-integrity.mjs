import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROTECTED_TEST_DIRS = [
  'packages/ledger-core',
  'tests/financial',
  'tests/security',
  'tests/e2e',
  'supabase/tests',
];

const FORBIDDEN_PATTERNS = [
  /\b(it|test|describe)\.skip\s*\(/g,
  /\b(it|test|describe)\.only\s*\(/g,
  /\b(it|test|describe)\.todo\s*\(/g,
  /\bxit\s*\(/g,
  /\bxdescribe\s*\(/g,
];

function collectFiles(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const results = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const p = path.join(full, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.relative(ROOT, p)));
    } else if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(entry.name) || entry.name.endsWith('.sql')) {
      results.push(p);
    }
  }
  return results;
}

const violations = [];
for (const dir of PROTECTED_TEST_DIRS) {
  for (const file of collectFiles(dir)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${path.relative(ROOT, file)} matched ${pattern}`);
      }
      pattern.lastIndex = 0;
    }
  }
}

if (violations.length > 0) {
  console.error('Test integrity violation detected (AI_CHANGE_CONTROL.md §3):');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('Test integrity check passed: no skipped/focused tests in protected suites.');
