/**
 * Applies pending SQL migrations from supabase/migrations (in filename order)
 * to DATABASE_URL. Tracks applied files in public._migrations so it only runs
 * new ones and is safe to re-run. Each migration runs in its own transaction.
 *
 * Usage (from server/):
 *   node --env-file=.env scripts/apply-migrations.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '..', '..', 'supabase', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env scripts/apply-migrations.mjs');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error('No .sql migrations found in', migrationsDir);
    process.exit(1);
  }

  await client.connect();
  await client.query(
    `create table if not exists public._migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const { rows } = await client.query('select name from public._migrations');
  const applied = new Set(rows.map((r) => r.name));

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('Nothing to apply — database is up to date.');
    return;
  }

  console.log(`Applying ${pending.length} pending migration(s):\n`);
  for (const file of pending) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`  • ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public._migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\nError in ${file}:\n${err.message}\n`);
      throw err;
    }
  }
  console.log('\nAll pending migrations applied successfully.');
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
