import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'
import { localYmd } from '@/lib/cadence/config'
import type { Task } from '@/types/task'
import { applySession, type SessionWriters } from '@/lib/planning/applySession'
import { emptyDraft, lookBackRows, summarize, type SessionDraft } from '@/lib/planning/session'

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

  /**
   * tasks_sync_from_commitments (task_commitments_after_change fires it after
   * EVERY commitment change): the row's bucket and stamps are re-derived from
   * its open commitments; with none, inbox/someday stay and anything else
   * falls back to 'inbox'. Approximation: a dated row's week is not
   * recomputed from its day.
   */
  function syncFromCommitments(taskId: string) {
    const task = rows('tasks').find((r) => r.id === taskId)
    if (!task) return
    const open = rows('task_commitments').filter((c) => c.task_id === taskId && c.status === 'open')
    const latest = (level: string) => open.filter((c) => c.level === level).map((c) => c.period_start as string).sort().at(-1) ?? null
    const week = latest('week'), month = latest('month'), season = latest('season')
    const bucket = task.scheduled_for ? 'timed' : week ? 'week' : month ? 'month' : season ? 'quarter'
      : (task.bucket === 'inbox' || task.bucket === 'someday') ? task.bucket : 'inbox'
    Object.assign(task, { bucket, week_start: week, month_start: month, season_start: season })
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
      if (table === 'task_commitments' && isWrite) {
        const ids = new Set([...matched.map((r) => r.task_id as string), ...(this.payload?.task_id ? [this.payload.task_id as string] : [])])
        for (const id of ids) syncFromCommitments(id)
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

  it('after a failed updateTask move the local commitments are the database\'s, and a retry of the same move really writes', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    db.failOnce('task_commitments', 'update', { message: 'boom', code: 'XX000' })   // removing September fails; ensuring October lands
    let first: boolean | undefined
    await act(async () => { first = await result.current.updateTask('t1', { bucket: 'month', monthStart: oct }) })
    expect(first).toBe(false)
    const fromDb = db.rows('task_commitments').filter((c) => c.task_id === 't1').map((c) => `${c.period_start}:${c.status}`).sort()
    expect(fromDb).toEqual(['2026-09-01:open', '2026-10-01:open'])
    const local = result.current.tasks.find((t) => t.id === 't1')!.commitments!.map((c) => `${localYmd(c.periodStart)}:${c.status}`).sort()
    expect(local).toEqual(fromDb)
    const updatesBefore = db.writeCount('task_commitments', 'update')
    let second: boolean | undefined
    await act(async () => { second = await result.current.updateTask('t1', { bucket: 'month', monthStart: oct }) })
    expect(second).toBe(true)
    expect(db.writeCount('task_commitments', 'update')).toBe(updatesBefore + 1)
    expect(db.rows('task_commitments').find((c) => c.task_id === 't1' && c.period_start === '2026-09-01')!.status).toBe('removed')
  })

  it('keepForward returns undefined when carrying the commitment errored', async () => {
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })
    const { result } = await mountWith([monthTask('t1', sep)])
    let kept: string | undefined = 'x'
    await act(async () => { kept = await result.current.keepForward('t1', { monthStart: oct }) })
    expect(kept).toBeUndefined()
  })

  it('keepForward carries a task from last week into this week: last week carried, this week open, month untouched', async () => {
    const last = new Date(2026, 8, 27), week = new Date(2026, 9, 4), month = new Date(2026, 9, 1)
    db.seed('tasks', dbTaskRow({ id: 't1', title: 'Plumber', bucket: 'week', week_start: localYmd(last), month_start: localYmd(month), completed: false }))
    db.seed('task_commitments', { id: 'c1', task_id: 't1', level: 'week', period_start: localYmd(last), status: 'open', carried_to: null, ended_at: null })
    db.seed('task_commitments', { id: 'c2', task_id: 't1', level: 'month', period_start: localYmd(month), status: 'open', carried_to: null, ended_at: null })
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let id: string | undefined
    await act(async () => { id = await result.current.keepForward('t1', { weekStart: week }, last) })
    expect(id).toBe('t1')
    const cs = db.rows('task_commitments').filter((c) => c.task_id === 't1')
    expect(cs.find((c) => c.level === 'week' && c.period_start === localYmd(last))).toMatchObject({ status: 'carried', carried_to: localYmd(week) })
    expect(cs.find((c) => c.level === 'week' && c.period_start === localYmd(week))).toMatchObject({ status: 'open' })
    expect(cs.find((c) => c.level === 'month')).toMatchObject({ status: 'open' })
    expect(db.rows('tasks').find((r) => r.id === 't1')).toMatchObject({ bucket: 'week', week_start: localYmd(week) })
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

// The session's Done must do everything a tick does (final review I7).
describe('completeTask', () => {
  it('completes the task and its open subtasks, clears waiting/discussion, and reports that it wrote', async () => {
    db.seed('tasks', dbTaskRow({ id: 't1', title: 'Errand', bucket: 'month', month_start: '2026-09-01', is_waiting: true, needs_discussion: true }))
    db.seed('tasks', dbTaskRow({ id: 'sub1', title: 'Step', parent_task_id: 't1' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks.find((x) => x.id === 't1')?.isWaiting).toBe(true))
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.completeTask('t1') })
    expect(ok).toBe(true)
    const row = db.rows('tasks').find((r) => r.id === 't1')!
    expect(row.completed).toBe(true)
    expect(row.completed_at).toEqual(expect.any(String))
    expect(row.is_waiting).toBe(false)
    expect(row.needs_discussion).toBe(false)
    expect(db.rows('tasks').find((r) => r.id === 'sub1')!.completed).toBe(true)
    const local = result.current.tasks.find((x) => x.id === 't1')!
    expect(local.completed).toBe(true)
    expect(local.subtasks?.every((st) => st.completed)).toBe(true)
  })

  it('returns false when the write failed, and the task stays open', async () => {
    const { result } = await mountWith([monthTask('t1', sep)])
    db.failOnce('tasks', 'update', { message: 'boom', code: 'XX000' })
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.completeTask('t1') })
    expect(ok).toBe(false)
    expect(result.current.tasks.find((x) => x.id === 't1')!.completed).toBe(false)
  })
})

// Two instances of the hook (Today and the month page, say) share ONE record of
// which tasks could not be re-read: a write refused in one is refused in the
// other until a re-read succeeds (final review M9).
describe('unreconciled tasks are shared across hook instances', () => {
  it('a task left unreconciled by one instance is not written from another instance\'s local state', async () => {
    const a = await mountWith([monthTask('t1', sep)])
    const b = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(b.result.current.tasks).toHaveLength(1))
    db.failOn('task_commitments', { message: 'boom', code: 'XX000' })            // writes AND reads fail
    await act(async () => { await a.result.current.dropCommitment('t1', 'month', sep) })
    const writesBefore = db.writeCount('task_commitments')
    let r: boolean | undefined
    await act(async () => { r = await b.result.current.dropCommitment('t1', 'month', sep) })
    expect(r).toBe(false)
    expect(db.writeCount('task_commitments')).toBe(writesBefore)
    db.clearFailures()
    await act(async () => { r = await b.result.current.dropCommitment('t1', 'month', sep) })
    expect(r).toBe(true)
  })
})

// A goal's Keep carries its open steps; a step's own verdict must hold, in
// either click order, and the summary must say what was written (final review I1).
describe('a planning session against the real writers', () => {
  const goal = () => ({ ...monthTask('g1', sep), title: 'Porch', isGoal: true })
  const step = (id: string, title: string) => ({ ...monthTask(id, sep), title, goalTaskId: 'g1' })

  async function run(hook: { current: ReturnType<typeof useSupabaseTasks> }, d: SessionDraft) {
    const h = () => hook.current
    const w: SessionWriters = {
      keep: async (id, monthStart, prevStart) => !!(await h().keepForward(id, { monthStart }, prevStart)),
      addTask: (title, o) => h().addTask(title, undefined, undefined, undefined, { id: o.id, bucket: 'month', monthStart: o.monthStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context }),
      contextOf: () => null,
      complete: (id) => h().completeTask(id),
      someday: (id) => h().updateTask(id, { bucket: 'someday' }),
      drop: (id, prevStart) => h().dropCommitment(id, 'month', prevStart),
      takeIntoMonth: (id, monthStart) => h().updateTask(id, { bucket: 'month', monthStart }),
      saveSession: async () => true,
    }
    let ok = false
    await act(async () => { ok = (await applySession(d, w, (id) => !!h().tasks.find((t) => t.id === id)?.completed)).ok })
    return ok
  }
  const status = (id: string, ymd: string) => db.rows('task_commitments').find((c) => c.task_id === id && c.period_start === ymd)?.status

  for (const order of ['goal first', 'step first'] as const) {
    it(`goal Keep + step Drop (${order}): the step stays dropped, its sibling is carried, and the summary said so`, async () => {
      const { result } = await mountWith([goal(), step('s1', 'Buy chairs'), step('s2', 'Paint')])
      const verdicts: SessionDraft['verdicts'] = order === 'goal first' ? { g1: 'keep', s1: 'drop' } : { s1: 'drop', g1: 'keep' }
      const d: SessionDraft = { ...emptyDraft('month', oct, sep), verdicts }
      const lines = summarize(d, { open: lookBackRows(result.current.tasks, sep, null).open, above: [], aboveGoals: [], periodLabel: 'October', prevLabel: 'September' })
      expect(await run(result, d)).toBe(true)
      expect(lines.find((l) => l.title === 'Buy chairs')!.destination).toBe('Dropped from September · the task is kept')
      expect(status('s1', '2026-09-01')).toBe('removed')
      expect(status('s1', '2026-10-01')).toBeUndefined()
      expect(lines.find((l) => l.title === 'Paint')!.destination).toBe('October tasks · carried with Porch')
      expect(status('s2', '2026-09-01')).toBe('carried')
      expect(status('s2', '2026-10-01')).toBe('open')
    })
  }

  it('a step marked Done or Someday under a kept goal is not carried', async () => {
    const { result } = await mountWith([goal(), step('s1', 'Buy chairs'), step('s2', 'Paint')])
    expect(await run(result, { ...emptyDraft('month', oct, sep), verdicts: { g1: 'keep', s1: 'done', s2: 'someday' } })).toBe(true)
    expect(status('s1', '2026-10-01')).toBeUndefined()
    expect(status('s2', '2026-10-01')).toBeUndefined()
    expect(db.rows('tasks').find((r) => r.id === 's1')!.completed).toBe(true)
  })
})

// Live finding (demo account): Someday on a row with TWO open commitments ended
// as bucket 'inbox'. Each remove fires the sync trigger; after the first the
// other is still open (bucket → 'month'), after the second 'month' is not a
// state it keeps, so it falls back to 'inbox'. The client re-asserts the plan's
// let-go row once the removals are done.
describe('letting go of a row with several open commitments', () => {
  it('Someday on a task with season + month open leaves bucket someday and both commitments removed', async () => {
    const fall = new Date(2026, 8, 1)
    const t = { ...monthTask('t1', oct), seasonStart: fall, commitments: [
      { level: 'season' as const, periodStart: fall, status: 'open' as const },
      { level: 'month' as const, periodStart: oct, status: 'open' as const },
    ] }
    const { result } = await mountWith([t])
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.updateTask('t1', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }) })
    expect(ok).toBe(true)
    const row = db.rows('tasks').find((r) => r.id === 't1')!
    expect(row.bucket).toBe('someday')
    expect([row.week_start, row.month_start, row.season_start]).toEqual([null, null, null])
    expect(db.rows('task_commitments').filter((c) => c.task_id === 't1').map((c) => c.status)).toEqual(['removed', 'removed'])
  })

  it('a failed re-assert is a failed write', async () => {
    const fall = new Date(2026, 8, 1)
    const t = { ...monthTask('t1', oct), seasonStart: fall, commitments: [
      { level: 'season' as const, periodStart: fall, status: 'open' as const },
      { level: 'month' as const, periodStart: oct, status: 'open' as const },
    ] }
    const { result } = await mountWith([t])
    // The row write succeeds; the re-assert (the only UPDATE with bucket someday after the removals) fails.
    let n = 0
    db.failWhen('tasks', 'update', (r) => r.bucket === 'someday' && ++n > 1, { message: 'boom', code: 'XX000' })
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.updateTask('t1', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }) })
    expect(ok).toBe(false)
  })
})

