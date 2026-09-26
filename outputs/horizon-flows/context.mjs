// Adds context to "Choose chairs" AS ALEX (anon key + Alex's session, so RLS applies). Local only.
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'alex@horizon.test', password: 'horizon-local-1' })
const { data: [t] } = await sb.from('tasks').select('id').eq('title', 'Choose chairs')
const { error } = await sb.from('tasks').update({
  notes: 'Patio is 3.2 m × 2.4 m — four chairs max. Budget $400 total. Weather-proof, stackable.',
  links: [{ url: 'https://example.com/outdoor-chairs', title: 'Shortlist: outdoor chairs' }],
  location: 'Garden centre, 12 Elm St',
}).eq('id', t.id)
console.log(error ?? 'ok', t.id)
