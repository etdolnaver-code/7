import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { encrypt, passwordHash } from '../lib/db.ts';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
encrypt({ check: true });
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(readFileSync(new URL('./schema-postgres.sql', import.meta.url), 'utf8'));
  const admin = await client.query('SELECT id FROM admins WHERE id=$1', ['admin']);
  if (admin.rowCount === 0) {
    const initial = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initial || !/^\d{4,16}$/.test(initial) || initial === '1111')
      throw new Error('Set a non-default 4–16 digit INITIAL_ADMIN_PASSWORD before initialization');
    await client.query('INSERT INTO admins(id,password,role,must_change) VALUES($1,$2,$3,$4)',
      ['admin', passwordHash(initial), 'ADMIN', 1]);
  }
  await client.query('COMMIT');
  console.log('PostgreSQL schema and admin account are ready.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
