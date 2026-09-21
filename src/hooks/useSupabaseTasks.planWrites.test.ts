import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'
import { localYmd } from '@/lib/cadence/config'
import type { Task } from '@/types/task'

// Planning writes must report what actually happened (guided planning, phase 1).
// The harness is the one in useSupabaseTasks.oneRow.test.ts, grown into a small
// fake database: the hook's queries run against in-memory tables, a table can be
// told to answer with a real `{ error }`, and a tasks INSERT/UPDATE that enters a
// period bucket runs the mirror trigger (tasks_mirror_to_commitments), which
// ensures that period's open commitment the way the database does.

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  showToast: vi.fn(),
}))

// ── The fake database ────────────────────────────────────────────────────────
type Row = Record<string, unknown>
type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete'
type DbError = { message: string; code?: string }
type Result = { data: unknown; error: DbError | null }

function createFakeDb() {
  const tables = new Map<string, Row[]>()
  const inserted = new Map<string, string[]>()
  const writes: Array<{ table: string; op: Op }> = []
  let failures: Map<string, { err: DbError; readsOk: boolean; writesOk: boolean }> = new Map()
  let once: Array<{ table: string; op: Op; err: DbError; land: boolean }> = []
  let when: Array<{ table: string; op: Op; pred: (row: Row) => boolean; err: DbError }> = []
  let insertFailures: Array<{ table: string; err: DbError }> = []
  let seq = 0

  const rows = (table: string): Row[] => {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table)!
  }

  /** tasks_mirror_to_commitments: a row entering a period bucket ensures its open commitment. */
  function mirror(next: Row, prev: Row | null) {
    const bucket = next.bucket as string
    if (!['week', 'month', 'quarter'].includes(bucket)) return
    const changed = !prev || (['bucket', 'week_start', 'month_start', 'season_start'] as const).some((k) => next[k] !== prev[k])
    if (!changed) return
    const level = bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : 'season'
    const start = (bucket === 'week' ? next.week_start : bucket === 'month' ? next.month_start : next.season_start) as string | null
    if (!start) return
    const cs = rows('task_commitments')
    const have = cs.find((c) => c.task_id === next.id && c.level === level && c.period_start === start)
    if (!have) cs.push({ id: `c${++seq}`, task_id: next.id, level, period_start: start, status: next.completed ? 'done' : 'open', carried_to: null, ended_at: null })
    else if (have.status === 'removed') Object.assign(have, { status: 'open', ended_at: null })
  }

  class Query implements PromiseLike<Result> {
    private op: Op = 'select'
    private payload: Row | null = null
    private conflict: string[] = []
    private filters: Array<(r: Row) => boolean> = []
    private returning = false
    private one: 'single' | 'maybe' | null = null
    constructor(private table: string) {}
    select() { if (this.op !== 'select') this.returning = true; return this }
    insert(d: Row) { this.op = 'insert'; this.payload = d; return this }
    update(d: Row) { this.op = 'update'; this.payload = d; return this }
    upsert(d: Row, opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = d; this.conflict = (opts?.onConflict ?? 'id').split(','); return this }
    delete() { this.op = 'delete'; return this }
    eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this }
    in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this }
    order() { return this }
    single() { this.one = 'single'; return this }
    maybeSingle() { this.one = 'maybe'; return this }
    then<A = Result, B = never>(res?: ((v: Result) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return Promise.resolve().then(() => this.run()).then(res, rej)
    }

    private run(): Result {
      const { table, op } = this
      const isWrite = op !== 'select'
      if (isWrite) writes.push({ table, op })
      const matched = rows(table).filter((r) => this.filters.every((f) => f(r)))

      const i = once.findIndex((f) => f.table === table && f.op === op)
      let landThenError: DbError | null = null
      if (i >= 0) {
        const f = once.splice(i, 1)[0]
        if (!f.land) return { data: null, error: f.err }
        landThenError = f.err
      }
      if (op === 'insert') {
        const j = insertFailures.findIndex((f) => f.table === table)
        if (j >= 0) return { data: null, error: insertFailures.splice(j, 1)[0].err }
      }
      const w = when.find((f) => f.table === table && f.op === op && (matched.some(f.pred) || (!!this.payload && f.pred(this.payload))))
      if (w) return { data: null, error: w.err }
      const standing = failures.get(table)
      if (standing && (isWrite ? !standing.writesOk : !standing.readsOk)) return { data: null, error: standing.err }

      let data: unknown = null
      if (op === 'select') data = matched.map((r) => ({ ...r }))
      else if (op === 'insert') {
        const row: Row = { ...this.payload, id: this.payload!.id ?? `new-${++seq}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        rows(table).push(row)
        if (!inserted.has(table)) inserted.set(table, [])
        inserted.get(table)!.push(row.id as string)
        if (table === 'tasks') mirror(row, null)
        data = [{ ...row }]
      } else if (op === 'update') {
        for (const r of matched) {
          const prev = { ...r }
          Object.assign(r, this.payload)
          if (table === 'tasks') mirror(r, prev)
        }
        data = this.returning ? matched.map((r) => ({ ...r })) : null
      } else if (op === 'upsert') {
        const p = this.payload!
        const have = rows(table).find((r) => this.conflict.every((k) => r[k] === p[k]))
        if (have) Object.assign(have, p)
        else rows(table).push({ id: `u${++seq}`, carried_to: null, ...p })
      } else if (op === 'delete') {
        tables.set(table, rows(table).filter((r) => !matched.includes(r)))
      }
      if (landThenError) return { data: null, error: landThenError }
      if (this.one) {
        const list = (data as Row[] | null) ?? []
        if (this.one === 'single' && list.length !== 1) return { data: null, error: { message: 'not one row', code: 'PGRST116' } }
        return { data: list[0] ?? null, error: null }
      }
      return { data, error: null }
    }
  }

  return {
    from: (table: string) => new Query(table),
    reset() {
      tables.clear(); inserted.clear(); writes.length = 0
      this.clearFailures()
    },
    seed(table: string, row: Row) { rows(table).push(row) },
    failOn(table: string, err: DbError, opts: { readsOk?: boolean; writesOk?: boolean } = {}) {
      failures.set(table, { err, readsOk: !!opts.readsOk, writesOk: !!opts.writesOk })
    },
    failOnce(table: string, op: Op, err: DbError) { once.push({ table, op, err, land: false }) },
    landButErrorOnce(table: string, op: Op, err: DbError) { once.push({ table, op, err, land: true }) },
    failWhen(table: string, op: Op, pred: (row: Row) => boolean, err: DbError) { when.push({ table, op, pred, err }) },
    /** The next INSERT into `table` fails with `err`; `existing` is a row already stored under that id. */
    failInsertWith(table: string, err: DbError, opts: { existing?: Row } = {}) {
      insertFailures.push({ table, err })
      if (opts.existing) {
        const have = rows(table).find((r) => r.id === opts.existing!.id)
        if (have) Object.assign(have, opts.existing)
        else rows(table).push({ ...dbTaskRow(), ...opts.existing })
      }
    },
    clearFailures() { failures = new Map(); once = []; when = []; insertFailures = [] },
    rows: (table: string) => rows(table),
    insertedIds: (table: string) => inserted.get(table) ?? [],
    writeCount: (table: string, op?: Op) => writes.filter((w) => w.table === table && (!op || w.op === op)).length,
  }
}

const db = createFakeDb()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: (table: string) => db.from(table),
  },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────
const sep = new Date(2026, 8, 1)
const oct = new Date(2026, 9, 1)

function dbTaskRow(over: Row = {}): Row {
  return {
    id: 'x', user_id: 'test-user-id', title: 'T', completed: false, bucket: 'inbox',
    week_start: null, month_start: null, season_start: null, scheduled_for: null, is_all_day: false,
    is_goal: false, goal_task_id: null, parent_task_id: null, context: null, scope: 'individual',
    created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-02T10:00:00Z',
    ...over,
  }
}

function monthTask(id: string, start: Date): Task {
  return {
    id, title: `Task ${id}`, completed: false, createdAt: new Date(2026, 8, 2), updatedAt: new Date(2026, 8, 2),
    bucket: 'month', monthStart: start, commitments: [{ level: 'month', periodStart: start, status: 'open' }], focus: [],
  } as Task
}

/** Store the tasks (and their commitment/focus records) in the fake DB, then mount the hook on them. */
async function mountWith(tasks: Task[]) {
  for (const t of tasks) {
    db.seed('tasks', dbTaskRow({
      id: t.id, title: t.title, completed: t.completed, bucket: t.bucket,
      month_start: t.monthStart ? localYmd(t.monthStart) : null,
      week_start: t.weekStart ? localYmd(t.weekStart) : null,
      season_start: t.seasonStart ? localYmd(t.seasonStart) : null,
      is_goal: t.isGoal === true, goal_task_id: t.goalTaskId ?? null,
    }))
    for (const c of t.commitments ?? []) {
      db.seed('task_commitments', { id: `seed-${t.id}-${c.level}-${localYmd(c.periodStart)}`, task_id: t.id, level: c.level, period_start: localYmd(c.periodStart), status: c.status, carried_to: c.carriedTo ? localYmd(c.carriedTo) : null, ended_at: null })
    }
    for (const f of t.focus ?? []) db.seed('task_focus', { task_id: t.id, user_id: f.userId, date: localYmd(f.date) })
  }
  const hook = renderHook(() => useSupabaseTasks())
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.tasks).toHaveLength(tasks.length)
  })
  return hook
}

beforeEach(() => {
  __resetTasksCache()
  db.reset()
  // The hook logs every failed write; these tests fail writes on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => { vi.restoreAllMocks() })

describe('planning writes report real outcomes', () => {
  it('updateTask returns false when the row wrote but its commitment write errored', async () => {
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })
    const { result } = await mountWith([monthTask('t1', sep)])
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.updateTask('t1', { bucket: 'month', monthStart: oct }) })
    expect(ok).toBe(false)
  })

  it('keepForward returns undefined when carrying the commitment errored', async () => {
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })
    const { result } = await mountWith([monthTask('t1', sep)])
    let kept: string | undefined = 'x'
    await act(async () => { kept = await result.current.keepForward('t1', { monthStart: oct }) })
    expect(kept).toBeUndefined()
  })

  it('addTask with a given id creates exactly one row, and a retry returns the same id without a second insert', async () => {
    const { result } = await mountWith([])
    const id = '11111111-1111-4111-8111-111111111111'
    let a: string | undefined, b: string | undefined
    await act(async () => { a = await result.current.addTask('Three bids', undefined, undefined, undefined, { bucket: 'month', monthStart: oct, isGoal: true, id }) })
    db.failInsertWith('tasks', { message: 'duplicate key value violates unique constraint "tasks_pkey"', code: '23505' }, { existing: { id } })
    await act(async () => { b = await result.current.addTask('Three bids', undefined, undefined, undefined, { bucket: 'month', monthStart: oct, isGoal: true, id }) })
    expect(a).toBe(id)
    expect(b).toBe(id)
    expect(db.rows('tasks').filter((r) => r.id === id)).toHaveLength(1)
    expect(db.insertedIds('tasks')[0]).toBe(id)
  })

  it('after a failed Drop the local commitment is the database\'s again, and a retry really removes it', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])               // one OPEN September commitment in the fake DB
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })
    let first: boolean | undefined
    await act(async () => { first = await result.current.dropCommitment('t1', 'month', sep) })
    expect(first).toBe(false)
    expect(result.current.tasks.find((t) => t.id === 't1')!.commitments!.find((c) => c.level === 'month')!.status).toBe('open')
    db.clearFailures()
    let second: boolean | undefined
    await act(async () => { second = await result.current.dropCommitment('t1', 'month', sep) })
    expect(second).toBe(true)
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.level === 'month')!.status).toBe('removed')
  })

  it('a failed Keep leaves nothing marked carried locally, so a retry carries for real', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })
    await act(async () => { await result.current.keepForward('t1', { monthStart: oct }) })
    expect(result.current.tasks.find((t) => t.id === 't1')!.commitments!.some((c) => c.status === 'carried')).toBe(false)
    db.clearFailures()
    let kept: string | undefined
    await act(async () => { kept = await result.current.keepForward('t1', { monthStart: oct }) })
    expect(kept).toBe('t1')
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.period_start === '2026-09-01')!.status).toBe('carried')
  })

  it('a half-failed Keep (carry failed, destination opened by the trigger) retries against SEPTEMBER, not October', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    // The harness applies the mirror trigger: a tasks UPDATE with month_start ensures that month's open commitment.
    db.failOnce('task_commitments', 'update', { message: 'boom', code: 'XX000' })   // the carry (an UPDATE) fails; the ensure (an upsert) succeeds
    let first: string | undefined = 'x'
    await act(async () => { first = await result.current.keepForward('t1', { monthStart: oct }, sep) })
    expect(first).toBeUndefined()
    const after = db.rows('task_commitments').filter((c) => c.task_id === 't1')
    expect(after.map((c) => `${c.period_start}:${c.status}`).sort()).toEqual(['2026-09-01:open', '2026-10-01:open'])
    let second: string | undefined
    await act(async () => { second = await result.current.keepForward('t1', { monthStart: oct }, sep) })
    expect(second).toBe('t1')
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.period_start === '2026-09-01')!.status).toBe('carried')
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.period_start === '2026-10-01')!.status).toBe('open')
  })

  it('write fails AND the re-read fails: local state reverts, retries are refused unsent, then recover once reads work', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })            // writes AND reads of task_commitments fail
    let r1: boolean | undefined
    await act(async () => { r1 = await result.current.dropCommitment('t1', 'month', sep) })
    expect(r1).toBe(false)
    const local = result.current.tasks.find((t) => t.id === 't1')!
    expect(local.commitments!.find((c) => c.level === 'month')!.status).toBe('open')   // the pre-write snapshot, not the optimistic "removed"
    const writesBefore = db.writeCount('task_commitments')
    let r2: boolean | undefined
    await act(async () => { r2 = await result.current.dropCommitment('t1', 'month', sep) })
    expect(r2).toBe(false)
    expect(db.writeCount('task_commitments')).toBe(writesBefore)               // refused before sending anything
    db.clearFailures()
    let r3: boolean | undefined
    await act(async () => { r3 = await result.current.dropCommitment('t1', 'month', sep) })
    expect(r3).toBe(true)
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.level === 'month')!.status).toBe('removed')
  })

  it('recovery plans from what the DATABASE holds, not the restored snapshot', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    // The carry actually LANDED but its response errored, and the re-read failed too:
    // the DB now says Sep=carried, Oct=open, while the local snapshot still says Sep=open.
    db.landButErrorOnce('task_commitments', 'update', { message: 'timeout', code: 'XX000' })
    db.failOn('task_commitments', { message: 'offline', code: 'XX000' }, { writesOk: true })   // reads fail
    await act(async () => { await result.current.keepForward('t1', { monthStart: oct }, sep) })
    expect(result.current.tasks.find((t) => t.id === 't1')!.commitments!.find((c) => localYmd(c.periodStart) === '2026-09-01')!.status).toBe('open')
    db.clearFailures()
    const updatesBefore = db.writeCount('task_commitments', 'update')
    let kept: string | undefined
    await act(async () => { kept = await result.current.keepForward('t1', { monthStart: oct }, sep) })
    expect(kept).toBe('t1')
    expect(db.writeCount('task_commitments', 'update')).toBe(updatesBefore)     // no second carry was sent: it planned from the DB
    expect(result.current.tasks.find((t) => t.id === 't1')!.commitments!.find((c) => localYmd(c.periodStart) === '2026-09-01')!.status).toBe('carried')
  })

  it('Keep on a goal fails if any step fails to carry, and a retry carries only that step', async () => {
    const goal = { ...monthTask('g1', sep), isGoal: true }
    const s1 = { ...monthTask('s1', sep), goalTaskId: 'g1' }
    const s2 = { ...monthTask('s2', sep), goalTaskId: 'g1' }
    const { result } = await mountWith([goal, s1, s2])
    db.failWhen('task_commitments', 'update', (row) => row.task_id === 's2', { message: 'boom', code: 'XX000' })
    let first: string | undefined = 'x'
    await act(async () => { first = await result.current.keepForward('g1', { monthStart: oct }, sep) })
    expect(first).toBeUndefined()
    expect(db.rows('task_commitments').find((c) => c.task_id === 'g1' && c.period_start === '2026-09-01')!.status).toBe('carried')
    expect(db.rows('task_commitments').find((c) => c.task_id === 's1' && c.period_start === '2026-09-01')!.status).toBe('carried')
    db.clearFailures()
    const carriesBefore = db.writeCount('task_commitments', 'update')
    let second: string | undefined
    await act(async () => { second = await result.current.keepForward('g1', { monthStart: oct }, sep) })
    expect(second).toBe('g1')
    expect(db.rows('task_commitments').find((c) => c.task_id === 's2' && c.period_start === '2026-09-01')!.status).toBe('carried')
    expect(db.writeCount('task_commitments', 'update')).toBe(carriesBefore + 1)   // only s2's carry was sent
  })

  it('Keep on a goal carries a LEGACY step (September monthStart, no commitment rows) too', async () => {
    const goal = { ...monthTask('g1', sep), isGoal: true }
    const legacyStep = { ...monthTask('s1', sep), goalTaskId: 'g1', commitments: [] }   // bucket 'month', monthStart Sep, no records
    const { result } = await mountWith([goal, legacyStep])
    let kept: string | undefined
    await act(async () => { kept = await result.current.keepForward('g1', { monthStart: oct }, sep) })
    expect(kept).toBe('g1')
    const s1 = db.rows('task_commitments').filter((c) => c.task_id === 's1')
    expect(s1.find((c) => c.period_start === '2026-10-01')?.status).toBe('open')
    expect(result.current.tasks.find((t) => t.id === 's1')!.monthStart!.getMonth()).toBe(9)
  })

  it('a failed focus read keeps the task\'s focus instead of emptying it', async () => {
    const t = { ...monthTask('t1', sep), focus: [{ userId: 'u1', date: new Date(2026, 8, 3) }] }
    const { result } = await mountWith([t])
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' }, { readsOk: true })   // commitment WRITE fails, its read works
    db.failOn('task_focus', { message: 'offline', code: 'XX000' }, { writesOk: true })     // focus READ fails
    await act(async () => { await result.current.dropCommitment('t1', 'month', sep) })
    expect(result.current.tasks.find((x) => x.id === 't1')!.focus).toHaveLength(1)
  })

  it('a retried create that finds its row already there keeps the task visible', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const { result } = await mountWith([])
    await act(async () => { await result.current.addTask('Three bids', undefined, undefined, undefined, { bucket: 'month', monthStart: oct, isGoal: true, id }) })
    db.failInsertWith('tasks', { message: 'dup', code: '23505' }, { existing: { id, title: 'Three bids', bucket: 'month', is_goal: true } })
    await act(async () => { await result.current.addTask('Three bids', undefined, undefined, undefined, { bucket: 'month', monthStart: oct, isGoal: true, id }) })
    expect(result.current.tasks.filter((t) => t.id === id)).toHaveLength(1)
  })

  it('addTask still fails for a unique violation when no id was given', async () => {
    db.failInsertWith('tasks', { message: 'dup', code: '23505' })
    const { result } = await mountWith([])
    let a: string | undefined = 'x'
    await act(async () => { a = await result.current.addTask('X') })
    expect(a).toBeUndefined()
  })
})
