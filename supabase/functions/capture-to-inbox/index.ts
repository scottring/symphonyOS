// CAPTURE-TO-INBOX — Receives a captured thought from a trusted device
// (iOS Shortcut, etc.) and inserts it into the user's Symphony inbox
// as a private task (bucket='inbox', context=NULL).
//
// Auth: shared secret in `x-capture-secret` header.
// The shared secret is set as CAPTURE_SHARED_SECRET in Supabase secrets.
//
// User targeting: uses CAPTURE_USER_ID secret (Scott's known Symphony user_id).
// The user_email field in the request body is accepted but not used for lookup —
// it exists only for caller-side clarity and future multi-user extension.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CaptureBody {
  user_email?: string
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

  const captureUserId = Deno.env.get('CAPTURE_USER_ID') ?? ''
  if (!captureUserId) {
    return jsonResponse({ error: 'server misconfigured: missing user id' }, 500)
  }

  let parsed: Partial<CaptureBody>
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

  const { data: task, error: insertErr } = await admin
    .from('tasks')
    .insert({
      title: v.body.title.trim(),
      user_id: captureUserId,
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
