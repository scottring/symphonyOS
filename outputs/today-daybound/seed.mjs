// Fictional routines for Sky (Nova household) on the ISOLATED local Supabase, as the user (RLS on).
import { createClient } from '@supabase/supabase-js'
const c = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s, error } = await c.auth.signInWithPassword({ email: 'sky@horizon.test', password: 'horizon-local-1' })
if (error) throw error
const uid = s.user.id
await c.from('routines').delete().like('name', 'TDB %')
const base = { user_id: uid, visibility: 'active', show_on_timeline: true, context: 'family', scope: 'compound', time_of_day: null }
const rows = [
  { ...base, name: 'TDB Water houseplants every weekend', recurrence_pattern: { type: 'weekly', days: ['sun'] } },
  { ...base, name: 'TDB Kids clean rooms (Sat+Sun chore)', recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] } },
  { ...base, name: 'TDB Mow the lawn (weekend window)', recurrence_pattern: { type: 'weekend' } },
  { ...base, name: 'TDB Saturday-only chore', recurrence_pattern: { type: 'weekly', days: ['sat'] } },
  { ...base, name: 'TDB Sunday off-Today', recurrence_pattern: { type: 'weekly', days: ['sun'] }, show_on_timeline: false },
]
for (const r of rows) { const { error: e } = await c.from('routines').insert(r); if (e) throw new Error(r.name + ': ' + e.message) }
console.log('seeded', rows.length)
