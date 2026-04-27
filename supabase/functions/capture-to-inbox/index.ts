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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CaptureBody {
  user_email: string
  title: string
}

type ValidationResult =
  | { ok: true; body: CaptureBody }
  | { ok: false; status: number; error: string }

export function validateRequest(
  headers: Headers,
  body: Partial<CaptureBody>,
  expectedSecret: string,
): ValidationResult {
  const provided = headers.get('x-capture-secret')
  if (!provided || provided !== expectedSecret) {
    return { ok: false, status: 401, error: 'invalid or missing capture secret' }
  }
  if (!body.user_email || typeof body.user_email !== 'string' || body.user_email.trim() === '') {
    return { ok: false, status: 400, error: 'user_email required' }
  }
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return { ok: false, status: 400, error: 'title required' }
  }
  return { ok: true, body: { user_email: body.user_email, title: body.title } }
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

  const { data: task, error: insertErr } = await admin
    .from('tasks')
    .insert({
      title: v.body.title.trim(),
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
