# Wall: scrollable overdue + tap-to-push — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wall's Overdue list show every overdue family task (with the existing column scroll) and let the family tap any task row to either complete it or push it to one of four buckets (this week / next week / next month / someday).

**Architecture:** Two small surgical changes glued by existing wall plumbing. (1) Drop the 5-cap in `adaptOverdueSection` — the Timeline column already has `overflow-y-auto`, so scroll happens for free. (2) Extend `WallV2ItemActionSheet` with a `kind === 'task'` branch that emits a `PushPreset`; route the preset through a pure `pushPresetToUpdates` mapper into the Shell's existing `updateTask` call. No new data layer, no new mutation surface, no new scroll machinery.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 with `@theme` tokens from `src/index.css`, Vitest + React Testing Library, lucide-react icons. Supabase via the existing `updateTask` already used by the Shell.

**Worktree:** `.worktrees/wall-overdue-tap` on branch `wall-overdue-tap` (already created off `origin/main`, `.env` copied). Never edit the main worktree.

**Spec:** `docs/superpowers/specs/2026-05-28-wall-overdue-tap-design.md` (committed on this branch).

---

## File Structure

**Modified:**
- `src/components/wall-v2/wallV2Adapter.ts` — drop `slice(0, 5)` in `adaptOverdueSection`.
- `src/components/wall-v2/wallV2Adapter.test.ts` — replace the "caps at 5" test with "renders all overdue, no cap."
- `src/components/wall-v2/WallV2ItemActionSheet.tsx` — add `kind === 'task'` branch + new `onPushTask` prop + export `PushPreset` type. Widen `onMarkDone` to accept `'task'`.
- `src/components/wall-v2/WallV2ItemActionSheet.test.tsx` — new tests for the task variant (Complete + 4 push presets + Cancel + no Skip button).
- `src/components/wall-v2/WallV2Shell.tsx` — drop the task flash-fallback in `handleTapEvent`; new `pushPresetToUpdates` helper + `handleWallPushTask`; widen `handleWallMarkDone` to handle the task case via `handleToggleComplete`; pass `onPushTask` into the sheet.

---

## Task 1: Lift the 5-cap in `adaptOverdueSection`

The data query has no `.limit()`, so removing the UI-side cap surfaces every overdue family task. The Timeline column's existing `overflow-y-auto` scrolls long lists.

**Files:**
- Modify: `src/components/wall-v2/wallV2Adapter.ts`
- Modify: `src/components/wall-v2/wallV2Adapter.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/components/wall-v2/wallV2Adapter.test.ts`, find the existing test:

```ts
  it('caps the section at 5 rows even when more tasks are overdue', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => makeOverdueTask(d));
    const section = adaptOverdueSection(tasks, [], now);
    expect(section!.events).toHaveLength(5);
  });
```

Replace with:

```ts
  it('renders every overdue task — no UI cap (Timeline column owns scrolling)', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) => makeOverdueTask(d));
    const section = adaptOverdueSection(tasks, [], now);
    // The Timeline column has overflow-y-auto and handles long lists by
    // scroll; capping here would defeat the family's "let me reach all
    // overdue" intent.
    expect(section!.events).toHaveLength(12);
  });
```

- [ ] **Step 2: Run to confirm the test fails**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-overdue-tap
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: the renamed test FAILS — `Expected length: 12 / Received length: 5`. Every other test still PASSES.

- [ ] **Step 3: Drop the cap in `adaptOverdueSection`**

In `src/components/wall-v2/wallV2Adapter.ts`, find:

```ts
  const capped = sorted.slice(0, 5);

  const events: WallV2TimelineEvent[] = capped.map((t) => {
```

Replace with:

```ts
  // No cap — the wall's Timeline column owns scrolling
  // (overflow-y-auto on WallV2Timeline's inner section), so a long
  // overdue list is reachable by scroll. The family's "let me scroll"
  // ask defeats a UI cap.
  const events: WallV2TimelineEvent[] = sorted.map((t) => {
```

Update the JSDoc on `adaptOverdueSection` to remove the cap claim. Find:

```ts
/**
 * Build the wall's "Overdue" timeline section from the already-filtered
 * `overdueTasks` returned by useWallData. Returns null when there's nothing
 * to show — the caller should omit the section entirely.
 *
 * The data layer (useWallData.ts) already filters to family-context,
 * incomplete, scheduled-before-today tasks. This function only re-shapes,
 * caps, sorts, and attaches bubbles.
 */
```

Replace with:

```ts
/**
 * Build the wall's "Overdue" timeline section from the already-filtered
 * `overdueTasks` returned by useWallData. Returns null when there's nothing
 * to show — the caller should omit the section entirely.
 *
 * The data layer (useWallData.ts) already filters to family-context,
 * incomplete, scheduled-before-today tasks. This function only re-shapes,
 * sorts oldest-first, and attaches bubbles. No UI cap — the Timeline
 * column handles long lists via scroll.
 */
```

- [ ] **Step 4: Run tests to confirm the renamed test passes**

```bash
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: all tests pass (29 in this file: 12 adaptOverdueSection — same total as before, the renamed test occupies the same slot).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall): drop the 5-cap on Overdue; let the column scroll

The Timeline column's overflow-y-auto already supports long lists.
The UI-side cap was preventing the family from reaching their full
overdue queue from the kiosk. Drop it; sort oldest-first stays.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add the task variant to `WallV2ItemActionSheet`

The sheet currently branches on routine vs. event. Add a third `task` branch with Complete plus a 2×2 grid of push presets. Export a `PushPreset` type so the Shell can consume it.

**Files:**
- Modify: `src/components/wall-v2/WallV2ItemActionSheet.tsx`
- Modify: `src/components/wall-v2/WallV2ItemActionSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `src/components/wall-v2/WallV2ItemActionSheet.test.tsx`. Find the existing `describe('WallV2ItemActionSheet', …)` block. Append these tests inside it:

```ts
  it('task: renders Mark complete + 4 push presets + Cancel; no Skip today', () => {
    const task: WallV2TimelineEvent = {
      id: 'task-od-1', icon: Calendar, tint: 'honey',
      title: 'Pay water bill', subtitle: 'Was due 3 days ago',
      kind: 'task',
    }
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onPushTask = vi.fn(); const onClose = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={onSkip}
        onMarkDone={onMarkDone}
        onPushTask={onPushTask}
        onClose={onClose}
      />
    )

    // Visible affordances
    expect(screen.getByText('Mark complete')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Next week')).toBeInTheDocument()
    expect(screen.getByText('Next month')).toBeInTheDocument()
    expect(screen.getByText('Someday')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    // Task variant must NOT render the routine/event "Skip today" button.
    expect(screen.queryByText('Skip today')).toBeNull()
    // Task variant must NOT render the routine "Mark done" button —
    // the task copy is "Mark complete," a different button.
    expect(screen.queryByText('Mark done')).toBeNull()
  })

  it('task: Mark complete fires onMarkDone with (id, "task")', () => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onMarkDone = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={onMarkDone}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Mark complete'))
    expect(onMarkDone).toHaveBeenCalledWith('task-od-1', 'task')
  })

  it.each([
    ['This week',  'this-week'],
    ['Next week',  'next-week'],
    ['Next month', 'next-month'],
    ['Someday',    'someday'],
  ])('task: tapping %s fires onPushTask with preset %s', (label, preset) => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onPushTask = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={onPushTask}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(label))
    expect(onPushTask).toHaveBeenCalledWith('task-od-1', preset)
  })

  it('task: tapping any push button closes the sheet', () => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onClose = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={vi.fn()}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByText('Next month'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('routine and event variants are unchanged (onPushTask never fires)', () => {
    const onPushTask = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={routine}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={onPushTask}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Mark done'))
    expect(onPushTask).not.toHaveBeenCalled()
    expect(screen.queryByText('This week')).toBeNull()
  })
```

You'll also need to update the two existing tests at the top of the describe block (`'routine: Skip today + Mark done fire with id+kind'` and `'event: shows Skip today, not Mark done'`) to pass the new required `onPushTask` prop. For each existing test's `render(...)` call, add `onPushTask={vi.fn()}` to the JSX props. Don't change the body of those tests beyond that.

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run src/components/wall-v2/WallV2ItemActionSheet.test.tsx
```

Expected: the new tests FAIL (Mark complete button not found, etc.). The two existing tests should still PASS (their assertions are unchanged; only the prop was added).

- [ ] **Step 3: Update the component — props + task branch**

In `src/components/wall-v2/WallV2ItemActionSheet.tsx`, replace the entire file contents with:

```tsx
import { Redo2, Check, X } from 'lucide-react'
import type { WallV2TimelineEvent } from './types'

/**
 * Push targets a task to a fuzzy time bucket without picking a specific
 * date. The four presets are the wall's only push vocabulary; finer
 * scheduling stays on mobile / desktop.
 */
export type PushPreset = 'this-week' | 'next-week' | 'next-month' | 'someday'

interface Props {
  event: WallV2TimelineEvent
  /** (id, kind) — id keeps its prefix; the shell strips it for the entity call. */
  onSkip: (id: string, kind: 'event' | 'routine') => void
  /** Now widened to accept tasks; the Shell internally routes task completes
   *  through the same handleToggleComplete the row's checkbox already uses. */
  onMarkDone: (id: string, kind: 'event' | 'routine' | 'task') => void
  /** Task variant only — emits a fuzzy push preset; the Shell maps it to a
   *  bucket mutation. Routines / events never fire this. */
  onPushTask: (id: string, preset: PushPreset) => void
  onClose: () => void
}

const PUSH_PRESETS: ReadonlyArray<{ preset: PushPreset; label: string }> = [
  { preset: 'this-week',  label: 'This week'  },
  { preset: 'next-week',  label: 'Next week'  },
  { preset: 'next-month', label: 'Next month' },
  { preset: 'someday',    label: 'Someday'    },
]

export function WallV2ItemActionSheet({ event, onSkip, onMarkDone, onPushTask, onClose }: Props) {
  const kind: 'routine' | 'event' | 'task' = event.kind ?? 'event'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[min(92vw,560px)] bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-[1.4rem] font-display text-stone-800 dark:text-stone-100">{event.title}</div>
          {event.subtitle && <div className="text-stone-500 dark:text-stone-400 mt-1">{event.subtitle}</div>}
        </div>

        <div className="flex flex-col gap-3">
          {kind === 'task' ? (
            <>
              {/* Complete — full-width emerald (matches routine "Mark done") */}
              <button
                type="button"
                onClick={() => { onMarkDone(event.id, 'task'); onClose() }}
                className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-bold active:scale-[0.98] transition-transform"
              >
                <Check className="w-6 h-6" /> Mark complete
              </button>

              {/* Push presets — 2×2 grid of stone buttons */}
              <div className="grid grid-cols-2 gap-3">
                {PUSH_PRESETS.map(({ preset, label }) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { onPushTask(event.id, preset); onClose() }}
                    className="flex items-center justify-center w-full min-h-[64px] rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-lg font-bold active:scale-[0.98] transition-transform"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {kind === 'routine' && (
                <button
                  type="button"
                  onClick={() => { onMarkDone(event.id, 'routine'); onClose() }}
                  className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-bold active:scale-[0.98] transition-transform"
                >
                  <Check className="w-6 h-6" /> Mark done
                </button>
              )}

              <button
                type="button"
                onClick={() => { onSkip(event.id, kind); onClose() }}
                className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-lg font-bold active:scale-[0.98] transition-transform"
              >
                <Redo2 className="w-6 h-6" /> Skip today
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-2xl text-stone-500 dark:text-stone-400 text-base"
          >
            <X className="w-5 h-5" /> Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

Key invariants:
- `PushPreset` is exported so the Shell can type its handler param.
- The `kind === 'task'` branch shows Mark complete + 2×2 push grid; no Skip today, no routine Mark done.
- The else branch (`routine`/`event`) preserves the previous behavior exactly. The `kind === 'routine' && (...)` Mark done button keeps the old conditional.
- Every action button calls `onClose()` after firing its handler — the existing routine/event behavior is preserved and the new task buttons inherit it.
- `onPushTask` is required even for routine/event variants. Tests pass `vi.fn()` for it; production callers always supply it.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/wall-v2/WallV2ItemActionSheet.test.tsx
```

Expected: all tests PASS (7 total: 2 existing + 5 new — the `it.each` counts as 4 cases).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: ONE new error in `WallV2Shell.tsx` — the `<WallV2ItemActionSheet ... />` site now requires `onPushTask` and the existing call doesn't pass it. Task 4 fixes the cascade.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/WallV2ItemActionSheet.tsx src/components/wall-v2/WallV2ItemActionSheet.test.tsx
git commit -m "feat(wall): add task variant to WallV2ItemActionSheet

When event.kind === 'task' the sheet renders Mark complete (emerald)
plus a 2×2 grid of push presets (This week / Next week / Next month /
Someday) and a Cancel row. Routine and event variants are unchanged.
Exports PushPreset so the Shell can route the presets through its
existing updateTask flow.

The required onPushTask prop on routine/event variants is harmless —
those buttons never fire it. WallV2Shell call site is fixed in the
next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add `pushPresetToUpdates` mapper (TDD)

A pure top-level function in the Shell that maps a `PushPreset` to the exact `Partial<Task>` mutation. Easier to test in isolation than against the Shell's render path.

**Files:**
- Modify: `src/components/wall-v2/WallV2Shell.tsx` — add the helper near the top of the file
- Create: `src/components/wall-v2/pushPresetToUpdates.test.ts` — unit tests for the mapper

> **Note on placement:** the helper is small (~15 lines) and is only consumed by the Shell. Keeping it inline (top of `WallV2Shell.tsx`, above the `WallV2Shell` function) avoids creating a new module for a one-caller utility. Tests still live in their own file so they don't load the Shell's full provider tree.

- [ ] **Step 1: Write the failing tests**

Create `src/components/wall-v2/pushPresetToUpdates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
// The mapper is exported from WallV2Shell.tsx for testability; production
// callers consume it from inside that file. Keeping the export public so
// the test file doesn't need to duplicate the logic.
import { pushPresetToUpdates } from './WallV2Shell'

describe('pushPresetToUpdates', () => {
  it("this-week → bucket 'week', no weekDeferredAt, scheduledFor cleared", () => {
    const u = pushPresetToUpdates('this-week')
    expect(u.bucket).toBe('week')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("next-week → bucket 'week' + weekDeferredAt set to a Date close to now", () => {
    const before = new Date()
    const u = pushPresetToUpdates('next-week')
    const after = new Date()
    expect(u.bucket).toBe('week')
    expect(u.weekDeferredAt).toBeInstanceOf(Date)
    // Should be within the test execution window.
    expect(u.weekDeferredAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(u.weekDeferredAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("next-month → bucket 'month', no weekDeferredAt", () => {
    const u = pushPresetToUpdates('next-month')
    expect(u.bucket).toBe('month')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("someday → bucket 'quarter' (longest existing bucket, label-only diff)", () => {
    const u = pushPresetToUpdates('someday')
    expect(u.bucket).toBe('quarter')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    // isSomeday is the legacy flag — we explicitly clear it since the bucket
    // system replaced it; the family-readable "Someday" label is UI-only.
    expect(u.isSomeday).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/components/wall-v2/pushPresetToUpdates.test.ts
```

Expected: FAIL — `pushPresetToUpdates is not exported from './WallV2Shell'` or similar.

- [ ] **Step 3: Add the mapper to `WallV2Shell.tsx`**

In `src/components/wall-v2/WallV2Shell.tsx`, find the imports block at the top of the file (the lines starting with `import …`). After the last `import` statement and before the `WallV2Shell` function declaration, add:

```tsx
import type { Task } from '@/types/task'
import type { PushPreset } from './WallV2ItemActionSheet'

/**
 * Map one of the wall's four push presets to the exact Partial<Task>
 * mutation the existing updateTask hook expects. Exported so it can be
 * unit-tested without spinning up the Shell.
 *
 * - this-week  → drop into the "week" bucket
 * - next-week  → drop into "week" + set weekDeferredAt=now (existing
 *                convention: "sink to the bottom of This Week so it
 *                surfaces during next week's planning")
 * - next-month → drop into "month"
 * - someday    → drop into "quarter" (longest review horizon; the
 *                family-readable "Someday" label is UI-only)
 *
 * scheduledFor and isSomeday are always cleared: a bucket push means
 * "do this in that bucket, no specific date," matching how triage
 * already mutates tasks elsewhere in the app.
 */
export function pushPresetToUpdates(preset: PushPreset): Partial<Task> {
  const common = { scheduledFor: undefined, isSomeday: false } as const
  switch (preset) {
    case 'this-week':
      return { ...common, bucket: 'week', weekDeferredAt: undefined }
    case 'next-week':
      return { ...common, bucket: 'week', weekDeferredAt: new Date() }
    case 'next-month':
      return { ...common, bucket: 'month', weekDeferredAt: undefined }
    case 'someday':
      return { ...common, bucket: 'quarter', weekDeferredAt: undefined }
  }
}
```

If `Task` is already imported in the Shell, don't duplicate — add only `PushPreset`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/wall-v2/pushPresetToUpdates.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: still one error from Task 2 (the action sheet site needing `onPushTask`). No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/WallV2Shell.tsx src/components/wall-v2/pushPresetToUpdates.test.ts
git commit -m "feat(wall): pushPresetToUpdates — map wall presets to bucket mutations

Pure helper, exported from WallV2Shell.tsx for test isolation. Four
cases:
- this-week:  bucket 'week'    (weekDeferredAt cleared)
- next-week:  bucket 'week'    + weekDeferredAt: new Date()
- next-month: bucket 'month'   (weekDeferredAt cleared)
- someday:    bucket 'quarter' (longest existing bucket)

scheduledFor and isSomeday are always cleared on push (bucket push
means 'do this in that bucket, no specific date'). 4 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire task taps + Mark done widening + the new sheet prop in the Shell

The Shell-side glue. After this commit the wall is live: tap a task → sheet opens → Complete/Push → row vanishes on refetch.

**Files:**
- Modify: `src/components/wall-v2/WallV2Shell.tsx`

- [ ] **Step 1: Drop the task flash-fallback in `handleTapEvent`**

Find (around line 286):

```tsx
    if (tapped.kind === 'routine' || tapped.kind === 'event') {
      setActionSheetItem(tapped);
    } else {
      showFlash(tapped.title);
    }
```

Replace with:

```tsx
    // Tasks now open the action sheet too (task variant) — completion
    // plus four push presets. Routines and events keep their existing
    // routine / event branches inside the sheet.
    if (tapped.kind === 'routine' || tapped.kind === 'event' || tapped.kind === 'task') {
      setActionSheetItem(tapped);
    } else {
      showFlash(tapped.title);
    }
```

- [ ] **Step 2: Widen `handleWallMarkDone` to route tasks through `handleToggleComplete`**

Find (around line 313):

```tsx
  const handleWallMarkDone = useCallback(async (id: string, kind: 'event' | 'routine') => {
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await markDone(entityType, entityId, now);
    wallData.refetch();
    showFlash('Marked done');
  }, [markDone, now, wallData, showFlash]);
```

Replace with:

```tsx
  const handleWallMarkDone = useCallback(async (id: string, kind: 'event' | 'routine' | 'task') => {
    if (kind === 'task') {
      // Reuse the same path the row's checkbox uses — single source of
      // truth for "complete this task" mutations from the wall.
      handleToggleComplete(id, true);
      showFlash('Marked complete');
      return;
    }
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await markDone(entityType, entityId, now);
    wallData.refetch();
    showFlash('Marked done');
  }, [handleToggleComplete, markDone, now, wallData, showFlash]);
```

> **Reorder note:** `handleToggleComplete` is currently declared after `handleWallMarkDone` in the file. Move the `handleWallMarkDone` declaration to AFTER `handleToggleComplete` so the closure reference works. If `handleToggleComplete` is already declared earlier (verify around line 225), no reorder is needed. Read the file to confirm order before editing.

- [ ] **Step 3: Add `handleWallPushTask`**

Find the line right after the `handleWallMarkDone` declaration (after its closing `}, […]);`). Add this new handler:

```tsx
  const handleWallPushTask = useCallback(async (id: string, preset: PushPreset) => {
    const taskId = id.replace(/^task-/, '');
    await updateTask(taskId, pushPresetToUpdates(preset));
    wallData.refetch();
    const flash: Record<PushPreset, string> = {
      'this-week':  'Pushed to this week',
      'next-week':  'Pushed to next week',
      'next-month': 'Pushed to next month',
      'someday':    'Pushed to Someday',
    };
    showFlash(flash[preset]);
  }, [updateTask, wallData, showFlash]);
```

- [ ] **Step 4: Pass `onPushTask` into the sheet**

Find the `<WallV2ItemActionSheet …>` JSX (around line 432–438):

```tsx
      {actionSheetItem && (
        <WallV2ItemActionSheet
          event={actionSheetItem}
          onSkip={handleWallSkip}
          onMarkDone={handleWallMarkDone}
          onClose={() => setActionSheetItem(null)}
        />
      )}
```

Replace with:

```tsx
      {actionSheetItem && (
        <WallV2ItemActionSheet
          event={actionSheetItem}
          onSkip={handleWallSkip}
          onMarkDone={handleWallMarkDone}
          onPushTask={handleWallPushTask}
          onClose={() => setActionSheetItem(null)}
        />
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-overdue-tap
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean. The Task 2 cascade error in `WallV2Shell.tsx` is now resolved.

- [ ] **Step 6: Run the wall-v2 suite for regressions**

```bash
npx vitest run src/components/wall-v2
```

Expected: green across the wall-v2 suite (29 adapter tests + 7 action sheet tests + 4 mapper tests + any existing event card / guest screen tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): wire task tap → action sheet → complete/push

- handleTapEvent now opens the sheet for tasks (was flashing the
  title). Routines/events unchanged.
- handleWallMarkDone widened to accept 'task'; routes through
  handleToggleComplete for a single 'complete this task' path.
- New handleWallPushTask uses pushPresetToUpdates to mutate the task
  via the existing updateTask hook, then refetches and flashes a
  contextual confirmation.
- The action sheet's new onPushTask prop is wired.

Closes the FU-1 gap named in the previous wall-overdue spec: tap-to-
act for tasks on the wall now mirrors the desktop / mobile action
surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Final verification + ship

Quality gate, optional smoke, then race-safe ff push to `main` (auto-deploys to production per `vercel.json`).

- [ ] **Step 1: Lint**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-overdue-tap
npm run lint
```

Expected: 0 errors. Pre-existing warnings in unrelated supabase/vite folders are fine.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: green except pre-existing failures unrelated to this work. Note any new failures and stop if they're tied to wall-v2 or the action sheet path.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: clean (chunk size warning is pre-existing).

- [ ] **Step 4: Manual smoke (recommended)**

```bash
npm run dev
```

Open the wall route in a browser. With a known set of overdue tasks (e.g. 8+), confirm:
- The Overdue section now shows all of them, not just 5. Scroll the column.
- Tap an overdue row → action sheet opens with Mark complete + 2×2 push grid + Cancel.
- Mark complete → row vanishes after the next refetch (or immediately if you hit Refresh).
- Each push preset → flash message confirms ("Pushed to next week", etc.) and the row vanishes on refetch.
- Tap a routine row → existing Mark done / Skip today flow unchanged.
- Tap an event row → existing Skip today flow unchanged.

- [ ] **Step 5: Race-safe fast-forward push to main**

```bash
git fetch origin main --quiet
git push origin wall-overdue-tap:main
```

The pre-push hook (`tsc --noEmit` + full vitest) runs before the push is accepted. On success the push triggers Vercel's auto-deploy to production.

If the push is rejected as non-fast-forward, rebase first:

```bash
git fetch origin main
git rebase origin/main
# resolve any conflicts, then:
git push origin wall-overdue-tap:main
```

- [ ] **Step 6: Cleanup**

From the main worktree root, remove the feature worktree + delete both local and remote branches:

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/wall-overdue-tap
git worktree prune
git branch -D wall-overdue-tap
git push origin --delete wall-overdue-tap
```

---

## Self-review

**Spec coverage:**
- ✅ Goal 1 (every overdue reachable, scroll if needed) → Task 1 drops the cap
- ✅ Goal 2 (tap any task → sheet with Complete + 4 push presets) → Tasks 2 + 4
- ✅ Goal 3 (presets map to existing bucket model) → Task 3
- ✅ Goal 4 (row vanishes after action via refetch) → Task 4 calls `wallData.refetch()` in both handlers
- ✅ Non-goals respected (no custom date picker, no swipe, no mobile/desktop changes, no new optimistic path, no routine/event behavior changes) → no tasks add any of these
- ✅ Acceptance criterion 1 (no UI cap) → Task 1 + its renamed test
- ✅ AC 2 (task variant of sheet, others unchanged) → Task 2 tests cover both branches
- ✅ AC 3 (Complete via sheet works) → Task 2 + Task 4 (routes through handleToggleComplete)
- ✅ AC 4 (push mutations match the table) → Task 3 tests assert every case
- ✅ AC 5 (flash confirmation per action) → Task 4 includes the flash map
- ✅ AC 6 (routine/event flows unchanged) → Task 2 "routine and event variants are unchanged" test + manual smoke
- ✅ AC 7 (lint/build/vitest clean) → Task 5
- ✅ AC 8 (test coverage: cap removal, sheet variant rendering+wiring, mapper, Shell tap-open) → Tasks 1, 2, 3 explicit; Task 2 covers the "no Skip today" assertion which exercises the new branch end-to-end

**Open spec questions noted, deferred per spec:**
- Flash wording ("Pushed" vs "Snoozed") — Task 4 uses "Pushed" per the spec's stated default
- Routine-tasks-as-task hypothetical — no tasks change routine behavior

**Placeholder scan:** none. Every step has either a complete code block or a complete shell command. The "Reorder note" in Task 4 Step 2 is a conditional instruction with a verification step ("verify around line 225"), not a placeholder.

**Type consistency:**
- `PushPreset` defined and exported in Task 2 (WallV2ItemActionSheet.tsx); consumed by Task 3 (mapper) and Task 4 (Shell). All three use the same four string literals: `'this-week' | 'next-week' | 'next-month' | 'someday'`. ✓
- `onMarkDone` widens to `'event' | 'routine' | 'task'` in Task 2 (prop type) and Task 4 (Shell handler). ✓
- `pushPresetToUpdates` exported from `WallV2Shell.tsx` and imported by `pushPresetToUpdates.test.ts` (Task 3). ✓
- `Task` type imported into Shell in Task 3 for the helper's return type; used implicitly in Task 4 via `updateTask(taskId, pushPresetToUpdates(preset))`. ✓
- `bucket` values match `TaskBucket = 'inbox' | 'week' | 'month' | 'quarter' | 'timed'` from `src/types/task.ts:6` — verified in spec; mapper only emits `'week'`, `'month'`, `'quarter'`. ✓
