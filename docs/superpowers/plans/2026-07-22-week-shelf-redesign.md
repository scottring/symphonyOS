# /week Shelf Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild /week as one duplicate-free surface — a full-width pill "shelf" of unplaced tasks above a full-width 7-day hour grid — plus an AI "Tend" sweep that proposes merges, put-asides, regrades, and placements.

**Architecture:** The shelf renders *inside* `PlanningSession` (new `shelf` prop) so its pills are dnd-kit draggables in the session's existing DndContext — no native-drag bridging. All tend logic lives in a pure `src/lib/tend/` module (types, deterministic pre-pass, response validator, proposal→mutation application) consumed by a `useTendWeek` hook; a new `tend-week` Deno edge function mirrors `sharpen-goal` exactly (auth, Anthropic call, JSON contract). `WeekPage` deletes every list section below the grid.

**Tech Stack:** React 19 + TS strict, dnd-kit (already in PlanningSession), Vitest + RTL, Supabase edge function (Deno) calling Anthropic `claude-sonnet-4-6`.

**Spec:** `docs/superpowers/specs/2026-07-22-week-page-shelf-redesign-design.md`
**Worktree:** `.worktrees/week-shelf` (branch `week-shelf`). All commands run from the worktree root.

## Global Constraints

- **No emojis in UI** — lucide icons only. "✦ Tend" in the spec = `Sparkles` icon + "Tend" text.
- **Shelf pill titles never truncate** — no `line-clamp`, no `truncate`, no `overflow-hidden` on the title span.
- **Routines stay OUT of the /week grid** — `routines={[]}` in WeekPage stays exactly as-is (2026-07-22 rollback lesson).
- **Never hardcode week start** — week anchor comes from `weekStartAnchor(date, readCadenceConfig().weekStartsOn)`; never assume Sunday or Monday.
- **Local date math only** — construct Dates from `(y, m-1, d)` parts; never `Date.parse`/`toISOString` for day-granular values (negative-UTC-offset shift bug).
- **`bucket: 'timed'` and `scheduledFor` move in lockstep** — a placement always sets both via one `setBucket(id, 'timed', date, false)` call (the addTask-then-setBucket race rule generalizes: one write, not two).
- **Tests:** run with `npx vitest run <file>` — plain `npm test` is watch mode and hangs.
- **Do not push to main from this plan.** Work stays on `week-shelf`; the ship step (build + push) is a separate decision after Scott reviews.
- **Guided wizard untouched** — `PlanningSession` without the new `shelf` prop must behave byte-for-byte as today (drawer layout, 1-day default).

## File Structure

- `src/lib/tend/types.ts` — proposal type unions (create)
- `src/lib/tend/prepass.ts` + `prepass.test.ts` — deterministic dupe/stale detection (create)
- `src/lib/tend/applyProposal.ts` + `applyProposal.test.ts` — proposal→mutation mapping (create)
- `src/lib/tend/validate.ts` + `validate.test.ts` — AI response parsing/sanitizing (create)
- `src/hooks/useTendWeek.ts` + `useTendWeek.test.ts` — sweep state machine (create)
- `supabase/functions/tend-week/index.ts` — edge function (create)
- `src/components/planning/PlanningShelf.tsx` + `PlanningShelf.test.tsx` — the shelf (create)
- `src/components/planning/PlanningSession.tsx` — `shelf` + `initialDays` props (modify)
- `src/apps/tasks/horizons/shared.tsx` — expose `setBucket`, undo-wrapped delete, `projects`, `weekAnchor` from `useHorizonPageData` (modify)
- `src/apps/tasks/horizons/WeekPage.tsx` — page restructure (modify)
- `src/apps/tasks/horizons/pages.smoke.test.tsx` — assert no duplicate sections (modify)

---

### Task 1: Tend types + deterministic pre-pass

**Files:**
- Create: `src/lib/tend/types.ts`
- Create: `src/lib/tend/prepass.ts`
- Test: `src/lib/tend/prepass.test.ts`

**Interfaces:**
- Consumes: `Task` from `@/types/task` (fields used: `id`, `title`, `createdAt`, `completed`).
- Produces: `TendProposal` union (all later tasks import from `./types`); `runPrepass(pool: Task[], carryOver: Task[], now?: Date): TendProposal[]`; `normalizeTitle(s: string): string`; `titleSimilarity(a: string, b: string): number`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tend/prepass.test.ts
import { describe, it, expect } from 'vitest'
import { runPrepass, normalizeTitle, titleSimilarity } from './prepass'
import type { Task } from '@/types/task'

const NOW = new Date(2026, 6, 22) // Jul 22 2026, local

function task(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    completed: false,
    createdAt: new Date(2026, 6, 20),
    updatedAt: new Date(2026, 6, 20),
    ...overrides,
  } as Task
}

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation and extra whitespace', () => {
    expect(normalizeTitle('  Weed the  backyard!! ')).toBe('weed the backyard')
  })
})

describe('titleSimilarity', () => {
  it('is 1 for identical strings and low for unrelated ones', () => {
    expect(titleSimilarity('weed the backyard', 'weed the backyard')).toBe(1)
    expect(titleSimilarity('weed the backyard', 'ask for ynab refund')).toBeLessThan(0.3)
  })
})

describe('runPrepass', () => {
  it('proposes a merge for duplicate titles, keeping the older task', () => {
    const older = task({ id: 'a', title: 'Invite Guy + Jess over for pizza', createdAt: new Date(2026, 6, 8) })
    const newer = task({ id: 'b', title: 'Invite Guy + Jess over for pizza', createdAt: new Date(2026, 6, 15) })
    const proposals = runPrepass([older, newer], [], NOW)
    const merge = proposals.find((p) => p.kind === 'merge')
    expect(merge).toMatchObject({ kind: 'merge', keepId: 'a', dropIds: ['b'] })
  })

  it('catches near-duplicates across pool and carry-over', () => {
    const a = task({ id: 'a', title: 'Install Symphony for Mac for Iris', createdAt: new Date(2026, 6, 1) })
    const b = task({ id: 'b', title: 'Install symphony for mac for iris!', createdAt: new Date(2026, 6, 10) })
    const proposals = runPrepass([a], [b], NOW)
    expect(proposals.filter((p) => p.kind === 'merge')).toHaveLength(1)
  })

  it('proposes put_aside for tasks unfinished ≥21 days', () => {
    const stale = task({ id: 's', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 20) }) // 32 days
    const fresh = task({ id: 'f', title: 'Get plants for the entryway', createdAt: new Date(2026, 6, 20) })
    const proposals = runPrepass([stale, fresh], [], NOW)
    expect(proposals).toEqual([
      expect.objectContaining({ kind: 'put_aside', taskId: 's' }),
    ])
  })

  it('does not double-report a task that is both stale and a merge drop', () => {
    const keep = task({ id: 'a', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 1) })
    const drop = task({ id: 'b', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 20) })
    const proposals = runPrepass([keep, drop], [], NOW)
    // drop 'b' is consumed by the merge; only 'a' may additionally be stale
    const staleIds = proposals.filter((p) => p.kind === 'put_aside').map((p) => p.taskId)
    expect(staleIds).not.toContain('b')
  })

  it('ignores completed tasks and same-id overlap between pool and carryOver', () => {
    const done = task({ id: 'd', title: 'Weed the backyard', completed: true, createdAt: new Date(2026, 5, 1) })
    const dup = task({ id: 'x', title: 'Weed the backyard', createdAt: new Date(2026, 5, 1) })
    const proposals = runPrepass([done, dup], [dup], NOW)
    expect(proposals.filter((p) => p.kind === 'merge')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tend/prepass.test.ts`
Expected: FAIL — `Cannot find module './prepass'`

- [ ] **Step 3: Write types.ts and prepass.ts**

```typescript
// src/lib/tend/types.ts
//
// The Tend sweep's proposal vocabulary. Proposals are DATA — nothing applies
// until the user clicks Apply on a card (applyProposal.ts does the writes).

export interface TendMerge {
  kind: 'merge'
  id: string
  keepId: string
  dropIds: string[]
  why: string
}

export interface TendPutAside {
  kind: 'put_aside'
  id: string
  taskId: string
  why: string
}

export interface TendRegrade {
  kind: 'regrade'
  id: string
  taskId: string
  to: 'month' | 'someday'
  why: string
}

export interface TendPlace {
  kind: 'place'
  id: string
  taskIds: string[]
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** HH:MM 24h; defaults to 09:00 when absent. */
  time?: string
  why: string
}

export type TendProposal = TendMerge | TendPutAside | TendRegrade | TendPlace
```

```typescript
// src/lib/tend/prepass.ts
//
// Deterministic tending — duplicate titles and stale items become proposals
// with no AI involved, so Tend degrades gracefully when the edge fn fails.

import type { Task } from '@/types/task'
import type { TendMerge, TendProposal, TendPutAside } from './types'

const STALE_DAYS = 21
const SIMILARITY_THRESHOLD = 0.85

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** Dice coefficient over character trigrams of the normalized titles: 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (na === nb) return 1
  const ta = trigrams(na)
  const tb = trigrams(nb)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

export function runPrepass(pool: Task[], carryOver: Task[], now: Date = new Date()): TendProposal[] {
  // Union by id (a task can be in both lists), open tasks only.
  const byId = new Map<string, Task>()
  for (const t of [...pool, ...carryOver]) {
    if (!t.completed) byId.set(t.id, t)
  }
  const tasks = [...byId.values()]

  // ── Duplicates: greedy grouping by similarity; keep the oldest. ──
  const merges: TendMerge[] = []
  const consumed = new Set<string>()
  for (let i = 0; i < tasks.length; i++) {
    if (consumed.has(tasks[i].id)) continue
    const group = [tasks[i]]
    for (let j = i + 1; j < tasks.length; j++) {
      if (consumed.has(tasks[j].id)) continue
      if (titleSimilarity(tasks[i].title, tasks[j].title) >= SIMILARITY_THRESHOLD) {
        group.push(tasks[j])
      }
    }
    if (group.length > 1) {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      const [keep, ...drops] = group
      for (const t of group) consumed.add(t.id)
      merges.push({
        kind: 'merge',
        id: `prepass-merge-${keep.id}`,
        keepId: keep.id,
        dropIds: drops.map((t) => t.id),
        why: 'Same task captured more than once — keeps the older one.',
      })
    }
  }

  // ── Stale: unfinished for ≥21 days (we don't store carry history; age
  // while unfinished is the proxy — see spec). Merge drops are excluded. ──
  const dropIds = new Set(merges.flatMap((m) => m.dropIds))
  const stale: TendPutAside[] = []
  const cutoff = now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000
  for (const t of tasks) {
    if (dropIds.has(t.id)) continue
    const created = new Date(t.createdAt).getTime()
    if (created <= cutoff) {
      const weeks = Math.floor((now.getTime() - created) / (7 * 24 * 60 * 60 * 1000))
      stale.push({
        kind: 'put_aside',
        id: `prepass-stale-${t.id}`,
        taskId: t.id,
        why: `Sitting unfinished for ${weeks} weeks — park it on Someday?`,
      })
    }
  }

  return [...merges, ...stale]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tend/prepass.test.ts`
Expected: PASS (6 tests). If the near-duplicate test fails on the similarity threshold, debug `titleSimilarity` — do not lower the threshold below 0.85.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tend/types.ts src/lib/tend/prepass.ts src/lib/tend/prepass.test.ts
git commit -m "feat(tend): proposal types + deterministic dupe/stale pre-pass"
```

---

### Task 2: applyProposal — proposal→mutation mapping

**Files:**
- Create: `src/lib/tend/applyProposal.ts`
- Test: `src/lib/tend/applyProposal.test.ts`

**Interfaces:**
- Consumes: `TendProposal` from `./types`.
- Produces: `TendActions` interface and `applyProposal(p: TendProposal, actions: TendActions): void`. `TendActions.setBucket` matches `useSupabaseTasks.setBucket`'s signature `(id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => void`; `TendActions.deleteTask` is `(id: string) => void` (WeekPage passes the undo-wrapped delete).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tend/applyProposal.test.ts
import { describe, it, expect, vi } from 'vitest'
import { applyProposal } from './applyProposal'
import type { TendActions } from './applyProposal'

function actions(): TendActions {
  return { setBucket: vi.fn(), deleteTask: vi.fn() }
}

describe('applyProposal', () => {
  it('merge deletes every drop id and nothing else', () => {
    const a = actions()
    applyProposal({ kind: 'merge', id: 'm', keepId: 'keep', dropIds: ['d1', 'd2'], why: '' }, a)
    expect(a.deleteTask).toHaveBeenCalledTimes(2)
    expect(a.deleteTask).toHaveBeenCalledWith('d1')
    expect(a.deleteTask).toHaveBeenCalledWith('d2')
    expect(a.setBucket).not.toHaveBeenCalled()
  })

  it('put_aside sends the task to the someday bucket', () => {
    const a = actions()
    applyProposal({ kind: 'put_aside', id: 'p', taskId: 't1', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'someday')
  })

  it('regrade sends the task to the named bucket', () => {
    const a = actions()
    applyProposal({ kind: 'regrade', id: 'r', taskId: 't1', to: 'month', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'month')
  })

  it('place schedules each task as timed at the local date+time in one call', () => {
    const a = actions()
    applyProposal({ kind: 'place', id: 'pl', taskIds: ['t1', 't2'], date: '2026-07-25', time: '10:30', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledTimes(2)
    const [, bucket, when, isAllDay] = (a.setBucket as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(bucket).toBe('timed')
    expect(isAllDay).toBe(false)
    expect(when).toEqual(new Date(2026, 6, 25, 10, 30, 0, 0)) // local parts, no UTC shift
  })

  it('place defaults to 09:00 when no time given', () => {
    const a = actions()
    applyProposal({ kind: 'place', id: 'pl', taskIds: ['t1'], date: '2026-07-25', why: '' }, a)
    const [, , when] = (a.setBucket as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(when).toEqual(new Date(2026, 6, 25, 9, 0, 0, 0))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tend/applyProposal.test.ts`
Expected: FAIL — `Cannot find module './applyProposal'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/tend/applyProposal.ts
//
// Turns an accepted proposal into writes. One write per task, through
// setBucket — bucket:'timed' + scheduledFor land in a single call so the
// timed-bucket invariant can't be violated by a race.

import type { TaskBucket } from '@/types/task'
import type { TendProposal } from './types'

export interface TendActions {
  setBucket: (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => void
  /** WeekPage passes its undo-wrapped delete so merges surface in UndoToast. */
  deleteTask: (id: string) => void
}

export function applyProposal(p: TendProposal, actions: TendActions): void {
  switch (p.kind) {
    case 'merge':
      for (const id of p.dropIds) actions.deleteTask(id)
      return
    case 'put_aside':
      actions.setBucket(p.taskId, 'someday')
      return
    case 'regrade':
      actions.setBucket(p.taskId, p.to)
      return
    case 'place': {
      // Local date parts — never Date.parse (UTC shift).
      const [y, m, d] = p.date.split('-').map(Number)
      const [hh, mm] = (p.time ?? '09:00').split(':').map(Number)
      const when = new Date(y, m - 1, d, hh, mm, 0, 0)
      for (const id of p.taskIds) actions.setBucket(id, 'timed', when, false)
      return
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tend/applyProposal.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tend/applyProposal.ts src/lib/tend/applyProposal.test.ts
git commit -m "feat(tend): proposal application through single-write setBucket"
```

---

### Task 3: AI response validator

**Files:**
- Create: `src/lib/tend/validate.ts`
- Test: `src/lib/tend/validate.test.ts`

**Interfaces:**
- Consumes: `TendProposal` from `./types`.
- Produces: `parseTendProposals(data: unknown, validIds: Set<string>): TendProposal[]` — drops malformed entries and unknown task ids, clamps `why` to 200 chars, caps the list at 12, stamps ids `ai-0`, `ai-1`, ….

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tend/validate.test.ts
import { describe, it, expect } from 'vitest'
import { parseTendProposals } from './validate'

const IDS = new Set(['t1', 't2', 't3'])

describe('parseTendProposals', () => {
  it('accepts well-formed proposals of every kind and stamps ai- ids', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'merge', keepId: 't1', dropIds: ['t2'], why: 'same task' },
      { kind: 'put_aside', taskId: 't3', why: 'stale' },
      { kind: 'regrade', taskId: 't1', to: 'month', why: 'month-sized' },
      { kind: 'place', taskIds: ['t2'], date: '2026-07-25', time: '10:00', why: 'open morning' },
    ] }, IDS)
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.id)).toEqual(['ai-0', 'ai-1', 'ai-2', 'ai-3'])
  })

  it('drops proposals referencing unknown task ids', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'put_aside', taskId: 'nope', why: '' },
      { kind: 'merge', keepId: 't1', dropIds: ['ghost'], why: '' },
      { kind: 'place', taskIds: ['t1', 'ghost'], date: '2026-07-25', why: '' },
    ] }, IDS)
    expect(out).toHaveLength(0)
  })

  it('drops malformed dates/times/kinds and non-object entries', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'place', taskIds: ['t1'], date: '07/25/2026', why: '' },
      { kind: 'place', taskIds: ['t1'], date: '2026-07-25', time: 'ten', why: '' },
      { kind: 'explode', taskId: 't1', why: '' },
      'not-an-object',
      { kind: 'regrade', taskId: 't1', to: 'year', why: '' },
    ] }, IDS)
    expect(out).toHaveLength(0)
  })

  it('clamps why to 200 chars, caps at 12 proposals, tolerates non-object input', () => {
    const many = Array.from({ length: 20 }, () => ({ kind: 'put_aside', taskId: 't1', why: 'x'.repeat(500) }))
    const out = parseTendProposals({ proposals: many }, IDS)
    expect(out).toHaveLength(12)
    expect((out[0].why ?? '').length).toBeLessThanOrEqual(200)
    expect(parseTendProposals(null, IDS)).toEqual([])
    expect(parseTendProposals({ proposals: 'nope' }, IDS)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tend/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/tend/validate.ts
//
// The client re-validates everything the edge fn returns: the model's JSON is
// untrusted input. Unknown ids, bad dates, and stray kinds are dropped, not
// errors — a partially-valid sweep is still useful.

import type { TendProposal } from './types'

const MAX_PROPOSALS = 12
const MAX_WHY = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function why(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_WHY) : ''
}

export function parseTendProposals(data: unknown, validIds: Set<string>): TendProposal[] {
  const raw = (data as { proposals?: unknown })?.proposals
  if (!Array.isArray(raw)) return []
  const out: TendProposal[] = []
  for (const entry of raw) {
    if (out.length >= MAX_PROPOSALS) break
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const id = `ai-${out.length}`
    switch (e.kind) {
      case 'merge': {
        const keepId = str(e.keepId)
        const dropIds = Array.isArray(e.dropIds) ? e.dropIds.filter((d): d is string => typeof d === 'string') : []
        if (!keepId || !validIds.has(keepId)) continue
        if (dropIds.length === 0 || !dropIds.every((d) => validIds.has(d))) continue
        out.push({ kind: 'merge', id, keepId, dropIds, why: why(e.why) })
        break
      }
      case 'put_aside': {
        const taskId = str(e.taskId)
        if (!taskId || !validIds.has(taskId)) continue
        out.push({ kind: 'put_aside', id, taskId, why: why(e.why) })
        break
      }
      case 'regrade': {
        const taskId = str(e.taskId)
        if (!taskId || !validIds.has(taskId)) continue
        if (e.to !== 'month' && e.to !== 'someday') continue
        out.push({ kind: 'regrade', id, taskId, to: e.to, why: why(e.why) })
        break
      }
      case 'place': {
        const taskIds = Array.isArray(e.taskIds) ? e.taskIds.filter((t): t is string => typeof t === 'string') : []
        const date = str(e.date)
        if (taskIds.length === 0 || !taskIds.every((t) => validIds.has(t))) continue
        if (!date || !DATE_RE.test(date)) continue
        const time = str(e.time)
        if (time && !TIME_RE.test(time)) continue
        out.push({ kind: 'place', id, taskIds, date, ...(time ? { time } : {}), why: why(e.why) })
        break
      }
      default:
        continue
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tend/validate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tend/validate.ts src/lib/tend/validate.test.ts
git commit -m "feat(tend): defensive validator for AI proposal JSON"
```

---

### Task 4: `tend-week` edge function

**Files:**
- Create: `supabase/functions/tend-week/index.ts`

**Interfaces:**
- Consumes: POST body `{ tasks: {id, title, notes?, project?, ageDays, overdue}[], weekStart: 'YYYY-MM-DD', today: 'YYYY-MM-DD', busy: {title, start, end}[] }` with user JWT (same auth as `sharpen-goal`).
- Produces: `{ proposals: [...] }` in the exact shape `parseTendProposals` accepts (kinds `merge`/`put_aside`/`regrade`/`place`). The client validates; the fn only does light shape-checking.

No vitest here (Deno runtime); the JSON contract is covered by Task 3's validator tests. Verification is a typecheck + the manual round-trip in Task 8.

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/tend-week/index.ts
//
// TEND-WEEK — one-shot week-list tending. Given the unplaced pool (+ carried-
// over items) and the week's busy times, returns proposals: merge duplicates,
// put stale items aside, re-grade wrong-sized items, suggest placements.
// No DB reads/writes: the client applies a proposal only when the user taps
// Apply (AI proposes; only the user's tap writes). Auth: user JWT — same
// pattern as sharpen-goal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface TendTask {
  id: string
  title: string
  notes?: string
  project?: string
  ageDays: number
  overdue: boolean
}
interface BusySlot { title: string; start: string; end: string }

function buildPrompt(tasks: TendTask[], weekStart: string, today: string, busy: BusySlot[]): string {
  const taskLines = tasks
    .map((t) => {
      const bits = [
        `id "${t.id}"`,
        `"${t.title}"`,
        t.project ? `project: ${t.project}` : null,
        `${t.ageDays}d old`,
        t.overdue ? 'OVERDUE (carried over)' : null,
        t.notes ? `notes: ${t.notes.slice(0, 120)}` : null,
      ].filter(Boolean)
      return `- ${bits.join(' · ')}`
    })
    .join('\n')
  const busyLines = busy.length
    ? busy.map((b) => `- ${b.start} → ${b.end}: ${b.title}`).join('\n')
    : '(no calendar events this week)'

  return `You are the list gardener for Symphony, a personal planning app. The user's week list (week starting ${weekStart}; today is ${today}) has grown unwieldy. Here are the unplaced tasks:

${taskLines}

Already-busy times this week:
${busyLines}

Propose a SHORT list of tending actions. Kinds:
- "merge": two+ entries are the same real-world task. {"kind":"merge","keepId":"...","dropIds":["..."],"why":"..."} — keep the older/richer one.
- "put_aside": the timing is wrong, not the idea — it has sat untouched and isn't urgent. {"kind":"put_aside","taskId":"...","why":"..."}
- "regrade": wrong-sized for a week — a month-scale chunk or a timeless idea. {"kind":"regrade","taskId":"...","to":"month"|"someday","why":"..."}
- "place": a concrete day/time suggestion this week. {"kind":"place","taskIds":["..."],"date":"YYYY-MM-DD","time":"HH:MM","why":"..."} — you may pair naturally-batched tasks (errands, outdoor work) in one proposal.

Rules:
- Use ONLY the task ids listed above. Never invent ids.
- "date" must be between ${today} and 6 days after ${weekStart}, never before ${today}.
- Avoid the busy times listed. Prefer mornings for focused work, weekends for house/outdoor work.
- Be conservative: at most 8 proposals, only ones you'd defend. An empty list is a fine answer.
- "why" is ONE short sentence, plain language, addressed to the user.

Respond with ONLY a JSON object (no markdown fences, no prose):
{"proposals":[ ... ]}`
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !serviceKey) return json({ error: 'Missing server config' }, 500)

  // Validate the caller's JWT so unauthenticated requests can't bill the model.
  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { tasks?: unknown; weekStart?: unknown; today?: unknown; busy?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const tasks = (Array.isArray(body.tasks) ? body.tasks : [])
    .filter((t): t is TendTask =>
      typeof (t as TendTask)?.id === 'string' && typeof (t as TendTask)?.title === 'string')
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      title: String(t.title).slice(0, 300),
      notes: typeof t.notes === 'string' ? t.notes.slice(0, 300) : undefined,
      project: typeof t.project === 'string' ? t.project.slice(0, 120) : undefined,
      ageDays: typeof t.ageDays === 'number' ? Math.max(0, Math.round(t.ageDays)) : 0,
      overdue: t.overdue === true,
    }))
  const weekStart = typeof body.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : null
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null
  const busy = (Array.isArray(body.busy) ? body.busy : [])
    .filter((b): b is BusySlot =>
      typeof (b as BusySlot)?.start === 'string' && typeof (b as BusySlot)?.end === 'string')
    .slice(0, 40)
    .map((b) => ({ title: typeof b.title === 'string' ? b.title.slice(0, 120) : 'busy', start: b.start, end: b.end }))

  if (tasks.length === 0 || !weekStart || !today) return json({ error: 'tasks, weekStart, today required' }, 400)

  try {
    const text = await callClaude(buildPrompt(tasks, weekStart, today, busy), apiKey)
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(stripped) as { proposals?: unknown }
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.slice(0, 12) : []
    return json({ proposals })
  } catch (e) {
    console.error('tend-week failed:', e)
    return json({ error: 'Tending failed' }, 502)
  }
})
```

- [ ] **Step 2: Typecheck if Deno is available**

Run: `command -v deno >/dev/null && deno check supabase/functions/tend-week/index.ts || echo "deno not installed — skipping (matches other fns; verified at deploy)"`
Expected: `Check … OK` or the skip message. Do NOT install Deno for this.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tend-week/index.ts
git commit -m "feat(tend): tend-week edge function (sharpen-goal auth/call pattern)"
```

**Note for the ship step (not now):** deploy with `supabase functions deploy tend-week --use-api` — the `--use-api` flag is required in this repo (Docker-less deploy). `ANTHROPIC_API_KEY` is already set in the project's function secrets (sharpen-goal uses it).

---

### Task 5: `useTendWeek` hook

**Files:**
- Create: `src/hooks/useTendWeek.ts`
- Test: `src/hooks/useTendWeek.test.ts`

**Interfaces:**
- Consumes: `runPrepass`, `parseTendProposals`, `TendProposal`; `supabase.functions.invoke` from `@/lib/supabase`.
- Produces:

```typescript
export interface UseTendWeekArgs {
  pool: Task[]
  carryOver: Task[]
  weekStartYmd: string
  todayYmd: string
  busy: { title: string; start: string; end: string }[]
  projectNameFor: (task: Task) => string | undefined
}
export interface TendState {
  status: 'idle' | 'reviewing'
  aiLoading: boolean
  aiError: string | null
  proposals: TendProposal[]
  start: () => void
  remove: (proposalId: string) => void   // used for both Apply and Dismiss
  done: () => void
}
export function useTendWeek(args: UseTendWeekArgs): TendState
```

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useTendWeek.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Task } from '@/types/task'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { useTendWeek } from './useTendWeek'

function task(id: string, title: string, createdAt = new Date(2026, 6, 20)): Task {
  return { id, title, completed: false, createdAt, updatedAt: createdAt } as Task
}

const ARGS = {
  weekStartYmd: '2026-07-19',
  todayYmd: '2026-07-22',
  busy: [],
  projectNameFor: () => undefined,
}

beforeEach(() => invoke.mockReset())

describe('useTendWeek', () => {
  it('start() enters reviewing with prepass proposals immediately, then appends AI proposals', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'regrade', taskId: 'b', to: 'month', why: 'month-sized' },
    ] }, error: null })
    const pool = [task('a', 'Weed the backyard'), task('a2', 'Weed the backyard!'), task('b', 'Make a chore plan')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))

    act(() => result.current.start())
    expect(result.current.status).toBe('reviewing')
    expect(result.current.proposals.some((p) => p.kind === 'merge')).toBe(true) // prepass, sync

    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.some((p) => p.kind === 'regrade')).toBe(true)
    expect(result.current.aiError).toBeNull()
  })

  it('keeps prepass proposals and sets aiError when the edge fn fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.aiError).not.toBeNull()
    expect(result.current.proposals).toHaveLength(1)
    expect(result.current.status).toBe('reviewing')
  })

  it('drops AI proposals that target a task already covered by a same-kind pending proposal', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'merge', keepId: 'a', dropIds: ['b'], why: 'dupe (ai agrees)' },
    ] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.filter((p) => p.kind === 'merge')).toHaveLength(1)
  })

  it('remove() deletes one proposal; done() resets to idle', async () => {
    invoke.mockResolvedValue({ data: { proposals: [] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    const id = result.current.proposals[0].id
    act(() => result.current.remove(id))
    expect(result.current.proposals).toHaveLength(0)
    act(() => result.current.done())
    expect(result.current.status).toBe('idle')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useTendWeek.test.ts`
Expected: FAIL — `Cannot find module './useTendWeek'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/hooks/useTendWeek.ts
//
// The Tend sweep's state machine. start() surfaces deterministic prepass
// proposals SYNCHRONOUSLY (the sweep is useful even offline), then asks the
// tend-week edge fn for judgment calls and appends whatever validates.
// Application/dismissal both just remove() the card — the WeekPage owns the
// actual writes via applyProposal.

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types/task'
import { runPrepass } from '@/lib/tend/prepass'
import { parseTendProposals } from '@/lib/tend/validate'
import type { TendProposal } from '@/lib/tend/types'

export interface UseTendWeekArgs {
  pool: Task[]
  carryOver: Task[]
  weekStartYmd: string
  todayYmd: string
  busy: { title: string; start: string; end: string }[]
  projectNameFor: (task: Task) => string | undefined
}

export interface TendState {
  status: 'idle' | 'reviewing'
  aiLoading: boolean
  aiError: string | null
  proposals: TendProposal[]
  start: () => void
  remove: (proposalId: string) => void
  done: () => void
}

/** Task ids a proposal touches, keyed for overlap-dedup between prepass and AI. */
function touchedIds(p: TendProposal): string[] {
  switch (p.kind) {
    case 'merge': return [p.keepId, ...p.dropIds]
    case 'put_aside':
    case 'regrade': return [p.taskId]
    case 'place': return p.taskIds
  }
}

export function useTendWeek(args: UseTendWeekArgs): TendState {
  const [status, setStatus] = useState<'idle' | 'reviewing'>('idle')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<TendProposal[]>([])
  // A sweep started then finished before the fn resolves must not resurrect cards.
  const sweepSeq = useRef(0)

  const { pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor } = args

  const start = useCallback(() => {
    const seq = ++sweepSeq.current
    const prepass = runPrepass(pool, carryOver)
    setProposals(prepass)
    setStatus('reviewing')
    setAiError(null)
    setAiLoading(true)

    const byId = new Map<string, Task>()
    for (const t of [...pool, ...carryOver]) if (!t.completed) byId.set(t.id, t)
    const tasks = [...byId.values()]
    const now = Date.now()
    const body = {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes ? t.notes.slice(0, 300) : undefined,
        project: projectNameFor(t),
        ageDays: Math.max(0, Math.round((now - new Date(t.createdAt).getTime()) / 86400000)),
        overdue: carryOver.some((c) => c.id === t.id),
      })),
      weekStart: weekStartYmd,
      today: todayYmd,
      busy,
    }

    void supabase.functions.invoke('tend-week', { body }).then(({ data, error }) => {
      if (sweepSeq.current !== seq) return // stale sweep
      setAiLoading(false)
      if (error) {
        setAiError(error instanceof Error ? error.message : 'Tending failed')
        return
      }
      const validIds = new Set(tasks.map((t) => t.id))
      const ai = parseTendProposals(data, validIds)
      setProposals((current) => {
        const covered = new Set(current.flatMap((p) => touchedIds(p).map((id) => `${p.kind}:${id}`)))
        const fresh = ai.filter((p) => !touchedIds(p).some((id) => covered.has(`${p.kind}:${id}`)))
        return [...current, ...fresh]
      })
    })
  }, [pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor])

  const remove = useCallback((proposalId: string) => {
    setProposals((current) => current.filter((p) => p.id !== proposalId))
  }, [])

  const done = useCallback(() => {
    sweepSeq.current++
    setStatus('idle')
    setAiLoading(false)
    setAiError(null)
    setProposals([])
  }, [])

  return { status, aiLoading, aiError, proposals, start, remove, done }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useTendWeek.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTendWeek.ts src/hooks/useTendWeek.test.ts
git commit -m "feat(tend): useTendWeek sweep state machine with prepass fallback"
```

---

### Task 6: PlanningShelf component

**Files:**
- Create: `src/components/planning/PlanningShelf.tsx`
- Test: `src/components/planning/PlanningShelf.test.tsx`

**Interfaces:**
- Consumes: `useDraggable`/`useDroppable` from `@dnd-kit/core` (must render inside PlanningSession's DndContext — tests wrap in `<DndContext>`), `TendState` from `@/hooks/useTendWeek`, `applyProposal`'s card semantics (shelf calls `onApplyProposal(p)` then `tend.remove(p.id)` — WeekPage supplies the write).
- Produces:

```typescript
export interface PlanningShelfProps {
  tasks: Task[]                       // session-computed unscheduled pool
  carryOverIds: Set<string>
  projectsMap: Map<string, { id: string; name: string }>
  tasksById: Map<string, Task>        // for rendering proposal card titles
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: 'month' | 'someday') => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  draft: string
  onDraftChange: (v: string) => void
  onSubmitDraft: () => void
  hiddenCount?: number
  showingAll?: boolean
  onToggleShowAll?: () => void
  tend: TendState
  onApplyProposal: (p: TendProposal) => void
}
export function PlanningShelf(props: PlanningShelfProps): JSX.Element
export const SHELF_COLLAPSED_COUNT = 8
```

Ordering contract (tested): carried-over pills first (amber, in given order), then project pills grouped by project name, then loose pills. Collapsed shows the first `SHELF_COLLAPSED_COUNT` pills + a `+N more` toggle. Drag ids are bare `task.id` (same as `PlanningTaskCard`) so `PlanningSession.handleDragEnd` works unchanged; the shelf container is `useDroppable({ id: 'unscheduled-drawer' })` so grid→shelf unschedule works unchanged.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/planning/PlanningShelf.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningShelf, SHELF_COLLAPSED_COUNT } from './PlanningShelf'
import type { PlanningShelfProps } from './PlanningShelf'
import type { Task } from '@/types/task'
import type { TendState } from '@/hooks/useTendWeek'

function task(id: string, title: string, projectId?: string): Task {
  return { id, title, projectId, completed: false, createdAt: new Date(), updatedAt: new Date() } as Task
}

const idleTend: TendState = {
  status: 'idle', aiLoading: false, aiError: null, proposals: [],
  start: vi.fn(), remove: vi.fn(), done: vi.fn(),
}

function renderShelf(overrides: Partial<PlanningShelfProps> = {}) {
  const props: PlanningShelfProps = {
    tasks: [task('c1', 'Ask for YNAB refund'), task('p1', 'Weed the backyard', 'proj'), task('l1', 'Make a chore plan')],
    carryOverIds: new Set(['c1']),
    projectsMap: new Map([['proj', { id: 'proj', name: 'Backyards' }]]),
    tasksById: new Map(),
    onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(),
    draft: '', onDraftChange: vi.fn(), onSubmitDraft: vi.fn(),
    tend: idleTend, onApplyProposal: vi.fn(),
    ...overrides,
  }
  render(<DndContext><PlanningShelf {...props} /></DndContext>)
  return props
}

describe('PlanningShelf', () => {
  it('orders pills carried-over → project → loose and never truncates titles', () => {
    renderShelf()
    const titles = screen.getAllByTestId('shelf-pill-title').map((el) => el.textContent)
    expect(titles).toEqual(['Ask for YNAB refund', 'Weed the backyard', 'Make a chore plan'])
    for (const el of screen.getAllByTestId('shelf-pill-title')) {
      expect(el.className).not.toMatch(/truncate|line-clamp/)
    }
  })

  it('collapses past SHELF_COLLAPSED_COUNT behind a +N more toggle', () => {
    const many = Array.from({ length: SHELF_COLLAPSED_COUNT + 3 }, (_, i) => task(`t${i}`, `Task number ${i}`))
    renderShelf({ tasks: many, carryOverIds: new Set() })
    expect(screen.getAllByTestId('shelf-pill-title')).toHaveLength(SHELF_COLLAPSED_COUNT)
    fireEvent.click(screen.getByRole('button', { name: /3 more/i }))
    expect(screen.getAllByTestId('shelf-pill-title')).toHaveLength(SHELF_COLLAPSED_COUNT + 3)
  })

  it('pill menu routes To month / Put aside / Delete / Open to the right callbacks', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0]) // c1's ⋯
    fireEvent.click(screen.getByRole('menuitem', { name: 'To month' }))
    expect(props.onSetBucket).toHaveBeenCalledWith('c1', 'month')
  })

  it('starts a sweep from the Tend button', () => {
    const props = renderShelf()
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
    expect(props.tend.start).toHaveBeenCalled()
  })

  it('reviewing mode renders proposal cards; Apply calls onApplyProposal then remove', () => {
    const proposal = { kind: 'put_aside' as const, id: 'x1', taskId: 'c1', why: 'Stale for 4 weeks.' }
    const remove = vi.fn()
    const props = renderShelf({
      tasksById: new Map([['c1', task('c1', 'Ask for YNAB refund')]]),
      tend: { ...idleTend, status: 'reviewing', proposals: [proposal], remove },
    })
    expect(screen.getByText('Stale for 4 weeks.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('shelf-pill-title')).toHaveLength(0) // pills replaced
    fireEvent.click(screen.getByRole('button', { name: 'Put aside' }))
    expect(props.onApplyProposal).toHaveBeenCalledWith(proposal)
    expect(remove).toHaveBeenCalledWith('x1')
  })

  it('reviewing mode with no proposals and AI settled shows the healthy message', () => {
    renderShelf({ tend: { ...idleTend, status: 'reviewing', proposals: [] } })
    expect(screen.getByText(/nothing to tend/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/PlanningShelf.test.tsx`
Expected: FAIL — `Cannot find module './PlanningShelf'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/planning/PlanningShelf.tsx
//
// The week's unplaced pool as a full-width lane above the planning grid —
// the calendar "all-day lane" pattern. A task lives HERE or on a day, never
// both. Pills are dnd-kit draggables (bare task.id, same as PlanningTaskCard)
// inside PlanningSession's DndContext; the lane doubles as the
// 'unscheduled-drawer' droppable so dragging a placed block back up here
// unschedules it. Pressing Tend swaps pills for proposal cards (review mode).

import { useMemo, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Sparkles, Plus, MoreHorizontal, X, GitMerge, Archive,
  CornerRightDown, CalendarClock, Loader2,
} from 'lucide-react'
import type { Task } from '@/types/task'
import type { TendState } from '@/hooks/useTendWeek'
import type { TendProposal } from '@/lib/tend/types'
import { PushDropdown } from '@/components/triage'

export const SHELF_COLLAPSED_COUNT = 8

export interface PlanningShelfProps {
  tasks: Task[]
  carryOverIds: Set<string>
  projectsMap: Map<string, { id: string; name: string }>
  tasksById: Map<string, Task>
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: 'month' | 'someday') => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  draft: string
  onDraftChange: (v: string) => void
  onSubmitDraft: () => void
  hiddenCount?: number
  showingAll?: boolean
  onToggleShowAll?: () => void
  tend: TendState
  onApplyProposal: (p: TendProposal) => void
}

function ShelfPill({ task, carried, projectName, onOpenTask, onSetBucket, onDeleteTask, onPushTask }: {
  task: Task
  carried: boolean
  projectName?: string
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: 'month' | 'someday') => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const [menuOpen, setMenuOpen] = useState(false)
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm touch-none cursor-grab active:cursor-grabbing transition-shadow hover:shadow-sm ${
        isDragging ? 'opacity-40' : ''
      } ${carried ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'}`}
      {...attributes}
      {...listeners}
    >
      <span data-testid="shelf-pill-title" className="text-neutral-700">{task.title}</span>
      {projectName && <span className="text-xs text-neutral-400">· {projectName}</span>}
      <span
        className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <PushDropdown size="sm" onPush={(date) => onPushTask(task.id, date)} />
        <button
          type="button"
          aria-label="Task actions"
          onClick={() => setMenuOpen((v) => !v)}
          className="p-0.5 rounded text-neutral-400 hover:text-neutral-700"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </span>
      {menuOpen && (
        <div role="menu" className="absolute top-full left-0 mt-1 z-30 w-36 rounded-lg border border-neutral-200 bg-white shadow-lg py-1 text-sm"
          onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onOpenTask(task.id) }}>Open</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onSetBucket(task.id, 'month') }}>To month</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onSetBucket(task.id, 'someday') }}>Put aside</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50"
            onClick={() => { setMenuOpen(false); onDeleteTask(task.id) }}>Delete</button>
        </div>
      )}
    </div>
  )
}

const PROPOSAL_META: Record<TendProposal['kind'], { label: string; applyLabel: string; Icon: typeof GitMerge; tone: string }> = {
  merge: { label: 'Duplicates', applyLabel: 'Merge', Icon: GitMerge, tone: 'text-amber-700' },
  put_aside: { label: 'Stale', applyLabel: 'Put aside', Icon: Archive, tone: 'text-neutral-500' },
  regrade: { label: 'Wrong size', applyLabel: 'Move', Icon: CornerRightDown, tone: 'text-sky-700' },
  place: { label: 'Placement', applyLabel: 'Place', Icon: CalendarClock, tone: 'text-primary-700' },
}

function proposalTitles(p: TendProposal, tasksById: Map<string, Task>): string[] {
  const ids = p.kind === 'merge' ? [p.keepId, ...p.dropIds] : p.kind === 'place' ? p.taskIds : [p.taskId]
  return ids.map((id) => tasksById.get(id)?.title ?? '(missing task)')
}

export function PlanningShelf(props: PlanningShelfProps) {
  const {
    tasks, carryOverIds, projectsMap, tasksById, onOpenTask, onSetBucket, onDeleteTask, onPushTask,
    draft, onDraftChange, onSubmitDraft, hiddenCount = 0, showingAll = false, onToggleShowAll,
    tend, onApplyProposal,
  } = props
  const { isOver, setNodeRef } = useDroppable({ id: 'unscheduled-drawer' })
  const [expanded, setExpanded] = useState(false)

  // Carried-over → project-grouped (by name) → loose. Stable within groups.
  const ordered = useMemo(() => {
    const carried: Task[] = []
    const byProject = new Map<string, Task[]>()
    const loose: Task[] = []
    for (const t of tasks) {
      if (carryOverIds.has(t.id)) { carried.push(t); continue }
      const p = t.projectId ? projectsMap.get(t.projectId) : undefined
      if (p) {
        const arr = byProject.get(p.id) ?? []
        arr.push(t)
        byProject.set(p.id, arr)
      } else loose.push(t)
    }
    return [...carried, ...[...byProject.values()].flat(), ...loose]
  }, [tasks, carryOverIds, projectsMap])

  const visible = expanded ? ordered : ordered.slice(0, SHELF_COLLAPSED_COUNT)
  const overflow = ordered.length - visible.length
  const carriedCount = ordered.filter((t) => carryOverIds.has(t.id)).length
  const reviewing = tend.status === 'reviewing'

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border px-4 py-3 transition-colors ${
        isOver ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50/70 border-neutral-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-neutral-400">
          {reviewing
            ? `Tending this week · ${tend.proposals.length} suggestion${tend.proposals.length === 1 ? '' : 's'}`
            : `To place (${ordered.length})${carriedCount > 0 ? ` · ${carriedCount} carried over` : ''}`}
        </h2>
        {reviewing ? (
          <button type="button" onClick={tend.done}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800">
            <X className="w-3.5 h-3.5" /> Done
          </button>
        ) : (
          <button type="button" onClick={tend.start} aria-label="Tend this list"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
            <Sparkles className="w-3.5 h-3.5" /> Tend
          </button>
        )}
      </div>

      {reviewing ? (
        <div className="flex flex-wrap gap-2">
          {tend.proposals.map((p) => {
            const meta = PROPOSAL_META[p.kind]
            const titles = proposalTitles(p, tasksById)
            return (
              <div key={p.id} className="w-full sm:w-[calc(50%-4px)] lg:w-[calc(25%-6px)] rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <div className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}>
                  <meta.Icon className="w-3 h-3" /> {meta.label}
                  {p.kind === 'regrade' && <span className="normal-case font-normal">→ {p.to}</span>}
                  {p.kind === 'place' && <span className="normal-case font-normal">→ {p.date}{p.time ? ` ${p.time}` : ''}</span>}
                </div>
                <div className="mt-1 text-sm text-neutral-700">
                  {titles.map((t, i) => (
                    <div key={i} className={p.kind === 'merge' && i > 0 ? 'line-through text-neutral-400' : ''}>{t}</div>
                  ))}
                </div>
                {p.why && <p className="mt-1 text-xs text-neutral-400">{p.why}</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button"
                    onClick={() => { onApplyProposal(p); tend.remove(p.id) }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700">
                    {meta.applyLabel}
                  </button>
                  <button type="button" onClick={() => tend.remove(p.id)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
          {tend.aiLoading && (
            <p className="w-full flex items-center gap-2 text-xs text-neutral-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking for more…
            </p>
          )}
          {!tend.aiLoading && tend.proposals.length === 0 && (
            <p className="w-full text-sm text-neutral-400 py-1">
              {tend.aiError ? 'Couldn’t tend the list — try again.' : 'Nothing to tend — this list looks healthy.'}
            </p>
          )}
          {!tend.aiLoading && tend.aiError && tend.proposals.length > 0 && (
            <p className="w-full text-xs text-neutral-400">AI pass failed — showing the built-in checks only.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visible.map((t) => (
            <ShelfPill key={t.id} task={t} carried={carryOverIds.has(t.id)}
              projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
              onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask} onPushTask={onPushTask} />
          ))}
          {overflow > 0 && (
            <button type="button" onClick={() => setExpanded(true)}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              +{overflow} more
            </button>
          )}
          {expanded && ordered.length > SHELF_COLLAPSED_COUNT && (
            <button type="button" onClick={() => setExpanded(false)}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              Show fewer
            </button>
          )}
          {onToggleShowAll && (hiddenCount > 0 || showingAll) && (
            <button type="button" onClick={onToggleShowAll}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              {showingAll ? 'Week only' : `+${hiddenCount} from the backlog`}
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5">
            <button type="button" onClick={onSubmitDraft} aria-label="Add task"
              className="w-5 h-5 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <input type="text" value={draft} onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmitDraft() }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Add to this week…"
              className="w-36 bg-transparent text-sm placeholder:text-neutral-400 focus:outline-none" />
          </span>
          {ordered.length === 0 && (
            <span className="text-sm text-neutral-400 py-1">
              {isOver ? 'Drop to unschedule' : 'Everything is placed on a day.'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/planning/PlanningShelf.test.tsx`
Expected: PASS (6 tests). If `PushDropdown` import fails, check the export name in `src/components/triage/index.ts` and match it.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/PlanningShelf.tsx src/components/planning/PlanningShelf.test.tsx
git commit -m "feat(week): PlanningShelf — full-width pool lane with Tend review mode"
```

---

### Task 7: PlanningSession shelf mode

**Files:**
- Modify: `src/components/planning/PlanningSession.tsx`
- Test: extend `src/components/planning/PlanningSession.test.tsx`

**Interfaces:**
- Consumes: `PlanningShelfProps` from `./PlanningShelf`.
- Produces: two new optional props on `PlanningSessionProps`:
  - `initialDays?: number` (default 1) — number of days the dateRange starts with (clamped to 7).
  - `shelf?: Omit<PlanningShelfProps, 'tasks' | 'hiddenCount' | 'showingAll' | 'onToggleShowAll'>` — when present, the pool renders as `<PlanningShelf>` full-width ABOVE the grid (flex-col) instead of the side drawer, receiving the session's own `unscheduledTasks` + backlog toggle wiring. Without it, behavior is byte-for-byte unchanged.

- [ ] **Step 1: Add failing tests to PlanningSession.test.tsx**

Read the existing test file first and follow its render helpers/mocks. Add:

```tsx
it('renders the shelf above the grid instead of the drawer when shelf prop is set', () => {
  renderSession({
    initialDays: 7,
    shelf: {
      carryOverIds: new Set<string>(),
      projectsMap: new Map(),
      tasksById: new Map(),
      onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(),
      draft: '', onDraftChange: vi.fn(), onSubmitDraft: vi.fn(),
      tend: { status: 'idle', aiLoading: false, aiError: null, proposals: [], start: vi.fn(), remove: vi.fn(), done: vi.fn() },
      onApplyProposal: vi.fn(),
    },
  })
  expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument()      // drawer gone
  expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument() // shelf present
})

it('initialDays seeds a multi-day range', () => {
  renderSession({ initialDays: 7, initialDate: new Date(2026, 6, 19) })
  // 7 day-column headers on the grid (assert via the existing day-header query pattern)
})
```

(Adapt `renderSession` to whatever helper the existing file uses — pass required props the same way its other tests do.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/planning/PlanningSession.test.tsx`
Expected: new tests FAIL (unknown prop / drawer still rendered); existing tests PASS.

- [ ] **Step 3: Implement**

In `PlanningSession.tsx`:

1. Extend props:

```typescript
import { PlanningShelf, type PlanningShelfProps } from './PlanningShelf'

interface PlanningSessionProps {
  // …existing props unchanged…
  /** Days the range starts with (default 1; clamped to 7). WeekPage passes 7. */
  initialDays?: number
  /** Shelf mode: render the pool as a full-width lane above the grid instead
   *  of the side drawer. The session supplies tasks + backlog toggle. */
  shelf?: Omit<PlanningShelfProps, 'tasks' | 'hiddenCount' | 'showingAll' | 'onToggleShowAll'>
}
```

2. Seed the range (replace the `useState` initializer):

```typescript
const [dateRange, setDateRange] = useState<Date[]>(() => {
  const startDate = initialDate ? new Date(initialDate) : new Date()
  startDate.setHours(0, 0, 0, 0)
  const count = Math.min(Math.max(initialDays ?? 1, 1), 7)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })
})
```

3. Layout — replace the fixed `{/* Main content */}` block's children so drawer XOR shelf renders, keeping DndContext wrapping both shelf and grid:

```tsx
<div className={`flex-1 ${shelf ? 'flex flex-col gap-3 overflow-hidden p-3 pt-0' : 'flex overflow-hidden'}`}>
  <DndContext /* …unchanged props… */>
    {shelf ? (
      <PlanningShelf
        {...shelf}
        tasks={unscheduledTasks}
        hiddenCount={showAllUnscheduled ? 0 : backlogCount}
        showingAll={showAllUnscheduled}
        onToggleShowAll={backlogCount > 0 || showAllUnscheduled ? () => setShowAllUnscheduled((v) => !v) : undefined}
      />
    ) : (
      <PlanningTaskDrawer /* …exactly the current props… */ />
    )}
    <PlanningGrid /* …unchanged… */ />
    <DragOverlay dropAnimation={null}>{/* …unchanged… */}</DragOverlay>
  </DndContext>
</div>
```

Note: `PlanningGrid` already scrolls internally; in column layout give it a wrapping `<div className="flex-1 min-h-0 flex">` if the grid's root needs a flex row parent — check `PlanningGrid`'s root element and preserve whatever display context it expects.

- [ ] **Step 4: Run the full planning test suite**

Run: `npx vitest run src/components/planning/`
Expected: ALL PASS — especially the pre-existing PlanningSession tests (drawer default untouched).

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/PlanningSession.tsx src/components/planning/PlanningSession.test.tsx
git commit -m "feat(planning): PlanningSession shelf mode + initialDays"
```

---### Task 8: WeekPage restructure + shared.tsx exports + smoke tests

**Files:**
- Modify: `src/apps/tasks/horizons/shared.tsx` (return additions only)
- Modify: `src/apps/tasks/horizons/WeekPage.tsx`
- Test: `src/apps/tasks/horizons/pages.smoke.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `useHorizonPageData` additionally returns `{ setBucket, deleteTaskWithUndo, projects, projectsMap, tasksById, weekAnchor }`. WeekPage renders: masthead (with `CascadeRail` inline top-right) → full-height `PlanningSession` with `shelf` + `initialDays={7}` → explainer + UndoToast. No list sections.

- [ ] **Step 1: shared.tsx — expose the extras**

In `useHorizonPageData`:
- `weekAnchor` already exists in scope — add it to the return object.
- `projects`, `projectsMap`, `tasksById` already exist in scope — add them to the return object.
- `setBucket` comes from `useSupabaseTasks` — add to the return object.
- Find the undo-wrapped delete that `renderRow` calls (the callback around line 426–447 that does `undo.pushAction('Deleted …', () => addTask(…))`); export it from the return object as `deleteTaskWithUndo` (add an alias line if it's currently named `deleteTask` via shadowing — do not rename the raw hook function).

Run: `npx vitest run src/apps/tasks/horizons/` — existing smoke tests still PASS.

- [ ] **Step 2: Update the smoke test (failing first)**

In `pages.smoke.test.tsx`, find how WeekPage is currently rendered/mocked and add:

```tsx
it('WeekPage renders one surface — no duplicate list sections', () => {
  renderWeekPage() // existing helper/pattern in this file
  expect(screen.queryByText(/^Carried over/)).not.toBeInTheDocument()
  expect(screen.queryByText(/^Placed this week/)).not.toBeInTheDocument()
  // The shelf is the only pool surface:
  expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument()
})
```

Run: `npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx`
Expected: new test FAILS (sections still render).

- [ ] **Step 3: Rewrite WeekPage**

Keep: `parseLocalYmd`, `localYmd`, `?start=` anchoring, `ScheduleActionsProvider`, `HorizonExplainer`, `UndoToast`, `routines={[]}`, `minDropDate={todayStart}`, `onOpenDay`, the `key=` remount. Delete: CascadeRail block (moves into masthead), carry-over / placed / grouped / loose sections, bottom add input. New body:

```tsx
export function WeekPage() {
  const horizon = 'week' as const;
  const [searchParams] = useSearchParams();
  const startAnchor = parseLocalYmd(searchParams.get('start'));
  const anchoredWeekStart = useMemo(() => {
    if (!startAnchor) return null;
    return weekStartAnchor(startAnchor, readCadenceConfig().weekStartsOn);
  }, [startAnchor]);

  const {
    navigate, familyMembers, eventNotesMap, updateTask, pushTask,
    domainEvents, weekGridTasks, todayStart, railCounts,
    period, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, hasExplainer,
    explainerOpen, setExplainerOpen, label,
    draft, setDraft, submitDraft,
    scheduleActionsValue, undo,
    setBucket, deleteTaskWithUndo, projectsMap, tasksById, weekAnchor,
  } = useHorizonPageData(horizon, anchoredWeekStart ?? undefined);

  const gridStart = anchoredWeekStart ?? weekAnchor;
  const displayPeriod = anchoredWeekStart
    ? `Week of ${anchoredWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : (period ?? label);

  const carryOverIds = useMemo(() => new Set(carryOver.map((t) => t.id)), [carryOver]);
  const busy = useMemo(() => domainEvents
    .map((e) => ({
      title: e.title ?? 'busy',
      start: e.start_time ?? e.startTime ?? '',
      end: e.end_time ?? e.endTime ?? '',
    }))
    .filter((b) => b.start && b.end), [domainEvents]);

  const tend = useTendWeek({
    pool, carryOver,
    weekStartYmd: localYmd(gridStart),
    todayYmd: localYmd(todayStart),
    busy,
    projectNameFor: (t) => (t.projectId ? projectsMap.get(t.projectId)?.name : undefined),
  });

  // Every apply is undoable (spec). Merges undo through deleteTaskWithUndo's
  // own pushAction; bucket-moving kinds capture prior bucket/scheduledFor here
  // and restore them via one setBucket call each.
  const handleApplyProposal = useCallback((p: TendProposal) => {
    if (p.kind !== 'merge') {
      const ids = p.kind === 'place' ? p.taskIds : [p.taskId];
      const prior = ids
        .map((id) => tasksById.get(id))
        .filter((t): t is Task => !!t)
        .map((t) => ({ id: t.id, bucket: t.bucket ?? 'week', scheduledFor: t.scheduledFor, isAllDay: t.isAllDay }));
      const label = p.kind === 'put_aside' ? 'Put aside' : p.kind === 'regrade' ? `Moved to ${p.to}` : 'Placed';
      undo.pushAction(`${label} · Tend`, () => {
        for (const t of prior) setBucket(t.id, t.bucket, t.scheduledFor ? new Date(t.scheduledFor) : undefined, t.isAllDay);
      });
    }
    applyProposal(p, { setBucket, deleteTask: deleteTaskWithUndo });
  }, [setBucket, deleteTaskWithUndo, tasksById, undo]);

  const shelf = useMemo(() => ({
    carryOverIds, projectsMap, tasksById,
    onOpenTask: scheduleActionsValue.onOpenTask,
    onSetBucket: (id: string, bucket: 'month' | 'someday') => setBucket(id, bucket),
    onDeleteTask: deleteTaskWithUndo,
    onPushTask: pushTask,
    draft, onDraftChange: setDraft, onSubmitDraft: () => void submitDraft(),
    tend, onApplyProposal: handleApplyProposal,
  }), [carryOverIds, projectsMap, tasksById, scheduleActionsValue.onOpenTask, setBucket,
       deleteTaskWithUndo, pushTask, draft, setDraft, submitDraft, tend, handleApplyProposal]);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full flex flex-col">
        <div className={`${PAGE_COLUMN} shrink-0`}>
          <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {displayPeriod} · {placedThisWeek.length} placed, {pool.length} to place
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <CascadeRail current={horizon} counts={railCounts} onGo={(h) => navigate(`/${h}`)} />
              <div className="flex items-center gap-3">
                {!planDisabled && (
                  <button type="button" onClick={handlePlan} title={`Plan the ${rungName}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800 transition-colors">
                    <CalendarRange className="w-3.5 h-3.5" /> Plan the {rungName}
                  </button>
                )}
                {hasExplainer && (
                  <button type="button" onClick={() => setExplainerOpen(true)}
                    className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors">
                    What is this level?
                  </button>
                )}
              </div>
            </div>
          </header>
        </div>

        {/* One surface: shelf above, week grid below. A task is on a day or
            on the shelf — never both, never listed again elsewhere. */}
        <div className="flex-1 min-h-0">
          <PlanningSession
            key={localYmd(gridStart)}
            tasks={weekGridTasks}
            events={domainEvents}
            routines={[]}
            familyMembers={familyMembers}
            eventNotesMap={eventNotesMap}
            onUpdateTask={updateTask}
            onPushTask={pushTask}
            onClose={() => {}}
            initialDate={gridStart}
            initialDays={7}
            minDropDate={todayStart}
            onOpenDay={(d) => navigate(`/today?date=${localYmd(d)}`)}
            embedded
            shelf={shelf}
          />
        </div>
      </div>
      <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
    </ScheduleActionsProvider>
  );
}
```

New imports: `useCallback`, `useTendWeek`, `applyProposal`, `TendProposal`, `CascadeRail` (already imported), drop now-unused imports (`Plus`, `ChevronRight`, `FolderOpen`, `renderRow`, `grouped`, `horizonBucket`, `isCascadeRung`, `weekGridStart`) — run lint to catch leftovers.

Grid init note: `initialDate` is now the true week anchor (not clamped to today) so the full week renders with past days visible; `minDropDate` still refuses past drops. This matches the approved mockups (grayed past days).

- [ ] **Step 4: Run horizons + planning suites**

Run: `npx vitest run src/apps/tasks/horizons/ src/components/planning/`
Expected: ALL PASS, including the new smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/apps/tasks/horizons/shared.tsx src/apps/tasks/horizons/WeekPage.tsx src/apps/tasks/horizons/pages.smoke.test.tsx
git commit -m "feat(week): one-surface page — shelf + full-width 7-day grid, list sections removed"
```

---

### Task 9: Full verification + manual pass

- [ ] **Step 1: Full unit suite** — `npx vitest run` → all green.
- [ ] **Step 2: Lint** — `npm run lint` → clean (CI runs lint; pre-push does not).
- [ ] **Step 3: Build** — `npm run build` → exit 0. Run it standalone, never chained with the push.
- [ ] **Step 4: Manual pass** — `npm run dev` in the worktree (`.env` already copied), open `http://localhost:5173/week` (sign in if needed) and verify: shelf pills render grouped with full titles; drag pill → day slot places it and it leaves the shelf; drag placed block → shelf unschedules; `?start=` past/future week anchors correctly with past days refusing drops; Tend on the real pool round-trips the deployed-or-local edge fn gracefully (if the fn isn't deployed yet, expect the "built-in checks only" path — that's the designed degradation, note it in the report).
- [ ] **Step 5: Commit any fixes**, one commit per fix with a message naming the symptom.

**Ship checklist (after Scott approves the branch — not part of this plan's execution):** deploy `supabase functions deploy tend-week --use-api`; rebase on origin/main; `npm run build` (standalone); push branch and merge to main per repo rules.
