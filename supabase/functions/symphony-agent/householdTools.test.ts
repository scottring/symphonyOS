import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_IDEMPOTENT_CREATES, HOUSEHOLD_TOOLS, HOUSEHOLD_WRITE_TOOLS,
  activeDayRange, categorizeIngredient, consolidateIngredients, createRecipe, getRecipe, isStaple,
  listLifeAreas, listRecipes, readGroceries, readSchoolDigest, runHouseholdTool, saveLifeArea,
  syncGroceriesForDate, syncSteps, type ConsolidatedIngredient, type HouseholdCtx, type MealGroceryLine,
} from './householdTools'
// The app's originals the edge copies must keep matching.
import { consolidateIngredients as appConsolidate } from '../../../src/lib/consolidateIngredients'
import { categorizeIngredient as appCategorize } from '../../../src/lib/categorizeIngredient'
import { isStaple as appIsStaple } from '../../../src/lib/isStaple'
import { syncSteps as appSyncSteps } from '../../../src/lib/mealGroceries'
import { activeDayRange as appActiveDayRange } from '../../../src/lib/weekHelpers'

// ── An in-memory stand-in for PostgREST, enough for these queries ──
type Row = Record<string, unknown>
function fakeDb(seed: Record<string, Row[]>, opts: { fail?: Record<string, string> } = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }))
  let n = 0
  const writes: { table: string; op: string; values?: unknown }[] = []
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    let values: Row | Row[] | undefined
    let conflict: string[] = []
    let orderCol: string | null = null
    let asc = true
    let lim: number | null = null
    const run = (): { data: Row[] | null; error: { message: string; code?: string } | null } => {
      if (opts.fail?.[table]) return { data: null, error: { message: opts.fail[table] } }
      const rows = (tables[table] ??= [])
      if (op !== 'select') writes.push({ table, op, values })
      if (op === 'insert' || op === 'upsert') {
        const out: Row[] = []
        for (const v of Array.isArray(values) ? values : [values!]) {
          if (op === 'insert' && v.id && rows.some((r) => r.id === v.id)) return { data: null, error: { code: '23505', message: 'duplicate key value' } }
          if (op === 'upsert' && rows.some((r) => conflict.every((c) => r[c] === v[c]))) continue
          const row = { id: `${table}-${++n}`, created_at: `2026-11-11T00:00:${String(n).padStart(2, '0')}Z`, ...v }
          rows.push(row)
          out.push(row)
        }
        return { data: out, error: null }
      }
      let hit = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') { hit.forEach((r) => Object.assign(r, values)); return { data: hit, error: null } }
      if (op === 'delete') { tables[table] = rows.filter((r) => !hit.includes(r)); return { data: hit, error: null } }
      if (orderCol) {
        const c = orderCol
        hit = [...hit].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1))
      }
      if (lim != null) hit = hit.slice(0, lim)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    const likeRe = (p: string) => new RegExp(`^${p.split(/(\\.|%|_)/).map((t) => t === '%' ? '.*' : t === '_' ? '.' : t.startsWith('\\') ? t.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}$`, 'i')
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q },
      lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return q },
      ilike: (c: string, p: string) => { const re = likeRe(p); filters.push((r) => re.test(String(r[c] ?? ''))); return q },
      contains: (c: string, vs: unknown[]) => { filters.push((r) => vs.every((v) => (r[c] as unknown[] | undefined)?.includes(v))); return q },
      order: (c: string, o?: { ascending?: boolean }) => { orderCol = c; asc = o?.ascending ?? true; return q },
      limit: (k: number) => { lim = k; return q },
      insert: (v: Row | Row[]) => { op = 'insert'; values = v; return q },
      update: (v: Row) => { op = 'update'; values = v; return q },
      delete: () => { op = 'delete'; return q },
      upsert: (v: Row, o: { onConflict: string }) => { op = 'upsert'; values = v; conflict = o.onConflict.split(','); return q },
      single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error ?? (r.data?.length ? null : { message: 'no rows' }) } },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error } },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    }
    return q
  }
  return { db: { from }, tables, writes }
}

const ctx = (over: Partial<HouseholdCtx> = {}): HouseholdCtx => ({ userId: 'scott', today: '2026-11-04', ...over })

// ═════════════════════════════ Recipes ═════════════════════════════
describe('recipes', () => {
  const shelf = () => fakeDb({
    recipes: [
      { id: 'r1', user_id: 'scott', title: 'Turkey Chili', tags: ['soup'], ingredients: ['1 lb ground turkey'], instructions: ['Brown it'] },
      { id: 'r2', user_id: 'iris', title: 'White Chicken Chili', tags: ['soup'], ingredients: [], instructions: [] },
      { id: 'r3', user_id: 'iris', title: '100% Rye Bread', tags: ['bread'], ingredients: [], instructions: [] },
    ],
  })

  it('lists the household shelf by part of the name, no owner filter', async () => {
    const { db } = shelf()
    const found = JSON.parse(await listRecipes(db, { search: 'chili' }))
    expect(found.map((r: Row) => r.title)).toEqual(['Turkey Chili', 'White Chicken Chili'])
    // The person's own % is literal, not a wildcard.
    expect(JSON.parse(await listRecipes(db, { search: '100%' })).map((r: Row) => r.id)).toEqual(['r3'])
    expect(JSON.parse(await listRecipes(db, { search: '_' }))).toEqual([])
    expect(JSON.parse(await listRecipes(db, { tag: 'bread' })).map((r: Row) => r.id)).toEqual(['r3'])
  })

  it('gets one by id or name, and says when the name is ambiguous or missing', async () => {
    const { db } = shelf()
    expect(JSON.parse(await getRecipe(db, { id: 'r1' })).ingredients).toEqual(['1 lb ground turkey'])
    expect(JSON.parse(await getRecipe(db, { title: 'turkey chili' })).id).toBe('r1')
    expect(JSON.parse(await getRecipe(db, { title: 'chili' })).several_match).toHaveLength(2)
    expect(await getRecipe(db, { title: 'lasagna' })).toMatch(/^Error: no recipe called/)
    expect(await getRecipe(db, { id: 'nope' })).toMatch(/^Error:/)
    expect(await getRecipe(db, {})).toMatch(/^Error: id or title/)
  })

  it('creates the row useRecipes.addManual writes, as the caller', async () => {
    const { db, tables } = shelf()
    const out = JSON.parse(await createRecipe(db, {
      title: '  Grandma\'s Soup ', ingredients: '2 carrots\n\n1 onion, diced\n', instructions: ['Chop', 'Simmer'],
      prep_minutes: 45, source_url: 'https://www.smittenkitchen.com/soup', tags: ['soup'],
    }, ctx()))
    expect(out.title).toBe("Grandma's Soup")
    const row = tables.recipes.find((r) => r.id === out.id)!
    expect(row).toMatchObject({
      user_id: 'scott', ingredients: ['2 carrots', '1 onion, diced'], instructions: ['Chop', 'Simmer'],
      prep_minutes: 45, source_url: 'https://www.smittenkitchen.com/soup', source_label: 'Smitten Kitchen',
      kid_acceptance: {}, times_cooked: 0, is_prep_friendly: false, image_url: null,
    })
  })

  it('refuses a recipe with no name or a non-web link', async () => {
    const { db, writes } = shelf()
    expect(await createRecipe(db, { ingredients: ['x'] }, ctx())).toBe('Error: title is required')
    expect(await createRecipe(db, { title: 'X', source_url: 'javascript:alert(1)' }, ctx())).toMatch(/^Error: source_url/)
    expect(writes).toEqual([])
  })

  it('a resent turn finds the recipe it already saved', async () => {
    const { db, tables } = shelf()
    const first = JSON.parse(await createRecipe(db, { title: 'Tacos' }, ctx({ stableId: 'stable-1' })))
    const again = JSON.parse(await createRecipe(db, { title: 'Tacos' }, ctx({ stableId: 'stable-1' })))
    expect(first.id).toBe('stable-1')
    expect(again).toMatchObject({ id: 'stable-1', already_saved: true })
    expect(tables.recipes.filter((r) => r.title === 'Tacos')).toHaveLength(1)
  })
})

// ═══════════════════════ Ingredients: parity with the app ═══════════════════════
const RECIPES = [
  { id: 'chili', ingredients: ['1 lb ground turkey', '2 cloves garlic, minced', '1 red bell pepper', '1 tsp cumin', '1 can black beans, drained', 'SAUCE: 2 tbsp olive oil'] },
  { id: 'soup', ingredients: ['1 butternut squash', '3 cloves garlic', '½ cup cream', '1 1/2 cups broth', 'salt and pepper to taste', '1 onion (large)'] },
  { id: 'salad', ingredients: ['2 tomatoes', '1 tomato', 'Fresh basil leaves', '½ cup basil, torn', 'Drizzle: 1 tbsp Dijon', '[feta](http://x) crumbled'] },
  { id: 'empty', ingredients: [] },
]
const entries = [
  { dayOfWeek: 0, recipeId: 'chili' }, { dayOfWeek: 1, recipeId: 'soup' }, { dayOfWeek: 2, recipeId: 'chili' },
  { dayOfWeek: 3, recipeId: null }, { dayOfWeek: 4, recipeId: 'soup', leftoverFrom: 'e1' }, { dayOfWeek: 5, recipeId: 'salad' },
  { dayOfWeek: 6, recipeId: 'missing' },
]
// deno-lint-ignore no-explicit-any
const appPlan = (es: typeof entries) => ({ entries: es.map((e, i) => ({ id: `e${i}`, mealPlanId: 'p', slot: 'dinner', ...e, recipeId: e.recipeId ?? undefined, leftoverFrom: (e as { leftoverFrom?: string }).leftoverFrom })) }) as any

describe('ingredient copies match src/lib', () => {
  it('consolidateIngredients', () => {
    // deno-lint-ignore no-explicit-any
    expect(consolidateIngredients(entries, RECIPES)).toEqual(appConsolidate(appPlan(entries), RECIPES as any))
    expect(consolidateIngredients(entries, RECIPES).length).toBeGreaterThan(10)
  })

  it('categorize and staples', () => {
    const words = ['2 cloves garlic', '1 tsp cumin', 'olive oil', '1 red bell pepper', 'black pepper', 'cream cheese', 'tofu', 'flour', 'bread', 'paper towels', 'jalapeño peppers', 'soy sauce']
    for (const w of words) {
      expect(categorizeIngredient(w)).toBe(appCategorize(w))
      const item: ConsolidatedIngredient = { text: w, category: categorizeIngredient(w), fromRecipeIds: [], key: w }
      expect(isStaple(item)).toBe(appIsStaple(item))
    }
  })

  it('syncSteps', () => {
    const needed = consolidateIngredients(entries, RECIPES)
    const lines: MealGroceryLine[] = [
      { id: 'l1', ingredientKey: 'garlic', recipeIds: ['chili'], text: '2 cloves garlic', listItemId: 'i1', skipped: false },
      { id: 'l2', ingredientKey: 'kale', recipeIds: ['old'], text: '1 bunch kale', listItemId: 'i2', skipped: false },
      { id: 'l3', ingredientKey: 'cumin', recipeIds: ['chili'], text: '1 tsp cumin', listItemId: null, skipped: true },
      { id: 'l4', ingredientKey: 'butternut squash', recipeIds: ['soup'], text: '1 butternut squash', listItemId: 'i9', skipped: false },
    ]
    const items = [
      { id: 'i1', text: '2 cloves garlic', completed: false },
      { id: 'i2', text: '1 bunch kale', completed: false },
      { id: 'i3', text: 'Tomatoes', completed: false },
      { id: 'i4', text: '1 lb ground turkey', completed: false },
    ]
    expect(syncSteps(needed, lines, items)).toEqual(appSyncSteps(needed, lines, items))
    expect(syncSteps(needed, [], items)).toEqual([])
  })

  it('activeDayRange', () => {
    const cases: [string, string | null, string | null][] = [
      ['2026-10-31', null, null], ['2026-10-31', '2026-11-02', null], ['2026-10-31', null, '2026-11-03'],
      ['2026-10-31', '2026-11-04', '2026-11-02'], ['2026-10-31', '2026-10-01', '2026-12-01'],
    ]
    for (const [w, s, e] of cases) {
      const [y, m, d] = w.split('-').map(Number)
      expect(activeDayRange(w, s, e)).toEqual(appActiveDayRange(new Date(y, m - 1, d), s, e))
    }
  })
})

// ═════════════════════════════ Groceries ═════════════════════════════
// The household's week starts Saturday: the window 2026-10-31 (Sat) .. 11-06
// (Fri) draws on the Sunday weeks 10-25 (its Saturday) and 11-01.
const groceryWorld = (over: Record<string, Row[]> = {}) => fakeDb({
  lists: [{ id: 'gro', user_id: 'scott', external_source: 'apple_reminders', external_id: 'Groceries' }],
  meal_plans: [
    { id: 'p-oct', week_start: '2026-10-25', created_at: '2026-10-20T00:00:00Z', starts_on: null, ends_on: null },
    { id: 'p-nov', week_start: '2026-11-01', created_at: '2026-10-28T00:00:00Z', starts_on: null, ends_on: null },
    { id: 'p-nov-late', week_start: '2026-11-01', created_at: '2026-10-29T00:00:00Z' },
  ],
  meal_plan_entries: [
    // Wed 11-04: set_meal just changed soup → chili.
    { id: 'e-wed', meal_plan_id: 'p-nov', day_of_week: 3, slot: 'dinner', recipe_id: 'chili', leftover_from: null },
    // Sat 10-31 is in the window; Fri 10-30 is the window before's.
    { id: 'e-sat', meal_plan_id: 'p-oct', day_of_week: 6, slot: 'dinner', recipe_id: 'salad', leftover_from: null },
    { id: 'e-fri', meal_plan_id: 'p-oct', day_of_week: 5, slot: 'dinner', recipe_id: 'soup', leftover_from: null },
    // The newer duplicate plan is not the household's.
    { id: 'e-dup', meal_plan_id: 'p-nov-late', day_of_week: 2, slot: 'dinner', recipe_id: 'soup', leftover_from: null },
  ],
  recipes: [
    { id: 'chili', title: 'Turkey Chili', ingredients: ['1 lb ground turkey', '2 cloves garlic', '1 tsp cumin'] },
    { id: 'soup', title: 'Squash Soup', ingredients: ['1 butternut squash', '2 cloves garlic'] },
    { id: 'salad', title: 'Caprese', ingredients: ['2 tomatoes'] },
  ],
  list_items: [
    { id: 'i-squash', list_id: 'gro', text: '1 butternut squash', completed: false, sort_order: 1 },
    { id: 'i-garlic', list_id: 'gro', text: '2 cloves garlic', completed: false, sort_order: 2 },
    { id: 'i-tom', list_id: 'gro', text: '2 tomatoes', completed: false, sort_order: 3 },
    { id: 'i-hand', list_id: 'gro', text: 'Paper towels', completed: false, sort_order: 4 },
  ],
  meal_grocery_lines: [
    { id: 'l-squash', list_id: 'gro', week_start: '2026-10-31', ingredient_key: 'butternut squash', recipe_ids: ['soup'], text: '1 butternut squash', list_item_id: 'i-squash', skipped: false },
    { id: 'l-garlic', list_id: 'gro', week_start: '2026-10-31', ingredient_key: 'garlic', recipe_ids: ['soup'], text: '2 cloves garlic', list_item_id: 'i-garlic', skipped: false },
    { id: 'l-tom', list_id: 'gro', week_start: '2026-10-31', ingredient_key: 'tomatoes', recipe_ids: ['salad'], text: '2 tomatoes', list_item_id: 'i-tom', skipped: false },
  ],
  ...over,
})

describe('syncGroceriesForDate', () => {
  it('brings the built window in step after a meal changes, as the Meals page would', async () => {
    const { db, tables } = groceryWorld()
    const out = await syncGroceriesForDate(db, 'scott', '2026-11-04', () => '2026-11-11T12:00:00Z')
    expect(out).toMatchObject({ synced: true, windows: ['2026-10-31'], added: ['1 lb ground turkey'], checked_off: ['1 butternut squash'] })
    expect(out.error).toBeUndefined()
    const item = (id: string) => tables.list_items.find((i) => i.id === id)!
    expect(item('i-squash')).toMatchObject({ completed: true, completed_at: '2026-11-11T12:00:00Z' })
    expect(item('i-hand').completed).toBe(false)
    expect(item('i-tom').completed).toBe(false) // Saturday's caprese is in the window
    const turkey = tables.list_items.find((i) => i.text === '1 lb ground turkey')!
    expect(turkey).toMatchObject({ list_id: 'gro', user_id: 'scott', completed: false })
    const lines = Object.fromEntries(tables.meal_grocery_lines.map((l) => [l.ingredient_key, l]))
    expect(lines['butternut squash']).toBeUndefined()
    expect(lines.garlic.recipe_ids).toEqual(['chili']) // now the chili's
    expect(lines.turkey).toMatchObject({ list_item_id: turkey.id, skipped: false, week_start: '2026-10-31', user_id: 'scott' })
    expect(lines.cumin.skipped).toBe(true) // a spice: staple
    expect(lines.cumin.list_item_id ?? null).toBeNull()
    // A second pass has nothing left to do.
    const again = await syncGroceriesForDate(db, 'scott', '2026-11-04')
    expect(again).toMatchObject({ synced: true, added: [], checked_off: [], rewritten: [] })
  })

  it('leaves a week alone when its shopping list was never built', async () => {
    const { db, writes } = groceryWorld({ meal_grocery_lines: [] })
    expect(await syncGroceriesForDate(db, 'scott', '2026-11-04')).toMatchObject({ synced: false, reason: 'shopping list not built for this week' })
    expect(writes).toEqual([])
  })

  it('without a Groceries list there is nothing to sync', async () => {
    const { db } = groceryWorld({ lists: [] })
    expect(await syncGroceriesForDate(db, 'scott', '2026-11-04')).toMatchObject({ synced: false, reason: 'no Groceries list' })
  })

  it('does not check anything off while a meal\'s recipe cannot be read', async () => {
    const world = groceryWorld()
    world.tables.recipes = world.tables.recipes.filter((r) => r.id !== 'chili')
    const out = await syncGroceriesForDate(world.db, 'scott', '2026-11-04')
    expect(out.synced).toBe(false)
    expect(world.writes).toEqual([])
  })

  it('days outside the plan\'s range do not feed the list', async () => {
    const world = groceryWorld()
    // The anchor week (11-01, holding the window's 4th day) ends the range on Tue 11-03.
    Object.assign(world.tables.meal_plans.find((p) => p.id === 'p-nov')!, { ends_on: '2026-11-03' })
    const out = await syncGroceriesForDate(world.db, 'scott', '2026-11-04')
    expect(out.added).toEqual([])
    expect(out.checked_off.sort()).toEqual(['1 butternut squash', '2 cloves garlic'])
  })

  it('reports a read failure instead of throwing', async () => {
    const { db } = groceryWorld()
    const out = await syncGroceriesForDate(fakeDb({}, { fail: { lists: 'boom' } }).db, 'scott', '2026-11-04')
    expect(out).toMatchObject({ synced: false, error: 'boom' })
    expect(db).toBeTruthy()
  })
})

describe('readGroceries', () => {
  it('lists what to buy with the recipe each line came from', async () => {
    const world = groceryWorld()
    world.tables.meal_grocery_lines.push({ id: 'l-salt', list_id: 'gro', week_start: '2026-10-31', ingredient_key: 'salt', recipe_ids: ['soup'], text: 'salt', list_item_id: null, skipped: true })
    const out = JSON.parse(await readGroceries(world.db, { date: 'today' }, ctx()))
    expect(out.week_start).toBe('2026-10-31')
    expect(out.to_buy).toEqual([
      { id: 'i-squash', text: '1 butternut squash', from_recipes: ['Squash Soup'] },
      { id: 'i-garlic', text: '2 cloves garlic', from_recipes: ['Squash Soup'] },
      { id: 'i-tom', text: '2 tomatoes', from_recipes: ['Caprese'] },
      { id: 'i-hand', text: 'Paper towels', from_recipes: [] },
    ])
    expect(out.not_added).toEqual([{ text: 'salt', from_recipes: ['Squash Soup'] }])
  })

  it('a week not built has items but no recipes', async () => {
    const out = JSON.parse(await readGroceries(groceryWorld().db, { date: '2026-11-20' }, ctx()))
    expect(out.week_start).toBeNull()
    expect(out.note).toMatch(/not been built/)
    expect(out.to_buy).toHaveLength(4)
  })

  it('rejects a date it cannot read', async () => {
    expect(await readGroceries(groceryWorld().db, { date: 'next week' }, ctx())).toMatch(/^Error: date/)
  })
})

// ═════════════════════════════ School ═════════════════════════════
describe('readSchoolDigest', () => {
  const section = (source: string, toDo: string[]) => ({ source, toDo: toDo.map((title) => ({ title })), goodToKnow: ['Picture day Friday'], chatter: '' })
  const school = () => fakeDb({
    school_digests: [
      { id: 'd1', digest_date: '2026-11-03', date_label: 'Tue, Nov 3', sections: [section('Class 2B', ['Sign trip form'])], to_do_count: 1, created_at: '2026-11-03T22:00:00Z' },
      { id: 'd2', digest_date: '2026-11-04', date_label: 'Wed, Nov 4', sections: [section('Class 2B', ['Old'])], to_do_count: 1, created_at: '2026-11-04T22:00:00Z' },
      // A re-run the same day: the later one is kept. One malformed section is dropped.
      { id: 'd3', digest_date: '2026-11-04', date_label: 'Wed, Nov 4', sections: [section('PTA', ['Bring cookies', 'RSVP']), { toDo: [] }], to_do_count: null, created_at: '2026-11-04T23:00:00Z' },
    ],
    tasks: [
      { id: 't1', title: 'Trip form', context: 'family', category: 'paper', completed: false, dismissed_at: null, assigned_to: 'kid-liam', held_by: 'fm-iris', created_at: '2026-11-02' },
      { id: 't2', title: 'Not ours', context: 'family', category: 'paper', completed: true, dismissed_at: '2026-11-03', assigned_to: 'kid-liam', created_at: '2026-11-02' },
      { id: 't3', title: 'In backpack', context: 'family', category: 'paper', completed: true, dismissed_at: null, created_at: '2026-11-02' },
      { id: 't4', title: 'Reading log', context: 'family', category: 'homework', completed: false, dismissed_at: null, assigned_to: null, assigned_to_all: ['kid-liam', 'kid-mia'], needed_on: '2026-11-06', created_at: '2026-11-01' },
      { id: 't5', title: 'Work memo', context: 'work', category: 'paper', completed: false, dismissed_at: null, created_at: '2026-11-01' },
    ],
    family_members: [{ id: 'kid-liam', name: 'Liam' }, { id: 'kid-mia', name: 'Mia' }, { id: 'fm-iris', name: 'Iris' }],
  })

  it('reads the latest digest, one a day, with open papers and homework', async () => {
    const out = JSON.parse(await readSchoolDigest(school().db, {}))
    expect(out.digests).toHaveLength(1)
    expect(out.digests[0]).toMatchObject({ date: '2026-11-04', label: 'Wed, Nov 4', to_do_count: 2 })
    expect(out.digests[0].sections.map((s: { source: string }) => s.source)).toEqual(['PTA'])
    expect(out.papers).toEqual([{ id: 't1', title: 'Trip form', for: ['Liam'], held_by: 'Iris' }])
    expect(out.homework).toEqual([{ id: 't4', title: 'Reading log', for: ['Liam', 'Mia'], needed_on: '2026-11-06' }])
  })

  it('reads several days when asked', async () => {
    const out = JSON.parse(await readSchoolDigest(school().db, { days: 5 }))
    expect(out.digests.map((d: { date: string }) => d.date)).toEqual(['2026-11-04', '2026-11-03'])
  })

  it('says so when no digest is readable', async () => {
    const world = school()
    world.tables.school_digests = []
    const out = JSON.parse(await readSchoolDigest(world.db, {}))
    expect(out.digests).toEqual([])
    expect(out.note).toMatch(/No kept school digest/)
  })

  it('a failed read is an Error string', async () => {
    expect(await readSchoolDigest(fakeDb({}, { fail: { tasks: 'denied' } }).db, {})).toBe('Error: denied')
  })
})

// ═════════════════════════════ Life areas ═════════════════════════════
describe('life areas', () => {
  const areas = () => fakeDb({
    goal_areas: [
      { id: 'a1', user_id: 'scott', name: 'Health', context: 'personal', sort_order: 0 },
      { id: 'a2', user_id: 'scott', name: 'Money', context: null, sort_order: 3 },
      { id: 'a3', user_id: 'iris', name: 'Home', context: 'family', sort_order: 7 },
    ],
  })

  it('lists areas with whose they are', async () => {
    const out = JSON.parse(await listLifeAreas(areas().db, {}, ctx()))
    expect(out).toEqual([
      { id: 'a1', name: 'Health', context: 'personal', mine: true, sort_order: 0 },
      { id: 'a2', name: 'Money', context: null, mine: true, sort_order: 3 },
      { id: 'a3', name: 'Home', context: 'family', mine: false, sort_order: 7 },
    ])
  })

  it('creates after the last of your own, private by default', async () => {
    const { db, tables } = areas()
    const out = JSON.parse(await saveLifeArea(db, { name: ' Fun ' }, ctx()))
    expect(out).toMatchObject({ name: 'Fun', context: 'personal', mine: true, sort_order: 4 })
    expect(tables.goal_areas.find((a) => a.id === out.id)).toMatchObject({ user_id: 'scott' })
    const fam = JSON.parse(await saveLifeArea(db, { name: 'Kids', context: 'family' }, ctx({ stableId: 'area-1' })))
    expect(fam).toMatchObject({ id: 'area-1', context: 'family', sort_order: 5 })
  })

  it('does not make a second area of the same name', async () => {
    const { db, tables } = areas()
    expect(JSON.parse(await saveLifeArea(db, { name: 'health' }, ctx()))).toMatchObject({ id: 'a1', already_exists: true })
    expect(tables.goal_areas).toHaveLength(3)
  })

  it('renames or moves your own area, never a partner\'s', async () => {
    const { db, tables } = areas()
    expect(JSON.parse(await saveLifeArea(db, { id: 'a2', name: 'Finances', context: 'family' }, ctx()))).toMatchObject({ id: 'a2', name: 'Finances', context: 'family' })
    expect(await saveLifeArea(db, { id: 'a3', name: 'Mine now' }, ctx())).toMatch(/^Error: no area of yours/)
    expect(tables.goal_areas.find((a) => a.id === 'a3')!.name).toBe('Home')
  })

  it('refuses a bad space, an empty change and a nameless create', async () => {
    const { db, writes } = areas()
    expect(await saveLifeArea(db, { name: 'X', context: 'school' }, ctx())).toMatch(/^Error: context/)
    expect(await saveLifeArea(db, { id: 'a1' }, ctx())).toMatch(/^Error: give a new name/)
    expect(await saveLifeArea(db, {}, ctx())).toMatch(/^Error: name is required/)
    expect(writes).toEqual([])
  })
})

describe('wiring', () => {
  it('every schema has an executor and unknown names fall through', async () => {
    for (const t of HOUSEHOLD_TOOLS) {
      expect(t.name).toMatch(/^symphony_/)
      expect(t.input_schema.type).toBe('object')
      expect(runHouseholdTool(t.name, fakeDb({}).db, {}, ctx())).not.toBeNull()
    }
    expect(runHouseholdTool('symphony_set_meal', fakeDb({}).db, {}, ctx())).toBeNull()
    const names = HOUSEHOLD_TOOLS.map((t) => t.name)
    for (const w of [...HOUSEHOLD_WRITE_TOOLS, ...HOUSEHOLD_IDEMPOTENT_CREATES]) expect(names).toContain(w)
  })
})
