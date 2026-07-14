// LOG-MEDICATION — trusted-device dose logger for the meds tracker.
// Auth: durable per-user token in `x-med-token` (see med_log_tokens / ensure_med_log_token).
// Body: { medication: "all" | <name substring>, taken_at?: ISO8601, note?: string }
// Returns { ok, message } — message is human-readable so Siri can speak it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { matchMedication, parseBody, type MedRow } from './lib/logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-med-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

// @ts-ignore Deno global present at runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const token = req.headers.get('x-med-token')
  if (!token) return json({ ok: false, error: 'missing x-med-token' }, 401)

  let raw: unknown
  try { raw = await req.json() } catch { return json({ ok: false, error: 'invalid JSON' }, 400) }
  const parsed = parseBody(raw)
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400)

  // @ts-ignore Deno env
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: tok, error: tokError } = await admin.from('med_log_tokens').select('user_id').eq('token', token).maybeSingle()
  if (tokError) return json({ ok: false, message: 'Auth check failed' }, 500)
  if (!tok) return json({ ok: false, error: 'invalid token' }, 401)
  const userId = tok.user_id as string

  const { data: meds, error: medsError } = await admin
    .from('medications').select('id, name').eq('user_id', userId).eq('active', true)
  if (medsError) return json({ ok: false, message: 'Could not load medications' }, 500)
  const list = (meds ?? []) as MedRow[]
  const match = matchMedication(parsed.medication, list)

  if (match.kind === 'none') return json({ ok: false, message: `No medication matching "${parsed.medication}"` }, 404)
  if (match.kind === 'ambiguous') {
    return json({ ok: false, message: `Which one? ${match.candidates.map((c) => c.name).join(', ')}` }, 409)
  }

  const takenAt = parsed.taken_at ? new Date(parsed.taken_at) : new Date()
  const targets = match.kind === 'all' ? list : [match.med]
  if (targets.length === 0) return json({ ok: false, message: 'No active medications to log' }, 404)

  const rows = targets.map((m) => ({
    user_id: userId, medication_id: m.id, taken_at: takenAt.toISOString(), source: 'shortcut',
    note: parsed.note ?? null,
  }))
  const { error } = await admin.from('medication_logs').insert(rows)
  if (error) return json({ ok: false, message: 'Could not save log' }, 500)

  const names = targets.map((m) => m.name).join(', ')
  return json({ ok: true, message: `Logged ${names} at ${fmtTime(takenAt)}` })
})
