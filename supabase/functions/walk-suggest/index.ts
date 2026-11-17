// WALK-SUGGEST — three next steps for a goal in the iPhone walk, when the
// person asks for examples under it. Read-only and tool-free: it sees only
// what the app sends (the goal the step is about, the goals above it, the
// period) and writes nothing.
//
// The one AI route a light household may use (ai_light_routes, migration
// 20261117090000), with its own small daily and monthly cap there. A full
// household uses it within its ordinary allowance.
//
// Auth: the caller's JWT is checked before any model call, so an
// unauthenticated request can't bill the key. No service role here; the
// allowance guard holds its own.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AiUsageError, guardedAiFetch } from '../_shared/aiUsage.ts'
import { OUTPUT_SCHEMA, SYSTEM, buildUserContent, parseSuggestBody, suggestionsFromResponse } from './prompt.ts'

const MODEL = Deno.env.get('WALK_SUGGEST_MODEL') || 'claude-haiku-5-5'

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
  const parsed = parseSuggestBody(raw)
  if ('error' in parsed) return json({ error: parsed.error }, 400)

  try {
    const res = await guardedAiFetch(db, 'walk-suggest')('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        // Thinking counts toward the cap (it is on by default on Haiku 5.5):
        // room for a little of it and three short lines.
        max_tokens: 1024,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserContent(parsed) }],
      }),
    })
    if (!res.ok) return json({ error: `Anthropic returned ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502)
    const suggestions = suggestionsFromResponse(await res.json(), parsed.have)
    if (!suggestions) return json({ error: 'No suggestions came back', code: 'no_suggestions' }, 502)
    return json({ suggestions })
  } catch (e) {
    if (e instanceof AiUsageError) return json({ error: e.message, code: e.code, retry_at: e.retryAt }, e.status)
    return json({ error: e instanceof Error ? e.message : 'Suggestions failed' }, 502)
  }
})
