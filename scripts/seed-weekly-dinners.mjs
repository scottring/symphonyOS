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
//          eaten (or `dates: [...]` to repeat one recipe across several days).
//          `slot` must be 'breakfast', 'lunch', or 'dinner' (the DB check
//          constraint rejects anything else). Put quantities INLINE in `steps`.
//          `forMember` (optional) scopes the entry to one person — omit for a
//          shared whole-family meal.
//
// Week of Sun 2026-07-26 → Sat 2026-08-01: peak summer, protein + 800g
// challenge, one grain for everyone each night, hard-boiled eggs as the
// standing kid backup. No Friday dinner planned.
// ═══════════════════════════════════════════════════════════════════════════
const WEEK = [
  {
    date: '2026-07-26', slot: 'dinner',
    title: 'Grilled Pizza Night',
    prepMinutes: 60, tags: ['dinner', 'grill', 'summer', 'crowd'],
    notes: 'Make the dough THIS MORNING for a long cold rise. Peak Maryland peaches — the peach pizza is at its best right now.',
    ingredients: [
      '3 cups whole wheat or all-purpose flour', '1 tsp active dry yeast', '1 1/4 cups warm water',
      '2 tbsp olive oil', '1 1/2 tsp salt', '1 tsp honey, plus more for drizzling',
      '1 cup tomato sauce', '1 lb fresh mozzarella, torn', '1 cup ricotta (optional white pizza)',
      '2 ears sweet corn, kernels stripped', '1 pint cherry tomatoes, halved',
      '2 ripe peaches, sliced', '4 oz prosciutto, sliced', '1 cup fresh basil leaves',
    ],
    steps: [
      'THIS MORNING, MAKE THE DOUGH: dissolve 1 tsp active dry yeast and 1 tsp honey in 1 1/4 cups warm water and let sit 5 minutes until foamy. Mix in 3 cups flour, 1 1/2 tsp salt, and 2 tbsp olive oil, then knead 8-10 minutes until smooth. Put it in an oiled bowl, cover, and refrigerate all day — the long cold rise gives dramatically better flavor and texture than a quick rise.',
      'Pull the dough out of the fridge 1-2 hours before grilling and divide it in half. Heat the grill to medium-high, 400-450°F. Char the kernels from 2 ears of corn in a dry pan 3-4 minutes until spotted with black.',
      'GRILLING METHOD: stretch one dough half and brush the top with olive oil. Lay it oiled-side down on the grill and cook 2-3 minutes until grill marks form. Flip, add the toppings quickly, close the lid, and cook 3-5 minutes until the cheese melts. Watch closely — it goes fast.',
      'PIZZA 1, CHARRED CORN + BURST TOMATO (the crowd-pleaser): tomato sauce base, torn mozzarella, the charred corn, and a handful of halved cherry tomatoes — they burst and sauce themselves. Tear fresh basil over it the moment it comes off the grill.',
      'PIZZA 2, GRILLED PEACH + PROSCIUTTO (the showstopper): no red sauce, just a drizzle of olive oil, then fresh mozzarella and 2 sliced ripe peaches. Add the 4 oz prosciutto AFTER grilling so it stays silky and does not overcook, then fresh basil and a drizzle of honey.',
      'Also offer a white ricotta pizza: spread 1 cup ricotta directly on the dough instead of sauce, add mozzarella, and scatter cherry tomatoes and fresh herbs on after it comes off the grill. Kid version: corn and mozzarella pizza — they will be thrilled.',
    ],
  },
  {
    date: '2026-07-27', slot: 'dinner',
    title: 'The Gold Coast Bowl',
    prepMinutes: 25, tags: ['dinner', 'seafood', 'protein', '800g', 'summer'],
    notes: 'Grain: quinoa. About 30g protein, ~300g toward 800g. Kid backup: hard-boiled egg.',
    ingredients: [
      '1.5 lbs large shrimp, peeled and deveined', '1.5 cups quinoa, rinsed',
      '2 ears sweet corn, kernels stripped', '1 cup cherry tomatoes, halved',
      '2 cucumbers, thinly sliced', '2 shallots, thinly sliced', '2 limes (juice and zest)',
      '3 tbsp olive oil', '1 tbsp neutral oil', '2 tbsp fresh cilantro, chopped',
      '1 tsp cumin', '1 tsp smoked paprika', 'Pinch cayenne (optional, very mild)',
      '4 hard-boiled eggs (kid backup)',
    ],
    steps: [
      'Cook the quinoa: bring 1.5 cups rinsed quinoa and 3 cups water to a boil, then simmer covered 15 minutes. Fluff with a fork — it makes about 4 cups.',
      'Crispy shallots: fry 2 thinly sliced shallots in 1 tbsp neutral oil over medium-high 5-6 minutes until golden and crisp, then drain on paper towel.',
      'Char the kernels from 2 ears of corn in a dry hot skillet 3-4 minutes until spotted with black. Set aside.',
      'Pat the 1.5 lbs shrimp dry and season with 1 tsp cumin, 1 tsp smoked paprika, a pinch of cayenne, and salt. Heat oil in a skillet over high heat and sear the shrimp 1-2 minutes per side until pink and curled. Do not overcrowd the pan.',
      'Dressing: whisk the juice and zest of 2 limes with 3 tbsp olive oil, 2 tbsp chopped cilantro, salt, and pepper.',
      'Build the bowls: a quinoa base for everyone, then corn, tomatoes, cucumber, shrimp, crispy shallots, and the dressing drizzled over. Kid version: the same quinoa, corn, and shrimp with the dressing on the side or skipped entirely — very familiar components. Hard-boiled egg alongside for any skeptics.',
    ],
  },
  {
    date: '2026-07-28', slot: 'dinner',
    title: 'The Golden Hour Farro Bowl',
    prepMinutes: 30, tags: ['dinner', 'vegetarian', '800g', 'summer'],
    notes: 'New grain: farro. About 23g protein, ~280g toward 800g. The ONLY feta night this week — use the whole block.',
    ingredients: [
      '1.5 cups farro, rinsed', '1 can (15 oz) chickpeas, drained and patted very dry',
      '2 cups cherry tomatoes', '4 oz good feta', '3 tbsp olive oil, divided',
      '1 tbsp good honey', '1/2 cup fresh basil, torn', '1 lemon, juiced',
      '4 hard-boiled eggs (kid backup)',
    ],
    steps: [
      'Simmer 1.5 cups rinsed farro in salted water 25-30 minutes until tender but still chewy, then drain. Farro is an ancient Italian grain with a gorgeous nutty chew — completely different from rice or pasta.',
      'Crispy chickpeas: pat 1 can of chickpeas completely dry. Heat 1 tbsp olive oil in a skillet over medium-high, add the chickpeas, and cook 10-12 minutes, shaking the pan often, until golden and crispy. Season with salt.',
      'Burst tomatoes: in the same skillet add another 1 tbsp olive oil and 2 cups cherry tomatoes. Cook over medium heat 5-7 minutes without stirring too much, until they burst and release their juices. Season generously.',
      'Whipped feta: blend all 4 oz feta with the remaining 1 tbsp olive oil and a squeeze of lemon in a food processor until completely silky smooth — a splash of water helps loosen it. Spread it into a bowl, make a well in the center, and drizzle with olive oil.',
      'Build the bowls: farro base, then the burst tomatoes and all their juices, the crispy chickpeas, a generous spoonful of whipped feta, basil torn over the top, and a drizzle of 1 tbsp honey.',
      'Kid version: plain farro with chickpeas and tomatoes on the side, skipping the whipped feta — the honey drizzle on their bowl often gets them in. Hard-boiled egg alongside.',
    ],
  },
  {
    date: '2026-07-29', slot: 'dinner',
    title: 'Peak Summer Sheet Pan Salmon',
    prepMinutes: 35, tags: ['dinner', 'seafood', 'protein', 'sheet-pan', '800g'],
    notes: 'Highest protein night, about 34g, ~320g toward 800g. Make extra — cold flaked salmon over arugula is Iris’s 2-minute dinner after track.',
    ingredients: [
      '4 salmon fillets (6 oz each)', '1 lb green beans, trimmed',
      '2 ears corn, kernels stripped (or left on the cob for the kids)',
      '1.5 lbs new potatoes, halved', '3 garlic cloves, minced', '2 lemons',
      '3 tbsp olive oil', 'Fresh dill or parsley', 'Arugula and fresh mozzarella (for Iris after track)',
      '4 hard-boiled eggs (kid backup)',
    ],
    steps: [
      'Heat the oven to 425°F. Toss 1.5 lbs halved new potatoes with 1 tbsp olive oil, salt, and pepper, then roast 15 minutes.',
      'Add 1 lb trimmed green beans and the kernels from 2 ears of corn to the pan, toss with oil, and roast 5 more minutes. Leave the corn on the cob instead if the kids prefer it that way.',
      'Pat the 4 salmon fillets dry and rub with the remaining 2 tbsp olive oil, 3 minced garlic cloves, salt, and pepper. Nestle them onto the pan and top with slices from 1 lemon.',
      'Roast 12-15 minutes until the salmon flakes easily. Pull it slightly underdone — carryover heat finishes it.',
      'Squeeze the second lemon over everything and scatter fresh dill or parsley on top. Kid version: plain salmon, new potatoes, and corn on the cob, all naturally separated on the pan.',
      'FOR IRIS AFTER TRACK: flake cold leftover salmon over arugula, squeeze lemon over it, and drizzle with olive oil. Two minutes and it tastes like a restaurant. Bring fresh mozzarella alongside.',
    ],
  },
  {
    date: '2026-07-30', slot: 'dinner',
    title: 'Tokyo Summer Tofu Bowl',
    prepMinutes: 30, tags: ['dinner', 'vegetarian', 'protein', '800g', 'summer'],
    notes: 'Grain: couscous (5 minutes). About 26g protein, ~300g toward 800g. CHECK MISO STOCK BEFORE SHOPPING — it is the key ingredient for the glaze.',
    ingredients: [
      '14 oz firm tofu, pressed 20+ minutes and cubed', '1.5 cups couscous',
      '1.5 cups vegetable stock', '1 cup shelled edamame (frozen, thawed)',
      '2 ears corn, kernels stripped', '2 cucumbers, thinly sliced',
      '8 oz fresh mozzarella, torn', '2 tbsp white or yellow miso paste',
      '2 tbsp soy sauce', '3 tbsp sesame oil', '2 tbsp honey',
      '3 tbsp rice vinegar', '1 tsp fresh ginger, grated', '2 tbsp neutral oil',
      '4 hard-boiled eggs (kid backup)',
    ],
    steps: [
      'Couscous: pour 1.5 cups boiling vegetable stock over 1.5 cups couscous in a bowl, cover 5 minutes, and fluff with a fork. Char the kernels from 2 ears of corn in a dry hot skillet 3-4 minutes and set aside.',
      'MISO-SESAME GLAZE: whisk 2 tbsp miso paste, 1 tbsp soy sauce, 1 tbsp sesame oil, 1 tbsp honey, 1 tsp rice vinegar, and a splash of water to loosen.',
      'SESAME-GINGER DRESSING: whisk 2 tbsp sesame oil, 2 tbsp rice vinegar, 1 tsp grated fresh ginger, 1 tsp honey, 1 tbsp soy sauce, and salt to taste.',
      'Crispy tofu: press the 14 oz tofu completely dry. Heat 2 tbsp neutral oil in a wok over high heat and cook the tofu in a single layer without moving it 3-4 minutes until golden, then flip and cook 3 more minutes. Remove from the pan.',
      'Reduce the heat and add the miso-sesame glaze to the pan — it will bubble immediately. Return the tofu and toss 1-2 minutes to coat.',
      'Build the bowls: couscous, then 1 cup edamame, the charred corn, 2 sliced cucumbers, the glazed tofu, 8 oz torn mozzarella, and the sesame-ginger dressing drizzled over. Kid version: plain couscous with tofu, corn, and edamame, no dressing needed, torn mozzarella on the side — always popular.',
    ],
  },
  {
    date: '2026-08-01', slot: 'dinner',
    title: 'Summer Saturday Feast: Corn Chowder + Caprese Chickpea Salad',
    prepMinutes: 45, tags: ['dinner', 'vegetarian', 'crowd', '800g', 'summer'],
    notes: 'Grain: potatoes. About 20g+ protein and ~380g toward 800g — the highest 800g night of the week. Celebratory; crusty bread for the table.',
    ingredients: [
      '4 ears sweet corn (save the cobs for the stock)', '1.5 lbs new potatoes, diced',
      '1 onion, diced', '3 garlic cloves, minced', '3 cups vegetable stock',
      '1 cup milk or cream', '2 tbsp butter', '2 tbsp fresh chives or parsley',
      '2 cans (15 oz) chickpeas, drained', '2 lbs peak summer tomatoes, roughly chopped',
      '1 lb fresh mozzarella, torn', '1/2 cup fresh basil, torn', '3 tbsp good olive oil',
      '1 tbsp balsamic (optional)', '2 loaves crusty bread',
    ],
    steps: [
      'CORN CHOWDER: melt 2 tbsp butter in a large pot over medium heat. Add 1 diced onion and cook 5 minutes, then 3 minced garlic cloves for 1 minute more.',
      'Add the kernels from 4 ears of corn (reserve 1/2 cup for texture), 1.5 lbs diced new potatoes, 3 cups vegetable stock, and the stripped corn cobs — the cobs deepen the flavor. Simmer 20 minutes until the potatoes are tender.',
      'Remove the corn cobs. Blend about half the soup smooth with an immersion blender, then stir in the reserved 1/2 cup corn kernels and 1 cup milk or cream. Simmer 5 minutes, season generously, and scatter 2 tbsp chives or parsley over the top.',
      'CAPRESE CHICKPEA SALAD: combine 2 cans drained chickpeas, 2 lbs roughly chopped summer tomatoes, and 1 lb torn fresh mozzarella. Season generously.',
      'Add 3 tbsp olive oil and 1 tbsp balsamic if using, then scatter 1/2 cup torn basil over the top. Let it sit 10-15 minutes before serving so the tomatoes release their juices.',
      'Serve the chowder and the salad together with crusty bread for the table. Kid version: corn chowder is universally beloved by children and the potatoes are a proven hit — offer just the mozzarella and bread if they resist the chickpeas. To boost protein, add chicken on the side or stir a can of white beans into the chowder.',
    ],
  },
  {
    // Iris's work lunches — made Sunday alongside the pizza prep, packed Mon-Fri.
    dates: ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31'],
    slot: 'lunch', forMember: 'Iris',
    title: 'Classic Tabbouleh (Iris’s Lunches)',
    prepMinutes: 25, tags: ['lunch', 'make-ahead', 'vegetarian', 'summer'],
    notes: 'Made Sunday, keeps beautifully all week. Pack with 1-2 pieces of pre-cooked chicken and a hard-boiled egg for about 35g protein.',
    ingredients: [
      '1 cup fine bulgur', '2 cups fresh parsley, very finely chopped',
      '2 peak summer tomatoes, very finely diced', '2 cucumbers, very finely diced',
      '3 lemons, juiced', '4 tbsp good olive oil', 'Salt',
      'Pre-cooked chicken (to pack each day)', 'Hard-boiled eggs (to pack each day)',
    ],
    steps: [
      'MAKE THIS SUNDAY alongside the pizza prep — it keeps beautifully all week and actually tastes better on day 2 and day 3.',
      'Pour 1 cup boiling water over 1 cup fine bulgur, cover 15-20 minutes until tender, then fluff and let it cool completely.',
      'Combine the cooled bulgur with 2 cups very finely chopped parsley, 2 very finely diced tomatoes, and 2 very finely diced cucumbers.',
      'Dress with the juice of 3 lemons, 4 tbsp olive oil, and salt, then toss well and refrigerate. The parsley should be the majority of the salad, not the bulgur — more herb than grain is what makes it a proper tabbouleh.',
      'TO PACK EACH DAY: a large scoop of tabbouleh, 1-2 pieces of pre-cooked chicken, and 1 hard-boiled egg. About 35g protein — a very complete lunch.',
    ],
  },
]

// family_members on the household account (bace953e), for `forMember` above.
const MEMBER_IDS = {
  Scott: '4fd6259b-2246-4304-96c3-d93a12fd43ae',
  Iris: '698227a4-1a01-43f0-b218-5c1307cf33ce',
  Ella: 'cad5a788-e424-4b50-b7e8-fb35c4f11972',
  Kaleb: 'aa264b2e-c4ee-44a8-be07-9c0cbdaa7277',
}

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

async function upsertEntry(planId, dayOfWeek, slot, recipeId, forMemberId, notes) {
  // Idempotent, and SCOPE-AWARE: a shared meal only replaces the shared entry
  // (for_member_id IS NULL) and a per-person meal only replaces that person's
  // — so seeding a lunch for Iris never wipes the family's meal in the same cell.
  const clear = db.from('meal_plan_entries').delete()
    .eq('meal_plan_id', planId).eq('day_of_week', dayOfWeek).eq('slot', slot)
  await (forMemberId ? clear.eq('for_member_id', forMemberId) : clear.is('for_member_id', null))
  const { error } = await db.from('meal_plan_entries').insert({
    meal_plan_id: planId, day_of_week: dayOfWeek, slot, recipe_id: recipeId,
    for_member_id: forMemberId ?? null, notes: notes ?? null,
  })
  if (error) throw error
}

// ── run ─────────────────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
console.log(`Seeding ${WEEK.length} recipes for ${USER_ID}\n`)
for (const meal of WEEK) {
  const forMemberId = meal.forMember ? MEMBER_IDS[meal.forMember] : null
  if (meal.forMember && !forMemberId) throw new Error(`Unknown forMember: ${meal.forMember}`)
  const recipeId = await upsertRecipe(meal)
  const who = meal.forMember ? ` for ${meal.forMember}` : ''
  console.log(`  ${meal.title}${who}  → recipe=${recipeId}`)
  for (const date of meal.dates ?? [meal.date]) {
    const d = dateOf(date)
    const dow = d.getDay()
    const weekStart = iso(sundayOfWeek(d))
    const planId = await getOrCreatePlan(weekStart)
    await upsertEntry(planId, dow, meal.slot, recipeId, forMemberId, meal.notes)
    console.log(`     ${DAYS[dow]} ${date}  [${meal.slot}]  plan week_start=${weekStart} day_of_week=${dow}`)
  }
}
console.log('\nDone. The wall picks these up automatically (useMealEventsForDate force:true).')
