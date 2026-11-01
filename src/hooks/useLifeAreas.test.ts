import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => {
  const state = { rows: [] as unknown[], error: null as unknown, calls: [] as { op: string; args: unknown[] }[] }
  const chain = (op: string, result: () => unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'eq', 'single', 'insert', 'update', 'delete']) {
      c[m] = (...args: unknown[]) => { state.calls.push({ op: `${op}.${m}`, args }); return c }
    }
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
    return c
  }
  const from = vi.fn((table: string) => {
    state.calls.push({ op: 'from', args: [table] })
    return {
      select: (...a: unknown[]) => { state.calls.push({ op: 'select', args: a }); return chain('q', () => ({ data: state.rows, error: state.error })) },
      insert: (...a: unknown[]) => { state.calls.push({ op: 'insert', args: a }); return chain('ins', () => ({ data: { id: 'new', user_id: 'me', name: 'Health', context: 'work', sort_order: 1 }, error: state.error })) },
      update: (...a: unknown[]) => { state.calls.push({ op: 'update', args: a }); return chain('upd', () => ({ error: state.error })) },
      delete: (...a: unknown[]) => { state.calls.push({ op: 'delete', args: a }); return chain('del', () => ({ error: state.error })) },
    }
  })
  return { state, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

import { useLifeAreas } from './useLifeAreas'

const rows = [
  { id: 'a1', user_id: 'me', name: 'Health', context: 'personal', sort_order: 0 },
  { id: 'a2', user_id: 'partner', name: 'Home', context: 'family', sort_order: 0 },
  { id: 'a3', user_id: 'me', name: 'Old', context: null, sort_order: 1 },
]

describe('useLifeAreas', () => {
  beforeEach(() => { h.state.rows = rows; h.state.error = null; h.state.calls = [] })

  it('reads goal_areas with context and marks only your own as mine', async () => {
    const { result } = renderHook(() => useLifeAreas())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(h.state.calls).toContainEqual({ op: 'from', args: ['goal_areas'] })
    expect(h.state.calls.find(c => c.op === 'select')?.args[0]).toContain('context')
    expect(result.current.areas.map(a => [a.id, a.mine, a.context])).toEqual([
      ['a1', true, 'personal'], ['a2', false, 'family'], ['a3', true, null],
    ])
  })

  it('add inserts user_id, name and context after your own last area', async () => {
    const { result } = renderHook(() => useLifeAreas())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let created: unknown
    await act(async () => { created = await result.current.add('  Health ', 'work') })
    expect(h.state.calls.find(c => c.op === 'insert')?.args[0]).toEqual({ user_id: 'me', name: 'Health', context: 'work', sort_order: 2 })
    expect(created).toMatchObject({ id: 'new', mine: true, context: 'work' })
    expect(result.current.areas).toHaveLength(4)
  })

  it('setContext, rename and remove write for the owner and update the list', async () => {
    const { result } = renderHook(() => useLifeAreas())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.setContext('a3', 'work') })
    expect(h.state.calls.find(c => c.op === 'update')?.args[0]).toEqual({ context: 'work' })
    await act(async () => { await result.current.rename('a1', ' Fitness ') })
    await act(async () => { await result.current.remove('a1') })
    expect(result.current.areas.map(a => [a.id, a.name, a.context])).toEqual([['a2', 'Home', 'family'], ['a3', 'Old', 'work']])
  })

  it('keeps the list when a write fails', async () => {
    const { result } = renderHook(() => useLifeAreas())
    await waitFor(() => expect(result.current.loading).toBe(false))
    h.state.error = { message: 'denied' }
    let ok = true
    await act(async () => { ok = await result.current.remove('a1') })
    expect(ok).toBe(false)
    expect(result.current.areas).toHaveLength(3)
  })
})
