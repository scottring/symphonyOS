// Proof, local only, as Casey through RLS: can a season goal be turned back
// into a task while a month goal still supports it? And the child itself?
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'casey@horizon.test', password: 'horizon-local-1' })
const { data: [parent] } = await sb.from('tasks').select('id,title').eq('user_id', s.user.id).eq('is_goal', true).eq('bucket', 'quarter').limit(1)
const { data: child, error: e0 } = await sb.from('tasks').insert({ user_id: s.user.id, title: 'REPRO month goal', bucket: 'month', month_start: '2026-10-01', is_goal: true, completed: false, supports_goal_task_id: parent.id, context: 'family', scope: 'compound' }).select('id').single()
if (e0) throw e0
const r1 = await sb.from('tasks').update({ is_goal: false }).eq('id', parent.id)
console.log('parent → task while supported:', r1.error ? `REFUSED ${r1.error.message}` : 'ALLOWED (child now points at a non-goal)')
await sb.from('tasks').update({ is_goal: true }).eq('id', parent.id)
const r2 = await sb.from('tasks').update({ is_goal: false }).eq('id', child.id)
console.log('linked child → task:', r2.error ? `REFUSED ${r2.error.message}` : 'ALLOWED (a task left carrying supports_goal_task_id)')
await sb.from('tasks').delete().eq('id', child.id)
console.log('cleaned up; parent restored:', (await sb.from('tasks').select('is_goal').eq('id', parent.id).single()).data)
