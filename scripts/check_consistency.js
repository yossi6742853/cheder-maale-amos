#!/usr/bin/env node
// בדיקת קונסיסטנטיות JS↔SQL: כל טבלה/RPC שהקוד קורא להם חייבים להיות ב-setup_all.sql.
// יוצא בקוד 0 רק כשאין פערים. (משימה 4 בספֵק.)
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/setup_all.sql'), 'utf8');

const sqlTables = new Set([...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]));
const sqlFns = new Set([...sql.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map(m => m[1]));

const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
  .concat(['sign.html', 'index.html']);
const codeTables = new Map(), codeRpcs = new Map();
for (const rel of jsFiles) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const m of txt.matchAll(/(?:store\.(?:list|add|update|remove|byStudent)|\.from)\(\s*['"](\w+)['"]/g)) {
    if (!codeTables.has(m[1])) codeTables.set(m[1], rel);
  }
  for (const m of txt.matchAll(/\.rpc\(\s*['"](\w+)['"]/g)) {
    if (!codeRpcs.has(m[1])) codeRpcs.set(m[1], rel);
  }
}
// טבלאות שקיימות רק בדמו (store seed) ולא ב-Supabase — מותר (fallback profiles):
const demoOnly = new Set(['users']);

let bad = 0;
console.log('=== טבלאות שהקוד משתמש בהן ===');
for (const [t, rel] of [...codeTables].sort()) {
  if (sqlTables.has(t)) console.log(`  ✅ ${t}`);
  else if (demoOnly.has(t)) console.log(`  ⚪ ${t} (דמו בלבד — ${rel})`);
  else { console.log(`  ❌ ${t} — חסר ב-setup_all (${rel})`); bad++; }
}
console.log('=== RPC שהקוד קורא ===');
for (const [fn, rel] of [...codeRpcs].sort()) {
  if (sqlFns.has(fn)) console.log(`  ✅ ${fn}`);
  else { console.log(`  ❌ ${fn} — חסר ב-setup_all (${rel})`); bad++; }
}
console.log(`\nsetup_all: ${sqlTables.size} טבלאות, ${sqlFns.size} פונקציות. פערים: ${bad}`);
process.exit(bad ? 1 : 0);
