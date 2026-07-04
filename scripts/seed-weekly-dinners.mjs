#!/usr/bin/env node
/**
 * seed-weekly-dinners.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Insert a week of dinner recipes into Symphony so they show up as TAPPABLE
 * events on the kitchen wall kiosk (wall-v2). Tapping a dinner opens the
 * recipe in the big-font WallRecipeViewer using the recipe's stored
 * ingredients + instructions (no web fetch needed).
 *
 * HOW THE WALL SURFACES THESE (so you know why the data is shaped this way):
 *   recipes ──< meal_plan_entries (slot='dinner', recipe_id) >── meal_plans
 *   wall-v2 calls useMealEventsForDate(today, { force:true }) → synthesizes a
 *   "Dinner · <title>" event → tap → WallRecipeViewer(content=recipe).
 *   See: src/shell/providers/MealEventsProvider.tsx, src/components/wall-v2/
 *        WallV2Shell.tsx, src/components/wall/WallRecipeViewer.tsx
 *
 * WEEK MATH (important):
 *   meal_plans are keyed by week_start = the SUNDAY of the week (getDay()==0).
 *   day_of_week is JS getDay(): 0=Sun … 6=Sat.
 *   Each dinner below is given a real calendar DATE; the script resolves that
 *   date's own Sunday-week and get-or-creates the right meal_plan. This means
 *   a Saturday dinner automatically lands in the *previous* Sunday's plan —
 *   no special-casing needed.
 *
 * IDEMPOTENT: safe to re-run. For each (recipe title) it updates in place if a
 *   recipe with that title already exists for the user; for each (plan, day,
 *   slot) it deletes any existing entry before inserting. Re-running with an
 *   edited WEEK just overwrites that week cleanly.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TO REPEAT NEXT WEEK:
 *   1. Edit the WEEK constant below — change `date` for each meal and rewrite
 *      the recipes. Keep amounts INLINE in the `steps` (e.g. "add 3 cups
 *      flour") so the cook reading the wall never has to cross-reference the
 *      ingredient list. Ingredient names inside steps auto-highlight green.
 *   2. Run:  node scripts/seed-weekly-dinners.mjs
 *      (reads SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL from .env)
 *   3. The wall picks it up automatically — tonight's dinner is tappable.
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

// The household account that owns the wall's meal plan (smkaufman@gmail.com).
const USER_ID = 'bace953e-87ea-4a59-b7d7-f476fa0e8c94'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── week helpers (mirror src/lib/weekHelpers.ts) ───────────────────────────
const iso = (d) => {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`
}
const sundayOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x }
const dateOf = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d) }

// ═══════════════════════════════════════════════════════════════════════════
// WEEK  — edit this block each week.  `date` is the calendar date the meal is
//          eaten. `slot` is 'dinner' (tappable on the wall) or 'prep'.
//          Put quantities INLINE in `steps`.
// ═══════════════════════════════════════════════════════════════════════════
const WEEK = [
  {
    date: '2026-07-04', slot: 'prep',
    title: 'Saturday Prep — Make-Aheads for the Week',
    prepMinutes: 60, tags: ['prep', 'make-ahead', 'summer'],
    ingredients: [
      '12 oz dark chocolate chips (bark)', '1/2 cup creamy peanut butter (bark)',
      '1 tsp vanilla extract', '1 tsp flaky sea salt', '1/4 cup roasted peanuts, chopped',
      '3 cups fresh basil (pesto)', '1/2 cup walnuts (pesto)', '2 garlic cloves (pesto)',
      '3/4 cup parmesan, grated (pesto)', '1/2 cup olive oil (pesto)', '1 lemon (pesto)',
      '2 lbs ripe tomatoes (soup)', '2 cans (15 oz) white beans (soup)', '1 large onion (soup)',
      '4 garlic cloves (soup)', '3 cups vegetable stock (soup)', '1 parmesan rind (soup, optional)',
      '2 cups pearled barley', '4 cups water or stock (barley)', '10 eggs (hard-boil)',
      'Cucumber, carrots, bell peppers (cut veg)',
    ],
    steps: [
      'PB BARK: Melt 12 oz dark chocolate in the microwave in 30-second bursts, stirring between each. Spread onto a parchment-lined sheet about 1/4 inch thick. Warm 1/2 cup peanut butter 20 seconds with 1 tsp vanilla, drop spoonfuls over the chocolate, and swirl. Scatter 1/4 cup chopped peanuts and 1 tsp flaky salt. Freeze at least 1 hour, then break into pieces (this is Sunday dessert).',
      'WALNUT PESTO: Toast 1/2 cup walnuts in a dry skillet 3-4 minutes, then cool. Pulse the walnuts, 2 garlic cloves, and 3/4 cup parmesan in a food processor. Add 3 cups basil in handfuls, then drizzle in 1/2 cup olive oil until loose. Add the juice of 1 lemon, salt, and pepper. Jar it, cover the surface with a thin layer of oil, and refrigerate.',
      'TOMATO + WHITE BEAN SOUP: Soften 1 diced onion in 3 tbsp olive oil for 6-7 minutes, then add 4 sliced garlic cloves for 2 minutes. Add 2 lbs chopped tomatoes and cook 5 minutes. Add 2 cans drained white beans, 3 cups stock, 1 tsp sugar, and a parmesan rind. Simmer 20 minutes, remove the rind, blend halfway, and stir in 1/2 cup torn basil. Store for lunches all week.',
      'BIG-BATCH BARLEY: Add 2 cups rinsed pearl barley, 4 cups water or stock, 1 tsp salt, and 1 tbsp olive oil to the pressure cooker. Cook on high pressure 20 minutes, natural release 10 minutes, then fluff. This covers Monday, Tuesday, and Wednesday dinners.',
      'KID EXTRAS: Hard-boil 10 eggs and refrigerate. Cut cucumber, carrots, and bell peppers into containers so the kid extras are grab-and-go every night.',
    ],
  },
  {
    date: '2026-07-04', slot: 'dinner',
    title: 'Peanut Chicken Slaw (No-Cook)',
    prepMinutes: 15, tags: ['dinner', 'no-cook', 'summer', 'protein'],
    ingredients: [
      '3 cups cooked shredded chicken (1 rotisserie chicken)', '14 oz Napa cabbage or slaw blend (about 6 cups)',
      '2 mini cucumbers, thinly sliced', '1/4 cup creamy peanut butter', '2 tbsp less-sodium soy sauce',
      '2 tbsp rice vinegar', '1 inch fresh ginger, chopped', '1 garlic clove, chopped',
      '1/2 cup roasted peanuts, chopped', '3 scallions, sliced', '1 pack nori snacks',
    ],
    steps: [
      'Whisk 1/4 cup peanut butter, 2 tbsp soy sauce, 2 tbsp rice vinegar, 1 inch chopped ginger, and 1 chopped garlic clove until smooth. Add a splash of warm water if it is too thick.',
      'Toss the 14 oz sliced cabbage and 2 sliced cucumbers with two-thirds of the dressing. Let sit 5 minutes so the cabbage softens slightly.',
      'Add 3 cups shredded chicken and the remaining dressing. Toss, taste, and adjust.',
      'Top with 1/2 cup chopped peanuts, 3 sliced scallions, and crumbled nori just before serving. Kid version: plain shredded chicken with noodles or rice on the side, nori snacks to try.',
    ],
  },
  {
    date: '2026-07-05', slot: 'dinner',
    title: 'Walnut Pesto Pasta Bar (Sunday Crowd)',
    prepMinutes: 40, tags: ['dinner', 'vegetarian', 'crowd', 'summer'],
    ingredients: [
      '2 lbs pasta (spaghetti, linguine, or penne)', '2 lbs zucchini, spiralized (for low-carb guests)',
      '1 batch walnut pesto (from Saturday)', '4 plant-based sausages (Field Roast or Beyond)',
      '2 pints cherry tomatoes, halved', '1 lb fresh mozzarella, torn', '4 ears corn, kernels stripped',
      '1 cup fresh basil leaves', '1 cup parmesan, grated', 'Chili flakes, on the side',
      '2 loaves crusty bread', 'PB chocolate bark (from the freezer)',
    ],
    steps: [
      'Cook 2 lbs pasta in heavily salted boiling water until al dente. Reserve 2 cups pasta water, then toss the drained pasta with a drizzle of olive oil.',
      'Char the kernels from 4 ears of corn in a dry skillet over high heat for 3-4 minutes, without stirring, until toasted and slightly blackened.',
      'Sear the 4 plant-based sausages in the same skillet with a little oil, 3-4 minutes per side, then slice into rounds.',
      'Set out the toppings bar: 2 pints halved cherry tomatoes, 1 lb torn mozzarella, the charred corn, 1 cup basil, and 1 cup parmesan. Take the walnut pesto out of the fridge 30 minutes early so it loosens.',
      'Toss the pasta with generous pesto and a splash of pasta water. Serve alongside the 2 lbs spiralized zucchini, the sausage rounds, and all the toppings. Break the PB bark from the freezer for dessert.',
    ],
  },
  {
    date: '2026-07-06', slot: 'dinner',
    title: 'Sesame Tofu Bowl with Pearl Barley',
    prepMinutes: 30, tags: ['dinner', 'vegetarian', 'stovetop', 'protein'],
    ingredients: [
      '14 oz firm tofu, pressed and cubed', '3 tbsp soy sauce', '1 tbsp sesame oil', '1 tbsp rice vinegar',
      '1 tsp honey', '1 tsp cornstarch', '2 garlic cloves, minced', '1 tsp fresh ginger, grated',
      '2 tbsp neutral oil', '3 cups cooked barley (from the batch)', '2 cups cucumber, sliced',
      '2 scallions, sliced', '1 tbsp sesame seeds', '2 tbsp fresh mint or parsley, torn',
    ],
    steps: [
      'Press the 14 oz tofu at least 20 minutes and pat completely dry. Whisk 3 tbsp soy sauce, 1 tbsp sesame oil, 1 tbsp rice vinegar, 1 tsp honey, 1 tsp cornstarch, and 2 tbsp water for the sauce.',
      'Heat 2 tbsp oil in a large skillet over high heat. Add the tofu in a single layer and cook 3-4 minutes without moving until golden, then flip and cook 3 minutes more. Remove.',
      'Lower to medium. Add 2 minced garlic cloves and 1 tsp grated ginger, stir 30 seconds, then pour in the sauce (it bubbles immediately). Return the tofu and toss 1-2 minutes to coat.',
      'Serve over 3 cups reheated barley. Top with 2 cups sliced cucumber, 2 sliced scallions, 1 tbsp sesame seeds, and 2 tbsp torn herbs.',
    ],
  },
  {
    date: '2026-07-07', slot: 'dinner',
    title: 'Chicken Sausage + Summer Veg Skillet over Barley',
    prepMinutes: 25, tags: ['dinner', 'stovetop', 'protein', '800g'],
    ingredients: [
      '4 chicken sausages (clean ingredients)', '1 lb green beans, trimmed', '2 ears corn, kernels stripped',
      '1 cup cherry tomatoes', '3 garlic cloves, sliced', '1 lemon, zested and juiced', '2 tbsp olive oil',
      '2 tbsp fresh parsley or basil, chopped', '3 cups cooked barley (from the batch)',
    ],
    steps: [
      'Heat 2 tbsp olive oil in a large skillet over medium-high. Brown the 4 whole chicken sausages 4-5 minutes, turning, then remove and slice into rounds.',
      'In the same skillet add 3 sliced garlic cloves for 1 minute, then 1 lb green beans (3-4 minutes), the kernels from 2 ears of corn (2 minutes), and 1 cup cherry tomatoes (1-2 minutes) until the tomatoes just start to burst.',
      'Return the sausage, add the zest and juice of 1 lemon, and toss everything together. Season with salt and pepper.',
      'Scatter 2 tbsp chopped herbs over the top and serve over 3 cups reheated barley.',
    ],
  },
  {
    date: '2026-07-08', slot: 'dinner',
    title: 'White Bean + Peak Tomato Skillet over Barley',
    prepMinutes: 15, tags: ['dinner', 'vegetarian', 'no-heat', '800g'],
    ingredients: [
      '2 cans (15 oz) white beans, drained and rinsed', '1.5 lbs peak summer tomatoes, chopped',
      '4 garlic cloves, thinly sliced', '3 tbsp olive oil', '1/2 cup fresh basil, torn',
      '2 tbsp fresh parsley, chopped', '1 lemon, juiced', '1/2 cup parmesan, grated (optional)',
      '3 cups cooked barley (from the batch)',
    ],
    steps: [
      'Heat 3 tbsp olive oil in a large skillet over medium. Add 4 sliced garlic cloves and cook gently 2 minutes until fragrant and just golden — do not let it burn.',
      'Add 1.5 lbs chopped tomatoes and 2 cans drained white beans. Toss gently and cook 4-5 minutes until the tomatoes soften and release their juices. Season generously.',
      'Off the heat, squeeze in the juice of 1 lemon and fold in 1/2 cup basil and 2 tbsp parsley.',
      'Serve over 3 cups reheated barley, scattered with 1/2 cup parmesan if using. Red pepper flakes on the side for the adults.',
    ],
  },
  {
    date: '2026-07-09', slot: 'dinner',
    title: 'Mozzarella on Toast + Israeli Salad (CSA Night)',
    prepMinutes: 20, tags: ['dinner', 'no-cook', 'summer', 'csa'],
    ingredients: [
      '3 cucumbers, very finely diced', '3 tomatoes, very finely diced', '1/4 cup fresh parsley, chopped',
      '2 tbsp fresh mint, chopped', '1 lemon, juiced (salad)', '2 tbsp olive oil (salad)',
      '1 loaf sourdough or ciabatta, thickly sliced', '1 lb fresh mozzarella, sliced',
      '2 large tomatoes, sliced', '3 tbsp olive oil (toast)', '1 cup fresh basil leaves',
      'Flaky salt and black pepper',
    ],
    steps: [
      'ISRAELI SALAD: Combine 3 finely diced cucumbers, 3 finely diced tomatoes, 1/4 cup parsley, and 2 tbsp mint. Dress with the juice of 1 lemon, 2 tbsp olive oil, and a generous pinch of salt. Toss and marinate at least 15 minutes — the uniform 1/4-inch dice is what makes it.',
      'Toast the sliced 1 loaf of sourdough in a dry pan or toaster until lightly golden. Rub with a cut garlic clove while hot if you like.',
      'Layer the 2 sliced tomatoes and 1 lb sliced mozzarella on the toast. Drizzle with 3 tbsp olive oil, scatter 1 cup basil, and finish with flaky salt and cracked black pepper.',
      'Serve the mozzarella toast alongside the Israeli salad.',
    ],
  },
]

// ── upsert helpers ─────────────────────────────────────────────────────────
async function upsertRecipe(meal) {
  const row = {
    user_id: USER_ID, title: meal.title, prep_minutes: meal.prepMinutes ?? null,
    ingredients: meal.ingredients, instructions: meal.steps, tags: meal.tags ?? [],
    is_prep_friendly: meal.slot === 'prep',
  }
  const { data: existing } = await db.from('recipes').select('id')
    .eq('user_id', USER_ID).eq('title', meal.title).limit(1).maybeSingle()
  if (existing) {
    const { error } = await db.from('recipes').update(row).eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await db.from('recipes').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

async function getOrCreatePlan(weekStartIso) {
  const { data: existing } = await db.from('meal_plans').select('id')
    .eq('user_id', USER_ID).eq('week_start', weekStartIso).limit(1).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await db.from('meal_plans')
    .insert({ user_id: USER_ID, week_start: weekStartIso }).select('id').single()
  if (error) throw error
  return data.id
}

async function upsertEntry(planId, dayOfWeek, slot, recipeId) {
  // idempotent: clear this (plan, day, slot) cell first
  await db.from('meal_plan_entries').delete()
    .eq('meal_plan_id', planId).eq('day_of_week', dayOfWeek).eq('slot', slot)
    .is('family_member_id', null)
  const { error } = await db.from('meal_plan_entries').insert({
    meal_plan_id: planId, day_of_week: dayOfWeek, slot, recipe_id: recipeId, family_member_id: null,
  })
  if (error) throw error
}

// ── run ─────────────────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
console.log(`Seeding ${WEEK.length} meals for ${USER_ID}\n`)
for (const meal of WEEK) {
  const d = dateOf(meal.date)
  const dow = d.getDay()
  const weekStart = iso(sundayOfWeek(d))
  const recipeId = await upsertRecipe(meal)
  const planId = await getOrCreatePlan(weekStart)
  await upsertEntry(planId, dow, meal.slot, recipeId)
  console.log(`  ${DAYS[dow]} ${meal.date}  [${meal.slot}]  ${meal.title}`)
  console.log(`     → plan week_start=${weekStart}  day_of_week=${dow}  recipe=${recipeId}`)
}
console.log('\nDone. The wall picks these up automatically (useMealEventsForDate force:true).')
