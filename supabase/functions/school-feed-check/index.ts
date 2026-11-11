// SCHOOL-FEED-CHECK — emails the household when its school feeds go wrong
// (Scott, 2026-11-11: the worker stopped on Nov 8 and nobody knew for three
// days). pg_cron calls it every 15 minutes (school_feed_check()). It reads
// connector_health, decides what is wrong (lib/problems.ts), and mails the
// user from their own Gmail: once when something goes wrong, again if it is
// still wrong a day later, and once when it is fixed. Quiet 10pm–7am.
//
// Auth: the scheduler's service-role key as a bearer token (lib/auth.ts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isScheduler } from './lib/auth.ts'
import { alertKey, awake, feedProblems, shouldMail, type HealthRow } from './lib/problems.ts'
import { buildMime, gmailAccessToken, gmailAddress, sendGmail } from '../_shared/gmailSend.ts'

const TIMEZONE = 'America/New_York'
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

export async function handler(req: Request): Promise<Response> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!isScheduler(req.headers.get('authorization'), key)) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, key)
  const now = new Date()
  const { data: health, error } = await supabase.from('connector_health')
    .select('user_id, connector, last_ok_at, last_error, last_error_at, heartbeat_at, last_flush_at')
  if (error) return json({ error: error.message }, 500)

  const byUser = new Map<string, HealthRow[]>()
  for (const r of (health ?? []) as (HealthRow & { user_id: string })[]) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])
  }

  const results: Record<string, unknown> = {}
  for (const [userId, rows] of byUser) {
    try {
      const { data: srcs } = await supabase.from('capture_sources').select('connector').eq('user_id', userId).eq('is_active', true)
      const watched = new Set(((srcs ?? []) as { connector: string }[]).map((s) => s.connector))
      if (watched.size === 0) { results[userId] = 'no feeds'; continue }

      const problems = feedProblems(rows, watched, now, TIMEZONE)
      const k = alertKey(problems)
      const { data: last } = await supabase.from('connector_alerts').select('alert_key, alerted_at').eq('user_id', userId).maybeSingle()
      const mail = shouldMail(k, last, now)
      if (!mail || !awake(now, TIMEZONE)) { results[userId] = { problems: k, mailed: false }; continue }

      const token = await gmailAccessToken(supabase, userId)
      const me = await gmailAddress(token)
      const subject = mail === 'resolved' ? 'School feeds are working again' : 'School feeds need attention'
      const lines = mail === 'resolved'
        ? ['The school feeds are collecting messages again; the 5pm digest will go out as usual.']
        : problems.map((p) => p.text)
      await sendGmail(token, buildMime({
        from: me, to: [me], subject,
        text: lines.map((l) => `• ${l}`).join('\n') + '\n\n— Symphony',
        html: `<ul>${lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul><p style="color:#777">— Symphony</p>`,
      }))
      await supabase.from('connector_alerts').upsert({ user_id: userId, alert_key: k, alerted_at: now.toISOString() }, { onConflict: 'user_id' })
      results[userId] = { problems: k, mailed: mail }
    } catch (e) {
      console.error('school-feed-check failed for a user:', e)
      results[userId] = { error: String(e) }
    }
  }
  return json({ ok: true, results })
}

Deno.serve(handler)
