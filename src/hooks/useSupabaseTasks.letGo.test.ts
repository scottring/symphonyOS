import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Let go ("not ever") is filtered at the hook boundary (final review,
// 2026-11-04): every list gets live tasks only; search reads letGoTasks; and
// placing a let-go item again brings it back.

const mockUser = { id: 'u1', email: 'a@example.test' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], loading: false, error: null, getCurrentUserMember: () => undefined, addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn() }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }), showToast: vi.fn() }))

type Row = Record<string, unknown>
const db = { tasks: [] as Row[], updates: [] as Row[] }
class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'update' = 'select'
  private payload: Row | null = null
  private filters: Array<{ col: string; v: unknown; is?: boolean }> = []
  private one = false
  constructor(private table: string) {}
  select() { return this }
  update(p: Row) { this.op = 'update'; this.payload = p; return this }
  eq(col: string, v: unknown) { this.filters.push({ col, v }); return this }
  is(col: string, v: unknown) { this.filters.push({ col, v, is: true }); return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  then<A, B>(res?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(res, rej)
  }
  private match(r: Row) { return this.filters.every((f) => (f.is ? r[f.col] == null : r[f.col] === f.v)) }
  private run() {
    if (this.table !== 'tasks') return { data: this.one ? null : [], error: null }
    if (this.op === 'update') {
      db.updates.push(this.payload!)
      const hit = db.tasks.filter((r) => this.match(r))
      hit.forEach((r) => Object.assign(r, this.payload))
      return { data: this.one ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null }
    }
    const rows = db.tasks.filter((r) => this.match(r)).map((r) => ({ ...r }))
    return { data: this.one ? rows[0] ?? null : rows, error: null }
  }
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => { const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }; ch.subscribe = vi.fn(() => ch); return ch }),
    from: (t: string) => new Query(t),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
  getAuthUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })),
}))

const row = (over: Row): Row => ({
  user_id: 'u1', title: 'T', completed: false, bucket: 'inbox', week_start: null, month_start: null, season_start: null,
  scheduled_for: null, is_all_day: false, is_goal: false, parent_task_id: null, context: 'family', dismissed_at: null,
  scope: 'compound', notes: null, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
})

beforeEach(() => {
  __resetTasksCache()
  db.updates = []
  db.tasks = [
    row({ id: 'live', title: 'Call the plumber', bucket: 'week', week_start: '2026-11-01' }),
    row({ id: 'gone', title: 'Plan winter vacation', bucket: 'someday', dismissed_at: '2026-11-04T14:00:00Z' }),
    row({ id: 'parent', title: 'Clean the garage' }),
    row({ id: 'step-gone', title: 'Sell the old bike', parent_task_id: 'parent', dismissed_at: '2026-11-04T14:00:00Z' }),
    row({ id: 'step-live', title: 'Sweep', parent_task_id: 'parent' }),
  ]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('useSupabaseTasks — let go at the hook boundary', () => {
  it('hands every list live tasks only; search gets the let-go ones', async () => {
    const h = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(h.result.current.tasks.find((t) => t.id === 'live')).toBeTruthy())
    const ids = h.result.current.tasks.map((t) => t.id)
    expect(ids).not.toContain('gone')
    expect(h.result.current.tasks.find((t) => t.id === 'parent')!.subtasks!.map((s) => s.id)).toEqual(['step-live'])
    expect(h.result.current.letGoTasks.map((t) => t.id).sort()).toEqual(['gone', 'step-gone'])
  })

  it('scheduling a let-go item brings it back onto the lists', async () => {
    const h = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(h.result.current.letGoTasks.find((t) => t.id === 'gone')).toBeTruthy())
    await act(async () => { await h.result.current.updateTask('gone', { bucket: 'timed', scheduledFor: new Date(2026, 10, 4), isAllDay: true }) })
    expect(db.updates.some((u) => 'dismissed_at' in u && u.dismissed_at === null)).toBe(true)
    await waitFor(() => expect(h.result.current.tasks.find((t) => t.id === 'gone')).toBeTruthy())
    expect(h.result.current.letGoTasks.find((t) => t.id === 'gone')).toBeUndefined()
  })
})
