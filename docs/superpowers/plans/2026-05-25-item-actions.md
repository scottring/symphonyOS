# Item Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skip / reschedule / delete reliably discoverable on every schedule item across the main app (phone + laptop) and the kitchen wall (wall-v2), and add event time-reschedule to the detail panel.

**Architecture:** Reuse the existing mutation layer (`useActionableInstances.skip/markDone/undoDone`, `useGoogleCalendar.updateEvent/deleteEvent`, `useRoutines.deleteRoutine`, `useScheduleActions`). Add (1) a new context-aware `ScheduleItemActionsMenu` "⋯" component that replaces the hover-only row buttons, (2) an event time editor + routine delete in `DetailPanelRedesign`, and (3) a touch action sheet on wall-v2 items. Only two new context callbacks are needed (`onDeleteEvent`, `onDeleteRoutine`); `onUpdateEvent` already exists.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind v4, Vitest + React Testing Library, lucide-react icons.

**Reference spec:** `docs/superpowers/specs/2026-05-25-item-actions-design.md`

**Key facts discovered (don't re-investigate):**
- `useScheduleActionsContext()` is always available where `ScheduleItem` renders (see `StartMeetingButton`, `ScheduleItem.tsx:184`). Read actions from context, don't prop-drill.
- TimelineItem ids are prefixed: `task-…`, `event-…`, `routine-…`, plus `dinner-…` on the wall. Strip with `item.id.replace('event-', '')` etc. (pattern: `TodayView.tsx:724-729`).
- `onUpdateEvent(eventId, { startTime, endTime })` already exists in `ScheduleActionsValue` (`ScheduleActionsContext.tsx:93`) and is wired in `App.tsx:1411-1413` → `updateEvent`.
- Routine **skip** already renders in the detail panel via `ActionableActions` (`DetailPanelRedesign.tsx:2026`). The panel is missing only: event time editing and routine delete.
- `deleteRoutine` is available in `App.tsx` (destructured at `:241`); `deleteTask` (`onDeleteTask`) is already in context; `handleDeleteEvent(event: CalendarEvent)` exists at `App.tsx:1261` (handles recurring confirm + undo) but is NOT yet in context.
- Run a single test file: `npx vitest run <path>` (note: `npm test` is watch mode — never pipe it).
- PATH for tooling: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/hooks/useScheduleActions.ts` | Add `onDeleteRoutine` action (mirrors `onSkipRoutine`) | Modify |
| `src/hooks/useScheduleActions.test.ts` | Test `onDeleteRoutine` | Modify |
| `src/contexts/ScheduleActionsContext.tsx` | Declare `onDeleteEvent`, `onDeleteRoutine` | Modify |
| `src/App.tsx` | Wire `onDeleteEvent`, `onDeleteRoutine` into the context value | Modify |
| `src/components/schedule/ScheduleItemActionsMenu.tsx` | The "⋯" trigger + popover menu; reads context, renders per-type actions | Create |
| `src/components/schedule/ScheduleItemActionsMenu.test.tsx` | Unit tests for the menu | Create |
| `src/components/schedule/ScheduleItem.tsx` | Replace hover-only Skip/Push buttons with the always-visible menu | Modify |
| `src/components/detail/DetailPanelRedesign.tsx` | Event time editor (calls `onUpdateEvent`) + routine delete button | Modify |
| `src/components/wall-v2/types.ts` | Add `kind` to `WallV2TimelineEvent` | Modify |
| `src/components/wall-v2/wallV2Adapter.ts` | Populate `kind` from `item.type` | Modify |
| `src/components/wall-v2/WallV2ItemActionSheet.tsx` | Touch action sheet (Skip today / Mark done) | Create |
| `src/components/wall-v2/WallV2Shell.tsx` | Open the sheet on tap; wire skip/markDone/undo | Modify |

---

## Task 1: Add `onDeleteRoutine` to useScheduleActions

**Files:**
- Modify: `src/hooks/useScheduleActions.ts`
- Test: `src/hooks/useScheduleActions.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `describe` block inside the top-level `describe('useScheduleActions', …)` in `src/hooks/useScheduleActions.test.ts` (place it next to the existing `describe('onSkipRoutine', …)`). It follows the same setup the other blocks use (`renderHook` + the shared `makeDeps()`/mock helpers already in the file — reuse whatever the existing `onSkipRoutine` test uses for deps; the mock fn is referenced below as `deleteRoutine`).

```tsx
  describe('onDeleteRoutine', () => {
    it('calls deleteRoutine with the routine id', async () => {
      const deleteRoutine = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() =>
        useScheduleActions(makeDeps({ deleteRoutine }))
      )

      await act(async () => {
        await result.current.onDeleteRoutine('routine-1')
      })

      expect(deleteRoutine).toHaveBeenCalledWith('routine-1')
    })
  })
```

If the existing tests do not have a `makeDeps` helper, construct the deps object inline exactly like the existing `onSkipRoutine` test does, and add `deleteRoutine` to it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useScheduleActions.test.ts -t "onDeleteRoutine"`
Expected: FAIL — `result.current.onDeleteRoutine is not a function` (and a TS error that `deleteRoutine` is not in deps).

- [ ] **Step 3: Add the dep and the action**

In `src/hooks/useScheduleActions.ts`, add `deleteRoutine` to the deps interface (next to `updateRoutine`):

```tsx
interface UseScheduleActionsDeps {
  // …existing fields…
  updateRoutine: (id: string, updates: Partial<Routine>) => void
  deleteRoutine: (id: string) => Promise<void>
  // …rest unchanged…
}
```

Add `deleteRoutine` to the destructured params (next to `updateRoutine`):

```tsx
  updateRoutine,
  deleteRoutine,
```

Add the action implementation immediately after `onPushRoutine` (after line ~126):

```tsx
  const onDeleteRoutine = useCallback(async (routineId: string) => {
    await deleteRoutine(routineId)
  }, [deleteRoutine])
```

Add `onDeleteRoutine` to the returned object (next to `onPushRoutine`):

```tsx
    onSkipRoutine,
    onPushRoutine,
    onDeleteRoutine,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useScheduleActions.test.ts -t "onDeleteRoutine"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScheduleActions.ts src/hooks/useScheduleActions.test.ts
git commit -m "feat(schedule-actions): add onDeleteRoutine"
```

---

## Task 2: Expose `onDeleteEvent` + `onDeleteRoutine` on the context

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the two fields to the interface**

In `src/contexts/ScheduleActionsContext.tsx`, in the `// Event actions` block (after `onPushEvent`, ~line 50) add:

```tsx
  onDeleteEvent?: (event: CalendarEvent) => void
```

Add the `CalendarEvent` import at the top (it is not yet imported here):

```tsx
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
```

In the `// Routine actions` block (after `onPushRoutine`, ~line 46) add:

```tsx
  onDeleteRoutine?: (routineId: string) => void
```

- [ ] **Step 2: Wire both into the App context value**

In `src/App.tsx`, inside the `scheduleActionsValue = useMemo(() => ({ … }))` object:

In the `// Routine actions` group (after `onPushRoutine: scheduleActions.onPushRoutine,`) add:

```tsx
    onDeleteRoutine: scheduleActions.onDeleteRoutine,
```

In the `// Event actions` group (after `onPushEvent: scheduleActions.onPushEvent,`) add:

```tsx
    onDeleteEvent: handleDeleteEvent,
```

- [ ] **Step 3: Pass `deleteRoutine` into the `useScheduleActions(...)` call**

In `src/App.tsx` at the `useScheduleActions({ … })` call (~line 527), add `deleteRoutine` to the deps object (it is already destructured from the routines hook at `App.tsx:241`):

```tsx
    updateRoutine,
    deleteRoutine,
```

- [ ] **Step 4: Add the new value-builder deps to the `useMemo` dependency array**

In the `scheduleActionsValue` `useMemo` dependency array (the `], [ … ])` at ~line 1449-1451), ensure `handleDeleteEvent` and `scheduleActions` are present. `scheduleActions` is already listed. Add `handleDeleteEvent`:

```tsx
    addRoutine, deleteRoutine, createEvent, deleteEvent, handleDeleteEvent,
```

- [ ] **Step 5: Type-check**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors referencing `ScheduleActionsContext`, `App.tsx`, `onDeleteEvent`, or `onDeleteRoutine`.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/ScheduleActionsContext.tsx src/App.tsx
git commit -m "feat(schedule-actions): expose onDeleteEvent + onDeleteRoutine on context"
```

---

## Task 3: Create the `ScheduleItemActionsMenu` component

**Files:**
- Create: `src/components/schedule/ScheduleItemActionsMenu.tsx`
- Test: `src/components/schedule/ScheduleItemActionsMenu.test.tsx`

The menu reads handlers from `useScheduleActionsContext()` and decides which items to show from `item.type`. `Reschedule` opens the detail panel (where time editing lives) via the `onOpenDetail` prop — we don't reimplement the schedule popover here. `Skip today` and `Delete` are direct. Routine delete uses an inline two-step confirm.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/ScheduleItemActionsMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

function renderMenu(
  item: TimelineItem,
  overrides: Partial<ScheduleActionsValue> = {},
  onOpenDetail: () => void = vi.fn(),
) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    ...overrides,
  } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItemActionsMenu item={item} onOpenDetail={onOpenDetail} />
    </ScheduleActionsProvider>
  )
  // open the menu
  fireEvent.click(screen.getByLabelText('Item actions'))
  return { value, onOpenDetail }
}

const routineItem = { id: 'routine-1', type: 'routine', title: 'Trash', completed: false } as unknown as TimelineItem
const eventItem = {
  id: 'event-9', type: 'event', title: 'Dentist', completed: false,
  originalEvent: { id: '9', title: 'Dentist' },
} as unknown as TimelineItem

describe('ScheduleItemActionsMenu', () => {
  it('shows Skip today + Delete routine for a routine and fires the handlers', () => {
    const onSkipRoutine = vi.fn()
    const onDeleteRoutine = vi.fn()
    renderMenu(routineItem, { onSkipRoutine, onDeleteRoutine })

    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkipRoutine).toHaveBeenCalledWith('1')

    // re-open, then confirm delete (two-step)
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Delete routine'))
    fireEvent.click(screen.getByText('Confirm delete'))
    expect(onDeleteRoutine).toHaveBeenCalledWith('1')
  })

  it('shows Skip today + Delete for an event and fires the handlers', () => {
    const onSkipEvent = vi.fn()
    const onDeleteEvent = vi.fn()
    renderMenu(eventItem, { onSkipEvent, onDeleteEvent })

    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkipEvent).toHaveBeenCalledWith('9')

    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onDeleteEvent).toHaveBeenCalledWith(eventItem.originalEvent)
  })

  it('Reschedule opens the detail panel', () => {
    const onOpenDetail = vi.fn()
    renderMenu(eventItem, {}, onOpenDetail)
    fireEvent.click(screen.getByText('Reschedule'))
    expect(onOpenDetail).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/ScheduleItemActionsMenu.test.tsx`
Expected: FAIL — module `./ScheduleItemActionsMenu` not found.

- [ ] **Step 3: Implement the component**

Create `src/components/schedule/ScheduleItemActionsMenu.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { MoreHorizontal, Redo2, Clock, Trash2 } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'

interface Props {
  item: TimelineItem
  /** Opens the full detail panel (where reschedule/time editing lives). */
  onOpenDetail: () => void
}

export function ScheduleItemActionsMenu({ item, onOpenDetail }: Props) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const close = useCallback(() => { setOpen(false); setConfirmDelete(false) }, [])

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const isRoutine = item.type === 'routine'
  const rid = item.id.replace('routine-', '')
  const eid = item.id.replace('event-', '')

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  const run = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    close()
    fn?.()
  }

  return (
    <div className="relative shrink-0" onClick={stop}>
      <button
        type="button"
        aria-label="Item actions"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); close() }}
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 min-w-[176px] py-1
                       bg-white rounded-xl border border-neutral-200 shadow-lg"
          >
            {/* Skip today — routines and events */}
            {(isRoutine || isEvent) && !item.completed && !item.skipped && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  if (isRoutine) ctx.onSkipRoutine?.(rid)
                  else ctx.onSkipEvent?.(eid)
                })}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Redo2 className="w-4 h-4 text-neutral-400" />
                Skip today
              </button>
            )}

            {/* Reschedule — opens the detail panel */}
            <button
              type="button"
              role="menuitem"
              onClick={run(onOpenDetail)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <Clock className="w-4 h-4 text-neutral-400" />
              Reschedule
            </button>

            {/* Delete — task */}
            {isTask && ctx.onDeleteTask && item.originalTask && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onDeleteTask?.(item.originalTask!.id))}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}

            {/* Delete — event */}
            {isEvent && ctx.onDeleteEvent && item.originalEvent && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onDeleteEvent?.(item.originalEvent!))}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}

            {/* Delete routine — two-step confirm (kills it on every day) */}
            {isRoutine && ctx.onDeleteRoutine && (
              confirmDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(() => ctx.onDeleteRoutine?.(rid))}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete routine
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/ScheduleItemActionsMenu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleItemActionsMenu.tsx src/components/schedule/ScheduleItemActionsMenu.test.tsx
git commit -m "feat(schedule): add ScheduleItemActionsMenu (kebab menu for skip/reschedule/delete)"
```

---

## Task 4: Integrate the menu into `ScheduleItem`, remove hover-only gating

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`

- [ ] **Step 1: Import the menu**

Add near the other imports at the top of `src/components/schedule/ScheduleItem.tsx`:

```tsx
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'
```

- [ ] **Step 2: Replace the hover-only Skip button with the menu**

Find the Skip button block (`ScheduleItem.tsx:659-672`, the comment `{/* Skip button - for routines and events, hidden by default, shows on hover */}` through its closing `)}`). Replace the entire block with:

```tsx
        {/* Unified actions menu — always visible (touch + desktop) */}
        {variant !== 'minimal' && (isRoutine || isTask || item.type === 'event') && (
          <ScheduleItemActionsMenu item={item} onOpenDetail={onSelect} />
        )}
```

- [ ] **Step 3: Remove the now-redundant hover-only Push button**

Find the Push button block (`ScheduleItem.tsx:674` comment `{/* Push button - for tasks and routines, hover on desktop */}` through its closing `)}`). Reschedule is now reachable via the menu → detail panel, so delete this block. (If the block contains a schedule popover used elsewhere, leave any shared popover state intact; only remove the trigger button JSX.)

NOTE for the implementer: verify by reading the block first. If removing it would orphan a `showSchedule`/popover state variable that nothing else uses, also remove that state. If the popover IS still used by another affordance, keep the state and only remove the hover-gated trigger button.

- [ ] **Step 4: Type-check + run the schedule tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors in `ScheduleItem.tsx`.

Run: `npx vitest run src/components/schedule`
Expected: PASS (existing ScheduleItem/Today tests still green; no test depended on the removed hover buttons — if one does, update it to query the menu instead).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx
git commit -m "feat(schedule): use always-visible actions menu on rows (touch-friendly)"
```

---

## Task 5: Detail panel — event time editor + routine delete

**Files:**
- Modify: `src/components/detail/DetailPanelRedesign.tsx`

### 5a — Event time editing

Today the time pill only opens the picker for tasks (`:1518-1520`), and the picker render is `isTask`-gated (`:3313`). Add an event path that reuses the existing `onUpdateEvent` context value.

- [ ] **Step 1: Confirm the prop is available**

`DetailPanelRedesign` already receives event update via context or props. Read the component's props and how it gets schedule actions. If `onUpdateEvent` is not already in scope, pull it from context at the top of the component body:

```tsx
  const { onUpdateEvent } = useScheduleActionsContext()
```

(`useScheduleActionsContext` is imported in this file already if `ActionableActions`/context is used; if not, add `import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'`.)

- [ ] **Step 2: Make the time pill open the picker for events too**

At `DetailPanelRedesign.tsx:1520`, change:

```tsx
                  onClick={() => isTask && setShowTimePicker(!showTimePicker)}
```

to:

```tsx
                  onClick={() => (isTask || (isEvent && !item.allDay)) && setShowTimePicker(!showTimePicker)}
```

- [ ] **Step 3: Add an event time-picker render block**

Immediately after the existing task time-picker block (`{showTimePicker && isTask && item.originalTask && ( … )}` ending near `:3383`), add an event variant. It reuses the same date/time inputs pattern; on save it computes a new start and preserves the original duration, then calls `onUpdateEvent`.

```tsx
      {showTimePicker && isEvent && !item.allDay && item.startTime && onUpdateEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
             onClick={() => setShowTimePicker(false)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl p-5 safe-area-bottom"
               onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-neutral-700 mb-3">Reschedule event</div>
            <input
              type="datetime-local"
              defaultValue={toLocalInputValue(item.startTime)}
              className="w-full p-3 rounded-xl border border-neutral-200 text-sm"
              onChange={(e) => {
                const newStart = new Date(e.target.value)
                if (isNaN(newStart.getTime())) return
                const durationMs = (item.endTime?.getTime() ?? item.startTime!.getTime() + 30 * 60_000) - item.startTime!.getTime()
                const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id || item.id.replace('event-', '')
                void onUpdateEvent(eventId, { startTime: newStart, endTime: new Date(newStart.getTime() + durationMs) })
                setShowTimePicker(false)
              }}
            />
            <button
              type="button"
              onClick={() => setShowTimePicker(false)}
              className="mt-3 w-full p-3 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
```

Add this helper near the top of the file (module scope, after imports), if no equivalent already exists:

```tsx
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
```

### 5b — Routine delete

- [ ] **Step 4: Pull `onDeleteRoutine` from context**

Where the component reads context (same place as 5a Step 1), include it:

```tsx
  const { onUpdateEvent, onDeleteRoutine } = useScheduleActionsContext()
```

- [ ] **Step 5: Add a routine delete button**

Find the routine settings section (`DetailPanelRedesign.tsx:2045`, `{isRoutine && item.originalRoutine && onUpdateRoutine && ( … )}`). After that block's closing `)}`, add a delete affordance with a two-step confirm. Add the state near the other `useState`s at the top of the component:

```tsx
  const [showRoutineDeleteConfirm, setShowRoutineDeleteConfirm] = useState(false)
```

JSX to add after the routine settings block:

```tsx
      {isRoutine && item.originalRoutine && onDeleteRoutine && (
        <div className="p-6 safe-area-bottom">
          {showRoutineDeleteConfirm ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRoutineDeleteConfirm(false)}
                className="flex-1 p-3 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteRoutine(item.originalRoutine!.id); onClose?.() }}
                className="flex-1 p-3 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete routine
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowRoutineDeleteConfirm(true)}
              className="w-full p-3 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors text-center"
            >
              Delete routine
            </button>
          )}
          <p className="mt-2 text-xs text-neutral-400 text-center">
            Removes this routine from every day. To skip just today, use Skip above.
          </p>
        </div>
      )}
```

NOTE: `onClose` is the panel's close callback — confirm its exact prop name by reading the component signature and use that (it may be `onClose` or similar). If the panel uses a different close mechanism, call that instead.

- [ ] **Step 6: Type-check**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors in `DetailPanelRedesign.tsx`.

- [ ] **Step 7: Run detail-panel tests**

Run: `npx vitest run src/components/detail`
Expected: PASS (existing tests green).

- [ ] **Step 8: Commit**

```bash
git add src/components/detail/DetailPanelRedesign.tsx
git commit -m "feat(detail): reschedule event time + delete routine from the panel"
```

---

## Task 6: Wall (wall-v2) — tap → action sheet with Skip / Mark done

**Files:**
- Modify: `src/components/wall-v2/types.ts`
- Modify: `src/components/wall-v2/wallV2Adapter.ts`
- Create: `src/components/wall-v2/WallV2ItemActionSheet.tsx`
- Modify: `src/components/wall-v2/WallV2Shell.tsx`

### 6a — Carry item kind to the view

- [ ] **Step 1: Add `kind` to the type**

In `src/components/wall-v2/types.ts`, in `interface WallV2TimelineEvent`, add after `completed?: boolean;`:

```tsx
  /** Source item type, so the wall action sheet can pick the right entity/actions. */
  kind?: 'task' | 'event' | 'routine';
```

- [ ] **Step 2: Populate `kind` in the adapter**

In `src/components/wall-v2/wallV2Adapter.ts`, find the timeline-event mapping where `id: item.id` is set (~line 162). Add alongside it:

```tsx
      kind: item.type,
```

- [ ] **Step 3: Type-check**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors. (If `wallV2Adapter.test.ts` asserts exact object shape, update its expectations to include `kind`.)

Run: `npx vitest run src/components/wall-v2/wallV2Adapter.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/types.ts src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall-v2): carry item kind onto timeline events"
```

### 6b — The action sheet

- [ ] **Step 5: Write the failing test**

Create `src/components/wall-v2/WallV2ItemActionSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallV2ItemActionSheet } from './WallV2ItemActionSheet'
import { Calendar } from 'lucide-react'
import type { WallV2TimelineEvent } from './types'

const routine: WallV2TimelineEvent = { id: 'routine-1', icon: Calendar, tint: 'sage', title: 'Trash', kind: 'routine' }
const event: WallV2TimelineEvent = { id: 'event-9', icon: Calendar, tint: 'sky', title: 'Dentist', kind: 'event' }

describe('WallV2ItemActionSheet', () => {
  it('routine: Skip today + Mark done fire with id+kind', () => {
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onClose = vi.fn()
    render(<WallV2ItemActionSheet event={routine} onSkip={onSkip} onMarkDone={onMarkDone} onClose={onClose} />)
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('routine-1', 'routine')
    fireEvent.click(screen.getByText('Mark done'))
    expect(onMarkDone).toHaveBeenCalledWith('routine-1', 'routine')
  })

  it('event: shows Skip today, not Mark done', () => {
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onClose = vi.fn()
    render(<WallV2ItemActionSheet event={event} onSkip={onSkip} onMarkDone={onMarkDone} onClose={onClose} />)
    expect(screen.queryByText('Mark done')).toBeNull()
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('event-9', 'event')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2ItemActionSheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the sheet**

Create `src/components/wall-v2/WallV2ItemActionSheet.tsx`:

```tsx
import { Redo2, Check, X } from 'lucide-react'
import type { WallV2TimelineEvent } from './types'

interface Props {
  event: WallV2TimelineEvent
  /** (id, kind) — id keeps its prefix; the shell strips it for the entity call. */
  onSkip: (id: string, kind: 'event' | 'routine') => void
  onMarkDone: (id: string, kind: 'event' | 'routine') => void
  onClose: () => void
}

export function WallV2ItemActionSheet({ event, onSkip, onMarkDone, onClose }: Props) {
  const kind = event.kind === 'routine' ? 'routine' : 'event'

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

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2ItemActionSheet.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/components/wall-v2/WallV2ItemActionSheet.tsx src/components/wall-v2/WallV2ItemActionSheet.test.tsx
git commit -m "feat(wall-v2): add touch action sheet (Skip today / Mark done)"
```

### 6c — Wire the sheet into the shell

- [ ] **Step 10: Wire state + handlers in WallV2Shell**

In `src/components/wall-v2/WallV2Shell.tsx`:

Add the imports:

```tsx
import { WallV2ItemActionSheet } from './WallV2ItemActionSheet';
import { useActionableInstances } from '@/hooks/useActionableInstances';
```

Add the hook + sheet state near the other hooks/state (after `const wallData = useWallData();`):

```tsx
  const { skip, markDone, undoDone } = useActionableInstances();
  const [actionSheetItem, setActionSheetItem] = useState<WallV2TimelineEvent | null>(null);
```

Add `WallV2TimelineEvent` to the existing `./types` import.

- [ ] **Step 11: Open the sheet on tap (routine/event), keep recipe behavior**

Replace the body of `handleTapEvent` (`WallV2Shell.tsx:234-246`) so dinner/recipe cards keep their current behavior and other routine/event cards open the sheet:

```tsx
  const handleTapEvent = useCallback((id: string) => {
    if (id.startsWith('dinner-')) {
      if (recipeUrl) setShowRecipeViewer(true);
      else showFlash(`Tonight: ${dinnerMealName}`);
      return;
    }
    const tapped = timeline.flatMap((s) => s.events).find((e) => e.id === id);
    if (!tapped) return;
    if (tapped.kind === 'routine' || tapped.kind === 'event') {
      setActionSheetItem(tapped);
    } else {
      showFlash(tapped.title);
    }
  }, [recipeUrl, dinnerMealName, timeline, showFlash]);
```

- [ ] **Step 12: Add the skip/done handlers and render the sheet**

Add handlers (near the other `useCallback`s):

```tsx
  const today = now;

  const handleWallSkip = useCallback(async (id: string, kind: 'event' | 'routine') => {
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await skip(entityType, entityId, today);
    wallData.refetch();
    showFlash('Skipped for today');
  }, [skip, today, wallData, showFlash]);

  const handleWallMarkDone = useCallback(async (id: string, kind: 'event' | 'routine') => {
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await markDone(entityType, entityId, today);
    wallData.refetch();
    showFlash('Marked done');
  }, [markDone, today, wallData, showFlash]);
```

(`undoDone` is imported for parity with the rest of the app; wiring an undo flash button is optional and out of scope for this pass.)

Render the sheet in the overlays section (next to the other overlays, e.g. after the `WallRecipeViewer` block):

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

- [ ] **Step 13: Type-check + wall tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors in `WallV2Shell.tsx`.

Run: `npx vitest run src/components/wall-v2`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall-v2): tap a timeline item to skip/mark-done via action sheet"
```

---

## Task 7: Full verification

- [ ] **Step 1: Full build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run build`
Expected: TypeScript passes (`tsc -b` is stricter than the pre-push `--noEmit`) and Vite build succeeds.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: green except the pre-existing known failures (NotesPage, TodayView, useSpaces) — no NEW failures introduced by this work.

- [ ] **Step 3: Manual smoke (dev server)**

Run `npm run dev` and verify:
- Main app on a narrow/touch viewport: every task/event/routine row shows a "⋯" button (no hover needed). Open it → Skip today (routine/event), Reschedule (opens panel), Delete (task/event), Delete routine (two-step confirm).
- Detail panel: open an event → tap the time pill → reschedule; open a routine → Delete routine (with the "skip just today" hint) and the existing Skip control.
- Wall-v2 at 1024×768: tap a routine → Skip today / Mark done; tap a normal event → Skip today; the item disappears after action; dinner card still opens the recipe viewer.

- [ ] **Step 4: Push (deploys to prod)**

Only after Steps 1-3 pass:

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
git push origin HEAD:main
```

(Pre-push hook runs `tsc --noEmit` + unit tests on the `main` push.)

---

## Self-Review notes

- **Spec coverage:** ⋯ menu (Tasks 3-4); detail-panel event reschedule + routine delete (Task 5); wall skip/done for routines + events (Task 6); routine deletion behind confirm (Tasks 3 & 5); no schema/hook changes beyond `onDeleteRoutine`/`onDeleteEvent` context plumbing (Tasks 1-2). Routine skip in the panel already existed (`ActionableActions`) and is left as-is — spec's "routine action section" is satisfied by the existing skip + the new delete.
- **Deviation from spec (flagged):** the menu's "Reschedule" / "Move to date" open the detail panel rather than reimplementing an inline scheduler — avoids duplicating the existing schedule popover and keeps one source of truth for time editing. Direct quick actions in the menu are Skip today + Delete (the genuinely-missing-on-touch ones).
- **Type consistency:** `onDeleteRoutine(routineId: string)`, `onDeleteEvent(event: CalendarEvent)`, `onUpdateEvent(eventId, {startTime,endTime})` used identically across context, App wiring, menu, and panel. Wall sheet uses `(id, kind)` and the shell strips the prefix before calling `skip/markDone`.
