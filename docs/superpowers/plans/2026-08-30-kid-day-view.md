# Kid Day View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One per-member day page on the wall kiosk (checklists + target steps like "read ≥20 min"), replacing the legacy `/morning` and `/bedtime` views.

**Architecture:** New pure model (`kidDayModel`) turns raw routines + today's task items + instance history into banded rows; a full-screen overlay (`KidDayView`) inside `WallV2Shell` renders it, opened by tapping a member's portrait on the gantt board. Progress writes go through `useActionableInstances` via a new `addProgress`/`setProgress` pair backed by a pure `targetProgress` helper. Target editing lands in the existing Tap panels.

**Tech Stack:** React 19 + TS strict, Vite, Tailwind v4 (wall theme tokens), Supabase, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-kid-day-view-design.md`

## Global Constraints

- Work in worktree `.worktrees/kid-day-view`, branch `feat/kid-day-view`. Never touch the main worktree. Do NOT push to `main` until final verification passes.
- Node 22.14.0 required. If tools are missing: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- Run tests with `npx vitest run <file>` — `npm test` is watch mode and never exits.
- Typecheck with `npx tsc -p tsconfig.app.json --noEmit` (bare `tsc --noEmit` at root is a no-op).
- Icons: lucide-react only, never emoji characters in UI.
- No new polling loops; the wall polls every 12 min and that stays the only loop. One-shot fetches on user action are fine.
- DDL is ALREADY APPLIED in prod (Scott ran it 2026-08-30): `routines.target_amount int`, `routines.target_unit text check in ('minutes','count')`, `actionable_instances.progress int`. Do not write a migration file; do not run DDL.
- Streaks/counts appear ONLY inside KidDayView. Nothing count-like on the main board or Today (standing rule).
- Undo/uncomplete must set explicit state, never re-toggle.

---

### Task 1: Routine target fields + instance progress — types and write path

**Files:**
- Modify: `src/types/actionable.ts` (Routine interface ~line 68; ActionableInstance interface ~line 27)
- Modify: `src/hooks/useRoutines.ts` (`UpdateRoutineInput` ~line 167; `updateRoutine` passthrough block ~line 397–447; `addRoutine` insert object ~line 350)
- Test: `src/hooks/useRoutines.test.ts` (existing file; `describe('updateRoutine')` starts ~line 524)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Routine.target_amount?: number | null`, `Routine.target_unit?: 'minutes' | 'count' | null`, `ActionableInstance.progress: number | null`, and `updateRoutine(id, { target_amount, target_unit })` persisting both. Also `TargetUnit` exported from `src/types/actionable.ts`.

- [ ] **Step 1: Write the failing test**

In `src/hooks/useRoutines.test.ts`, inside the existing `describe('updateRoutine')` block, add (mirror the setup of the neighbouring `updateRoutine` tests in that block — same `renderHook`/`act` scaffolding and `mockUpdate` assertions):

```ts
it('passes target fields through to the update', async () => {
  const { result } = renderHook(() => useRoutines())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  await act(async () => {
    await result.current.updateRoutine('1', { target_amount: 20, target_unit: 'minutes' })
  })
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ target_amount: 20, target_unit: 'minutes' })
  )

  await act(async () => {
    await result.current.updateRoutine('1', { target_amount: null, target_unit: null })
  })
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ target_amount: null, target_unit: null })
  )
})
```

If the surrounding tests use a different waiting idiom (e.g. `waitFor` on `routines.length`), copy that idiom instead — the assertion on `mockUpdate` is the part that matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useRoutines.test.ts -t "passes target fields"`
Expected: FAIL — TS error (`target_amount` not in `UpdateRoutineInput`) or `mockUpdate` not called with those keys.

- [ ] **Step 3: Implement**

`src/types/actionable.ts`:

```ts
export type TargetUnit = 'minutes' | 'count'
```

In `interface Routine`, after `pin_to_timeline`:

```ts
  /** Daily quantity goal — "read 20 minutes" = 20/'minutes'. Both null = plain checkbox step. */
  target_amount?: number | null
  target_unit?: TargetUnit | null
```

In `interface ActionableInstance`, after `skipped_at`:

```ts
  /** Running total toward the routine's target for this date, in target_unit. Null = untracked. */
  progress: number | null
```

`src/hooks/useRoutines.ts` — in `UpdateRoutineInput`:

```ts
  target_amount?: number | null
  target_unit?: TargetUnit | null
```

(import `TargetUnit` from `@/types/actionable`). In `updateRoutine`'s passthrough block, after the `pin_to_timeline` line:

```ts
      if (input.target_amount !== undefined) updates.target_amount = input.target_amount
      if (input.target_unit !== undefined) updates.target_unit = input.target_unit
```

In `addRoutine`'s insert object, after `pin_to_timeline`:

```ts
          target_amount: input.target_amount ?? null,
          target_unit: input.target_unit ?? null,
```

and add the same two optional fields to `CreateRoutineInput`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useRoutines.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/actionable.ts src/hooks/useRoutines.ts src/hooks/useRoutines.test.ts
git commit -m "feat(routines): target_amount/target_unit fields + instance progress type"
```

---

### Task 2: `targetProgress` pure helper + `addProgress`/`setProgress` mutations

**Files:**
- Create: `src/lib/wall/targetProgress.ts`
- Create: `src/lib/wall/targetProgress.test.ts`
- Modify: `src/hooks/useActionableInstances.ts` (add two mutations beside `markDone` ~line 185; export them in the return object ~line 613)

**Interfaces:**
- Consumes: `ActionableInstance.progress` (Task 1).
- Produces:

```ts
// src/lib/wall/targetProgress.ts
export interface ProgressPatch {
  progress: number
  status: 'completed' | 'pending'
  completed_at: string | null
}
export function applyProgressDelta(current: number | null, delta: number, target: number | null, now: Date): ProgressPatch
export function applyProgressExact(value: number, target: number | null, now: Date): ProgressPatch
```

```ts
// useActionableInstances() return additions
addProgress: (entityType: EntityType, entityId: string, date: Date, amount: number, target: number | null) => Promise<boolean>
setProgress: (entityType: EntityType, entityId: string, date: Date, value: number, target: number | null) => Promise<boolean>
```

- [ ] **Step 1: Write the failing tests**

`src/lib/wall/targetProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyProgressDelta, applyProgressExact } from './targetProgress'

const NOW = new Date('2026-08-30T15:00:00')

describe('applyProgressDelta', () => {
  it('adds to null progress from zero', () => {
    const p = applyProgressDelta(null, 10, 20, NOW)
    expect(p).toEqual({ progress: 10, status: 'pending', completed_at: null })
  })
  it('accumulates sessions and completes at target', () => {
    const p = applyProgressDelta(12, 10, 20, NOW)
    expect(p.progress).toBe(22)
    expect(p.status).toBe('completed')
    expect(p.completed_at).toBe(NOW.toISOString())
  })
  it('completes exactly at target', () => {
    expect(applyProgressDelta(15, 5, 20, NOW).status).toBe('completed')
  })
  it('never goes below zero', () => {
    expect(applyProgressDelta(3, -10, 20, NOW).progress).toBe(0)
  })
  it('with no target it only accumulates, never completes', () => {
    const p = applyProgressDelta(5, 5, null, NOW)
    expect(p).toEqual({ progress: 10, status: 'pending', completed_at: null })
  })
})

describe('applyProgressExact', () => {
  it('sets an exact value below target back to pending', () => {
    expect(applyProgressExact(8, 20, NOW)).toEqual({ progress: 8, status: 'pending', completed_at: null })
  })
  it('sets an exact value at/over target to completed', () => {
    const p = applyProgressExact(25, 20, NOW)
    expect(p.status).toBe('completed')
    expect(p.completed_at).toBe(NOW.toISOString())
  })
  it('zero resets to pending', () => {
    expect(applyProgressExact(0, 20, NOW)).toEqual({ progress: 0, status: 'pending', completed_at: null })
  })
  it('clamps negatives to zero', () => {
    expect(applyProgressExact(-5, 20, NOW).progress).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wall/targetProgress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`src/lib/wall/targetProgress.ts`:

```ts
/** Pure math for target-step progress ("read ≥20 min"). The hook applies the
 * patch to the day's actionable_instance row; completion is DERIVED from
 * progress vs target, so corrections (setProgress) can also un-complete. */
export interface ProgressPatch {
  progress: number
  status: 'completed' | 'pending'
  completed_at: string | null
}

function patch(progress: number, target: number | null, now: Date): ProgressPatch {
  const clamped = Math.max(0, progress)
  const done = target != null && clamped >= target
  return {
    progress: clamped,
    status: done ? 'completed' : 'pending',
    completed_at: done ? now.toISOString() : null,
  }
}

export function applyProgressDelta(current: number | null, delta: number, target: number | null, now: Date): ProgressPatch {
  return patch((current ?? 0) + delta, target, now)
}

export function applyProgressExact(value: number, target: number | null, now: Date): ProgressPatch {
  return patch(value, target, now)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/wall/targetProgress.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Add the two mutations to the hook**

In `src/hooks/useActionableInstances.ts`, after `markDone` (import the two helpers at top):

```ts
  // Add to (or set) the day's progress toward a target routine's goal.
  // Completion is derived: progress >= target flips status to completed,
  // and an exact correction below target flips it back to pending.
  const writeProgress = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date,
    compute: (current: number | null) => import('@/lib/wall/targetProgress').ProgressPatch
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      let instance = await findInstanceForDate(entityType, entityId, date)
      if (!instance) instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const p = compute(instance.progress ?? null)
      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({ progress: p.progress, status: p.status, completed_at: p.completed_at })
        .eq('id', instance.id)
      if (updateError) throw updateError
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log progress'
      setError(message)
      console.error('writeProgress error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [findInstanceForDate, getOrCreateInstance])

  const addProgress = useCallback(
    (entityType: EntityType, entityId: string, date: Date, amount: number, target: number | null) =>
      writeProgress(entityType, entityId, date, (cur) => applyProgressDelta(cur, amount, target, new Date())),
    [writeProgress]
  )

  const setProgress = useCallback(
    (entityType: EntityType, entityId: string, date: Date, value: number, target: number | null) =>
      writeProgress(entityType, entityId, date, () => applyProgressExact(value, target, new Date())),
    [writeProgress]
  )
```

Use a plain top-of-file import for `ProgressPatch`/`applyProgressDelta`/`applyProgressExact` (the inline `import()` type above is only to show the shape). Add `addProgress, setProgress` to the hook's returned object.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/hooks/useActionableInstances.test.ts src/lib/wall/targetProgress.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS (existing instance tests unaffected), no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wall/targetProgress.ts src/lib/wall/targetProgress.test.ts src/hooks/useActionableInstances.ts
git commit -m "feat(instances): addProgress/setProgress with derived completion"
```

---

### Task 3: `kidDayModel` — pure page model

**Files:**
- Create: `src/lib/wall/kidDayModel.ts`
- Create: `src/lib/wall/kidDayModel.test.ts`

**Interfaces:**
- Consumes: `resolveRoutine`, `routineOwners`, `effectiveTimeOfDay`, `matchesRecurrenceForDate` from `@/lib/routineUtils`; `groupRoutineSteps` from `@/lib/today/routineCollections`; `stepAppliesOnDate` from `@/lib/today/stepSchedule`; `Routine`, `ActionableInstance` from `@/types/actionable`; `TimelineItem` from `@/types/timeline`; `DaySection` from `@/lib/timeUtils`; `FamilyMember` from `@/types/family`.
- Produces:

```ts
export type KidBandKey = 'morning' | 'afternoon' | 'evening' | 'anytime'
export interface KidRowTarget { amount: number; unit: 'minutes' | 'count'; progress: number; streak: number }
export interface KidRow {
  entityType: 'routine' | 'task'
  id: string                    // raw entity uuid (no prefix)
  title: string
  done: boolean
  timeOfDay: string | null      // 'HH:MM' or null
  target: KidRowTarget | null   // null = plain checkbox row
}
export interface KidCollection { id: string; title: string; timeOfDay: string | null; rows: KidRow[] }
export interface MemberDayModel { collections: KidCollection[]; bands: Record<KidBandKey, KidRow[]>; isEmpty: boolean }

export function buildMemberDayModel(input: {
  member: FamilyMember
  date: Date
  routines: Routine[]                               // RAW rows from useWallData (Task 4)
  todayItems: Record<DaySection, TimelineItem[]>    // days[isToday].items
  history: ActionableInstance[]                     // last ~30 days INCLUDING today
}): MemberDayModel

export function streakFor(routine: Routine, history: ActionableInstance[], today: Date): number
export function bandForTime(timeOfDay: string | null): KidBandKey
```

**Rules (each is a test):**

1. **Membership:** a routine belongs to the page when `routineOwners(routine)` (steps: owners of the PARENT — people are inherited) includes `member.id`.
2. **Visibility for loose (parentless) routines:** run `resolveRoutine` on `{ ...r, show_on_timeline: true }` with `date`, `member: [member.id]`, and the same rung-4-no-op `prefs` that `useWallData` passes at its `resolveRoutine` call site (copy that exact prefs value — the wall's no-lens domain settings — and set its hide-daily field to `false` so everyday routines always show here). The shallow `show_on_timeline` override copies `useWallData`'s documented workaround (kids' routines are `false` as a Today-declutter hack); NEVER add a resolver ctx flag for it.
3. **Collections:** group with `groupRoutineSteps`. A collection renders when the parent's owners include the member, parent `visibility !== 'reference'`-check is SKIPPED (parents are deliberately `'reference'` — see `routine_steps_inherit_collection_time` memory), parent recurrence matches `date` (`matchesRecurrenceForDate`), and ≥1 step passes `stepAppliesOnDate(step, date)` with step `visibility === 'active'`. Collection `timeOfDay` = parent `time_of_day`; step rows use `effectiveTimeOfDay(step, byId)`.
4. **Banding:** `bandForTime`: null → `anytime`; hour < 12 → `morning`; hour < 17 → `afternoon`; else `evening`. Collections are NOT banded (they render as their own titled cards, ordered by `timeOfDay`, nulls last); loose rows go into bands.
5. **Tasks:** from `todayItems`, rows with `type === 'task'` and `assignedTo === member.id`. Band by section: `allday`/`unscheduled` → anytime; `earlyMorning`/`morning` → morning; `afternoon` → afternoon; `evening`/`night` → evening. `done` = `item.completed`. Tasks never have targets.
6. **Done state (routines):** today's instance (`history` row with `entity_id === routine.id && date === YYYY-MM-DD of today`) has `status === 'completed'`.
7. **Target rows:** routine has `target_amount != null && target_unit != null` → `target = { amount, unit, progress: todayInstance?.progress ?? 0, streak: streakFor(...) }`.
8. **`streakFor`:** walk back day by day from `today`. Skip days where `matchesRecurrenceForDate(routine, day, null)` is false (non-recurring days don't break streaks). A recurring day counts when its instance qualifies (target routines: `progress >= target_amount` OR `status === 'completed'`; else `status === 'completed'`). Today itself: counts if met, is skipped (not a break) if unmet — the day isn't over. First unmet past recurring day ends the walk. Cap the walk at 30 days.
9. **`isEmpty`:** no collections and every band empty.

- [ ] **Step 1: Write failing tests** — `src/lib/wall/kidDayModel.test.ts` with factory helpers:

```ts
import { describe, it, expect } from 'vitest'
import { buildMemberDayModel, streakFor, bandForTime } from './kidDayModel'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { emptySections } from '@/lib/today/types'
import type { TimelineItem } from '@/types/timeline'

const KID = { id: 'kid-1', name: 'Kaleb' } as FamilyMember
const TODAY = new Date('2026-08-30T10:00:00') // a Sunday

let seq = 0
function routine(over: Partial<Routine>): Routine {
  return {
    id: `r-${++seq}`, user_id: 'u', name: 'Routine', description: null,
    default_assignee: null, assigned_to: KID.id, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null,
    raw_input: null, show_on_timeline: true, scope: 'individual',
    created_at: '', updated_at: '',
    ...over,
  } as Routine
}
function inst(over: Partial<ActionableInstance>): ActionableInstance {
  return {
    id: `i-${++seq}`, user_id: 'u', entity_type: 'routine', entity_id: 'r-1',
    date: '2026-08-30', status: 'pending', assignee: null,
    assigned_to_override: null, deferred_to: null, completed_at: null,
    skipped_at: null, progress: null, created_at: '', updated_at: '',
  } as ActionableInstance
}
function build(routines: Routine[], history: ActionableInstance[] = [], items: Partial<Record<string, TimelineItem[]>> = {}) {
  return buildMemberDayModel({
    member: KID, date: TODAY, routines, history,
    todayItems: { ...emptySections<TimelineItem>(), ...items },
  })
}
```

Then at minimum these tests (one per rule above):

```ts
it('bands loose routines by effective time', ...)          // 07:30→morning, 14:00→afternoon, 19:00→evening, null→anytime
it('excludes routines owned by someone else', ...)
it('shows a kid routine hidden by show_on_timeline=false', ...)  // the declutter-hack rows MUST appear
it('hides resting and not-today routines', ...)            // visibility 'reference' loose; weekly not matching TODAY
it('renders a collection with its applicable steps despite reference parent', ...)
it('drops a collection whose steps none apply today', ...)
it('marks done from today instance', ...)
it('builds target rows with progress from today instance', ...)
it('assigned tasks band by section and never target', ...)
it('isEmpty when nothing applies', ...)
describe('bandForTime', ...)                               // the four boundaries incl. 12:00 and 17:00
describe('streakFor', ...)                                 // met yesterday+day-before = 2; unmet today doesn't break; gap breaks; non-recurring day skipped
```

Write every listed test in full (the factories make each ~5 lines). For the streak tests use a weekly routine (`{ type: 'weekly', days: ['sat','sun'] }`) to pin the skip-non-recurring-days rule.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/wall/kidDayModel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `kidDayModel.ts`** per the Rules block. Before coding, read `src/hooks/useWallData.ts`'s `resolveRoutine` call site (~line 313–340) and copy its `prefs` construction verbatim (adjusting only hide-daily to `false`). Keep the file free of React imports — pure functions only.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/wall/kidDayModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wall/kidDayModel.ts src/lib/wall/kidDayModel.test.ts
git commit -m "feat(wall): kidDayModel — per-member day model with targets and streaks"
```

---

### Task 4: expose raw routines from `useWallData`

**Files:**
- Modify: `src/hooks/useWallData.ts` (`UseWallDataReturn` ~line 53; state + return ~line 509; raw rows are available at ~line 270 as `allRoutines`)
- Test: `src/hooks/useWallData.routineResolver.test.ts` (existing — add one assertion following its established mock pattern)

**Interfaces:**
- Consumes: nothing new.
- Produces: `UseWallDataReturn.routines: Routine[]` — the RAW fetched rows (before the wall's `effectiveTimeOfDay` remap and before the two shallow overrides), so `kidDayModel` can resolve parents/steps itself.

- [ ] **Step 1: Write the failing test** — in `useWallData.routineResolver.test.ts`, following that file's existing render/mocking pattern, assert that after load `result.current.routines` contains the seeded routine rows with their ORIGINAL `time_of_day` (i.e. a step whose collection carries the hour still has `time_of_day: null` in `routines`, proving the raw rows are exposed, not the remapped ones).

- [ ] **Step 2: Run to verify it fails**: `npx vitest run src/hooks/useWallData.routineResolver.test.ts` — FAIL (`routines` undefined).

- [ ] **Step 3: Implement** — add `const [rawRoutines, setRawRoutines] = useState<Routine[]>([])`, call `setRawRoutines(allRoutines)` right where `allRoutines` is parsed, and add `routines: rawRoutines` to the returned object + interface.

- [ ] **Step 4: Verify**: `npx vitest run src/hooks/useWallData.routineResolver.test.ts src/lib/routineVisibilityCoverage.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWallData.ts src/hooks/useWallData.routineResolver.test.ts
git commit -m "feat(wall): expose raw routine rows from useWallData"
```

---### Task 5: `KidDayView` component

**Files:**
- Create: `src/components/wall-v2/KidDayView.tsx`
- Create: `src/components/wall-v2/useMemberInstanceHistory.ts`
- Create: `src/components/wall-v2/KidDayView.test.tsx`

**Interfaces:**
- Consumes: `buildMemberDayModel`, types from Task 3; `useActionableInstances` (`markDone`, `undoDone`, `addProgress`, `setProgress`) from Task 2; `WALL` tokens from `./wallTheme`; `emptySections` from `@/lib/today/types`.
- Produces:

```ts
export const KID_VIEW_IDLE_MS = 120_000

interface KidDayViewProps {
  member: FamilyMember
  routines: Routine[]                              // raw, from useWallData (Task 4)
  todayItems: Record<DaySection, TimelineItem[]>
  /** Complete/uncomplete a TASK row — the Shell's handleToggleComplete, the wall's
   *  single task-completion path. Explicit direction, never a toggle. */
  onToggleTask: (taskId: string, completed: boolean) => void
  onClose: () => void
}
export function KidDayView(props: KidDayViewProps): JSX.Element
```

```ts
// useMemberInstanceHistory.ts — one-shot fetch, NOT a poll
export function useMemberInstanceHistory(days?: number): {
  history: ActionableInstance[]; loading: boolean; refresh: () => Promise<void>
}
```

**Behavior:**

- `useMemberInstanceHistory` runs ONE query on mount: `supabase.from('actionable_instances').select('*').gte('date', <today-30d>).lte('date', <today>)` (RLS scopes it to the household; client filters by entity id happen in the model). It also subscribes to `onInstancesChanged` from `@/lib/instancesChangedSignal` to `refresh()` — same signal the mutations emit, so taps round-trip.
- Layout: `absolute inset-0 z-50` overlay (same layer as `WallRecipeViewer`), `WALL.root`-style background, member name + weekday masthead, back button (lucide `ArrowLeft`, ≥56px tap target like the header's `w-14 h-14` buttons).
- Body: collection cards first (title + rows), then band sections `Morning / Afternoon / Evening / Anytime` (skip empty). All rows ≥56px tall.
- Plain routine row tap: optimistic flip, then `markDone('routine', id, new Date())` or `undoDone` — EXPLICIT direction from current state, never toggle. Task row tap: `onToggleTask(id, !done)` — routes to the Shell's `handleToggleComplete`, the wall's single task-completion path (tasks live in the tasks table, not `actionable_instances`).
- Target row: shows `12 of 20 min` + ring (SVG circle, stroke-dashoffset from progress/amount) + streak line when streak ≥ 2 (`flame` icon + "4 days in a row"). Tap expands an inline chip row: minutes → `+5 +10 +20` and an `Exact…` chip; count → `+1` and `Exact…`. Chips call `addProgress('routine', id, new Date(), amount, target.amount)`. `Exact…` swaps to a `<input type="number" inputMode="numeric">` + Set button calling `setProgress`. Completed target rows still expand (corrections).
- Optimistic progress: local `Map<string, number>` overlay applied over model progress, cleared when `history` refreshes.
- Idle: a `setTimeout(onClose, KID_VIEW_IDLE_MS)` reset on any `pointerdown` on the container (capture phase), cleaned up on unmount.
- Empty day: centered "Nothing on your list — go play."

- [ ] **Step 1: Write failing tests** — `KidDayView.test.tsx`, mocking `@/hooks/useActionableInstances` (vi.fn for the four mutations) and `./useMemberInstanceHistory` (fixed history array), building props with the Task 3 test factories (import or duplicate them locally):
  - renders collection card title + step rows
  - renders band headings only for non-empty bands
  - plain routine tap calls `markDone` with `('routine', id, expect.any(Date))`; tapping a done row calls `undoDone`
  - target row shows "12 of 20 min" given a history instance with `progress: 12`
  - tapping a target row then `+10` calls `addProgress` with `('routine', id, expect.any(Date), 10, 20)`
  - `Exact…` → typing `18` → Set calls `setProgress(..., 18, 20)`
  - streak line renders "3 days in a row" given qualifying history, and does NOT render when streak < 2
  - task row tap calls `onToggleTask(taskId, true)` (and `false` when already done)
  - empty model renders the empty-state copy
  - back button calls `onClose`

- [ ] **Step 2: Run to verify failure**: `npx vitest run src/components/wall-v2/KidDayView.test.tsx` — FAIL.

- [ ] **Step 3: Implement** `useMemberInstanceHistory.ts` then `KidDayView.tsx` per Behavior. Follow `WallRecipeViewer.tsx` for the overlay/visibility pattern and `WallV2UtilitySheet.tsx` for touch-target sizing conventions.

- [ ] **Step 4: Verify**: `npx vitest run src/components/wall-v2/KidDayView.test.tsx && npx tsc -p tsconfig.app.json --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/KidDayView.tsx src/components/wall-v2/useMemberInstanceHistory.ts src/components/wall-v2/KidDayView.test.tsx
git commit -m "feat(wall): KidDayView — per-member day page with target progress"
```

---

### Task 6: portrait tap on the board + Shell wiring

**Files:**
- Modify: `src/components/wall-v2/WallV2Gantt.tsx` (`Face` ~line 44, `Track` ~line 173, `WallV2Gantt` ~line 207)
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (state near `recipeViewerMeal` ~line 285; overlays block ~line 763)
- Test: `src/components/wall-v2/WallV2Gantt.test.tsx` (create if absent, else extend)

**Interfaces:**
- Consumes: `KidDayView` (Task 5), `wallData.routines` (Task 4), `HOUSEHOLD_ID` from `./wallEventAttribution`.
- Produces: `WallV2Gantt({ board, onTapItem, onTapMember })` — new optional `onTapMember?: (memberId: string) => void`.

- [ ] **Step 1: Write failing tests** — render `WallV2Gantt` with a two-track board (one member track, one `HOUSEHOLD_ID` track), following any existing gantt/board test fixtures in `src/components/wall-v2/` (e.g. the join test that pins tap lookups) for board construction:
  - clicking the member track's face/name calls `onTapMember('kid-1')`
  - the household track's face is NOT interactive (no button role)
  - clicking a bar still calls `onTapItem` (regression guard — the new header button must not swallow bar taps)

- [ ] **Step 2: Run to verify failure**: `npx vitest run src/components/wall-v2/WallV2Gantt.test.tsx` — FAIL.

- [ ] **Step 3: Implement** — thread `onTapMember` `WallV2Gantt → Track → Face`; in `Track`, wrap the `Face` + name column in a `<button type="button" aria-label={`Open ${track.name}'s day`}>` when `onTapMember` is provided AND `track.memberId !== HOUSEHOLD_ID`; plain div otherwise.

- [ ] **Step 4: Wire the Shell** — in `WallV2Shell.tsx`:

```tsx
const [kidViewMember, setKidViewMember] = useState<FamilyMember | null>(null);
// pass to the board:
<WallV2Gantt board={ganttBoard} onTapItem={handleTapGanttItem}
  onTapMember={(id) => {
    const m = wallData.familyMembers.find((fm) => fm.id === id);
    if (m) setKidViewMember(m);
  }} />
// in the Overlays block:
{kidViewMember && (
  <KidDayView
    member={kidViewMember}
    routines={wallData.routines}
    todayItems={(wallData.days.find((d) => d.isToday) ?? wallData.days[0])?.items ?? emptySections<TimelineItem>()}
    onToggleTask={handleToggleComplete}
    onClose={() => { setKidViewMember(null); void wallData.refetch(); }}
  />
)}
```

The `refetch` on close keeps the board's done-states in sync without adding any polling.

- [ ] **Step 5: Verify**: `npx vitest run src/components/wall-v2/ && npx tsc -p tsconfig.app.json --noEmit` — all wall-v2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/WallV2Gantt.tsx src/components/wall-v2/WallV2Gantt.test.tsx src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): portrait tap opens KidDayView"
```

---

### Task 7: Target editing in the Tap panels

**Files:**
- Create: `src/components/surface/sections/TargetSection.tsx`
- Modify: `src/components/surface/TapStepPanel.tsx` (add prop + section after the "At" section)
- Modify: `src/components/surface/TapRoutinePanel.tsx` (add prop + section beside the Schedule block ~line 166)
- Modify: `src/components/routine/RhythmPage.tsx` (TapStepPanel wiring ~line 420; TapRoutinePanel wiring ~line 391)
- Modify: `src/apps/tasks/TaskDetailPanel.tsx` (TapStepPanel wiring ~line 335; TapRoutinePanel wiring ~line 356)
- Test: `src/components/surface/TargetSection.test.tsx`

**Interfaces:**
- Consumes: `TargetUnit` (Task 1), `updateRoutine` target passthrough (Task 1).
- Produces:

```ts
// TargetSection.tsx
interface TargetSectionProps {
  amount: number | null
  unit: TargetUnit | null
  onChange: (t: { amount: number; unit: TargetUnit } | null) => void
}
export function TargetSection(props: TargetSectionProps): JSX.Element
```

Both panels gain `onTargetChange?: (t: { amount: number; unit: TargetUnit } | null) => void` and render `<TargetSection amount={routine.target_amount ?? null} unit={routine.target_unit ?? null} onChange={props.onTargetChange} />` only when the prop is provided (TapRoutinePanel: only for standalone routines — when the Steps section is NOT rendered, matching the "a target belongs on the atom" rule).

- [ ] **Step 1: Write failing tests** — `TargetSection.test.tsx`:
  - with `amount: null` renders a quiet "Add a daily target" affordance; clicking it then entering `20` + choosing "minutes" calls `onChange({ amount: 20, unit: 'minutes' })`
  - with `amount: 20, unit: 'minutes'` renders the value; "Clear" calls `onChange(null)`
  - entering `0` or blank never calls `onChange` with a non-positive amount

- [ ] **Step 2: Run to verify failure**: `npx vitest run src/components/surface/TargetSection.test.tsx` — FAIL.

- [ ] **Step 3: Implement** `TargetSection` (number input + two-button unit toggle styled like TapStepPanel's "Same as routine / Specific days" pair + Clear), add the prop + render to both panels, and wire all four host call sites:

```tsx
onTargetChange={t => updateRoutine(routine.id, { target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
```

(RhythmPage uses `onUpdateRoutine(openStep.id, …)` — match its neighbours.)

- [ ] **Step 4: Verify**: `npx vitest run src/components/surface/ && npx tsc -p tsconfig.app.json --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/ src/components/routine/RhythmPage.tsx src/apps/tasks/TaskDetailPanel.tsx
git commit -m "feat(routines): daily target editing in Tap panels"
```

---

### Task 8: retire `/morning` and `/bedtime`

**Files:**
- Modify: `src/main.tsx` (routes ~line 168–169)
- Delete: `src/apps/morning/MorningApp.tsx`, `src/apps/bedtime/BedtimeApp.tsx`, `src/pages/MorningPage.tsx`, `src/pages/BedtimePage.tsx`, `src/components/wall/contexts/MorningLaunchView.tsx`, `src/components/wall/contexts/BedtimeView.tsx`, plus their `.test.*` files and any components used ONLY by them.
- Modify: whatever mounts `MorningApp`/`BedtimeApp` inside the Shell's cutover router (find it: `grep -rn "MorningApp\|BedtimeApp" src --include="*.tsx" -l`).

- [ ] **Step 1: Replace the routes** in `src/main.tsx`:

```tsx
<Route path="/morning/*" element={<Navigate to="/wall-v2" replace />} />
<Route path="/bedtime/*" element={<Navigate to="/wall-v2" replace />} />
```

(keep the routes — the Pi or old bookmarks may still hit them; a 404 kiosk is worse than a redirect).

- [ ] **Step 2: Delete the six files + tests**, remove their mounts/imports.

- [ ] **Step 3: Hunt orphans** — `tsc` cannot see string-routed orphans (this bit the legacy `/wall` deletion):

```bash
grep -rn "MorningLaunch\|BedtimeView\|MorningPage\|BedtimePage\|MorningApp\|BedtimeApp\|/morning\|/bedtime" src | grep -v node_modules
```

Expected: only the two `Navigate` lines in `main.tsx`. Delete any now-unused helpers the views pulled in (check `pickPreviewItems` and friends — delete only if their ONLY references were these views).

- [ ] **Step 4: Re-survey the remaining `days[].items` consumers** — run `grep -rn "\.items\[" src/components/wall-v2/ src/hooks/ | grep -v test` and confirm the survivors are exactly `wallLanes.ts`, `wallV2Adapter.ts`, `wallGantt.ts` (+ the Task 5/6 additions). Record the list in the commit message.

- [ ] **Step 5: Verify**: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run build` — full suite green, build green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wall): retire /morning and /bedtime into KidDayView

days[].items consumers after deletion: wallLanes, wallV2Adapter, wallGantt, KidDayView (via days[].items prop)."
```

---

### Task 9: full verification + walkthrough

- [ ] **Step 1: Full gates** — `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint`. All green. (If the suite reddens on an unrelated date-dependent test, check the wall-clock-rot memory before assuming regression.)
- [ ] **Step 2: Look at it** (type-checks are not inspection): `npm run dev` in the worktree (needs `.env` — copy from the main worktree if missing, else blank screen), open `http://localhost:5173/wall-v2` at a 1024×768 viewport. Verify: board unchanged at rest; tapping a kid's portrait opens their page; a plain step ticks and survives reload; a target step accepts +10 twice and auto-completes at 20; back + 2-min idle both return to the board.
- [ ] **Step 3: Report to Scott** — screenshots of the board and the kid page, plus anything deferred. Do NOT push to main; merging/pushing is Scott's call (auto-deploys prod, and the Pi picks it up).

## Deferred (explicitly out of this plan)

- Kiosk countdown timer for reading.
- Seeding the actual "Read a chapter book — 20 min" routine (Scott does this in the UI once shipped, or asks the assistant).
- Overhaul steps B (board) and C (chat gap); `show_on_timeline` audit.
