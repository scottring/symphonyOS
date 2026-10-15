// WALL-SAY — the kitchen wall's spoken voice: a short reply as natural
// speech (Scott, 2026-10-13: "completely natural sounding"; warm, calm,
// adult). Only the reply's text leaves the house; the wall's audio stays on
// the Pi. The Pi's offline voice (Piper) speaks if this is unreachable.
//
// Auth: the caller's JWT is checked before any model call. No service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AiUsageError, guardedAiFetch } from '../_shared/aiUsage.ts'

const MODEL = Deno.env.get('WALL_SAY_MODEL') || 'gpt-4o-mini-tts'
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'])
const DEFAULT_VOICE = Deno.env.get('WALL_SAY_VOICE') || 'sage'
const STYLE = 'Warm, calm and unhurried, like a kind adult at home talking to the family in the kitchen. Natural and plain, never chirpy or salesy.'
const MAX_TEXT = 400

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !anonKey) return json({ error: 'Missing server config' }, 500)

  const db = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authErr } = await db.auth.getUser()
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { text?: string; voice?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const text = body.text?.trim() ?? ''
  if (!text || text.length > MAX_TEXT) return json({ error: `text required (≤${MAX_TEXT} characters)` }, 400)
  const voice = body.voice && VOICES.has(body.voice) ? body.voice : DEFAULT_VOICE

  let res: Response
  try {
    // Speech is priced per character: recorded as input units so the price
    // row's input rate (per million characters) can cost it.
    res = await guardedAiFetch(db, 'wall-say', fetch, { model: MODEL, inputTokens: text.length })('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, voice, input: text, instructions: STYLE, response_format: 'wav' }),
    })
  } catch (e) {
    if (e instanceof AiUsageError) return json({ error: e.message, code: e.code, retry_at: e.retryAt }, e.status)
    return json({ error: 'Speech is unavailable' }, 502)
  }
  if (!res.ok) return json({ error: `Speech returned ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502)
  return json({ wav: toBase64(new Uint8Array(await res.arrayBuffer())), voice })
})
