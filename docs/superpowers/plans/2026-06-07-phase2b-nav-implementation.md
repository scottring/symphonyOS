# Phase 2b — Radical-Collapse Nav (Rhythm Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Shell's sidebar-groups nav with a **rhythm spine** (the horizon ladder *is* the nav), where each rung shows only its scoped pool + carry-over, plus the Today landing, the daily "Plan today" session, and the reworked Inbox/triage on-ramp.

**Architecture:** Builds entirely on the shipped registry Shell (`src/shell/`, `ShellLayout`, `Sidebar`) + the scope axis. The spine is a new `Sidebar` structure; each rung is a horizon-filtered view of the tasks data reusing `src/lib/today/` selectors + the bucket field + the unified `area × scope × assignee` filter; "Plan the [horizon]" reuses the already-wired `PlanningSession`/`WeeklyPlanningSession`.

**Tech Stack:** React 19 + TS (strict), React Router v6, Vite, Vitest. Spec: `docs/superpowers/specs/2026-06-07-phase2b-nav-design.md`.

**Worktree:** start a fresh worktree off `origin/main` via `superpowers:using-git-worktrees` (e.g. `.worktrees/phase2b`), since `feat/foundation` is merged. Set node PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.

---

## Invariants (do not violate)
1. **Scoped:** no horizon view ever shows the full task list — only that horizon's pool + carry-over.
2. **Legible:** the current horizon is always visibly indicated; switching horizons is deliberate.
3. After every workstream: `npm run build` + `npx vitest run` green; runtime-smoke on a preview (both logins) before merging to `main`. The kitchen wall (`/wall-v2`, chromeless) must stay untouched.

---

## Workstream decomposition (ordered, each independently shippable)

- **W1 — Horizon data layer** (bucket enum + pure horizon-pool selectors). Foundation for all rungs. *Full TDD below.*
- **W2 — The rhythm spine** (rebuild `Sidebar` as Inbox · rhythm rungs · Someday · Library · footer; legibility highlight; routes).
- **W3 — Horizon-scoped views + filters** (each rung renders its scoped pool + carry-over; scope-lens + area filter bar).
- **W4 — Today landing** (rhythm-nudge banner + "Coming up" peek).
- **W5 — Daily "Plan today" session** (carried-over decisions + pull-from-week + optional time-block).
- **W6 — Inbox/triage rework** (inline WHEN chips + focused Process mode).
- **W7 — Library section + mobile bottom bar.**

W1 is specified in full TDD detail now (it's pure logic). W2–W7 are specified by files + behavior + reuse + verification; each gets its bite-sized breakdown when reached (write it just-in-time, like Phase 2a's batches), so the steps reflect the real code at execution time.

---

## W1 — Horizon data layer (full TDD)

**Files:**
- Modify: `src/types/task.ts` (the `TaskBucket` union)
- Create: `src/lib/today/horizons.ts` (horizon definitions + pure pool selectors)
- Test: `src/lib/today/horizons.test.ts`
- Migration: `supabase/migrations/2026-06-07_someday_bucket.sql`

### Task W1.1 — Split `someday` from `quarter` in the bucket type

**Files:** Modify `src/types/task.ts`

- [ ] **Step 1:** In `src/types/task.ts`, change
  `export type TaskBucket = 'inbox' | 'week' | 'month' | 'quarter' | 'timed'`
  to
  `export type TaskBucket = 'inbox' | 'week' | 'month' | 'quarter' | 'someday' | 'timed'`
  (`quarter` = "This Season"; new `someday` = the no-horizon pool. Weekends/Next-week stay `timed` with a date — they are triage date-shortcuts, not buckets.)
- [ ] **Step 2:** `npm run build` — expect PASS (additive union member; existing code that switches on bucket still compiles).
- [ ] **Step 3:** Commit: `git add src/types/task.ts && git commit -m "feat(buckets): add 'someday' bucket distinct from 'quarter'"`

### Task W1.2 — Pure horizon-pool selectors (TDD)

**Files:** Create `src/lib/today/horizons.ts` + `src/lib/today/horizons.test.ts`. (Mirror the existing pure-selector style in `src/lib/today/taskPools.ts` — same `match` signature, same `Task[]` in/out.)

- [ ] **Step 1: Write the failing test** — `src/lib/today/horizons.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { selectHorizonPool, HORIZONS } from './horizons'
import type { Task } from '@/types/task'

const t = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36), title: 'x', completed: false, bucket: 'inbox',
  createdAt: new Date(), updatedAt: new Date(), ...over,
})
const matchAll = () => true

describe('selectHorizonPool', () => {
  it('this-week pool = bucket "week", incomplete, matched', () => {
    const tasks = [t({ bucket: 'week' }), t({ bucket: 'month' }), t({ bucket: 'week', completed: true })]
    expect(selectHorizonPool(tasks, 'week', matchAll).map(x => x.bucket)).toEqual(['week'])
  })
  it('this-season pool = bucket "quarter"', () => {
    expect(selectHorizonPool([t({ bucket: 'quarter' }), t({ bucket: 'someday' })], 'season', matchAll)).toHaveLength(1)
  })
  it('someday pool = bucket "someday" (NOT quarter)', () => {
    expect(selectHorizonPool([t({ bucket: 'someday' }), t({ bucket: 'quarter' })], 'someday', matchAll)).toHaveLength(1)
  })
  it('respects the assignee match fn', () => {
    const mine = t({ bucket: 'week', assignedTo: 'me' })
    const hers = t({ bucket: 'week', assignedTo: 'iris' })
    const onlyMine = (a: string | null | undefined) => a === 'me'
    expect(selectHorizonPool([mine, hers], 'week', onlyMine)).toEqual([mine])
  })
  it('HORIZONS lists the five rhythm rungs + someday in order', () => {
    expect(HORIZONS.map(h => h.id)).toEqual(['today', 'week', 'month', 'season', 'year', 'someday'])
  })
})
```
- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/lib/today/horizons.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** — `src/lib/today/horizons.ts`:
```ts
import type { Task, TaskBucket } from '@/types/task'

export type HorizonId = 'today' | 'week' | 'month' | 'season' | 'year' | 'someday'
type Match = (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean

/** The rhythm rungs, in spine order. `bucket` is the pool this horizon draws
 * from (today = timed-on-date, handled by existing selectTimed; year is a
 * goals-level horizon with no task bucket of its own → empty task pool). */
export const HORIZONS: { id: HorizonId; label: string; bucket: TaskBucket | null }[] = [
  { id: 'today',   label: 'Today',       bucket: 'timed' },
  { id: 'week',    label: 'This Week',   bucket: 'week' },
  { id: 'month',   label: 'This Month',  bucket: 'month' },
  { id: 'season',  label: 'This Season', bucket: 'quarter' },
  { id: 'year',    label: 'This Year',   bucket: null },
  { id: 'someday', label: 'Someday',     bucket: 'someday' },
]

/** A horizon's scoped pool: incomplete tasks in that horizon's bucket, matched
 * by assignee. (today/year are handled by their own views — today via
 * selectTimed, year via goals — so they return [] here.) */
export function selectHorizonPool(tasks: Task[], horizon: HorizonId, match: Match): Task[] {
  const def = HORIZONS.find(h => h.id === horizon)
  if (!def || !def.bucket || def.bucket === 'timed') return []
  return tasks.filter(task =>
    !task.completed && task.bucket === def.bucket && match(task.assignedTo, task.assignedToAll),
  )
}
```
- [ ] **Step 4: Run, verify pass** — `npx vitest run src/lib/today/horizons.test.ts` → PASS (5).
- [ ] **Step 5: Commit** — `git add src/lib/today/horizons.ts src/lib/today/horizons.test.ts && git commit -m "feat(horizons): horizon definitions + scoped-pool selector"`

### Task W1.3 — Apply the `someday` bucket migration (prod)

**Files:** Create `supabase/migrations/2026-06-07_someday_bucket.sql`

- [ ] **Step 1: Write the migration** — if `bucket` has a CHECK constraint, widen it to include `'someday'`; otherwise (it's free `text`) this is a no-op + a documenting comment. Conservative version:
```sql
-- Allow the new 'someday' bucket (distinct from 'quarter'='this season').
-- bucket is stored as free text today, so no constraint change is required;
-- this migration documents the new allowed value. If a CHECK is added later,
-- include 'someday'. No backfill: existing 'quarter' rows stay 'quarter'
-- (This Season); items meant as no-horizon get re-triaged to 'someday' in-app.
SELECT 1;
```
- [ ] **Step 2:** Apply via the Management API (token from keychain; project `mwadppyrqzuzgstmwpuy`) **only if** it contains real DDL. For the no-op version, just commit the file. Verify `bucket` accepts `'someday'` with a read-only test insert/rollback if a constraint exists.
- [ ] **Step 3: Commit** — `git add supabase/migrations/2026-06-07_someday_bucket.sql && git commit -m "chore(db): document 'someday' bucket"`

> **Decision baked in:** weekends + next-week are triage **date shortcuts** (`timed` + a computed date), reusing the existing This/Next-Weekend logic in `SchedulePopover`/`WhenPicker` — NOT new buckets. Only `someday` is added.

---

## W2 — The rhythm spine (`Sidebar` rebuild)

**Files:** Modify `src/components/layout/Sidebar.tsx` (replace the TODAY/PLAN/HOME/MORE group structure); reference `src/shell/ShellLayout.tsx` (renders `Sidebar`); routes in `src/main.tsx`.

**Behavior:** Render the spine top-to-bottom: **Inbox** (with count) · divider · the **HORIZONS** rungs (Today, This Week, This Month, This Season, This Year) · **Someday** · divider · **Library** (collapsible: the registry apps with a `sidebar` spec — Projects, Goals, Routines, Meals, Contacts, Lists, House) · footer (Settings, Assistant). Each rung `navigate()`s to its route (`/today`, `/week`, `/month`, `/season`, `/year`, `/someday`, `/inbox`); active rung highlighted via `location.pathname`. New routes `/week /month /season /year /someday` are Shell routes (add to `main.tsx` + register horizon "views" in the tasks app or a new `horizons` app).

**Reuse:** the existing `Sidebar` nav-item styling + `appRegistry`-driven Library entries (Sidebar already reads `appRegistry`). **Verify:** build + shell tests; runtime — each rung loads + highlights. **Commit** per rung-group.

## W3 — Horizon-scoped views + filters

**Files:** Create `src/apps/tasks/HorizonView.tsx` (or extend `HomeViewContainer`) — a view that takes a `HorizonId`, computes the scoped pool via `selectHorizonPool` (+ `selectOverdue` for carry-over) and renders the list; Create `src/components/today/HorizonFilterBar.tsx` (scope lens `Just me/Us/Everyone` + area dropdown). Wire the filter into the unified `area × scope × assignee` matcher (`src/lib/today/assigneeFilter.ts` + the Foundation filter module).

**Behavior:** selecting a rung shows `carry-over (selectOverdue) + selectHorizonPool(horizon)` filtered by the lens. "Plan the [horizon]" button launches the session (W5 / existing weekly). **Reuse:** `lib/today/` selectors, `ScheduleItem`, `TapContextPanel` for detail. **Verify:** unit-test the filter composition; runtime — switching lens re-filters, pool never shows all tasks.

## W4 — Today landing

**Files:** Modify the tasks app Today view (`HomeView`/`TodayView`); Create `src/components/today/RhythmNudge.tsx` + `src/components/today/ComingUpPeek.tsx`.

**Behavior:** `RhythmNudge` shows when a session is due (Sunday→weekly, first-Sat→monthly, daily morning) — pure date logic, unit-tested. `ComingUpPeek` (the original "b"): next dated days + "N this week" + "N to sort". **Reuse:** the `selectUpcoming`-style logic from the earlier "coming up" exploration. **Verify:** unit-test the nudge-due + peek selectors; runtime smoke.

## W5 — Daily "Plan today" session

**Files:** Create `src/components/planning/daily/PlanTodaySession.tsx`; reuse the wired `PlanningSession` grid for the optional time-block step.

**Behavior:** ≈5-min flow — (1) fixed anchors (today's events) shown; (2) carried-over rows with `do today / push to week / done`; (3) pull-from-week: the `selectHorizonPool(week)` list with checkboxes that set `bucket:'timed', scheduledFor: today`; (4) "Start the day" → optional `PlanningSession` grid. Pick-list is the core; time-block optional. Opened by the Today rhythm nudge + a "Plan today" button on the Today rung. **Verify:** unit-test the pull-into-today mutation shape; runtime smoke (pull 2 from week → appear on Today).

## W6 — Inbox/triage rework

**Files:** Modify `src/components/schedule/InboxView.tsx` + `DenseInboxRow.tsx`; Create `src/components/schedule/ProcessInboxMode.tsx`.

**Behavior:** each inbox row leads with WHEN chips (`Today · This week · This month · Someday`, "more ▾" → This/Next weekend, Next week, This season) that route via the existing `pushTask`/`setBucket` (+ weekend/next-week date shortcuts); `🏷 area` (→ default scope) + `👤 who` quick-sets. Plus a "Process inbox" button → `ProcessInboxMode` (one-at-a-time full-focus). **Reuse:** existing inbox triage actions + `SchedulePopover` weekend logic. **Verify:** unit-test chip→bucket routing incl. the `scheduled_for ⇒ bucket:'timed'` + real-`is_all_day` invariant; runtime smoke.

## W7 — Library section + mobile bottom bar

**Files:** Modify `Sidebar.tsx` (Library collapsible) + `ShellLayout.tsx` (mobile bottom bar already exists from 2a — adapt it to the rhythm: horizon switcher + Inbox + More + FAB).

**Behavior:** Library = collapsible group of the registry-app sidebar entries. Mobile bottom bar = horizontal horizon switcher (Today/Week/Month/…) + Inbox + More(Library) + capture FAB; touch targets per kiosk constraints. **Verify:** build + shell tests; runtime smoke desktop + mobile viewport.

---

## Self-review
- **Spec coverage:** W1 (bucket/selectors) → spec §1 rungs + invariant; W2 → spine §1; W3 → filters §2 + scoped views; W4 → Today §3 + proactive §4; W5 → daily session §5; W6 → triage §6; W7 → Library §7 + mobile §8. All spec sections covered. Monthly/Seasonal/Annual session internals correctly deferred to Phase 3 (the spine launches them as stubs).
- **Placeholders:** W1 has full code/tests; W2–W7 are workstream specs (files + behavior + reuse + verify) to be expanded into bite-sized steps just-in-time at execution (UI work reveals specifics), matching how Phase 2a executed successfully.
- **Type consistency:** `HorizonId` / `selectHorizonPool` / `HORIZONS` used consistently; bucket union member `'someday'` consistent across W1.1/W1.2/W1.3/W6.

## Verification (whole phase)
Day-in-the-life smoke on a preview, both logins: land on Today (right scoped pool) → capture via FAB → Inbox → one-tap triage into a horizon → "Plan today" pulls from week into Today → switch rungs (each shows only its scoped pool) → scope lens re-filters → rhythm nudge when due → mobile bottom bar. Anti-overwhelm invariant holds throughout. Wall untouched.
