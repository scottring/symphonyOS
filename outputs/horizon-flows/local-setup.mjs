// Fictional accounts on the ISOLATED local Supabase (127.0.0.1:55321) only.
// Refuses any other URL, so it can never touch the shared database.
import { createClient } from '@supabase/supabase-js'
const URL = 'http://127.0.0.1:55321'
if (!URL.startsWith('http://127.0.0.1:55321')) throw new Error('local only')
const SR = process.env.LOCAL_SR, AN = process.env.LOCAL_ANON
const admin = createClient(URL, SR, { auth: { persistSession: false } })
const users = {}
for (const [u, name] of [['alex', 'Alex Rivera'], ['sam', 'Sam Rivera']]) {
  const email = `${u}@horizon.test`
  let { data, error } = await admin.auth.admin.createUser({ email, password: 'horizon-local-1', email_confirm: true, user_metadata: { full_name: name } })
  if (error && !/already/.test(error.message)) throw error
  if (!data?.user) data = { user: (await admin.auth.admin.listUsers()).data.users.find((x) => x.email === email) }
  users[u] = data.user.id
}
const alex = createClient(URL, AN, { auth: { persistSession: false } })
await alex.auth.signInWithPassword({ email: 'alex@horizon.test', password: 'horizon-local-1' })
const { data: hid, error } = await alex.rpc('setup_household', { p_name: 'Rivera household' })
if (error) throw error
const { error: e2 } = await admin.from('household_members').upsert({ household_id: hid, user_id: users.sam, role: 'member', status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'household_id,user_id' })
if (e2) console.log('sam join:', e2.message)
console.log(JSON.stringify({ users, hid }))
