// PLANNING-CONVERSATION — the typed guide for guided planning (/plan-aloud).
//
// One bounded request in, one reply out: a few sentences and at most a few
// proposed lines. Stateless (nothing stored), no database access at all, and
// no service role: the caller's JWT is checked with the public anon key so an
// unauthenticated request can't bill the model. What it may receive and
// return is held in _shared/planningConversation.ts.
//
// Off unless PLANNING_CONVERSATION_ENABLED=1 (a server secret), so deploying
// it turns nothing on. Model: PLANNING_CONVERSATION_MODEL, else DEFAULT_MODEL.
//
// NOT here yet (see docs/planning/2026-10-08-guided-planning-release.md): a
// per-person daily cap. That needs a table with an access policy (a
// migration), which this release does not include.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_MODEL, messagesBody, parseRequest, parseToolInput, PROPOSE_TOOL } from '../_shared/planningConversation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (Deno.env.get('PLANNING_CONVERSATION_ENABLED') !== '1') return json({ error: 'The guide is not switched on' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !anon) return json({ error: 'Missing server config' }, 500)

  const { data: { user }, error: authErr } = await createClient(url, anon).auth.getUser(authHeader.slice('Bearer '.length))
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  const parsed = parseRequest(await req.text())
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status)

  const model = Deno.env.get('PLANNING_CONVERSATION_MODEL') || DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(messagesBody(parsed.value, model)),
    })
    if (!res.ok) {
      // Status only: an upstream body can echo what the person wrote.
      console.error('[planning-conversation] model error', res.status)
      return json({ error: 'The guide could not answer just now' }, 502)
    }
    const data = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] }
    const call = data.content?.find((b) => b.type === 'tool_use' && b.name === PROPOSE_TOOL.name)
    const reply = call ? parseToolInput(call.input, parsed.value) : null
    if (!reply) return json({ error: 'The guide could not answer just now' }, 502)
    return json(reply)
  } catch (e) {
    console.error('[planning-conversation] failed', e instanceof Error ? e.name : 'unknown')
    return json({ error: 'The guide could not answer just now' }, 504)
  } finally {
    clearTimeout(timer)
  }
})
