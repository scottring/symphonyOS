// LOG-SYMPTOM — trusted-device voice symptom logger for the health tracker.
// Auth: durable per-user token in `x-med-token` (see med_log_tokens / ensure_med_log_token).
// Body: { utterance: string, logged_at?: ISO8601 } — e.g. "severe tremor after workout".
// Returns { ok, message } — message is human-readable so Siri can speak it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildMessage, parseBody, parseUtterance, type SymptomRow } from './lib/logic.ts'

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
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

  const { data: syms, error: symsError } = await admin
    .from('symptoms').select('id, name').eq('user_id', userId).eq('active', true)
  if (symsError) return json({ ok: false, message: 'Could not load symptoms' }, 500)
  const list = (syms ?? []) as SymptomRow[]
  if (list.length === 0) return json({ ok: false, message: "You aren't tracking any symptoms yet" }, 404)

  const { severity, matches, note } = parseUtterance(parsed.utterance, list)
  if (matches.length === 0) {
    const tracked = list.map((s) => s.name).join(', ')
    return json({ ok: false, message: `No symptom matching "${parsed.utterance}" — you track: ${tracked}` }, 404)
  }

  const loggedAt = parsed.logged_at ? new Date(parsed.logged_at) : new Date()
  const rows = matches.map((s) => ({
    user_id: userId, symptom_id: s.id, severity, logged_at: loggedAt.toISOString(), note,
  }))
  const { error } = await admin.from('symptom_logs').insert(rows)
  if (error) return json({ ok: false, message: 'Could not save log' }, 500)

  return json({ ok: true, message: buildMessage(matches.map((s) => s.name), severity, fmtTime(loggedAt)) })
})
