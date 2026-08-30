/**
 * DEV ONLY. Drops all app-owned objects so migrations can be re-applied on a
 * clean slate. Only touches objects this project creates — never Supabase
 * system schemas.
 *
 * Usage (from server/):  node --env-file=.env scripts/reset-db.mjs
 */
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

const sql = `
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.campaign_recipients,
  public.whatsapp_messages,
  public.campaigns,
  public.treatments,
  public.appointments,
  public.message_templates,
  public.settings,
  public.patients,
  public.users
  cascade;

drop function if exists
  public.set_updated_at(),
  public.current_user_role(),
  public.is_admin(),
  public.is_staff(),
  public.handle_new_auth_user()
  cascade;

drop type if exists
  public.template_key,
  public.campaign_status,
  public.audience_type,
  public.message_status,
  public.message_direction,
  public.message_type,
  public.appointment_status,
  public.language_code,
  public.user_role
  cascade;
`;

try {
  await client.connect();
  await client.query(sql);
  console.log('Reset complete — app objects dropped.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
