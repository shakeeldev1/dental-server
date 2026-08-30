/** Quick post-migration sanity check. Usage: node --env-file=.env scripts/verify-db.mjs */
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const tables = await client.query(
  `select table_name from information_schema.tables
   where table_schema='public' order by table_name`,
);
console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));

const rls = await client.query(
  `select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind='r' order by relname`,
);
console.log('RLS enabled on all tables:', rls.rows.every((r) => r.relrowsecurity));

const templates = await client.query('select count(*)::int as n from public.message_templates');
console.log('Seeded message_templates:', templates.rows[0].n, '(expected 12)');

const settings = await client.query('select clinic_name, treatment_reminder_days from public.settings');
console.log('Settings row:', JSON.stringify(settings.rows[0]));

const patients = await client.query('select count(*)::int as n from public.patients');
console.log('Patients (must be 0 — empty DB):', patients.rows[0].n);

await client.end();
