/** One-time backfill: re-run classification over already-analyzed attachments
 *  so documents uploaded before the shelf existed get proposed, and so any
 *  sensitive facets already persisted get stripped.
 *
 *  Idempotent: clearing analyzed_at makes analyze-attachment reprocess the row,
 *  and it rewrites both facets and the document_* columns.
 *
 *  Run with a USER JWT, not the service role — service role bypasses RLS and
 *  would sweep every user's rows.
 *
 *    SUPABASE_URL=... SUPABASE_ANON_KEY=... USER_JWT=... \
 *      [DRY_RUN=1] npx tsx scripts/backfill-documents.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const jwt = process.env.USER_JWT
const dryRun = process.env.DRY_RUN === '1'

if (!url || !anon || !jwt) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, and USER_JWT')
  process.exit(1)
}

const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

const { data: rows, error } = await db
  .from('attachments')
  .select('id, file_type')
  .not('analyzed_at', 'is', null)
  .is('document_status', null)

if (error) {
  console.error('query failed:', error.message)
  process.exit(1)
}

const candidates = (rows ?? []).filter(
  (r) => r.file_type?.startsWith('image/') || r.file_type === 'application/pdf',
)
console.log(`${candidates.length} attachments to re-classify`)

if (dryRun) {
  console.log('DRY_RUN=1 — nothing mutated. Unset it to run for real.')
  process.exit(0)
}

let done = 0
for (const row of candidates) {
  // analyze-attachment no-ops when analyzed_at is set, so clear it first.
  const { error: clearErr } = await db
    .from('attachments')
    .update({ analyzed_at: null })
    .eq('id', row.id)
  if (clearErr) {
    console.error(`  ${row.id}: could not reset — ${clearErr.message}`)
    continue
  }

  const res = await fetch(`${url}/functions/v1/analyze-attachment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ attachmentId: row.id, entityContext: '' }),
  })
  if (!res.ok) console.error(`  ${row.id}: ${res.status} ${(await res.text()).slice(0, 120)}`)
  else done++

  // Be kind to the vision API.
  await new Promise((r) => setTimeout(r, 1200))
}
console.log(`re-classified ${done}/${candidates.length}`)
