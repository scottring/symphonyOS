// A long November for Riley (local only, written through RLS): 32 goals,
// some with next actions, and 12 single actions.
import { createClient } from '@supabase/supabase-js'
const sb = createClient('http://127.0.0.1:55321', process.env.LOCAL_ANON, { auth: { persistSession: false } })
const { data: s } = await sb.auth.signInWithPassword({ email: 'riley@horizon.test', password: 'horizon-local-1' })
const base = { user_id: s.user.id, bucket: 'month', month_start: '2026-11-01', context: 'family', scope: 'compound', completed: false }
const outcomes = ['Host Thanksgiving for twelve', 'Winterize the garden beds', 'Get the kids’ winter gear sorted', 'Reorganize the pantry', 'Plan the December budget', 'Finish the photo album for Grandma', 'Set up a homework corner', 'Learn to bake sourdough', 'Paint the upstairs hallway', 'Clear the garage for the car', 'Start a Sunday family walk', 'Book holiday travel', 'Replace the porch light fixtures', 'Declutter the playroom', 'Plan Mia’s birthday party', 'Refresh the guest room', 'Get the gutters cleaned', 'Organize the tax documents', 'Try a new recipe each week', 'Build a reading nook', 'Service the furnace', 'Make the entryway work in winter', 'Fix the squeaky stairs', 'Tidy the digital photo library', 'Plan the holiday card', 'Sort the donation pile', 'Get the car winter-ready', 'Improve bedtime routine', 'Set up the new printer', 'Put up the holiday lights', 'Write thank-you notes from summer', 'Rehang the gallery wall']
for (const [i, title] of outcomes.entries()) {
  const { data, error } = await sb.from('tasks').insert({ ...base, title, is_goal: true }).select('id').single()
  if (error) throw error
  for (let k = 0; k < (i % 4); k++) {
    const { error: e } = await sb.from('tasks').insert({ ...base, title: `${title.split(' ').slice(0, 2).join(' ')} — step ${k + 1}`, goal_task_id: data.id })
    if (e) throw e
  }
}
for (const title of ['Return the library books', 'Renew the car registration', 'Buy stamps', 'Call the dentist', 'Order new filters', 'Pay the water bill', 'Drop off dry cleaning', 'Schedule the chimney sweep', 'Pick up the photos', 'Buy snow tires', 'Mail the rebate form', 'Book haircuts'])
  { const { error } = await sb.from('tasks').insert({ ...base, title }); if (error) throw error }
console.log('ok')
