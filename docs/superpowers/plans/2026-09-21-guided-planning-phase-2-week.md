# Guided Planning Phase 2: Week List and Daily Picking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The week gets its own list and its own planning session: "This week's list" on the Week page (tasks only, ticked rows stay visible and struck), a "Plan this week" session (look back at last week's actual list with Keep · Done · Someday · Drop, plan the week with the month beside you and "+ Add to this week", save everything at once, "Planned <date>"), and Choose tasks on Today reads that same week list, where a row picked for today stays on the list marked "Planned today".

**Architecture:** One records-aware selector, `weekListTasks`, defines "on this week's list" and is read by the Week page, the Choose tasks panel and the week session. The Phase 1 session model (`session.ts`, `applySession.ts`, `PlanSession.tsx`) is generalised from `level: 'month'` to `level: 'month' | 'week'`; the week's differences are data (no goals section, an optional day on a new task, the month as the rail, "kept from last week"). The month page's session-hosting logic (read the record, hold the draft, prune, save through injected writers) moves into one hook, `usePlanSessionHost`, which the month page keeps using unchanged and the Week page now uses too. Writes reuse the existing funnels: `keepForward` learns `{ weekStart }`, `dropCommitment` already takes `'week'`, `updateTask({ bucket: 'week', weekStart })` copies a month task down and keeps the month commitment (`planPlacement`, "moving down keeps the higher ones"). A saved week session is one `planning_sessions` row (horizon `weekly`, token `YYYY-M-D` of the week's first day).

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind v4, Supabase JS, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (Phase 2). Phase 1 plan (shipped as #48): `docs/superpowers/plans/2026-09-21-guided-planning-phase-1-month.md`. Prototype: `~/Documents/scotts-world/projects/symphony-os/briefs/2026-09-21-planning-prototype-v4.html` (`weekPage()`, `wplan`, `pane()`).

## Global Constraints

- Work in the worktree `.claude/worktrees/guided-planning-week`, branch `claude/guided-planning-week`, created from origin/main `0f01fd2a` (Phase 1 merged). Never edit the main worktree. One PR for the whole phase.
- Node: `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH`. Run tests with `npx vitest run <path>`; `npm test` is watch mode. Typecheck with `npx tsc --noEmit -p tsconfig.app.json`; the root tsc is a no-op.
- Import from `src/` with `@/`. Follow the Nordic Journal styling in `src/index.css`; reuse the classes already used in `PlanSession.tsx`, `WeekJournal.tsx` and `DayPlanPanel.tsx`.
- **The week list holds tasks only.** A goal never appears on it, in the session or in Choose tasks (Scott, 2026-09-21: "it's not a task, it's a goal"). The week session has no Goals section and no "Keep, and add a next action".
- **The week list stays whole all week.** A ticked row stays on it, struck through. A row picked for today stays on it, marked "Planned today". A row given a day stays on it with its day shown. Nothing on the list is removed by planning a day.
- **The month is a reference beside the week, never moved.** "+ Add to this week" copies the task down: it stays on the month list, which shows "on this week" (existing `lowerPlacement`).
- **Look-back is last week's ACTUAL list**: what got ticked off, then what is still open, each open row with Keep · Done · Someday · Drop. Keep carries the same task (same id) into this week and marks last week's commitment `carried`. Drop ends only last week's commitment.
- **Nothing is written before Save.** Close keeps a local draft, per user and per week.
- **No counts or scores** in any new copy. Copy under the reflection boxes: "Visible to your household."
- Routines are unchanged. Routine occurrences are not on the week list (they keep their own rows in Choose tasks, exactly as today).
- Never partially `upsert` `tasks` (memory rule). Every task write goes through `useSupabaseTasks` functions named here.
- No new migration. `planning_sessions.horizon` already allows `'weekly'` (`supabase/migrations/2026-06-08_planning_sessions.sql:9`).
- Week start = `weekStartAnchor(date, readCadenceConfig().weekStartsOn)` everywhere (the same anchor `WeekViewV2` publishes and `belongsToWeek` uses). The week's "month beside you" is the month containing the week's fourth day (`weekStart + 3`), so a week straddling a month boundary plans against the month most of it is in.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/planning/weekList.ts` (new) | `weekListTasks()`: the ONE definition of "on this week's list" (records-aware, tasks only, scoped to me); `weekRowNote()`: the quiet line under a row |
| `src/lib/today/dayPlan.ts` (modify) | `toPlanEntries` and `weekListEntries` read `weekListTasks`; picked and done rows stay |
| `src/components/reference/DayPlanPanel.tsx` (modify) | A done row on the week list renders struck with no verb (already true), the "Planned today" mark is kept; only the row's context line changes |
| `src/hooks/useSupabaseTasks.ts` (modify) | `keepForward(id, { weekStart }, from)` |
| `src/hooks/usePlanningSession.ts` (modify) | `horizon: 'weekly' \| 'monthly'`; `weekToken()` |
| `src/lib/planning/sessionDraft.ts` (modify) | Draft key carries the level |
| `src/lib/planning/session.ts` (modify) | `SessionLevel`, `SessionDraft.level`, `NewItem.day`, `lookBackRows(level)`, `goalsWithHiddenSteps(level)`, `summarize(level)` labels |
| `src/lib/planning/applySession.ts` (modify) | Level-neutral writer names (`periodStart`, `takeInto`), `day` on a created task |
| `src/components/plan/PlanSession.tsx` (modify) | `level` prop: week hides Goals, adds "Any day ▾" on a new task, rail titled with the month |
| `src/hooks/usePlanSessionHost.ts` (new) | The session-hosting state extracted from `PeriodPlanPage` (record, draft, prune, save, banners) |
| `src/components/plan/PeriodPlanPage.tsx` (modify) | Uses `usePlanSessionHost`; behaviour unchanged |
| `src/components/home/week/WeekList.tsx` (new) | "This week's list" section: tick, title, note, day tag |
| `src/components/home/week/WeekPlanHost.tsx` (new) | Planned status, "Plan this week" button, the session in place of the journal, the "Go to Today →" banner |
| `src/components/home/week/WeekViewV2.tsx` (modify) | Renders `WeekPlanHost` and `WeekList` above the journal |

---

### Task 0: The week list, defined once

**Files:**
- Create: `src/lib/planning/weekList.ts`
- Test: `src/lib/planning/weekList.test.ts`

**Interfaces:**
- Consumes: `onPeriod(tasks, 'week', weekStart, { isCurrent })` from `@/lib/placement/model` (records-aware; includes done and dated rows); `doableBy(t, meId)` from `@/lib/planning/poolViews`; `isFocused(t, userId, ymd)`, `openCommitment(t, 'month')`, `lowerPlacement` from `@/lib/placement/model`; `localYmd` from `@/lib/cadence/config`.
- Produces:
  ```ts
  export function weekListTasks(tasks: readonly Task[], weekStart: Date, meId: string | null, opts?: { isCurrent?: boolean }): Task[]
  export interface WeekRowNote { origin?: 'month' | 'kept'; monthLabel?: string; dayLabel?: string; pickedToday: boolean }
  export function weekRowNote(t: Task, weekStart: Date, userId: string | null | undefined, todayYmd: string): WeekRowNote
  export function weekRowNoteText(n: WeekRowNote): string | undefined
  ```
  `weekListTasks` returns, in creation order, every non-goal task with a week commitment for `weekStart` (`committedTo !== undefined`, including `done` and `carried`-into rows, EXCLUDING rows whose week commitment for this week has status `carried` or `removed`), that `doableBy(meId)` when `meId` is set. Subtasks are not flattened (a step is its own row only if it has its own commitment).
  `weekRowNote`: `origin: 'kept'` when the task's week commitment for the PREVIOUS week (`weekStart − 7 days`) has `status === 'carried'` and `carriedTo` is this week; else `origin: 'month'` with `monthLabel` (`"October"`) when `openCommitment(t, 'month')` exists or `t.bucket === 'month'`; `dayLabel` = short weekday (`"Thu"`) when `t.scheduledFor` falls inside the week; `pickedToday = isFocused(t, userId, todayYmd)`.
  `weekRowNoteText`: `"kept from last week"` / `"from October"` (origin), then `" · Thu"` when dated, then `" · picked for today"` when picked; joined with `" · "`; `undefined` when empty.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/planning/weekList.test.ts
import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import { weekListTasks, weekRowNote, weekRowNoteText } from './weekList'

const WEEK = new Date(2026, 9, 4)   // Sunday Oct 4, 2026
const LAST = new Date(2026, 8, 27)  // Sunday Sep 27
const c = (level: 'week' | 'month', periodStart: Date, status: 'open' | 'done' | 'carried' | 'removed' = 'open', carriedTo?: Date) =>
  ({ level, periodStart, status, carriedTo })

describe('weekListTasks', () => {
  it('is every task committed to the week, done rows included, goals excluded, in creation order', () => {
    const a = createMockTask({ id: 'a', title: 'A', bucket: 'week', weekStart: WEEK, createdAt: new Date(2026, 9, 1), commitments: [c('week', WEEK)] })
    const done = createMockTask({ id: 'd', title: 'D', bucket: 'week', weekStart: WEEK, completed: true, createdAt: new Date(2026, 8, 30), commitments: [c('week', WEEK, 'done')] })
    const goal = createMockTask({ id: 'g', title: 'G', isGoal: true, bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    const other = createMockTask({ id: 'o', title: 'O', bucket: 'week', weekStart: LAST, commitments: [c('week', LAST)] })
    expect(weekListTasks([a, done, goal, other], WEEK, null).map((t) => t.id)).toEqual(['d', 'a'])
  })

  it('keeps a row that was picked for today (dated + focused) and a row given a day', () => {
    const picked = createMockTask({ id: 'p', bucket: 'timed', scheduledFor: new Date(2026, 9, 6), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 9, 6) }], commitments: [c('week', WEEK)] })
    const dated = createMockTask({ id: 'x', bucket: 'timed', scheduledFor: new Date(2026, 9, 8), isAllDay: true, commitments: [c('week', WEEK)] })
    expect(weekListTasks([picked, dated], WEEK, null).map((t) => t.id)).toEqual(['p', 'x'])
  })

  it('drops a row whose commitment for this week was carried forward or removed', () => {
    const carried = createMockTask({ id: 'c', commitments: [c('week', WEEK, 'carried', new Date(2026, 9, 11))] })
    const removed = createMockTask({ id: 'r', commitments: [c('week', WEEK, 'removed')] })
    expect(weekListTasks([carried, removed], WEEK, null)).toEqual([])
  })

  it('is scoped to me exactly as the month page is: a row assigned only to someone else is not mine', () => {
    const theirs = createMockTask({ id: 't', bucket: 'week', weekStart: WEEK, assignedTo: 'them', commitments: [c('week', WEEK)] })
    const shared = createMockTask({ id: 's', bucket: 'week', weekStart: WEEK, assignedToAll: ['me', 'them'], commitments: [c('week', WEEK)] })
    expect(weekListTasks([theirs, shared], WEEK, 'me').map((t) => t.id)).toEqual(['s'])
  })

  it('a legacy row (no records) with the week bucket and stamp is on the list', () => {
    const legacy = createMockTask({ id: 'l', bucket: 'week', weekStart: WEEK, commitments: undefined })
    expect(weekListTasks([legacy], WEEK, null).map((t) => t.id)).toEqual(['l'])
  })
})

describe('weekRowNote', () => {
  it('says where the row came from, its day, and whether it is picked for today', () => {
    const t = createMockTask({ id: 'k', bucket: 'timed', scheduledFor: new Date(2026, 9, 8), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 9, 6) }],
      commitments: [c('week', LAST, 'carried', WEEK), c('week', WEEK), c('month', new Date(2026, 9, 1))] })
    const n = weekRowNote(t, WEEK, 'me', '2026-10-06')
    expect(n).toEqual({ origin: 'kept', monthLabel: 'October', dayLabel: 'Thu', pickedToday: true })
    expect(weekRowNoteText(n)).toBe('kept from last week · Thu · picked for today')
  })
  it('a month task copied down says "from October"; a plain row says nothing', () => {
    const m = createMockTask({ id: 'm', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK), c('month', new Date(2026, 9, 1))] })
    expect(weekRowNoteText(weekRowNote(m, WEEK, 'me', '2026-10-06'))).toBe('from October')
    const p = createMockTask({ id: 'p', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    expect(weekRowNoteText(weekRowNote(p, WEEK, 'me', '2026-10-06'))).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/planning/weekList.test.ts`
Expected: FAIL, "Cannot find module './weekList'".

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/weekList.ts
//
// "This week's list" (spec: guided planning, Phase 2). ONE definition, read by
// the Week page, the Choose tasks panel and the week session, so no two
// surfaces disagree about what is on a week. Records-aware (committedTo): a
// row picked for today (dated + focused) or given a day is STILL on the list —
// the list stays whole all week (Scott, 2026-09-21). Tasks only; a goal lives
// on its month, season or year and is never on a week.

import type { Task } from '@/types/task'
import { committedTo, isFocused, openCommitment, sameDay } from '@/lib/placement/model'
import { doableBy } from './poolViews'

export function weekListTasks(tasks: readonly Task[], weekStart: Date, meId: string | null, opts: { isCurrent?: boolean } = {}): Task[] {
  const out: Task[] = []
  for (const t of tasks) {
    if (t.isGoal) continue
    if (meId && !doableBy(t, meId)) continue
    const c = committedTo(t, 'week', weekStart, { isCurrent: opts.isCurrent ?? true })
    if (!c) continue
    if (c !== 'legacy' && (c.status === 'carried' || c.status === 'removed')) continue
    out.push(t)
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

export interface WeekRowNote { origin?: 'month' | 'kept'; monthLabel?: string; dayLabel?: string; pickedToday: boolean }

export function weekRowNote(t: Task, weekStart: Date, userId: string | null | undefined, todayYmd: string): WeekRowNote {
  const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7)
  const keptFromLast = (t.commitments ?? []).some((c) => c.level === 'week' && c.status === 'carried' && sameDay(c.periodStart, prev) && !!c.carriedTo && sameDay(c.carriedTo, weekStart))
  const month = openCommitment(t, 'month')?.periodStart ?? (t.bucket === 'month' ? t.monthStart : undefined)
  const monthLabel = month ? month.toLocaleDateString('en-US', { month: 'long' }) : undefined
  const end = new Date(weekStart); end.setDate(end.getDate() + 7)
  const dayLabel = t.scheduledFor && t.scheduledFor >= weekStart && t.scheduledFor < end
    ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' }) : undefined
  return { origin: keptFromLast ? 'kept' : monthLabel ? 'month' : undefined, monthLabel, dayLabel, pickedToday: isFocused(t, userId, todayYmd) }
}

export function weekRowNoteText(n: WeekRowNote): string | undefined {
  const parts: string[] = []
  if (n.origin === 'kept') parts.push('kept from last week')
  else if (n.origin === 'month' && n.monthLabel) parts.push(`from ${n.monthLabel}`)
  if (n.dayLabel) parts.push(n.dayLabel)
  if (n.pickedToday) parts.push('picked for today')
  return parts.length ? parts.join(' · ') : undefined
}
```

Check that `sameDay` is exported from `@/lib/placement/model` (it is used inside that file; if it is not exported, export it). `createMockTask` must accept `commitments` and `focus`; if the factory strips them, spread them after the factory call in the tests.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/planning/weekList.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/weekList.ts src/lib/planning/weekList.test.ts
git commit -m "feat(planning): one definition of this week's list"
```

---

### Task 1: Choose tasks reads the week list; picked rows stay

**Files:**
- Modify: `src/lib/today/dayPlan.ts` (`weekListEntries` ~line 146, `toPlanEntries` ~line 170)
- Modify: `src/components/reference/DayPlanPanel.tsx` (the row's context line, ~lines 223–231, and the "To plan" empty copy ~line 447)
- Test: `src/lib/today/dayPlan.test.ts`, `src/components/reference/DayPlanPanel.weekPage.test.tsx`

**Interfaces:**
- Consumes: `weekListTasks`, `weekRowNote`, `weekRowNoteText` (Task 0).
- Produces: `toPlanEntries` returns, first, every row of `weekListTasks(tasks, weekStart, null)` filtered by `match(t.assignedTo, t.assignedToAll)`, as `DayPlanEntry { group: 'plan', planned: isFocused(t, userId, ymd), completed: t.completed, context: weekRowNoteText(note without pickedToday) }`. A picked row is NOT skipped any more; a done row is NOT skipped. Routine rows are unchanged. `weekListEntries` (feeds `plan.week`) uses the same selector. Row order inside the group is by `rank()` in the panel (outstanding, planned, done), unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/today/dayPlan.test.ts` (a new `describe`, using the file's existing `input()` helper; `WEEK` there is Sunday Sep 13, `SAT` Sep 19):

```ts
describe('toPlan — the week list stays whole (guided planning, Phase 2)', () => {
  const onWeek = (over: Partial<Task>) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

  it('a row picked for today stays on the list, marked planned', () => {
    const t = onWeek({ id: 'w1', title: 'Book the plumber', bucket: 'timed', scheduledFor: new Date(2026, 8, 19), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 8, 19) }] })
    const plan = selectDayPlan(input({ tasks: [t], userId: 'me' }))
    expect(plan.toPlan.map((e) => [e.id, e.planned])).toEqual([['w1', true]])
  })

  it('a ticked row stays on the list, completed', () => {
    const t = onWeek({ id: 'w2', title: 'Done thing', completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] })
    const plan = selectDayPlan(input({ tasks: [t] }))
    expect(plan.toPlan.map((e) => [e.id, e.completed])).toEqual([['w2', true]])
  })

  it('a row given a day this week stays, with its day as context', () => {
    const t = onWeek({ id: 'w3', bucket: 'timed', scheduledFor: new Date(2026, 8, 17), isAllDay: true })
    const plan = selectDayPlan(input({ tasks: [t] }))
    expect(plan.toPlan[0]).toMatchObject({ id: 'w3', context: 'Thu' })
  })

  it('a month task copied down says where it came from', () => {
    const t = onWeek({ id: 'w4', commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 8, 1), status: 'open' }] })
    expect(selectDayPlan(input({ tasks: [t] })).toPlan[0].context).toBe('from September')
  })

  it('a goal is never on the week list', () => {
    const g = onWeek({ id: 'g', isGoal: true })
    expect(selectDayPlan(input({ tasks: [g] })).toPlan).toEqual([])
  })
})
```

Add to `src/components/reference/DayPlanPanel.weekPage.test.tsx` (read the file first and follow its `plan`/`actions` fixtures):

```ts
it('a picked row stays on the list, marked "Planned today", with Undo instead of the verb', () => {
  const plan = basePlan({ toPlan: [{ key: 'task:p', kind: 'task', id: 'p', title: 'Book the plumber', completed: false, planned: true, group: 'plan', context: 'from October' }] })
  render(<DayPlanPanel plan={plan} day={DAY} actions={actions} weekPage={WEEK} />)
  expect(screen.getByText('Book the plumber')).toBeInTheDocument()
  expect(screen.getByText('Planned today')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /move book the plumber back off today/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /plan for today/i })).toBeNull()
})

it('a ticked row stays, struck, with no verb', () => {
  const plan = basePlan({ toPlan: [{ key: 'task:d', kind: 'task', id: 'd', title: 'Ordered the rack', completed: true, planned: false, group: 'plan' }] })
  render(<DayPlanPanel plan={plan} day={DAY} actions={actions} weekPage={WEEK} />)
  expect(screen.getByText('Ordered the rack')).toHaveClass('line-through')
  expect(screen.queryByRole('button', { name: /plan for/i })).toBeNull()
})
```

(`basePlan`, `DAY`, `WEEK`, `actions` are whatever that test file already names its fixtures; adapt the names, not the assertions.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/today/dayPlan.test.ts src/components/reference/DayPlanPanel.weekPage.test.tsx`
Expected: the five new dayPlan tests FAIL (picked/done rows missing, no context); the panel tests may already pass (the panel renders `planned`/`completed` rows today) — that is fine, they pin the contract.

- [ ] **Step 3: Implement**

In `src/lib/today/dayPlan.ts`:

```ts
import { weekListTasks, weekRowNote, weekRowNoteText } from '@/lib/planning/weekList'

export function weekListEntries(tasks: Task[], match: Match, weekStart: Date, ymd: string, userId?: string | null): DayPlanEntry[] {
  return weekListTasks(tasks, weekStart, null).filter((t) => match(t.assignedTo, t.assignedToAll)).map((t) => ({
    key: `task:${t.id}`, kind: 'task' as const, id: t.id, title: t.title, completed: t.completed,
    planned: isFocused(t, userId, ymd), group: 'week' as const, task: t,
  }))
}
```

In `toPlanEntries`, replace the "This week's undated tasks" loop with:

```ts
  // This week's list, whole: a row picked for today stays (marked planned, the
  // panel shows "Planned today" + Undo), a ticked row stays struck, a row with
  // a day shows it. The list is what you look at every day (Scott, 2026-09-21).
  for (const t of weekListTasks(tasks, weekStart, null)) {
    if (!match(t.assignedTo, t.assignedToAll)) continue
    const note = weekRowNote(t, weekStart, userId, ymd)
    push({
      key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed,
      planned: chosen(t), group: 'plan', task: t, context: weekRowNoteText({ ...note, pickedToday: false }),
    })
  }
```

Remove the now-unused `monthName` helper and the `openCommitment` import if nothing else uses them. Update the header comment of `toPlanEntries` (lines ~153–169) to say the list stays whole.

In `src/components/reference/DayPlanPanel.tsx`: the "To plan" empty copy becomes `Nothing on this week's list yet.` and, when `actions.addTask` exists, the button reads `Add to this week`. The row already shows `Planned today` when `entry.planned && !entry.completed` and falls back to `entry.context` otherwise; when both exist show `Planned today` and, beneath it, the context (a picked row from October still says where it came from). Change lines ~226–231 to:

```tsx
        {entry.planned && !entry.completed && <span className="block text-[11.5px] text-primary-700">Planned today</span>}
        {entry.context && <span className="block text-[11.5px] text-neutral-500">{entry.context}</span>}
```

Update the file header comment (lines 1–20) to say picked and ticked rows stay.

- [ ] **Step 4: Run the tests, then the neighbours**

Run: `npx vitest run src/lib/today src/components/reference src/components/home/week`
Expected: PASS. If `ReferenceLists.test.tsx` or `WeekViewV2.test.tsx` fail because a fixture row was expected to disappear after a pick, update that expectation: the row stays, `planned: true`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/dayPlan.ts src/lib/today/dayPlan.test.ts src/components/reference/DayPlanPanel.tsx src/components/reference/DayPlanPanel.weekPage.test.tsx
git commit -m "feat(today): Choose tasks reads this week's list; a picked row stays, marked"
```

---

### Task 2: Week-level Keep, the weekly session record, the draft key

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` (`keepForward`, ~line 1511)
- Modify: `src/hooks/usePlanningSession.ts`
- Modify: `src/lib/planning/sessionDraft.ts`
- Test: `src/hooks/useSupabaseTasks.planWrites.test.ts`, `src/hooks/usePlanningSession.test.ts`, `src/lib/planning/sessionDraft.test.ts`

**Interfaces:**
- Produces: `keepForward(id, period: { weekStart?: Date; monthStart?: Date; seasonStart?: Date }, from?: Date)`; `level = period.weekStart ? 'week' : period.monthStart ? 'month' : period.seasonStart ? 'season' : null`. A week Keep of a goal is not a case (goals are not on weeks); the step-carrying branch stays gated on `task.isGoal` and is simply not reached.
- Produces: `usePlanningSession(horizon: 'weekly' | 'monthly', token)`; `export function weekToken(weekStart: Date): string` → `` `${y}-${m}-${d}` `` with month and day unpadded (matches `monthToken`'s style).
- Produces: `readDraft(userId, level, periodStart)`, `writeDraft(userId, d)` (reads `d.level`), `clearDraft(userId, level, periodStart)`; key `symphony.planSession.<user>.<level>.<periodStart>`. The old month key `…​.month.<start>` is unchanged for `level === 'month'`, so a Phase 1 draft survives.

- [ ] **Step 1: Write the failing tests**

`src/hooks/useSupabaseTasks.planWrites.test.ts` — add inside the existing describe that exercises `keepForward` (read the file's `seed`/`db` helpers first and use them; the fake db runs the mirror trigger):

```ts
it('keepForward carries a task from last week into this week: last week carried, this week open, month untouched', async () => {
  const last = new Date(2026, 8, 27), week = new Date(2026, 9, 4), month = new Date(2026, 9, 1)
  db.seed('tasks', [{ id: 't1', title: 'Plumber', bucket: 'week', week_start: localYmd(last), month_start: localYmd(month), completed: false, user_id: mockUser.id }])
  db.seed('task_commitments', [
    { id: 'c1', task_id: 't1', level: 'week', period_start: localYmd(last), status: 'open', carried_to: null, ended_at: null },
    { id: 'c2', task_id: 't1', level: 'month', period_start: localYmd(month), status: 'open', carried_to: null, ended_at: null },
  ])
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
```

`src/hooks/usePlanningSession.test.ts`:

```ts
it('builds the week token from the week\'s first day', () => {
  expect(weekToken(new Date(2026, 9, 4))).toBe('2026-10-4')
})
it('reads and saves a weekly session under the weekly horizon', async () => {
  const { result } = renderHook(() => usePlanningSession('weekly', '2026-10-4'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => { await result.current.save({ wentWell: 'w', didnt: 'd' }) })
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ horizon: 'weekly', period_token: '2026-10-4' }), expect.anything())
})
```
(import `weekToken` beside `monthToken`.)

`src/lib/planning/sessionDraft.test.ts` (read it; extend):

```ts
it('keys a draft by level, so a week draft and a month draft for the same day never collide', () => {
  const m = { ...emptyDraft('month', new Date(2026, 9, 1), new Date(2026, 8, 1)), wentWell: 'month' }
  const w = { ...emptyDraft('week', new Date(2026, 9, 1), new Date(2026, 8, 24)), wentWell: 'week' }
  writeDraft('u', m); writeDraft('u', w)
  expect(readDraft('u', 'month', '2026-10-01')?.wentWell).toBe('month')
  expect(readDraft('u', 'week', '2026-10-01')?.wentWell).toBe('week')
  clearDraft('u', 'week', '2026-10-01')
  expect(readDraft('u', 'week', '2026-10-01')).toBeNull()
  expect(readDraft('u', 'month', '2026-10-01')?.wentWell).toBe('month')
})
```
(`emptyDraft(level, …)` is Task 3's signature; write this test now and expect a type error until Task 3 lands — or land Task 3's `emptyDraft` signature change first. **Do Task 3 Step 3's `session.ts` change for `emptyDraft` before running this file**, or simplest: implement Tasks 2 and 3 in one working session but commit them separately.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts src/hooks/usePlanningSession.test.ts src/lib/planning/sessionDraft.test.ts`
Expected: FAIL — `keepForward` returns undefined for `{ weekStart }`; `weekToken` not exported; the horizon literal type rejects `'weekly'`; draft signature.

- [ ] **Step 3: Implement**

`useSupabaseTasks.ts` `keepForward`:

```ts
  const keepForward = useCallback(async (id: string, period: { weekStart?: Date; monthStart?: Date; seasonStart?: Date }, from?: Date): Promise<string | undefined> => {
    const task = findTaskById(id)
    if (!task) return undefined
    const level: PlacementLevel | null = period.weekStart ? 'week' : period.monthStart ? 'month' : period.seasonStart ? 'season' : null
    const to = period.weekStart ?? period.monthStart ?? period.seasonStart
    if (!level || !to) return undefined
    // … rest unchanged
```
Update the doc comment above it to list the week.

`usePlanningSession.ts`:

```ts
export function monthToken(start: Date): string { return `${start.getFullYear()}-${start.getMonth() + 1}` }
/** The week's first day, unpadded like monthToken: 2026-10-4. */
export function weekToken(weekStart: Date): string { return `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}` }
export type SessionHorizon = 'weekly' | 'monthly'
export function usePlanningSession(horizon: SessionHorizon, token: string) {
```

`sessionDraft.ts`:

```ts
import type { SessionDraft, SessionLevel } from './session'
const key = (userId: string | null, level: SessionLevel, periodStart: string) => `symphony.planSession.${userId ?? 'anon'}.${level}.${periodStart}`
export function readDraft(userId: string | null, level: SessionLevel, periodStart: string): SessionDraft | null { /* key(userId, level, periodStart) */ }
export function writeDraft(userId: string | null, d: SessionDraft): void { /* key(userId, d.level, d.periodStart) */ }
export function clearDraft(userId: string | null, level: SessionLevel, periodStart: string): void { /* … */ }
```
Update the three call sites in `PeriodPlanPage.tsx` (lines ~486, 518, 559, 566) to pass `'month'` — they move into the hook in Task 4 anyway.

- [ ] **Step 4: Run to verify they pass, then the whole hook suite**

Run: `npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts src/hooks/usePlanningSession.test.ts src/lib/planning/sessionDraft.test.ts src/hooks/useSupabaseTasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.planWrites.test.ts src/hooks/usePlanningSession.ts src/hooks/usePlanningSession.test.ts src/lib/planning/sessionDraft.ts src/lib/planning/sessionDraft.test.ts src/components/plan/PeriodPlanPage.tsx
git commit -m "feat(planning): Keep carries into a week; weekly session record; drafts keyed by level"
```

---

### Task 3: The session model learns the week

**Files:**
- Modify: `src/lib/planning/session.ts`
- Modify: `src/lib/planning/applySession.ts`
- Modify: `src/components/plan/PlanSession.tsx`
- Modify: `src/components/plan/PeriodPlanPage.tsx` (writer wiring, lines ~528–545; `emptyDraft` call ~519)
- Test: `src/lib/planning/session.test.ts`, `src/lib/planning/applySession.test.ts`, `src/components/plan/PlanSession.test.tsx`

**Interfaces:**
- Produces in `session.ts`:
  ```ts
  export type SessionLevel = 'month' | 'week'
  export interface NewItem { id: string; title: string; linkId?: string; context?: DomainId | null; /** Week only: an optional day (local YYYY-MM-DD) for a time-sensitive task. */ day?: string }
  export interface SessionDraft { level: SessionLevel; /* …unchanged… */ }
  export function emptyDraft(level: SessionLevel, periodStart: Date, prevStart: Date): SessionDraft
  export function lookBackRows(tasks, prevStart, meId, level: SessionLevel = 'month'): { finished; open }   // week: goals excluded
  export function verdictOptions(isGoal: boolean, level: SessionLevel = 'month')                          // week: never keep-action
  export function goalsWithHiddenSteps(all, shown, prevStart, level: SessionLevel = 'month'): Set<string>  // week: always empty
  export function summarize(d, ctx & { aboveLabel: string })                                              // labels from d.level
  ```
  Summary copy for the week (`P` = "this week" when current else "the week of Oct 4", `Q` = "last week" / "the week of Sep 27", `A` = `ctx.aboveLabel`, e.g. "October"): kept → `This week's tasks · kept from last week`; done → `Done last week`; someday → `Someday page`; drop → `Dropped from last week · the task is kept`; new task → `This week's tasks` + `, on Thu` when `day`; taken from above → `This week's tasks · stays on October, marked "on this week"`. Month copy is unchanged (`aboveLabel` = "the season" for the month; the existing string `stays on the season` must still be produced).
- Produces in `applySession.ts`:
  ```ts
  export interface SessionWriters {
    keep: (id: string, periodStart: Date, prevStart: Date) => Promise<boolean>
    addTask: (title: string, opts: { id: string; periodStart: Date; day?: Date; isGoal?: boolean; goalTaskId?: string; context: DomainId | null }) => Promise<string | undefined>
    contextOf; complete; someday
    drop: (id: string, prevStart: Date) => Promise<boolean>
    takeInto: (id: string, periodStart: Date) => Promise<boolean>
    saveSession
  }
  ```
  (`monthStart` → `periodStart`, `takeIntoMonth` → `takeInto`; `day` passed through from `NewItem.day` via `parseLocalYmd`.)
- Produces in `PlanSession.tsx`: new props `level: SessionLevel`, `aboveLabel: string`, `dayOptions?: Array<{ ymd: string; label: string }>` (the week's seven days, given by the host). For `level === 'week'`: no Goals heading or goal composer; the "toward a goal" select is absent; the task composer gets an `Any day ▾` select (`aria-label="Day for this task"`, options `Any day` + `dayOptions`) whose value is stored as `NewItem.day`; new-task rows show `on Thu`; the rail is titled `aboveLabel` and lists `aboveGoals` (the month's goals, reference) then `above` (the month's tasks) with `+ Add to this week`; the Look back heading reads `How did last week go?` with the sub-line `This is last week's actual list. Keep what still matters; a ticked row is already done.`; the Plan heading reads `What will you get done this week?` with `Look at ${aboveLabel} beside you. Add what this week can take; most things don't need a day.`; the Save heading `Here's the week`. Buttons: `Next: plan this week →`, `Save this week`.

- [ ] **Step 1: Write the failing tests**

`src/lib/planning/session.test.ts` — add:

```ts
describe('week sessions', () => {
  const LAST = new Date(2026, 8, 27), WEEK = new Date(2026, 9, 4)
  const onLast = (over: Partial<Task>) => t({ bucket: 'week', weekStart: LAST, commitments: [{ level: 'week', periodStart: LAST, status: 'open' }], ...over })

  it('lookBackRows at the week level reads last week\'s actual list, tasks only', () => {
    const done = onLast({ id: 'd', completed: true, commitments: [{ level: 'week', periodStart: LAST, status: 'done' }] })
    const open = onLast({ id: 'o' })
    const goal = onLast({ id: 'g', isGoal: true })
    const carried = onLast({ id: 'c', commitments: [{ level: 'week', periodStart: LAST, status: 'carried', carriedTo: WEEK }] })
    const r = lookBackRows([done, open, goal, carried], LAST, null, 'week')
    expect(r.finished.map((x) => x.id)).toEqual(['d'])
    expect(r.open.map((x) => x.id)).toEqual(['o'])
  })

  it('a week row never offers "Keep, and add a next action"', () => {
    expect(verdictOptions(false, 'week').map((o) => o.verdict)).toEqual(['keep', 'done', 'someday', 'drop'])
    expect(verdictOptions(true, 'week').map((o) => o.verdict)).toEqual(['keep', 'done', 'someday', 'drop'])
  })

  it('summarize says where each week item lands, in week words', () => {
    const d: SessionDraft = { ...emptyDraft('week', WEEK, LAST),
      verdicts: { o: 'keep', x: 'drop' },
      newTasks: [{ id: 'n1', title: 'Call the plumber', day: '2026-10-08' }, { id: 'n2', title: 'Sort the garage' }],
      takenFromAbove: ['m1'] }
    const lines = summarize(d, { open: [onLast({ id: 'o', title: 'Bike rack' }), onLast({ id: 'x', title: 'Old thing' })],
      above: [t({ id: 'm1', title: 'Three bids', bucket: 'month' })], aboveGoals: [], periodLabel: 'this week', prevLabel: 'last week', aboveLabel: 'October' })
    expect(lines).toEqual([
      { title: 'Bike rack', destination: "This week's tasks · kept from last week" },
      { title: 'Old thing', destination: 'Dropped from last week · the task is kept' },
      { title: 'Call the plumber', destination: "This week's tasks, on Thu" },
      { title: 'Sort the garage', destination: "This week's tasks" },
      { title: 'Three bids', destination: 'This week\'s tasks · stays on October, marked "on this week"' },
    ])
  })

  it('goalsWithHiddenSteps is empty at the week level', () => {
    expect(goalsWithHiddenSteps([onLast({ id: 'g', isGoal: true })], [], LAST, 'week').size).toBe(0)
  })
})
```
Also change every existing `emptyDraft(a, b)` call in this file and in `applySession.test.ts`, `PlanSession.test.tsx`, `useSupabaseTasks.planWrites.test.ts` to `emptyDraft('month', a, b)`, and every month `summarize(...)` ctx to include `aboveLabel: 'the season'`.

`src/lib/planning/applySession.test.ts` — add:

```ts
it('a week draft: keep carries into the week, a new task with a day is created on that day, a month task is taken into the week', async () => {
  const LAST = new Date(2026, 8, 27), WEEK = new Date(2026, 9, 4)
  const d: SessionDraft = { ...emptyDraft('week', WEEK, LAST), verdicts: { o: 'keep' },
    newTasks: [{ id: 'n1', title: 'Call the plumber', day: '2026-10-08', context: null }], takenFromAbove: ['m1'] }
  const w = writers()   // the file's mock writer factory; every fn resolves true / an id
  const r = await applySession(d, w, () => false)
  expect(r.ok).toBe(true)
  expect(w.keep).toHaveBeenCalledWith('o', WEEK, LAST)
  expect(w.addTask).toHaveBeenCalledWith('Call the plumber', expect.objectContaining({ id: 'n1', periodStart: WEEK, day: new Date(2026, 9, 8) }))
  expect(w.takeInto).toHaveBeenCalledWith('m1', WEEK)
})
```
Rename `takeIntoMonth` → `takeInto` and `monthStart` → `periodStart` in the file's existing expectations.

`src/components/plan/PlanSession.test.tsx` — the `setup` helper gains `level="month" aboveLabel="the season"` defaults; add:

```ts
describe('PlanSession — week', () => {
  const week = (over: Partial<Parameters<typeof PlanSession>[0]> = {}) => setup({
    level: 'week', periodLabel: 'this week', prevLabel: 'last week', aboveLabel: 'October',
    dayOptions: [{ ymd: '2026-10-08', label: 'Thu' }],
    finished: [t({ id: 'f', title: 'Ordered the rack', completed: true })],
    open: [t({ id: 'o', title: 'Bike rack', bucket: 'week' })],
    above: [t({ id: 'm1', title: 'Three bids', bucket: 'month' })],
    aboveGoals: [t({ id: 'mg', title: 'Finish the kitchen', isGoal: true, bucket: 'month' })],
    ...over,
  })

  it('has no Goals section and no next-action verdict; the month sits beside it', () => {
    week()
    expect(screen.getByRole('heading', { name: /how did last week go/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep, and add a next action' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    expect(screen.queryByLabelText(/new goal for/i)).toBeNull()
    expect(screen.getByText('October')).toBeInTheDocument()
    expect(screen.getByText('Finish the kitchen')).toBeInTheDocument()
  })

  it('a new task may take a day; "+ Add to this week" copies a month task down', () => {
    const s = week()
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    fireEvent.change(screen.getByLabelText(/new task for this week/i), { target: { value: 'Call the plumber' } })
    fireEvent.change(screen.getByLabelText(/day for this task/i), { target: { value: '2026-10-08' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    expect(s.draft.newTasks[0]).toMatchObject({ title: 'Call the plumber', day: '2026-10-08' })
    expect(screen.getByText('on Thu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add to this week: three bids/i }))
    expect(s.draft.takenFromAbove).toEqual(['m1'])
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(screen.getByText(/stays on October/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save this week/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/planning src/components/plan/PlanSession.test.tsx`
Expected: FAIL on the new cases and on the changed signatures.

- [ ] **Step 3: Implement `session.ts`**

```ts
export type SessionLevel = 'month' | 'week'
export interface NewItem { id: string; title: string; linkId?: string; context?: DomainId | null; day?: string }
export interface SessionDraft { level: SessionLevel; periodStart: string; prevStart: string; /* rest unchanged */ }

export function emptyDraft(level: SessionLevel, periodStart: Date, prevStart: Date): SessionDraft {
  return { level, periodStart: localYmd(periodStart), prevStart: localYmd(prevStart), verdicts: {}, actionTitles: {}, wentWell: '', didnt: '',
    newGoals: [], newTasks: [], takenFromAbove: [], keptAlready: [], actionIds: {}, created: [] }
}

export function lookBackRows(tasks: readonly Task[], prevStart: Date, meId: string | null, level: SessionLevel = 'month') {
  // …as before, but:
  //   if (level === 'week' && t.isGoal) continue
  //   const c = committedTo(t, level, prevStart, { isCurrent: false })
}

export function verdictOptions(isGoal: boolean, level: SessionLevel = 'month') {
  if (level === 'week') return [{ verdict: 'keep', label: 'Keep' }, { verdict: 'done', label: 'Done' }, { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
  // …month as before
}

export function goalsWithHiddenSteps(all, shown, prevStart, level: SessionLevel = 'month'): Set<string> {
  if (level === 'week') return new Set()
  // …as before
}
```

`summarize(d, ctx)` takes `aboveLabel: string` in `ctx`. Compute once at the top:

```ts
  const week = d.level === 'week'
  const L = { list: week ? "This week's tasks" : `${P} tasks`, goals: `${P} goals`, kept: `kept from ${Q}`,
    done: week ? `Done ${Q}` : `Done in ${Q}`, dropped: `Dropped from ${Q} · the task is kept`, left: week ? `Left open ${Q}` : `Left open in ${Q}`,
    stays: `stays on ${ctx.aboveLabel}, marked "${week ? 'on this week' : `in ${P}`}"` }
```
and use `L.*` in every branch; `stepsThatCarryForward(g.id, ctx.open, d.level)`; a new task line appends `, on ${weekday}` when `n.day` (`parseLocalYmd(n.day).toLocaleDateString('en-US', { weekday: 'short' })`). For the month, `aboveLabel` is passed as `'the season'` so the existing assertion `stays on the season, marked "in October"` still holds — check the exact Phase 1 string in `session.test.ts` and keep it byte-identical.

- [ ] **Step 4: Implement `applySession.ts`**

Rename per the interface; in the loops use `const periodStart = parseLocalYmd(d.periodStart)`; new task: `w.addTask(t.title, { id: t.id, periodStart, day: t.day ? parseLocalYmd(t.day) : undefined, goalTaskId: t.linkId, context: t.context ?? null })`; `w.takeInto(id, periodStart)`.

- [ ] **Step 5: Implement `PlanSession.tsx`**

Add props `level`, `aboveLabel`, `dayOptions = []`. `const week = level === 'week'`. Then:
- `verdictOptions(!!t.isGoal, level)`; `unnamedActions` is `[]` when `week`.
- `carried` uses `stepsThatCarryForward(g.id, open, level)`; `monthGoals` is `[]` when `week`.
- Headings and sub-lines per the interface block (a small `copy` object keyed by `week`).
- Goals `<h3>`, goal list and goal composer wrapped in `{!week && (…)}`.
- Task composer: when `week`, replace the "toward" select with
  ```tsx
  <select aria-label="Day for this task" className="rounded-md border border-neutral-200 px-2 text-sm" value={taskDay} onChange={(e) => setTaskDay(e.target.value)}>
    <option value="">Any day</option>
    {dayOptions.map((o) => <option key={o.ymd} value={o.ymd}>{o.label}</option>)}
  </select>
  ```
  and on submit `{ id: newId(), title, day: taskDay || undefined, context: domainInView }`. New-task rows show `<span className="block text-[12px] text-neutral-400">on {label}</span>` when `x.day`.
- Rail: `<p …>{aboveLabel}</p>`; the "+ Add to {P}" button label is `+ Add to this week` when `week` (aria-label `Add to this week: <title>`); the "in {P}" marker reads `· on this week`.
- `summarize(draft, { …, aboveLabel })`.
- Buttons: `Next: plan ${P} →` already yields "Next: plan this week →"; Save button `Save ${P}` yields "Save this week". The empty-rail line: `${aboveLabel} has no list yet.`

- [ ] **Step 6: Update `PeriodPlanPage.tsx` wiring (month, unchanged behaviour)**

`emptyDraft('month', bounds.start, bounds.prev)`; writers: `keep: async (id, periodStart, prevStart) => !!(await keepForward(id, { monthStart: periodStart }, prevStart))`, `addTask: (title, o) => addTask(title, undefined, undefined, undefined, { id: o.id, bucket: 'month', monthStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context })`, `takeInto: (id, periodStart) => gated.updateTask(id, { bucket: 'month', monthStart: periodStart })`; `<PlanSession level="month" aboveLabel="the season" …>`.

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run src/lib/planning src/components/plan src/hooks/useSupabaseTasks.planWrites.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, tsc clean. `PeriodPlanPage.test.tsx` must pass unchanged except for the `emptyDraft`/writer renames.

- [ ] **Step 8: Commit**

```bash
git add src/lib/planning src/components/plan src/hooks/useSupabaseTasks.planWrites.test.ts
git commit -m "feat(planning): the session model learns the week (tasks only, optional day, month beside it)"
```

---

### Task 4: One session host, used by the month page

Pure refactor: `PeriodPlanPage.tsx` lines ~465–570 (everything from `// ── Guided planning (Phase 1: month)` to the end of `saveDraft`) become a hook. `PeriodPlanPage.test.tsx` passes unchanged.

**Files:**
- Create: `src/hooks/usePlanSessionHost.ts`
- Modify: `src/components/plan/PeriodPlanPage.tsx`
- Test: `src/components/plan/PeriodPlanPage.test.tsx` (unchanged, must pass), `src/hooks/usePlanSessionHost.test.ts` (new, small)

**Interfaces:**
- Produces:
  ```ts
  export interface PlanSessionHostInput {
    enabled: boolean
    level: SessionLevel
    horizon: SessionHorizon            // 'monthly' | 'weekly'
    token: string
    periodStart: Date; prevStart: Date
    /** Loading of the lists below; prune waits for them. */
    listsLoading: boolean
    back: { finished: Task[]; open: Task[] }
    current: Task[]; above: Task[]     // above = the parent level's TASKS (non-goals)
    writers: Omit<SessionWriters, 'saveSession'>
    isCompleted: (id: string) => boolean
  }
  export interface PlanSessionHost {
    session: ReturnType<typeof usePlanningSession>   // saved, mine, loading, loadedToken, error, reload
    sessionReady: boolean
    draft: SessionDraft | null; shownDraft: SessionDraft | null
    sessionOpen: boolean; savingSession: boolean; justSaved: boolean; saveError: boolean
    startSession: () => void; changeDraft: (d: SessionDraft) => void; closeSession: () => void; saveDraft: () => Promise<void>
    dismissJustSaved: () => void
  }
  export function usePlanSessionHost(input: PlanSessionHostInput): PlanSessionHost
  ```
  The body is the existing code moved verbatim (the `periodYmdRef` guard, `readDraft(userId, level, periodYmd)`, `pruneDraft(draft, { open: back.open, above, current })`, `applySession(shownDraft, { ...writers, saveSession: session.save }, isCompleted, (remaining) => writeDraft(userId, remaining))`, the post-save branches). `useAuth` is called inside the hook.

- [ ] **Step 1: Write a small hook test**

```ts
// src/hooks/usePlanSessionHost.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ saved: null, mine: null, loading: false, loadedToken: '2026-10-4', error: null, reload: vi.fn(), save: vi.fn(async () => true) }),
  weekToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, monthToken: () => '',
}))
import { usePlanSessionHost } from './usePlanSessionHost'

const writers = () => ({ keep: vi.fn(async () => true), addTask: vi.fn(async (_t: string, o: { id: string }) => o.id), contextOf: () => null,
  complete: vi.fn(async () => true), someday: vi.fn(async () => true), drop: vi.fn(async () => true), takeInto: vi.fn(async () => true) })

describe('usePlanSessionHost', () => {
  it('opens on a fresh draft, saves through the writers, and closes marked just-saved', async () => {
    localStorage.clear()
    const w = writers()
    const { result } = renderHook(() => usePlanSessionHost({
      enabled: true, level: 'week', horizon: 'weekly', token: '2026-10-4', periodStart: new Date(2026, 9, 4), prevStart: new Date(2026, 8, 27),
      listsLoading: false, back: { finished: [], open: [] }, current: [], above: [], writers: w, isCompleted: () => false,
    }))
    expect(result.current.sessionReady).toBe(true)
    act(() => result.current.startSession())
    expect(result.current.sessionOpen).toBe(true)
    act(() => result.current.changeDraft({ ...result.current.draft!, newTasks: [{ id: 'n1', title: 'Call the plumber' }] }))
    await act(async () => { await result.current.saveDraft() })
    expect(w.addTask).toHaveBeenCalledTimes(1)
    expect(result.current.sessionOpen).toBe(false)
    expect(result.current.justSaved).toBe(true)
    expect(result.current.draft).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/hooks/usePlanSessionHost.test.ts` → "Cannot find module".

- [ ] **Step 3: Extract the hook and use it in `PeriodPlanPage`**

Move the block. In `PeriodPlanPage`, keep the derived lists (`back`, `hiddenStepGoals`, `currentMonth`, `aboveTasks`, `aboveItems`, `aboveGoalItems`) where they are, then:

```ts
  const host = usePlanSessionHost({
    enabled: sessionEnabled, level: 'month', horizon: 'monthly', token, periodStart: bounds.start, prevStart: bounds.prev,
    listsLoading: loading || seasonsLoading, back, current: currentMonth, above: aboveItems,
    writers: useMemo(() => ({
      keep: async (id, periodStart, prevStart) => !!(await keepForward(id, { monthStart: periodStart }, prevStart)),
      addTask: (title, o) => addTask(title, undefined, undefined, undefined, { id: o.id, bucket: 'month', monthStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context }),
      contextOf: (id) => tasks.find((t) => t.id === id)?.context ?? null,
      complete: (id) => completeTask(id),
      someday: (id) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }),
      drop: (id, prevStart) => dropCommitment(id, 'month', prevStart),
      takeInto: (id, periodStart) => gated.updateTask(id, { bucket: 'month', monthStart: periodStart }),
    }), [keepForward, addTask, tasks, completeTask, gated, dropCommitment]),
    isCompleted: (id) => !!tasks.find((t) => t.id === id)?.completed,
  })
```
and replace the JSX's `savedSession`/`sessionOpen`/… reads with `host.session.saved`, `host.sessionOpen`, etc. The `justSaved` banner stays in the page.

- [ ] **Step 4: Run** — `npx vitest run src/components/plan src/hooks/usePlanSessionHost.test.ts && npx tsc --noEmit -p tsconfig.app.json` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePlanSessionHost.ts src/hooks/usePlanSessionHost.test.ts src/components/plan/PeriodPlanPage.tsx
git commit -m "refactor(planning): the session host is one hook; the month page uses it unchanged"
```

---

### Task 5: "This week's list" on the Week page

**Files:**
- Create: `src/components/home/week/WeekList.tsx`
- Modify: `src/components/home/week/WeekViewV2.tsx` (render above the journal, both layouts, ~lines 869–880)
- Test: `src/components/home/week/WeekList.test.tsx` (new), `src/components/home/week/WeekViewV2.test.tsx` (lines 69 and 285 assert the section is ABSENT — flip them)

**Interfaces:**
- Consumes: `weekListTasks`, `weekRowNote`, `weekRowNoteText` (Task 0); `toggleTask`, `userId` from `useSupabaseTasks` (already destructured in `WeekViewV2`); `onSelectItem(\`task-${id}\`)` (the journal's id form); `meId` (already computed at `WeekViewV2:171`).
- Produces:
  ```tsx
  export function WeekList({ tasks, weekStart, meId, userId, isCurrent, onToggle, onSelect, onPlan }: {
    tasks: Task[]; weekStart: Date; meId: string | null; userId: string | null; isCurrent: boolean
    onToggle: (task: Task) => void; onSelect: (taskId: string) => void
    /** Opens the week session; shown in the empty state and as a quiet link. */
    onPlan?: () => void
  })
  ```
  Renders `<section aria-label="This week's list" className="mb-4">`: an `<h2 className="font-display text-lg text-neutral-800">This week's list <span className="text-[12px] font-normal text-neutral-400">tick things off any day</span></h2>`; a `<ul>` of rows — a checkbox button (`aria-label` `Complete <title>` / `Mark <title> not done`, the `Box` look from `WeekJournal.tsx` ~line 140–155: reuse its classes), the title as a `<button>` (opens the panel; `line-through text-neutral-400` when completed), the note from `weekRowNoteText` beneath in `text-[11.5px] text-neutral-500`. Order: open rows in creation order, then done rows. Empty: `<p className="text-sm text-neutral-500">Nothing on this week's list yet.{onPlan && <> <button …>Plan this week →</button></>}</p>`. Never a count.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/home/week/WeekList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import { WeekList } from './WeekList'

const WEEK = new Date(2026, 9, 4)
const row = (over: Parameters<typeof createMockTask>[0]) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

describe('WeekList', () => {
  it('lists the week\'s tasks, done rows struck and last, with their notes', () => {
    const tasks = [
      row({ id: 'a', title: 'Bike rack', createdAt: new Date(2026, 9, 1), completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] }),
      row({ id: 'b', title: 'Call the plumber', createdAt: new Date(2026, 9, 2), commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] }),
    ]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    const items = list.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Call the plumber')
    expect(items[0]).toHaveTextContent('from October')
    expect(items[1]).toHaveTextContent('Bike rack')
    expect(list.getByText('Bike rack')).toHaveClass('line-through')
    expect(list.queryByText(/\d+ (open|done|tasks)/)).toBeNull()
  })

  it('ticks and opens', () => {
    const onToggle = vi.fn(), onSelect = vi.fn()
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={onToggle} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the plumber' }))
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Call the plumber' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('empty: says so and offers to plan the week', () => {
    const onPlan = vi.fn()
    render(<WeekList tasks={[]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} onPlan={onPlan} />)
    expect(screen.getByText(/nothing on this week's list yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /plan this week/i }))
    expect(onPlan).toHaveBeenCalled()
  })
})
```

In `WeekViewV2.test.tsx`, change line 69 to `expect(screen.getByRole('region', { name: "This week's list" })).toBeInTheDocument()` and line 285 likewise; keep the other three assertions in that test. Add one case:

```ts
it('shows a week task on "This week\'s list" above the days and lets it be ticked', () => {
  const t = createMockTask({ id: 'w', title: 'Call the plumber', bucket: 'week', weekStart: monday, commitments: [{ level: 'week', periodStart: monday, status: 'open' }] })
  render(<WeekViewV2 {...defaultProps} tasks={[t]} routines={[]} />)
  const list = within(screen.getByRole('region', { name: "This week's list" }))
  expect(list.getByText('Call the plumber')).toBeInTheDocument()
})
```
(`monday` is the file's `weekStart`; `weekStartAnchor` of a Monday with the default week start may be the preceding Sunday — read `readCadenceConfig().weekStartsOn` in the test env, or set `weekStart` to the anchor: `createMockTask({ weekStart: weekStartAnchor(monday, readCadenceConfig().weekStartsOn), commitments: [{ … periodStart: that anchor }] })`.)

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/home/week/WeekList.test.tsx src/components/home/week/WeekViewV2.test.tsx`.

- [ ] **Step 3: Implement `WeekList.tsx`** per the interface, then in `WeekViewV2.tsx`:

```tsx
  const todayYmd = localYmd(new Date())
  const weekIsCurrent = sameDay(weekAnchor, weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn))
  const weekList = (
    <WeekList tasks={tasks} weekStart={weekAnchor} meId={meId} userId={userId} isCurrent={weekIsCurrent}
      onToggle={(task) => handleJournalToggle({ id: `task-${task.id}`, kind: 'task', title: task.title, completed: task.completed, task }, journalDays[0])}
      onSelect={(id) => onSelectItem(`task-${id}`)} onPlan={props.onPlanWeek} />
  )
```
Render `weekList` first inside the narrow `flex flex-col gap-4` block and, on desktop, directly above `<WeekJournal …/>` inside the `flex-1 min-w-0` box (only in journal mode: `!showSchedule`). Add `onPlanWeek?: () => void` to `WeekViewV2Props` (Task 6 supplies it). `handleJournalToggle` takes a `JournalDay` only for routines; passing `journalDays[0]` is safe for a task entry.

- [ ] **Step 4: Run** — `npx vitest run src/components/home/week && npx tsc --noEmit -p tsconfig.app.json` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekList.tsx src/components/home/week/WeekList.test.tsx src/components/home/week/WeekViewV2.tsx src/components/home/week/WeekViewV2.test.tsx
git commit -m "feat(week): This week's list on the Week page — whole all week, ticked rows struck"
```

---

### Task 6: Plan this week

**Files:**
- Create: `src/components/home/week/WeekPlanHost.tsx`
- Modify: `src/components/home/week/WeekViewV2.tsx` (render the host; hide the journal while the session is open)
- Test: `src/components/home/week/WeekPlanHost.test.tsx` (new)

**Interfaces:**
- Consumes: `usePlanSessionHost` (Task 4), `PlanSession` (Task 3), `weekListTasks` (Task 0), `lookBackRows(…, 'week')`, `selectPeriodTasks(layered, 'month', monthStart, isCurrent, meId, seasons)` from `@/lib/planning/periodPage`, `useHouseholdSeasons`, `useDomain` (`soleDomain`), `useSupabaseTasks` (`addTask`, `keepForward`, `dropCommitment`, `completeTask`, `updateTask`, `pushTask`, `updateTasksBulk`), `useGatedTaskActions`, `weekToken`, `formatWeekRangeShort`.
- Produces:
  ```tsx
  export function WeekPlanHost({ tasks, weekStart, meId, isPast, children }: {
    /** Layer-filtered tasks, as the page receives them. */
    tasks: Task[]; weekStart: Date; meId: string | null; isPast: boolean
    /** The page's normal content (list + journal), shown when the session is closed. */
    children: (host: { openSession: () => void }) => ReactNode
  })
  ```
  Renders, in order: the status line + button row (`Planned <Mon D>` / `Not planned yet` / read-error retry; button `Plan this week` / `Continue planning this week` / `Review the plan`, disabled until `sessionReady`; hidden when `isPast`), the just-saved banner (`✓ The week is planned. Each day, pick from this list.` with `Go to Today →` → `navigate('/today')`), then either `<PlanSession level="week" …/>` or `children({ openSession })`.
  Derived inputs: `prevStart = weekStart − 7d`; `monthStart = monthStartOf(weekStart + 3d)`; `back = lookBackRows(tasks, prevStart, meId, 'week')`; `current = weekListTasks(tasks, weekStart, meId).filter((t) => !t.completed)`; `aboveTasks = selectPeriodTasks(tasks, 'month', monthStart, isCurrentPeriod(periodBounds('month', monthStart, seasons), today), meId, seasons).filter((t) => !t.completed)`; `above = aboveTasks.filter((t) => !t.isGoal)`, `aboveGoals = aboveTasks.filter((t) => t.isGoal)`; `aboveLabel = monthStart.toLocaleDateString('en-US', { month: 'long' })`; `periodLabel = isCurrentWeek ? 'this week' : \`the week of ${formatWeekRangeShort(weekStart)}\``; `prevLabel = isCurrentWeek ? 'last week' : \`the week of ${formatWeekRangeShort(prevStart)}\``; `dayOptions` = the seven days `{ ymd: localYmd(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }) }`.
  Writers:
  ```ts
  keep: async (id, periodStart, prevStart) => !!(await keepForward(id, { weekStart: periodStart }, prevStart)),
  addTask: (title, o) => addTask(title, undefined, undefined, undefined, o.day
    ? { id: o.id, bucket: 'timed', scheduledFor: o.day, isAllDay: true, weekStart: o.periodStart, context: o.context }
    : { id: o.id, bucket: 'week', weekStart: o.periodStart, context: o.context }),
  contextOf: (id) => tasks.find((t) => t.id === id)?.context ?? null,
  complete: (id) => completeTask(id),
  someday: (id) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }),
  drop: (id, prevStart) => dropCommitment(id, 'week', prevStart),
  takeInto: (id, periodStart) => gated.updateTask(id, { bucket: 'week', weekStart: periodStart }),
  ```
  **Verify before wiring** (read `addTask` ~line 752–900 of `useSupabaseTasks.ts`): does an insert with `bucket: 'timed', scheduledFor` AND `weekStart` write `week_start`, and does the mirror trigger then open a week commitment? Line ~875 writes `week_start` only when `bucket === 'week'`. If so, a dated new task would NOT be on the week list. Then create it as `{ bucket: 'week', weekStart }` first and, on success, `gated.updateTask(id, { scheduledFor: o.day, isAllDay: true })` (a date keeps the week commitment: `planPlacement` day branch). Write it that way and test it in `useSupabaseTasks.planWrites.test.ts`:
  ```ts
  it('a new week task with a day is on the week AND on its day', async () => { /* addTask week → updateTask scheduledFor; expect week commitment open, scheduled_for set */ })
  ```
- `WeekViewV2` wraps its list + journal in `<WeekPlanHost tasks={tasks} weekStart={weekAnchor} meId={meId} isPast={weekEnd <= today}>{({ openSession }) => (…existing markup, with onPlanWeek={openSession}…)}</WeekPlanHost>`. `isPast`: `weekAnchor + 7d <= today`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/home/week/WeekPlanHost.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createMockTask } from '@/test/mocks/factories'
import { WeekPlanHost } from './WeekPlanHost'

const hook = { keepForward: vi.fn(async (id: string) => id), dropCommitment: vi.fn(async () => true), completeTask: vi.fn(async () => true),
  addTask: vi.fn(async (_t: string, _a: unknown, _b: unknown, _c: unknown, o: { id: string }) => o.id), updateTask: vi.fn(async () => true), pushTask: vi.fn(), updateTasksBulk: vi.fn() }
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ ...hook, tasks: [], loading: false }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: (fns: unknown) => fns }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(), soleDomain: null }) }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => ({ seasons: [], loading: false }) }))
const session = { saved: null as null | { at: Date; authorId: string; notes: {} }, mine: null, loading: false, loadedToken: '2026-10-4', error: null, reload: vi.fn(), save: vi.fn(async () => true) }
vi.mock('@/hooks/usePlanningSession', async (orig) => ({ ...(await orig<object>()), usePlanningSession: () => session }))

const LAST = new Date(2026, 8, 27), WEEK = new Date(2026, 9, 4)
const open = createMockTask({ id: 'o', title: 'Bike rack', bucket: 'week', weekStart: LAST, commitments: [{ level: 'week', periodStart: LAST, status: 'open' }] })
const monthTask = createMockTask({ id: 'm', title: 'Three bids', bucket: 'month', monthStart: new Date(2026, 9, 1), commitments: [{ level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] })

const mount = () => render(<MemoryRouter><WeekPlanHost tasks={[open, monthTask]} weekStart={WEEK} meId={null} isPast={false}>{() => <div>the days</div>}</WeekPlanHost></MemoryRouter>)

describe('WeekPlanHost', () => {
  beforeEach(() => { localStorage.clear(); Object.values(hook).forEach((f) => f.mockClear()); session.saved = null })

  it('says the week is not planned, opens the session in place of the days, and saves every decision once', async () => {
    mount()
    expect(screen.getByText('Not planned yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plan this week' }))
    expect(screen.queryByText('the days')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    fireEvent.click(screen.getByRole('button', { name: /add to this week: three bids/i }))
    fireEvent.change(screen.getByLabelText(/new task for this week/i), { target: { value: 'Call the plumber' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(hook.keepForward).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /save this week/i }))
    await waitFor(() => expect(screen.getByText(/the week is planned/i)).toBeInTheDocument())
    expect(hook.keepForward).toHaveBeenCalledWith('o', { weekStart: WEEK }, LAST)
    expect(hook.updateTask).toHaveBeenCalledWith('m', { bucket: 'week', weekStart: WEEK })
    expect(hook.addTask).toHaveBeenCalledWith('Call the plumber', undefined, undefined, undefined, expect.objectContaining({ bucket: 'week', weekStart: WEEK }))
    expect(session.save).toHaveBeenCalledTimes(1)
    expect(screen.getByText('the days')).toBeInTheDocument()
  })

  it('shows Planned <date> and "Review the plan" once a session is saved', () => {
    session.saved = { at: new Date(2026, 9, 4), authorId: 'u2', notes: {} }
    mount()
    expect(screen.getByText('Planned Oct 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review the plan' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/home/week/WeekPlanHost.test.tsx`.

- [ ] **Step 3: Implement `WeekPlanHost.tsx`** per the interface (copy the status-line/button/banner markup from `PeriodPlanPage.tsx` lines ~621–646, with the week copy), wire `usePlanSessionHost({ enabled: true, level: 'week', horizon: 'weekly', token: weekToken(weekStart), … })`, and render `PlanSession` with `level="week"`, `hiddenStepGoals={undefined}`, `domainInView={soleDomain ?? null}`, `dayOptions`.

- [ ] **Step 4: Wire it in `WeekViewV2.tsx`** (wrap the `<div className="relative">` contents; pass `openSession` to `WeekList`'s `onPlan`). The `PlanningSheet`/"Choose tasks" button stays where it is.

- [ ] **Step 5: Run** — `npx vitest run src/components/home/week src/hooks && npx tsc --noEmit -p tsconfig.app.json` → PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/week/WeekPlanHost.tsx src/components/home/week/WeekPlanHost.test.tsx src/components/home/week/WeekViewV2.tsx src/hooks/useSupabaseTasks.planWrites.test.ts
git commit -m "feat(week): Plan this week — look back at last week, plan with the month beside you, save once"
```

---

### Task 7: Verify end to end, document, open the PR

**Files:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (mark Phase 2 shipped; note the week token and the "month beside the week" rule), `docs/item-pathways.md` (a line: a week row picked for today stays on the week list, marked).

- [ ] **Step 1: Whole suite, types, build**

```bash
npx vitest run 2>&1 | tail -15
npx tsc --noEmit -p tsconfig.app.json
npm run build 2>&1 | tail -5
npm run lint 2>&1 | tail -5
```
Expected: the same pass count as main plus the new tests; the only known failure is `connectors/src/whatsapp/adapter.test.ts` (load error, pre-existing). Report exact numbers.

- [ ] **Step 2: Walk it on the demo account** (dev server in this worktree; the demo account symphonygoals@gmail.com already holds September–November data and October is planned):
  1. `/week` on the current week: "This week's list" shows the week's rows; tick one, it stays struck; untick.
  2. "Plan this week": Look back lists last week's actual rows (finished struck, open with Keep · Done · Someday · Drop, no "next action"); the month rail shows October's goals and tasks; "+ Add to this week" on an October task; add a new task with a day (Thu); Close · keep my draft → "Continue planning this week"; reopen; Save.
  3. After Save: "Planned <date>", the banner; the list shows the kept row ("kept from last week"), the October row ("from October"), the new row ("Thu"). On `/month`, the October task shows "on this week" (existing marker).
  4. SQL (Supabase MCP, read-only): last week's commitment `carried` with `carried_to`, this week's `open`; the October task has month `open` AND week `open`; the dated task has `scheduled_for` and a week commitment; `planning_sessions` has one `weekly` row with `savedAt`.
  5. Today → Choose tasks: the week's rows are listed; "Plan for today" on one; it stays, "Planned today" + Undo; Today's Tasks shows it; tick it there; the week list shows it struck.
  6. 390px (same-origin iframe per memory `narrow_screen_check_without_login`): the list and the session render with no horizontal overflow.
- [ ] **Step 3: Update the docs, commit, push, open a DRAFT PR** titled "Guided planning, phase 2: the week list and daily picking", body listing what it does, what was verified (numbers), and what was not (two real household accounts). End the body with the attribution lines from the session reminder.

---

## Self-review

- **Spec coverage (Phase 2 bullets):** week session with week-level Keep → Tasks 2, 3, 6. "This week's list" on the Journal, ticked rows visible → Tasks 0, 5. Rail shows the month with "+ Add to this week" → Task 3 (PlanSession week rail), Task 6 (`above`/`aboveGoals` from the month). Choose tasks reads the week list, picked rows stay marked → Tasks 0, 1. Testing bullets: "picking for today keeps the week commitment" → Task 1's dayPlan test + Task 2's planWrites test (the week commitment stays; `planPlacement` day branch); "each verdict writes the right commitment" → Task 2 (keep) and the existing Phase 1 drop/someday/done tests, exercised at the week level in Task 6's host test.
- **Placeholders:** none; every step has its code or the exact lines to move. The one open verification (a dated new task's `week_start` on insert) is named in Task 6 with both outcomes specified.
- **Type consistency:** `SessionLevel`, `SessionHorizon`, `weekToken`, `weekListTasks`, `weekRowNote`, `weekRowNoteText`, `usePlanSessionHost`/`PlanSessionHostInput`, `SessionWriters.takeInto`/`periodStart`/`day`, `PlanSession` props `level`/`aboveLabel`/`dayOptions`, `WeekList` props, `WeekPlanHost` props, `WeekViewV2Props.onPlanWeek` — the same names in every task that uses them.
