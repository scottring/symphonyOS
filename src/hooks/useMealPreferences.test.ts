import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMealPreferences } from './useMealPreferences'

// Chainable, thenable supabase builder that records update/insert payloads and
// resolves the canonical-note select with `selectRows`.
const { db, makeQuery } = vi.hoisted(() => {
  const db: {
    selectRows: Array<{ id: string; content: string }>
    updates: Array<{ payload: Record<string, unknown>; id: string }>
    inserts: Array<Record<string, unknown>>
  } = { selectRows: [], updates: [], inserts: [] }

  function makeQuery() {
    const state: { op: 'select' | 'update' | 'insert' | null; payload: any } = { op: null, payload: null }
    const q: Record<string, unknown> = {
      select() { if (!state.op) state.op = 'select'; return q },
      update(payload: any) { state.op = 'update'; state.payload = payload; return q },
      insert(payload: any) { state.op = 'insert'; db.inserts.push(payload); state.payload = payload; return q },
      eq(_c: string, val: any) { if (state.op === 'update') db.updates.push({ payload: state.payload, id: val }); return q },
      order() { return q },
      limit() { return q },
      single() { return Promise.resolve({ data: { id: 'new-id' }, error: null }) },
      then(onF: (v: unknown) => unknown) {
        const value = state.op === 'select'
          ? { data: db.selectRows, error: null }
          : { data: null, error: null }
        return Promise.resolve(value).then(onF)
      },
    }
    return q
  }
  return { db, makeQuery }
})

vi.mock('@/lib/supabase', () => {
  const __mod: any = {
  supabase: {
    from: vi.fn(() => makeQuery()),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })) },
  },
}
  // getAuthUser is the real module's cached-session reader; here it
  // just answers from whatever this mock's auth returns.
  return {
    ...__mod,
    getAuthUser: (...a: any[]) =>
      __mod.supabase.auth?.getUser?.(...a) ??
      Promise.resolve({ data: { user: null }, error: null }),
  }
})

describe('useMealPreferences', () => {
  beforeEach(() => {
    db.selectRows = []
    db.updates = []
    db.inserts = []
  })

  it('loads the canonical note content', async () => {
    db.selectRows = [{ id: 'n1', content: 'veggie-heavy, family of four' }]
    const { result } = renderHook(() => useMealPreferences())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.content).toBe('veggie-heavy, family of four')
  })

  it('save() updates the existing note by id', async () => {
    db.selectRows = [{ id: 'n1', content: 'old' }]
    const { result } = renderHook(() => useMealPreferences())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = false
    await act(async () => { ok = await result.current.save('new master prompt') })
    expect(ok).toBe(true)
    expect(db.updates).toEqual([{ payload: expect.objectContaining({ content: 'new master prompt' }), id: 'n1' }])
    expect(db.inserts).toHaveLength(0)
    expect(result.current.content).toBe('new master prompt')
  })

  it('save() inserts a couple-scoped note when none exists', async () => {
    db.selectRows = [] // no note yet
    const { result } = renderHook(() => useMealPreferences())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.save('first prompt') })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]).toEqual(expect.objectContaining({
      title: 'Household Meal Preferences', content: 'first prompt', scope: 'couple', user_id: 'u1',
    }))
  })
})
