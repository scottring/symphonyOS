# Week Phase 4b — Polish + Workweek View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the rough edges in the shipped Week view (`WeekViewV2`), add a 5-day Workweek view, surface a hide-routines toggle in the Week header, and narrow the right panel to make room for hover-target week scrollers.

**Architecture:** Single feature branch off `main`. Each task is independently committable. No feature flag — polish on an already-shipped surface; revert the commit if anything breaks. All work lands in a single worktree at `.worktrees/week-phase-4b`.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4, @dnd-kit/core, Vitest. No schema changes except one new Supabase edge-function input field on the existing `google-calendar-create-event` function.

**Spec:** `docs/superpowers/specs/2026-05-20-week-phase-4b-polish-design.md`

---

## Setup

### Task 0: Create worktree and branch

**Files:** none (housekeeping)

- [ ] **Step 1: Create the worktree from origin/main**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git fetch origin --quiet
git worktree add .worktrees/week-phase-4b -b feat/week-phase-4b origin/main
cp .env .worktrees/week-phase-4b/.env
cd .worktrees/week-phase-4b
```

Expected: "branch 'feat/week-phase-4b' set up to track 'origin/main'." and the worktree directory exists.

- [ ] **Step 2: Verify baseline tests pass**

```bash
npx vitest src/components/home/week --run 2>&1 | tail -5
```

Expected: "Test Files X passed (X), Tests Y passed (Y)" — record the numbers, this is the floor we must not regress below.

> **All subsequent tasks run from `.worktrees/week-phase-4b/` unless stated otherwise.**

---

## Task 1: Narrow right panel from 420px to 380px

**Files:**
- Modify: `src/components/layout/AppShell.tsx` (5 locations)

**Why first:** Smallest change, zero coupling to anything else, reclaims the horizontal space later tasks need for hover scrollers.

- [ ] **Step 1: Read the current AppShell width strings**

Run:
```bash
grep -n "420" src/components/layout/AppShell.tsx
```

Expected output: lines 258, 260, 433, 482, 555 (the literal `420px` in focus-mode math, and four `w-[420px]` Tailwind utility classes).

- [ ] **Step 2: Replace all five occurrences**

Use this exact edit pattern in `src/components/layout/AppShell.tsx`:
- Line 258 area: `: rightPanelVisible && focusModeOpen ? '840px'` → leave alone (840 is intentional 2× pattern, NOT 420)
- Verify with `grep -n "840" src/components/layout/AppShell.tsx` first — if 840 is the focus-mode width, leave it; we are only changing 420px references.
- Replace `420px` → `380px` everywhere in this file
- Replace `w-[420px]` → `w-[380px]` everywhere in this file

```bash
# Verify count before edit
grep -c "420" src/components/layout/AppShell.tsx
# Apply edit using sed (in-place)
sed -i '' 's/420px/380px/g; s/w-\[420px\]/w-[380px]/g' src/components/layout/AppShell.tsx
# Verify after edit
grep -c "420" src/components/layout/AppShell.tsx
```

Expected: count drops to 0 after edit. If any 420 remains, inspect manually — there should be none.

- [ ] **Step 3: Run typecheck + build**

```bash
npm run build 2>&1 | tail -3
```

Expected: "✓ built in Xs" — no TypeScript errors. If errors mention 420, undo and inspect.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "fix(layout): narrow right panel from 420 to 380px

Reclaims 40px on either side of the week grid for upcoming hover-target
week scrollers. Detail/chat panel content already renders fine at 380px
(matches existing chat panel width)."
```

---

## Task 2: Add 'workweek' to HomeViewType and switcher

**Files:**
- Modify: `src/types/homeView.ts:1`
- Modify: `src/components/home/HomeViewSwitcher.tsx:8-12`
- Test: `src/components/home/HomeViewSwitcher.test.tsx`

- [ ] **Step 1: Write the failing switcher test**

Edit `src/components/home/HomeViewSwitcher.test.tsx`. Find the existing render-all-options test and add a case for Workweek. The test file already exists — add this `it` block:

```tsx
it('renders Workweek option and fires onChange with workweek', async () => {
  const onChange = vi.fn()
  render(<HomeViewSwitcher currentView="today" onViewChange={onChange} />)
  const btn = screen.getByRole('button', { name: 'Workweek' })
  await userEvent.click(btn)
  expect(onChange).toHaveBeenCalledWith('workweek')
})
```

If `userEvent` is not already imported, add: `import userEvent from '@testing-library/user-event'`.

- [ ] **Step 2: Run the test, see it fail**

```bash
npx vitest src/components/home/HomeViewSwitcher.test.tsx --run 2>&1 | tail -10
```

Expected: FAIL — "Unable to find role button with name 'Workweek'" (since the option doesn't exist yet).

- [ ] **Step 3: Add 'workweek' to HomeViewType**

In `src/types/homeView.ts`, change line 1:

```ts
export type HomeViewType = 'today' | 'workweek' | 'week' | 'month'
```

- [ ] **Step 4: Add Workweek to the switcher views array**

In `src/components/home/HomeViewSwitcher.tsx`, change the `views` array (lines 8-12):

```ts
const views: { value: HomeViewType; label: string }[] = [
  { value: 'today', label: 'Day' },
  { value: 'workweek', label: 'Workweek' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]
```

- [ ] **Step 5: Run test, see it pass**

```bash
npx vitest src/components/home/HomeViewSwitcher.test.tsx --run 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 6: Run typecheck — type narrowing may catch downstream gaps**

```bash
npm run build 2>&1 | tail -10
```

Expected: success. If errors complain about `HomeViewType` exhaustiveness (e.g., a `switch` statement that doesn't handle `'workweek'`), note the file and line; we'll address in Task 5 (HomeView wiring). For now, if any *type* errors arise outside `HomeView.tsx`, fix them minimally by treating `'workweek'` as a synonym for `'week'`. Document any such site with a `// TODO(Task 5)` comment.

- [ ] **Step 7: Commit**

```bash
git add src/types/homeView.ts src/components/home/HomeViewSwitcher.tsx src/components/home/HomeViewSwitcher.test.tsx
git commit -m "feat(home): add Workweek option to HomeViewType + switcher

Switcher becomes Day | Workweek | Week | Month. Workweek will render a
5-day (Mon-Fri) version of the week grid; wiring lands in Task 5."
```

---

## Task 3: WeekGrid honors dayCount prop

**Files:**
- Modify: `src/components/home/week/WeekGrid.tsx:20-35, 42, 58, 73`
- Test: `src/components/home/week/WeekGrid.test.tsx`

- [ ] **Step 1: Write the failing test for dayCount=5**

Append to `src/components/home/week/WeekGrid.test.tsx`:

```tsx
it('renders 5 day-column headers when dayCount=5', () => {
  // Use a Monday so the 5 days are Mon-Fri
  const monday = new Date(2026, 4, 18)  // 2026-05-18 is a Monday
  render(<WeekGrid weekStart={monday} dayCount={5} />)
  // Day headers: time gutter + 5 day labels
  const headerCells = screen.getAllByText(/^(mon|tue|wed|thu|fri|sat|sun)$/i)
  expect(headerCells).toHaveLength(5)
})

it('defaults to 7 day columns when dayCount is omitted', () => {
  const sunday = new Date(2026, 4, 17)  // 2026-05-17 is a Sunday
  render(<WeekGrid weekStart={sunday} />)
  const headerCells = screen.getAllByText(/^(mon|tue|wed|thu|fri|sat|sun)$/i)
  expect(headerCells).toHaveLength(7)
})
```

- [ ] **Step 2: Run, see fail**

```bash
npx vitest src/components/home/week/WeekGrid.test.tsx --run 2>&1 | tail -10
```

Expected: FAIL — either the prop doesn't exist (type error) or only 7 are rendered.

- [ ] **Step 3: Add dayCount prop to WeekGrid**

In `src/components/home/week/WeekGrid.tsx`:

Update the props interface (around line 20-28):

```tsx
interface WeekGridProps {
  weekStart: Date  // First day of the displayed range, 00:00 local
  /** Number of day columns to render. 5 = Mon-Fri (workweek), 7 = full week. Default 7. */
  dayCount?: 5 | 7
  children?: ReactNode
  onCreateGesture?: CreateGestureHandlers
  suppressCreate?: boolean
}
```

Update the function signature (line 30):

```tsx
export function WeekGrid({ weekStart, dayCount = 7, children, onCreateGesture, suppressCreate }: WeekGridProps) {
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
```

Update all three `repeat(7, 1fr)` references in gridTemplateColumns (lines 42, 58, 74, 92 area) to use `repeat(${dayCount}, 1fr)`. Search for `repeat(7,` and replace all occurrences in this file:

```bash
grep -n "repeat(7" src/components/home/week/WeekGrid.tsx
```

Replace each with `repeat(${dayCount}, 1fr)` inside the template string. There should be 4 occurrences.

Also: the trailing day-column rendering after the hour rows (around line 96, `{days.map((_, i) => (...))}`) — `days` is already correctly sized.

- [ ] **Step 4: Run tests, see pass**

```bash
npx vitest src/components/home/week/WeekGrid.test.tsx --run 2>&1 | tail -5
```

Expected: PASS for both new tests + all existing.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekGrid.tsx src/components/home/week/WeekGrid.test.tsx
git commit -m "feat(week): WeekGrid accepts dayCount prop (5 or 7)

Defaults to 7; passing 5 renders a workweek-style grid. Used by the new
Workweek view in upcoming tasks."
```

---

## Task 4: WeekViewV2 accepts dayCount + Monday-anchored Workweek helper

**Files:**
- Create: `src/lib/workweekHelpers.ts`
- Test: `src/lib/workweekHelpers.test.ts`
- Modify: `src/components/home/week/WeekViewV2.tsx` (props, propagation, week math)

- [ ] **Step 1: Write the failing helper test**

Create `src/lib/workweekHelpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mondayOfWeek } from './workweekHelpers'

describe('mondayOfWeek', () => {
  it('returns Monday for a Tuesday', () => {
    // 2026-05-19 is a Tuesday
    const tue = new Date(2026, 4, 19)
    const mon = mondayOfWeek(tue)
    expect(mon.getDate()).toBe(18)
    expect(mon.getDay()).toBe(1)  // Monday
  })

  it('returns the same date when called on a Monday', () => {
    const mon = new Date(2026, 4, 18)
    expect(mondayOfWeek(mon).getDate()).toBe(18)
  })

  it('snaps a Saturday to the UPCOMING Monday (next week)', () => {
    // 2026-05-23 is a Saturday
    const sat = new Date(2026, 4, 23)
    const mon = mondayOfWeek(sat)
    expect(mon.getDate()).toBe(25)  // following Monday
    expect(mon.getDay()).toBe(1)
  })

  it('snaps a Sunday to the upcoming Monday', () => {
    // 2026-05-24 is a Sunday
    const sun = new Date(2026, 4, 24)
    const mon = mondayOfWeek(sun)
    expect(mon.getDate()).toBe(25)
    expect(mon.getDay()).toBe(1)
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npx vitest src/lib/workweekHelpers.test.ts --run 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `src/lib/workweekHelpers.ts`:

```ts
/**
 * Returns the Monday of the week containing `d`.
 * For weekends (Sat/Sun), snaps to the UPCOMING Monday — the rationale
 * is that Workweek view is forward-looking; if you switch to it on a
 * Saturday, you want to see the week you're about to start, not the one
 * that just ended.
 */
export function mondayOfWeek(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  const dow = result.getDay()  // 0 = Sun, 1 = Mon, ..., 6 = Sat
  let offset: number
  if (dow === 0) offset = 1          // Sun → +1 (next Mon)
  else if (dow === 6) offset = 2     // Sat → +2 (next Mon)
  else offset = 1 - dow              // Mon-Fri → step back to Mon (or 0)
  result.setDate(result.getDate() + offset)
  return result
}
```

- [ ] **Step 4: Run, see pass**

```bash
npx vitest src/lib/workweekHelpers.test.ts --run 2>&1 | tail -5
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Add dayCount prop to WeekViewV2 + propagate to WeekGrid**

In `src/components/home/week/WeekViewV2.tsx`:

Update the props interface (line 33-47), adding:

```tsx
  /** Number of day columns. 5 = workweek (Mon-Fri), 7 = full week. Default 7. */
  dayCount?: 5 | 7
```

Destructure it from props (line 50-60), adding `dayCount = 7` to the destructure list.

Update the `weekEnd` memo (line 153-157) and `inWeek` calculation to use `dayCount`:

```tsx
const weekEnd = useMemo(() => {
  const e = new Date(weekStart)
  e.setDate(e.getDate() + dayCount)
  return e
}, [weekStart, dayCount])
```

Update the routine expansion (line 204-210) — `Array.from({ length: 7 }, ...)` → `Array.from({ length: dayCount }, ...)`.

Update the `<WeekGrid>` invocation (line 245+):

```tsx
<WeekGrid
  weekStart={weekStart}
  dayCount={dayCount}
  onCreateGesture={/* unchanged */}
  suppressCreate={!!drag.activeDragId}
>
```

Update the auto-advance direction in `useWeekDragDrop` — NOTE: `useWeekDragDrop.ts` line 113-117 hard-codes `direction = edge === 'right' ? 7 : -7`. We need it to step by `dayCount`. Add `dayCount` to `UseWeekDragDropArgs` and pass it down from `WeekViewV2`:

In `src/components/home/week/useWeekDragDrop.ts`:
- Add `dayCount: number` to `UseWeekDragDropArgs` (line 11-20)
- In `notifyEdge`, replace `direction = edge === 'right' ? 7 : -7` with `direction = edge === 'right' ? args.dayCount : -args.dayCount`

In `WeekViewV2.tsx`, pass `dayCount` into `useWeekDragDrop`:

```tsx
const drag = useWeekDragDrop({
  weekStart,
  onWeekChange,
  onUpdateTask,
  onUpdateEvent,
  onUpdateRoutine,
  tasks,
  events,
  routines,
  dayCount,
})
```

- [ ] **Step 6: Run all week tests**

```bash
npx vitest src/components/home/week --run 2>&1 | tail -10
```

Expected: all green. Existing tests pass because dayCount defaults to 7.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workweekHelpers.ts src/lib/workweekHelpers.test.ts \
        src/components/home/week/WeekViewV2.tsx \
        src/components/home/week/useWeekDragDrop.ts
git commit -m "feat(week): WeekViewV2 + useWeekDragDrop accept dayCount

dayCount controls both the grid width and the cross-week auto-advance
step. Defaults to 7. Workweek wiring lands in Task 5.

Also adds mondayOfWeek() helper for Workweek's Monday-anchoring."
```

---

## Task 5: Wire Workweek view in HomeView

**Files:**
- Modify: `src/components/home/HomeView.tsx` (around lines 235-281)

- [ ] **Step 1: Read the current week-rendering branch in HomeView**

Open `src/components/home/HomeView.tsx` and locate the `if (currentView === 'week')` block (around line 235). The plan: when `currentView === 'workweek'`, render the same `WeekViewV2` with `dayCount={5}` and ensure `weekStart` is Monday-anchored.

- [ ] **Step 2: Add the workweek branch**

Add this block immediately before the `if (currentView === 'week')` block (i.e., as a separate `if` branching on the new `'workweek'` value). Insert at line 235 area:

```tsx
if (currentView === 'workweek') {
  // Workweek anchors weekStart to Monday (vs. Sunday for 7-day week).
  // We compute the displayed start locally so it doesn't permanently
  // shift the underlying weekStart state — switching back to Week keeps
  // the prior Sunday anchor.
  const mondayStart = mondayOfWeek(weekStart)
  return (
    <>
      <WeekViewV2
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        dateInstances={dateInstances}
        weekStart={mondayStart}
        dayCount={5}
        onWeekChange={setWeekStart}
        selectedAssignee={selectedAssigneeForSchedule}
        onSelectItem={onSelectItem}
        onUpdateTask={ctx.onUpdateTask ?? (() => {})}
        onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
        onUpdateEvent={() => {}}
      />
      <WeekViewMobile
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        weekStart={mondayStart}
        dayCount={5}
        onSelectItem={onSelectItem}
      />
    </>
  )
}
```

Add the import at the top of the file:

```tsx
import { mondayOfWeek } from '@/lib/workweekHelpers'
```

> Note: `WeekViewMobile` doesn't yet accept `dayCount` — that's Task 9. For now this will be a type error. Either:
> (a) skip the `dayCount={5}` on `WeekViewMobile` here (it will render 7 days briefly on mobile workweek)
> (b) ship Task 9 immediately after this task before testing on mobile
>
> Pick (a) to keep this task independently shippable. Remove the `dayCount={5}` from `<WeekViewMobile>` in this block and add a `// TODO(Task 9)` comment.

- [ ] **Step 3: Verify any leftover `// TODO(Task 5)` comments from Task 2 are resolved**

```bash
grep -rn "TODO(Task 5)" src/
```

Expected: zero results, or if any exist (e.g., a switch statement in another component), update them to handle `'workweek'` the same way they handle `'week'`. Most likely no results.

- [ ] **Step 4: Build + run tests**

```bash
npm run build 2>&1 | tail -3
npx vitest src/components/home/week --run 2>&1 | tail -5
```

Expected: build succeeds, all tests pass.

- [ ] **Step 5: Manual smoke check**

```bash
npm run dev
```

In browser: switch to "Workweek" in the view switcher. Verify:
- Grid shows 5 columns Mon-Fri
- Headers are correct weekdays
- Switching to Week shows 7 columns (Sun-Sat)
- Switching to Day shows the Today view (unchanged)

Stop dev server when satisfied.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/HomeView.tsx
git commit -m "feat(home): wire Workweek view (5-day Mon-Fri grid)

Renders WeekViewV2 with dayCount=5 and a Monday-anchored weekStart when
currentView='workweek'. Mobile uses WeekViewMobile (still 7-day until
Task 9 lands)."
```

---

## Task 6: DragOverlay shows a faded WeekEventBlock instead of "·"

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx` (DragOverlay block, line 289-291)

- [ ] **Step 1: Locate the dragged item from activeDragId**

`activeDragId` is the dnd-kit drag id, which for blocks is `block-<TimelineItem.id>` (per the data shape in `useWeekDragDrop`). Strip the prefix and find the matching item in `allBlocks`.

Update the DragOverlay JSX (line 289-291) in `src/components/home/week/WeekViewV2.tsx`:

```tsx
<DragOverlay dropAnimation={null}>
  {drag.activeDragId
    ? (() => {
        const itemId = drag.activeDragId.startsWith('block-')
          ? drag.activeDragId.slice('block-'.length)
          : drag.activeDragId
        const item = allBlocks.find((b) => b.id === itemId)
        if (!item) return null
        // Render a static, non-interactive copy at 60% opacity. No
        // pointer events; no drag/resize handlers; the dnd-kit overlay
        // already follows the pointer.
        return (
          <div className="opacity-60 pointer-events-none">
            <div className="px-2 py-1 rounded-md bg-primary-50 border border-primary-200 text-[12px] text-primary-900 shadow-md">
              {item.title}
            </div>
          </div>
        )
      })()
    : null}
</DragOverlay>
```

> Why not render a full `WeekEventBlock`? It expects `weekStart` and absolute positioning. The overlay is a free-floating pointer ghost — a tiny chip with the title is enough to confirm "yes, you are dragging this thing."

- [ ] **Step 2: Verify the drag id prefix**

```bash
grep -n "block-\|chip-\|useDraggable" src/components/home/week/WeekEventBlock.tsx | head -10
```

Confirm the draggable id format. If blocks use `id: 'block-' + item.id` in `useDraggable`, the prefix-strip above is correct. If they use `id: item.id` directly, remove the `.slice('block-'.length)` — `itemId = drag.activeDragId`.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

Drag a task block. Expected: a small faded chip with the task title follows the pointer, not a "·".

- [ ] **Step 4: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx
git commit -m "fix(week): DragOverlay shows a faded title chip, not '.'

Was rendering a period character that read as no-feedback. Now shows a
60%-opacity chip with the dragged item's title so it's obvious the drag
is in progress."
```

---

## Task 7: Drag-to-create outline overlay

**Files:**
- Modify: `src/components/home/week/useGridCreate.ts` (expose live state)
- Modify: `src/components/home/week/WeekViewV2.tsx` (render outline overlay)
- Test: `src/components/home/week/useGridCreate.test.ts` (extend)

- [ ] **Step 1: Expose live gesture state from useGridCreate**

Right now `useGridCreate` only sets `state` on pointer-up. The outline needs a live signal during the drag. Add a `liveGesture` ref-mirror as state so consumers can render the in-flight rectangle.

Edit `src/components/home/week/useGridCreate.ts`. Add this to the `UseGridCreateResult` interface (line 25-38):

```ts
  /** Live snapshot of the in-progress drag (null when no drag active). For outline render. */
  liveGesture: { startSlot: SlotRef; endSlot: SlotRef; anchorRect: AnchorRect } | null
```

In the hook body, add a `liveGesture` `useState` and update it inside `onSlotPointerDown` and `onGridPointerMove`:

```ts
const [liveGesture, setLiveGesture] = useState<{
  startSlot: SlotRef
  endSlot: SlotRef
  anchorRect: AnchorRect
} | null>(null)

const onSlotPointerDown = useCallback((e: React.PointerEvent, slot: SlotRef) => {
  const rect = (e.currentTarget as Element).getBoundingClientRect()
  const next = {
    startSlot: slot,
    endSlot: slot,
    anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  }
  gestureRef.current = next
  setLiveGesture(next)
}, [])

const onGridPointerMove = useCallback((slot: SlotRef | null) => {
  if (!gestureRef.current || !slot) return
  if (slot.dayIso !== gestureRef.current.startSlot.dayIso) return
  gestureRef.current.endSlot = slot
  setLiveGesture({ ...gestureRef.current })
}, [])

const onSlotPointerUp = useCallback(() => {
  const g = gestureRef.current
  gestureRef.current = null
  setLiveGesture(null)
  if (!g) return
  setState({ startSlot: g.startSlot, endSlot: g.endSlot, anchorRect: g.anchorRect })
}, [])
```

Return `liveGesture` from the hook:

```ts
return { state, liveGesture, toTimes, onSlotPointerDown, onGridPointerMove, onSlotPointerUp, close }
```

- [ ] **Step 2: Extend the hook test**

In `src/components/home/week/useGridCreate.test.ts`, add:

```ts
it('exposes liveGesture during a drag and clears it on pointerUp', () => {
  const { result } = renderHook(() => useGridCreate())
  const slot1 = { dayIso: '2026-05-18', hour: 9, minute: 0 }
  const slot2 = { dayIso: '2026-05-18', hour: 9, minute: 30 }
  const fakeEvent = {
    currentTarget: { getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 15 }) },
  } as unknown as React.PointerEvent

  act(() => { result.current.onSlotPointerDown(fakeEvent, slot1) })
  expect(result.current.liveGesture?.startSlot).toEqual(slot1)

  act(() => { result.current.onGridPointerMove(slot2) })
  expect(result.current.liveGesture?.endSlot).toEqual(slot2)

  act(() => { result.current.onSlotPointerUp() })
  expect(result.current.liveGesture).toBeNull()
})
```

- [ ] **Step 3: Run hook tests, all pass**

```bash
npx vitest src/components/home/week/useGridCreate.test.ts --run 2>&1 | tail -5
```

Expected: PASS including the new test.

- [ ] **Step 4: Render the outline overlay in WeekViewV2**

In `src/components/home/week/WeekViewV2.tsx`, add an outline render inside the grid layer. Find the `<WeekGrid>` invocation (around line 245) and add an overlay child *outside* `<WeekGrid>` but inside the same parent — easier: render it as a fixed-position div using `anchorRect`.

Add this just before the `<DragOverlay>` block (around line 289):

```tsx
{gridCreate.liveGesture && (() => {
  const { liveGesture } = gridCreate
  // Compute the outline rect from liveGesture's start + end slots. We use
  // the anchor rect (start slot) as the top-left, and walk minutes to
  // calculate height. 15min == anchorRect.height (one sub-slot).
  const startMinutes = liveGesture.startSlot.hour * 60 + liveGesture.startSlot.minute
  const endMinutes = liveGesture.endSlot.hour * 60 + liveGesture.endSlot.minute + 15
  const minutesSpan = Math.max(15, endMinutes - startMinutes)
  const heightPx = (minutesSpan / 15) * liveGesture.anchorRect.height
  const style: React.CSSProperties = {
    position: 'fixed',
    top: liveGesture.anchorRect.top,
    left: liveGesture.anchorRect.left,
    width: liveGesture.anchorRect.width,
    height: heightPx,
    pointerEvents: 'none',
    zIndex: 55,
  }
  return (
    <div
      style={style}
      className="border-2 border-dashed border-primary-500/60 bg-primary-500/5 rounded-md"
    />
  )
})()}
```

- [ ] **Step 5: Manual smoke check**

```bash
npm run dev
```

Click-and-drag down on an empty slot. Expected: a dashed primary-500 outline grows as you drag. On release, the popover replaces it.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/week/useGridCreate.ts \
        src/components/home/week/useGridCreate.test.ts \
        src/components/home/week/WeekViewV2.tsx
git commit -m "feat(week): visual outline during drag-to-create

useGridCreate now exposes liveGesture (start/end slot during drag) and
WeekViewV2 renders a dashed primary outline that grows with the gesture.
Outline disappears the instant the popover opens."
```

---

## Task 8: Hover-target week scrollers + keyboard nav

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx` (scroller buttons + key handler)

- [ ] **Step 1: Add scroller buttons positioned at left/right grid edges**

In `src/components/home/week/WeekViewV2.tsx`, inside the `<div data-week-bounds>` wrapper (line 229), add two absolute-positioned hover-target buttons. Wrap the existing content in a relative container:

Change the outermost return:

```tsx
return (
  <div data-week-bounds className="hidden lg:block relative group/week">
    <WeekSummaryRow ... />
    {/* ...existing... */}

    {/* Hover scrollers — invisible until hovered over the edge zone */}
    <button
      type="button"
      aria-label="Previous week"
      onClick={() => {
        const next = new Date(weekStart)
        next.setDate(next.getDate() - dayCount)
        onWeekChange(next)
      }}
      className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-16 flex items-center justify-center
                 bg-white/80 border border-neutral-200 rounded-r-md shadow-sm
                 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity
                 z-30"
    >
      <ChevronLeft className="w-4 h-4 text-neutral-600" />
    </button>
    <button
      type="button"
      aria-label="Next week"
      onClick={() => {
        const next = new Date(weekStart)
        next.setDate(next.getDate() + dayCount)
        onWeekChange(next)
      }}
      className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-16 flex items-center justify-center
                 bg-white/80 border border-neutral-200 rounded-l-md shadow-sm
                 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity
                 z-30"
    >
      <ChevronRight className="w-4 h-4 text-neutral-600" />
    </button>
  </div>
)
```

Add the icon imports at the top of the file:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
```

> Note: the per-element `opacity-0 hover:opacity-100` means the chevron appears only when the user hovers directly on the 24px-wide chip. To get the "hover the edge zone" feel (hover within ~40px of the edge reveals the arrow), we'd need a wider invisible hit area. We use a 24px-wide visible chip for v1 — simple and discoverable enough. If discoverability is poor, widen the chip to 32px in a follow-up.

- [ ] **Step 2: Add keyboard navigation handler**

Inside the same `WeekViewV2` component, add a `useEffect` that listens for `[` / `]`:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Don't hijack when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === '[') {
      const next = new Date(weekStart)
      next.setDate(next.getDate() - dayCount)
      onWeekChange(next)
    } else if (e.key === ']') {
      const next = new Date(weekStart)
      next.setDate(next.getDate() + dayCount)
      onWeekChange(next)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [weekStart, dayCount, onWeekChange])
```

Add the import at the top if not already present:

```tsx
import { useMemo, useState, useCallback, useEffect } from 'react'
```

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

- Hover left/right edges of grid → chevron appears, click → grid steps by `dayCount` (7 in Week, 5 in Workweek).
- Press `[` or `]` (without focus in an input) → same behavior.
- Press `[` with focus in QuickCapture input → no navigation (the input gets the `[` character).

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx
git commit -m "feat(week): hover-target prev/next week scrollers + [/] keys

Left/right edge chips fade in on hover; click steps by dayCount.
Keyboard '[' and ']' step backward/forward (when not in an input).
Replaces the prior 'drag to edge for 500ms' as the primary nav."
```

---

## Task 9: WeekViewMobile renders events + routines + accepts dayCount

**Files:**
- Modify: `src/components/home/week/WeekViewMobile.tsx`
- Modify: `src/components/home/HomeView.tsx` (re-add `dayCount={5}` removed in Task 5)
- Test: `src/components/home/week/WeekViewMobile.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `src/components/home/week/WeekViewMobile.test.tsx`. First, read existing imports/setup; you'll need fixture data for events and routines. Pattern after the existing tests:

```tsx
it('renders calendar events in the appropriate day section', () => {
  const tuesday = new Date(2026, 4, 19, 10, 0)
  const events = [{
    id: 'ev-1',
    title: 'Standup',
    startTime: tuesday.toISOString(),
    endTime: new Date(tuesday.getTime() + 30 * 60 * 1000).toISOString(),
  }] as CalendarEvent[]
  const monday = new Date(2026, 4, 18)
  render(<WeekViewMobile tasks={[]} events={events} routines={[]} weekStart={monday} onSelectItem={() => {}} />)
  expect(screen.getByText('Standup')).toBeInTheDocument()
})

it('renders routines on every day in the week', () => {
  const routines = [{
    id: 'r-1',
    title: 'Morning meds',
    time_of_day: '08:00',
    isActive: true,
    recurrence_pattern: { type: 'daily' },
  }] as unknown as Routine[]
  const monday = new Date(2026, 4, 18)
  render(<WeekViewMobile tasks={[]} events={[]} routines={routines} weekStart={monday} onSelectItem={() => {}} />)
  const matches = screen.getAllByText('Morning meds')
  expect(matches).toHaveLength(7)  // default dayCount = 7
})

it('renders only 5 days when dayCount=5', () => {
  const monday = new Date(2026, 4, 18)
  render(<WeekViewMobile tasks={[]} events={[]} routines={[]} weekStart={monday} dayCount={5} onSelectItem={() => {}} />)
  // 5 section headers — assume day-name format like "Monday, May 18"
  expect(screen.queryByText(/saturday/i)).toBeNull()
  expect(screen.queryByText(/sunday/i)).toBeNull()
})
```

- [ ] **Step 2: Run, see fail**

```bash
npx vitest src/components/home/week/WeekViewMobile.test.tsx --run 2>&1 | tail -10
```

Expected: 3 failing tests (events not rendered, routines not rendered, dayCount not honored).

- [ ] **Step 3: Update WeekViewMobile**

Replace `src/components/home/week/WeekViewMobile.tsx` with:

```tsx
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface WeekViewMobileProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  weekStart: Date
  /** Number of day sections to render. Default 7. */
  dayCount?: 5 | 7
  onSelectItem: (id: string) => void
}

interface DayItem {
  id: string
  kind: 'task' | 'event' | 'routine'
  title: string
  time: string | null  // sortable "HH:MM" or null for all-day
}

export function WeekViewMobile({
  tasks, events, routines, weekStart, dayCount = 7, onSelectItem,
}: WeekViewMobileProps) {
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(e.getDate() + dayCount); return e
  }, [weekStart, dayCount])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  const unscheduled = useMemo(() =>
    tasks.filter(t => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart, dayCount])

  const itemsByDay = useMemo(() => {
    const buckets: Record<number, DayItem[]> = {}
    for (let i = 0; i < dayCount; i++) buckets[i] = []
    const weekStartMidnight = new Date(weekStart); weekStartMidnight.setHours(0, 0, 0, 0)

    // Tasks (timed only — all-day handled in `unscheduled`)
    for (const t of tasks) {
      if (!t.scheduledFor || !inWeek(t.scheduledFor) || t.isAllDay) continue
      const dow = dayIndex(t.scheduledFor, weekStartMidnight)
      if (dow >= 0 && dow < dayCount) {
        buckets[dow].push({ id: t.id, kind: 'task', title: t.title, time: hhmm(t.scheduledFor) })
      }
    }

    // Events
    for (const ev of events) {
      const startStr = (ev as { start_time?: string }).start_time ??
                       (ev as { startTime?: string }).startTime
      if (!startStr) continue
      const start = new Date(startStr)
      if (!inWeek(start)) continue
      const dow = dayIndex(start, weekStartMidnight)
      if (dow >= 0 && dow < dayCount) {
        buckets[dow].push({ id: ev.id, kind: 'event', title: ev.title, time: hhmm(start) })
      }
    }

    // Routines — appear on every day in the range. (No recurrence-aware
    // filtering yet; matches the grid view's behavior.)
    for (let i = 0; i < dayCount; i++) {
      for (const r of routines) {
        const time = (r as { time_of_day?: string | null }).time_of_day ?? null
        buckets[i].push({ id: `routine-${r.id}-day${i}`, kind: 'routine', title: r.title, time })
      }
    }

    // Sort each bucket: timed items by time, then alphabetical
    for (const i of Object.keys(buckets)) {
      buckets[Number(i)].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return a.title.localeCompare(b.title)
      })
    }

    return buckets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, events, routines, weekStart, dayCount])

  const dayName = (i: number) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  const handleSelect = (item: DayItem) => {
    // Routine ids in our buckets are suffixed with -dayN; strip before dispatch
    const id = item.kind === 'routine' ? item.id.replace(/-day\d+$/, '').replace(/^routine-/, '') : item.id
    onSelectItem(id)
  }

  return (
    <div className="lg:hidden space-y-4">
      {unscheduled.length > 0 && (
        <section aria-label="Unscheduled this week">
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Unscheduled this week</h3>
          <ul className="space-y-1">
            {unscheduled.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => onSelectItem(t.id)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[14px]"
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Array.from({ length: dayCount }, (_, i) => (
        <section key={i} aria-label={dayName(i)}>
          <h3 className="text-[13px] font-medium text-neutral-700 mb-1">{dayName(i)}</h3>
          {itemsByDay[i].length === 0 ? (
            <p className="text-[12px] text-neutral-400">No items.</p>
          ) : (
            <ul className="space-y-1">
              {itemsByDay[i].map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[13px] flex items-center gap-2"
                  >
                    {item.time && (
                      <span className="text-[11px] text-neutral-400 tabular-nums w-12">{item.time}</span>
                    )}
                    <span>{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function dayIndex(d: Date, weekStartMidnight: Date): number {
  const m = new Date(d); m.setHours(0, 0, 0, 0)
  return Math.round((m.getTime() - weekStartMidnight.getTime()) / 86400000)
}

function hhmm(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
```

- [ ] **Step 4: Run mobile tests, all pass**

```bash
npx vitest src/components/home/week/WeekViewMobile.test.tsx --run 2>&1 | tail -10
```

Expected: PASS for new + existing tests.

- [ ] **Step 5: Pass dayCount on the workweek branch in HomeView**

Remove the `// TODO(Task 9)` comment in `src/components/home/HomeView.tsx` and add `dayCount={5}` to the `<WeekViewMobile>` invocation in the workweek branch.

- [ ] **Step 6: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/week/WeekViewMobile.tsx \
        src/components/home/week/WeekViewMobile.test.tsx \
        src/components/home/HomeView.tsx
git commit -m "feat(week-mobile): render events + routines per day + dayCount

WeekViewMobile previously rendered only tasks. Now merges tasks, events,
and routines per day, sorted by time then title. Also accepts dayCount
(5 for Workweek). Items show their time prefix for orientation."
```

---

## Task 10: Routine slot pre-fill via query string

**Files:**
- Modify: `src/components/home/week/SlotQuickCreatePopover.tsx` (label + onCreate behavior)
- Modify: `src/components/home/week/WeekViewV2.tsx` (handleCreate for routine)
- Modify: `src/components/routine/RoutinesListRedesign.tsx` (read prefill params, open form pre-filled)
- Test: `src/components/home/week/SlotQuickCreatePopover.test.tsx` (verify routine path produces nav)

- [ ] **Step 1: Update the popover's routine messaging**

The popover already handles `type === 'routine'` with a note about needing recurrence. Keep that. The behavior change is in `handleCreate` upstream — when the type is 'routine', navigate with prefilled params.

In `src/components/home/week/WeekViewV2.tsx`, update `handleCreate` (line 84-101):

```tsx
const handleCreate = useCallback(
  async (params: { type: CreateType; title: string; startTime: Date; endTime: Date }) => {
    if (params.type === 'task') {
      await addTask(params.title, undefined, undefined, params.startTime, { isAllDay: false })
    } else if (params.type === 'event') {
      await createEvent({
        title: params.title,
        startTime: params.startTime,
        endTime: params.endTime,
      })
    } else if (params.type === 'routine') {
      // Routines need a recurrence pattern that doesn't fit the popover.
      // Navigate to /routines with prefill query params so the page opens
      // RoutineForm pre-populated.
      const hh = params.startTime.getHours().toString().padStart(2, '0')
      const mm = params.startTime.getMinutes().toString().padStart(2, '0')
      const weekday = params.startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
      const qs = new URLSearchParams({
        prefill: '1',
        time_of_day: `${hh}:${mm}`,
        weekday,
        title: params.title,
      }).toString()
      navigate(`/routines?${qs}`)
    }
    gridCreate.close()
  },
  [addTask, createEvent, navigate, gridCreate],
)
```

- [ ] **Step 2: Update RoutinesListRedesign to read prefill params and open form**

Open `src/components/routine/RoutinesListRedesign.tsx`. Find where the page opens `RoutineForm` (look for `useState` controlling a "creating" or "showForm" flag).

```bash
grep -n "RoutineForm\|setShowForm\|isCreating\|setIsCreating" src/components/routine/RoutinesListRedesign.tsx | head -20
```

Add at the top of the component:

```tsx
import { useSearchParams } from 'react-router-dom'

// ...inside the component, after existing hooks:
const [searchParams, setSearchParams] = useSearchParams()
const prefill = searchParams.get('prefill') === '1' ? {
  title: searchParams.get('title') ?? '',
  time_of_day: searchParams.get('time_of_day') ?? '',
  weekday: searchParams.get('weekday') ?? '',
} : null

useEffect(() => {
  if (prefill) {
    setShowForm(true)  // or whatever the page uses to open the form
    // Clear query params after consuming so a refresh doesn't re-open
    const next = new URLSearchParams(searchParams)
    next.delete('prefill'); next.delete('title')
    next.delete('time_of_day'); next.delete('weekday')
    setSearchParams(next, { replace: true })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

> The actual state-flag name (`setShowForm` etc.) depends on what the page already uses — read the page first and adapt this snippet to match. If the page uses a `selectedRoutine` state and renders the form when set, set `selectedRoutine` to a sentinel new-routine object instead.

Then pass `prefill` (or the equivalent) as `initialValues` to `<RoutineForm>`. If `RoutineForm` doesn't accept initial values, add an `initialValues?: { title?: string; time_of_day?: string; weekday?: string }` prop and use it as the default state of its internal form. Keep this change minimal — one extra prop.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

In Week view, click an empty slot → popover → type "Yoga", select Routine → Create. Expected: navigates to `/routines`, RoutineForm opens with "Yoga" as title and time_of_day pre-filled.

- [ ] **Step 4: Add a popover test for routine path**

In `src/components/home/week/SlotQuickCreatePopover.test.tsx`, add:

```tsx
it('fires onCreate with type=routine when routine is selected and Create is clicked', async () => {
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  render(<SlotQuickCreatePopover
    anchorRect={{ top: 0, left: 0, width: 100, height: 60 }}
    startTime={new Date(2026, 4, 19, 9, 0)}
    endTime={new Date(2026, 4, 19, 9, 30)}
    onCreate={onCreate}
    onCancel={onCancel}
  />)
  await userEvent.click(screen.getByRole('button', { name: /routine/i }))
  await userEvent.type(screen.getByPlaceholderText(/title/i), 'Yoga')
  await userEvent.click(screen.getByRole('button', { name: /create/i }))
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'routine', title: 'Yoga' }))
})
```

Run:
```bash
npx vitest src/components/home/week/SlotQuickCreatePopover.test.tsx --run 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx \
        src/components/home/week/SlotQuickCreatePopover.test.tsx \
        src/components/routine/RoutinesListRedesign.tsx
git commit -m "feat(week): routine slot pre-fill via /routines?prefill=1

Clicking 'Routine' in the slot popover navigates to the routines page
with title, time_of_day, and weekday in the query string. The page
opens RoutineForm pre-populated. Recurrence still picked in the form."
```

---

## Task 11: Undo toasts for drag-move and click-to-create

**Files:**
- Modify: `src/components/home/week/useWeekDragDrop.ts` (accept + call pushAction)
- Modify: `src/components/home/week/WeekViewV2.tsx` (read pushAction from useUndo, pass into hook + handleCreate)

- [ ] **Step 1: Audit how useUndo + pushAction are used in HomeView**

```bash
grep -n "useUndo\|pushAction" src/components/home/HomeView.tsx | head -10
```

Confirm the signature: `pushAction(message: string, undoFn: () => void)`. WeekViewV2 will use the same.

- [ ] **Step 2: Pass pushAction into useWeekDragDrop**

In `src/components/home/week/useWeekDragDrop.ts`:

Add to `UseWeekDragDropArgs`:

```ts
/** Optional. Called after a successful drag to surface an undo toast. */
pushAction?: (message: string, undo: () => void) => void
```

In `onDragEnd`, after each successful task move, call `pushAction` with an undo that restores the previous `scheduledFor` + `endTime`. Replace the chip-drop block:

```ts
if (activeData.kind === 'chip' && activeData.taskId) {
  const task = tasks.find((t) => t.id === activeData.taskId)
  const prevScheduledFor = task?.scheduledFor ?? null
  const prevIsAllDay = task?.isAllDay ?? false
  void onUpdateTask(activeData.taskId, {
    isAllDay: false,
    scheduledFor: newStart,
    endTime: new Date(newStart.getTime() + DEFAULT_DURATION_MS),
  })
  args.pushAction?.(`Scheduled "${task?.title ?? 'task'}"`, () => {
    void onUpdateTask(activeData.taskId!, {
      isAllDay: prevIsAllDay,
      scheduledFor: prevScheduledFor as Date,
    })
  })
  return
}
```

And similarly in the block-drag-task branch — capture the prior `scheduledFor`/`endTime` before the update, push an undo that restores them.

- [ ] **Step 3: Wire pushAction in WeekViewV2**

In `src/components/home/week/WeekViewV2.tsx`, import and use `useUndo`. Match how `HomeView.tsx` does it.

```tsx
import { useUndo } from '@/hooks/useUndo'  // adjust path if different — grep first
```

```bash
grep -rn "useUndo" src/hooks/ src/contexts/ | head -5
```

Adapt the import path to whatever exists. Then inside `WeekViewV2`:

```tsx
const undo = useUndo()  // shape: { pushAction, ... }
```

> If `useUndo` is a context inside `HomeView`-local scope only and not exported from a shared spot, the cleanest path is to pass `pushAction` through as a prop on `WeekViewV2` from `HomeView`. Add `pushAction?: (msg, fn) => void` to `WeekViewV2Props` and pass it from both the `'week'` and `'workweek'` branches in `HomeView.tsx`.

Pass it into `useWeekDragDrop` and call it from `handleCreate` after successful task/event creation:

```tsx
const handleCreate = useCallback(
  async (params: { type: CreateType; title: string; startTime: Date; endTime: Date }) => {
    if (params.type === 'task') {
      const result = await addTask(params.title, undefined, undefined, params.startTime, { isAllDay: false })
      // result shape: { id } — adapt to actual return of addTask
      pushAction?.(`Created "${params.title}"`, () => {
        // Undo: delete the created task. Need a deleteTask reference here.
        // If useSupabaseTasks exposes deleteTask, call it. Otherwise leave
        // the undo as a no-op and document.
      })
    } else if (params.type === 'event') {
      // ...
    } else if (params.type === 'routine') {
      // ...
    }
    gridCreate.close()
  },
  [addTask, createEvent, navigate, gridCreate, pushAction],
)
```

> Pragmatic scope cut: the undo for create requires a delete reference for tasks and events. `useSupabaseTasks` exposes a `deleteTask` (verify with `grep -n "deleteTask" src/hooks/useSupabaseTasks.ts`); use it. For events, `useGoogleCalendar` has `deleteEvent({ eventId })`; capture the created event id from `createEvent`'s return value and undo via delete. If either function isn't readily available, ship the toast WITHOUT undo for that path and add a `// TODO: wire undo for X` comment.

- [ ] **Step 4: Manual smoke check**

```bash
npm run dev
```

- Drag a task block to a new slot → toast "Moved 'X' to Wed 1 PM. Undo" → click Undo → block returns.
- Click an empty slot → create a task "Y" → toast "Created 'Y'. Undo" → click Undo → task gone.

- [ ] **Step 5: Build + test**

```bash
npm run build 2>&1 | tail -3
npx vitest src/components/home/week --run 2>&1 | tail -5
```

Expected: build succeeds, tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/week/useWeekDragDrop.ts \
        src/components/home/week/WeekViewV2.tsx \
        src/components/home/HomeView.tsx
git commit -m "feat(week): undo toast on drag-move and click-to-create

Surfaces 'Moved/Created X. Undo' after each grid mutation. Drag-move
captures prior scheduledFor + endTime; create captures the new id and
undoes via deleteTask/deleteEvent."
```

---

## Task 12: Hide resize handles behind env flag

**Files:**
- Modify: `src/components/home/week/WeekEventBlock.tsx` (gate resize handle render)

- [ ] **Step 1: Locate the resize handle JSX**

```bash
grep -n "resize\|useBlockResize\|onResize" src/components/home/week/WeekEventBlock.tsx | head -15
```

Identify the `<div>` (or two `<div>`s) that act as the top and bottom resize hit targets.

- [ ] **Step 2: Gate them behind an env flag**

Add near the top of `WeekEventBlock.tsx`:

```tsx
const RESIZE_ENABLED = import.meta.env.VITE_WEEK_RESIZE_ENABLED === 'true'
```

Wrap each resize-handle JSX block in `{RESIZE_ENABLED && (...)}`. The `useBlockResize` hook can stay called — it's a no-op without the handles since nothing dispatches the gesture. (Or gate the hook call too; either is fine.)

Add a comment above the gate explaining why:

```tsx
// Resize handles are hidden until tasks.end_time becomes a real DB column.
// Today, drag-resizing an item appears to work visually during the gesture
// but the new endTime is silently dropped on commit (no column to persist
// it to), causing the block to revert to 30 min on next render. Re-enable
// by setting VITE_WEEK_RESIZE_ENABLED=true once the schema lands.
```

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

Hover a task block. Expected: no resize cursor on top/bottom edges. The block still drags normally.

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/week/WeekEventBlock.tsx
git commit -m "fix(week): hide resize handles until tasks.end_time exists

Gated behind VITE_WEEK_RESIZE_ENABLED. The handles worked visually but
the new endTime was silently dropped on commit (no column to persist).
Re-enable once the schema lands."
```

---

## Task 13: Extend event update edge function + UpdateEventParams to accept startTime/endTime

**Files:**
- Modify: `supabase/functions/google-calendar-create-event/index.ts` (update branch)
- Modify: `src/hooks/useGoogleCalendar.tsx` (extend `UpdateEventParams` + `updateEvent`)

- [ ] **Step 1: Extend UpdateEventParams**

In `src/hooks/useGoogleCalendar.tsx` (line 74-78):

```ts
export interface UpdateEventParams {
  eventId: string
  location?: string | null
  startTime?: Date
  endTime?: Date
  timeZone?: string
  calendarId?: string
}
```

- [ ] **Step 2: Update the `updateEvent` body to pass startTime/endTime**

In `src/hooks/useGoogleCalendar.tsx` around line 422-478, update the function body so it passes ISO strings for startTime/endTime:

```ts
const updateEvent = useCallback(async (params: UpdateEventParams): Promise<void> => {
  if (!isConnected) {
    throw new Error('Not connected to Google Calendar')
  }

  const tz = params.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data, error } = await supabase.functions.invoke('google-calendar-create-event', {
    body: {
      eventId: params.eventId,
      location: params.location,
      startTime: params.startTime?.toISOString(),
      endTime: params.endTime?.toISOString(),
      timeZone: tz,
      calendarId: params.calendarId || 'primary',
    },
  })

  if (error) { /* ...existing... */ throw error }
  if (data?.error) { /* ...existing reconnect handling... */ }
  await fetchTodayEvents()
}, [isConnected, fetchTodayEvents])
```

Preserve all existing reconnect-error handling — only add the two new fields to the body.

- [ ] **Step 3: Update the edge function update branch**

In `supabase/functions/google-calendar-create-event/index.ts` around line 103-215, in the `isUpdate` branch, accept startTime/endTime and add them to the PATCH body:

Find the destructure (line ~109):

```ts
const { eventId, location, startTime, endTime, timeZone, calendarId = 'primary' } = updateBody
```

After the `if (!eventId)` validation, build the PATCH body conditionally:

```ts
const patchBody: Record<string, unknown> = {}
if (location !== undefined) patchBody.location = location
if (startTime) patchBody.start = { dateTime: startTime, timeZone: timeZone ?? 'UTC' }
if (endTime) patchBody.end = { dateTime: endTime, timeZone: timeZone ?? 'UTC' }
// If nothing was sent to update, bail
if (Object.keys(patchBody).length === 0) {
  return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers })
}
```

Then in the existing `fetch(apiUrl, { method: 'PATCH', body: JSON.stringify(...) })` call, pass `patchBody` as the JSON body. Read the existing line and adapt — don't rewrite the entire function.

- [ ] **Step 4: Deploy the edge function**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS  # NOTE: deploy from main worktree
# Pull live token from keychain (per project notes)
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d) \
  npx supabase functions deploy google-calendar-create-event --project-ref mwadppyrqzuzgstmwpuy
cd .worktrees/week-phase-4b
```

Expected: "Deployed Function google-calendar-create-event" success message.

- [ ] **Step 5: Manual smoke check via browser console**

```bash
npm run dev
```

In the dev tools console, against a known eventId:

```js
const { updateEvent } = window.__USE_GCAL_TEST__  // expose if needed, or test via Task 14 wiring
```

> Skip console-poking. Validation happens in Task 14 once the drag wiring is connected — easier to verify end-to-end than mid-stack.

- [ ] **Step 6: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGoogleCalendar.tsx supabase/functions/google-calendar-create-event/index.ts
git commit -m "feat(gcal): updateEvent supports startTime/endTime updates

Extended UpdateEventParams + edge-function PATCH branch to accept
ISO start/end and a timeZone. Enables drag-to-reschedule on the week
grid (wired in next commit)."
```

---

## Task 14: Wire onUpdateEvent through context + event-block drag persistence

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx` (add `onUpdateEvent` field)
- Modify: `src/App.tsx` (provide `onUpdateEvent` mapped to `useGoogleCalendar.updateEvent`)
- Modify: `src/components/home/HomeView.tsx` (pass `ctx.onUpdateEvent` into WeekViewV2)
- Modify: `src/components/home/week/useWeekDragDrop.ts` (call `onUpdateEvent` for event blocks)

- [ ] **Step 1: Add the onUpdateEvent field to context**

In `src/contexts/ScheduleActionsContext.tsx`, add to the `ScheduleActionsValue` type (next to the existing event helpers, around line 51-87):

```ts
/** Reschedule a Google Calendar event (drag-to-move). Accepts new start + end. */
onUpdateEvent?: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
```

- [ ] **Step 2: Provide it from App.tsx**

In `src/App.tsx`, find the `ScheduleActionsValue` object (search for `onUpdateEventContext`):

```bash
grep -n "onUpdateEventContext" src/App.tsx
```

Add `onUpdateEvent` to the same object. It calls `useGoogleCalendar`'s `updateEvent`:

```ts
onUpdateEvent: async (eventId, { startTime, endTime }) => {
  await updateEvent({ eventId, startTime, endTime })
},
```

Make sure `updateEvent` is destructured from `useGoogleCalendar()` at the top of `App.tsx`:

```bash
grep -n "useGoogleCalendar()" src/App.tsx
```

If `updateEvent` isn't in the destructure, add it.

- [ ] **Step 3: Pass ctx.onUpdateEvent into WeekViewV2 from both branches**

In `src/components/home/HomeView.tsx`, change `onUpdateEvent={() => {}}` to `onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}` in BOTH the `week` and `workweek` branches.

- [ ] **Step 4: Use it in useWeekDragDrop's event-block branch**

In `src/components/home/week/useWeekDragDrop.ts`, replace the event-block no-op (line 90-93) with:

```ts
if (itemId.startsWith('event-')) {
  const eventId = itemId.slice('event-'.length)
  const event = events.find((ev) => ev.id === eventId)
  if (!event) return
  // Get current start/end + duration for the move
  const startStr = (event as { start_time?: string }).start_time ??
                   (event as { startTime?: string }).startTime
  const endStr = (event as { end_time?: string }).end_time ??
                 (event as { endTime?: string }).endTime
  if (!startStr || !endStr) return
  const duration = new Date(endStr).getTime() - new Date(startStr).getTime()
  const newEnd = new Date(newStart.getTime() + duration)
  void args.onUpdateEvent(eventId, { startTime: newStart, endTime: newEnd })
  args.pushAction?.(`Moved "${event.title}"`, () => {
    void args.onUpdateEvent(eventId, {
      startTime: new Date(startStr),
      endTime: new Date(endStr),
    })
  })
  return
}
```

Note: the `onUpdateEvent` type signature in `WeekViewV2Props` is `(eventId, updates: Partial<CalendarEvent>) => ...`. Update both `WeekViewV2Props` and the corresponding `UseWeekDragDropArgs` type to the new richer signature:

```ts
onUpdateEvent: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
```

- [ ] **Step 5: Manual end-to-end smoke check**

```bash
npm run dev
```

- Drag a Google Calendar event block to a new time slot.
- Watch dev tools network panel: `google-calendar-create-event` should be invoked with `startTime`/`endTime` in the body.
- After ~1 second, the event should re-render at the new time (after `fetchTodayEvents`).
- Open the real Google Calendar in another tab — the event should be at the new time there too.
- Click the Undo toast → the event reverts.

- [ ] **Step 6: Build + test**

```bash
npm run build 2>&1 | tail -3
npx vitest src/components/home/week --run 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/ScheduleActionsContext.tsx src/App.tsx \
        src/components/home/HomeView.tsx \
        src/components/home/week/useWeekDragDrop.ts \
        src/components/home/week/WeekViewV2.tsx
git commit -m "feat(week): drag-to-reschedule Google Calendar events

ScheduleActionsContext.onUpdateEvent now maps to useGoogleCalendar's
updateEvent (which supports startTime/endTime as of prior commit).
Event blocks drag and persist; undo restores the prior time."
```

---

## Task 15: Hide-routines toggle in Week header

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx` (toggle button + state + listener)
- Modify: `src/components/home/today/TodaySchedule.tsx` (or wherever Today's toggle writes the key — dispatch the custom event there too)
- Create: `src/lib/hideRoutinesSignal.ts` (small utility for the custom event)

> Why a separate file: both Today and Week need to read+write the same key AND react to in-tab changes. Centralizing keeps the contract honest.

- [ ] **Step 1: Find where Today writes `symphony-hide-routines`**

```bash
grep -rn "symphony-hide-routines" src/ --include="*.tsx" --include="*.ts" | head -10
```

Note all read + write sites.

- [ ] **Step 2: Create the signal utility**

Create `src/lib/hideRoutinesSignal.ts`:

```ts
/**
 * The `symphony-hide-routines` localStorage key holds the user's app-wide
 * preference. Native 'storage' events don't fire in the same tab that
 * wrote the value, so this util adds an in-tab custom event so other
 * views can react immediately.
 */
const KEY = 'symphony-hide-routines'
const EVENT = 'symphony-hide-routines-changed'

export function readHideRoutines(): boolean {
  try { return localStorage.getItem(KEY) === 'true' }
  catch { return false }
}

export function writeHideRoutines(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { value } }))
  } catch { /* localStorage unavailable — silent fail */ }
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onHideRoutinesChange(cb: (value: boolean) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ value: boolean }>).detail
    cb(detail?.value ?? readHideRoutines())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readHideRoutines())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
```

- [ ] **Step 3: Update Today's existing toggle to use the new util**

Find the existing toggle in `src/components/home/today/TodaySchedule.tsx` (or whatever the grep in Step 1 surfaced) and replace its `localStorage.setItem(...)` with `writeHideRoutines(...)`. Replace any read with `readHideRoutines()`.

- [ ] **Step 4: Replace WeekViewV2's hideRoutines memo with reactive state**

In `src/components/home/week/WeekViewV2.tsx`, replace the current `hideRoutines` `useMemo` (line 190-193):

```tsx
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'

// ...inside component, replace the useMemo:
const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())

useEffect(() => onHideRoutinesChange(setHideRoutines), [])
```

Update the existing `allBlocks` memo deps to include the new `hideRoutines` state (it was already there, just make sure ESLint doesn't complain).

- [ ] **Step 5: Add the toggle button to WeekViewV2's header area**

`WeekViewV2` doesn't currently render a header — the date range header lives somewhere else (probably in `HomeView` or in `WeekSummaryRow`). Find out:

```bash
grep -n "weekStart\|weekRange\|Eye\|EyeOff" src/components/home/week/WeekSummaryRow.tsx src/components/home/HomeView.tsx | head -10
```

Add the button in the cleanest available spot — likely above or alongside `<WeekSummaryRow>`. Render:

```tsx
import { Eye, EyeOff } from 'lucide-react'

// ...
<div className="flex items-center justify-end mb-2">
  <button
    type="button"
    onClick={() => writeHideRoutines(!hideRoutines)}
    title={hideRoutines ? 'Show routines' : 'Hide routines'}
    aria-label={hideRoutines ? 'Show routines' : 'Hide routines'}
    className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
  >
    {hideRoutines ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
</div>
```

Place this *inside* the `data-week-bounds` wrapper, before `<WeekSummaryRow>`.

- [ ] **Step 6: Manual cross-view smoke check**

```bash
npm run dev
```

1. On Today view, toggle "Hide routines" → routines disappear from Today.
2. Switch to Week view → routines are hidden in Week too.
3. Click the new EyeOff/Eye toggle in Week → routines reappear in Week.
4. Switch back to Today → routines are visible there too (because both views read the same source-of-truth via the listener).

- [ ] **Step 7: Build + test**

```bash
npm run build 2>&1 | tail -3
npx vitest src/components/home --run 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hideRoutinesSignal.ts \
        src/components/home/week/WeekViewV2.tsx \
        src/components/home/today/TodaySchedule.tsx
git commit -m "feat(week): hide-routines toggle in Week header + in-tab sync

Adds an Eye/EyeOff icon button to WeekViewV2's header. New
hideRoutinesSignal util centralizes the localStorage read/write and
dispatches a custom event so both Today and Week react to in-tab
changes (native 'storage' doesn't fire in the same tab)."
```

---

## Wrap-up

### Task 16: Final verification + ship

- [ ] **Step 1: Full test sweep**

```bash
npx vitest --run 2>&1 | tail -10
```

Expected: all tests pass. No regressions outside the week view (which we extended).

- [ ] **Step 2: Production build**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build. Note bundle size — should be within ~5 KB of baseline.

- [ ] **Step 3: Manual smoke matrix**

In a single `npm run dev` session, walk through:

| Surface | Action | Expected |
|---------|--------|----------|
| Switcher | Click Day / Workweek / Week / Month | Each renders correct view |
| Week | Hover left edge | Chevron-left appears |
| Week | Click chevron-left | weekStart -= 7 |
| Week | Press `]` | weekStart += 7 |
| Workweek | Same nav actions | weekStart += 5 / -= 5 |
| Week | Drag a task | Faded title chip follows pointer |
| Week | Drop task on new slot | Block lands at new slot, undo toast appears |
| Week | Click undo | Task returns to prior slot |
| Week | Click empty slot, type "X", Enter | Task created, toast "Created X. Undo" |
| Week | Click + drag down empty slots | Dashed outline grows |
| Week | Release drag-create | Popover appears, type X, Enter → task created |
| Week | Pick "Routine" in popover, type "Y", Create | Navigates to /routines, form pre-filled |
| Week | Drag a Google Calendar event | Block moves, undo toast, Google Calendar updates |
| Week | Toggle EyeOff in header | Routines vanish from grid |
| Today | Verify routines also hidden there | Confirms cross-view sync |
| Week | Hover top/bottom of a block | NO resize cursor (handles hidden) |
| Mobile (DevTools, narrow viewport) | Switch to Week | Events + routines appear under each day |
| Mobile | Switch to Workweek | Only 5 days visible |
| Right panel | Open a task detail | Panel is 380px wide, content not clipped |

- [ ] **Step 4: Push and verify deploy**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS  # main worktree for race-safe push
git fetch origin --quiet
git push origin feat/week-phase-4b:main 2>&1 | tail -5
```

Expected: push succeeds (no force, fast-forward).

Then Vercel auto-deploys main. Verify in the Vercel dashboard or:

```bash
sleep 60 && curl -sI https://symphony-os.com | head -1
```

- [ ] **Step 5: Clean up worktree**

```bash
git worktree remove .worktrees/week-phase-4b 2>&1
git worktree prune
git branch -D feat/week-phase-4b 2>&1
```

Expected: clean removal.

- [ ] **Step 6: Update vault**

Append a one-liner to `~/Documents/scotts-world/inbox/captures.md`:

```bash
echo "$(date '+%Y-%m-%d %H:%M') — Shipped Week Phase 4b: hover scrollers, Workweek view, undo toasts, mobile parity, event drag persistence, hide-routines toggle in Week. Right panel narrowed to 380px." >> ~/Documents/scotts-world/inbox/captures.md
```

---

## Summary

15 implementation tasks + setup + wrap-up. ~200 LOC across 13 files. No schema changes (one edge-function input extension). One feature flag (`VITE_WEEK_RESIZE_ENABLED`) for the deferred resize feature.

Each task is independently committable; the order is chosen so each step verifies the prior (e.g., Workweek wires before mobile-parity touches it; pushAction is added before resize-undo is needed).
