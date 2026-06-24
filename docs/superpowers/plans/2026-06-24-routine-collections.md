# Routines as Collections (#1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a routine that has Steps as one collapsed Today row ("Next up + progress") that expands to its steps, while every step-less routine renders exactly as today.

**Architecture:** A Step is a routine row tagged with `parent_routine_id` (reuses dosing + per-slot completion). Pure builders partition the flat routine list into collections-with-steps vs standalone routines, then turn each collection into one `routine-collection` TimelineItem (progress + next-up + pre-built nested step items). `grouping.ts` routes standalone routines through the existing dose-expansion path unchanged, and collections through the new builder. The Today UI gains a collapsible collection row; expanded steps reuse the existing per-dose completion handler.

**Tech Stack:** React 19 + TS strict, Vite, Supabase (Postgres + Deno edge), Vitest.

## Global Constraints

- Work only in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections` (branch `routine-collections`). Never touch the main worktree.
- **Base assumption:** the `converse-ingest` dosing work is present on the base — `routines.times_per_day`, `image_url`, `pin_to_timeline`, `project_id`; `src/lib/today/doseExpansion.ts` exporting `expandRoutineDoses`, `parseRoutineTimelineId`, `routineStatusKey`; the dosed `.flatMap(expandRoutineDoses…)` routine block in `src/lib/today/grouping.ts`. If a referenced symbol is missing, STOP and report — do not reimplement it.
- A Step is a routine row with `parent_routine_id` set; "Step" is the user-facing/word everywhere; no separate steps table.
- Routine timeline id is `routine-<id>` (bare) or `routine-<id>#<slot>` (dosed); a **collection** item id is `routine-collection-<id>`.
- `actionable_instances` completion is unchanged: entity_type `'routine'`, free-form `entity_id` (slotted for dosed). No new completion table/key.
- **Hard backward-compat:** a routine with `parent_routine_id = null` and no children must produce the byte-for-byte same TimelineItem as before (regression test required).
- No emojis — `lucide-react` icons only. No em dashes in UI copy.
- Single-test run is `npx vitest run <file>` (never plain `npm test` — watch mode). PATH fix if node missing: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Migrations: additive only, applied via the Supabase Management API (token from keychain) AND committed under `supabase/migrations/`.

---

## File Structure

**Create:**
- `supabase/migrations/2026-06-24_routine_parent_steps.sql` — `parent_routine_id`, `step_order`.
- `src/lib/today/routineCollections.ts` — pure `groupRoutineSteps` + `buildCollectionItem`.
- `src/lib/today/routineCollections.test.ts` — unit tests for both.
- `src/components/schedule/RoutineCollectionRow.tsx` — the collapsed/expandable collection row.

**Modify:**
- `src/types/actionable.ts` — `Routine.parent_routine_id`, `Routine.step_order`, `RoutineWithSteps`.
- `src/types/timeline.ts` — `'routine-collection'` type + collection fields.
- `src/hooks/useRoutines.ts` — persist the two new fields.
- `src/lib/today/grouping.ts` — route standalone vs collections in the routine block.
- `src/lib/today/grouping.test.ts` — collection + backward-compat cases.
- `src/components/schedule/TodayView.tsx` — render `routine-collection` items via the new row; wire expanded-step completion.

---

## Task 1: Schema + Routine types + persistence

**Files:**
- Create: `supabase/migrations/2026-06-24_routine_parent_steps.sql`
- Modify: `src/types/actionable.ts` (Routine interface), `src/hooks/useRoutines.ts`

**Interfaces:**
- Produces: `Routine.parent_routine_id?: string | null`, `Routine.step_order?: number | null`. `CreateRoutineInput`/`UpdateRoutineInput` accept both; create persists, update persists when present. Fetch already uses `select('*')` so both surface automatically.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-06-24_routine_parent_steps.sql
alter table routines add column if not exists parent_routine_id uuid references routines(id) on delete cascade;
alter table routines add column if not exists step_order integer;
create index if not exists idx_routines_parent on routines(parent_routine_id);
```

- [ ] **Step 2: Apply via Management API + verify**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"alter table routines add column if not exists parent_routine_id uuid references routines(id) on delete cascade; alter table routines add column if not exists step_order integer; create index if not exists idx_routines_parent on routines(parent_routine_id);"}'
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name from information_schema.columns where table_name='\''routines'\'' and column_name in ('\''parent_routine_id'\'','\''step_order'\'');"}'
```
Expected: first `[]`, second lists both columns.

- [ ] **Step 3: Extend the Routine type**

In `src/types/actionable.ts`, in `interface Routine`, after `project_id`:
```typescript
  project_id?: string | null // Optional link to the program/project this routine belongs to
  parent_routine_id?: string | null // When set, this routine is a Step of that collection
  step_order?: number | null // Ordering within a parent collection; null sorts last
```
At the end of the same file (after the `Routine` interface), add:
```typescript
/** A routine collection with its ordered Steps attached (derived, not stored). */
export interface RoutineWithSteps extends Routine {
  steps: Routine[]
}
```

- [ ] **Step 4: Persist in useRoutines**

In `CreateRoutineInput` add `parent_routine_id?: string | null` and `step_order?: number | null`; in `UpdateRoutineInput` the same. In the create insert object (near `project_id: input.project_id ?? null,`):
```typescript
          project_id: input.project_id ?? null,
          parent_routine_id: input.parent_routine_id ?? null,
          step_order: input.step_order ?? null,
```
In the update conditional block (near `if (input.project_id !== undefined) updates.project_id = input.project_id`):
```typescript
      if (input.parent_routine_id !== undefined) updates.parent_routine_id = input.parent_routine_id
      if (input.step_order !== undefined) updates.step_order = input.step_order
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.
```bash
git add supabase/migrations/2026-06-24_routine_parent_steps.sql src/types/actionable.ts src/hooks/useRoutines.ts
git commit -m "feat(routines): parent_routine_id + step_order (Step model foundation)"
```

---

## Task 2: TimelineItem collection type

**Files:**
- Modify: `src/types/timeline.ts`

**Interfaces:**
- Produces: `TimelineItemType` includes `'routine-collection'`. `TimelineItem` gains optional `collectionProgress?: { done: number; total: number }`, `collectionNextUp?: { stepId: string; stepName: string; time: string | null; doseSlot: number | null }`, and `steps?: TimelineItem[]` (pre-built per-dose step items for a collection).

- [ ] **Step 1: Extend the type union + fields**

In `src/types/timeline.ts`:
```typescript
export type TimelineItemType = 'task' | 'event' | 'routine' | 'routine-collection'
```
In `interface TimelineItem`, in the "Routine-specific" group:
```typescript
  // Routine-specific
  recurrencePattern?: RecurrencePattern
  // Routine-collection-specific
  collectionProgress?: { done: number; total: number }
  collectionNextUp?: { stepId: string; stepName: string; time: string | null; doseSlot: number | null }
  steps?: TimelineItem[] // pre-built per-dose step items; present only on 'routine-collection'
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: no new errors (additive optional fields).
```bash
git add src/types/timeline.ts
git commit -m "feat(timeline): routine-collection item type + fields"
```

---

## Task 3: groupRoutineSteps (pure, TDD)

**Files:**
- Create: `src/lib/today/routineCollections.ts`
- Test: `src/lib/today/routineCollections.test.ts`

**Interfaces:**
- Consumes: `Routine`, `RoutineWithSteps` (Task 1).
- Produces: `groupRoutineSteps(routines: Routine[]): { collections: RoutineWithSteps[]; standalone: Routine[] }`. A routine with ≥1 child is a collection (children attached as `steps`, ordered by `step_order` asc with nulls last, then `time_of_day`, then `name`). A routine with `parent_routine_id` set is a Step (never in `standalone`/`collections` top-level). A parentless, childless routine is `standalone`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/today/routineCollections.test.ts
import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { groupRoutineSteps } from './routineCollections'

function r(over: Partial<Routine>): Routine {
  return {
    id: 'r', user_id: 'u', name: 'R', description: null, default_assignee: null,
    assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, times_per_day: null,
    image_url: null, raw_input: null, show_on_timeline: true,
    parent_routine_id: null, step_order: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('groupRoutineSteps', () => {
  it('parentless childless routine is standalone', () => {
    const { collections, standalone } = groupRoutineSteps([r({ id: 'solo' })])
    expect(standalone.map(x => x.id)).toEqual(['solo'])
    expect(collections).toEqual([])
  })
  it('a routine with children becomes a collection; children are its ordered steps', () => {
    const parent = r({ id: 'hep', name: 'Shoulder HEP' })
    const s2 = r({ id: 's2', name: 'B', parent_routine_id: 'hep', step_order: 2 })
    const s1 = r({ id: 's1', name: 'A', parent_routine_id: 'hep', step_order: 1 })
    const { collections, standalone } = groupRoutineSteps([parent, s2, s1])
    expect(standalone).toEqual([])
    expect(collections).toHaveLength(1)
    expect(collections[0].id).toBe('hep')
    expect(collections[0].steps.map(s => s.id)).toEqual(['s1', 's2']) // ordered by step_order
  })
  it('null step_order sorts after ordered steps, tiebreak by time then name', () => {
    const parent = r({ id: 'p' })
    const ordered = r({ id: 'o', parent_routine_id: 'p', step_order: 1 })
    const lateA = r({ id: 'la', name: 'Z', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const lateB = r({ id: 'lb', name: 'A', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const { collections } = groupRoutineSteps([parent, lateA, lateB, ordered])
    expect(collections[0].steps.map(s => s.id)).toEqual(['o', 'lb', 'la']) // ordered; then null by time then name
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/today/routineCollections.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement groupRoutineSteps**

```typescript
// src/lib/today/routineCollections.ts
import type { Routine, RoutineWithSteps } from '@/types/actionable'

function stepSort(a: Routine, b: Routine): number {
  const ao = a.step_order, bo = b.step_order
  if (ao != null && bo != null && ao !== bo) return ao - bo
  if (ao != null && bo == null) return -1
  if (ao == null && bo != null) return 1
  const at = a.time_of_day ?? '', bt = b.time_of_day ?? ''
  if (at !== bt) return at < bt ? -1 : 1
  return a.name.localeCompare(b.name)
}

/** Partition a flat routine list into collections (with ordered steps) + standalone routines. */
export function groupRoutineSteps(routines: Routine[]): { collections: RoutineWithSteps[]; standalone: Routine[] } {
  const stepsByParent = new Map<string, Routine[]>()
  for (const r of routines) {
    if (r.parent_routine_id) {
      const arr = stepsByParent.get(r.parent_routine_id) ?? []
      arr.push(r)
      stepsByParent.set(r.parent_routine_id, arr)
    }
  }
  const collections: RoutineWithSteps[] = []
  const standalone: Routine[] = []
  for (const r of routines) {
    if (r.parent_routine_id) continue // it's a step, lives under its parent
    const steps = stepsByParent.get(r.id)
    if (steps && steps.length > 0) {
      collections.push({ ...r, steps: [...steps].sort(stepSort) })
    } else {
      standalone.push(r)
    }
  }
  return { collections, standalone }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/today/routineCollections.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/today/routineCollections.ts src/lib/today/routineCollections.test.ts
git commit -m "feat(today): groupRoutineSteps partitions routines into collections + standalone"
```

---

## Task 4: buildCollectionItem (pure, TDD)

**Files:**
- Modify: `src/lib/today/routineCollections.ts` (add function)
- Modify: `src/lib/today/routineCollections.test.ts` (add cases)

**Interfaces:**
- Consumes: `RoutineWithSteps`, `expandRoutineDoses`/`routineStatusKey` (`./doseExpansion`), `routineToTimelineItem` (`@/types/timeline`), `ActionableInstance`.
- Produces: `buildCollectionItem(collection: RoutineWithSteps, viewedDate: Date, routineStatusMap: Map<string, ActionableInstance>): TimelineItem` — a `'routine-collection'` item with `id = 'routine-collection-<collection.id>'`, `title = collection.name`, `steps` = per-dose TimelineItems of every step (each `completed` set from the status map, `startTime` from its dose time), `collectionProgress = { done, total }` (counting doses), `collectionNextUp` = earliest incomplete dose by time, `startTime` = next-up time (or earliest dose time if all done), `completed = total > 0 && done === total`.

- [ ] **Step 1: Write the failing tests**

```typescript
// add to src/lib/today/routineCollections.test.ts
import { buildCollectionItem } from './routineCollections'
import type { ActionableInstance } from '@/types/actionable'

describe('buildCollectionItem', () => {
  const date = new Date('2026-06-24T00:00:00')
  it('one collapsed item; progress counts doses; next-up is earliest incomplete', () => {
    const collection = {
      ...r({ id: 'hep', name: 'Shoulder HEP' }),
      steps: [
        r({ id: 'chin', name: 'Chin Tuck', parent_routine_id: 'hep', times_per_day: ['07:00', '13:00'] }),
        r({ id: 'med', name: 'Median Nerve Glide', parent_routine_id: 'hep', times_per_day: ['09:00'] }),
      ],
    }
    // chin#0 (07:00) completed; chin#1 (13:00) + med#0 (09:00) pending
    const status = new Map<string, ActionableInstance>([
      ['chin#0', { entity_type: 'routine', entity_id: 'chin#0', status: 'completed' } as ActionableInstance],
    ])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.type).toBe('routine-collection')
    expect(item.id).toBe('routine-collection-hep')
    expect(item.collectionProgress).toEqual({ done: 1, total: 3 })
    expect(item.collectionNextUp?.time).toBe('09:00') // earliest incomplete across steps
    expect(item.collectionNextUp?.stepName).toBe('Median Nerve Glide')
    expect(item.steps?.map(s => s.id).sort()).toEqual(['routine-chin#0', 'routine-chin#1', 'routine-med#0'])
    expect(item.completed).toBe(false)
  })
  it('all doses done → completed, anchored at earliest dose', () => {
    const collection = { ...r({ id: 'c', name: 'C' }), steps: [r({ id: 's', name: 'S', parent_routine_id: 'c', time_of_day: '08:00' })] }
    const status = new Map<string, ActionableInstance>([['s', { entity_type: 'routine', entity_id: 's', status: 'completed' } as ActionableInstance]])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.completed).toBe(true)
    expect(item.collectionProgress).toEqual({ done: 1, total: 1 })
    expect(item.collectionNextUp).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/today/routineCollections.test.ts` → FAIL (buildCollectionItem not exported).

- [ ] **Step 3: Implement buildCollectionItem**

```typescript
// add to src/lib/today/routineCollections.ts
import type { ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { routineToTimelineItem } from '@/types/timeline'
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'

export function buildCollectionItem(
  collection: RoutineWithSteps,
  viewedDate: Date,
  routineStatusMap: Map<string, ActionableInstance>,
): TimelineItem {
  const stepItems: TimelineItem[] = []
  let earliest: { time: string; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let nextUp: { time: string | null; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let total = 0
  let done = 0

  for (const step of collection.steps) {
    for (const dose of expandRoutineDoses(step)) {
      total += 1
      const item = routineToTimelineItem(step, viewedDate)
      item.id = dose.slotId
      if (dose.time) {
        const [h, m] = dose.time.split(':').map(Number)
        const start = new Date(viewedDate)
        start.setHours(h, m, 0, 0)
        item.startTime = start
      }
      const completed = routineStatusMap.get(routineStatusKey(step.id, dose.slotIndex))?.status === 'completed'
      if (completed) { item.completed = true; done += 1 }
      stepItems.push(item)

      if (dose.time && (!earliest || dose.time < earliest.time)) {
        earliest = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
      if (!completed && dose.time && (!nextUp || nextUp.time == null || dose.time < nextUp.time)) {
        nextUp = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
    }
  }

  const allDone = total > 0 && done === total
  const anchor = nextUp?.time ?? earliest?.time ?? null
  let startTime: Date | null = null
  if (anchor) {
    const [h, m] = anchor.split(':').map(Number)
    startTime = new Date(viewedDate)
    startTime.setHours(h, m, 0, 0)
  }

  return {
    id: `routine-collection-${collection.id}`,
    type: 'routine-collection',
    title: collection.name,
    startTime,
    endTime: null,
    completed: allDone,
    context: collection.context,
    assignedTo: collection.assigned_to,
    originalRoutine: collection,
    collectionProgress: { done, total },
    collectionNextUp: nextUp
      ? { stepId: nextUp.stepId, stepName: nextUp.stepName, time: nextUp.time, doseSlot: nextUp.doseSlot }
      : undefined,
    steps: stepItems,
  }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/today/routineCollections.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/today/routineCollections.ts src/lib/today/routineCollections.test.ts
git commit -m "feat(today): buildCollectionItem (progress + next-up + nested step items)"
```

---

## Task 5: Wire collections into grouping.ts

**Files:**
- Modify: `src/lib/today/grouping.ts` (the routine block, ~lines 62-99)
- Modify: `src/lib/today/grouping.test.ts` (add cases)

**Interfaces:**
- Consumes: `groupRoutineSteps`, `buildCollectionItem` (Tasks 3-4).
- Produces: standalone routines render via the existing per-dose expansion (unchanged); each collection renders as ONE `routine-collection` item via `buildCollectionItem`; steps never appear as top-level items.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/today/grouping.test.ts` (uses its existing `matchAll`; build routines inline):
```typescript
it('a collection renders as one routine-collection item; steps are not top-level', () => {
  const date = new Date('2026-06-24T00:00:00')
  const hep = { id: 'hep', user_id: 'u', name: 'Shoulder HEP', recurrence_pattern: { type: 'daily' },
    parent_routine_id: null, assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
  const step = { id: 'chin', user_id: 'u', name: 'Chin Tuck', recurrence_pattern: { type: 'daily' },
    parent_routine_id: 'hep', times_per_day: ['09:00'], assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
  const g = buildGroupedSections({
    timedTasks: [], events: [], routines: [hep, step], viewedDate: date,
    routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
  })
  const flat = Object.values(g).flat()
  const coll = flat.filter(i => i.type === 'routine-collection')
  expect(coll.map(i => i.id)).toEqual(['routine-collection-hep'])
  // the step does NOT appear as its own top-level routine item
  expect(flat.some(i => i.id === 'routine-chin#0')).toBe(false)
  expect(coll[0].steps?.map(s => s.id)).toEqual(['routine-chin#0'])
})

it('a standalone routine still renders unchanged (backward-compat)', () => {
  const date = new Date('2026-06-24T00:00:00')
  const solo = { id: 'solo', user_id: 'u', name: 'Take meds', recurrence_pattern: { type: 'daily' },
    parent_routine_id: null, time_of_day: '08:00', assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
  const g = buildGroupedSections({
    timedTasks: [], events: [], routines: [solo], viewedDate: date,
    routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
  })
  const flat = Object.values(g).flat()
  expect(flat.find(i => i.type === 'routine')?.id).toBe('routine-solo')
  expect(flat.some(i => i.type === 'routine-collection')).toBe(false)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/today/grouping.test.ts` → FAIL (step appears top-level / no collection item).

- [ ] **Step 3: Implement the routing**

In `src/lib/today/grouping.ts`, add imports:
```typescript
import { groupRoutineSteps, buildCollectionItem } from './routineCollections'
```
Replace the existing `const routineItems = routines.filter(...).flatMap(...)` block. Keep the EXISTING per-dose expansion (with the deferred_to logic) but apply it only to **standalone** routines; add collection items:
```typescript
const matchedRoutines = routines.filter((routine) => match(routine.assigned_to, routine.assigned_to_all))
const { collections, standalone } = groupRoutineSteps(matchedRoutines)

const standaloneItems = standalone.flatMap((routine) =>
  expandRoutineDoses(routine).map((dose) => {
    const item = routineToTimelineItem(routine, viewedDate)
    item.id = dose.slotId
    if (dose.time) {
      const [h, m] = dose.time.split(':').map(Number)
      const start = new Date(viewedDate)
      start.setHours(h, m, 0, 0)
      item.startTime = start
    }
    const instance = routineStatusMap.get(routineStatusKey(routine.id, dose.slotIndex))
    if (instance?.status === 'completed') item.completed = true
    else if (instance?.status === 'skipped') item.skipped = true
    if (instance?.deferred_to) {
      const deferredTime = new Date(instance.deferred_to)
      const deferredDateStr = deferredTime.toISOString().split('T')[0]
      const viewedDateStr = viewedDate.toISOString().split('T')[0]
      if (instance.status === 'pending' || (instance.status === 'deferred' && deferredDateStr === viewedDateStr)) {
        item.startTime = deferredTime
      }
    }
    return item
  }),
)

const collectionItems = collections.map((c) => buildCollectionItem(c, viewedDate, routineStatusMap))
const routineItems = [...standaloneItems, ...collectionItems]
```
(The rest of `buildGroupedSections` — `allItems`, `groupByDaySection`, relocation — is unchanged.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/today/grouping.test.ts` → PASS (new + all existing). Then `npx vitest run src/lib/today/` → all green.

- [ ] **Step 5: Commit**
```bash
git add src/lib/today/grouping.ts src/lib/today/grouping.test.ts
git commit -m "feat(today): route routine collections vs standalone in grouping"
```

---

## Task 6: Collapsed collection row UI + step completion

**Files:**
- Create: `src/components/schedule/RoutineCollectionRow.tsx`
- Modify: `src/components/schedule/TodayView.tsx` (render `routine-collection`; wire step completion)

**Interfaces:**
- Consumes: a `routine-collection` TimelineItem (`collectionProgress`, `collectionNextUp`, `steps`); existing `onCompleteRoutine(routineEntityId, completed)`.
- Produces: a collapsed row showing title, `done / total`, and "Next up: `<time> <step>`", expandable to its `steps` with per-dose checkboxes that call `onCompleteRoutine`.

- [ ] **Step 1: Build the row component**

```tsx
// src/components/schedule/RoutineCollectionRow.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'

interface Props {
  item: TimelineItem // type === 'routine-collection'
  onSelect: () => void
  onCompleteStep: (stepEntityId: string, completed: boolean) => void
}

function fmt(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

export function RoutineCollectionRow({ item, onSelect, onCompleteStep }: Props) {
  const [open, setOpen] = useState(false)
  const p = item.collectionProgress ?? { done: 0, total: 0 }
  const nextUp = item.collectionNextUp
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-800 truncate">{item.title}</span>
            <span className="text-xs text-neutral-400">{p.done} / {p.total}</span>
          </div>
          {item.completed
            ? <span className="text-xs text-neutral-400">Done</span>
            : nextUp && <span className="text-xs text-neutral-500">Next up: {fmt(nextUp.time)} {nextUp.stepName}</span>}
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-3 py-1.5 space-y-1">
          {(item.steps ?? []).map(step => (
            <div key={step.id} className="flex items-center gap-2 py-1">
              <button
                onClick={() => onCompleteStep(step.id, !step.completed)}
                aria-label={step.completed ? 'Mark step incomplete' : 'Mark step complete'}
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${step.completed ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300'}`}
              >
                {step.completed && <Check className="w-3 h-3" />}
              </button>
              <span className={`text-sm flex-1 truncate ${step.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}
                onClick={onSelect}>
                {step.title}
              </span>
              {step.startTime && <span className="text-xs text-neutral-400">{step.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render it in TodayView**

In `src/components/schedule/TodayView.tsx`, find where a timeline `item` is rendered (the `item.type === 'routine'` / standard-item branch around line 748-890). Add a branch BEFORE the standard `<ScheduleItem>` render: when `item.type === 'routine-collection'`, render the new row. The step-completion handler reuses `onCompleteRoutine` (the step id is already the slotted routine entity id, e.g. `routine-chin#0` → strip the `routine-` prefix to the slotted entity id):
```tsx
import { RoutineCollectionRow } from './RoutineCollectionRow'
import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
// ...in the per-item render, before the standard return:
if (item.type === 'routine-collection') {
  return (
    <div key={item.id} data-item-id={item.id}>
      <RoutineCollectionRow
        item={item}
        onSelect={() => handleSelectItem(item.id)}
        onCompleteStep={(stepTimelineId, completed) => {
          if (!onCompleteRoutine) return
          const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
          const entityId = slot === null ? routineId : `${routineId}#${slot}`
          onCompleteRoutine(entityId, completed)
        }}
      />
    </div>
  )
}
```
> Match the exact surrounding map/return structure in TodayView (it wraps items in a keyed `<div>`); place this branch so it returns before the standalone `<ScheduleItem>` path. Do not alter the `routine` / `task` / `event` branches.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — Expected: no new errors.

- [ ] **Step 4: Run the Today/schedule unit suites**

Run: `npx vitest run src/lib/today src/components/schedule` — Expected: green.

- [ ] **Step 5: Commit**
```bash
git add src/components/schedule/RoutineCollectionRow.tsx src/components/schedule/TodayView.tsx
git commit -m "feat(today): collapsed routine-collection row with per-step completion"
```

---

## Task 7: Seed the Shoulder HEP collection

**Files:** none (one-off data migration via API).

**Interfaces:** Consumes the live HEP data created this session (3 dosed exercise routines sharing a `project_id`). Produces a real collection to render.

- [ ] **Step 1: Find the HEP routines + create the collection parent**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
Q(){ curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"query\":\"$1\"}"; }
# Inspect the dosed exercise routines (the HEP steps) and their shared project_id + user_id.
Q "select id, name, project_id, user_id, assigned_to from routines where times_per_day is not null order by name;"
```
Expected: the three exercises with a common `project_id` and `user_id`.

- [ ] **Step 2: Create the parent collection routine + re-parent the exercises**

Using the `user_id`, `assigned_to`, and the exercises' ids from Step 1, create a "Shoulder HEP" parent routine and set each exercise's `parent_routine_id` to it with `step_order`:
```bash
# Create parent (fill <USER_ID>, <ASSIGNEE> from Step 1):
Q "insert into routines (user_id, name, recurrence_pattern, visibility, show_on_timeline, context, assigned_to, assigned_to_all) values ('<USER_ID>','Shoulder HEP','{\"type\":\"daily\"}','active',true,'personal','<ASSIGNEE>',array['<ASSIGNEE>']::uuid[]) returning id;"
# Re-parent the three exercises (fill <HEP_ID> from the insert above):
Q "update routines set parent_routine_id='<HEP_ID>', step_order=1 where name='Chin Tuck - Supine';"
Q "update routines set parent_routine_id='<HEP_ID>', step_order=2 where name='Median Nerve Glide';"
Q "update routines set parent_routine_id='<HEP_ID>', step_order=3 where name='Radial Nerve Glide - A';"
```

- [ ] **Step 3: Move the source PDF attachment onto the collection (if present)**

```bash
# If a project attachment exists for the HEP, re-point it to the new routine collection:
Q "update attachments set entity_type='routine', entity_id='<HEP_ID>' where entity_type='project' and entity_id=(select project_id from routines where id='<HEP_ID_OR_ANY_STEP>');"
```
(Skip if no project attachment exists. `entity_type='routine'` is allowed by the converse-ingest migration.)

- [ ] **Step 4: Verify**

```bash
Q "select name, parent_routine_id, step_order from routines where parent_routine_id is not null or name='Shoulder HEP' order by step_order nulls first;"
```
Expected: "Shoulder HEP" (parent null) + three steps with `parent_routine_id` = HEP id, ordered 1..3.

- [ ] **Step 5: Commit a note** (no code; record the seed in the plan's ledger / PR description — nothing to commit unless you scripted it into a file).

---

## Task 8: End-to-end acceptance

**Files:** none (manual).

- [ ] **Step 1: Run the worktree dev server**
```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections && npm run dev
```

- [ ] **Step 2: Verify on Today**

Open Today (Personal/All domain, assignee = you). Expected:
- "Shoulder HEP" shows as ONE collapsed row, anchored at its next due dose, reading "Next up: `<time>` `<exercise>`" with `done / total`.
- Expanding shows the three exercises (with their doses); checking a dose advances Next-up and updates progress; collapsing reflects the new progress.
- Every other (standalone) routine looks and behaves exactly as before. No "hide daily" needed to keep Today tidy.

- [ ] **Step 3: Full suite + build before any push**
```bash
npx vitest run && npx tsc --noEmit && npm run build
```
Expected: green. Then push the branch as a preview (NOT main): `git push origin routine-collections`.

---

## Self-Review

- **Spec coverage:** data model + RoutineWithSteps/groupRoutineSteps (Tasks 1, 3); collection-as-one-row with next-up/progress + auto band by next-due dose (Tasks 2, 4, 5); per-step/per-dose completion reusing actionable_instances (Tasks 4, 6); hard backward-compat for parentless routines (Task 5 test); seed Shoulder HEP (Task 7); acceptance (Task 8). "Mark all done" from the spec is NOT in this plan — it is a small expanded-view affordance; deferred to the editing spec (#2) to keep #1 read-only on structure. (Flagged so it isn't a silent gap.)
- **Placeholder scan:** the only fill-ins are Task 7's live ids (`<USER_ID>`, `<HEP_ID>`, `<ASSIGNEE>`), which are inherently data-dependent and are fetched in Step 1 — not plan placeholders.
- **Type consistency:** `groupRoutineSteps`/`buildCollectionItem` signatures identical across Tasks 3-5; `RoutineWithSteps` (Task 1) used in 3-4; `collectionProgress`/`collectionNextUp`/`steps` field names identical across Tasks 2, 4, 6; collection id format `routine-collection-<id>` consistent (Tasks 4, 5, 6); step entity-id derivation via `parseRoutineTimelineId` matches the dosed scheme.
