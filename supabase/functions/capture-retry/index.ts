// CAPTURE-RETRY — lets a signed-in household member re-run extraction on a
// capture that failed. `extract-email` is authenticated with
// CAPTURE_SHARED_SECRET, which the browser must never hold, so this function
// holds it instead: it authenticates the caller's JWT, asserts the caller
// shares a household with the capture's owner, and forwards the request.
// Auth: the caller's JWT (default verify_jwt — no config.toml exemption).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Who is asking. The anon client carries the caller's bearer token, so
  // auth.getUser() resolves the signed-in user and nothing else.
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)

  let body: { capture_id?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }
  const captureId = typeof body.capture_id === 'string' ? body.capture_id.trim() : ''
  if (!captureId) return json({ error: 'capture_id is required' }, 400)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret) return json({ error: 'CAPTURE_SHARED_SECRET is not configured' }, 500)

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // `kind` is part of the lookup, not an afterthought: extract-email is the
  // only thing this forwards to, so a capture of any other kind is not a
  // retryable target and must not be reachable through this door.
  const { data: capture, error: captureError } = await admin
    .from('captures')
    .select('id, user_id')
    .eq('id', captureId)
    .eq('kind', 'email')
    .maybeSingle()
  if (captureError) return json({ error: `db: ${captureError.message}` }, 500)
  if (!capture) return json({ error: 'capture not found' }, 404)

  // The service-role client bypasses RLS, so the household check is explicit.
  if (capture.user_id !== user.id) {
    const { data: shares, error: sharesError } = await admin.rpc('users_share_household', {
      user_a: user.id,
      user_b: capture.user_id,
    })
    if (sharesError) return json({ error: `db: ${sharesError.message}` }, 500)
    if (!shares) return json({ error: 'forbidden' }, 403)
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/extract-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-capture-secret': secret },
    body: JSON.stringify({ capture_id: captureId }),
  })
  const text = await res.text()
  // A failure from extract-email is relayed as a generic message. Its body can
  // carry model output, prompt fragments and the email's own text, and this
  // response goes to a browser — the detail belongs in the function log, not
  // in the client.
  if (!res.ok) {
    console.error(`extract-email failed (${res.status}):`, text)
    return json({ error: 'retry failed' }, res.status)
  }
  let payload: unknown
  try { payload = JSON.parse(text) } catch { payload = { error: text } }
  return json(payload, res.status)
})
