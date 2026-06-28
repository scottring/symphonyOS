// PLACE-CALL — Symphony asks the kid-phone bridge to place an outbound call
// (Phase 3 of Plan→Execute). The user (or an approved scheduled proposal)
// invokes this with a task or a raw number; we verify auth, reject agent mode
// (Phase 5 gate), POST to kid-phone's initiateCall, and record a call_log row.
//
// Safe to deploy before kid-phone is ready: if KIDPHONE_INITIATE_URL is unset
// it returns 503 (telephony not configured) and places no call.
//
// Auth: the caller's Supabase JWT (Authorization: Bearer). Ownership of a
// referenced task is enforced by RLS via the user-scoped client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateBody, buildLogRow, type PlaceCallBody } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'missing bearer token' }, 401)

  let parsed: Partial<PlaceCallBody>
  try {
    parsed = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const v = validateBody(parsed)
  if (!v.ok) return jsonResponse({ error: v.error }, v.status)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  // User-scoped client: RLS enforces task ownership.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  // Resolve the number: explicit toNumber wins, else the task's phone_number.
  let toNumber = parsed.toNumber
  if (!toNumber && parsed.taskId) {
    const { data: task } = await userClient
      .from('tasks')
      .select('id, phone_number')
      .eq('id', parsed.taskId)
      .maybeSingle()
    if (!task) return jsonResponse({ error: 'task not found' }, 404)
    toNumber = (task as { phone_number?: string }).phone_number
  }
  if (!toNumber) return jsonResponse({ error: 'no phone number available for this call' }, 422)

  // Ask kid-phone to place the call. No-op (503) until provisioned.
  const initiateUrl = Deno.env.get('KIDPHONE_INITIATE_URL') ?? ''
  const secret = Deno.env.get('KIDPHONE_CALL_SECRET') ?? ''
  if (!initiateUrl || !secret) return jsonResponse({ error: 'telephony not configured' }, 503)

  let callSid: string | null = null
  try {
    const res = await fetch(initiateUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kidphone-secret': secret },
      body: JSON.stringify({ toNumber, mode: v.mode, context: parsed.context }),
    })
    if (!res.ok) return jsonResponse({ error: `bridge error ${res.status}` }, 502)
    const out = await res.json().catch(() => ({}))
    callSid = (out as { callSid?: string }).callSid ?? null
  } catch (e) {
    return jsonResponse({ error: `bridge unreachable: ${e instanceof Error ? e.message : 'unknown'}` }, 502)
  }

  // Record the call (service role — bypasses RLS for the insert).
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error: logErr } = await admin
    .from('call_log')
    .insert(buildLogRow(userId, toNumber, v.mode, parsed.taskId, callSid))
  if (logErr) return jsonResponse({ ok: true, callSid, warning: `log failed: ${logErr.message}` })

  return jsonResponse({ ok: true, callSid })
})
