// CAPTURE-TO-INBOX — Receives a captured thought from a trusted device
// (iOS Shortcut, etc.) and inserts it into the user's Symphony inbox
// as a private task (bucket='inbox', context=NULL).
//
// Auth: shared secret in `x-capture-secret` header.
// The shared secret is set as CAPTURE_SHARED_SECRET in Supabase secrets.
//
// User targeting: uses CAPTURE_USERS secret — a JSON object mapping
// email → user_id, e.g. {"smkaufman@gmail.com":"bace953e-..."}.
// The caller must include user_email in the request body to identify
// which user's inbox to write to. O(1) lookup, no network calls.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateRequest, isExtractKind, type CaptureBody } from './lib/validate.ts'
export { validateRequest } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  const expectedSecret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!expectedSecret) {
    return jsonResponse({ error: 'server misconfigured' }, 500)
  }

  const captureUsersRaw = Deno.env.get('CAPTURE_USERS') ?? ''
  if (!captureUsersRaw) {
    return jsonResponse({ error: 'server misconfigured: missing CAPTURE_USERS' }, 500)
  }

  let captureUsers: Record<string, string>
  try {
    captureUsers = JSON.parse(captureUsersRaw)
  } catch {
    return jsonResponse({ error: 'server misconfigured: invalid CAPTURE_USERS' }, 500)
  }

  let parsed: Partial<CaptureBody>
  try {
    parsed = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const v = validateRequest(req.headers, parsed, expectedSecret)
  if (!v.ok) return jsonResponse({ error: v.error }, v.status)

  const normalizedEmail = v.body.user_email.toLowerCase().trim()
  const userId = captureUsers[normalizedEmail]
  if (!userId) {
    return jsonResponse({ error: 'user not found' }, 404)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // New extract path: create a captures row and invoke extract-capture.
  if (isExtractKind(v.body.kind)) {
    const { data: cap, error: capErr } = await admin
      .from('captures')
      .insert({
        user_id: userId,
        kind: v.body.kind,
        source_key: v.body.source_key ?? null,
        source_label: v.body.source_label ?? null,
        raw_text: v.body.text,
        status: 'pending',
      })
      .select('id')
      .single()
    if (capErr || !cap) return jsonResponse({ error: 'failed to create capture' }, 500)

    // Fire-and-forget extraction; failures are recorded on the captures row.
    fetch(`${supabaseUrl}/functions/v1/extract-capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': expectedSecret },
      body: JSON.stringify({ capture_id: cap.id }),
    }).catch(() => {})
    return jsonResponse({ ok: true, capture_id: cap.id }, 202)
  }

  // Legacy quick-capture path: insert a plain inbox task.
  const { data: task, error: insertErr } = await admin
    .from('tasks')
    .insert({
      title: v.body.title!.trim(),
      user_id: userId,
      bucket: 'inbox',
      context: null,
      completed: false,
    })
    .select('id')
    .single()

  if (insertErr) return jsonResponse({ error: insertErr.message }, 500)
  return jsonResponse({ success: true, task_id: task.id }, 200)
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}
