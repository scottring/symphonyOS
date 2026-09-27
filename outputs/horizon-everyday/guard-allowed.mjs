import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'casey@horizon.test', password: 'horizon-local-1' })
const { data: [g] } = await sb.from('tasks').insert({ user_id: s.user.id, title: 'GUARD free goal', bucket: 'quarter', season_start: '2026-09-01', is_goal: true, completed: false, context: 'family', scope: 'compound' }).select('id')
const r = await sb.from('tasks').update({ is_goal: false }).eq('id', g.id)
const back = await sb.from('tasks').update({ is_goal: true }).eq('id', g.id)
const done = await sb.from('tasks').update({ completed: true }).eq('id', g.id)
console.log('free goal → task:', r.error?.message ?? 'allowed', '| task → goal:', back.error?.message ?? 'allowed', '| complete:', done.error?.message ?? 'allowed')
await sb.from('tasks').delete().eq('id', g.id)
