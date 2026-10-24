// QUESTION-IDEAS — a few answers the person could give to a question Symphony
// asked in chat, shown when they tap the lightbulb beside it. Read-only and
// tool-free: it sees only the conversation the app sends and writes nothing.
//
// Auth: the caller's JWT is checked before any model call, so an
// unauthenticated request can't bill the key. No service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { IDEAS_TOOL, buildIdeasPrompt, ideasFromResponse, parseIdeasBody } from './prompt.ts'
import { AiUsageError, guardedAiFetch } from '../_shared/aiUsage.ts'

const MODEL = Deno.env.get('QUESTION_IDEAS_MODEL') || 'claude-sonnet-4-6'

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
  const parsed = parseIdeasBody(raw)
  if ('error' in parsed) return json({ error: parsed.error }, 400)

  const { system, user: content } = buildIdeasPrompt(parsed.question, parsed.conversation, parsed.today)
  try {
    const res = await guardedAiFetch(db, 'question-ideas')('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024, system,
        tools: [IDEAS_TOOL], tool_choice: { type: 'tool', name: IDEAS_TOOL.name },
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) return json({ error: `Anthropic returned ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502)
    const ideas = ideasFromResponse(await res.json())
    if (!ideas) return json({ error: 'No ideas came back' }, 502)
    return json({ ideas })
  } catch (e) {
    if (e instanceof AiUsageError) return json({ error: e.message, code: e.code, retry_at: e.retryAt }, e.status)
    return json({ error: e instanceof Error ? e.message : 'Ideas failed' }, 502)
  }
})
