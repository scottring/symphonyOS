#!/usr/bin/env node
/**
 * seed-demo.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Rebuild the DEMO account (symphonygoals@gmail.com) into a coherent,
 * camera-ready world for live demos. Companion doc: docs/demo/demo-script.md
 *
 * WHAT IT DOES: wipes every row belonging to the demo user (tasks, projects,
 * goals, routines, lists, meals, contacts, extra family members) and reseeds
 * the "Alex" household — partner Iris, kids Liam & Mia — with:
 *   • Today: timed tasks across Work/Personal/Family, rich context attached
 *     (notes, links, phone numbers, project + contact chips)
 *   • Inbox: four raw captures for the live triage beat
 *   • Year: 4 goals in 4 areas  →  Season: 3 picks + 1 won + 5 bench items
 *     (bench is deliberately mixed-quality so the AI audit has real work)
 *   • Month: moves threaded to picks so the season pulse dots light up
 *   • Routines: "Morning reset" collection + kid-assigned trash night
 *   • Meals: this week's dinner plan + 3 recipes
 *   • Lists: family groceries + a trip packing list
 *
 * DATES ARE RELATIVE TO RUN DAY — run it the morning of the demo and Today
 * is always populated. IDEMPOTENT: full wipe + reseed, safe to re-run.
 *
 *   node scripts/seed-demo.mjs        (reads .env for URL + service key)
 *
 * ONLY touches user f9ff9f28… (the demo account). Never run against real data.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ── env ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = {}
try {
  for (const line of readFileSync(join(__dirname, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall through to process.env */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY (checked env + .env)')
  process.exit(1)
}

const DEMO_USER = 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7' // symphonygoals@gmail.com ONLY
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const die = (label) => (res) => {
  if (res.error) { console.error(`✗ ${label}:`, res.error.message); process.exit(1) }
  return res.data
}

// ── date helpers (all relative to run day, local timezone) ───────────────
const today = new Date(); today.setHours(0, 0, 0, 0)
const at = (dayOffset, hh, mm = 0) => {
  const d = new Date(today); d.setDate(d.getDate() + dayOffset); d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}
const allDay = (dayOffset) => at(dayOffset, 0, 0)
// season anchor: first day of the current quarter-ish season month (Jun/Sep/Dec/Mar)
const seasonAnchor = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 15)
const pickStamp = (i) => new Date(seasonAnchor.getTime() + i * 60_000).toISOString()
const nextMonthDay = (day) => {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, day, 9, 0, 0)
  return d.toISOString()
}
const thisMonthDay = (day) => {
  const d = new Date(today.getFullYear(), today.getMonth(), day, 9, 0, 0)
  if (d < today) d.setDate(today.getDate() + 2) // keep moves in the future
  return d.toISOString()
}
const sundayOfThisWeek = () => {
  const d = new Date(today); d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('Seeding demo world for', DEMO_USER, '— demo day', today.toDateString())

  // ── 1. WIPE (FK-safe order) ────────────────────────────────────────────
  console.log('· wiping old demo data')
  die('wipe tasks')(await db.from('tasks').delete().eq('user_id', DEMO_USER))
  die('wipe list_items')(await db.from('list_items').delete().eq('user_id', DEMO_USER))
  die('wipe lists')(await db.from('lists').delete().eq('user_id', DEMO_USER))
  const oldPlans = die('read meal_plans')(await db.from('meal_plans').select('id').eq('user_id', DEMO_USER))
  if (oldPlans.length) die('wipe meal entries')(await db.from('meal_plan_entries').delete().in('meal_plan_id', oldPlans.map(p => p.id)))
  die('wipe meal_plans')(await db.from('meal_plans').delete().eq('user_id', DEMO_USER))
  die('wipe recipes')(await db.from('recipes').delete().eq('user_id', DEMO_USER))
  die('wipe routine steps')(await db.from('routines').delete().eq('user_id', DEMO_USER).not('parent_routine_id', 'is', null))
  die('wipe routines')(await db.from('routines').delete().eq('user_id', DEMO_USER))
  die('wipe goals')(await db.from('goals').delete().eq('user_id', DEMO_USER))
  die('wipe goal_areas')(await db.from('goal_areas').delete().eq('user_id', DEMO_USER))
  die('wipe projects')(await db.from('projects').delete().eq('user_id', DEMO_USER))
  die('wipe contacts')(await db.from('contacts').delete().eq('user_id', DEMO_USER))
  die('wipe extra family')(await db.from('family_members').delete().eq('user_id', DEMO_USER).eq('is_full_user', false))

  // ── 2. FAMILY ──────────────────────────────────────────────────────────
  console.log('· family: Alex, Iris, Liam, Mia')
  const selfRows = die('read self member')(await db.from('family_members')
    .select('id').eq('user_id', DEMO_USER).eq('is_full_user', true).limit(1))
  if (!selfRows.length) { console.error('✗ no self family_members row for demo user'); process.exit(1) }
  const alexId = selfRows[0].id
  die('rename self → Alex')(await db.from('family_members')
    .update({ name: 'Alex', initials: 'A', color: 'blue', display_order: 0 }).eq('id', alexId))
  const fam = die('insert family')(await db.from('family_members').insert([
    { user_id: DEMO_USER, name: 'Iris', initials: 'I', color: 'purple', is_full_user: false, display_order: 1, member_type: 'core' },
    { user_id: DEMO_USER, name: 'Liam', initials: 'L', color: 'green', is_full_user: false, display_order: 2, member_type: 'core' },
    { user_id: DEMO_USER, name: 'Mia', initials: 'M', color: 'orange', is_full_user: false, display_order: 3, member_type: 'core' },
  ]).select('id,name'))
  const member = Object.fromEntries(fam.map(f => [f.name, f.id])); member.Alex = alexId

  // ── 3. CONTACTS ────────────────────────────────────────────────────────
  const contacts = die('contacts')(await db.from('contacts').insert([
    { user_id: DEMO_USER, name: 'Dr. Patel', phone: '(555) 014-2200', category: 'medical', relationship: 'Pediatrician', notes: 'Office closes at 4:30. Front desk: ask for Renee.', context: 'family', scope: 'compound' },
    { user_id: DEMO_USER, name: 'Mike Rivera', phone: '(555) 014-8890', category: 'service_provider', relationship: 'Contractor — kitchen', notes: 'Texts back faster than he answers calls.', context: 'family', scope: 'compound' },
    { user_id: DEMO_USER, name: 'Ms. Alvarez', email: 'alvarez@lakeside.edu', category: 'school', relationship: "Liam's teacher", context: 'family', scope: 'compound' },
  ]).select('id,name'))
  const contact = Object.fromEntries(contacts.map(c => [c.name, c.id]))

  // ── 4. PROJECTS ────────────────────────────────────────────────────────
  const projects = die('projects')(await db.from('projects').insert([
    {
      user_id: DEMO_USER, name: 'Kitchen renovation', status: 'in_progress', context: 'family', scope: 'compound',
      phone_number: '(555) 014-8890',
      notes: 'Decision log:\n• Counter depth 25.5" (confirmed w/ Mike 7/12)\n• Keeping the window over the sink\n• Floor: white oak, matte\n\nStill open: paint color, cabinet pulls.',
      links: [
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/1572/quiet-moments', title: 'Paint option A — Quiet Moments' },
        { url: 'https://www.homedepot.com/b/Appliances-Dishwashers/N-5yc1vZc3po', title: 'Dishwasher shortlist' },
      ],
    },
    { user_id: DEMO_USER, name: 'Website relaunch', status: 'in_progress', context: 'work', scope: 'individual', notes: 'Launch window: first week of next month. Copy freeze this Friday.' },
    { user_id: DEMO_USER, name: 'Cabin weekend — Labor Day', status: 'in_progress', type: 'trip', context: 'family', scope: 'compound', notes: 'Lake cabin, 3 nights. Dogs allowed. Check-in after 3pm.' },
  ]).select('id,name'))
  const project = Object.fromEntries(projects.map(p => [p.name, p.id]))

  // ── 5. GOALS (year) ────────────────────────────────────────────────────
  const areas = die('goal areas')(await db.from('goal_areas').insert([
    { user_id: DEMO_USER, name: 'Home', sort_order: 0 },
    { user_id: DEMO_USER, name: 'Family & Adventure', sort_order: 1 },
    { user_id: DEMO_USER, name: 'Money & Estate', sort_order: 2 },
    { user_id: DEMO_USER, name: 'Health', sort_order: 3 },
  ]).select('id,name'))
  const area = Object.fromEntries(areas.map(a => [a.name, a.id]))
  const year = today.getFullYear()
  const goals = die('goals')(await db.from('goals').insert([
    { user_id: DEMO_USER, name: 'The house works for us — not the other way around', year, status: 'active', area_id: area['Home'], sort_order: 0 },
    { user_id: DEMO_USER, name: 'More time outside, together', year, status: 'active', area_id: area['Family & Adventure'], sort_order: 0 },
    { user_id: DEMO_USER, name: 'Money and estate basics handled like adults', year, status: 'active', area_id: area['Money & Estate'], sort_order: 0 },
    { user_id: DEMO_USER, name: 'A fitness habit that survives busy weeks', year, status: 'active', area_id: area['Health'], sort_order: 0 },
  ]).select('id,name'))
  const goal = Object.fromEntries(goals.map(g => [g.name, g.id]))

  // ── 6. SEASON: 3 picks + 1 won + 5 bench ───────────────────────────────
  console.log('· season: picks, won, bench')
  const q = (row) => ({ user_id: DEMO_USER, completed: false, bucket: 'quarter', context: 'family', scope: 'compound', ...row })
  const seasonTasks = die('season tasks')(await db.from('tasks').insert([
    // picks (picked_at set, staggered so order is stable)
    q({ title: 'A money plan we actually follow', picked_at: pickStamp(0), goal_id: goal['Money and estate basics handled like adults'] }),
    q({ title: 'Will drafted and signed', picked_at: pickStamp(1), goal_id: goal['Money and estate basics handled like adults'] }),
    q({ title: 'Bikes bought, family riding weekly', picked_at: pickStamp(2), goal_id: goal['More time outside, together'] }),
    // won pick — completed, frees its slot, renders under "Won this season"
    q({ title: 'Winter vacation booked', picked_at: pickStamp(3), completed: true, goal_id: goal['More time outside, together'] }),
    // bench — deliberately mixed quality so the AI audit has real verdicts to give
    q({ title: 'Plan fall activities for the kids' }),
    q({ title: 'Rough outline of school breaks' }),
    q({ title: 'Fix up outdoor spaces' }),
    q({ title: 'Spread out socially as a family' }),
    q({ title: 'Be more organized' }),
  ]).select('id,title'))
  const pick = Object.fromEntries(seasonTasks.map(t => [t.title, t.id]))

  // ── 7. MONTH MOVES (threaded to picks → pulse dots light up) ───────────
  const m = (row) => ({ user_id: DEMO_USER, completed: false, bucket: 'month', context: 'family', scope: 'compound', ...row })
  die('month moves')(await db.from('tasks').insert([
    m({ title: 'Set up the shared budget spreadsheet', source_id: pick['A money plan we actually follow'], scheduled_for: thisMonthDay(24) }),
    m({ title: 'Book intro call with estate attorney', source_id: pick['Will drafted and signed'], scheduled_for: thisMonthDay(26) }),
    m({ title: 'Test-ride bikes at two shops, set budget', source_id: pick['Bikes bought, family riding weekly'], scheduled_for: thisMonthDay(27) }),
    m({ title: 'First full-family Saturday ride', source_id: pick['Bikes bought, family riding weekly'], scheduled_for: nextMonthDay(8) }),
    m({ title: 'Order the new dishwasher', project_id: project['Kitchen renovation'], scheduled_for: nextMonthDay(4) }),
    m({ title: 'Book the lake cabin', project_id: project['Cabin weekend — Labor Day'], scheduled_for: nextMonthDay(12) }),
  ]))

  // ── 8. TODAY + TOMORROW (timed, rich context) ──────────────────────────
  console.log('· today: timed tasks with context attached')
  const t = (row) => ({ user_id: DEMO_USER, completed: false, is_fun: false, is_all_day: false, bucket: 'timed', assigned_to: member.Alex, ...row })
  die('today tasks')(await db.from('tasks').insert([
    t({
      title: 'Finalize launch-week email copy', context: 'work', scope: 'individual',
      scheduled_for: at(0, 9, 30), estimated_duration: 45, project_id: project['Website relaunch'],
      notes: 'Subject line B won the test (38% open). Lock body copy, hand to design by EOD.',
    }),
    t({
      title: 'Call Dr. Patel — Mia\'s camp forms', context: 'family', scope: 'compound',
      scheduled_for: at(0, 11, 0), estimated_duration: 15,
      contact_id: contact['Dr. Patel'], phone_number: '(555) 014-2200',
      notes: 'Need: signed health form + epi-pen renewal. Office closes 4:30.',
    }),
    t({
      title: '30-minute ride — river loop', context: 'personal', scope: 'individual',
      scheduled_for: at(0, 12, 30), estimated_duration: 30, is_fun: true,
      goal_id: goal['A fitness habit that survives busy weeks'],
    }),
    t({
      title: 'Pick the kitchen paint: Quiet Moments vs. Salt Air', context: 'family', scope: 'compound',
      scheduled_for: at(0, 16, 30), estimated_duration: 20,
      project_id: project['Kitchen renovation'],
      notes: 'Swatches are taped by the window. Check them in afternoon light.',
      links: [
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/1572/quiet-moments', title: 'Quiet Moments 1563' },
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/1616/stonington-gray', title: 'Salt Air 1616' },
      ],
    }),
    t({
      title: 'Email Ms. Alvarez about the reading-group form', context: 'family', scope: 'compound',
      scheduled_for: allDay(0), is_all_day: true, contact_id: contact['Ms. Alvarez'], assigned_to: member.Iris,
    }),
    t({ title: 'Drop the library books', context: 'family', scope: 'compound', scheduled_for: allDay(0), is_all_day: true }),
    // tomorrow — so the demo can flip a day ahead without emptiness
    t({
      title: 'Walk the kitchen with Mike — cabinet pulls decision', context: 'family', scope: 'compound',
      scheduled_for: at(1, 8, 30), estimated_duration: 30,
      project_id: project['Kitchen renovation'], contact_id: contact['Mike Rivera'], phone_number: '(555) 014-8890',
    }),
    t({ title: 'Sprint review', context: 'work', scope: 'individual', scheduled_for: at(1, 10, 0), estimated_duration: 60, project_id: project['Website relaunch'] }),
  ]))

  // ── 9. INBOX (raw captures for the live triage beat) ───────────────────
  die('inbox')(await db.from('tasks').insert([
    { user_id: DEMO_USER, title: 'gutters???', bucket: 'inbox', completed: false },
    { user_id: DEMO_USER, title: 'mia swim lessons — tuesdays?', bucket: 'inbox', completed: false },
    { user_id: DEMO_USER, title: 'that pizza place Dan mentioned', bucket: 'inbox', completed: false },
    { user_id: DEMO_USER, title: 'back up the family photos', bucket: 'inbox', completed: false },
  ]))

  // ── 10. ROUTINES ───────────────────────────────────────────────────────
  console.log('· routines: Morning reset collection + kid trash night')
  const morning = die('morning routine')(await db.from('routines').insert({
    user_id: DEMO_USER, name: 'Morning reset', recurrence_pattern: { type: 'daily' },
    time_of_day: '07:00:00', show_on_timeline: true, context: 'family', scope: 'compound',
  }).select('id'))
  die('morning steps')(await db.from('routines').insert([
    { user_id: DEMO_USER, name: 'Unload the dishwasher', parent_routine_id: morning[0].id, step_order: 0, recurrence_pattern: { type: 'daily' }, show_on_timeline: true, context: 'family', scope: 'compound' },
    { user_id: DEMO_USER, name: 'Pack lunches', parent_routine_id: morning[0].id, step_order: 1, recurrence_pattern: { type: 'daily' }, show_on_timeline: true, context: 'family', scope: 'compound' },
    { user_id: DEMO_USER, name: 'Check the calendar together', parent_routine_id: morning[0].id, step_order: 2, recurrence_pattern: { type: 'daily' }, show_on_timeline: true, context: 'family', scope: 'compound' },
  ]))
  die('other routines')(await db.from('routines').insert([
    { user_id: DEMO_USER, name: 'Trash + recycling to the curb', recurrence_pattern: { type: 'weekly', days: ['tue'] }, time_of_day: '19:00:00', show_on_timeline: true, context: 'family', scope: 'compound', assigned_to: member.Liam },
    { user_id: DEMO_USER, name: 'Sunday reset — 20 minutes, whole house', recurrence_pattern: { type: 'weekly', days: ['sun'] }, time_of_day: '17:00:00', show_on_timeline: true, context: 'family', scope: 'compound' },
  ]))

  // ── 11. MEALS (this week's dinners) ────────────────────────────────────
  console.log('· meals: recipes + this week\'s plan')
  const recipes = die('recipes')(await db.from('recipes').insert([
    {
      user_id: DEMO_USER, title: 'Sheet-pan chicken fajitas', prep_minutes: 25, tags: ['weeknight', 'one-pan'],
      ingredients: ['1.5 lb chicken thighs, sliced', '3 bell peppers', '1 red onion', '2 tbsp fajita seasoning', 'Tortillas', 'Lime + cilantro'],
      instructions: ['Heat oven to 425.', 'Toss chicken, peppers, onion with oil + 2 tbsp fajita seasoning on one sheet pan.', 'Roast 20 min, tossing once.', 'Warm tortillas; serve with lime and cilantro.'],
      acceptance_sentence: 'Liam asks for seconds; Mia eats the chicken and tortillas, skips peppers.', kid_acceptance: {},
    },
    {
      user_id: DEMO_USER, title: 'Miso-glazed salmon + rice', prep_minutes: 20, tags: ['weeknight', 'fish'],
      ingredients: ['4 salmon fillets', '2 tbsp white miso', '1 tbsp maple syrup', '1 tbsp soy sauce', '2 cups rice', 'Cucumbers for the kids'],
      instructions: ['Start 2 cups rice.', 'Whisk 2 tbsp miso, 1 tbsp maple, 1 tbsp soy; brush on salmon.', 'Broil salmon 8–10 min until glaze bubbles.', 'Serve over rice with cucumber slices.'],
      acceptance_sentence: 'Both kids eat it if the glaze is on thick.', kid_acceptance: {},
    },
    {
      user_id: DEMO_USER, title: 'Friday pizza night', prep_minutes: 15, tags: ['friday', 'tradition'],
      ingredients: ['2 balls pizza dough', '1 cup sauce', '2 cups mozzarella', 'Toppings bar: pepperoni, olives, peppers, pineapple (Mia insists)'],
      instructions: ['Heat oven to 500 with the steel in.', 'Everyone builds their own half.', 'Bake 7–8 min each.'],
      acceptance_sentence: 'The one dinner nobody negotiates.', kid_acceptance: {},
    },
  ]).select('id,title'))
  const recipe = Object.fromEntries(recipes.map(r => [r.title, r.id]))
  const weekStart = sundayOfThisWeek()
  const plan = die('meal plan')(await db.from('meal_plans').insert({
    user_id: DEMO_USER, week_start: weekStart, starts_on: weekStart,
  }).select('id'))
  die('meal entries')(await db.from('meal_plan_entries').insert([
    { meal_plan_id: plan[0].id, day_of_week: 1, slot: 'dinner', recipe_id: recipe['Sheet-pan chicken fajitas'] },
    { meal_plan_id: plan[0].id, day_of_week: 2, slot: 'dinner', ad_hoc_title: 'Leftovers night' },
    { meal_plan_id: plan[0].id, day_of_week: 3, slot: 'dinner', recipe_id: recipe['Miso-glazed salmon + rice'] },
    { meal_plan_id: plan[0].id, day_of_week: 4, slot: 'dinner', ad_hoc_title: 'Breakfast for dinner' },
    { meal_plan_id: plan[0].id, day_of_week: 5, slot: 'dinner', recipe_id: recipe['Friday pizza night'] },
  ]))

  // ── 12. LISTS ──────────────────────────────────────────────────────────
  const lists = die('lists')(await db.from('lists').insert([
    { user_id: DEMO_USER, title: 'Groceries', category: 'shopping', visibility: 'family', sort_order: 0 },
    { user_id: DEMO_USER, title: 'Cabin packing list', category: 'travel', visibility: 'family', sort_order: 1, project_id: project['Cabin weekend — Labor Day'] },
  ]).select('id,title'))
  const list = Object.fromEntries(lists.map(l => [l.title, l.id]))
  die('list items')(await db.from('list_items').insert([
    ...['Chicken thighs', 'Bell peppers', 'Tortillas', 'White miso', 'Salmon', 'Pizza dough', 'Mozzarella', 'Pineapple (Mia)'].map((text, i) =>
      ({ user_id: DEMO_USER, list_id: list['Groceries'], text, sort_order: i, is_checked: false })),
    ...[['Sleeping bags', false], ['Headlamps', true], ['S\'mores kit', false], ['Rain jackets', false], ['Card games', true]].map(([text, done], i) =>
      ({ user_id: DEMO_USER, list_id: list['Cabin packing list'], text, sort_order: i, is_checked: done })),
  ]))

  // ── 13. PROFILE SAFETY ─────────────────────────────────────────────────
  await db.from('user_profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('user_id', DEMO_USER)

  console.log('\n✓ Demo world seeded. Pre-flight the browser per docs/demo/demo-script.md')
}

main().catch(e => { console.error(e); process.exit(1) })
