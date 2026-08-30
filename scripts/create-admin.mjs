/**
 * Creates (or promotes) a staff admin via the Supabase Auth admin API.
 * The 0007 trigger auto-creates the public.users profile with role from
 * user_metadata; this script also upserts the profile to guarantee admin role.
 *
 * Usage (from server/):
 *   node --env-file=.env scripts/create-admin.mjs "<email>" "<password>" "<full name>"
 */
import { createClient } from '@supabase/supabase-js';

const [, , email, password, fullName = 'Administrator'] = process.argv;
if (!email || !password) {
  console.error('Usage: node --env-file=.env scripts/create-admin.mjs "<email>" "<password>" "<full name>"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let userId;
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, role: 'admin' },
});

if (error) {
  if (/already been registered|already exists/i.test(error.message)) {
    console.log('User already exists — locating and ensuring admin role…');
    // Find the existing auth user by paging the admin list.
    let page = 1;
    for (;;) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw listErr;
      const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) { userId = found.id; break; }
      if (list.users.length < 200) break;
      page += 1;
    }
    if (!userId) throw new Error('Existing user not found via admin list.');
  } else {
    throw error;
  }
} else {
  userId = data.user.id;
  console.log('Auth user created:', userId);
}

// Guarantee the profile exists with admin role (covers pre-trigger rows too).
const { error: upsertErr } = await admin
  .from('users')
  .upsert(
    { id: userId, email, full_name: fullName, role: 'admin', is_active: true },
    { onConflict: 'id' },
  );
if (upsertErr) throw upsertErr;

const { data: profile } = await admin
  .from('users')
  .select('id, email, full_name, role, is_active')
  .eq('id', userId)
  .single();

console.log('Profile:', JSON.stringify(profile));
console.log('\nAdmin ready. You can now sign in from the app.');
