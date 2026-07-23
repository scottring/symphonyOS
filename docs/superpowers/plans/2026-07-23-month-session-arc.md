# Month Session Best Laid Plans Arc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resequence the guided monthly planning session to Hart-Unger's Best Laid Plans arc: wins-first opening, migrate-or-release review, calendar scan before writing, fun-composition chips on the write step, a List-template maintenance sweep, and narration audio disabled globally.

**Architecture:** All changes live in the guided-wizard subsystem (`src/components/planning/guided/`) plus one new self-contained hook. Two new step types (`wins`, `maintenance`) follow the existing registry pattern: pure config in `sessions.ts`, component per type in `stepTypes/`, everything reaching app data through `GuidedHost` (steps never import provider-bound hooks directly). The /month spread page is untouched.

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, Supabase (lists/list_items tables), Tailwind v4 Nordic Journal.

## Global Constraints

- Worktree: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/month-arc` (branch `month-session-arc`). All commands run there.
- The /month spread (`src/apps/tasks/horizons/MonthPage.tsx`) must NOT be modified.
- Weekly/seasonal/annual/daily session configs must NOT change (narration disable is global data, not config).
- Task creation into a bucket is ALWAYS one atomic `host.createTaskInBucket(title, bucket, opts)` — never create-then-setBucket (known race).
- No emojis in UI — lucide icons only.
- Run tests with `npx vitest run <path>` (plain `npm test` is watch mode and will hang).
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01PN219GdkHz2wCW9DGJR9R8`

---

### Task 1: Disable narration audio globally

**Files:**
- Modify: `src/components/planning/guided/narration.manifest.json` (replace entire file)
- Test (existing, no edits): `src/components/planning/guided/narration.test.ts`

**Interfaces:**
- Produces: a manifest in bootstrap mode. `narrationClip()` now returns null for every step → all narration renders as text, no audio. Later tasks may freely reword narration strings without drift failures.

- [ ] **Step 1: Replace the manifest content**

Replace the ENTIRE content of `src/components/planning/guided/narration.manifest.json` with:

```json
{
  "bootstrap": true,
  "voiceId": "JBFqnCBsd6RMkjVDRZzb",
  "clips": {}
}
```

(`voiceId` stays so a future `npm run narration` regenerates with the same voice. `public/narration/*.mp3` files stay on disk — unreferenced is harmless, regeneration overwrites.)

- [ ] **Step 2: Run the narration tests**

Run: `npx vitest run src/components/planning/guided/narration.test.ts`
Expected: PASS (2 tests) with a loud console warning `[narration] manifest is in bootstrap mode…` — that warning is the designed behavior, not a failure.

- [ ] **Step 3: Commit**

```bash
git add src/components/planning/guided/narration.manifest.json
git commit -m "feat(planning): disable narration audio (manifest to bootstrap mode)"
```

---

### Task 2: `wins` step type — celebrate the month's closed moves

**Files:**
- Modify: `src/components/planning/guided/types.ts` (StepType union)
- Create: `src/components/planning/guided/stepTypes/WinsStep.tsx`
- Create: `src/components/planning/guided/stepTypes/WinsStep.test.tsx`
- Modify: `src/components/planning/guided/stepTypes/index.ts` (register)

**Interfaces:**
- Consumes: `useGuided()` → `host.tasks`, `periodStart`, `periodEnd` (from `GuidedStepRenderContext`); `makeAssigneeFilter` from `@/lib/today/assigneeFilter`.
- Produces: step type string `'wins'` registered and renderable. Task 6's monthly config uses `{ id: 'wins', type: 'wins', … }`.

A task counts as a win when `completed` AND the assignee filter matches AND (`bucket === 'month'` OR `scheduledFor` falls in `[periodStart, periodEnd]`). This mirrors `monthDoneCount` in MonthPage.tsx:76-87 (kept separate on purpose — the spread is untouchable; a comment cross-references it).

- [ ] **Step 1: Add the type to the union**

In `src/components/planning/guided/types.ts`, extend the `StepType` union (after the `'book-next'` line):

```typescript
  | 'book-next'      // create next session's calendar item
  | 'wins'           // monthly opener: completed moves, read-only celebration
```

- [ ] **Step 2: Write the failing test**

Create `src/components/planning/guided/stepTypes/WinsStep.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { WinsStep } from './WinsStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const STEP = { id: 'wins', type: 'wins' as const, title: 'Celebrate wins', narration: 'x'.repeat(30) }

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 't1', title: over.title ?? 'Move', completed: false,
    createdAt: new Date('2026-07-02'), updatedAt: new Date('2026-07-02'),
    ...over,
  } as Task
}

describe('WinsStep', () => {
  it('lists completed month-bucket moves and completed tasks scheduled in the period', () => {
    const host = makeHost({
      tasks: [
        task({ id: 'a', title: 'Order dishwasher', completed: true, bucket: 'month' }),
        task({ id: 'b', title: 'Book dentist', completed: true, bucket: 'timed', scheduledFor: new Date(2026, 6, 10) }),
        task({ id: 'c', title: 'Outside period', completed: true, bucket: 'timed', scheduledFor: new Date(2026, 5, 10) }),
        task({ id: 'd', title: 'Still open', completed: false, bucket: 'month' }),
      ],
    })
    renderStep(<WinsStep />, { step: STEP, host })
    expect(screen.getByText(/You closed 2 moves/)).toBeInTheDocument()
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
    expect(screen.getByText('Book dentist')).toBeInTheDocument()
    expect(screen.queryByText('Outside period')).not.toBeInTheDocument()
    expect(screen.queryByText('Still open')).not.toBeInTheDocument()
  })

  it('zero state is warm, never guilt', () => {
    renderStep(<WinsStep />, { step: STEP, host: makeHost() })
    expect(screen.getByText(/Nothing closed out yet/)).toBeInTheDocument()
  })

  it('singular copy for one win', () => {
    const host = makeHost({ tasks: [task({ id: 'a', completed: true, bucket: 'month' })] })
    renderStep(<WinsStep />, { step: STEP, host })
    expect(screen.getByText(/You closed 1 move\b/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/planning/guided/stepTypes/WinsStep.test.tsx`
Expected: FAIL — `Cannot find module './WinsStep'` (or equivalent resolve error).

- [ ] **Step 4: Write the component**

Create `src/components/planning/guided/stepTypes/WinsStep.tsx`:

```tsx
// src/components/planning/guided/stepTypes/WinsStep.tsx
//
// The month session's opening beat (Best Laid Plans): start from evidence,
// not guilt. Read-only list of what actually got closed this month — the
// same "win" shape as MonthPage's masthead monthDoneCount (kept separate;
// the spread page is its own artifact): completed AND (still bucket='month',
// finished before ever hitting a day, OR scheduled inside the period).
import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function WinsStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])

  const wins = useMemo(
    () => host.tasks.filter((t) => {
      if (!t.completed || !match(t.assignedTo, t.assignedToAll)) return false
      if (t.bucket === 'month') return true
      if (!t.scheduledFor) return false
      const d = new Date(t.scheduledFor)
      return d >= periodStart && d <= periodEnd
    }),
    [host.tasks, match, periodStart, periodEnd],
  )

  if (wins.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Nothing closed out yet — that&rsquo;s what this month is for. The wins land here next time.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-700">
        You closed {wins.length} {wins.length === 1 ? 'move' : 'moves'} this month.
      </p>
      <ul className="space-y-1.5">
        {wins.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm text-neutral-600">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-500" />
            <span className="min-w-0">{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Register the type**

In `src/components/planning/guided/stepTypes/index.ts` add:

```typescript
import { WinsStep } from './WinsStep'
```

and after the `registerStepType('book-next', BookNextStep)` line:

```typescript
registerStepType('wins', WinsStep)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/planning/guided/stepTypes/WinsStep.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/guided/types.ts src/components/planning/guided/stepTypes/WinsStep.tsx src/components/planning/guided/stepTypes/WinsStep.test.tsx src/components/planning/guided/stepTypes/index.ts
git commit -m "feat(planning): wins step — month session opens from evidence"
```

---

### Task 3: `useUpkeepList` hook + GuidedHost wiring

**Files:**
- Create: `src/hooks/useUpkeepList.ts`
- Create: `src/hooks/useUpkeepList.test.ts`
- Modify: `src/components/planning/guided/GuidedContext.tsx` (GuidedHost interface)
- Modify: `src/components/planning/guided/GuidedSessionContainer.tsx` (wire hook into host)
- Modify: `src/components/planning/guided/stepTypes/testHarness.tsx` (makeHost defaults)

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`, `useAuth` from `@/hooks/useAuth` (hook only — the STEP never touches these).
- Produces (exact, Task 4 depends on these):
  - `export const UPKEEP_LIST_TITLE = 'Monthly upkeep'`
  - `export const UPKEEP_SEED_ITEMS: string[]` (five starters)
  - `export function useUpkeepList(): { upkeepItems: { id: string; text: string }[]; upkeepLoading: boolean; ensureUpkeepList: () => Promise<void> }`
  - `GuidedHost` gains: `upkeepItems: { id: string; text: string }[]`, `upkeepLoading: boolean`, `ensureUpkeepList: () => Promise<void>`

Self-contained hook (does NOT reuse `useLists`/`useListItems` — their optimistic state can't atomically cover create-list-then-seed-items, and the wizard only needs read + ensure). Finds the current user's list titled "Monthly upkeep" (case-insensitive), loads its OPEN (not completed) items; `ensureUpkeepList()` creates the list (category `home`, visibility `self`) and inserts the five seed items only when the list is absent — idempotent, guarded against double-fire.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useUpkeepList.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useUpkeepList, UPKEEP_LIST_TITLE, UPKEEP_SEED_ITEMS } from './useUpkeepList'

let mockUser: { id: string } | null = { id: 'test-user-id' }
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, error: null }),
}))

// Scenario state the supabase mock serves
let listRows: { id: string; title: string }[] = []
let itemRows: { id: string; text: string; completed: boolean }[] = []
const inserted: { table: string; payload: unknown }[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === 'lists') {
          return {
            eq: () => ({
              ilike: () => ({
                limit: () => Promise.resolve({ data: listRows, error: null }),
              }),
            }),
          }
        }
        return {
          eq: (_f: string, _v: string) => ({
            eq: () => ({
              order: () => Promise.resolve({ data: itemRows, error: null }),
            }),
          }),
        }
      },
      insert: (payload: unknown) => {
        inserted.push({ table, payload })
        if (table === 'lists') {
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-list-id', title: UPKEEP_LIST_TITLE }, error: null }),
            }),
          }
        }
        return Promise.resolve({ data: null, error: null })
      },
    }),
  },
}))

describe('useUpkeepList', () => {
  beforeEach(() => {
    mockUser = { id: 'test-user-id' }
    listRows = []
    itemRows = []
    inserted.length = 0
  })

  it('loads open items from an existing upkeep list', async () => {
    listRows = [{ id: 'list-1', title: 'Monthly upkeep' }]
    itemRows = [
      { id: 'i1', text: 'Reconcile budget (YNAB)', completed: false },
      { id: 'i2', text: 'Old done thing', completed: true },
    ]
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    // The completed item is filtered out by the query in production; the mock
    // returns rows verbatim, so assert the hook exposes what the query returns
    // minus nothing — production filters completed=false server-side.
    expect(result.current.upkeepItems.some((i) => i.text === 'Reconcile budget (YNAB)')).toBe(true)
  })

  it('ensureUpkeepList creates and seeds when absent', async () => {
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    expect(result.current.upkeepItems).toEqual([])
    await act(() => result.current.ensureUpkeepList())
    expect(inserted.some((c) => c.table === 'lists')).toBe(true)
    const itemInsert = inserted.find((c) => c.table === 'list_items')
    expect(itemInsert).toBeDefined()
    expect((itemInsert!.payload as unknown[]).length).toBe(UPKEEP_SEED_ITEMS.length)
    // Seeds surface immediately without waiting for a refetch
    expect(result.current.upkeepItems.length).toBe(UPKEEP_SEED_ITEMS.length)
  })

  it('ensureUpkeepList is a no-op when the list exists', async () => {
    listRows = [{ id: 'list-1', title: 'monthly UPKEEP' }] // case-insensitive match
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    await act(() => result.current.ensureUpkeepList())
    expect(inserted.length).toBe(0)
  })
})
```

If the mock's chained shape fights the implementation you write, adjust the MOCK to the implementation's exact call chain — the assertions (what was inserted, what is exposed) are the contract, the chain shape is not.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useUpkeepList.test.ts`
Expected: FAIL — cannot find module `./useUpkeepList`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useUpkeepList.ts`:

```typescript
// src/hooks/useUpkeepList.ts
//
// The "Monthly upkeep" template list backing the guided month session's
// maintenance sweep. Self-contained (not useLists/useListItems) so
// create-list-then-seed is one atomic ensure() with no optimistic-state
// races. The list is user-editable in the normal Lists UI; the wizard only
// reads open items and creates the list once.
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export const UPKEEP_LIST_TITLE = 'Monthly upkeep'
export const UPKEEP_SEED_ITEMS = [
  'Reconcile budget (YNAB)',
  'Paper & mail sweep',
  'One declutter target',
  'Household supply blitz',
  'Meal-ops reset',
]

export interface UpkeepItem { id: string; text: string }

export function useUpkeepList(): {
  upkeepItems: UpkeepItem[]
  upkeepLoading: boolean
  ensureUpkeepList: () => Promise<void>
} {
  const { user } = useAuth()
  const [items, setItems] = useState<UpkeepItem[]>([])
  const [listId, setListId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ensuring = useRef(false)

  useEffect(() => {
    if (!user) { setItems([]); setListId(null); setLoading(false); return }
    let cancelled = false
    async function load() {
      if (!user) return
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title')
        .eq('user_id', user.id)
        .ilike('title', UPKEEP_LIST_TITLE)
        .limit(1)
      if (cancelled) return
      const list = lists?.[0] ?? null
      setListId(list?.id ?? null)
      if (!list) { setItems([]); setLoading(false); return }
      const { data: rows } = await supabase
        .from('list_items')
        .select('id, text, completed')
        .eq('list_id', list.id)
        .eq('completed', false)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      setItems((rows ?? []).map((r) => ({ id: r.id, text: r.text })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const ensureUpkeepList = useCallback(async () => {
    if (!user || listId || loading || ensuring.current) return
    ensuring.current = true
    try {
      const { data: created, error } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          title: UPKEEP_LIST_TITLE,
          icon: null,
          category: 'home',
          visibility: 'self',
          hidden_from: null,
          sort_order: 999,
        })
        .select()
        .single()
      if (error || !created) return
      const seedRows = UPKEEP_SEED_ITEMS.map((text, i) => ({
        user_id: user.id,
        list_id: created.id,
        text,
        note: null,
        sort_order: i,
        parent_item_id: null,
      }))
      await supabase.from('list_items').insert(seedRows)
      setListId(created.id)
      // Surface seeds immediately; ids are provisional until next full load,
      // which is fine — the wizard only reads text and needs a stable key.
      setItems(UPKEEP_SEED_ITEMS.map((text, i) => ({ id: `seed-${i}`, text })))
    } finally {
      ensuring.current = false
    }
  }, [user, listId, loading])

  return { upkeepItems: items, upkeepLoading: loading, ensureUpkeepList }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useUpkeepList.test.ts`
Expected: PASS (3 tests). If the mock chain shape mismatches, fix the mock (see Step 1 note).

- [ ] **Step 5: Extend GuidedHost + container + test harness**

In `src/components/planning/guided/GuidedContext.tsx`, add to the `GuidedHost` interface after the routines block (end of interface):

```typescript
  // Monthly maintenance sweep (Best Laid Plans): the "Monthly upkeep"
  // template list — open items + one idempotent find-or-create-with-seeds.
  upkeepItems: { id: string; text: string }[]
  upkeepLoading: boolean
  ensureUpkeepList: () => Promise<void>
```

In `src/components/planning/guided/GuidedSessionContainer.tsx`:
- Add import: `import { useUpkeepList } from '@/hooks/useUpkeepList'`
- Inside the component, alongside the other hook calls (near line 33-40): `const { upkeepItems, upkeepLoading, ensureUpkeepList } = useUpkeepList()`
- In the `useMemo<GuidedHost>` object (line ~113), add `upkeepItems, upkeepLoading, ensureUpkeepList,` to both the object literal AND the dependency array.

In `src/components/planning/guided/stepTypes/testHarness.tsx`, add to the `makeHost` defaults (before `...overrides`):

```typescript
    upkeepItems: [], upkeepLoading: false, ensureUpkeepList: vi.fn(async () => {}),
```

- [ ] **Step 6: Run the whole guided suite to catch host-shape fallout**

Run: `npx vitest run src/components/planning/guided`
Expected: PASS across the board (all existing step tests use `makeHost`, which now carries the new fields).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useUpkeepList.ts src/hooks/useUpkeepList.test.ts src/components/planning/guided/GuidedContext.tsx src/components/planning/guided/GuidedSessionContainer.tsx src/components/planning/guided/stepTypes/testHarness.tsx
git commit -m "feat(planning): useUpkeepList hook wired into GuidedHost"
```

---

### Task 4: `maintenance` step type — the sweep

**Files:**
- Modify: `src/components/planning/guided/types.ts` (StepType union)
- Create: `src/components/planning/guided/stepTypes/MaintenanceStep.tsx`
- Create: `src/components/planning/guided/stepTypes/MaintenanceStep.test.tsx`
- Modify: `src/components/planning/guided/stepTypes/index.ts` (register)

**Interfaces:**
- Consumes: `host.upkeepItems`, `host.upkeepLoading`, `host.ensureUpkeepList()`, `host.tasks`, `host.createTaskInBucket(title, 'month')` — all from Task 3.
- Produces: step type `'maintenance'`. Task 6's monthly config uses `{ id: 'maintenance', type: 'maintenance', … }`.

Behavior: on mount, call `ensureUpkeepList()` once (idempotent — creates + seeds only when absent). Each open template item renders with an "Add to month" action. An item whose text case-insensitively equals an OPEN month-bucket task's title renders as already-on ("On the list", disabled, check icon). Clicking adds via one atomic `createTaskInBucket(text, 'month')` and the row flips to the on-state (track locally-added texts in state so feedback is instant even before `host.tasks` refreshes). Template items are never completed/deleted here — the List is the durable template.

- [ ] **Step 1: Add the type to the union**

In `src/components/planning/guided/types.ts`:

```typescript
  | 'wins'           // monthly opener: completed moves, read-only celebration
  | 'maintenance'    // monthly: sweep the "Monthly upkeep" template into month moves
```

- [ ] **Step 2: Write the failing test**

Create `src/components/planning/guided/stepTypes/MaintenanceStep.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MaintenanceStep } from './MaintenanceStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const STEP = { id: 'maintenance', type: 'maintenance' as const, title: 'Upkeep', narration: 'x'.repeat(30) }

describe('MaintenanceStep', () => {
  it('calls ensureUpkeepList on mount', () => {
    const host = makeHost()
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(host.ensureUpkeepList).toHaveBeenCalledTimes(1)
  })

  it('adds a template item to the month atomically (bucket in options)', async () => {
    const host = makeHost({ upkeepItems: [{ id: 'i1', text: 'Paper & mail sweep' }] })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    fireEvent.click(screen.getByRole('button', { name: /Add to month/i }))
    await waitFor(() =>
      expect(host.createTaskInBucket).toHaveBeenCalledWith('Paper & mail sweep', 'month'))
    // Row flips to on-state without waiting for host.tasks to refresh
    expect(screen.getByText(/On the list/)).toBeInTheDocument()
  })

  it('marks items already open on the month list (case-insensitive) and disables them', () => {
    const monthTask = { id: 't1', title: 'paper & MAIL sweep', completed: false, bucket: 'month' } as Task
    const host = makeHost({
      tasks: [monthTask],
      upkeepItems: [{ id: 'i1', text: 'Paper & mail sweep' }],
    })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(screen.getByText(/On the list/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to month/i })).not.toBeInTheDocument()
    expect(host.createTaskInBucket).not.toHaveBeenCalled()
  })

  it('shows a loading line while the template loads', () => {
    const host = makeHost({ upkeepLoading: true })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(screen.getByText(/Loading your upkeep list/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/planning/guided/stepTypes/MaintenanceStep.test.tsx`
Expected: FAIL — cannot find module `./MaintenanceStep`.

- [ ] **Step 4: Write the component**

Create `src/components/planning/guided/stepTypes/MaintenanceStep.tsx`:

```tsx
// src/components/planning/guided/stepTypes/MaintenanceStep.tsx
//
// The month session's life-maintenance sweep (Best Laid Plans): a durable
// "Monthly upkeep" List is the template; this step pulls chosen items onto
// the month as ordinary moves. The template is never mutated here — edit it
// in the Lists UI. First run seeds the template (host.ensureUpkeepList).
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Wrench } from 'lucide-react'
import { useGuided } from '../GuidedContext'

export function MaintenanceStep() {
  const { host } = useGuided()
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Idempotent: creates + seeds only when the list is absent.
  useEffect(() => { void host.ensureUpkeepList() }, [host])

  const openMonthTitles = useMemo(
    () => new Set(host.tasks
      .filter((t) => !t.completed && t.bucket === 'month')
      .map((t) => t.title.trim().toLowerCase())),
    [host.tasks],
  )

  if (host.upkeepLoading) {
    return <p className="text-sm text-neutral-400">Loading your upkeep list…</p>
  }
  if (host.upkeepItems.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Your upkeep template is empty — add the recurring chores of adulthood to the
        &ldquo;Monthly upkeep&rdquo; list and they&rsquo;ll appear here every month.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400 inline-flex items-center gap-1.5">
        <Wrench className="w-3.5 h-3.5" />
        Your template — edit it anytime in Lists. Pull this month&rsquo;s picks onto the list.
      </p>
      <ul className="space-y-1.5">
        {host.upkeepItems.map((item) => {
          const key = item.text.trim().toLowerCase()
          const onList = added.has(key) || openMonthTitles.has(key)
          return (
            <li key={item.id}
              className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-2 text-sm text-neutral-700">
              <span className="flex-1 min-w-0">{item.text}</span>
              {onList ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" /> On the list
                </span>
              ) : (
                <button type="button"
                  onClick={() => {
                    setAdded((s) => new Set(s).add(key))
                    void host.createTaskInBucket(item.text, 'month')
                  }}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-primary-600 hover:bg-primary-50 rounded-md px-2 py-1 transition-colors shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add to month
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Register the type**

In `src/components/planning/guided/stepTypes/index.ts` add the import and:

```typescript
registerStepType('maintenance', MaintenanceStep)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/planning/guided/stepTypes/MaintenanceStep.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/guided/types.ts src/components/planning/guided/stepTypes/MaintenanceStep.tsx src/components/planning/guided/stepTypes/MaintenanceStep.test.tsx src/components/planning/guided/stepTypes/index.ts
git commit -m "feat(planning): maintenance sweep step — upkeep template to month moves"
```

---

### Task 5: Fun-composition chips on the write step

**Files:**
- Modify: `src/components/planning/guided/types.ts` (props)
- Modify: `src/components/planning/guided/stepTypes/WriteListStep.tsx`
- Modify: `src/components/planning/guided/stepTypes/WriteListStep.test.tsx` (add cases)

**Interfaces:**
- Consumes: existing `funRatio` tally block in WriteListStep (lines ~147-154).
- Produces: `props.funComposition?: boolean` — Task 6 sets it on the monthly `write-month` step.

- [ ] **Step 1: Add the prop**

In `src/components/planning/guided/types.ts`, inside `props?: { … }` after the `softCap` entry:

```typescript
    /** write-list (monthly): render Hart-Unger's fun-composition recipe chips
     *  above the fun tally. Static recipe, no per-chip classification. */
    funComposition?: boolean
```

- [ ] **Step 2: Write the failing tests**

In `src/components/planning/guided/stepTypes/WriteListStep.test.tsx`, add (inside the existing describe, reusing that file's existing step/render helpers — match local conventions):

```tsx
  it('renders the fun-composition recipe chips when funComposition is set', () => {
    // build a step config identical to the file's month write step but with
    // props: { bucket: 'month', funComposition: true }
    // …render…
    expect(screen.getByText('One big experience')).toBeInTheDocument()
    expect(screen.getByText('A few social things')).toBeInTheDocument()
    expect(screen.getByText('A themed quest — optional')).toBeInTheDocument()
  })

  it('omits the recipe chips without funComposition', () => {
    // …render the plain month write step…
    expect(screen.queryByText('One big experience')).not.toBeInTheDocument()
  })
```

(Adapt the render call to the file's existing helper — read the file's existing tests first and follow their exact pattern for building `step` and calling `renderStep`.)

- [ ] **Step 3: Run to verify the new cases fail**

Run: `npx vitest run src/components/planning/guided/stepTypes/WriteListStep.test.tsx`
Expected: the two new cases FAIL (chips not rendered); existing cases PASS.

- [ ] **Step 4: Implement the chips**

In `src/components/planning/guided/stepTypes/WriteListStep.tsx`, directly BEFORE the existing fun-tally block (`{pool.length > 0 && (…funRatio…)}`, ~line 149), insert:

```tsx
      {/* Hart-Unger's fun recipe (Best Laid Plans): name the composition so
          "fun" means a shape, not a vibe. Static hint — no classification. */}
      {step.props?.funComposition && (
        <div className="flex flex-wrap gap-1.5">
          {['One big experience', 'A few social things', 'A themed quest — optional'].map((label) => (
            <span key={label}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/60 px-2.5 py-1 text-[11px] text-amber-700">
              <Sparkles className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>
      )}
```

(`Sparkles` is already imported in this file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/planning/guided/stepTypes/WriteListStep.test.tsx`
Expected: PASS including the two new cases.

- [ ] **Step 6: Commit**

```bash
git add src/components/planning/guided/types.ts src/components/planning/guided/stepTypes/WriteListStep.tsx src/components/planning/guided/stepTypes/WriteListStep.test.tsx
git commit -m "feat(planning): fun-composition recipe chips on the month write step"
```

---

### Task 6: Resequence the monthly session config

**Files:**
- Modify: `src/components/planning/guided/sessions.ts` (monthly block ONLY)
- Modify: `src/components/planning/guided/sessions.test.ts` (KNOWN_TYPES + order test)

**Interfaces:**
- Consumes: step types `'wins'` (Task 2), `'maintenance'` (Task 4), prop `funComposition` (Task 5).
- Produces: the shipped monthly arc.

- [ ] **Step 1: Update the order test first (failing)**

In `src/components/planning/guided/sessions.test.ts`:

Extend `KNOWN_TYPES`:

```typescript
const KNOWN_TYPES: StepType[] = [
  'narration', 'reflect', 'review', 'look-above', 'projects', 'calendar',
  'write-list', 'inbox', 'schedule-grid', 'domains-goals', 'book-next',
  'wins', 'maintenance',
]
```

Add inside the describe block:

```typescript
  it('monthly follows the Best Laid Plans arc', () => {
    expect(SESSIONS.monthly.steps.map((s) => s.id)).toEqual([
      'welcome', 'wins', 'month-review', 'look-at-season', 'month-ahead',
      'look-within', 'projects-in-motion', 'write-month', 'maintenance', 'book-next',
    ])
    const write = SESSIONS.monthly.steps.find((s) => s.id === 'write-month')
    expect(write?.props?.funComposition).toBe(true)
  })
```

Run: `npx vitest run src/components/planning/guided/sessions.test.ts`
Expected: the new test FAILS (old order).

- [ ] **Step 2: Rewrite the monthly block**

In `src/components/planning/guided/sessions.ts`, replace the ENTIRE `monthly:` entry with (estMinutes and chain unchanged; `month-review`'s existing `byDomain` on `look-within` is PRESERVED below — copy it exactly from the current file):

```typescript
  monthly: {
    horizon: 'monthly',
    title: 'Plan the month',
    estMinutes: [15, 25],
    chain: { horizon: 'weekly', label: 'Plan the week now' },
    steps: [
      {
        id: 'welcome', type: 'narration', title: 'A clean slate',
        narration: 'This is your monthly planning session — a clean slate, twelve times a year. One arc, about twenty minutes: celebrate what happened, migrate what is unfinished, scan what is already claimed, check in with yourself, then write the month — its moves, its fun, and the upkeep that keeps life running.',
      },
      {
        id: 'wins', type: 'wins', title: 'Start with the wins',
        narration: 'Start with what actually happened. These are the moves you closed this month — read them slowly and take the credit. Most months hold more than you remember, and the review works better when it starts from evidence instead of guilt.',
      },
      {
        id: 'month-review', type: 'review', title: 'Migrate or release',
        narration: 'Now the honest half. Here is what is still open from the month. For each item, migrate it or release it: carry it forward only if you would write it again today, park it on Someday if the timing is wrong, or let it go. A shorter list you believe is worth more than a long one you ignore.',
        props: { bucket: 'month' },
      },
      {
        id: 'look-at-season', type: 'look-above', title: 'Check the season',
        narration: 'Step up to the season for a moment. These are your picks — notice which ones are moving and which have a month-sized next step waiting. Copy a line down if this is its month; the original stays on the season list.',
        props: { aboveBucket: 'quarter', aboveLabel: 'Your season picks' },
      },
      {
        id: 'month-ahead', type: 'calendar', title: 'What’s already claimed',
        narration: 'Before you write anything, scan the month’s calendar and ask one question: what is already claimed? Trips, deadlines, the weeks that are spoken for. The open space that remains is what you are actually planning.',
      },
      {
        id: 'look-within', type: 'reflect', title: 'Look within',
        narration: "A quick check on yourself, and on the people around you. How is your energy? And is there anything with each other or the kids that needs attention this month?",
        props: { notesKey: 'relationships', placeholder: 'Energy — and what needs attention with each other and the kids…' },
        byDomain: {
          work: {
            narration: "A quick check on yourself, and on the people you work with. How is your energy for this? And is there anything with a colleague, a client, or a commitment that needs attention this month?",
            placeholder: 'Energy — and what needs attention with colleagues, clients, commitments…',
          },
          personal: {
            narration: "A quick check on yourself, for yourself. How is your energy, your health, your headspace? And is there a habit or a need of your own that deserves attention this month?",
            placeholder: 'Energy, health, headspace — what of yours needs attention…',
          },
        },
      },
      {
        id: 'projects-in-motion', type: 'projects', title: 'Projects in motion',
        narration: "Your projects in motion, for reference. A month moves a project one concrete chunk at a time — an order placed, a call made, a decision written down. Let these suggest month-sized moves for the list you’re about to write.",
      },
      {
        id: 'write-month', type: 'write-list', title: "Write the month’s list",
        narration: "Write the month’s list. Keep it honest — and build the fun on purpose: one big experience, a few social things, maybe a themed quest. A month with nothing to look forward to is a scheduling failure.",
        props: { bucket: 'month', rows: 'plain', funComposition: true },
      },
      {
        id: 'maintenance', type: 'maintenance', title: 'The upkeep sweep',
        narration: 'Last sweep: the quiet upkeep that keeps the month from ambushing you — the budget, the paperwork, the pile you have been ignoring. Pull this month’s picks onto the list. Small, boring, load-bearing.',
      },
      {
        id: 'book-next', type: 'book-next', title: 'Anchor the next step',
        narration: "Book next month’s session before you close. First weekend of the month works well.",
        props: { bookHorizon: 'monthly', bookTitle: 'Monthly planning session' },
      },
    ],
  },
```

- [ ] **Step 3: Run the guided suite**

Run: `npx vitest run src/components/planning/guided`
Expected: ALL PASS — sessions order test, registry test (both new types registered), narration test (bootstrap warning), every step test.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/guided/sessions.ts src/components/planning/guided/sessions.test.ts
git commit -m "feat(planning): monthly session follows the Best Laid Plans arc"
```

---

### Task 7: Full verification

**Files:** none new.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all green. Investigate ANY failure — known flake: `useNotes` (parked memory) — rerun once before diagnosing.

- [ ] **Step 2: Type-check + production build**

Run: `npm run build`
Expected: exit 0. (Pre-push tsc is NOT the same as the Vercel build — this is the gate that counts.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0 (CI runs lint; the pre-push hook does not).

- [ ] **Step 4: Commit any stragglers**

```bash
git status --short
```

Expected: clean (or commit leftovers with an appropriate message).
