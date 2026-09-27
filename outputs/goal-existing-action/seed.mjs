// Fictional Alex+Sam household on the ISOLATED local Supabase only (as the users, RLS on).
import { createClient } from '@supabase/supabase-js'
const URL = 'http://127.0.0.1:55321'
if (!/127\.0\.0\.1/.test(URL)) throw new Error('local only')
const as = async (u) => { const c = createClient(URL, process.env.LOCAL_ANON, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email: `${u}@horizon.test`, password: 'horizon-local-1' }); if (error) throw error; return [c, data.user.id] }
const [alex, aid] = await as('alex')
const [sam, sid] = await as('sam')
const { data: members } = await alex.from('family_members').select('id,name')
const m = (n) => members.find((x) => x.name.startsWith(n))?.id
const ins = async (c, r) => { const { data, error } = await c.from('tasks').insert(r).select('id').single(); if (error) throw new Error(r.title + ': ' + error.message); return data.id }
const T = (s) => `GEA ${s}`
const goal = await ins(alex, { user_id: aid, title: T('Identify family activities for fall'), bucket: 'month', month_start: '2026-10-01', is_goal: true, context: 'family', scope: 'compound' })
const winter = await ins(alex, { user_id: aid, title: T('Get the house ready for winter'), bucket: 'month', month_start: '2026-10-01', is_goal: true, context: 'family', scope: 'compound' })
const ids = {
  goal, winter,
  musicA: await ins(alex, { user_id: aid, title: T('Look up music lessons'), bucket: 'inbox', context: 'family', scope: 'compound', notes: 'Ask about cello for Liam', assigned_to: m('Alex'), assigned_to_all: [m('Alex')].filter(Boolean) }),
  musicB: await ins(sam, { user_id: sid, title: T('Look up music lessons'), bucket: 'week', week_start: '2026-10-05', context: 'family', scope: 'compound', assigned_to_all: [m('Sam')].filter(Boolean) }),
  dentist: await ins(alex, { user_id: aid, title: T('Dentist for Mia'), bucket: 'timed', scheduled_for: '2026-10-14T19:00:00Z', is_all_day: false, context: 'family', scope: 'compound' }),
  swim: await ins(alex, { user_id: aid, title: T('Look up swim lessons'), bucket: 'month', month_start: '2026-10-01', context: 'family', scope: 'compound', goal_task_id: winter }),
  therapy: await ins(alex, { user_id: aid, title: T('Book my therapy session'), bucket: 'inbox', context: 'personal', scope: 'individual' }),
  samPrivate: await ins(sam, { user_id: sid, title: T('Sam private work thing'), bucket: 'inbox', context: 'work', scope: 'individual' }),
}
for (let i = 0; i < 60; i++) await ins(alex, { user_id: aid, title: T(`Errand ${String(i).padStart(2, '0')}`), bucket: 'someday', context: 'family', scope: 'compound' })
console.log(JSON.stringify(ids))
