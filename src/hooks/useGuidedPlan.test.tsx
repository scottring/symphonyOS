import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { GuideState } from '@/lib/guide/guidedPlan'

// The account copy lives in user_profiles.guided_plan; reads and writes are
// scripted per test.
// With `hold` on, reads and writes wait in `held` until released, so a test
// can overlap them: release(i, outcome) settles the i-th held call.
type Err = null | { message: string }
const h = vi.hoisted(() => {
  const db = { remote: null as unknown, readError: null as Err, writeError: null as Err }
  const upserts: Array<Record<string, unknown>> = []
  const held: Array<{ kind: 'read' | 'write'; settle: (outcome?: Err | 'throw') => void }> = []
  const opts = { hold: false }
  const read = () => (db.readError ? { data: null, error: db.readError } : { data: { guided_plan: db.remote }, error: null })
  const from = vi.fn(() => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = () => {
      if (!opts.hold) return Promise.resolve(read())
      return new Promise((resolve) => held.push({ kind: 'read', settle: () => resolve(read()) }))
    }
    b.upsert = (row: Record<string, unknown>) => {
      upserts.push(row)
      const finish = (error: Err) => { if (!error) db.remote = row.guided_plan; return { error } }
      if (!opts.hold) return Promise.resolve(finish(db.writeError))
      return new Promise((resolve, reject) => held.push({
        kind: 'write',
        settle: (outcome) => (outcome === 'throw' ? reject(new Error('network')) : resolve(finish(outcome ?? null))),
      }))
    }
    return b
  })
  return { db, upserts, from, held, opts }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { GuideProvider, useGuidedPlan } from './useGuidedPlan'

const KEY = 'symphony.guide.u1'
const guide = (updatedAt: string, current = 0): GuideState => ({
  v: 1, route: 'week', steps: ['week', 'today'], periods: {}, current, done: [], status: 'active', updatedAt,
})

let api: ReturnType<typeof useGuidedPlan>
function Probe({ onApi }: { onApi: (a: ReturnType<typeof useGuidedPlan>) => void }) {
  const g = useGuidedPlan()
  useEffect(() => { onApi(g) })
  return <div>{g.loaded ? `loaded step=${g.state?.current ?? 'none'} in=${g.savedIn}` : 'loading'}</div>
}
const mount = () => render(<GuideProvider><Probe onApi={(a) => { api = a }} /></GuideProvider>)
const local = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')

beforeEach(() => {
  localStorage.clear()
  h.db.remote = null; h.db.readError = null; h.db.writeError = null
  h.upserts.length = 0; h.held.length = 0; h.opts.hold = false
})

describe('GuideProvider reconciliation', () => {
  it('uploads a newer copy from this browser before claiming account storage', async () => {
    h.db.remote = guide('2026-10-01T10:00:00Z', 0)
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-02T10:00:00Z', 1)))
    mount()
    await screen.findByText('loaded step=1 in=account')
    expect(h.upserts).toHaveLength(1)
    expect(h.db.remote).toMatchObject({ current: 1 })
  })

  it('says device when the newer local copy cannot be uploaded', async () => {
    h.db.writeError = { message: 'offline' }
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-02T10:00:00Z', 1)))
    mount()
    await screen.findByText('loaded step=1 in=device')
  })

  it('takes a newer account copy and stores it in this browser', async () => {
    h.db.remote = guide('2026-10-03T10:00:00Z', 1)
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-01T10:00:00Z', 0)))
    mount()
    await screen.findByText('loaded step=1 in=account')
    expect(local()).toMatchObject({ current: 1 })
    expect(h.upserts).toHaveLength(0)
  })

  it('retries a failed write when the connection comes back', async () => {
    mount()
    await screen.findByText('loaded step=none in=account')
    h.db.writeError = { message: 'offline' }
    await act(() => api.set(guide('2026-10-04T10:00:00Z', 1)))
    expect(screen.getByText('loaded step=1 in=device')).toBeInTheDocument()

    h.db.writeError = null
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await screen.findByText('loaded step=1 in=account')
    expect(h.db.remote).toMatchObject({ current: 1 })
  })

  it('Stop guiding on one device hides the old guide in another browser', async () => {
    // Device B: stop guiding.
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-01T10:00:00Z', 1)))
    const b = mount()
    await screen.findByText('loaded step=1 in=account')
    await act(() => api.set(null))
    expect(h.db.remote).toMatchObject({ cleared: true })
    b.unmount()

    // Device A: an older browser copy of the same guide, reopened later.
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-01T10:00:00Z', 1)))
    mount()
    await screen.findByText('loaded step=none in=account')
    expect(local()).toMatchObject({ cleared: true })
  })

  it('a guide started after a stop beats the stop', async () => {
    h.db.remote = { v: 1, cleared: true, updatedAt: '2026-10-01T10:00:00Z' }
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-02T10:00:00Z', 0)))
    mount()
    await screen.findByText('loaded step=0 in=account')
    expect(h.db.remote).toMatchObject({ route: 'week' })
  })

  it('falls back to this browser when the account cannot be read', async () => {
    h.db.readError = { message: 'offline' }
    localStorage.setItem(KEY, JSON.stringify(guide('2026-10-02T10:00:00Z', 1)))
    mount()
    await screen.findByText('loaded step=1 in=device')
  })

  it('picks up another device’s progress on returning to the tab', async () => {
    h.db.remote = guide('2026-10-01T10:00:00Z', 0)
    mount()
    await screen.findByText('loaded step=0 in=account')
    h.db.remote = guide('2026-10-05T10:00:00Z', 1)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(screen.getByText('loaded step=1 in=account')).toBeInTheDocument())
  })
})

// Independent review of PR #160: two saves in flight at once let an older
// success mark a newer, failed save as stored in the account.
describe('GuideProvider overlapping saves', () => {
  const flushAll = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
  const release = async (i: number, outcome?: Err | 'throw') => {
    await act(async () => { h.held[i].settle(outcome); for (let k = 0; k < 5; k++) await Promise.resolve() })
  }
  const writes = () => h.held.filter((x) => x.kind === 'write').length
  const startHeld = async () => {
    mount()
    await screen.findByText('loaded step=none in=account')
    h.opts.hold = true
  }

  // Start a save and let its write reach the account call before going on.
  // Returns the save's promise wrapped, so awaiting this doesn't wait on it.
  const save = async (g: GuideState | null) => {
    let p!: Promise<void>
    act(() => { p = api.set(g) })
    await flushAll()
    return { done: p }
  }
  const sent = () => h.upserts.map((u) => (u.guided_plan as GuideState).current)

  it('an older success never claims a newer, failed save reached the account', async () => {
    await startHeld()
    const { done: older } = await save(guide('2026-10-08T10:00:00Z', 0))
    expect(writes()).toBe(1)
    const { done: newer } = await save(guide('2026-10-08T10:01:00Z', 1))
    expect(api.savedIn).toBe('device')           // marked unsaved immediately
    expect(writes()).toBe(1)                     // one save at a time

    await release(0)                             // step 0 lands after step 1 was made
    await act(() => older)
    expect(h.db.remote).toMatchObject({ current: 0 })
    expect(api.savedIn).toBe('device')           // step 1 is shown and not yet saved

    expect(writes()).toBe(2)
    await release(1, { message: 'offline' })     // step 1 fails
    await act(() => newer)
    expect(api.state?.current).toBe(1)
    expect(h.db.remote).toMatchObject({ current: 0 })
    expect(api.savedIn).toBe('device')

    h.opts.hold = false                          // reconnect retries the newest copy
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await screen.findByText('loaded step=1 in=account')
    expect(h.db.remote).toMatchObject({ current: 1 })
  })

  it('an older save that finishes late cannot overwrite a newer one', async () => {
    await startHeld()
    await save(guide('2026-10-08T10:00:00Z', 0))
    await save(guide('2026-10-08T10:01:00Z', 1))
    await release(0, { message: 'timeout' })
    await release(1)
    expect(sent()).toEqual([0, 1])
    expect(h.db.remote).toMatchObject({ current: 1 })
    expect(api.savedIn).toBe('account')
  })

  it('collapses saves made while one is in flight into a single write of the newest', async () => {
    await startHeld()
    await save(guide('2026-10-08T10:00:00Z', 0))
    await save(guide('2026-10-08T10:01:00Z', 1))
    await save(guide('2026-10-08T10:02:00Z', 2))
    await release(0)
    await release(1)
    await flushAll()
    expect(sent()).toEqual([0, 2])
    expect(h.held).toHaveLength(2)
    expect(api.savedIn).toBe('account')
  })

  it('a thrown network error counts as unsaved and does not stall later saves', async () => {
    await startHeld()
    await save(guide('2026-10-08T10:00:00Z', 0))
    await release(0, 'throw')
    expect(api.savedIn).toBe('device')
    await save(guide('2026-10-08T10:01:00Z', 1))
    await release(1)
    expect(h.db.remote).toMatchObject({ current: 1 })
    expect(api.savedIn).toBe('account')
  })

  it('a tab-return check waits for an in-flight save and does not undo it', async () => {
    await startHeld()
    await save(guide('2026-10-08T10:00:00Z', 1))
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await flushAll()
    expect(h.held.map((x) => x.kind)).toEqual(['write'])   // no read while the save is open
    await release(0)
    expect(h.held.map((x) => x.kind)).toEqual(['write', 'read'])
    await release(1)
    expect(api.state?.current).toBe(1)
    expect(h.db.remote).toMatchObject({ current: 1 })
    expect(api.savedIn).toBe('account')
  })

  it('a save made while a tab-return check is reading is the one that ends up stored', async () => {
    h.db.remote = guide('2026-10-01T10:00:00Z', 0)
    mount()
    await screen.findByText('loaded step=0 in=account')
    h.opts.hold = true
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await flushAll()
    expect(h.held.map((x) => x.kind)).toEqual(['read'])
    await save(guide('2026-10-08T10:00:00Z', 2))
    expect(api.savedIn).toBe('device')
    await release(0)                             // the read returns the older account copy
    expect(h.held.map((x) => x.kind)).toEqual(['read', 'write'])
    await release(1)
    await flushAll()
    expect(sent()).toEqual([2])                  // never re-sends the older copy
    expect(api.state?.current).toBe(2)
    expect(h.db.remote).toMatchObject({ current: 2 })
    expect(api.savedIn).toBe('account')
  })
})
