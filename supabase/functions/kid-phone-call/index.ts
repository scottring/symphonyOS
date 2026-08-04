// KID-PHONE-CALL — Receives call lifecycle events from the kid-phone Firebase
// functions (Approach B) and upserts a single `current_call` row that the
// wall-v2 kiosk subscribes to via Realtime, driving the caller-ID takeover.
//
// Auth: shared secret in `x-kidphone-secret` (== KIDPHONE_CALL_SECRET).
// Single household → one singleton row, last-write-wins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kidphone-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A ringing/connected row lives this long before the wall auto-hides it, in
// case the `ended` event is ever lost (missed Twilio callback).
const ACTIVE_TTL_MS = 90_000

// The warmline holds for ~60s before hanging up. This TTL outlives that, so a
// receiver hung up mid-hold (which sends us nothing) still clears on its own.
const HANDSET_TTL_MS = 75_000

export type HandsetState = 'offhook' | 'offhook_ended'
export type CallOnlyState = 'ringing' | 'connected' | 'ended'

export interface CallEventBody {
  callSid?: string
  direction?: 'inbound' | 'outbound'
  state?: CallOnlyState | HandsetState
  name?: string
  number?: string
  photoURL?: string
}

/** Off-hook events describe the receiver, not a call — different table. */
export function isHandsetState(state: string | undefined): state is HandsetState {
  return state === 'offhook' || state === 'offhook_ended'
}

type ValidationResult =
  | { ok: true; body: CallEventBody }
  | { ok: false; status: number; error: string }

export function validateRequest(
  headers: Headers,
  body: Partial<CallEventBody>,
  expectedSecret: string,
): ValidationResult {
  const provided = headers.get('x-kidphone-secret')
  if (!provided || provided !== expectedSecret) {
    return { ok: false, status: 401, error: 'invalid or missing kidphone secret' }
  }
  const s = body.state
  if (!isHandsetState(s) && s !== 'ringing' && s !== 'connected' && s !== 'ended') {
    return { ok: false, status: 400, error: 'state must be ringing|connected|ended|offhook|offhook_ended' }
  }
  if (body.direction && body.direction !== 'inbound' && body.direction !== 'outbound') {
    return { ok: false, status: 400, error: 'direction must be inbound|outbound' }
  }
  return { ok: true, body: body as CallEventBody }
}

/** Build the singleton row to upsert. Pure; unit-tested. */
export function buildRow(body: CallEventBody, now: Date): Record<string, unknown> {
  const ended = body.state === 'ended'
  return {
    id: 'singleton',
    call_sid: body.callSid ?? null,
    direction: body.direction ?? null,
    state: body.state,
    name: body.name ?? null,
    number: body.number ?? null,
    photo_url: body.photoURL ?? null,
    at: now.toISOString(),
    // Ended rows expire immediately; active rows get a TTL safety net.
    expires_at: new Date(ended ? now.getTime() : now.getTime() + ACTIVE_TTL_MS).toISOString(),
  }
}

/** Build the singleton handset row to upsert. Pure; unit-tested. */
export function buildHandsetRow(body: CallEventBody, now: Date): Record<string, unknown> {
  const up = body.state === 'offhook'
  return {
    id: 'singleton',
    off_hook: up,
    at: now.toISOString(),
    expires_at: new Date(up ? now.getTime() + HANDSET_TTL_MS : now.getTime()).toISOString(),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  const expectedSecret = Deno.env.get('KIDPHONE_CALL_SECRET') ?? ''
  if (!expectedSecret) return jsonResponse({ error: 'server misconfigured' }, 500)

  let parsed: Partial<CallEventBody>
  try {
    parsed = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const v = validateRequest(req.headers, parsed, expectedSecret)
  if (!v.ok) return jsonResponse({ error: v.error }, v.status)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date()
  const { error } = isHandsetState(v.body.state)
    ? await admin.from('handset_state').upsert(buildHandsetRow(v.body, now))
    : await admin.from('current_call').upsert(buildRow(v.body, now))
  if (error) return jsonResponse({ error: error.message }, 500)

  return jsonResponse({ ok: true })
})
