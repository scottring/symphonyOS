// WALL-APP-DONE — a web app on the wall (Puzzle Trail, GAL practice) says a
// kid finished a day's plan, from any device, and that kid's routine for the
// day is checked off (Scott, 2026-10-29: the wall said "not done" for rounds
// done on the tablet; the app's in-frame message only reached the wall).
//
// Auth: shared secret (x-app-secret, WALL_APP_SECRET), held by the app's
// server only. Scope: the routines whose description links this app for
// this kid, due that day; nothing else is read or written.
//
// Body: { app: 'kaleb-puzzle-trail.vercel.app', kid: 'ella', dates: ['2026-10-27'] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { WALL_APP_HOSTS, linksKid, dueOn, todayIn, reachableDates, type AppRoutine } from './lib.ts'

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = Deno.env.get('WALL_APP_SECRET')
  if (!secret || req.headers.get('x-app-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  let body: { app?: unknown; kid?: unknown; dates?: unknown }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const app = typeof body.app === 'string' ? body.app.toLowerCase() : ''
  const kid = typeof body.kid === 'string' ? body.kid.toLowerCase() : ''
  if (!WALL_APP_HOSTS.includes(app) || !/^[a-z]{2,20}$/.test(kid)) return json({ error: 'unknown app or kid' }, 400)
  const dates = reachableDates(body.dates, todayIn('America/New_York'))
  if (!dates.length) return json({ marked: [] })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: found, error } = await supabase
    .from('routines')
    .select('id, user_id, description, visibility, paused_until, recurrence_pattern')
    .ilike('description', `%${app}%`)
  if (error) return json({ error: 'read failed' }, 500)
  const routines = ((found ?? []) as AppRoutine[]).filter((r) => linksKid(r.description, app, kid))

  const marked: { routineId: string; date: string }[] = []
  for (const date of dates) {
    for (const r of routines.filter((x) => dueOn(x, date))) {
      const { data: existing } = await supabase
        .from('actionable_instances')
        .select('id, status')
        .eq('entity_type', 'routine').eq('entity_id', r.id).eq('date', date).eq('user_id', r.user_id)
        .limit(1)
      const row = existing?.[0] as { id: string; status: string } | undefined
      const write = row
        ? row.status === 'completed' ? null : supabase.from('actionable_instances')
            .update({ status: 'completed', completed_at: new Date().toISOString(), skipped_at: null }).eq('id', row.id)
        : supabase.from('actionable_instances')
            .insert({ user_id: r.user_id, entity_type: 'routine', entity_id: r.id, date, status: 'completed', completed_at: new Date().toISOString() })
      if (write) {
        const { error: werr } = await write
        if (werr) { console.error('check-off failed', r.id, date, werr.message); continue }
      }
      marked.push({ routineId: r.id, date })
    }
  }
  return json({ marked })
})
