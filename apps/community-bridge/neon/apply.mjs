import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const sql = neon(process.env.NEON_URL);
const raw = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const ddl = raw.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const stmts = ddl.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
try {
  for (const s of stmts) await sql.query(s);
  const t = await sql.query("select table_name from information_schema.tables where table_name like 'cb_%' order by 1");
  console.log('tablas:', (Array.isArray(t) ? t : t.rows).map(r => r.table_name).join(', '));
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
