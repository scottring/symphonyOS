// Send mail from a user's own Gmail (their Google connection with the
// gmail.send scope). Copied from school-digest (2026-11-11), which still has
// its own copy so its 5pm run was not touched by the feed guard.
import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadGoogleConnection } from './calendar-providers/googleConnection.ts'

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>, connectionId: string, refreshToken: string,
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
  }).eq('id', connectionId)
  return data.access_token
}

export async function gmailAccessToken(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { connection: conn, error } = await loadGoogleConnection(supabase, userId, { needs: 'mail' })
  if (error || !conn?.refresh_token) throw new Error('No Google connection with a refresh token for this user')
  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (!conn.access_token || expiresAt - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(supabase, conn.id, conn.refresh_token)
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

export function buildMime(p: { from: string; to: string[]; subject: string; text: string; html: string }): string {
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

export async function sendGmail(accessToken: string, mime: string): Promise<string> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(mime) }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Gmail send failed: ${data.error.message ?? JSON.stringify(data.error)}`)
  return data.id as string
}

/** The address the user's Gmail sends as. */
export async function gmailAddress(accessToken: string): Promise<string> {
  const profile = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })).json()
  if (profile.error) throw new Error(`Gmail profile fetch failed: ${JSON.stringify(profile.error)}`)
  return profile.emailAddress as string
}
