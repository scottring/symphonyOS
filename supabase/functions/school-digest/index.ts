// SCHOOL-DIGEST — takes a day's worth of school/parent-group transcripts from
// the connectors worker, asks Claude for a short digest, and emails it from
// the user's own Gmail to the household. Nothing is written to Symphony —
// no tasks, no notes, no captures. The email IS the product.
//
// Auth: shared secret (x-capture-secret), same as capture-to-inbox — the
// caller is the Fly worker, which already holds it.
//
// Body: { user_id, sources: [{label, text}], to?: string[], timezone? }
//   to defaults to the Gmail account's own address.
//
// Gmail send uses the user's Google connection (calendar_connections) with
// the gmail.send scope, same as gmail-send. The From is the user, so the
// digest lands in the primary inbox rather than a promotions tab.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildDigestPrompt, parseDigestResponse, renderDigestHtml, renderDigestText, digestDateLabel,
  type DigestSource,
} from './lib/digest.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal') throw new Error('Anthropic refused the request')
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

// ── Gmail ──────────────────────────────────────────────────────────────

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>, userId: string, refreshToken: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  await supabase.from('calendar_connections').update({
    access_token: data.access_token,
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google')
  return data.access_token
}

async function gmailAccessToken(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: conn, error } = await supabase
    .from('calendar_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId).eq('provider', 'google').single()
  if (error || !conn?.refresh_token) throw new Error('No Google connection with a refresh token for this user')
  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (!conn.access_token || expiresAt - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(supabase, userId, conn.refresh_token)
  }
  return conn.access_token
}

/** Byte-safe base64 — String.fromCharCode(...bytes) blows the argument
 * limit on a long HTML body. */
function b64(s: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b)
  return btoa(bin)
}

function base64url(s: string): string {
  return b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodedWord(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`
}

function buildMime(p: { from: string; to: string[]; subject: string; text: string; html: string }): string {
  const boundary = `b${crypto.randomUUID().replace(/-/g, '')}`
  return [
    `From: ${p.from}`,
    `To: ${p.to.join(', ')}`,
    `Subject: ${encodedWord(p.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(p.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(p.html),
    `--${boundary}--`,
  ].join('\r\n')
}

async function sendGmail(accessToken: string, mime: string): Promise<string> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(mime) }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Gmail send failed: ${data.error.message ?? JSON.stringify(data.error)}`)
  return data.id as string
}

// ── Handler ────────────────────────────────────────────────────────────

interface Body {
  user_id?: string
  sources?: DigestSource[]
  to?: string[]
  timezone?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }
  const userId = body.user_id
  const sources = (body.sources ?? []).filter((s) => s && typeof s.label === 'string' && typeof s.text === 'string' && s.text.trim())
  if (!userId) return json({ error: 'user_id required' }, 400)
  if (sources.length === 0) return json({ ok: true, skipped: 'nothing to digest' })

  const timezone = body.timezone ?? 'America/New_York'
  const dateLabel = digestDateLabel(new Date(), timezone)

  try {
    const digest = parseDigestResponse(await callClaude(buildDigestPrompt(sources, dateLabel), Deno.env.get('ANTHROPIC_API_KEY')!))
    if (digest.sections.length === 0) throw new Error('Digest came back empty — not sending')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const accessToken = await gmailAccessToken(supabase, userId)
    const profile = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })).json()
    if (profile.error) throw new Error(`Gmail profile fetch failed: ${JSON.stringify(profile.error)}`)
    const from = profile.emailAddress as string
    const to = (body.to ?? []).filter((t) => typeof t === 'string' && t.includes('@'))
    if (to.length === 0) to.push(from)

    const toDo = digest.sections.reduce((n, s) => n + s.toDo.length, 0)
    const subject = `School digest · ${dateLabel}${toDo ? ` · ${toDo} to do` : ''}`
    const id = await sendGmail(accessToken, buildMime({
      from, to, subject,
      text: renderDigestText(digest, dateLabel),
      html: renderDigestHtml(digest, dateLabel),
    }))
    return json({ ok: true, messageId: id, to, sections: digest.sections.length, toDo })
  } catch (e) {
    console.error('school-digest failed:', e)
    return json({ error: String(e) }, 500)
  }
})
