#!/usr/bin/env node
/**
 * seed-demo.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Rebuild the DEMO account (symphonygoals@gmail.com) into a coherent,
 * camera-ready world for live demos. Companion doc: docs/demo/demo-script.md
 *
 * WHAT IT DOES: wipes every row belonging to the demo user (tasks, projects,
 * goals, routines, lists, meals, contacts, extra family members) and reseeds
 * the "Alex" household — partner Edith, kids Liam & Mia — with:
 *   • Today: timed tasks across Work/Personal/Family, rich context attached
 *     (notes, links, phone numbers, project + contact chips)
 *   • Inbox: four raw captures for the live triage beat
 *   • Year: 4 goals in 4 areas  →  Season: 3 picks + 1 won + 5 bench items
 *     (bench is deliberately mixed-quality so the AI audit has real work)
 *   • Month: moves threaded to picks so the season pulse dots light up
 *   • Routines: "Morning reset" collection + kid-assigned trash night
 *   • Meals: this week's dinner plan + 3 recipes
 *   • Lists: family groceries + a trip packing list
 *   • Kitchen wall (film-ready): per-kid Morning / Home-from-school / Bedtime
 *     collections (daily, so every day has the out-the-door, home and bedtime
 *     screens), a few steps pre-ticked, needed-today items, homework, school
 *     papers + notices (what school mail produces), kid/partner timed family
 *     tasks, a dinner every night with a cue line, and scratchpad stickies.
 *     Wall rehearsal steps: docs/demo/film-the-wall.md
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
  die('wipe routine ticks')(await db.from('actionable_instances').delete().eq('user_id', DEMO_USER))
  die('wipe notices')(await db.from('notices').delete().eq('user_id', DEMO_USER))
  die('wipe scratchpad')(await db.from('scratchpad_notes').delete().eq('user_id', DEMO_USER))
  die('wipe math')(await db.from('kid_math_problems').delete().eq('user_id', DEMO_USER))
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
  console.log('· family: Alex, Edith, Liam, Mia')
  const selfRows = die('read self member')(await db.from('family_members')
    .select('id').eq('user_id', DEMO_USER).eq('is_full_user', true).limit(1))
  if (!selfRows.length) { console.error('✗ no self family_members row for demo user'); process.exit(1) }
  const alexId = selfRows[0].id
  die('rename self → Alex')(await db.from('family_members')
    .update({ name: 'Alex', initials: 'A', color: 'blue', display_order: 0, role_label: 'parent' }).eq('id', alexId))
  // role_label matters: the wall treats anyone not 'parent' (and not a full
  // user) as a kid — without it Edith gets an empty kid column.
  const fam = die('insert family')(await db.from('family_members').insert([
    { user_id: DEMO_USER, name: 'Edith', initials: 'E', color: 'purple', is_full_user: false, display_order: 1, member_type: 'core', role_label: 'parent' },
    { user_id: DEMO_USER, name: 'Liam', initials: 'L', color: 'green', is_full_user: false, display_order: 2, member_type: 'core', role_label: 'child' },
    { user_id: DEMO_USER, name: 'Mia', initials: 'M', color: 'orange', is_full_user: false, display_order: 3, member_type: 'core', role_label: 'child' },
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
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/1563/quiet-moments', title: 'Paint option A — Quiet Moments' },
        { url: 'https://www.homedepot.com/b/Appliances-Dishwashers/N-5yc1vZc3po', title: 'Dishwasher shortlist' },
      ],
    },
    { user_id: DEMO_USER, name: 'Website relaunch', status: 'in_progress', context: 'work', scope: 'individual', notes: 'Launch window: first week of next month. Copy freeze this Friday.' },
    { user_id: DEMO_USER, name: 'Cabin weekend', status: 'in_progress', type: 'trip', context: 'family', scope: 'compound', notes: 'Lake cabin, 3 nights. Dogs allowed. Check-in after 3pm.' },
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
    m({ title: 'Book the lake cabin', project_id: project['Cabin weekend'], scheduled_for: nextMonthDay(12) }),
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
      title: 'Pick the kitchen paint: Quiet Moments vs. Stonington Gray', context: 'family', scope: 'compound',
      scheduled_for: at(0, 16, 30), estimated_duration: 20,
      project_id: project['Kitchen renovation'],
      notes: 'Swatches are taped by the window. Check them in afternoon light.',
      links: [
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/1563/quiet-moments', title: 'Quiet Moments 1563' },
        { url: 'https://www.benjaminmoore.com/en-us/paint-colors/color/hc-170/stonington-gray', title: 'Stonington Gray HC-170' },
      ],
    }),
    t({
      title: 'Email Ms. Alvarez about the reading-group form', context: 'family', scope: 'compound',
      scheduled_for: allDay(0), is_all_day: true, contact_id: contact['Ms. Alvarez'], assigned_to: member.Edith,
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
  const plan = die('meal plan')(await db.from('meal_plans').upsert(
    { user_id: DEMO_USER, week_start: weekStart, starts_on: weekStart },
    { onConflict: 'user_id,week_start' },
  ).select('id'))
  // Every night has a dinner (the wall shows "No dinner planned" otherwise),
  // and TONIGHT is always a real recipe so "Start cooking" works on camera.
  // notes → the dinner card's cue line (first sentence).
  const dinners = {
    0: { recipe_id: recipe['Miso-glazed salmon + rice'], notes: 'Start the rice by 6. Mia does the cucumbers.' },
    1: { recipe_id: recipe['Sheet-pan chicken fajitas'], notes: 'Liam sets the table; Mia picks the music.' },
    2: { ad_hoc_title: 'Leftovers night', notes: 'Everything in the fridge comes out at 6:15.' },
    3: { recipe_id: recipe['Miso-glazed salmon + rice'], notes: 'Start the rice by 6. Mia does the cucumbers.' },
    4: { ad_hoc_title: 'Breakfast for dinner', notes: 'Pancakes — Liam flips.' },
    5: { recipe_id: recipe['Friday pizza night'], notes: 'Oven on at 5:30 so the steel is hot.' },
    6: { ad_hoc_title: 'Grill night', notes: 'Burgers and corn if it is dry out.' },
  }
  const dow = today.getDay()
  if (!dinners[dow].recipe_id) dinners[dow] = { recipe_id: recipe['Sheet-pan chicken fajitas'], notes: 'Liam sets the table; Mia picks the music.' }
  die('meal entries')(await db.from('meal_plan_entries').insert(
    Object.entries(dinners).map(([d, e]) => ({ meal_plan_id: plan[0].id, day_of_week: Number(d), slot: 'dinner', ...e })),
  ))

  // ── 12. LISTS ──────────────────────────────────────────────────────────
  const lists = die('lists')(await db.from('lists').insert([
    { user_id: DEMO_USER, title: 'Groceries', category: 'shopping', visibility: 'family', sort_order: 0 },
    { user_id: DEMO_USER, title: 'Cabin packing list', category: 'travel', visibility: 'family', sort_order: 1 },
  ]).select('id,title'))
  const list = Object.fromEntries(lists.map(l => [l.title, l.id]))
  die('list items')(await db.from('list_items').insert([
    ...['Chicken thighs', 'Bell peppers', 'Tortillas', 'White miso', 'Salmon', 'Pizza dough', 'Mozzarella', 'Pineapple (Mia)'].map((text, i) =>
      ({ user_id: DEMO_USER, list_id: list['Groceries'], text, sort_order: i, completed: false })),
    ...[['Sleeping bags', false], ['Headlamps', true], ['S\'mores kit', false], ['Rain jackets', false], ['Card games', true]].map(([text, done], i) =>
      ({ user_id: DEMO_USER, list_id: list['Cabin packing list'], text, sort_order: i, completed: done, completed_at: done ? new Date().toISOString() : null })),
  ]))

  // ── 13. KITCHEN WALL (film-ready) ──────────────────────────────────────
  // The wall's screens hang off each kid's routine COLLECTIONS: one starting
  // before 11:00 = the out-the-door screen, 15:00–17:59 = home from school,
  // 19:00+ = bedtime. One collection per kid (not one shared) so ticks are
  // per kid. Daily on purpose: a film day can fall on any weekday.
  console.log('· kitchen wall: kid collections, school items, stickies')
  const ymd = (off = 0) => {
    const d = new Date(today); d.setDate(d.getDate() + off)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const fam1 = { user_id: DEMO_USER, recurrence_pattern: { type: 'daily' }, context: 'family', scope: 'compound', show_on_timeline: false }
  const stepIds = {} // `${kid}:${step}` → routine id, for pre-ticks
  async function collection(kid, name, start, steps) {
    const parent = die(`${kid} ${name}`)(await db.from('routines').insert({
      ...fam1, name, time_of_day: `${start}:00`, assigned_to: member[kid],
    }).select('id'))
    const rows = die(`${kid} ${name} steps`)(await db.from('routines').insert(steps.map(([title, time, who], i) => ({
      ...fam1, name: title, parent_routine_id: parent[0].id, step_order: i, time_of_day: `${time}:00`,
      ...(who ? { assigned_to: member[who] } : {}),
    }))).select('id,name'))
    for (const r of rows) stepIds[`${kid}:${r.name}`] = r.id
  }
  for (const kid of ['Liam', 'Mia']) {
    await collection(kid, 'Morning', '07:00', [
      ['Get dressed', '07:00'],
      ['Make your bed', '07:05'],
      ['Breakfast', '07:15'],
      // a grown-up step inside the kids' collection → the "grown-ups" line
      ...(kid === 'Mia' ? [['Pack lunches', '07:20', 'Alex']] : []),
      ['Brush teeth', '07:30'],
      ['Backpack packed', '07:35'],
      ['Shoes and jacket on', '07:45'],
    ])
    await collection(kid, 'Home from school', '15:30', [
      ['Unpack your folder', '15:30'],
      ['Snack', '15:40'],
      ['Homework', '15:50'],
      ['Reading — 20 minutes', '16:20'],
    ])
    await collection(kid, 'Bedtime', '19:30', [
      ['Bath or shower', '19:30'],
      ['Pajamas on', '19:45'],
      ['Brush teeth', '19:55'],
      ['Read together', '20:05'],
      ['Lights out', '20:15'],
    ])
  }
  // A few morning steps already done, so the board shows progress on camera.
  die('pre-ticks')(await db.from('actionable_instances').insert(
    ['Liam:Get dressed', 'Liam:Make your bed', 'Mia:Get dressed'].map((k) => ({
      user_id: DEMO_USER, entity_type: 'routine', entity_id: stepIds[k], date: ymd(0),
      status: 'completed', completed_at: new Date().toISOString(),
    })),
  ))

  // What school mail would have produced: homework, papers, notices, and
  // things needed today. Same shape the school-digest function writes.
  const schoolRow = (row) => ({
    user_id: DEMO_USER, completed: false, bucket: 'timed', context: 'family', scope: 'compound',
    is_all_day: true, scheduled_for: allDay(Number(row._off)), needed_on: ymd(Number(row._off)),
    ...Object.fromEntries(Object.entries(row).filter(([k]) => k !== '_off')),
  })
  die('school items')(await db.from('tasks').insert([
    schoolRow({ _off: 0, title: 'Library book back', category: 'task', assigned_to: member.Liam }),
    schoolRow({ _off: 0, title: 'Show-and-tell: something from fall', category: 'task', assigned_to: member.Mia }),
    schoolRow({ _off: 1, title: 'Math worksheet — page 42', category: 'homework', assigned_to: member.Liam, notes: 'From Ms. Alvarez\'s Monday email.' }),
    schoolRow({ _off: 1, title: 'Spelling words — list 6', category: 'homework', assigned_to: member.Mia }),
    schoolRow({ _off: 2, title: 'Field trip permission slip — aquarium', category: 'paper', assigned_to: member.Mia, held_by: null }),
    schoolRow({ _off: 2, title: 'Picture day order form', category: 'paper', assigned_to: member.Liam, held_by: member.Edith }),
  ]))
  die('notices')(await db.from('notices').insert([
    { user_id: DEMO_USER, family_member_id: null, text: 'Early dismissal Friday at 12:30.', sender_label: 'Lakeside Elementary', received_on: ymd(-1) },
    { user_id: DEMO_USER, family_member_id: member.Liam, text: 'Picture day is next Tuesday — wear the blue shirt.', sender_label: 'Ms. Alvarez', received_on: ymd(-2) },
    { user_id: DEMO_USER, family_member_id: member.Mia, text: 'Bring a water bottle every day this week (field days).', sender_label: 'Lakeside Elementary', received_on: ymd(0) },
  ]))

  // Family timed rows for the people on the wall (only context 'family'
  // reaches the wall; Work/Personal stay private, as they should).
  const f = (row) => ({ user_id: DEMO_USER, completed: false, is_fun: false, is_all_day: false, bucket: 'timed', context: 'family', scope: 'compound', ...row })
  die('family day')(await db.from('tasks').insert([
    f({ title: 'Piano lesson', scheduled_for: at(0, 16, 30), estimated_duration: 45, assigned_to: member.Liam }),
    f({ title: 'Soccer practice', scheduled_for: at(0, 17, 0), estimated_duration: 60, assigned_to_all: [member.Mia, member.Edith] }),
    f({ title: 'Pick up Mia from soccer', scheduled_for: at(0, 18, 0), estimated_duration: 15, assigned_to: member.Alex }),
    f({ title: 'Swim lesson', scheduled_for: at(1, 16, 0), estimated_duration: 45, assigned_to: member.Mia }),
    f({ title: 'Book club', scheduled_for: at(1, 19, 30), estimated_duration: 90, assigned_to: member.Edith }),
  ]))

  // Scratchpad stickies for the quiet screen.
  die('scratchpad')(await db.from('scratchpad_notes').insert([
    { user_id: DEMO_USER, body: 'Thanksgiving — Grandma\'s or ours?', kind: 'talk', author_member_id: member.Edith },
    { user_id: DEMO_USER, body: 'Out of AA batteries', kind: 'note', author_member_id: member.Alex },
    { user_id: DEMO_USER, body: 'Can I try swim team?', kind: 'talk', author_member_id: member.Mia },
  ]))

  // ── 14. PROFILE SAFETY ─────────────────────────────────────────────────
  await db.from('user_profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('user_id', DEMO_USER)

  console.log('\n✓ Demo world seeded. Pre-flight the browser per docs/demo/demo-script.md')
}

main().catch(e => { console.error(e); process.exit(1) })
