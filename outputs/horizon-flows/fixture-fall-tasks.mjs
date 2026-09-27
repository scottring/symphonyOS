import { createClient } from '@supabase/supabase-js'
const URL = 'http://127.0.0.1:55321'
const as = async (u) => { const c = createClient(URL, process.env.LOCAL_ANON, { auth: { persistSession: false } }); const { data } = await c.auth.signInWithPassword({ email: `${u}@horizon.test`, password: 'horizon-local-1' }); return [c, data.user.id] }
const [casey, cid] = await as('casey')
const [jordan, jid] = await as('jordan')
const { data: members } = await casey.from('family_members').select('id,name')
const m = (n) => members.find((x) => x.name.startsWith(n))?.id
const fall = '2026-09-01'
const row = (title, o = {}) => ({ user_id: cid, title, bucket: 'quarter', season_start: fall, context: 'family', scope: 'compound', ...o })
const rows = [
  row('Plan winter vacation', { notes: 'Somewhere warm, Dec 26 – Jan 2. Budget about $4k.', links: [{ url: 'https://example.com/beach-rentals', title: 'Beach rentals shortlist' }] }),
  row('Nourish a love of reading', { assigned_to_all: [m('Casey'), m('Jordan')].filter(Boolean) }),
  row('Renew the passports'),
  row('Get the house ready for winter'),
  row('Return the library books'),
  row('Build a steady running habit', { context: 'personal', scope: 'individual' }),
  row('Order Halloween costumes'),
  row('Finish the basement playroom', { notes: 'Paint, rug, shelves. Kids want a reading nook.' }),
  row('Schedule the chimney sweep'),
  row('Get finances organized before year end', { context: 'personal', scope: 'individual' }),
  row('Cancel the old gym membership', { context: 'personal', scope: 'individual' }),
  row('Deepen friendships with the neighbors'),
  row('Buy snow tires'),
  row('Learn three new weeknight dinners'),
  row('Send thank-you notes from the party', { context: null, scope: 'individual' }),
  row('Launch the newsletter side project', { context: 'work', scope: 'individual' }),
  row('Rake the leaves'),
  row('Help Mia settle into second grade', { assigned_to_all: [m('Jordan')].filter(Boolean) }),
  row('Back up the family photos', { context: null, scope: 'individual' }),
  // A dated action on the season, and one already placed in October.
  row('Book flu shots', { bucket: 'timed', scheduled_for: '2026-10-03T04:00:00Z', is_all_day: true }),
  row('Call the roofer about the gutter', { bucket: 'month', month_start: '2026-10-01' }),
  // Finished.
  row('Clean out the gutters', { completed: true, completed_at: new Date().toISOString() }),
]
for (const r of rows) { const { error } = await casey.from('tasks').insert(r); if (error) throw new Error(r.title + ': ' + error.message) }
// The partner's own private items — never on Casey's page.
const jr = [
  { user_id: jid, title: 'Jordan: private reading list', bucket: 'quarter', season_start: fall, context: 'personal', scope: 'individual' },
  { user_id: jid, title: 'Jordan: work conference prep', bucket: 'quarter', season_start: fall, context: 'work', scope: 'individual' },
]
for (const r of jr) { const { error } = await jordan.from('tasks').insert(r); if (error) throw error }
console.log('members', members.map((x) => x.name).join(', '), '· inserted', rows.length)
