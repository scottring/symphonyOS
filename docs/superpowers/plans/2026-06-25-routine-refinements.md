# Routine Refinements (per-step days + one-noun terminology) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add optional per-step day scheduling (default inherit) so one routine handles shower vs non-shower nights, and standardize all user-facing copy on one vocabulary (Routine + Steps; drop "Collection").

**Architecture:** A step is a routine row that already has `recurrence_pattern`, so per-step days needs no migration: "override" = `recurrence_pattern.type` is `weekly`/`specific_days` with non-empty `days`; otherwise (`daily`) the step inherits (always applies when the parent runs). Today filters a routine's steps to those matching the viewed date. Terminology changes are copy + the create-button consolidation.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase via `useRoutines`.

## Global Constraints

- Worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections` (branch `routine-collections`). Never edit the main worktree.
- Node PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Single test: `npx vitest run <path>`. Never `npm test` (watch mode).
- No emojis — `lucide-react` icons only.
- `Routine`/`RecurrencePattern` from `@/types/actionable`. Weekday keys are `'sun'..'sat'`; use `weekdayKeyForDate(date)` and `WEEKDAY_KEYS` from `@/lib/routineUtils` (do NOT hand-roll weekday logic).
- Per-step semantics: a step **applies on a date** iff it has no day-override (`type` not weekly/specific_days, or empty `days`) → always; OR its `days` include that date's weekday key. Default = inherit.
- Terminology: drop user-facing "Collection". Internal identifiers (`kind:'collection'`, `'routine-collection'` type, component names like `TapCollectionPanel`/`RoutineCollectionRow`) stay unchanged.

---

## File Structure

**Create:**
- `src/lib/today/stepSchedule.ts` — `stepAppliesOnDate(step, date)`.
- `src/lib/today/stepSchedule.test.ts` — tests.

**Modify:**
- `src/lib/today/routineCollections.ts` — `buildCollectionItem` filters steps by `stepAppliesOnDate`.
- `src/lib/today/routineCollections.test.ts` — add day-filter coverage.
- `src/components/surface/TapStepPanel.tsx` — add "Days" control + `onScheduleChange`; fix "Remove from collection" → "Remove from routine".
- `src/components/surface/TapStepPanel.test.tsx` — add day-control tests.
- `src/components/routine/RoutinesListRedesign.tsx` — terminology (count, buttons, section header, prompts, "Combine into a routine") + wire `TapStepPanel.onScheduleChange`.
- `src/components/routine/RoutinesListRedesign.test.tsx` — update affected assertions.

---

## Task 1: `stepAppliesOnDate` helper

**Files:** Create `src/lib/today/stepSchedule.ts`, Test `src/lib/today/stepSchedule.test.ts`

**Interfaces:**
- Produces: `stepAppliesOnDate(step: Routine, date: Date): boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/today/stepSchedule.test.ts
import { describe, it, expect } from 'vitest'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { weekdayKeyForDate, WEEKDAY_KEYS } from '@/lib/routineUtils'
import { stepAppliesOnDate } from './stepSchedule'

function step(rp: RecurrencePattern): Routine {
  return {
    id: 's', user_id: 'u', name: 's', recurrence_pattern: rp, visibility: 'active',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

const d = new Date(2026, 0, 5) // fixed date; weekday derived below
const key = weekdayKeyForDate(d)
const otherKey = WEEKDAY_KEYS.find(k => k !== key)!

describe('stepAppliesOnDate', () => {
  it('inherits (always true) when recurrence is daily', () => {
    expect(stepAppliesOnDate(step({ type: 'daily' }), d)).toBe(true)
  })
  it('inherits (always true) when weekly but days is empty', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [] }), d)).toBe(true)
  })
  it('applies when weekly days include the date weekday', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [key] }), d)).toBe(true)
  })
  it('does not apply when weekly days exclude the date weekday', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [otherKey] }), d)).toBe(false)
  })
  it('honors specific_days the same way as weekly', () => {
    expect(stepAppliesOnDate(step({ type: 'specific_days', days: [otherKey] }), d)).toBe(false)
    expect(stepAppliesOnDate(step({ type: 'specific_days', days: [key] }), d)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/stepSchedule.test.ts`
Expected: FAIL — cannot resolve `./stepSchedule`. (If `WEEKDAY_KEYS`/`weekdayKeyForDate` import errors, confirm their exact exported names in `src/lib/routineUtils.ts` and fix the import before proceeding.)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/today/stepSchedule.ts
import type { Routine } from '@/types/actionable'
import { weekdayKeyForDate } from '@/lib/routineUtils'

/**
 * Does a collection step apply on the given date?
 * Default = inherit (no day override) → always true (shows whenever the parent routine runs).
 * Override = recurrence_pattern weekly/specific_days with non-empty days → only on those weekdays.
 */
export function stepAppliesOnDate(step: Routine, date: Date): boolean {
  const rp = step.recurrence_pattern
  if (rp && (rp.type === 'weekly' || rp.type === 'specific_days') && rp.days && rp.days.length > 0) {
    return rp.days.includes(weekdayKeyForDate(date))
  }
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/stepSchedule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/stepSchedule.ts src/lib/today/stepSchedule.test.ts
git commit -m "feat(routines): stepAppliesOnDate — per-step day override (default inherit)"
```

---

## Task 2: Today filters a routine's steps by day

**Files:** Modify `src/lib/today/routineCollections.ts`, Test `src/lib/today/routineCollections.test.ts`

**Interfaces:**
- Consumes: `stepAppliesOnDate` (Task 1).
- `buildCollectionItem(collection, viewedDate, routineStatusMap)` now only includes steps where `stepAppliesOnDate(step, viewedDate)` is true; progress (`done`/`total`) and `collectionSteps` reflect only applicable steps.

- [ ] **Step 1: Write the failing test (append to routineCollections.test.ts)**

```typescript
import { stepAppliesOnDate } from './stepSchedule' // (only if needed for setup; otherwise omit)

it('buildCollectionItem excludes steps whose day-override does not match the viewed date', () => {
  const viewed = new Date(2026, 0, 5)
  const { weekdayKeyForDate, WEEKDAY_KEYS } = require('@/lib/routineUtils')
  const key = weekdayKeyForDate(viewed)
  const otherKey = WEEKDAY_KEYS.find((k: string) => k !== key)
  const mk = (id: string, rp: any): any => ({
    id, user_id: 'u', name: id, recurrence_pattern: rp, visibility: 'active',
    parent_routine_id: 'c1', step_order: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  })
  const collection: any = {
    id: 'c1', user_id: 'u', name: 'Bedtime', recurrence_pattern: { type: 'daily' }, visibility: 'active',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    steps: [
      mk('always', { type: 'daily' }),               // inherits → shows
      mk('today', { type: 'weekly', days: [key] }),   // matches → shows
      mk('other', { type: 'weekly', days: [otherKey] }), // excluded
    ],
  }
  const item = buildCollectionItem(collection, viewed, new Map())
  const ids = item.collectionSteps.map(s => s.stepId)
  expect(ids).toContain('always')
  expect(ids).toContain('today')
  expect(ids).not.toContain('other')
  expect(item.collectionProgress.total).toBe(2)
})
```

(Adjust the import style for `weekdayKeyForDate`/`WEEKDAY_KEYS` to match how the existing test file imports — prefer a top-of-file `import { weekdayKeyForDate, WEEKDAY_KEYS } from '@/lib/routineUtils'` over `require`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/routineCollections.test.ts`
Expected: FAIL — `other` is still present / total is 3 (filtering not implemented).

- [ ] **Step 3: Implement the filter in `buildCollectionItem`**

In `src/lib/today/routineCollections.ts`:
1. Add import: `import { stepAppliesOnDate } from './stepSchedule'`.
2. At the top of `buildCollectionItem`, before the `for (const step of collection.steps)` loop, compute applicable steps and iterate those instead:

```typescript
  const applicableSteps = collection.steps.filter(step => stepAppliesOnDate(step, viewedDate))
  // ...
  for (const step of applicableSteps) {
```

Leave the rest of the loop body unchanged (it already accumulates `total`/`done`/`collectionSteps`/`nextUp` per iterated step).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/routineCollections.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/routineCollections.ts src/lib/today/routineCollections.test.ts
git commit -m "feat(routines): Today filters routine steps by per-step day override"
```

**Note for reviewer/controller:** a routine whose steps are ALL filtered out on a given day yields a 0-step collection item (progress 0/0). Suppressing such an empty collection from Today is a follow-up (handled where collections are added to the timeline), not in scope here — flag it, don't silently absorb it.

---

## Task 3: Step editor — "Days" control + copy fix

**Files:** Modify `src/components/surface/TapStepPanel.tsx`, Test `src/components/surface/TapStepPanel.test.tsx`

**Interfaces:**
- Consumes: `WEEKDAY_KEYS` from `@/lib/routineUtils`; `RecurrencePattern` from `@/types/actionable`.
- Adds prop `onScheduleChange?: (pattern: RecurrencePattern) => void` to `TapStepPanel`.
- Behavior: a "Days" section with two modes — **"Same as routine"** (default; shown when the step has no weekly/specific_days override) and **"Specific days"** (7 day toggles). Selecting specific days calls `onScheduleChange({ type: 'weekly', days })`; choosing "Same as routine" calls `onScheduleChange({ type: 'daily' })`.
- Also: change the promote button text "Remove from collection" → "Remove from routine".

- [ ] **Step 1: Write the failing test (add to TapStepPanel.test.tsx)**

```tsx
import { weekdayKeyForDate, WEEKDAY_KEYS } from '@/lib/routineUtils'

it('shows "Same as routine" by default for an inheriting (daily) step', () => {
  setup({ step: { ...step, recurrence_pattern: { type: 'daily' } } as Routine })
  expect(screen.getByRole('button', { name: /same as routine/i })).toHaveAttribute('aria-pressed', 'true')
})

it('switching to specific days and picking a day reports a weekly pattern', () => {
  const onScheduleChange = vi.fn()
  setup({ step: { ...step, recurrence_pattern: { type: 'daily' } } as Routine, onScheduleChange })
  fireEvent.click(screen.getByRole('button', { name: /specific days/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Mon$/i }))
  expect(onScheduleChange).toHaveBeenCalled()
  const arg = onScheduleChange.mock.calls.at(-1)![0]
  expect(arg.type).toBe('weekly')
  expect(arg.days).toContain('mon')
})

it('choosing "Same as routine" reverts to an inheriting daily pattern', () => {
  const onScheduleChange = vi.fn()
  setup({ step: { ...step, recurrence_pattern: { type: 'weekly', days: ['mon'] } } as Routine, onScheduleChange })
  fireEvent.click(screen.getByRole('button', { name: /same as routine/i }))
  expect(onScheduleChange).toHaveBeenCalledWith({ type: 'daily' })
})

it('labels the promote action "Remove from routine"', () => {
  setup()
  expect(screen.getByRole('button', { name: /remove from routine/i })).toBeInTheDocument()
})
```

(The existing `setup()` helper must accept and spread `onScheduleChange`; extend the helper's default props with `onScheduleChange: vi.fn()`. The existing "Remove from collection" test, if present, must be updated to "Remove from routine".)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/surface/TapStepPanel.test.tsx`
Expected: FAIL — no "Same as routine"/"Specific days" controls; "Remove from routine" not found.

- [ ] **Step 3: Implement the Days control + copy fix**

In `TapStepPanel.tsx`:
1. Add `onScheduleChange?: (pattern: RecurrencePattern) => void` to the props interface; import `RecurrencePattern` from `@/types/actionable` and `WEEKDAY_KEYS` from `@/lib/routineUtils`.
2. Derive current mode: `const rp = step.recurrence_pattern; const overridden = !!(rp && (rp.type === 'weekly' || rp.type === 'specific_days') && rp.days?.length); const days: string[] = overridden ? rp!.days! : []`.
3. Add a "Days" section after the dose-times section:

```tsx
{props.onScheduleChange && (
  <section className="pb-4 mb-4 border-b border-neutral-200">
    <h3 className="text-sm font-medium text-neutral-700 mb-2">Days</h3>
    <div className="flex gap-2 mb-3">
      <button
        type="button"
        aria-pressed={!overridden}
        onClick={() => props.onScheduleChange!({ type: 'daily' })}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!overridden ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
      >
        Same as routine
      </button>
      <button
        type="button"
        aria-pressed={overridden}
        onClick={() => props.onScheduleChange!({ type: 'weekly', days: days.length ? days : [] })}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${overridden ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
      >
        Specific days
      </button>
    </div>
    {overridden && (
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_KEYS.map(k => {
          const on = days.includes(k)
          const label = k.charAt(0).toUpperCase() + k.slice(1)
          return (
            <button
              key={k}
              type="button"
              aria-label={label}
              aria-pressed={on}
              onClick={() => {
                const next = on ? days.filter(d => d !== k) : [...days, k]
                props.onScheduleChange!({ type: 'weekly', days: next })
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${on ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {label}
            </button>
          )
        })}
      </div>
    )}
  </section>
)}
```

4. Change the promote button label from `Remove from collection` to `Remove from routine`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/surface/TapStepPanel.test.tsx`
Expected: PASS (existing + 4 new). Output pristine.

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapStepPanel.tsx src/components/surface/TapStepPanel.test.tsx
git commit -m "feat(routines): per-step Days control in step editor; 'Remove from routine'"
```

---

## Task 4: Terminology cleanup + wire step schedule (RoutinesListRedesign)

**Files:** Modify `src/components/routine/RoutinesListRedesign.tsx`, Test `src/components/routine/RoutinesListRedesign.test.tsx`

**Interfaces:**
- Wires the `TapStepPanel.onScheduleChange` (Task 3) to `onUpdateRoutine(openStep.id, { recurrence_pattern })`.
- All user-facing "collection" copy on this page is replaced per Global Constraints.

- [ ] **Step 1: Update tests first (RED)**

In `RoutinesListRedesign.test.tsx`:
- Update any assertion that queries the section header text `Collections` → `Multi-step`.
- Update the existing create test: the header button is now labeled **"New routine"** (single), there is no "New collection" button. The test that clicked "New collection" should click the single create button (`/new routine/i`) and still assert the editor opens.
- Add an assertion that the top-level count excludes steps: with `routines = [c1 parent, s1 step, s2 step, flat]`, the count text shows **"2 routines"** (collection `c1` + standalone `flat`), not 4.

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`
Expected: FAIL on the new/updated assertions.

- [ ] **Step 2: Implement terminology + wiring**

In `RoutinesListRedesign.tsx`:
1. **Count** (currently `{routines.length} routine{...}`): change to top-level count:
   ```tsx
   {(() => { const n = collections.length + standalone.length; return `${n} routine${n !== 1 ? 's' : ''}` })()}
   ```
2. **Header buttons:** remove the separate "New collection" button. Keep ONE create button labeled **"New routine"** that uses the panel-create flow (the same prompt → `onCreateCollection` → `setOpen({kind:'collection', id})` logic the old "New collection" button had); prompt text "Name the new routine". Use a lucide `Plus` icon (not inline svg). Remove the old `onCreateRoutine`-based amber "New Routine" header button. Keep the "Select" button.
3. **Empty-state button** ("Create your first routine"): repoint to the same panel-create flow (prompt "Name the new routine" → `onCreateCollection`).
4. **Section header:** `<SectionHeader title="Collections" ... />` → `title="Multi-step"`.
5. **Group prompt + button:** prompt `'Name this routine collection'` → `'Name this routine'`; button text **"Group into routine"** → **"Combine into a routine"**.
6. **Wire step schedule:** on the rendered `<TapStepPanel ...>`, add `onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}`.

- [ ] **Step 3: Run tests (GREEN)**

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors. (If `onCreateRoutine` becomes unused, leave the prop in the interface as optional to avoid breaking callers, or remove its now-dead usages cleanly — do not leave an unused-var lint error.)

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): one-noun terminology (drop Collection) + wire per-step days"
```

---

## Task 5: Full suite + build verification

- [ ] **Step 1: Routines suites**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/lib/today/stepSchedule.test.ts src/lib/today/routineCollections.test.ts \
  src/components/surface/TapStepPanel.test.tsx src/components/routine/RoutinesListRedesign.test.tsx
```
Expected: all PASS.

- [ ] **Step 2: Full suite**

Run: `npx vitest run 2>&1 | tail -6`
Expected: all green (no new failures vs the prior 2919).

- [ ] **Step 3: Build (tsc -b, stricter)**

Run: `npm run build 2>&1 | tail -4`
Expected: `✓ built`.

- [ ] **Step 4: Commit (if any fixes)**

```bash
git add -A && git commit -m "test(routines): verify per-step days + terminology green"
```

---

## Self-Review

- **Spec coverage:** per-step day override (T1 helper + T2 Today filter + T3 step control + T4 wiring); terminology (T4 + T3 copy fix). ✓
- **Placeholder scan:** complete code for T1–T3; T4 enumerates exact edits with the count expression and the wiring line. No TBD.
- **Type consistency:** `stepAppliesOnDate(step, date)` name identical across T1/T2; `onScheduleChange: (pattern: RecurrencePattern) => void` identical T3/T4; weekday helpers from `@/lib/routineUtils`.
- **Flagged follow-ups (not in scope):** suppress a 0-applicable-step collection from Today (T2 note); unify the two routine editors so a parentless routine can gain its first step from the list; collection-level assignee editing.
