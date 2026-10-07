// SCHOOL-DIGEST — takes a day's worth of school/parent-group transcripts from
// the connectors worker, asks Claude for a short digest, and emails it from
// the user's own Gmail to the household. The email is the product; the one
// thing written to Symphony is the kids' WORK (lib/homework.ts, 2026-10-07):
// homework tasks per child, which the wall draws. No notes, events or to-dos.
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
import { buildHomeworkPrompt, parseHomework, planHomework, type ExistingHomework } from './lib/homework.ts'
import type { Member } from '../extract-email/lib/types.ts'

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

// ── The kids' work ─────────────────────────────────────────────────────

/** Today's YYYY-MM-DD and weekday on the household's wall clock. */
function todayIn(tz: string): { ymd: string; weekday: string } {
  const now = new Date()
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const g = (t: string) => p.find((x) => x.type === t)?.value
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, weekday: now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }) }
}

/**
 * Pull the children's work out of today's transcripts and write it as
 * homework, once per child, skipping what is already open. Runs after the
 * email has gone, and never fails the digest: a bad extraction costs the
 * wall a day, not the family their 5pm email.
 */
// deno-lint-ignore no-explicit-any -- the client is untyped here, as elsewhere in this file
type Db = any
interface RosterRow { id: string; name: string; role_label: string | null; is_full_user: boolean | null }

async function postKidsWork(
  supabase: Db, userId: string, sources: DigestSource[], apiKey: string,
): Promise<{ written: number; skipped?: string }> {
  // The household this user belongs to, its clock and its roster — read the
  // way extract-email reads them.
  const { data: mine } = await supabase.from('household_members').select('household_id').eq('user_id', userId).eq('status', 'active').limit(1)
  const householdId = mine?.[0]?.household_id
  if (!householdId) return { written: 0, skipped: 'no household' }
  const { data: hh } = await supabase.from('households').select('timezone').eq('id', householdId).single()
  const today = todayIn(hh?.timezone ?? 'America/New_York')
  const { data: hm, error: hmError } = await supabase.from('household_members').select('user_id').eq('household_id', householdId).eq('status', 'active')
  if (hmError) throw new Error(`household_members read failed: ${hmError.message}`)
  const userIds = ((hm ?? []) as { user_id: string }[]).map((m) => m.user_id)
  const { data: fm, error: fmError } = await supabase
    .from('family_members').select('id, name, role_label, member_type, display_order, is_full_user')
    .in('user_id', userIds).eq('member_type', 'core').order('display_order', { ascending: true })
  if (fmError) throw new Error(`family_members read failed: ${fmError.message}`)
  const seen = new Set<string>()
  const members: Member[] = ((fm ?? []) as RosterRow[]).flatMap((m) => {
    const key = m.name.trim().toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    const isChild = m.role_label === 'child' ? true : m.role_label === 'parent' ? false : !m.is_full_user
    return [{ id: m.id, name: m.name, isChild }]
  })
  if (!members.some((m) => m.isChild)) return { written: 0, skipped: 'no children in the household' }

  const items = parseHomework(await callClaude(buildHomeworkPrompt(sources, members, today.ymd, today.weekday), apiKey))
  if (items.length === 0) return { written: 0 }

  // Open homework anyone in the household already has, for the dedupe.
  const { data: open, error: openError } = await supabase
    .from('tasks').select('title, assigned_to, assigned_to_all')
    .in('user_id', userIds).eq('category', 'homework').eq('completed', false).limit(500)
  if (openError) throw new Error(`homework read failed: ${openError.message}`)
  const rows = planHomework({ items, members, userId, todayYmd: today.ymd, existing: (open ?? []) as ExistingHomework[] })
  if (rows.length === 0) return { written: 0 }
  const { error } = await supabase.from('tasks').insert(rows)
  if (error) throw new Error(`homework insert failed: ${error.message}`)
  return { written: rows.length }
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
    // The kids' work onto the wall — after the email, and never at its cost.
    let kidsWork: { written: number; skipped?: string } | { error: string }
    try {
      kidsWork = await postKidsWork(supabase, userId, sources, Deno.env.get('ANTHROPIC_API_KEY')!)
    } catch (e) {
      console.error('school-digest: kids\' work failed:', e)
      kidsWork = { error: String(e) }
    }
    return json({ ok: true, messageId: id, to, sections: digest.sections.length, toDo, kidsWork })
  } catch (e) {
    console.error('school-digest failed:', e)
    return json({ error: String(e) }, 500)
  }
})
