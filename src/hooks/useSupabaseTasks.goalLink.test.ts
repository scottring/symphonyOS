import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// setGoalLink against a small fake database (Codex review of 6c942547): the
// write is a compare-and-set on goal_task_id, a lost response is read back, an
// unknown result gates the next write until a read succeeds, and every
// instance receives the ONE field — never a stale whole-task snapshot.

const mockUser = { id: 'u1', email: 'a@example.test' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], loading: false, error: null, getCurrentUserMember: () => undefined, addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn() }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }), showToast: vi.fn() }))

type Row = Record<string, unknown>
type Filter = { col: string; op: 'eq' | 'is'; v: unknown }
const db = {
  tasks: [] as Row[],
  /** Every UPDATE on tasks, with its filters — to prove the conditional write. */
  updates: [] as Array<{ payload: Row; filters: Filter[] }>,
  /** Scripted faults, consumed in order. */
  faults: [] as Array<'lose-update' | 'fail-update' | 'fail-read' | 'throw-update'>,
}
function take(kind: string) {
  const i = db.faults.indexOf(kind as never)
  if (i < 0) return false
  db.faults.splice(i, 1)
  return true
}
class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'update' = 'select'
  private payload: Row | null = null
  private filters: Filter[] = []
  private cols = '*'
  private one = false
  constructor(private table: string) {}
  select(cols = '*') { if (this.op === 'select') this.cols = cols; return this }
  update(p: Row) { this.op = 'update'; this.payload = p; return this }
  eq(col: string, v: unknown) { this.filters.push({ col, op: 'eq', v }); return this }
  is(col: string, v: unknown) { this.filters.push({ col, op: 'is', v }); return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  then<A, B>(res?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(res, rej)
  }
  private match(r: Row) { return this.filters.every((f) => (f.op === 'is' ? r[f.col] === null : r[f.col] === f.v)) }
  private run() {
    if (this.table !== 'tasks') return { data: this.one ? null : [], error: null }
    if (this.op === 'update') {
      db.updates.push({ payload: this.payload!, filters: [...this.filters] })
      if (take('throw-update')) throw new Error('network down')
      if (take('fail-update')) return { data: null, error: { message: 'boom' } }
      const hit = db.tasks.filter((r) => this.match(r))
      hit.forEach((r) => Object.assign(r, this.payload))
      if (take('lose-update')) throw new Error('response lost')
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    if (this.cols === 'goal_task_id' && take('fail-read')) throw new Error('read lost')
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
  scheduled_for: null, is_all_day: false, is_goal: false, goal_task_id: null, parent_task_id: null, context: 'family',
  scope: 'compound', notes: null, created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-02T10:00:00Z', ...over,
})

beforeEach(() => {
  __resetTasksCache()
  db.updates = []
  db.faults = []
  db.tasks = [
    row({ id: 'g1', title: 'Identify family activities for fall', is_goal: true, bucket: 'month', month_start: '2026-10-01' }),
    row({ id: 'g2', title: 'Get the house ready for winter', is_goal: true, bucket: 'month', month_start: '2026-10-01' }),
    row({ id: 'g3', title: 'Plan winter break', is_goal: true, bucket: 'month', month_start: '2026-10-01' }),
    row({ id: 'a', title: 'Look up music lessons', notes: 'Ask about cello' }),
    row({ id: 's', title: 'Look up swim lessons', goal_task_id: 'g2' }),
  ]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

async function mountTwo() {
  const a = renderHook(() => useSupabaseTasks())
  const b = renderHook(() => useSupabaseTasks())
  await waitFor(() => expect(a.result.current.tasks.find((t) => t.id === 'a')).toBeTruthy())
  await waitFor(() => expect(b.result.current.tasks.find((t) => t.id === 'a')).toBeTruthy())
  return { a, b }
}
const task = (h: ReturnType<typeof renderHook<ReturnType<typeof useSupabaseTasks>, unknown>>, id: string) => h.result.current.tasks.find((t) => t.id === id)!

describe('setGoalLink', () => {
  it('writes ONLY goal_task_id, conditioned on the goal it was shown under (null → IS NULL)', async () => {
    const { a } = await mountTwo()
    let out
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g1', null) })
    expect(out).toEqual({ status: 'ok' })
    expect(db.updates).toEqual([{ payload: { goal_task_id: 'g1' }, filters: [{ col: 'id', op: 'eq', v: 'a' }, { col: 'goal_task_id', op: 'is', v: null }] }])
    await act(async () => { out = await a.result.current.setGoalLink('s', 'g1', 'g2') })
    expect(db.updates[1].filters).toEqual([{ col: 'id', op: 'eq', v: 's' }, { col: 'goal_task_id', op: 'eq', v: 'g2' }])
  })

  it('a committed write whose response was lost is read back as a success, in every instance', async () => {
    const { a, b } = await mountTwo()
    db.faults = ['lose-update']
    let out
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g1', null) })
    expect(out).toEqual({ status: 'ok' })
    expect(db.tasks.find((r) => r.id === 'a')!.goal_task_id).toBe('g1')
    await waitFor(() => expect(task(b, 'a').goalTaskId).toBe('g1'))
    expect(task(a, 'a').goalTaskId).toBe('g1')
  })

  it('a relink after someone else moved it is refused, and their goal stays — here and in the database', async () => {
    const { a, b } = await mountTwo()
    db.tasks.find((r) => r.id === 's')!.goal_task_id = 'g3' // another client, meanwhile
    let out
    await act(async () => { out = await a.result.current.setGoalLink('s', 'g1', 'g2') })
    expect(out).toEqual({ status: 'conflict', currentGoalId: 'g3' })
    expect(db.tasks.find((r) => r.id === 's')!.goal_task_id).toBe('g3')
    await waitFor(() => expect(task(b, 's').goalTaskId).toBe('g3'))
  })

  it('a stale unlink does not clear a goal someone else set meanwhile', async () => {
    const { a } = await mountTwo()
    db.tasks.find((r) => r.id === 's')!.goal_task_id = 'g3'
    let out
    await act(async () => { out = await a.result.current.setGoalLink('s', null, 'g2') })
    expect(out).toEqual({ status: 'conflict', currentGoalId: 'g3' })
    expect(db.tasks.find((r) => r.id === 's')!.goal_task_id).toBe('g3')
  })

  it('a refused write read back unchanged is "failed", and the task is as it was', async () => {
    const { a } = await mountTwo()
    db.faults = ['fail-update']
    let out
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g1', null) })
    expect(out).toEqual({ status: 'failed' })
    expect(task(a, 'a').goalTaskId).toBeUndefined()
  })

  it('write and read-back both lost: unknown, and NO further link write until a fresh read succeeds', async () => {
    const { a } = await mountTwo()
    db.faults = ['lose-update', 'fail-read'] // the write LANDED; nobody could tell
    let out
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g1', null) })
    expect(out).toEqual({ status: 'unknown' })
    expect(db.updates).toHaveLength(1)
    // Retry while reads still fail: nothing is written.
    db.faults = ['fail-read']
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g2', null) })
    expect(out).toEqual({ status: 'unknown' })
    expect(db.updates).toHaveLength(1)
    // Reads work again: the retry recovers first — the row is under g1, which
    // is not what the retry expected (none), so it is a conflict, not an overwrite.
    await act(async () => { out = await a.result.current.setGoalLink('a', 'g2', null) })
    expect(out).toEqual({ status: 'conflict', currentGoalId: 'g1' })
    expect(db.updates).toHaveLength(1)
    expect(task(a, 'a').goalTaskId).toBe('g1')
  })

  it('the gate is shared: another instance cannot write that link either until it is read', async () => {
    const { a, b } = await mountTwo()
    db.faults = ['throw-update', 'fail-read']
    await act(async () => { await a.result.current.setGoalLink('a', 'g1', null) })
    db.faults = ['fail-read']
    let out
    await act(async () => { out = await b.result.current.setGoalLink('a', 'g1', null) })
    expect(out).toEqual({ status: 'unknown' })
    expect(db.updates).toHaveLength(1)
  })

  it('an unrelated edit made while the link was in flight survives in every instance', async () => {
    const { a, b } = await mountTwo()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const realThen = Query.prototype.then
    // Hold the link UPDATE until the notes edit has landed locally everywhere.
    const spy = vi.spyOn(Query.prototype, 'then').mockImplementation(function (this: Query, res, rej) {
      const self = this as unknown as { op: string; payload: Row | null }
      if (self.op === 'update' && self.payload && 'goal_task_id' in self.payload) {
        return gate.then(() => realThen.call(this, res, rej)) as never
      }
      return realThen.call(this, res, rej) as never
    })
    let linking!: Promise<unknown>
    act(() => { linking = a.result.current.setGoalLink('a', 'g1', null) })
    await act(async () => { await b.result.current.updateTask('a', { notes: 'Ask about cello AND violin' }) })
    await waitFor(() => expect(task(a, 'a').notes).toBe('Ask about cello AND violin'))
    release()
    await act(async () => { await linking })
    spy.mockRestore()
    for (const h of [a, b]) {
      expect(task(h, 'a').goalTaskId).toBe('g1')
      expect(task(h, 'a').notes).toBe('Ask about cello AND violin')
    }
  })
})
