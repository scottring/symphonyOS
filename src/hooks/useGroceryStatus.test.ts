import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useGroceryStatus } from './useGroceryStatus'
import type { MealPlan, Recipe } from '@/types/meal-planner'

// A small in-memory stand-in for the three tables the hook touches, so the
// tests check what ends up on the list rather than the order of calls.
type Row = Record<string, any>
const db: Record<string, Row[]> = { lists: [], list_items: [], meal_grocery_lines: [] }
let nextId = 1

function query(table: string) {
  const filters: [string, unknown][] = []
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  let returning = false
  const matches = (r: Row) => filters.every(([k, v]) => r[k] === v)
  const run = () => {
    const rows = db[table]
    if (op === 'select') return rows.filter(matches)
    if (op === 'insert') { const r = { id: `id-${nextId++}`, ...payload }; rows.push(r); return [r] }
    if (op === 'upsert') {
      const keys = (upsertOpts.onConflict ?? '').split(',')
      if (rows.some(r => keys.every(k => r[k] === payload![k]))) return []
      const r = { id: `id-${nextId++}`, ...payload }; rows.push(r); return [r]
    }
    if (op === 'update') { const hit = rows.filter(matches); hit.forEach(r => Object.assign(r, payload)); return hit }
    const keep = rows.filter(r => !matches(r)); const gone = rows.length - keep.length
    db[table] = keep; return new Array(gone).fill({})
  }
  const chain: any = {
    select: () => { returning = true; return chain },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return chain },
    order: () => chain,
    insert: (r: Row) => { op = 'insert'; payload = r; return chain },
    upsert: (r: Row, o: typeof upsertOpts) => { op = 'upsert'; payload = r; upsertOpts = o ?? {}; return chain },
    update: (r: Row) => { op = 'update'; payload = r; return chain },
    delete: () => { op = 'delete'; return chain },
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: op === 'select' || returning ? run() : (run(), null), error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => query(t) },
  getAuthUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
}))

const recipe = (id: string, title: string, ingredients: string[]): Recipe => ({
  id, userId: 'u1', title, ingredients, instructions: [], tags: [], kidAcceptance: {},
  isPrepFriendly: false, timesCooked: 0, createdAt: new Date(), updatedAt: new Date(),
})
const pasta = recipe('r1', 'Pasta', ['1 cup milk', '2 eggs', '8 oz pasta'])
const pizza = recipe('r2', 'Pizza', ['800 g brick cheese', 'SAUCE: 2 tbsp olive oil'])
const ricottaBake = recipe('r3', 'Ricotta bake', ['1 cup ricotta', '8 oz pasta'])

const planOf = (recipes: Recipe[]): MealPlan => ({
  id: 'p1', userId: 'u1', weekStart: new Date(2026, 10, 1),
  entries: recipes.map((r, i) => ({ id: `e${i}`, mealPlanId: 'p1', dayOfWeek: i, slot: 'dinner' as const, recipeId: r.id })),
  createdAt: new Date(), updatedAt: new Date(),
})

const open = () => db.list_items.filter(i => !i.completed).map(i => i.text).sort()
const lineKeys = () => db.meal_grocery_lines.map(l => `${l.ingredient_key}${l.skipped ? ' (skipped)' : ''}`).sort()

beforeEach(() => {
  nextId = 1
  db.lists = [{ id: 'groceries', external_source: 'apple_reminders', external_id: 'Groceries', title: 'Groceries' }]
  db.list_items = []
  db.meal_grocery_lines = []
})

describe('useGroceryStatus', () => {
  it('counts only items still to buy as already on the list', async () => {
    db.list_items = [
      { id: 'a', list_id: 'groceries', text: 'milk', completed: false },
      { id: 'b', list_id: 'groceries', text: 'eggs', completed: false },
      { id: 'c', list_id: 'groceries', text: 'pasta', completed: true },
    ]
    const { result } = renderHook(() => useGroceryStatus(planOf([pasta]), [pasta]))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stockedPercent).toBe(67)
    expect(result.current.missingItems.map(m => m.text)).toEqual(['8 oz pasta'])
  })

  it('leaves a week that was never built alone when its meals change', async () => {
    const { result, rerender } = renderHook(({ p }) => useGroceryStatus(p, [pasta, pizza]), { initialProps: { p: planOf([pasta]) } })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ p: planOf([pasta, pizza]) })
    await new Promise(r => setTimeout(r, 1000))
    expect(db.list_items).toEqual([])
  })

  it('build lists the ticked items and remembers the rest', async () => {
    const { result } = renderHook(() => useGroceryStatus(planOf([pasta]), [pasta]))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const [milk, , noodles] = result.current.consolidated
    await act(async () => { expect(await result.current.build([milk, noodles])).toBeNull() })
    expect(open()).toEqual(['1 cup milk', '8 oz pasta'])
    expect(lineKeys()).toEqual(['eggs (skipped)', 'milk', 'pasta'])
  })

  it('a build adopts what an earlier build left, so it follows the plan too', async () => {
    db.list_items = [{ id: 'old', list_id: 'groceries', text: '1 cup ricotta', completed: false }]
    const { result, rerender } = renderHook(({ p }) => useGroceryStatus(p, [pasta, ricottaBake]), { initialProps: { p: planOf([pasta, ricottaBake]) } })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.missingItems.map(m => m.text)).not.toContain('1 cup ricotta')
    await act(async () => { await result.current.build(result.current.missingItems) })
    rerender({ p: planOf([pasta]) })
    await waitFor(() => expect(db.list_items.find(i => i.id === 'old')?.completed).toBe(true), { timeout: 3000 })
  })

  it('after a build, adding a meal adds its ingredients and removing one checks its own off', async () => {
    const { result, rerender } = renderHook(
      ({ p }) => useGroceryStatus(p, [pasta, pizza, ricottaBake]),
      { initialProps: { p: planOf([pasta, ricottaBake]) } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.build(result.current.consolidated) })
    expect(open()).toEqual(['1 cup milk', '1 cup ricotta', '16 oz pasta', '2 eggs'])

    // Swap the ricotta bake for pizza.
    rerender({ p: planOf([pasta, pizza]) })
    await waitFor(() => expect(open()).toEqual(['1 cup milk', '2 eggs', '8 oz pasta', '800 g brick cheese']), { timeout: 3000 })
    // Ricotta was checked off, not deleted; olive oil is a staple, remembered unlisted.
    expect(db.list_items.find(i => i.text === '1 cup ricotta')?.completed).toBe(true)
    expect(lineKeys()).toEqual(['brick cheese', 'eggs', 'milk', 'olive oil (skipped)', 'pasta'])
  })

  it('does not sync while a meal\'s recipe has not loaded', async () => {
    const { result, rerender } = renderHook(
      ({ p, rs }) => useGroceryStatus(p, rs),
      { initialProps: { p: planOf([pasta]), rs: [pasta] } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.build(result.current.consolidated) })
    // Pizza is on the plan but the library hasn't caught up: pasta must stay.
    rerender({ p: { ...planOf([pasta, pizza]), entries: [planOf([pasta, pizza]).entries[1]] }, rs: [pasta] })
    await new Promise(r => setTimeout(r, 1000))
    expect(open()).toEqual(['1 cup milk', '2 eggs', '8 oz pasta'])
  })

  it('does not sync before the page says the plan and recipes are ready', async () => {
    const { result, rerender } = renderHook(
      ({ p, ready }) => useGroceryStatus(p, [pasta], ready),
      { initialProps: { p: planOf([pasta]), ready: true } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.build(result.current.consolidated) })
    rerender({ p: planOf([]), ready: false })
    await new Promise(r => setTimeout(r, 1000))
    expect(open()).toEqual(['1 cup milk', '2 eggs', '8 oz pasta'])
  })
})
