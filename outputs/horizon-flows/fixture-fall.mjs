// A fictional household whose Fall list looks like an imported paper plan:
// 21 open items, NO goals — broad outcomes and true actions side by side,
// plus a dated action, one already placed in October, a finished one, and a
// partner's private items. Local Supabase ONLY (127.0.0.1:55321), written as
// the users themselves (anon key + their sessions), so RLS applies.
import { createClient } from '@supabase/supabase-js'
const URL = 'http://127.0.0.1:55321'
const { LOCAL_SR: SR, LOCAL_ANON: AN } = process.env
const admin = createClient(URL, SR, { auth: { persistSession: false } })
const ids = {}
for (const [u, name] of [['casey', 'Casey Morgan'], ['jordan', 'Jordan Morgan']]) {
  const email = `${u}@horizon.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'horizon-local-1', email_confirm: true, user_metadata: { full_name: name } })
  ids[u] = data?.user?.id ?? (await admin.auth.admin.listUsers()).data.users.find((x) => x.email === email).id
  if (error && !/already/.test(error.message)) throw error
}
const as = async (u) => { const c = createClient(URL, AN, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email: `${u}@horizon.test`, password: 'horizon-local-1' }); return c }
const casey = await as('casey')
const { data: hid } = await casey.rpc('setup_household', { p_name: 'Morgan household' })
await admin.from('household_members').upsert({ household_id: hid, user_id: ids.jordan, role: 'member', status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'household_id,user_id' })
console.log(JSON.stringify({ ids, hid }))
