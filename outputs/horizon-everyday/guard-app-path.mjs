// The app's own write path (PostgREST, anon key + Riley's session), local only.
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'riley@horizon.test', password: 'horizon-local-1' })
const base = { user_id: s.user.id, bucket: 'quarter', season_start: '2026-09-01', completed: false, context: 'family', scope: 'compound' }
const { data: g } = await sb.from('tasks').insert({ ...base, title: 'GUARDTEST app goal', is_goal: true }).select('id').single()
const { data: t } = await sb.from('tasks').insert({ ...base, title: 'GUARDTEST app task', is_goal: false }).select('id').single()
const a = await sb.from('tasks').insert({ ...base, title: 'GUARDTEST app step', goal_task_id: g.id }).select('id').single()
const b = await sb.from('tasks').insert({ ...base, title: 'GUARDTEST bad step', goal_task_id: t.id }).select('id').single()
const c = await sb.from('tasks').update({ is_goal: false }).eq('id', g.id)
console.log('addStep under a goal:', a.error?.message ?? 'ok', '| step under a task:', b.error?.message ?? 'ok', '| convert goal with step:', c.error?.message ?? 'ok')
await sb.from('tasks').delete().like('title', 'GUARDTEST%')
