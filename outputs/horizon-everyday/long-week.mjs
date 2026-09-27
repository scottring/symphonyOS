// Put 14 of Riley's November next actions (across 14 goals) and 4 single
// actions on the week of Nov 1–7 — written as Riley through RLS, local only.
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'riley@horizon.test', password: 'horizon-local-1' })
const { data: steps } = await sb.from('tasks').select('id, goal_task_id').eq('user_id', s.user.id).eq('month_start', '2026-11-01').not('goal_task_id', 'is', null)
const seen = new Set(); const pick = []
for (const t of steps) { if (seen.has(t.goal_task_id)) continue; seen.add(t.goal_task_id); pick.push(t.id); if (pick.length === 14) break }
const { data: loose } = await sb.from('tasks').select('id').eq('user_id', s.user.id).eq('month_start', '2026-11-01').is('goal_task_id', null).eq('is_goal', false).limit(4)
for (const id of [...pick, ...loose.map((l) => l.id)]) {
  const { error } = await sb.from('tasks').update({ bucket: 'week', week_start: '2026-11-01' }).eq('id', id)
  if (error) throw error
}
console.log('placed', pick.length + loose.length)
