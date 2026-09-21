# Guided Planning Phase 1: Month Planning Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Plan <Month>" session on the existing Month page: look back at the previous month (reflection plus a verdict per open item), plan this month's goals and tasks with the season beside you, then save everything at once and return to the month page marked "Planned <date>".

**Architecture:** The session logic is pure and tested: draft, look-back selection, summary, and an executor that takes injected writers. A small component renders the three steps, and `PeriodPlanPage` hosts it for `level === 'month'`. Writes reuse the existing funnels (`keepForward`, `addTask`, `pushTask`, `toggleTask`, gated `updateTask`). One new funnel ends a single period commitment ("Drop"). A saved session is one `planning_sessions` row (horizon `monthly`, token `YYYY-M`), and household members can read it under the existing RLS.

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind v4, Supabase JS, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (Phase 1). Background: `docs/superpowers/specs/2026-09-21-core-journeys-design.md`. Prototype: `~/Documents/scotts-world/projects/symphony-os/briefs/2026-09-21-planning-prototype-v4.html`.

## Global Constraints

- Work in a NEW worktree on a freshly fetched `origin/main`, branch `claude/guided-planning-month`. Never edit the main worktree.
- Node: `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH`. Run tests with `npx vitest run <path>`; `npm test` is watch mode. Typecheck with `npx tsc --noEmit -p tsconfig.app.json`; the root tsc is a no-op.
- Import from `src/` with `@/`. Follow the Nordic Journal styling in `src/index.css`, and reuse classes and components already used on `PeriodPlanPage`.
- **Nothing is written before Save.** Close keeps a local draft.
- **No counts or scores** in any new copy.
- **Drop ends only that period's commitment.** It never deletes the task.
- **"Keep, and add a next action"** keeps the goal and creates one new task under it (`goalTaskId`). The goal is never converted.
- Goals are never scheduled. The session offers no day or week verbs.
- Copy under the reflection boxes: "Visible to your household." (`planning_sessions` SELECT is household-shared.)
- Routines are unchanged.
- Never partially `upsert` `tasks` (memory rule). Every task write goes through the hook functions named here.
- No new migration in this phase. `planning_sessions` already exists: columns `author_id, horizon ('monthly'), period_token, notes jsonb`, UNIQUE `(author_id, horizon, period_token)`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/placement/intentions.ts` (modify) | `planDropCommitment()`: a pure plan that removes one commitment |
| `src/hooks/useSupabaseTasks.ts` (modify) | Commitment/focus failures propagate (`writePlacementOps` → boolean); `addTask({ id })` is idempotent; `dropCommitment(id, level, periodStart)` executes that plan |
| `src/lib/planning/session.ts` (new) | Session types, look-back selection, verdict options, summary lines |
| `src/lib/planning/sessionDraft.ts` (new) | Per-user and per-period draft in localStorage (a per-viewer convenience) |
| `src/lib/planning/applySession.ts` (new) | Executes a saved draft through injected writers, in a fixed order |
| `src/hooks/usePlanningSession.ts` (new) | Reads a period's saved session (any household member) and saves ours |
| `src/components/plan/PlanSession.tsx` (new) | The three-step session UI |
| `src/components/plan/PeriodPlanPage.tsx` (modify) | Plan button, "Planned <date>" status, hosts the session, the "Plan the week" line |

---

### Task 0: Writes report what actually happened

Review finding: `updateTask` already returns `false` when the **row** write fails (since #47), but `writePlacementOps` only toasts on a failed `task_commitments` / `task_focus` write. So Keep, Drop, Someday and a month move can report success when the commitment never changed. Separately, `addTask` always inserts a fresh row, so a retried create duplicates.

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts`: `writePlacementOps` (~line 1293), `keepForward` (~1359), `updateTask` (~1396, its final `return`), `addTask` (~752, the insert and error branch), `AddTaskOptions` (~700)
- Test: `src/hooks/useSupabaseTasks.planWrites.test.ts` (new). Copy the Supabase mock harness from `src/hooks/useSupabaseTasks.oneRow.test.ts` (read it first) and extend it so a given table can return `{ error: { message, code } }`.

**Interfaces:**
- Produces: `writePlacementOps(taskId, plan): Promise<boolean>`, true only when every op wrote
- Produces: `updateTask(...)` returns `rowWritten && opsWritten`
- Produces: `keepForward(id, period, from?: Date)` returns `undefined` when any op failed, even if the row wrote. **`from` names the period being carried FROM** and is passed straight to `planKeep(t, level, to, from)`. Without it `planKeep` picks the *latest* open commitment. After a half-failed Keep, that is the destination month (the mirror trigger opened it), so a retry would "carry" October and leave September open (review 2026-09-21). The session always passes `from`.
- Produces: `AddTaskOptions.id?: string`. When given, the insert uses that id. A unique-violation (`code === '23505'`) on that id reads the **whole** row back. If it exists (visible under RLS), the local list gets that row (replacing the placeholder, or added if missing), and the call returns the id as success without a second row. **Idempotent create, and the task stays visible.**
- Produces: `reconcileCommitments(taskId): Promise<Task | null>` (internal to the hook). It returns the **reconciled task itself**, or `null` when the commitments could not be read. It also writes that task into `tasksRef.current` synchronously, so the next `findTaskById` sees it without waiting for React's render (review 2026-09-21: `setTasks` alone lands a render later, and the retry would plan from the old snapshot). After any failed commitment/focus write, it re-reads that task's `task_commitments` and `task_focus` rows and replaces the local task's `commitments`/`focus` (and derived cache) with what the database holds. The optimistic state never outlives a failed write, so a retry plans from the truth. **(Review 2026-09-21: Drop marked the commitment removed locally; a retry saw nothing open and "succeeded" without touching the DB.)**
- Produces: **the unreconciled guard.** If the write fails AND the re-read fails, the task is put back to its pre-write snapshot (`before`) and its id joins `unreconciledRef` (a `Set<string>`). Any later placement write for that task (`updateTask` with placement keys, `keepForward`, `dropCommitment`) first calls `reconcileCommitments(id)`. If that read fails again, the write is refused with `false` and nothing is sent. Optimistic state is never the basis of a retry. A focus read that fails keeps the task's existing `focus`; it is never replaced with `[]`.

- [ ] **Step 1: Write the failing tests** (real error responses from the mocked client, not mocked hook returns)

```ts
// src/hooks/useSupabaseTasks.planWrites.test.ts — harness copied from useSupabaseTasks.oneRow.test.ts
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
```

The helper names (`mountWith`, `monthTask`, `db.failOn(table, err, { readsOk?, writesOk? })`, `db.failOnce(table, 'update' | 'upsert' | 'select', err)`, `db.failWhen(table, op, predicate, err)`, `db.landButErrorOnce(table, op, err)` (applies the write, then returns the error), `db.failInsertWith`, `db.clearFailures`, `db.rows`, `db.insertedIds`, `db.writeCount(table, op?)`) belong to this test file. The fake DB must model the **mirror trigger**: an `UPDATE tasks` that sets `bucket='month'` and `month_start` upserts an open `task_commitments` row for that month. It must also model the carry as an `UPDATE` and the ensure as an `upsert`, as `writePlacementOps` does. Without both, the half-failed-Keep test can't reproduce the bug. Build them on top of the copied harness, and keep them in this file.

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts`
Expected: every test FAILS except "addTask still fails for a unique violation when no id was given", which passes already. Also expect `dropCommitment` to be missing until Task 1. Write Task 1's funnel first if you run Task 0 on its own, or run the two tasks together.

- [ ] **Step 3: Implement**
  - `writePlacementOps(taskId, plan, before?: Task)`: track `let allOk = true`, and set it to `false` wherever an `error` is found (both loops, keeping the existing toasts). At the end:

```ts
    if (!allOk) {
      const read = await reconcileCommitments(taskId)
      if (!read) {
        // Unknown ≠ optimistic: go back to what we had before this write, and
        // make every later placement write re-read before it may send.
        if (before) setTasks((prev) => prev.map((x) => (x.id === taskId ? before : x)))
        unreconciledRef.current.add(taskId)
      }
    }
    return allOk
```

   Change its type to `Promise<boolean>`. Every caller passes its pre-write snapshot as `before`: `updateTask` passes `task`, `keepOne` passes `before`, and `dropCommitment` passes `before`.
  - `const unreconciledRef = useRef(new Set<string>())`, plus a guard used at the top of `keepForward`'s `keepOne`, `dropCommitment`, and `updateTask` when `isPlacementWrite(updates)`:

```ts
  /** A task whose last write failed and could not be re-read may not be written
   *  from local state. Returns the task to plan from: the RECONCILED one when a
   *  re-read was needed, the current one otherwise, or null = refuse the write. */
  const ensureReconciled = useCallback(async (taskId: string): Promise<Task | null> => {
    if (!unreconciledRef.current.has(taskId)) return findTaskById(taskId) ?? null
    const fresh = await reconcileCommitments(taskId)
    if (!fresh) {
      showToast("Couldn't check this task's plan. Try again in a moment.", 'error', 4000)
      return null
    }
    unreconciledRef.current.delete(taskId)
    return fresh
  }, [reconcileCommitments, findTaskById])
```

   Callers **plan from the returned task**: `const t = await ensureReconciled(id); if (!t) return false`. They never plan from a separate lookup made after the await.
  - `reconcileCommitments` (new, defined above `writePlacementOps`):

```ts
  /** After a failed commitment/focus write: the database is the truth again.
   *  Returns the reconciled task (null = could not read), and updates tasksRef
   *  synchronously so a retry in the same tick plans from it. */
  const reconcileCommitments = useCallback(async (taskId: string): Promise<Task | null> => {
    const [{ data: cs, error: ce }, { data: fs, error: fe }] = await Promise.all([
      supabase.from('task_commitments').select('*').eq('task_id', taskId),
      supabase.from('task_focus').select('*').eq('task_id', taskId),
    ])
    if (ce || !cs) return null   // unread: the caller reverts to its snapshot and blocks retries
    const commitments = (cs as DbTaskCommitment[]).map(dbCommitmentToCommitment)
    // A focus read that failed keeps what we had; it is never "no focus".
    const focus = !fe && fs ? fs.map((f: { user_id: string; date: string }) => ({ userId: f.user_id, date: parseLocalYmd(f.date) })) : undefined
    const base = tasksRef.current.find((t) => t.id === taskId)
    if (!base) return null
    const merged = { ...base, commitments, ...(focus ? { focus } : {}) }
    const reconciled: Task = { ...merged, ...deriveCache(merged) }
    tasksRef.current = tasksRef.current.map((t) => (t.id === taskId ? reconciled : t))   // visible NOW
    setTasks((prev) => prev.map((t) => (t.id === taskId ? reconciled : t)))              // and after the render
    return reconciled
  }, [])
```

   (`dbCommitmentToCommitment`, `DbTaskCommitment` and `deriveCache` already exist in or near this file. Check how the fetch path at line ~436 maps `task_focus` rows, and reuse that mapper if there is one instead of the inline map. Add `reconcileCommitments` to `writePlacementOps`'s dependency list.)
  - `updateTask`: declare **once**, before the `if (updateError)` branch, `let opsOk = true`. Inside the success branch, **assign** (no `const`/`let`, which would shadow it): `if (plan.commitmentOps.length || plan.focusOps.length) opsOk = await writePlacementOps(id, plan, task)`. This replaces the existing bare `await writePlacementOps(id, plan)` line. The final line becomes `return !updateError && !!data && data.length > 0 && opsOk`.
  - `keepForward(id, period, from?: Date)`: thread `from` into `keepOne` → `planKeep(t, level, to, from)`. The page's existing past-period Keep in `act` passes `bounds.start` as `from`. Inside `keepOne(taskId)`: `const t = await ensureReconciled(taskId); if (!t) return false`, then plan from `t`, and `if (!(await writePlacementOps(t.id, plan, before))) return false` before `announceLocalWrite`.
  - **A goal's steps count** (review 2026-09-21: the loop ignored `keepOne(step)`'s result and returned the goal id as success). Replace the tail of `keepForward` with:

```ts
    if (!(await keepOne(id))) return undefined
    let allStepsOk = true
    if (task.isGoal) {
      // Only steps still OPEN in the source period: a step carried by an earlier
      // attempt is done, and is not carried again on a retry.
      // Legacy-aware: committedTo answers from records when a row has them and
      // from bucket + stamp when it doesn't (a step with September's monthStart
      // and no commitment rows is still on September) — review 2026-09-21.
      const steps = stepsThatCarryForward(task.id, tasksRef.current, level).filter((st) => {
        if (!from) return true
        const c = committedTo(st, level, from, { isCurrent: false })
        return c === 'legacy' || (c !== undefined && c.status === 'open')
      })
      for (const step of steps) if (!(await keepOne(step.id))) allStepsOk = false
    }
    // Undefined until the goal AND every step carried: the session keeps the
    // verdict and retries; the goal's own carry is idempotent (planKeep sees
    // the source already carried and only ensures the destination).
    return allStepsOk ? task.id : undefined
```

   (Import `committedTo` from `@/lib/placement/model` in `useSupabaseTasks.ts` if it isn't already.)
  - Task 1's `dropCommitment`: replace `const task = findTaskById(id)` with `const task = await ensureReconciled(id); if (!task) return false`, plan from it, and return `await writePlacementOps(id, plan, before)` instead of `true` at the end.
  - `updateTask`: when `isPlacementWrite(updates)`, take the task to plan from as `const fresh = await ensureReconciled(id); if (!fresh) return false`, and use `fresh` in place of the earlier lookup for the placement plan. Pass the pre-write task as `before` to `writePlacementOps`.
  - `AddTaskOptions`: add `/** Use this id for the new row (idempotent create: a retry finds it). */ id?: string`.
  - `addTask`: `const tempId = options?.id ?? crypto.randomUUID()`, and add `id: options?.id` to the insert object only when `options?.id` is set. In the `insertError` branch, before the rollback:

```ts
    if (options?.id && insertError.code === '23505') {
      // Already created by an earlier attempt (a retried or interrupted save).
      // The placeholder shares the real id, so REPLACE it with the stored row —
      // filtering by id would remove the real task too, and no INSERT event
      // is coming to bring it back (review 2026-09-21).
      const { data: existing } = await supabase.from('tasks').select('*').eq('id', options.id).maybeSingle()
      if (existing) {
        const stored = dbTaskToTask(existing as DbTask)
        setTasks((prev) => {
          const rest = prev.filter((t) => t.id !== options.id)
          const had = prev.find((t) => t.id === options.id && t !== optimisticTask)
          return [{ ...stored, commitments: had?.commitments ?? stored.commitments, focus: had?.focus ?? stored.focus }, ...rest]
        })
        return options.id
      }
    }
```

   `optimisticTask` is the placeholder object `addTask` already creates, and `had` is the copy an earlier load or realtime event delivered. If the stored row carries no `commitments`, schedule `reconcileCommitments(options.id)` after the `setTasks` so its period records are read too.

- [ ] **Step 4: Run it and check that it passes, and that nothing else broke**

Run: `npx vitest run src/hooks/`
Expected: PASS. If an existing test relied on `writePlacementOps` returning `void` or on `updateTask` returning `true` despite a commitment error, update that test to the new, stricter contract, and say so in the commit.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.planWrites.test.ts
git commit -m "fix(tasks): commitment/focus failures propagate; addTask can create idempotently by id"
```

---

### Task 1: Drop ends one commitment, not the task

**Files:**
- Modify: `src/lib/placement/intentions.ts` (add after `planKeep`, around line 268)
- Modify: `src/hooks/useSupabaseTasks.ts` (add after `keepForward`, around line 1400, and add it to the returned object at line ~2111)
- Modify: `src/components/plan/PeriodPlanPage.tsx`, the `act` callback's task `drop` branch (around line 262)
- Test: `src/lib/placement/intentions.test.ts`, `src/components/plan/PeriodPlanPage.test.tsx`

**Interfaces:**
- Produces: `planDropCommitment(input: Task, level: PlacementLevel, periodStart: Date): PlacementPlan`
- Produces: `dropCommitment(id: string, level: PlacementLevel, periodStart: Date): Promise<boolean>`, returned from `useSupabaseTasks()`

- [ ] **Step 1: Write the failing pure test** (append to `src/lib/placement/intentions.test.ts`)

```ts
describe('planDropCommitment', () => {
  const sep = new Date(2026, 8, 1)
  const oct = new Date(2026, 9, 1)
  const base = (commitments: Task['commitments']): Task => ({
    id: 't1', title: 'Sort photos', completed: false, createdAt: new Date(2026, 8, 2), updatedAt: new Date(2026, 8, 2),
    bucket: 'month', monthStart: sep, commitments,
  } as Task)

  it('removes only that period\'s open commitment and keeps the task', () => {
    const plan = planDropCommitment(base([
      { level: 'month', periodStart: sep, status: 'open' },
      { level: 'season', periodStart: new Date(2026, 8, 22), status: 'open' },
    ]), 'month', sep)
    expect(plan.commitmentOps).toEqual([{ op: 'remove', level: 'month', periodStart: sep }])
    expect(plan.local.commitments?.find((c) => c.level === 'month')?.status).toBe('removed')
    expect(plan.local.commitments?.find((c) => c.level === 'season')?.status).toBe('open')
    expect(plan.row).not.toHaveProperty('completed')
  })

  it('is a no-op when that period has no open commitment', () => {
    const plan = planDropCommitment(base([{ level: 'month', periodStart: sep, status: 'carried', carriedTo: oct }]), 'month', sep)
    expect(plan.commitmentOps).toEqual([])
  })
})
```

(Add `planDropCommitment` to that file's import from `./intentions`.)

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/lib/placement/intentions.test.ts`
Expected: FAIL. `planDropCommitment` is not exported.

- [ ] **Step 3: Implement** (in `intentions.ts`, after `planKeep`)

```ts
/**
 * The look-back's Drop: THIS period's commitment ends. The task itself stays,
 * with every other commitment, its notes and its history. It is still
 * reachable from search and from Inbox › Expired if nothing else holds it.
 */
export function planDropCommitment(input: Task, level: PlacementLevel, periodStart: Date): PlacementPlan {
  const task: Task = { ...input, commitments: bootstrapCommitments(input) }
  const commitmentOps: CommitmentOp[] = []
  const current = (task.commitments ?? []).find((c) => c.level === level && sameDay(c.periodStart, periodStart))
  if (current && current.status === 'open') commitmentOps.push({ op: 'remove', level, periodStart: current.periodStart })
  const commitments = applyCommitmentOps(task.commitments, commitmentOps)
  const merged: Task = { ...task, commitments }
  const cache = deriveCache(merged)
  return { row: { ...cache }, commitmentOps, focusOps: [], local: { ...merged, ...cache } }
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/lib/placement/intentions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the hook funnel** (in `useSupabaseTasks.ts`, directly after `keepForward`; import `planDropCommitment` beside `planKeep`)

```ts
  /** Drop: end ONE period commitment. The task is kept (spec: guided planning). */
  const dropCommitment = useCallback(async (id: string, level: PlacementLevel, periodStart: Date): Promise<boolean> => {
    const task = findTaskById(id)
    if (!task) return false
    const plan = planDropCommitment(task, level, periodStart)
    if (plan.commitmentOps.length === 0) return true
    const before = task
    setTasks((prev) => prev.map((x) => (x.id === id ? plan.local : x)))
    const { error } = await supabase.from('tasks').update({
      bucket: plan.row.bucket,
      week_start: plan.row.weekStart ? localYmd(plan.row.weekStart) : null,
      month_start: plan.row.monthStart ? localYmd(plan.row.monthStart) : null,
      season_start: plan.row.seasonStart ? localYmd(plan.row.seasonStart) : null,
    }).eq('id', id)
    if (error) {
      setTasks((prev) => prev.map((x) => (x.id === id ? before : x)))
      showToast("Couldn't drop it from that period", 'error', 4000)
      return false
    }
    await writePlacementOps(id, plan)
    announceLocalWrite({ kind: 'update', task: plan.local })
    return true
  }, [findTaskById, writePlacementOps])
```

Add `dropCommitment` to the hook's return object next to `keepForward`.

- [ ] **Step 6: Page test: a past period's Drop ends the commitment and does not delete** (append inside `describe('PeriodPlanPage')` in `PeriodPlanPage.test.tsx`; add `dropCommitment: vi.fn()` to the `hook` object at the top)

```ts
  it('Drop on a past month ends that month\'s commitment and never deletes the task', async () => {
    state.tasks = [task({ id: 'p1', title: 'Sort photos', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPageAt('month', `/month?start=${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`)
    fireEvent.click(await screen.findByRole('button', { name: /drop/i }))
    expect(hook.dropCommitment).toHaveBeenCalledWith('p1', 'month', expect.any(Date))
    expect(hook.deleteTask).not.toHaveBeenCalled()
  })
```

If the row's actions sit behind a menu in `PlanRow`, open it first. Read `PlanRow.tsx` and the existing look-back tests in this file for the exact control names, and mirror them.

- [ ] **Step 7: Run it and check that it fails**

Run: `npx vitest run src/components/plan/PeriodPlanPage.test.tsx -t "Drop on a past month"`
Expected: FAIL. `deleteTask` is called.

- [ ] **Step 8: Change the page's task Drop** (in `act`, replace `else if (action === 'drop') await deleteTask(row.id)`; also destructure `dropCommitment` from `useSupabaseTasks()`)

```ts
    else if (action === 'drop') {
      // A past period's Drop ends THAT period's commitment; the task lives on
      // (guided planning spec). In the current period Drop still means
      // "delete this row I just wrote".
      if (isPast && level !== 'year') await dropCommitment(row.id, level === 'month' ? 'month' : 'season', bounds.start)
      else await deleteTask(row.id)
    }
```

Add `isPast` and `dropCommitment` to the `useCallback` dependency list.

- [ ] **Step 9: Run it and check that it passes**

Run: `npx vitest run src/components/plan/PeriodPlanPage.test.tsx src/lib/placement/intentions.test.ts`
Expected: PASS, with no other test in the file broken.

- [ ] **Step 10: Commit**

```bash
git add src/lib/placement/intentions.ts src/lib/placement/intentions.test.ts src/hooks/useSupabaseTasks.ts src/components/plan/PeriodPlanPage.tsx src/components/plan/PeriodPlanPage.test.tsx
git commit -m "fix(plan): a look-back Drop ends that period's commitment, never the task"
```

---

### Task 2: Session model (pure)

**Files:**
- Create: `src/lib/planning/session.ts`
- Test: `src/lib/planning/session.test.ts`

**Interfaces:**
- Consumes: `committedTo` from `@/lib/placement/model`; `Task` from `@/types/task`
- Produces:

```ts
export type Verdict = 'keep' | 'keep-action' | 'done' | 'someday' | 'drop'
export interface NewItem { id: string; title: string; linkId?: string }  // id: the row's real id, generated when added to the draft; linkId: "for" (goal) or "toward" (task)
export interface SessionDraft {
  level: 'month'; periodStart: string; prevStart: string   // YYYY-MM-DD
  verdicts: Record<string, Verdict>
  actionTitles: Record<string, string>                      // goalId → next-action title
  wentWell: string; didnt: string
  newGoals: NewItem[]; newTasks: NewItem[]
  takenFromAbove: string[]                                  // task ids pulled from the season
  keptAlready: string[]                                     // keep-action goals whose keep was written but whose action was not (retry)
  actionIds: Record<string, string>                         // goalId → the next action's real id (idempotent create)
  created: string[]                                         // new goal ids confirmed written — their tasks may now be created
}
export function emptyDraft(periodStart: Date, prevStart: Date): SessionDraft
export function lookBackRows(tasks: readonly Task[], prevStart: Date): { finished: Task[]; open: Task[] }
export function verdictOptions(isGoal: boolean): Array<{ verdict: Verdict; label: string }>
export interface SummaryLine { title: string; destination: string }
export function summarize(draft: SessionDraft, ctx: { open: Task[]; above: Task[]; aboveGoals: Task[]; periodLabel: string; prevLabel: string }): SummaryLine[]
export function isEmptyDraft(d: SessionDraft): boolean
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { emptyDraft, lookBackRows, verdictOptions, summarize, isEmptyDraft } from './session'

const sep = new Date(2026, 8, 1), oct = new Date(2026, 9, 1)
const t = (over: Partial<Task>): Task => ({ id: 'x', title: 'X', completed: false, createdAt: sep, updatedAt: sep, bucket: 'month', ...over } as Task)

describe('lookBackRows', () => {
  it('splits the previous month into finished and still-open, skipping carried and removed', () => {
    const tasks = [
      t({ id: 'a', title: 'Done one', completed: true, commitments: [{ level: 'month', periodStart: sep, status: 'done' }] }),
      t({ id: 'b', title: 'Open one', commitments: [{ level: 'month', periodStart: sep, status: 'open' }] }),
      t({ id: 'c', title: 'Carried', commitments: [{ level: 'month', periodStart: sep, status: 'carried', carriedTo: oct }] }),
      t({ id: 'd', title: 'Removed', commitments: [{ level: 'month', periodStart: sep, status: 'removed' }] }),
      t({ id: 'e', title: 'Other month', commitments: [{ level: 'month', periodStart: oct, status: 'open' }] }),
    ]
    const r = lookBackRows(tasks, sep)
    expect(r.finished.map((x) => x.id)).toEqual(['a'])
    expect(r.open.map((x) => x.id)).toEqual(['b'])
  })
})

describe('verdictOptions', () => {
  it('offers "Keep, and add a next action" to goals only', () => {
    expect(verdictOptions(true).map((o) => o.verdict)).toEqual(['keep', 'keep-action', 'someday', 'drop'])
    expect(verdictOptions(false).map((o) => o.verdict)).toEqual(['keep', 'done', 'someday', 'drop'])
  })
})

describe('summarize', () => {
  it('says where every item lands, and leaves undecided rows open', () => {
    const goal = t({ id: 'g', title: 'Strength 2x/week', isGoal: true })
    const lib = t({ id: 'l', title: 'Library card' })
    const photos = t({ id: 'p', title: 'Photos' })
    const saw = t({ id: 's', title: 'Tile saw' })
    const bids = t({ id: 'b', title: 'Get three bids', bucket: 'quarter' })
    const d = { ...emptyDraft(oct, sep),
      verdicts: { g: 'keep-action' as const, l: 'keep' as const, p: 'drop' as const },
      actionTitles: { g: 'Book a PT evaluation' },
      newGoals: [{ id: 'n1', title: 'Three bids in hand', linkId: 'sg' }],
      newTasks: [{ id: 'n2', title: 'Call Hughes', linkId: 'n1' }],
      takenFromAbove: ['b'] }
    const sg = t({ id: 'sg', title: 'Sign a contractor', isGoal: true, bucket: 'quarter' })
    const lines = summarize(d, { open: [goal, lib, photos, saw], above: [bids], aboveGoals: [sg], periodLabel: 'October', prevLabel: 'September' })
    expect(lines).toEqual([
      { title: 'Strength 2x/week', destination: 'October goals · kept from September' },
      { title: 'Book a PT evaluation', destination: 'October tasks · new next action toward Strength 2x/week' },
      { title: 'Library card', destination: 'October tasks · kept from September' },
      { title: 'Photos', destination: "Dropped from September · the task is kept" },
      { title: 'Tile saw', destination: 'Left open in September' },
      { title: 'Three bids in hand', destination: 'October goals · for Sign a contractor' },
      { title: 'Call Hughes', destination: 'October tasks · toward Three bids in hand' },
      { title: 'Get three bids', destination: 'October tasks · stays on the season, marked "in October"' },
    ])
  })
})

describe('isEmptyDraft', () => {
  it('is true for a fresh draft and false once anything is decided or written', () => {
    const d = emptyDraft(oct, sep)
    expect(isEmptyDraft(d)).toBe(true)
    expect(isEmptyDraft({ ...d, wentWell: 'x' })).toBe(false)
    expect(isEmptyDraft({ ...d, verdicts: { a: 'keep' } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/lib/planning/session.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement `src/lib/planning/session.ts`**

```ts
// src/lib/planning/session.ts
//
// A planning session, as data (spec: guided planning, Phase 1). Nothing here
// writes — the draft is decided in full, summarised, and only then applied
// (applySession.ts). Month only for now; season/year reuse this shape later.

import type { Task } from '@/types/task'
import { committedTo } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'

export type Verdict = 'keep' | 'keep-action' | 'done' | 'someday' | 'drop'
export interface NewItem { id: string; title: string; linkId?: string }
export interface SessionDraft {
  level: 'month'; periodStart: string; prevStart: string
  verdicts: Record<string, Verdict>
  actionTitles: Record<string, string>
  wentWell: string; didnt: string
  newGoals: NewItem[]; newTasks: NewItem[]
  takenFromAbove: string[]
  keptAlready: string[]
  actionIds: Record<string, string>
  created: string[]
}
export interface SummaryLine { title: string; destination: string }

export function emptyDraft(periodStart: Date, prevStart: Date): SessionDraft {
  return { level: 'month', periodStart: localYmd(periodStart), prevStart: localYmd(prevStart),
    verdicts: {}, actionTitles: {}, wentWell: '', didnt: '', newGoals: [], newTasks: [], takenFromAbove: [], keptAlready: [], actionIds: {}, created: [] }
}

export function isEmptyDraft(d: SessionDraft): boolean {
  return !d.wentWell.trim() && !d.didnt.trim() && Object.keys(d.verdicts).length === 0
    && d.newGoals.length === 0 && d.newTasks.length === 0 && d.takenFromAbove.length === 0
}

/** The previous month's ACTUAL list: what finished, and what is still open on it.
 *  A row carried or dropped already has its answer and is not asked again. */
export function lookBackRows(tasks: readonly Task[], prevStart: Date): { finished: Task[]; open: Task[] } {
  const finished: Task[] = []
  const open: Task[] = []
  for (const t of tasks) {
    const c = committedTo(t, 'month', prevStart, { isCurrent: false })
    if (!c) continue
    if (c !== 'legacy' && c.status === 'carried') continue
    if (t.completed || (c !== 'legacy' && c.status === 'done')) finished.push(t)
    else open.push(t)
  }
  const byCreated = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()
  return { finished: finished.sort(byCreated), open: open.sort(byCreated) }
}

export function verdictOptions(isGoal: boolean): Array<{ verdict: Verdict; label: string }> {
  return isGoal
    ? [{ verdict: 'keep', label: 'Keep' }, { verdict: 'keep-action', label: 'Keep, and add a next action' },
       { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
    : [{ verdict: 'keep', label: 'Keep' }, { verdict: 'done', label: 'Done' },
       { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
}

export function summarize(
  d: SessionDraft,
  ctx: { open: Task[]; above: Task[]; aboveGoals: Task[]; periodLabel: string; prevLabel: string },
): SummaryLine[] {
  const P = ctx.periodLabel, Q = ctx.prevLabel
  const lines: SummaryLine[] = []
  for (const t of ctx.open) {
    const v = d.verdicts[t.id]
    const list = t.isGoal ? `${P} goals` : `${P} tasks`
    if (v === 'keep') lines.push({ title: t.title, destination: `${list} · kept from ${Q}` })
    else if (v === 'keep-action') {
      lines.push({ title: t.title, destination: `${list} · kept from ${Q}` })
      const a = d.actionTitles[t.id]?.trim()
      if (a) lines.push({ title: a, destination: `${P} tasks · new next action toward ${t.title}` })
    }
    else if (v === 'done') lines.push({ title: t.title, destination: `Done in ${Q}` })
    else if (v === 'someday') lines.push({ title: t.title, destination: 'Someday page' })
    else if (v === 'drop') lines.push({ title: t.title, destination: `Dropped from ${Q} · the task is kept` })
    else lines.push({ title: t.title, destination: `Left open in ${Q}` })
  }
  const goalTitle = new Map(d.newGoals.map((g) => [g.id, g.title]))
  for (const g of d.newGoals) {
    // "for <season goal>" is shown, not stored (Phase 1): levels are separate lists.
    const forTitle = g.linkId ? ctx.aboveGoals.find((x) => x.id === g.linkId)?.title : undefined
    lines.push({ title: g.title, destination: `${P} goals${forTitle ? ` · for ${forTitle}` : ''}` })
  }
  for (const n of d.newTasks) {
    const toward = n.linkId ? goalTitle.get(n.linkId) ?? ctx.open.find((t) => t.id === n.linkId)?.title : undefined
    lines.push({ title: n.title, destination: `${P} tasks${toward ? ` · toward ${toward}` : ''}` })
  }
  for (const id of d.takenFromAbove) {
    const t = ctx.above.find((x) => x.id === id)
    if (t) lines.push({ title: t.title, destination: `${P} tasks · stays on the season, marked "in ${P}"` })
  }
  return lines
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/lib/planning/session.test.ts`
Expected: PASS. If `lookBackRows` fails because of `committedTo`'s season handling, check that `seasons` isn't needed at the month level. It isn't: the month compares `sameDay`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/session.ts src/lib/planning/session.test.ts
git commit -m "feat(plan): planning session model — look-back rows, verdicts, where-it-lands summary"
```

---

### Task 3: Draft kept on Close

**Files:**
- Create: `src/lib/planning/sessionDraft.ts`
- Test: `src/lib/planning/sessionDraft.test.ts`

**Interfaces:**
- Consumes: `SessionDraft` from `./session`
- Produces: `readDraft(userId: string | null, periodStart: string): SessionDraft | null`, `writeDraft(userId: string | null, d: SessionDraft): void`, `clearDraft(userId: string | null, periodStart: string): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyDraft } from './session'
import { readDraft, writeDraft, clearDraft } from './sessionDraft'

describe('sessionDraft', () => {
  beforeEach(() => localStorage.clear())
  const d = { ...emptyDraft(new Date(2026, 9, 1), new Date(2026, 8, 1)), wentWell: 'bike rack' }

  it('round-trips per user and period', () => {
    writeDraft('u1', d)
    expect(readDraft('u1', '2026-10-01')?.wentWell).toBe('bike rack')
    expect(readDraft('u2', '2026-10-01')).toBeNull()
    clearDraft('u1', '2026-10-01')
    expect(readDraft('u1', '2026-10-01')).toBeNull()
  })

  it('survives a storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readDraft('u1', '2026-10-01')).toBeNull()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/lib/planning/sessionDraft.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/sessionDraft.ts
//
// "Close · keep my draft": a per-viewer convenience, so browser storage is
// right here — the draft is never the plan. Every access is guarded.

import type { SessionDraft } from './session'

const key = (userId: string | null, periodStart: string) => `symphony.planSession.${userId ?? 'anon'}.month.${periodStart}`

export function readDraft(userId: string | null, periodStart: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(key(userId, periodStart))
    return raw ? (JSON.parse(raw) as SessionDraft) : null
  } catch { return null }
}
export function writeDraft(userId: string | null, d: SessionDraft): void {
  try { localStorage.setItem(key(userId, d.periodStart), JSON.stringify(d)) } catch { /* private mode */ }
}
export function clearDraft(userId: string | null, periodStart: string): void {
  try { localStorage.removeItem(key(userId, periodStart)) } catch { /* private mode */ }
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/lib/planning/sessionDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/sessionDraft.ts src/lib/planning/sessionDraft.test.ts
git commit -m "feat(plan): keep a planning draft on Close"
```

---

### Task 4: Apply a saved draft, safely

**Files:**
- Create: `src/lib/planning/applySession.ts`
- Test: `src/lib/planning/applySession.test.ts`

**Interfaces:**
- Consumes: `SessionDraft` (with `NewItem.id` = the row's real id, `actionIds`, `created`, `keptAlready`) from `./session`; `parseLocalYmd` from `@/lib/cadence/config`
- Produces:

```ts
/** Every writer states whether it wrote (Task 0 makes the hooks honest). `false`/`undefined`/throw = not written. */
export interface SessionWriters {
  /** Carry FROM `prevStart` INTO `monthStart` — the source is explicit (review 2026-09-21). */
  keep: (id: string, monthStart: Date, prevStart: Date) => Promise<boolean>
  /** `id` is the row's pre-generated real id; creating it twice returns the same id (Task 0). */
  addTask: (title: string, opts: { id: string; monthStart: Date; isGoal?: boolean; goalTaskId?: string }) => Promise<string | undefined>
  complete: (id: string) => Promise<boolean>
  someday: (id: string) => Promise<boolean>
  drop: (id: string, prevStart: Date) => Promise<boolean>
  takeIntoMonth: (id: string, monthStart: Date) => Promise<boolean>   // the SESSION's month
  saveSession: (notes: { wentWell: string; didnt: string }) => Promise<boolean>
}
export interface ApplyResult { ok: boolean; remaining: SessionDraft }
/** `onProgress` receives the draft minus everything written SO FAR, after every
 *  successful item — the page persists it at once, so a reload mid-save resumes
 *  from there. Idempotent creates cover the gap between a write and its persist. */
export async function applySession(
  d: SessionDraft, w: SessionWriters, isCompleted: (id: string) => boolean,
  onProgress?: (remaining: SessionDraft) => void,
): Promise<ApplyResult>
```

Rules, each tested:
1. `false`/`undefined`/throw is a failure, and the item stays in `remaining`.
2. After **each** success, `onProgress(remaining-so-far)` is called.
3. `keep-action`: the keep and the action are tracked separately (`keptAlready`). The action is created with `actionIds[goalId]`.
4. A new goal that is written joins `created`. A new task whose `linkId` is a new goal's id is attempted **only** if that goal is in `created`. Otherwise it waits, untouched.
5. `saveSession` is called **only when nothing else remains**. Until then the notes stay in the draft.
6. Re-running with the persisted remainder never creates a second row. Ids are fixed, and creation is idempotent.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { emptyDraft, type SessionDraft } from './session'
import { applySession, type SessionWriters } from './applySession'

const oct = new Date(2026, 9, 1), sep = new Date(2026, 8, 1)
/** A fake store with idempotent creates: creating an existing id returns it, adds nothing. */
const writers = (over: Partial<SessionWriters> = {}) => {
  const calls: string[] = []
  const rows = new Map<string, string>()
  const w: SessionWriters = {
    keep: vi.fn(async (id, _m, from) => { calls.push(`keep:${id}`); expect(from.getMonth()).toBe(8); return true }),   // always FROM September
    addTask: vi.fn(async (title, o) => { calls.push(`add:${title}:${o.isGoal ? 'goal' : 'task'}:${o.goalTaskId ?? '-'}`); if (!rows.has(o.id)) rows.set(o.id, title); return o.id }),
    complete: vi.fn(async (id) => { calls.push(`done:${id}`); return true }),
    someday: vi.fn(async (id) => { calls.push(`someday:${id}`); return true }),
    drop: vi.fn(async (id) => { calls.push(`drop:${id}`); return true }),
    takeIntoMonth: vi.fn(async (id, m) => { calls.push(`take:${id}:${m.getMonth()}`); return true }),
    saveSession: vi.fn(async () => { calls.push('session'); return true }),
    ...over,
  }
  return { w, calls, rows }
}
const full = (): SessionDraft => ({ ...emptyDraft(oct, sep),
  verdicts: { g: 'keep-action', l: 'keep', p: 'drop', s: 'someday', x: 'done' },
  actionTitles: { g: 'Book a PT evaluation' }, actionIds: { g: 'A1' },
  newGoals: [{ id: 'G1', title: 'Three bids' }],
  newTasks: [{ id: 'T1', title: 'Call Hughes', linkId: 'G1' }, { id: 'T2', title: 'Loose' }],
  takenFromAbove: ['b'], wentWell: 'w', didnt: 'd' })

describe('applySession', () => {
  it('writes in dependency order, into the session month, then records the session', async () => {
    const { w, calls } = writers()
    const r = await applySession(full(), w, () => false)
    expect(r.ok).toBe(true)
    expect(calls).toEqual([
      'keep:g', 'add:Book a PT evaluation:task:g', 'keep:l', 'drop:p', 'someday:s', 'done:x',
      'add:Three bids:goal:-', 'add:Call Hughes:task:G1', 'add:Loose:task:-', 'take:b:9', 'session',
    ])
  })

  it('reports progress after every successful item', async () => {
    const { w } = writers()
    const seen: SessionDraft[] = []
    await applySession(full(), w, () => false, (d) => seen.push(d))
    expect(seen.length).toBeGreaterThanOrEqual(10)
    expect(seen.at(-1)!.newTasks).toEqual([])
    expect(seen.find((d) => d.created.includes('G1'))!.newGoals).toEqual([])
  })

  it('a false return is a failure: the item stays, the session is not recorded, the notes stay', async () => {
    const { w } = writers({ drop: vi.fn(async () => false) })
    const r = await applySession(full(), w, () => false)
    expect(r.ok).toBe(false)
    expect(w.saveSession).not.toHaveBeenCalled()
    expect(r.remaining.verdicts).toEqual({ p: 'drop' })
    expect(r.remaining.wentWell).toBe('w')
  })

  it('never creates a task under a goal that was not written', async () => {
    const base = writers()
    const { w, calls } = writers({ addTask: vi.fn(async (title, o) => (o.isGoal ? undefined : base.w.addTask(title, o))) })
    const r = await applySession(full(), w, () => false)
    expect(calls.some((c) => c.startsWith('add:Call Hughes'))).toBe(false)
    expect(base.calls.some((c) => c.startsWith('add:Call Hughes'))).toBe(false)
    expect(r.remaining.newGoals.map((g) => g.id)).toEqual(['G1'])
    expect(r.remaining.newTasks).toEqual([{ id: 'T1', title: 'Call Hughes', linkId: 'G1' }])
  })

  it('an interrupted save resumed from the last persisted progress creates nothing twice', async () => {
    const store = writers()
    let persisted: SessionDraft = full()
    // "Reload" right after the goal is created: the writer throws on the next create.
    let n = 0
    const interrupted = { ...store.w, addTask: vi.fn(async (title: string, o: Parameters<SessionWriters['addTask']>[1]) => {
      if (++n === 3) throw new Error('page reloaded')
      return store.w.addTask(title, o)
    }) }
    await applySession(persisted, interrupted, () => false, (d) => { persisted = d })
    // Worst case: progress for the last success was not persisted — replay from one step earlier too.
    await applySession(full(), store.w, () => false)
    await applySession(persisted, store.w, () => false)
    expect([...store.rows.keys()].sort()).toEqual(['A1', 'G1', 'T1', 'T2'])
  })

  it('a kept goal whose next action failed retries only the action', async () => {
    const first = writers({ addTask: vi.fn(async () => undefined) })
    const r1 = await applySession({ ...emptyDraft(oct, sep), verdicts: { g: 'keep-action' }, actionTitles: { g: 'Book PT' }, actionIds: { g: 'A1' } }, first.w, () => false)
    expect(r1.remaining.keptAlready).toEqual(['g'])
    const second = writers()
    await applySession(r1.remaining, second.w, () => false)
    expect(second.calls).toEqual(['add:Book PT:task:g', 'session'])
  })

  it('never re-completes a finished task (counts as done)', async () => {
    const { w } = writers()
    const r = await applySession({ ...emptyDraft(oct, sep), verdicts: { b: 'done' } }, w, () => true)
    expect(w.complete).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/lib/planning/applySession.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/applySession.ts
//
// Save = everything at once, in an order where every link resolves: verdicts
// (a kept goal is in the new month before its next action), new goals, tasks
// under goals that EXIST, pulls from the season into the SESSION's month, and
// only then the session row. Every writer states whether it wrote. Progress is
// reported after each success so the page can persist it immediately; every
// created row carries a pre-generated id, so replaying a step that already
// landed finds the row instead of duplicating it.

import { parseLocalYmd } from '@/lib/cadence/config'
import type { SessionDraft } from './session'

export interface SessionWriters {
  keep: (id: string, monthStart: Date, prevStart: Date) => Promise<boolean>
  addTask: (title: string, opts: { id: string; monthStart: Date; isGoal?: boolean; goalTaskId?: string }) => Promise<string | undefined>
  complete: (id: string) => Promise<boolean>
  someday: (id: string) => Promise<boolean>
  drop: (id: string, prevStart: Date) => Promise<boolean>
  takeIntoMonth: (id: string, monthStart: Date) => Promise<boolean>
  saveSession: (notes: { wentWell: string; didnt: string }) => Promise<boolean>
}
export interface ApplyResult { ok: boolean; remaining: SessionDraft }

async function wrote<T>(f: () => Promise<T>): Promise<boolean> {
  try { const v = await f(); return v !== false && v !== undefined && v !== null } catch { return false }
}

export async function applySession(
  d: SessionDraft, w: SessionWriters, isCompleted: (id: string) => boolean,
  onProgress?: (remaining: SessionDraft) => void,
): Promise<ApplyResult> {
  const monthStart = parseLocalYmd(d.periodStart)
  const prevStart = parseLocalYmd(d.prevStart)
  // `cur` is the draft minus everything written so far — always safe to persist.
  let cur: SessionDraft = {
    ...d, verdicts: { ...d.verdicts }, actionTitles: { ...d.actionTitles }, actionIds: { ...d.actionIds },
    keptAlready: [...(d.keptAlready ?? [])], created: [...(d.created ?? [])],
    newGoals: [...d.newGoals], newTasks: [...d.newTasks], takenFromAbove: [...d.takenFromAbove],
  }
  const progress = (next: SessionDraft) => { cur = next; onProgress?.(cur) }
  const without = <T,>(o: Record<string, T>, k: string) => { const c = { ...o }; delete c[k]; return c }

  for (const [id, v] of Object.entries(d.verdicts)) {
    if (v === 'keep-action') {
      if (!cur.keptAlready.includes(id)) {
        if (!(await wrote(() => w.keep(id, monthStart, prevStart)))) continue
        progress({ ...cur, keptAlready: [...cur.keptAlready, id] })
      }
      const title = cur.actionTitles[id]?.trim()
      const actionId = cur.actionIds[id]
      if (title && actionId && !(await wrote(() => w.addTask(title, { id: actionId, monthStart, goalTaskId: id })))) continue
      progress({ ...cur, verdicts: without(cur.verdicts, id), actionTitles: without(cur.actionTitles, id),
        actionIds: without(cur.actionIds, id), keptAlready: cur.keptAlready.filter((x) => x !== id) })
      continue
    }
    const ok =
      v === 'keep' ? await wrote(() => w.keep(id, monthStart, prevStart))
      : v === 'drop' ? await wrote(() => w.drop(id, prevStart))
      : v === 'someday' ? await wrote(() => w.someday(id))
      : v === 'done' ? (isCompleted(id) || await wrote(() => w.complete(id)))
      : false
    if (ok) progress({ ...cur, verdicts: without(cur.verdicts, id) })
  }

  for (const g of d.newGoals) {
    if (cur.created.includes(g.id)) { progress({ ...cur, newGoals: cur.newGoals.filter((x) => x.id !== g.id) }); continue }
    if (await wrote(() => w.addTask(g.title, { id: g.id, monthStart, isGoal: true }))) {
      progress({ ...cur, created: [...cur.created, g.id], newGoals: cur.newGoals.filter((x) => x.id !== g.id) })
    }
  }
  const pendingGoals = new Set(cur.newGoals.map((g) => g.id))
  for (const t of d.newTasks) {
    if (t.linkId && pendingGoals.has(t.linkId)) continue            // its goal isn't written yet — wait
    if (await wrote(() => w.addTask(t.title, { id: t.id, monthStart, goalTaskId: t.linkId }))) {
      progress({ ...cur, newTasks: cur.newTasks.filter((x) => x.id !== t.id) })
    }
  }
  for (const id of d.takenFromAbove) {
    if (await wrote(() => w.takeIntoMonth(id, monthStart))) progress({ ...cur, takenFromAbove: cur.takenFromAbove.filter((x) => x !== id) })
  }

  const left = Object.keys(cur.verdicts).length + cur.newGoals.length + cur.newTasks.length + cur.takenFromAbove.length
  if (left > 0) return { ok: false, remaining: cur }
  if (!(await wrote(() => w.saveSession({ wentWell: d.wentWell.trim(), didnt: d.didnt.trim() })))) return { ok: false, remaining: cur }
  return { ok: true, remaining: { ...cur, wentWell: '', didnt: '' } }
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/lib/planning/applySession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/applySession.ts src/lib/planning/applySession.test.ts src/lib/planning/session.ts
git commit -m "feat(plan): apply a planning session — honest results, progress after every write, idempotent creates"
```

---

### Task 5: Read and save the session record

**Files:**
- Create: `src/hooks/usePlanningSession.ts`
- Test: `src/hooks/usePlanningSession.test.ts`

**Interfaces:**
- Produces: `usePlanningSession(horizon: 'monthly', token: string): { saved: { at: Date; authorId: string; notes: { wentWell?: string; didnt?: string } } | null; mine: { wentWell: string; didnt: string } | null; loading: boolean; save: (notes: { wentWell: string; didnt: string }) => Promise<boolean> }`. `saved` is the latest saved row by anyone in the household ("Planned <date>"). `mine` is MY saved notes, which seed a reopened draft so a re-save never blanks them. The hook also returns `loadedToken: string | null`, the token the current `saved`/`mine` belong to. A response for a token the page has already left is discarded. **A failed read never sets `loadedToken`.** The hook returns `error: string | null` and `reload(): void`, so the page keeps the session closed and offers a retry, and it never opens on blank notes that a save would write over the real ones (review 2026-09-21).
- Produces: `monthToken(start: Date): string`, which returns `YYYY-M` (the same format as `src/lib/cadence/config.ts:138`)

- [ ] **Step 1: Write the failing test** (mirror the supabase mock style used in `src/hooks/useAttachments.test.ts`; read that file first)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
const upsert = vi.fn(async () => ({ error: null }))
let orderImpl: () => Promise<{ data: unknown[]; error: null }> = async () => ({ data: rows, error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => orderImpl() }) }) }),
      upsert,
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { usePlanningSession, monthToken } from './usePlanningSession'

describe('usePlanningSession', () => {
  beforeEach(() => { rows.length = 0; upsert.mockClear(); orderImpl = async () => ({ data: rows, error: null }) })

  it('builds the month token the cadence code uses', () => {
    expect(monthToken(new Date(2026, 9, 1))).toBe('2026-10')
  })

  it('reads the latest saved session visible to me, from anyone in the household', async () => {
    rows.push({ author_id: 'u2', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'bike rack', savedAt: '2026-09-29' } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.saved?.authorId).toBe('u2')
    expect(result.current.mine).toBeNull()
  })

  it('discards a response for a period the page has already left', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'SEPTEMBER', savedAt: 'x' } })
    orderImpl = async () => { await gate; return { data: [...rows], error: null } }
    const { result, rerender } = renderHook(({ t }) => usePlanningSession('monthly', t), { initialProps: { t: '2026-9' } })
    orderImpl = async () => ({ data: [], error: null })
    rerender({ t: '2026-10' })
    await waitFor(() => expect(result.current.loadedToken).toBe('2026-10'))
    release(); await gate; await new Promise((r) => setTimeout(r, 0))
    expect(result.current.loadedToken).toBe('2026-10')
    expect(result.current.mine).toBeNull()
  })

  it('a failed read leaves the period NOT loaded, reports the error, and reload() recovers', async () => {
    orderImpl = async () => ({ data: null as unknown as unknown[], error: { message: 'offline' } as unknown as null })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadedToken).toBeNull()
    expect(result.current.error).toBe('offline')
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'kept', savedAt: 'x' } })
    orderImpl = async () => ({ data: rows, error: null })
    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.loadedToken).toBe('2026-10'))
    expect(result.current.error).toBeNull()
    expect(result.current.mine?.wentWell).toBe('kept')
  })

  it('returns my own saved notes separately, for seeding a reopened session', async () => {
    rows.push({ author_id: 'u1', updated_at: '2026-09-28T20:00:00Z', notes: { wentWell: 'mine', didnt: 'x', savedAt: '2026-09-28' } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mine).toEqual({ wentWell: 'mine', didnt: 'x' })
  })

  it('ignores rows that were only opened, not saved', async () => {
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { stepIndex: 2 } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.saved).toBeNull()
  })

  it('saves my session with a savedAt stamp', async () => {
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.save({ wentWell: 'w', didnt: '' })).toBe(true) })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: 'u1', horizon: 'monthly', period_token: '2026-10', notes: expect.objectContaining({ wentWell: 'w', savedAt: expect.any(String) }) }),
      { onConflict: 'author_id,horizon,period_token' },
    )
  })
})
```

Check the real auth hook's import path and name with `git grep -n "export function useAuth" src`, and change the mock if they differ.

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/hooks/usePlanningSession.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

```ts
// src/hooks/usePlanningSession.ts
//
// "Planned <date>" and the look-back notes. One row per author per period
// (UNIQUE author_id, horizon, period_token); household members can read each
// other's rows (existing RLS), so a period planned by either peer reads as
// planned for both. A row is SAVED only when notes.savedAt is set — the old
// wizard created rows on open (cadenceDue.ts), and those must not count.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function monthToken(start: Date): string { return `${start.getFullYear()}-${start.getMonth() + 1}` }

type Saved = { at: Date; authorId: string; notes: { wentWell?: string; didnt?: string } }

export function usePlanningSession(horizon: 'monthly', token: string) {
  const { user } = useAuth()
  const [saved, setSaved] = useState<Saved | null>(null)
  const [mine, setMine] = useState<{ wentWell: string; didnt: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The latest request wins: a slow answer for the month the page has left is dropped.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const req = ++latest.current
    setLoading(true)
    setLoadedToken(null)
    setError(null)
    const { data, error: readError } = await supabase.from('planning_sessions')
      .select('author_id, updated_at, notes').eq('horizon', horizon).eq('period_token', token)
      .order('updated_at', { ascending: false })
    if (req !== latest.current) return
    if (readError) {
      // Unknown is not empty: opening now would seed blank notes and a save
      // would overwrite the real ones. Stay unloaded; the page offers a retry.
      setError(readError.message)
      setLoading(false)
      return
    }
    const row = (data ?? []).find((r: { notes?: { savedAt?: string } }) => !!r.notes?.savedAt) as
      { author_id: string; updated_at: string; notes: { wentWell?: string; didnt?: string; savedAt: string } } | undefined
    setSaved(row ? { at: new Date(row.notes.savedAt), authorId: row.author_id, notes: row.notes } : null)
    const own = (data ?? []).find((r: { author_id: string; notes?: { savedAt?: string } }) => r.author_id === user?.id && !!r.notes?.savedAt) as
      { notes: { wentWell?: string; didnt?: string } } | undefined
    setMine(own ? { wentWell: own.notes.wentWell ?? '', didnt: own.notes.didnt ?? '' } : null)
    setLoadedToken(token)
    setLoading(false)
  }, [horizon, token, user?.id])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (notes: { wentWell: string; didnt: string }): Promise<boolean> => {
    if (!user?.id) return false
    const savedAt = new Date().toISOString()
    const { error } = await supabase.from('planning_sessions').upsert(
      { author_id: user.id, horizon, period_token: token, notes: { ...notes, savedAt }, updated_at: savedAt },
      { onConflict: 'author_id,horizon,period_token' },
    )
    if (error) return false
    setSaved({ at: new Date(savedAt), authorId: user.id, notes })
    setMine(notes)
    return true
  }, [user?.id, horizon, token])

  return { saved, mine, loading, loadedToken, error, reload: () => { void load() }, save }
}
```

Also update `isSessionSubstantive` in `src/lib/assistant/cadenceDue.ts` so that `savedAt` alone doesn't count as an answer. Add `'savedAt'` to `BOOKKEEPING_KEYS`, and add a unit test beside its existing ones: `isSessionSubstantive({ savedAt: 'x' })` must be `false`.

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/hooks/usePlanningSession.test.ts src/lib/assistant`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePlanningSession.ts src/hooks/usePlanningSession.test.ts src/lib/assistant/cadenceDue.ts src/lib/assistant/*.test.ts
git commit -m "feat(plan): read and save the month's planning session (household-visible)"
```

---

### Task 6: The session UI

**Files:**
- Create: `src/components/plan/PlanSession.tsx`
- Test: `src/components/plan/PlanSession.test.tsx`

**Interfaces:**
- Consumes: `SessionDraft`, `Verdict`, `lookBackRows` (the caller passes their output), `verdictOptions`, `summarize` from `@/lib/planning/session`
- Produces:

```tsx
export function PlanSession(props: {
  periodLabel: string            // "October"
  prevLabel: string              // "September"
  finished: Task[]; open: Task[] // lookBackRows output for the previous month
  current: Task[]                // what this month already holds (goals + tasks), shown in the Plan step
  above: Task[]                  // the season's open, non-goal tasks (pullable)
  aboveGoals: Task[]             // the season's goals (reference + "for" options)
  draft: SessionDraft
  onChange: (d: SessionDraft) => void
  onClose: () => void            // keeps the draft
  onSave: () => Promise<void>
  saving: boolean
  saveError?: boolean            // the last Save left items unsaved; they are what the draft now holds
}): JSX.Element
```

The "for <season goal>" link for a new month goal is shown in the draft and summary only. The spec keeps levels as separate lists, and the month goal is a new row. Recording the link as `sourceId` is out of scope for Phase 1. Put `linkId` on `NewItem` for display only.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Task } from '@/types/task'
import { emptyDraft, type SessionDraft } from '@/lib/planning/session'
import { PlanSession } from './PlanSession'

const t = (over: Partial<Task>): Task => ({ id: 'x', title: 'X', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'month', ...over } as Task)
function setup(over: Partial<Parameters<typeof PlanSession>[0]> = {}) {
  let draft: SessionDraft = emptyDraft(new Date(2026, 9, 1), new Date(2026, 8, 1))
  const onChange = vi.fn((d: SessionDraft) => { draft = d; view.rerender(el()) })
  const onSave = vi.fn(async () => {})
  const el = () => (
    <PlanSession periodLabel="October" prevLabel="September"
      finished={[t({ id: 'f', title: 'Order the bike rack', completed: true })]}
      open={[t({ id: 'g', title: 'Strength 2x/week', isGoal: true }), t({ id: 'l', title: 'Library card' })]}
      current={[]} above={[t({ id: 'b', title: 'Get three bids', bucket: 'quarter' })]}
      aboveGoals={[t({ id: 'sg', title: 'Sign a contractor', isGoal: true, bucket: 'quarter' })]}
      draft={draft} onChange={onChange} onClose={vi.fn()} onSave={onSave} saving={false} {...over} />
  )
  const view = render(el())
  return { onChange, onSave, get draft() { return draft } }
}

describe('PlanSession', () => {
  it('starts on Look back with both reflection boxes and the previous month\'s actual list', () => {
    setup()
    expect(screen.getByRole('heading', { name: /how did september go/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/what went well/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/what didn't/i)).toBeInTheDocument()
    expect(screen.getByText('Order the bike rack')).toBeInTheDocument()
    expect(screen.getByText(/visible to your household/i)).toBeInTheDocument()
  })

  it('offers "Keep, and add a next action" on a goal and asks for the action\'s name', () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength 2x\/week/i), { target: { value: 'Book a PT evaluation' } })
    expect(s.draft.verdicts.g).toBe('keep-action')
    expect(s.draft.actionTitles.g).toBe('Book a PT evaluation')
  })

  it('skips Look back when the previous month left nothing', () => {
    setup({ finished: [], open: [] })
    expect(screen.getByText(/nothing to look back at/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what will october add up to/i })).toBeInTheDocument()
  })

  it('writes nothing until Save, then saves once', async () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: /next: plan october/i }))
    fireEvent.change(screen.getByLabelText(/new goal for october/i), { target: { value: 'Three bids in hand' } })
    fireEvent.change(screen.getByLabelText(/for a season goal/i), { target: { value: 'sg' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    expect(screen.getByText('for Sign a contractor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add to october: get three bids/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(s.onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Three bids in hand')).toBeInTheDocument()
    expect(screen.getByText(/stays on the season/i)).toBeInTheDocument()
    expect(screen.getByText(/October goals · for Sign a contractor/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /save october/i }))
    expect(s.onSave).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run src/components/plan/PlanSession.test.tsx`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement `src/components/plan/PlanSession.tsx`**

```tsx
// src/components/plan/PlanSession.tsx
//
// "Plan October": Look back at September · Plan October · Save — the level
// above beside you the whole time (spec: guided planning, Phase 1). A pure
// view over a SessionDraft; the page owns loading, the draft store and Save.

import { useMemo, useState } from 'react'
import { Target, Check } from 'lucide-react'
import type { Task } from '@/types/task'
import { verdictOptions, summarize, type SessionDraft, type Verdict } from '@/lib/planning/session'

type Step = 'back' | 'plan' | 'save'
/** The row's REAL id, fixed when it is written into the draft: creating it twice finds the first (idempotent insert, Task 0). */
const newId = () => crypto.randomUUID()

export function PlanSession({ periodLabel: P, prevLabel: Q, finished, open, current, above, aboveGoals, draft, onChange, onClose, onSave, saving, saveError }: {
  periodLabel: string; prevLabel: string
  finished: Task[]; open: Task[]; current: Task[]; above: Task[]; aboveGoals: Task[]
  draft: SessionDraft; onChange: (d: SessionDraft) => void
  onClose: () => void; onSave: () => Promise<void>; saving: boolean; saveError?: boolean
}) {
  const nothingBack = finished.length === 0 && open.length === 0
  const [step, setStep] = useState<Step>(nothingBack ? 'plan' : 'back')
  const [goalText, setGoalText] = useState('')
  const [goalFor, setGoalFor] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskToward, setTaskToward] = useState('')
  const set = (patch: Partial<SessionDraft>) => onChange({ ...draft, ...patch })

  const setVerdict = (id: string, v: Verdict) => {
    const verdicts = { ...draft.verdicts }
    if (verdicts[id] === v) delete verdicts[id]; else verdicts[id] = v
    set({ verdicts })
  }

  // What this month holds in the draft, for the Plan step and the "toward" options.
  const kept = open.filter((t) => draft.verdicts[t.id] === 'keep' || draft.verdicts[t.id] === 'keep-action')
  const monthGoals = [...current.filter((t) => t.isGoal), ...kept.filter((t) => t.isGoal)]
  const monthTasks = [...current.filter((t) => !t.isGoal), ...kept.filter((t) => !t.isGoal)]
  const towardOptions = [...monthGoals.map((g) => ({ id: g.id, title: g.title })), ...draft.newGoals.map((g) => ({ id: g.id, title: g.title }))]
  const lines = useMemo(() => summarize(draft, { open, above, aboveGoals, periodLabel: P, prevLabel: Q }), [draft, open, above, aboveGoals, P, Q])

  const steps: Array<[Step, string]> = [['back', `Look back at ${Q}`], ['plan', `Plan ${P}`], ['save', 'Save']]
  const idx = steps.findIndex(([s]) => s === step)

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <ol className="mb-4 flex overflow-hidden rounded-lg border border-neutral-200 text-[13px] font-semibold" aria-label="Planning steps">
          {steps.map(([s, label], i) => (
            <li key={s} aria-current={i === idx ? 'step' : undefined}
              className={`flex-1 px-2 py-2 text-center ${i === idx ? 'bg-neutral-900 text-white' : i < idx ? 'bg-sage-50 text-sage-600' : 'bg-neutral-50 text-neutral-400'}`}>
              {s === 'back' && nothingBack ? <span className="font-normal italic">Nothing to look back at</span> : <>{i < idx && '✓ '}{label}</>}
            </li>
          ))}
        </ol>

        {step === 'back' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">How did {Q} go?</h2>
            <p className="mt-1 text-sm text-neutral-500">This is {Q}'s actual list. A next action is a new task toward the goal; the goal itself stays.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-semibold text-neutral-700">What went well?
                <textarea className="input-base mt-1 min-h-[56px]" value={draft.wentWell} onChange={(e) => set({ wentWell: e.target.value })} />
              </label>
              <label className="text-[13px] font-semibold text-neutral-700">What didn't?
                <textarea className="input-base mt-1 min-h-[56px]" value={draft.didnt} onChange={(e) => set({ didnt: e.target.value })} />
              </label>
            </div>
            <p className="mt-1 text-[12px] text-neutral-400">Visible to your household.</p>
            {finished.length > 0 && (
              <>
                <h3 className="mt-5 border-b border-neutral-200 pb-1 font-display text-lg text-neutral-800">Finished in {Q}</h3>
                <ul>{finished.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm text-neutral-600">
                    {t.isGoal ? <Target className="h-4 w-4 text-accent-600" /> : <Check className="h-4 w-4 text-sage-600" />}{t.title}
                  </li>))}</ul>
              </>
            )}
            {open.length > 0 && (
              <>
                <h3 className="mt-5 border-b border-neutral-200 pb-1 font-display text-lg text-neutral-800">Still open</h3>
                <ul>{open.map((t) => (
                  <li key={t.id} className="border-b border-neutral-100 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.isGoal && <Target className="h-4 w-4 text-accent-600" />}
                      <span className="min-w-[180px] flex-1 text-sm text-neutral-800">{t.title}</span>
                      <div className="flex flex-wrap gap-1">
                        {verdictOptions(!!t.isGoal).map((o) => (
                          <button key={o.verdict} type="button" aria-pressed={draft.verdicts[t.id] === o.verdict}
                            onClick={() => setVerdict(t.id, o.verdict)}
                            className={`rounded-md border px-2 py-1 text-[12.5px] font-semibold ${draft.verdicts[t.id] === o.verdict ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {draft.verdicts[t.id] === 'keep-action' && (
                      <label className="mt-2 block pl-6 text-[12.5px] text-neutral-500">Next action for {t.title}
                        <input className="input-base mt-1" value={draft.actionTitles[t.id] ?? ''}
                          onChange={(e) => set({ actionTitles: { ...draft.actionTitles, [t.id]: e.target.value },
                            actionIds: { ...draft.actionIds, [t.id]: draft.actionIds[t.id] ?? newId() } })} />
                      </label>
                    )}
                  </li>))}</ul>
              </>
            )}
          </section>
        )}

        {step === 'plan' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">What will {P} add up to, and what will you do?</h2>
            <p className="mt-1 text-sm text-neutral-500">Write {P}'s goals with the season beside you, then the tasks that move them. Goals are never scheduled.</p>
            <h3 className="mt-4 border-b-2 border-primary-700 pb-1 font-display text-lg text-neutral-800">{P} goals</h3>
            <ul>
              {monthGoals.map((g) => <li key={g.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm"><Target className="h-4 w-4 text-accent-600" />{g.title}</li>)}
              {draft.newGoals.map((g) => (
                <li key={g.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <Target className="h-4 w-4 text-accent-600" />
                  <span className="flex-1">{g.title}{g.linkId && <span className="block text-[12px] text-neutral-400">for {aboveGoals.find((a) => a.id === g.linkId)?.title}</span>}</span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ newGoals: draft.newGoals.filter((x) => x.id !== g.id), newTasks: draft.newTasks.map((x) => (x.linkId === g.id ? { ...x, linkId: undefined } : x)) })}>Remove</button>
                </li>))}
            </ul>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => {
              e.preventDefault()
              const title = goalText.trim()
              if (!title || [...monthGoals.map((g) => g.title), ...draft.newGoals.map((g) => g.title)].some((x) => x.trim().toLowerCase() === title.toLowerCase())) return
              set({ newGoals: [...draft.newGoals, { id: newId(), title, linkId: goalFor || undefined }] }); setGoalText(''); setGoalFor('')
            }}>
              <div className="min-w-[200px] flex-1"><input aria-label={`New goal for ${P}`} className="input-base" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder={`A goal for ${P}`} /></div>
              {aboveGoals.length > 0 && (
                <select aria-label="For a season goal" className="rounded-md border border-neutral-200 px-2 text-sm" value={goalFor} onChange={(e) => setGoalFor(e.target.value)}>
                  <option value="">For a season goal? (optional)</option>
                  {aboveGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              )}
              <button type="submit" className="rounded-md border border-neutral-200 px-3 text-sm font-semibold">Add goal</button>
            </form>

            <h3 className="mt-5 border-b border-neutral-300 pb-1 font-display text-lg text-neutral-800">{P} tasks</h3>
            <ul>
              {monthTasks.map((x) => <li key={x.id} className="border-b border-neutral-100 py-2 text-sm">{x.title}</li>)}
              {open.filter((t) => draft.verdicts[t.id] === 'keep-action' && draft.actionTitles[t.id]?.trim()).map((g) => (
                <li key={`a-${g.id}`} className="border-b border-neutral-100 py-2 text-sm">{draft.actionTitles[g.id]}<span className="block text-[12px] text-neutral-400">new next action toward {g.title}</span></li>))}
              {draft.newTasks.map((x) => (
                <li key={x.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <span className="flex-1">{x.title}{x.linkId && <span className="block text-[12px] text-neutral-400">toward {towardOptions.find((o) => o.id === x.linkId)?.title}</span>}</span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ newTasks: draft.newTasks.filter((y) => y.id !== x.id) })}>Remove</button>
                </li>))}
              {above.filter((a) => draft.takenFromAbove.includes(a.id)).map((a) => (
                <li key={`t-${a.id}`} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <span className="flex-1">{a.title}<span className="block text-[12px] text-neutral-400">from the season</span></span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ takenFromAbove: draft.takenFromAbove.filter((id) => id !== a.id) })}>Remove</button>
                </li>))}
            </ul>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => {
              e.preventDefault()
              const title = taskText.trim()
              if (!title) return
              set({ newTasks: [...draft.newTasks, { id: newId(), title, linkId: taskToward || undefined }] }); setTaskText(''); setTaskToward('')
            }}>
              <div className="min-w-[200px] flex-1"><input aria-label={`New task for ${P}`} className="input-base" value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder={`A task for ${P}`} /></div>
              {towardOptions.length > 0 && (
                <select aria-label={`Toward a ${P} goal`} className="rounded-md border border-neutral-200 px-2 text-sm" value={taskToward} onChange={(e) => setTaskToward(e.target.value)}>
                  <option value="">Toward a {P} goal? (optional)</option>
                  {towardOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              )}
              <button type="submit" className="rounded-md border border-neutral-200 px-3 text-sm font-semibold">Add task</button>
            </form>
          </section>
        )}

        {step === 'save' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">Here's {P}'s plan</h2>
            {saveError
              ? <p role="alert" className="mt-1 text-sm text-accent-700">Some of this didn't save. It's still here and in your draft; Save again retries only these.</p>
              : <p className="mt-1 text-sm text-neutral-500">Nothing is saved yet.</p>}
            <ul className="mt-3 rounded-lg bg-sage-50 px-4 py-2">
              {lines.length === 0 && <li className="py-1.5 text-sm text-neutral-500">Nothing chosen.</li>}
              {lines.map((l, i) => (
                <li key={i} className="grid grid-cols-1 gap-1 border-t border-sage-100 py-1.5 text-sm first:border-t-0 sm:grid-cols-2">
                  <span className="text-neutral-800">{l.title}</span><span className="text-neutral-600">→ {l.destination}</span>
                </li>))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {step === 'back' || (step === 'plan' && nothingBack)
            ? <span />
            : <button type="button" className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm" onClick={() => setStep(step === 'save' ? 'plan' : 'back')}>← Back</button>}
          <button type="button" className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm" onClick={onClose}>Close · keep my draft</button>
          {step === 'back' && <button type="button" className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => setStep('plan')}>Next: plan {P} →</button>}
          {step === 'plan' && <button type="button" className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => setStep('save')}>Next: save →</button>}
          {step === 'save' && <button type="button" disabled={saving} className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => { void onSave() }}>{saving ? 'Saving…' : `Save ${P}`}</button>}
        </div>
      </div>

      <aside className="min-w-0 rounded-xl bg-neutral-50 p-3 lg:sticky lg:top-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">The season</p>
        <ul className="mt-1">
          {aboveGoals.map((g) => <li key={g.id} className="flex items-center gap-1.5 border-t border-neutral-200 py-1.5 text-[13px] text-neutral-700"><Target className="h-3.5 w-3.5 text-accent-600" />{g.title}</li>)}
          {above.map((a) => (
            <li key={a.id} className="border-t border-neutral-200 py-1.5 text-[13px] text-neutral-700">
              {a.title}
              {step === 'plan' && (draft.takenFromAbove.includes(a.id)
                ? <span className="ml-1 text-[12px] font-semibold text-sage-600">· in {P}</span>
                : <button type="button" aria-label={`Add to ${P}: ${a.title}`} className="block text-[12px] font-semibold text-primary-700"
                    onClick={() => set({ takenFromAbove: [...draft.takenFromAbove, a.id] })}>+ Add to {P}</button>)}
            </li>))}
          {aboveGoals.length === 0 && above.length === 0 && <li className="py-1.5 text-[13px] text-neutral-400">The season has no list yet.</li>}
        </ul>
      </aside>
    </div>
  )
}
```

(`input-base` is unlayered CSS with `width:100%`, so its width comes from the wrapper `div`: memory `first_run_setup_shipped`.)

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run src/components/plan/PlanSession.test.tsx`
Expected: PASS. If a query misses, fix the markup, not the test: the test's names are the spec's words.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/PlanSession.tsx src/components/plan/PlanSession.test.tsx
git commit -m "feat(plan): the month planning session — look back, plan, save"
```

---

### Task 7: Host it on the Month page

**Files:**
- Modify: `src/components/plan/PeriodPlanPage.tsx`
- Test: `src/components/plan/PeriodPlanPage.test.tsx`

**Interfaces:**
- Consumes: `PlanSession` (Task 6); `lookBackRows`, `emptyDraft`, `isEmptyDraft`, `SessionDraft` (Task 2); `readDraft`, `writeDraft`, `clearDraft` (Task 3); `applySession` (Task 4); `usePlanningSession`, `monthToken` (Task 5); `dropCommitment` (Task 1)

- [ ] **Step 1: Write the failing page tests** (add the mocks at the top of `PeriodPlanPage.test.tsx`)

```ts
const sessionState: { saved: null | { at: Date; authorId: string; notes: object }; mine: null | { wentWell: string; didnt: string }; loadedToken: string | null | 'auto'; error: string | null } = { saved: null, mine: null, loadedToken: 'auto', error: null }
const saveSession = vi.fn(async () => true)
const reloadSession = vi.fn()
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: (_h: string, token: string) => ({ saved: sessionState.saved, mine: sessionState.mine, loading: false,
    loadedToken: sessionState.loadedToken === 'auto' ? token : sessionState.loadedToken, error: sessionState.error, reload: reloadSession, save: saveSession }),
  monthToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`,
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
```

and the tests (reset `sessionState.saved = null; sessionState.mine = null; sessionState.loadedToken = 'auto'; sessionState.error = null; saveSession.mockClear(); reloadSession.mockClear()` in `beforeEach`, and restore `hook.addTask`'s default `vi.fn(async () => 'new')` implementation; import `cleanup` from `@testing-library/react`; make `hook.dropCommitment` and `hook.keepForward` default to resolving truthy: `dropCommitment: vi.fn(async () => true), keepForward: vi.fn(async (id: string) => id)`, and `updateTask: vi.fn(async () => true)`):

```ts
  it('offers "Plan <Month>" on the current month, and "Planned <date>" once saved', () => {
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeInTheDocument()
  })

  it('shows the planned state when a household member saved this month', () => {
    sessionState.saved = { at: new Date(2026, 8, 29), authorId: 'u2', notes: {} }
    renderPage('month')
    expect(screen.getByText(/planned sep 29/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review the plan/i })).toBeInTheDocument()
  })

  it('runs a session end to end: keep a goal with a next action, save, return to the page with the week line', async () => {
    state.tasks = [task({ id: 'g1', title: 'Strength', isGoal: true, monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: 'Book PT' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.keepForward).toHaveBeenCalledWith('g1', { monthStart: expect.any(Date) }, expect.any(Date))
    expect((hook.keepForward.mock.calls[0][2] as Date).getMonth()).toBe(lastMonth.getMonth())   // carried FROM last month
    expect(hook.addTask).toHaveBeenCalledWith('Book PT', undefined, undefined, undefined, expect.objectContaining({ bucket: 'month', goalTaskId: 'g1' }))
    expect(await screen.findByRole('button', { name: /plan the week/i })).toBeInTheDocument()
  })

  it('a failed save keeps the unsaved items as the draft, stays open, and does not say planned', async () => {
    state.tasks = [task({ id: 'p1', title: 'Photos', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    hook.dropCommitment.mockResolvedValueOnce(false)
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't save/i)
    expect(saveSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /plan the week/i })).toBeNull()
    const stored = Object.keys(localStorage).find((k) => k.startsWith('symphony.planSession.u1.month.'))
    expect(JSON.parse(localStorage.getItem(stored!)!).verdicts).toEqual({ p1: 'drop' })
  })

  it('"Review the plan" reopens with my saved notes, so a re-save never blanks them', () => {
    sessionState.saved = { at: new Date(2026, 8, 29), authorId: 'u1', notes: { wentWell: 'bike rack', didnt: 'strength slipped' } }
    sessionState.mine = { wentWell: 'bike rack', didnt: 'strength slipped' }
    state.tasks = [task({ id: 'o1', title: 'Old', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /review the plan/i }))
    expect(screen.getByLabelText(/what went well/i)).toHaveValue('bike rack')
    expect(screen.getByLabelText(/what didn't/i)).toHaveValue('strength slipped')
  })

  it('planning NEXT month from this one writes the season pull into next month, not today\'s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 20, 10))   // Sun Sep 20 2026
    try {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)   // import { periodStartFor } from '@/lib/placement/model'
    state.tasks = [task({ id: 'b1', title: 'Get three bids', bucket: 'quarter', seasonStart, commitments: [{ level: 'season', periodStart: seasonStart, status: 'open' }] })]
    renderPageAt('month', '/month?start=2026-10-01')                                     // explicitly October
    const label = 'October'
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`add to ${label}: get three bids`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(hook.updateTask).toHaveBeenCalledWith('b1', expect.objectContaining({ bucket: 'month', monthStart: expect.any(Date) })))
    const monthStart = (hook.updateTask.mock.calls.find((c) => c[0] === 'b1')![1] as { monthStart: Date }).monthStart
    expect(monthStart.getMonth()).toBe(9)                                                 // October, while "today" is September
    expect(hook.pushTask).not.toHaveBeenCalledWith('b1', 'month')
    } finally { vi.useRealTimers() }
  })

  it('a failed read keeps planning closed and offers Try again', () => {
    sessionState.loadedToken = null
    sessionState.error = 'offline'
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reloadSession).toHaveBeenCalled()
  })

  it('cannot open a session until THIS month\'s saved record has loaded', () => {
    sessionState.loadedToken = null
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeDisabled()
  })

  it('a reload mid-save resumes from the persisted progress without re-creating what landed', async () => {
    // First save: the goal lands, then the task create fails (as if the page died there).
    hook.addTask.mockImplementation(async (_t: string, _a?: unknown, _b?: unknown, _c?: unknown, o?: { id: string; isGoal?: boolean }) => (o?.isGoal ? o.id : undefined))
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new goal for ${label}`, 'i')), { target: { value: 'Three bids' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new task for ${label}`, 'i')), { target: { value: 'Call Hughes' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`toward a ${label} goal`, 'i')), { target: { value: screen.getByRole('option', { name: 'Three bids' }).getAttribute('value')! } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await screen.findByRole('alert')
    const key = Object.keys(localStorage).find((k) => k.startsWith('symphony.planSession.u1.month.'))!
    const persisted = JSON.parse(localStorage.getItem(key)!)
    expect(persisted.newGoals).toEqual([])                       // the goal is recorded as written
    expect(persisted.created).toHaveLength(1)
    expect(persisted.newTasks[0].linkId).toBe(persisted.created[0])
    const goalCreates = hook.addTask.mock.calls.filter((c) => (c[4] as { isGoal?: boolean })?.isGoal).length
    // "Reload": remount, reopen, save again — only the task is attempted.
    cleanup()
    hook.addTask.mockImplementation(async (_t: string, _a?: unknown, _b?: unknown, _c?: unknown, o?: { id: string }) => o?.id)
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Continue planning ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask.mock.calls.filter((c) => (c[4] as { isGoal?: boolean })?.isGoal).length).toBe(goalCreates)
  })

  it('Close keeps the draft and the button then says Continue', () => {
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(/what went well/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /close · keep my draft/i }))
    expect(screen.getByRole('button', { name: `Continue planning ${label}` })).toBeInTheDocument()
  })
```

The third test needs the previous month to exist on the page. `renderPage('month')` opens the planning period chosen by `planningPeriod`; if that is next month near a boundary, `lastMonth` is not "previous". If the test is flaky around month ends, pin the date with `vi.setSystemTime(new Date(2026, 9, 10))` inside the test, and move the `thisMonth`/`lastMonth` constants into a helper that reads `new Date()` after the time is set. See memory `tend_tests_rot_on_wall_clock`.

- [ ] **Step 2: Run them and check that they fail**

Run: `npx vitest run src/components/plan/PeriodPlanPage.test.tsx`
Expected: the four new tests FAIL, with no "Plan <Month>" button.

- [ ] **Step 3: Wire the page** (month only; season and year keep today's behaviour)

In `PeriodPlanPageInner`:

```tsx
  // ── Guided planning (Phase 1: month) ────────────────────────────────────
  const { user } = useAuth()
  const sessionEnabled = level === 'month'
  const token = monthToken(bounds.start)
  const { saved: savedSession, mine: myNotes, loadedToken, error: sessionReadError, reload: reloadSession, save: saveSession } = usePlanningSession('monthly', token)
  // Open only on THIS month's loaded record — never on a blank or a neighbour's (review 2026-09-21).
  const sessionReady = loadedToken === token
  const periodYmd = localYmd(bounds.start)
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [savingSession, setSavingSession] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => { setSessionOpen(false); setJustSaved(false); setSaveError(false); setDraft(sessionEnabled ? readDraft(user?.id ?? null, periodYmd) : null) }, [periodYmd, sessionEnabled, user?.id])

  const back = useMemo(() => (sessionEnabled ? lookBackRows(layered, bounds.prev) : { finished: [], open: [] }), [sessionEnabled, layered, bounds.prev])
  const currentMonth = useMemo(() => (sessionEnabled ? selectPeriodTasks(layered, 'month', bounds.start, isCurrent, meId, seasons).filter((t) => !t.completed) : []), [sessionEnabled, layered, bounds.start, isCurrent, meId, seasons])
  const aboveTasks = useMemo(() => (sessionEnabled && above === 'season'
    ? selectPeriodTasks(layered, 'season', aboveStart, isCurrentPeriod(periodBounds('season', aboveStart, seasons), today), meId, seasons).filter((t) => !t.completed)
    : []), [sessionEnabled, above, layered, aboveStart, seasons, today, meId])

  // Reopening a saved plan starts from MY saved notes, so saving again never
  // writes blank reflections over them (review 2026-09-21).
  const startSession = useCallback(() => {
    if (!sessionReady) return
    setDraft((d) => d ?? readDraft(user?.id ?? null, periodYmd)
      ?? { ...emptyDraft(bounds.start, bounds.prev), wentWell: myNotes?.wentWell ?? '', didnt: myNotes?.didnt ?? '' })
    setSaveError(false)
    setSessionOpen(true)
  }, [sessionReady, user?.id, periodYmd, bounds.start, bounds.prev, myNotes])
  const changeDraft = useCallback((d: SessionDraft) => { setDraft(d); writeDraft(user?.id ?? null, d) }, [user?.id])
  const closeSession = useCallback(() => setSessionOpen(false), [])
  const saveDraft = useCallback(async () => {
    if (!draft) return
    setSavingSession(true)
    const result = await applySession(draft, {
      keep: async (id, monthStart, prevStart) => !!(await keepForward(id, { monthStart }, prevStart)),
      addTask: (title, o) => addTask(title, undefined, undefined, undefined, {
        id: o.id, bucket: 'month', monthStart: o.monthStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: soleDomain,
      }),
      // updateTask reports whether it wrote; toggleTask does not.
      complete: (id) => gated.updateTask(id, { completed: true }),
      someday: (id) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }),
      drop: (id, prevStart) => dropCommitment(id, 'month', prevStart),
      // The SESSION's month — pushTask(id, 'month') would target the month
      // containing today, i.e. September while planning October.
      takeIntoMonth: (id, monthStart) => gated.updateTask(id, { bucket: 'month', monthStart }),
      saveSession: (notes) => saveSession(notes),
    }, (id) => !!tasks.find((t) => t.id === id)?.completed,
    // Persist after EVERY write, so a reload mid-save resumes from here.
    (remaining) => writeDraft(user?.id ?? null, remaining))
    setSavingSession(false)
    if (!result.ok) {
      // Keep only what did not write — Save again retries exactly that.
      setDraft(result.remaining)
      writeDraft(user?.id ?? null, result.remaining)
      setSaveError(true)
      return
    }
    clearDraft(user?.id ?? null, periodYmd)
    setDraft(null)
    setSaveError(false)
    setSessionOpen(false)
    setJustSaved(true)
  }, [draft, keepForward, addTask, soleDomain, gated, dropCommitment, saveSession, tasks, user?.id, periodYmd])
```

Imports to add: `useAuth` (the path confirmed in Task 5), `usePlanningSession` and `monthToken`, `PlanSession`, `lookBackRows`, `emptyDraft`, `isEmptyDraft`, `type SessionDraft` from `@/lib/planning/session`, `readDraft`, `writeDraft` and `clearDraft`, `applySession`, and `localYmd` from `@/lib/cadence/config`. Destructure `dropCommitment` from `useSupabaseTasks()` if Task 1 hasn't already. `toggleTask` is no longer used by the session.

**Check before wiring:** confirm that `updateTask(id, { completed: true })` stamps `completed_at` and mirrors `done` onto open commitments, the way `toggleTask` does. `planPlacement` handles the commitments (see "Completion mirrors onto the commitments"). For `completed_at`, grep `completed_at` in `useSupabaseTasks.ts`. If only `toggleTask` stamps it, add a `completed_at` write to `updateTask`'s `completed` path, and add a test in that hook's test file.

Render: directly below the "lens label / Review <prev>" line and above the grid, add the planning bar. When `sessionOpen && draft`, render `PlanSession` **instead of** the existing grid:

```tsx
      {sessionEnabled && !isPast && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-neutral-500">
            {sessionReadError
              ? <>Couldn't check whether {shortLabel} is planned. <button type="button" onClick={reloadSession} className="font-semibold text-primary-700 hover:underline">Try again</button></>
              : savedSession ? <span className="font-semibold text-sage-600">Planned {formatShortDate(savedSession.at)}</span> : 'Not planned yet'}
          </p>
          <span className="flex-1" />
          {!sessionOpen && (
            <button type="button" onClick={startSession} disabled={!sessionReady} aria-busy={!sessionReady}
              className={savedSession ? 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm' : 'rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white'}>
              {savedSession ? 'Review the plan' : draft && !isEmptyDraft(draft) ? `Continue planning ${shortLabel}` : `Plan ${shortLabel}`}
            </button>
          )}
        </div>
      )}
      {justSaved && !sessionOpen && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-sage-50 px-3 py-2 text-sm">
          <span>✓ {shortLabel} is planned. When you're ready, plan the week with {shortLabel} beside you.</span>
          <button type="button" onClick={() => navigate('/week')} className="rounded-md bg-primary-600 px-3 py-1 text-[13px] font-semibold text-white">Plan the week →</button>
        </div>
      )}
      {sessionOpen && draft ? (
        <PlanSession periodLabel={shortLabel} prevLabel={prevPeriodLabel}
          finished={back.finished} open={back.open} current={currentMonth}
          above={aboveTasks.filter((t) => !t.isGoal)} aboveGoals={aboveTasks.filter((t) => t.isGoal)}
          draft={draft} onChange={changeDraft} onClose={closeSession} onSave={saveDraft} saving={savingSession} saveError={saveError} />
      ) : (
        /* the existing <div className="grid ..."> … </div> unchanged */
      )}
```

(`shortLabel`, `prevPeriodLabel`, `aboveStart`, `above`, `isCurrent` and `navigate` already exist in this component. Move the new block below their declarations. If `formatShortDate` returns "Sep 29", the test regex `/planned sep 29/i` passes.)

- [ ] **Step 4: Run the page tests**

Run: `npx vitest run src/components/plan/`
Expected: every test PASSES, old and new.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/components/plan src/lib/planning src/hooks/usePlanningSession.ts src/lib/placement/intentions.ts src/hooks/useSupabaseTasks.ts`
Expected: no type errors and 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/plan/PeriodPlanPage.tsx src/components/plan/PeriodPlanPage.test.tsx
git commit -m "feat(plan): Plan <Month> on the month page — session, Planned <date>, the week line"
```

---

### Task 8: Verify end to end

**Files:** none (verification only)

- [ ] **Step 1: Full suite and build**

Run: `npx vitest run && npm run build`
Expected: everything passes except the known `connectors/src/whatsapp/adapter.test.ts` load failure. The build succeeds.

- [ ] **Step 2: Walk it on the demo account** (dev server in the worktree; the browser is signed in as `symphonygoals@gmail.com` only; memory `automation_browser_demo_account`)

Seed September for the demo user with read-only-safe inserts through the app (Month page → previous month → add a goal and two tasks), or ask Scott first before any direct SQL. Then on `/month`:
1. "Plan <Month>" appears. Click it. Look back shows September's actual list and both boxes.
2. Goal → "Keep, and add a next action" plus a title. One task → Keep. One task → Drop.
3. Plan: add a goal "for" a season goal, add a task toward it, and "+ Add to <Month>" a season task.
4. Save lists every line. Save → back on the month page with "Planned <today>" and "Plan the week →".
5. SQL check (read-only, demo uid only):
   - The dropped task still exists, and its September `task_commitments` row is `removed`.
   - The kept goal has one `carried` September row and one `open` new-month row, with the same task id.
   - The next action has `goal_task_id` = the goal.
   - The `planning_sessions` row has `notes.savedAt`.
6. Close mid-session and reload: "Continue planning <Month>" and the draft restore.
7a. Reload the page in the middle of a Save (throttle the network in DevTools, then reload once the first request lands). Reopen with "Continue planning", save again, and check with SQL that no goal or task title exists twice for the demo user.
7. "Review the plan" on the saved month: the two notes are pre-filled with what you saved. Save again, then check SQL: `notes` is unchanged except `savedAt`.
8. Plan the NEXT month while still in the current one (use the page's › arrow): pull a season task, save, and check SQL that its new month commitment is the next month, not the current one.
9. Repeat steps 1–4 at 390px (memory `narrow_screen_check_without_login`). There must be no horizontal scroll, and the chips must wrap.

- [ ] **Step 3: Push and open a draft PR** (do not merge; Scott approves merges)

```bash
git push -u origin claude/guided-planning-month
gh pr create --draft --title "Guided planning, phase 1: plan the month" --body "<summary · what was verified on demo · what was not>"
```
