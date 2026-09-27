// Context on "Choose chairs", written AS RILEY (anon key + session → RLS). Local only.
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'riley@horizon.test', password: 'horizon-local-1' })
const { data: [t] } = await sb.from('tasks').select('id').eq('title', 'Choose chairs').eq('user_id', s.user.id)
const { error } = await sb.from('tasks').update({
  notes: 'Patio is 3.2 m × 2.4 m — four chairs max, 55 cm wide or less. Budget $400 total. Weather-proof and stackable.',
  links: [{ url: 'https://example.com/outdoor-chairs', title: 'Shortlist: outdoor chairs' }, { url: 'https://example.com/cushions', title: 'Cushion colours' }],
  location: 'Garden centre, 12 Elm St', phone_number: '555-0142',
}).eq('id', t.id)
console.log(error ?? 'ok', t.id)
