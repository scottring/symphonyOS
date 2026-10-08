import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { GuideState } from '@/lib/guide/guidedPlan'

// The account copy lives in user_profiles.guided_plan; reads and writes are
// scripted per test.
const h = vi.hoisted(() => {
  const db = { remote: null as unknown, readError: null as null | { message: string }, writeError: null as null | { message: string } }
  const upserts: Array<Record<string, unknown>> = []
  const from = vi.fn(() => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = () => Promise.resolve(db.readError ? { data: null, error: db.readError } : { data: { guided_plan: db.remote }, error: null })
    b.upsert = (row: Record<string, unknown>) => {
      upserts.push(row)
      if (!db.writeError) db.remote = row.guided_plan
      return Promise.resolve({ error: db.writeError })
    }
    return b
  })
  return { db, upserts, from }
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
  h.upserts.length = 0
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
