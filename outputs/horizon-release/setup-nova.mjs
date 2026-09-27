// Fictional "Nova household" on the ISOLATED local Supabase only.
import { createClient } from '@supabase/supabase-js'
const admin = createClient('http://127.0.0.1:55321', process.env.LOCAL_SR, { auth: { persistSession: false } })
for (const [u, name] of [['sky', 'Sky Nova'], ['rowan', 'Rowan Nova']]) {
  const { error } = await admin.auth.admin.createUser({ email: `${u}@horizon.test`, password: 'horizon-local-1', email_confirm: true, user_metadata: { full_name: name } })
  if (error && !/already/.test(error.message)) throw error
}
console.log('ok')
