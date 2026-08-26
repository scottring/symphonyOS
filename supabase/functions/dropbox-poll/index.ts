// DROPBOX-POLL — watches ONE Dropbox folder for pages exported from the
// Supernote, stages each new file as a `captures` row, and asks parse-page to
// read it. Writes no tasks and no notes: the inbox's pending-page section is
// where a page becomes data, and only if Scott says so.
//
// Export is the trigger, not sync. The device's .note files rewrite on every
// stroke; /Supernote/EXPORT only receives a file when a page is deliberately
// exported, which makes "newer than the checkpoint" a sound dedupe rule.
//
// Auth: service-role bearer only — pg_cron is the sole caller.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { selectNewFiles, maxServerModified, type DropboxEntry } from './lib/select.ts'

// The Dropbox token is full-account (Supernote syncs to the account root and
// offers no app-folder target). This constant is the mitigation: the poller
// reads one path, never a parameter, never a value from a row.
const WATCH_PATH = '/Supernote/EXPORT'
const PER_RUN_CAP = 10
const SOURCE_KEY = 'supernote:export'
// Single-user assumptions, isolated here so they are cheap to lift later.
const TZ = 'America/New_York'
const WINDOW_DAYS = 14

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

/** YYYY-MM-DD for `now` plus `offsetDays`, in the user's timezone. */
function ymdIn(tz: string, offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  // en-CA renders as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

async function dropboxAccessToken(key: string, secret: string, refresh: string): Promise<string> {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${key}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  })
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { access_token: string }).access_token
}

async function listFolder(accessToken: string): Promise<DropboxEntry[]> {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path: WATCH_PATH, recursive: false, limit: 200 }),
  })
  if (res.status === 409) return [] // path_not_found — the folder appears on first export
  if (!res.ok) throw new Error(`Dropbox list_folder failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { entries: DropboxEntry[] }).entries ?? []
}

async function download(accessToken: string, path: string): Promise<Blob> {
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'Dropbox-API-Arg': JSON.stringify({ path }) },
  })
  if (!res.ok) throw new Error(`Dropbox download failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.blob()
}

/**
 * A real MIME type, not a guess from the extension: `parse-page` hands the
 * signed storage URL straight to Anthropic's vision API, which trusts the
 * stored Content-Type. "image/jpg" is not a registered type.
 */
function mimeTypeFor(ext: string): string {
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  return `image/${ext}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appKey = Deno.env.get('DROPBOX_APP_KEY')
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET')
  const refresh = Deno.env.get('DROPBOX_REFRESH_TOKEN')
  const userId = Deno.env.get('SUPERNOTE_USER_ID')
  if (!url || !serviceKey || !appKey || !appSecret || !refresh || !userId) {
    return json({ error: 'Missing server config' }, 500)
  }
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return json({ error: 'Service role only' }, 401)
  }

  const service = createClient(url, serviceKey)

  try {
    const { data: checkpoint } = await service
      .from('capture_checkpoints')
      .select('last_processed_at')
      .eq('user_id', userId)
      .eq('source_key', SOURCE_KEY)
      .maybeSingle()

    // A cold start ARMS the checkpoint and ingests nothing — linking Dropbox
    // must never sweep in a year of old exports.
    const nowIso = new Date().toISOString()
    if (!checkpoint) {
      await service.from('capture_checkpoints').upsert(
        { user_id: userId, source_key: SOURCE_KEY, last_processed_at: nowIso, updated_at: nowIso },
        { onConflict: 'user_id,source_key' },
      )
      return json({ ok: true, processed: 0, failed: 0, armed: true })
    }

    const accessToken = await dropboxAccessToken(appKey, appSecret, refresh)
    const fresh = selectNewFiles(await listFolder(accessToken), checkpoint.last_processed_at, PER_RUN_CAP)
    if (fresh.length === 0) return json({ ok: true, processed: 0, failed: 0 })

    const { data: members } = await service
      .from('family_members')
      .select('id, name')
      .eq('user_id', userId)

    const placeStart = ymdIn(TZ, 0)
    const placeEnd = ymdIn(TZ, WINDOW_DAYS - 1)

    let processed = 0
    let failed = 0
    const attempted: DropboxEntry[] = []

    for (const entry of fresh) {
      attempted.push(entry)
      const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase()
      const storagePath = `${userId}/supernote/${crypto.randomUUID()}.${ext}`
      let captureId: string | null = null
      try {
        // The captures row is created FIRST, before any network I/O that can
        // fail — every attempted file gets a row a human can see, even if the
        // download or upload never completes.
        const { data: capture, error: capErr } = await service
          .from('captures')
          .insert({
            user_id: userId,
            kind: 'image',
            source_key: SOURCE_KEY,
            source_label: entry.name,
            status: 'pending',
          })
          .select('id')
          .single()
        if (capErr || !capture) throw new Error(`Capture insert failed: ${capErr?.message}`)
        captureId = capture.id

        const blob = await download(accessToken, entry.path_lower)
        const { error: upErr } = await service.storage
          .from('attachments')
          .upload(storagePath, blob, { contentType: mimeTypeFor(ext), upsert: true })
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

        const parseRes = await fetch(`${url}/functions/v1/parse-page`, {
          method: 'POST',
          headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            storagePath,
            userId,
            placeStart,
            placeEnd,
            today: placeStart,
            members: members ?? [],
          }),
        })
        const parsed = await parseRes.json()
        if (!parseRes.ok || parsed?.error) throw new Error(String(parsed?.error ?? `parse-page ${parseRes.status}`))

        // A page the model read as blank is not review-worthy — drop the row
        // rather than surface an empty sheet.
        const empty = !parsed.items?.length && !parsed.notes?.length && !parsed.unclear?.length
        if (empty) {
          await service.from('captures').delete().eq('id', captureId)
        } else {
          await service
            .from('captures')
            .update({
              status: 'extracted',
              raw_text: JSON.stringify({
                items: parsed.items,
                notes: parsed.notes,
                unclear: parsed.unclear,
                window: parsed.window,
                storagePath,
              }),
            })
            .eq('id', captureId)
        }
        processed++
      } catch (e) {
        failed++
        const message = e instanceof Error ? e.message : String(e)
        console.error(`dropbox-poll: ${entry.name} failed:`, message)
        if (captureId) {
          await service.from('captures').update({ status: 'failed', error: message.slice(0, 300) }).eq('id', captureId)
        }
        // Deliberately continue: one unreadable file must not stall the folder.
      }
    }

    // Past what we ATTEMPTED — succeeded or failed — never now(). A file that
    // landed mid-run, or fell past the cap, waits for the next tick.
    const advanced = maxServerModified(attempted, checkpoint.last_processed_at)
    await service.from('capture_checkpoints').upsert(
      { user_id: userId, source_key: SOURCE_KEY, last_processed_at: advanced, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,source_key' },
    )

    return json({ ok: true, processed, failed })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('dropbox-poll failed:', message)
    return json({ error: message }, 500)
  }
})
