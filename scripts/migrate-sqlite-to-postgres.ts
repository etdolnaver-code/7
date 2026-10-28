import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { decrypt } from '../lib/db.ts';

const sourcePath = resolve(process.env.DATABASE_PATH ?? './data/mbco.sqlite');
const source = new DatabaseSync(sourcePath, { readOnly: true });
const tables = [
  ['admins', 'id,password,role,must_change'],
  ['sessions', 'token_hash,admin_id,created_at,last_seen,expires_at'],
  ['visitors', 'token_hash,expires_at'],
  ['visitor_drafts', 'visitor_hash,data,expires_at'],
  ['videos', 'id,title,youtube_id,sort_order,visible,deleted'],
  ['view_events', 'id,visitor_hash,video_id,title,opened_at,youtube_id,completed_at'],
  ['registrations', 'id,receipt,request_key,visitor_hash,payload_hash,created_at,start_date,end_date,data'],
  ['rate_limits', 'key,count,reset_at'],
  ['audit', 'id,at,actor,action,target,details'],
] as const;
const rows = tables.map(([name, columns]) => {
  const data = source.prepare(`SELECT ${columns} FROM ${name}`).all() as Record<string, unknown>[];
  return { name, columns: columns.split(','), data };
});
const encrypted = rows.find((table) => table.name === 'registrations')?.data[0]?.data
  ?? rows.find((table) => table.name === 'audit')?.data[0]?.details;
if (typeof encrypted === 'string') decrypt(encrypted);
console.log('Source counts:', Object.fromEntries(rows.map(({ name, data }) => [name, data.length])));
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Use --apply after backing up the SQLite database and initializing PostgreSQL.');
  source.close();
  process.exit(0);
}
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const { name } of rows) {
    const count = await client.query(`SELECT count(*)::integer AS count FROM ${name}`);
    if (Number(count.rows[0].count) > (name === 'admins' ? 1 : 0))
      throw new Error(`Target ${name} is not empty; migration stopped`);
  }
  const adminCount = await client.query('SELECT count(*)::integer AS count FROM admins');
  if (Number(adminCount.rows[0].count) === 1) {
    const seeded = await client.query('SELECT id FROM admins');
    if (seeded.rows[0].id !== 'admin') throw new Error('Target admin is not the expected seed account');
    await client.query('DELETE FROM admins');
  }
  for (const { name, columns, data } of rows) {
    const placeholders = columns.map((_, index) => '$' + (index + 1)).join(',');
    for (const row of data) {
      await client.query(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${placeholders})`,
        columns.map((column) => row[column]));
    }
    const count = await client.query(`SELECT count(*)::integer AS count FROM ${name}`);
    if (Number(count.rows[0].count) !== data.length) throw new Error(`Count mismatch: ${name}`);
  }
  await client.query("SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT max(id) FROM audit), 1), EXISTS(SELECT 1 FROM audit))");
  await client.query('COMMIT');
  console.log('Migration committed; target counts match source counts. Original SQLite database was not changed.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
  source.close();
}
