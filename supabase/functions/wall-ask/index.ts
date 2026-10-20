// WALL-ASK — answers a question spoken at the kitchen wall, from the wall's
// own snapshot of what it shows. Read-only and tool-free: it fetches nothing
// and writes nothing, so it can only repeat what is already on the shared
// screen (household layer; no goals, nothing private).
//
// Auth: the caller's JWT is checked before any model call, so an
// unauthenticated request can't bill the key. No service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildWallPrompt, parseAskBody, replyFromResponse } from './prompt.ts'
import { AiUsageError, guardedAiFetch } from '../_shared/aiUsage.ts'

const MODEL = Deno.env.get('WALL_ASK_MODEL') || 'claude-haiku-4-5'

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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !anonKey) return json({ error: 'Missing server config' }, 500)

  const db = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authErr } = await db.auth.getUser()
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let raw: unknown
  try { raw = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const parsed = parseAskBody(raw)
  if ('error' in parsed) return json({ error: parsed.error }, 400)
  const { question, snapshot } = parsed

  const { system, user: content } = buildWallPrompt(question, snapshot)
  try {
    const res = await guardedAiFetch(db, 'wall-ask')('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content }] }),
    })
    if (!res.ok) return json({ error: `Anthropic returned ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502)
    const reply = replyFromResponse(await res.json())
    if (!reply) return json({ error: 'No complete answer' }, 502)
    return json(reply)
  } catch (e) {
    if (e instanceof AiUsageError) return json({ error: e.message, code: e.code, retry_at: e.retryAt }, e.status)
    return json({ error: e instanceof Error ? e.message : 'Ask failed' }, 502)
  }
})
