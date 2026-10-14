import { describe, expect, it } from 'vitest'
import { addDays, entryTitle, getMeals, primaryEntry, resolveDate, setMeal, weekOf, type EntryRow } from './meals'

// ── An in-memory stand-in for the three tables, enough for these queries ──
type Row = Record<string, unknown>
function fakeDb(seed: { meal_plans?: Row[]; meal_plan_entries?: Row[]; recipes?: Row[] }) {
  const tables: Record<string, Row[]> = { meal_plans: [], meal_plan_entries: [], recipes: [], ...seed }
  let n = 0
  const query = (table: string) => {
    let rows = [...tables[table]]
    let pending: { kind: 'insert' | 'update'; values: Row } | null = null
    const q = {
      select: () => q,
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q },
      eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return q },
      ilike: (col: string, val: string) => { rows = rows.filter((r) => String(r[col]).toLowerCase() === val.replace(/\\(.)/g, '$1').toLowerCase()); return q },
      order: (col: string) => { rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q },
      limit: (k: number) => { rows = rows.slice(0, k); return q },
      insert: (values: Row) => { pending = { kind: 'insert', values }; return q },
      update: (values: Row) => { pending = { kind: 'update', values }; return q },
      single: async () => {
        if (pending?.kind === 'insert') {
          const row = { id: `${table}-${++n}`, created_at: `2026-10-14T20:00:0${n}Z`, ...pending.values }
          tables[table].push(row)
          return { data: row, error: null }
        }
        if (pending?.kind === 'update') {
          const target = tables[table].find((r) => r.id === rows[0]?.id)!
          Object.assign(target, pending.values)
          return { data: target, error: null }
        }
        return { data: rows[0] ?? null, error: null }
      },
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({
        data: table === 'meal_plan_entries'
          ? rows.map((r) => ({ ...r, recipes: r.recipe_id ? { title: tables.recipes.find((x) => x.id === r.recipe_id)?.title } : null }))
          : rows,
        error: null,
      }),
    }
    return q
  }
  return { db: { from: query }, tables }
}

// Wed 2026-10-14; the week starts Sun 2026-10-11.
const TODAY = '2026-10-14'
const seed = () => fakeDb({
  meal_plans: [
    { id: 'p-old', week_start: '2026-10-11', created_at: '2026-10-01T00:00:00Z', user_id: 'scott' },
    { id: 'p-new', week_start: '2026-10-11', created_at: '2026-10-05T00:00:00Z', user_id: 'iris' },
  ],
  meal_plan_entries: [
    { id: 'e-soup', meal_plan_id: 'p-old', day_of_week: 3, slot: 'dinner', recipe_id: 'r-soup', ad_hoc_title: null, leftover_from: null, for_member_id: null, created_at: '2026-10-02T00:00:00Z' },
    { id: 'e-side', meal_plan_id: 'p-old', day_of_week: 3, slot: 'dinner', recipe_id: null, ad_hoc_title: 'Green salad', leftover_from: null, for_member_id: null, created_at: '2026-10-03T00:00:00Z' },
    { id: 'e-thu', meal_plan_id: 'p-old', day_of_week: 4, slot: 'dinner', recipe_id: null, ad_hoc_title: null, leftover_from: 'e-soup', for_member_id: null, created_at: '2026-10-02T00:00:00Z' },
  ],
  recipes: [
    { id: 'r-soup', title: 'Butternut Squash Soup with Grilled Cheese' },
    { id: 'r-chili', title: 'Turkey Chili' },
  ],
})

describe('dates', () => {
  it('reads today, tomorrow and real dates only', () => {
    expect(resolveDate('today', TODAY)).toBe(TODAY)
    expect(resolveDate('tonight', TODAY)).toBe(TODAY)
    expect(resolveDate(undefined, TODAY)).toBe(TODAY)
    expect(resolveDate('tomorrow', TODAY)).toBe('2026-10-15')
    expect(resolveDate('2026-10-31', TODAY)).toBe('2026-10-31')
    expect(resolveDate('2026-02-30', TODAY)).toBeNull()
    expect(resolveDate('next week', TODAY)).toBeNull()
  })
  it('finds the Sunday week and the weekday', () => {
    expect(weekOf(TODAY)).toEqual({ weekStart: '2026-10-11', dayOfWeek: 3 })
    expect(weekOf('2026-10-11')).toEqual({ weekStart: '2026-10-11', dayOfWeek: 0 })
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('entries', () => {
  const rows = seed().tables.meal_plan_entries as unknown as EntryRow[]
  const withTitles = rows.map((r) => ({ ...r, recipes: r.recipe_id === 'r-soup' ? { title: 'Butternut Squash Soup with Grilled Cheese' } : null }))
  const byId = new Map(withTitles.map((r) => [r.id, r]))
  it('the day’s meal is its first whole-family entry', () => {
    expect(primaryEntry(withTitles, 3, 'dinner')?.id).toBe('e-soup')
  })
  it('names leftovers after the meal they reheat', () => {
    expect(entryTitle(byId.get('e-thu')!, byId)).toBe('Leftovers: Butternut Squash Soup with Grilled Cheese')
  })
})

describe('getMeals', () => {
  it('reads the household’s (oldest) plan, day by day', async () => {
    const { db } = seed()
    const days = await getMeals(db, TODAY, 2)
    expect(days).toEqual([
      { date: TODAY, meals: [{ slot: 'dinner', title: 'Butternut Squash Soup with Grilled Cheese', entry_id: 'e-soup', recipe_id: 'r-soup' }] },
      { date: '2026-10-15', meals: [{ slot: 'dinner', title: 'Leftovers: Butternut Squash Soup with Grilled Cheese', entry_id: 'e-thu', recipe_id: null }] },
    ])
  })
})

describe('setMeal', () => {
  it('replaces tonight’s dinner in place, and says what it was', async () => {
    const { db, tables } = seed()
    const r = await setMeal(db, 'scott', { date: TODAY, slot: 'dinner', title: 'Wednesday Wheelie’s Pizza' })
    expect(r).toMatchObject({ id: 'e-soup', title: 'Wednesday Wheelie’s Pizza', recipe_id: null, previous: 'Butternut Squash Soup with Grilled Cheese' })
    expect(tables.meal_plan_entries.find((e) => e.id === 'e-soup')).toMatchObject({ recipe_id: null, ad_hoc_title: 'Wednesday Wheelie’s Pizza' })
    // The side salad stays, and nothing new was added.
    expect(tables.meal_plan_entries).toHaveLength(3)
    expect((await getMeals(db, TODAY, 1))[0].meals[0].title).toBe('Wednesday Wheelie’s Pizza')
  })

  it('links to a recipe on the shelf when the title names one', async () => {
    const { db } = seed()
    const r = await setMeal(db, 'scott', { date: TODAY, slot: 'dinner', title: 'turkey chili' })
    expect(r.recipe_id).toBe('r-chili')
  })

  it('adds a meal to an empty day, and makes the week’s plan when there is none', async () => {
    const { db, tables } = seed()
    await setMeal(db, 'scott', { date: '2026-10-16', slot: 'dinner', title: 'Tacos' })
    expect(tables.meal_plan_entries.at(-1)).toMatchObject({ meal_plan_id: 'p-old', day_of_week: 5, slot: 'dinner', ad_hoc_title: 'Tacos' })
    await setMeal(db, 'scott', { date: '2026-10-19', slot: 'dinner', title: 'Pasta' })
    expect(tables.meal_plans.at(-1)).toMatchObject({ user_id: 'scott', week_start: '2026-10-18' })
    expect((await getMeals(db, '2026-10-19', 1))[0].meals[0].title).toBe('Pasta')
  })
})
