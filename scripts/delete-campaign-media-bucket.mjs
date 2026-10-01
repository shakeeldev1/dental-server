/**
 * One-off cleanup: empties and deletes the legacy Supabase Storage bucket,
 * now that campaign images upload to Cloudinary instead (see
 * supabase/migrations/0028_drop_campaign_media_bucket.sql, which drops the
 * bucket's RLS policies — Supabase rejects `delete from storage.buckets`
 * over plain SQL, so the bucket row itself must go through the Storage API).
 *
 * Usage (from server): set SUPABASE_CAMPAIGN_MEDIA_BUCKET in .env, then run
 * this cleanup script with Node's --env-file option.
 */
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_CAMPAIGN_MEDIA_BUCKET;

if (!BUCKET) {
  console.error('SUPABASE_CAMPAIGN_MEDIA_BUCKET missing in .env');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: buckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) throw listErr;
if (!buckets.some((b) => b.id === BUCKET)) {
  console.log(`Bucket '${BUCKET}' does not exist — nothing to do.`);
  process.exit(0);
}

const { error: emptyErr } = await admin.storage.emptyBucket(BUCKET);
if (emptyErr) throw emptyErr;
console.log(`Emptied '${BUCKET}'.`);

const { error: deleteErr } = await admin.storage.deleteBucket(BUCKET);
if (deleteErr) throw deleteErr;
console.log(`Deleted bucket '${BUCKET}'.`);
