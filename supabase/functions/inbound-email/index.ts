// INBOUND-EMAIL — receives one forwarded email from the Cloudflare Email
// Worker, resolves the household by its inbound token, stores an idempotent
// captures row, and hands off to extract-email. Auth: x-capture-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateInbound, sourceKeyFor, senderLabel, originalSender, type InboundPayload } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  let raw: Partial<InboundPayload>
  try { raw = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }
  const v = validateInbound(raw)
  if (!v.ok) return json({ error: v.error }, v.status)
  const body = v.body

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: hh, error: hhError } = await admin.from('households').select('id').eq('inbound_token', body.token).maybeSingle()
  if (hhError) return json({ error: `db: ${hhError.message}` }, 500)
  if (!hh) return json({ error: 'unknown token' }, 404)

  // Owner first, else the earliest active member. The capture's user_id is
  // who the rows are written FOR; the household read policy shares them.
  const { data: members, error: membersError } = await admin
    .from('household_members')
    .select('user_id, role, created_at')
    .eq('household_id', hh.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (membersError) return json({ error: `db: ${membersError.message}` }, 500)
  const owner = members?.find((m) => m.role === 'owner') ?? members?.[0]
  if (!owner) return json({ error: 'household has no active members' }, 404)

  const sourceKey = sourceKeyFor(body)
  const findExisting = (key: string) =>
    admin.from('captures').select('id, status').eq('kind', 'email').eq('source_key', key).maybeSingle()
  // Fire-and-forget: the caller does not wait on extraction. A dispatch lost to
  // a cold start or a dropped socket is recovered by the next delivery/retry,
  // which lands here as a duplicate and re-fires while the capture is pending.
  const fireExtraction = (captureId: string) => {
    fetch(`${supabaseUrl}/functions/v1/extract-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': secret },
      body: JSON.stringify({ capture_id: captureId }),
    }).catch(() => {})
  }

  const { data: existing, error: existingError } = await findExisting(sourceKey)
  if (existingError) return json({ error: `db: ${existingError.message}` }, 500)
  if (existing) {
    const refired = existing.status === 'pending'
    if (refired) fireExtraction(existing.id)
    return json({ ok: true, capture_id: existing.id, duplicate: true, refired }, 200)
  }

  const rawText = `Subject: ${body.subject}\nFrom: ${body.from}\n\n${body.text}`
  const { data: cap, error } = await admin
    .from('captures')
    .insert({
      user_id: owner.user_id,
      household_id: hh.id,
      kind: 'email',
      source_key: sourceKey,
      source_label: senderLabel(originalSender(body.subject, body.text, body.from)),
      subject: body.subject,
      sender: originalSender(body.subject, body.text, body.from),
      raw_text: rawText,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !cap) {
    // A concurrent duplicate loses the unique-index race; report it as such.
    if (error?.code === '23505') {
      const { data: dup } = await findExisting(sourceKey)
      if (dup) {
        const refired = dup.status === 'pending'
        if (refired) fireExtraction(dup.id)
        return json({ ok: true, capture_id: dup.id, duplicate: true, refired }, 200)
      }
    }
    return json({ error: `capture insert failed: ${error?.message ?? 'unknown'}` }, 500)
  }

  fireExtraction(cap.id)

  return json({ ok: true, capture_id: cap.id }, 202)
})
