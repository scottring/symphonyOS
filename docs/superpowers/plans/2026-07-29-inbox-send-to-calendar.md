# Send to Calendar (Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "send to calendar" action to `/inbox` items that converts a task into a real Google Calendar event — day, time, and duration — deleting the task only after Google confirms the write.

**Architecture:** One new hook (`useSendToCalendar`) owns the whole conversion and is the only place that deletes a task. `SchedulePopover` gains an opt-in duration row rather than being forked. `InboxView` renders a single popover shared by both inbox modes, keyed on a `calendarTaskId` state — the exact pattern already used for the note picker.

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, Supabase edge functions (`google-calendar-create-event`), Tailwind v4.

## Global Constraints

- **Work in the existing worktree** `.worktrees/inbox-send-to-calendar` on branch `inbox-send-to-calendar`. Never edit or commit in the main worktree.
- **No emojis in UI.** Use `<ConceptIcon name="when" />` (lucide `Calendar`) — see `src/lib/conceptIcons.tsx:9`.
- **Run tests with `npx vitest run <path>`.** Plain `npm test` is watch mode and will hang.
- Node must be on the repo's version: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"`.
- `src/test/setup.ts:59` globally mocks `@/hooks/useGoogleCalendar` with `isConnected: false`. Any test needing a connected calendar **must** declare its own `vi.mock('@/hooks/useGoogleCalendar', …)` at module scope.
- Path alias `@/` → `src/`.
- Run `npm run lint` before the final push — CI lints, the pre-push hook does not.

## Two corrections to the spec, already applied below

1. **Focus-mode keyboard key is `e`, not `c`.** `c` is already bound to Complete at `FocusInboxCard.tsx:74-75`.
2. **No `requestId`.** The spec called for one as an idempotency key. Google retains the IDs of deleted events, so a deterministic ID would make the flow *send → Undo → send again at the same time* fail with a 409 that `google-calendar-create-event/index.ts:393` resolves by returning the **cancelled** event as a success. An in-flight ref guard prevents the double-tap this was meant to stop, without that failure mode.

---

### Task 1: `useSendToCalendar` — the conversion

**Files:**
- Create: `src/hooks/useSendToCalendar.ts`
- Test: `src/hooks/useSendToCalendar.test.ts`

**Interfaces:**
- Consumes: `useGoogleCalendar()` (`createEvent`, `deleteEvent`, `isConnected`), `useCalendarDomainMappings()` (`getCalendarForDomain`), and a `deleteTask` function passed by the caller.
- Produces:
  - `buildEventDescription(task: Task): string | undefined`
  - `useSendToCalendar(deleteTask: (id: string) => void | Promise<void>)` returning
    `{ sendToCalendar, undoSend, sendingTaskId }`
  - `sendToCalendar(task: Task, when: SendToCalendarWhen): Promise<SendToCalendarResult>`
  - `undoSend(eventId: string, calendarId?: string): Promise<void>`
  - types `SendToCalendarWhen`, `SendToCalendarResult`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useSendToCalendar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Task } from '@/types/task'

const createEvent = vi.fn()
const deleteEvent = vi.fn()

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: true, createEvent, deleteEvent }),
  CalendarReconnectError: class CalendarReconnectError extends Error {},
}))

vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({
    getCalendarForDomain: (domain?: string | null) =>
      domain === 'family'
        ? { calendarId: 'fam@group.calendar.google.com', calendarName: 'Family' }
        : null,
  }),
}))

import { useSendToCalendar, buildEventDescription } from './useSendToCalendar'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Dentist appointment',
    completed: false,
    createdAt: new Date('2026-07-29T00:00:00Z'),
    updatedAt: new Date('2026-07-29T00:00:00Z'),
    bucket: 'inbox',
    context: 'family',
    ...overrides,
  } as Task
}

const START = new Date('2026-07-30T14:00:00')

describe('buildEventDescription', () => {
  it('returns undefined when the task has no context to carry', () => {
    expect(buildEventDescription(makeTask())).toBeUndefined()
  })

  it('carries notes, phone number and links', () => {
    const description = buildEventDescription(
      makeTask({
        notes: 'Bring the insurance card',
        phoneNumber: '555-0100',
        links: [{ url: 'https://dentist.example/portal', title: 'Portal' }],
      }),
    )
    expect(description).toContain('Bring the insurance card')
    expect(description).toContain('555-0100')
    expect(description).toContain('Portal: https://dentist.example/portal')
  })
})

describe('useSendToCalendar', () => {
  beforeEach(() => {
    createEvent.mockReset()
    deleteEvent.mockReset()
  })

  it('creates the event on the domain-mapped calendar, then deletes the task', async () => {
    createEvent.mockResolvedValue({ id: 'evt-1' })
    const deleteTask = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), {
        start: START,
        durationMinutes: 30,
      })
    })

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dentist appointment',
        calendarId: 'fam@group.calendar.google.com',
        startTime: START,
        endTime: new Date(START.getTime() + 30 * 60000),
      }),
    )
    expect(deleteTask).toHaveBeenCalledWith('task-1')
    expect(outcome).toEqual({
      ok: true,
      eventId: 'evt-1',
      calendarId: 'fam@group.calendar.google.com',
      calendarName: 'Family',
    })
  })

  it('does NOT delete the task when Google rejects the write with 403', async () => {
    const err = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { status: 403 } as Response,
    })
    createEvent.mockRejectedValue(err)
    const deleteTask = vi.fn()
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), { start: START })
    })

    expect(deleteTask).not.toHaveBeenCalled()
    expect(outcome).toEqual({ ok: false, reason: 'read-only' })
  })

  it('does NOT delete the task on any other failure', async () => {
    createEvent.mockRejectedValue(new Error('network down'))
    const deleteTask = vi.fn()
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), { start: START })
    })

    expect(deleteTask).not.toHaveBeenCalled()
    expect(outcome).toEqual({ ok: false, reason: 'failed' })
  })

  it('defaults to a 60 minute event and falls back to the default calendar', async () => {
    createEvent.mockResolvedValue({ id: 'evt-2' })
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    await act(async () => {
      await result.current.sendToCalendar(makeTask({ context: 'work' }), { start: START })
    })

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: undefined,
        endTime: new Date(START.getTime() + 60 * 60000),
      }),
    )
  })

  it('sends an all-day event when allDay is set', async () => {
    createEvent.mockResolvedValue({ id: 'evt-3' })
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    await act(async () => {
      await result.current.sendToCalendar(makeTask(), { start: START, allDay: true })
    })

    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ allDay: true }))
  })

  it('undoSend deletes the created event', async () => {
    deleteEvent.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    await act(async () => {
      await result.current.undoSend('evt-1', 'fam@group.calendar.google.com')
    })

    expect(deleteEvent).toHaveBeenCalledWith({
      eventId: 'evt-1',
      calendarId: 'fam@group.calendar.google.com',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useSendToCalendar.test.ts`
Expected: FAIL — `Failed to resolve import "./useSendToCalendar"`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useSendToCalendar.ts`:

```ts
import { useCallback, useRef, useState } from 'react'
import { useGoogleCalendar, CalendarReconnectError } from '@/hooks/useGoogleCalendar'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import type { Task } from '@/types/task'

export interface SendToCalendarWhen {
  start: Date
  /** Minutes. Defaults to 60. Ignored when `allDay` is true. */
  durationMinutes?: number
  allDay?: boolean
}

export type SendFailureReason = 'read-only' | 'not-connected' | 'failed'

export type SendToCalendarResult =
  | { ok: true; eventId: string; calendarId?: string; calendarName: string }
  | { ok: false; reason: SendFailureReason }

const DEFAULT_DURATION_MINUTES = 60
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** The task is destroyed by the conversion, so its rich context moves into the
 *  event body — the one place Google will still show it. */
export function buildEventDescription(task: Task): string | undefined {
  const parts: string[] = []
  if (task.notes?.trim()) parts.push(task.notes.trim())
  if (task.phoneNumber?.trim()) parts.push(`Phone: ${task.phoneNumber.trim()}`)
  if (task.links?.length) {
    parts.push(task.links.map((l) => (l.title ? `${l.title}: ${l.url}` : l.url)).join('\n'))
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/** A Google 403 arrives as a FunctionsHttpError whose `context` is the raw
 *  Response — the edge function forwards Google's status verbatim
 *  (google-calendar-create-event/index.ts:418). */
function classifyFailure(err: unknown): SendFailureReason {
  if (err instanceof CalendarReconnectError) return 'not-connected'
  const context = (err as { context?: { status?: number } })?.context
  if (context?.status === 403) return 'read-only'
  return 'failed'
}

export function useSendToCalendar(deleteTask: (id: string) => void | Promise<void>) {
  const { isConnected, createEvent, deleteEvent } = useGoogleCalendar()
  const { getCalendarForDomain } = useCalendarDomainMappings()

  const [sendingTaskId, setSendingTaskId] = useState<string | null>(null)
  // Ref, not state: a double-tap fires both handlers in the same tick, before
  // any re-render could reflect the state change.
  const inFlight = useRef(false)

  const sendToCalendar = useCallback(
    async (task: Task, when: SendToCalendarWhen): Promise<SendToCalendarResult> => {
      if (!isConnected) return { ok: false, reason: 'not-connected' }
      if (inFlight.current) return { ok: false, reason: 'failed' }

      inFlight.current = true
      setSendingTaskId(task.id)

      const target = getCalendarForDomain(task.context)
      const start = when.start
      const end = when.allDay
        ? new Date(start.getTime() + ONE_DAY_MS)
        : new Date(start.getTime() + (when.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60000)

      try {
        const created = await createEvent({
          title: task.title,
          description: buildEventDescription(task),
          startTime: start,
          endTime: end,
          allDay: when.allDay,
          location: task.location,
          calendarId: target?.calendarId,
        })

        // Only now is it safe to destroy the task.
        await deleteTask(task.id)

        return {
          ok: true,
          eventId: created.id,
          calendarId: target?.calendarId,
          calendarName: target?.calendarName ?? 'your calendar',
        }
      } catch (err) {
        console.error('Failed to send task to calendar:', err)
        return { ok: false, reason: classifyFailure(err) }
      } finally {
        inFlight.current = false
        setSendingTaskId(null)
      }
    },
    [isConnected, createEvent, getCalendarForDomain, deleteTask],
  )

  const undoSend = useCallback(
    async (eventId: string, calendarId?: string): Promise<void> => {
      try {
        await deleteEvent({ eventId, calendarId })
      } catch (err) {
        console.error('Failed to remove the event during undo:', err)
      }
    },
    [deleteEvent],
  )

  return { sendToCalendar, undoSend, sendingTaskId }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useSendToCalendar.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/hooks/useSendToCalendar.ts src/hooks/useSendToCalendar.test.ts
git commit -m "feat(inbox): add useSendToCalendar conversion hook

Writes the Google event first and deletes the task only on confirmed
success, so a 403 on a read-only shared calendar can never lose an item."
```

---

### Task 2: Duration row in `SchedulePopover`

**Files:**
- Modify: `src/components/triage/SchedulePopover.tsx` (props at `:28-46`, `handleTimeSelect` at `:301`, `handleCustomTimeSelect` at `:315`, time step render at `:602`)
- Test: `src/components/triage/SchedulePopover.duration.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `SchedulePopoverProps` gains `showDuration?: boolean`; `onSchedule` widens to `(date: Date, isAllDay: boolean, durationMinutes?: number) => void`. Task 3 relies on both.

Widening the callback is backward-compatible — the other 17 `onSchedule` call sites across 10 files pass two-argument handlers and need no change.

- [ ] **Step 1: Write the failing test**

Create `src/components/triage/SchedulePopover.duration.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchedulePopover } from './SchedulePopover'

function openToTimeStep() {
  fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
  fireEvent.click(screen.getByText('Tomorrow'))
}

describe('SchedulePopover duration row', () => {
  it('is hidden by default', () => {
    render(<SchedulePopover onSchedule={vi.fn()} trigger={<span>Schedule</span>} />)
    openToTimeStep()
    expect(screen.queryByRole('group', { name: /duration/i })).not.toBeInTheDocument()
  })

  it('passes the selected duration as the third argument', () => {
    const onSchedule = vi.fn()
    render(<SchedulePopover showDuration onSchedule={onSchedule} trigger={<span>Schedule</span>} />)
    openToTimeStep()

    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    fireEvent.click(screen.getByText('2:00 PM'))

    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date), false, 30)
  })

  it('defaults to 60 minutes when the row is shown but untouched', () => {
    const onSchedule = vi.fn()
    render(<SchedulePopover showDuration onSchedule={onSchedule} trigger={<span>Schedule</span>} />)
    openToTimeStep()

    fireEvent.click(screen.getByText('2:00 PM'))

    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date), false, 60)
  })
})
```

If the trigger's accessible name or the time-preset label text differs from the above once you open the file, adjust the queries to match the real markup — do not change the assertions about `onSchedule`'s arguments.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/triage/SchedulePopover.duration.test.tsx`
Expected: FAIL — the `30m` button is not found.

- [ ] **Step 3: Add the prop and state**

In `SchedulePopover.tsx`, extend the props interface (currently `:28-46`):

```tsx
interface SchedulePopoverProps {
  value?: Date
  isAllDay?: boolean
  /** `durationMinutes` is only supplied when `showDuration` is set. */
  onSchedule: (date: Date, isAllDay: boolean, durationMinutes?: number) => void
  onClear?: () => void
  trigger?: React.ReactNode
  scheduleItems?: ScheduleContextItem[]
  getItemsForDate?: (date: Date) => ScheduleContextItem[]
  skipToTime?: boolean
  itemTitle?: string
  onDefer?: (target: 'week' | 'month' | 'quarter') => void
  /** Renders a duration chip row on the time step and reports the choice as
   *  `onSchedule`'s third argument. Used when the picker feeds a real calendar
   *  event rather than a task's scheduled date. */
  showDuration?: boolean
}
```

Add `showDuration = false` to the destructured params, and near the other `useState` calls (around `:209`):

```tsx
const DURATION_OPTIONS = [30, 60, 90, 120] as const
const [durationMinutes, setDurationMinutes] = useState<number>(60)
```

Put `DURATION_OPTIONS` at module scope alongside `TIME_OPTIONS` (`:90`), not inside the component.

Reset it in the existing `handleClose` (`:281`):

```tsx
const handleClose = useCallback(() => {
  setIsOpen(false)
  setStep('date')
  setSelectedDate(null)
  setCustomTimeSearch('')
  setHighlightedIndex(-1)
  setDurationMinutes(60)
}, [])
```

- [ ] **Step 4: Pass the duration through both confirm paths**

Replace `handleTimeSelect` and `handleCustomTimeSelect` (`:301-322`):

```tsx
const handleTimeSelect = (hour: number | 'all-day') => {
  if (!selectedDate) return

  const finalDate = new Date(selectedDate)
  if (hour === 'all-day') {
    finalDate.setHours(0, 0, 0, 0)
    onSchedule(finalDate, true, showDuration ? durationMinutes : undefined)
  } else {
    finalDate.setHours(hour, 0, 0, 0)
    onSchedule(finalDate, false, showDuration ? durationMinutes : undefined)
  }
  handleClose()
}

const handleCustomTimeSelect = (timeValue: string) => {
  if (!selectedDate || !timeValue) return
  const [hours, minutes] = timeValue.split(':').map(Number)
  const finalDate = new Date(selectedDate)
  finalDate.setHours(hours, minutes, 0, 0)
  onSchedule(finalDate, false, showDuration ? durationMinutes : undefined)
  handleClose()
}
```

- [ ] **Step 5: Render the duration row**

Inside the `{step === 'time' && (` block (`:602`), as the first child of its content wrapper:

```tsx
{showDuration && (
  <div
    role="group"
    aria-label="Duration"
    className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-100"
  >
    <span className="text-xs text-neutral-500 mr-1">For</span>
    {DURATION_OPTIONS.map((minutes) => (
      <button
        key={minutes}
        type="button"
        onClick={() => setDurationMinutes(minutes)}
        className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
          durationMinutes === minutes
            ? 'bg-primary-100 text-primary-800'
            : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        {minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`}
      </button>
    ))}
  </div>
)}
```

Match the surrounding markup's wrapper element if the time step nests its content differently — the row must sit above the time presets, inside the same scroll container.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/triage/SchedulePopover.duration.test.tsx`
Expected: PASS — 3 tests.

Then confirm nothing else regressed:

Run: `npx vitest run src/components/triage src/components/schedule`
Expected: PASS.

- [ ] **Step 7: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/triage/SchedulePopover.tsx src/components/triage/SchedulePopover.duration.test.tsx
git commit -m "feat(triage): opt-in duration row on SchedulePopover

onSchedule widens to (date, isAllDay, durationMinutes?) — additive, so the
other 17 two-argument call sites are untouched."
```

---

### Task 3: Wire list mode — quick action, popover, undo

**Files:**
- Modify: `src/components/schedule/DenseInboxRow.tsx` (`QuickAction` union `:12-20`, `ACTION_LABELS` `:22-31`, chip render near `:286`)
- Modify: `src/components/schedule/InboxView.tsx` (`INBOX_ACTIONS` `:24`, `restoreTask` `:126`, `onQuickAction` `:430`, `InboxUndoToast` mount `:550`)
- Test: `src/components/schedule/InboxSendToCalendar.test.tsx` (create)

**Interfaces:**
- Consumes: `useSendToCalendar(deleteTask)` → `{ sendToCalendar, undoSend, sendingTaskId }`, and `SchedulePopover`'s `showDuration` prop with the widened `onSchedule` (Tasks 1 and 2).
- Produces: `QuickAction` gains `{ kind: 'calendar' }`. Task 4 relies on `InboxView`'s `openCalendarPicker(taskId)` handler being reachable from focus mode.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/InboxSendToCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import type { Task } from '@/types/task'

const task = {
  id: 'task-1',
  title: 'Dentist appointment',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  bucket: 'inbox',
  context: 'family',
} as Task

const ACTIONS: QuickAction[] = [{ kind: 'calendar' }]

describe('DenseInboxRow calendar quick action', () => {
  it('renders a Calendar chip and reports the action without firing it', () => {
    const onQuickAction = vi.fn()
    render(
      <DenseInboxRow
        task={task}
        familyMembers={[]}
        quickActions={ACTIONS}
        onQuickAction={onQuickAction}
        onToggleComplete={vi.fn()}
        onUpdate={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'calendar' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/schedule/InboxSendToCalendar.test.tsx`
Expected: FAIL — no button named "Send to calendar".

- [ ] **Step 3: Add the quick action to `DenseInboxRow`**

Extend the union (`:12-20`) and labels (`:22-31`):

```tsx
export type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }
  | { kind: 'note' }
  | { kind: 'calendar' }
  | { kind: 'complete' }
  | { kind: 'delete' }

const ACTION_LABELS: Record<QuickAction['kind'], string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  someday: 'Someday',
  'next-week': 'Next Week',
  note: 'Note',
  calendar: 'Calendar',
  complete: 'Done',
  delete: 'Delete',
}
```

In the chip renderer, directly above the `if (action.kind === 'delete')` branch (`:298`), add a branch mirroring the `note` one (`:286-296`):

```tsx
if (action.kind === 'calendar') {
  return (
    <button
      key="calendar"
      type="button"
      aria-label="Send to calendar"
      onClick={() => onQuickAction(action)}
      className="text-xs px-2.5 py-1 rounded-md font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
    >
      <ConceptIcon name="when" decorative /> Calendar
    </button>
  )
}
```

`ConceptIcon` is already imported in this file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/schedule/InboxSendToCalendar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the popover and undo in `InboxView`**

Add to the imports:

```tsx
import { SchedulePopover } from '@/components/triage'
import { useSendToCalendar } from '@/hooks/useSendToCalendar'
import { showToast } from '@/hooks/useToast'
```

`showToast(message, type)` is a plain module-level function, not a hook (`useToast.ts:29`) — call it directly, as `RescheduleButton.tsx:14` does.

Add `{ kind: 'calendar' }` to `INBOX_ACTIONS` (`:24`), between `note` and `delete`:

```tsx
const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' },
  { kind: 'note' }, { kind: 'calendar' }, { kind: 'delete' }
]
```

Add state and the send handler near `notePickerTaskId` (`:127`):

```tsx
const [calendarTaskId, setCalendarTaskId] = useState<string | null>(null)

const { sendToCalendar, undoSend } = useSendToCalendar((id) => onDeleteTask?.(id))

const handleSendToCalendar = useCallback(
  async (task: Task, start: Date, isAllDay: boolean, durationMinutes?: number) => {
    const snapshot = { ...task }
    setCalendarTaskId(null)

    const outcome = await sendToCalendar(task, {
      start,
      allDay: isAllDay || undefined,
      durationMinutes,
    })

    if (!outcome.ok) {
      showToast(
        outcome.reason === 'read-only'
          ? 'That calendar is shared read-only — the item is still in your inbox.'
          : outcome.reason === 'not-connected'
            ? 'Google Calendar isn’t connected — the item is still in your inbox.'
            : 'Couldn’t reach Google Calendar — the item is still in your inbox.',
        'error',
      )
      return
    }

    setUndo({
      taskId: snapshot.id,
      message: `Sent to ${outcome.calendarName}`,
      previous: {},
      undoable: true,
      onUndoExtra: async () => {
        await undoSend(outcome.eventId, outcome.calendarId)
        await restoreTask(snapshot)
      },
    })
  },
  [sendToCalendar, undoSend, restoreTask],
)
```

`restoreTask` is defined at `:126` — place `handleSendToCalendar` after it so the reference resolves.

`previous: {}` is correct and deliberate: `handleUndo` (`:369`) only calls `onUpdateTask` when `Object.keys(undo.previous).length > 0`, so an empty object skips the update path entirely — which is what you want, since the task no longer exists — and then awaits `onUndoExtra` (`:372`). All the restore work happens there.

Render the picker once, near the note picker's render site:

```tsx
{calendarTaskId && (() => {
  const target = tasks.find((t) => t.id === calendarTaskId)
  if (!target) return null
  return (
    <SchedulePopover
      showDuration
      itemTitle={target.title}
      onSchedule={(date, isAllDay, durationMinutes) =>
        handleSendToCalendar(target, date, isAllDay, durationMinutes)
      }
      onClear={() => setCalendarTaskId(null)}
      trigger={<span className="sr-only">Send to calendar</span>}
    />
  )
})()}
```

`SchedulePopover` opens on trigger click, so it needs to mount already open. Read its `isOpen` handling (`:214-254`) and either add an `defaultOpen?: boolean` prop or render it inside the row where the chip lives. **Prefer rendering it in the row** if `defaultOpen` would mean restructuring the popover — pass `calendarTaskId === task.id` down and let the chip itself be the `trigger`.

Route the quick action, alongside the `note` branch (`:430`):

```tsx
onQuickAction={(action) => {
  if (action.kind === 'note') {
    setNotePickerTaskId(task.id)
    return
  }
  if (action.kind === 'calendar') {
    setCalendarTaskId(task.id)
    return
  }
  applyTriage(task, action)
}}
```

- [ ] **Step 6: Run the full inbox suite**

Run: `npx vitest run src/components/schedule`
Expected: PASS. `DenseInboxRow.test.tsx`, `InboxTaskCard.test.tsx`, `InboxUndoToast.test.tsx`, and `InboxModeToggle.test.tsx` must all still pass.

- [ ] **Step 7: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/schedule/DenseInboxRow.tsx src/components/schedule/InboxView.tsx src/components/schedule/InboxSendToCalendar.test.tsx
git commit -m "feat(inbox): send-to-calendar quick action in list mode

Opens the schedule picker with a duration row; on success the task is
replaced by a Google event with a 10s undo that removes both."
```

---

### Task 4: Wire focus mode

**Files:**
- Modify: `src/components/schedule/FocusInboxCard.tsx` (props `:10-19`, keyboard handler `:64-88`, button grid `:125-140`)
- Modify: `src/components/schedule/InboxView.tsx` (the `FocusInboxCard` render at `:532`)
- Test: `src/components/schedule/FocusInboxCard.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `InboxView`'s `setCalendarTaskId` from Task 3.
- Produces: `FocusInboxCardProps` gains `onSendToCalendar?: (taskId: string) => void`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/schedule/FocusInboxCard.test.tsx` (read the file's existing render helper and reuse it rather than writing a new one):

```tsx
it('sends the current card to the calendar via the button', () => {
  const onSendToCalendar = vi.fn()
  renderCard({ onSendToCalendar })

  fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))
  expect(onSendToCalendar).toHaveBeenCalledWith('task-1')
})

it('sends the current card to the calendar with the "e" key', () => {
  const onSendToCalendar = vi.fn()
  renderCard({ onSendToCalendar })

  fireEvent.keyDown(window, { key: 'e' })
  expect(onSendToCalendar).toHaveBeenCalledWith('task-1')
})

it('leaves "c" bound to complete', () => {
  const onComplete = vi.fn()
  const onSendToCalendar = vi.fn()
  renderCard({ onComplete, onSendToCalendar })

  fireEvent.keyDown(window, { key: 'c' })
  expect(onComplete).toHaveBeenCalled()
  expect(onSendToCalendar).not.toHaveBeenCalled()
})
```

Adjust `'task-1'` to whatever id the file's existing fixture uses.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/schedule/FocusInboxCard.test.tsx`
Expected: FAIL — no button named "Send to calendar".

- [ ] **Step 3: Add the prop, the key, and the button**

Add to `FocusInboxCardProps` (`:10-19`) and the destructured params:

```tsx
onSendToCalendar?: (taskId: string) => void
```

Add a handler beside `del`/`complete` (`:53-62`). It does **not** call `advance()` — the card leaves the list when the task is deleted, and the popover it opens still needs the card mounted behind it:

```tsx
const sendToCalendar = useCallback(() => {
  if (!current) return
  onSendToCalendar?.(current.id)
}, [current, onSendToCalendar])
```

Add the key to the switch (`:69-83`), leaving `c` alone:

```tsx
case 'e':
case 'E': sendToCalendar(); break
```

Add `sendToCalendar` to the `useEffect` dependency array (`:88`).

Add the button directly below the `WHEN_BUTTONS` grid (after `:140`):

```tsx
{onSendToCalendar && (
  <button
    type="button"
    aria-label="Send to calendar"
    onClick={sendToCalendar}
    className="w-full flex items-center justify-center gap-2 px-3 py-3 mb-6 rounded-xl border-2 border-neutral-100 bg-white hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
  >
    <span className="text-xs text-neutral-400 bg-neutral-50 rounded px-2 py-0.5">e</span>
    <ConceptIcon name="when" decorative />
    <span className="font-medium text-sm text-neutral-800">Send to calendar</span>
  </button>
)}
```

`ConceptIcon` is already imported in this file (`:3`).

- [ ] **Step 4: Pass the handler from `InboxView`**

At the `FocusInboxCard` render (`:532`), add:

```tsx
onSendToCalendar={setCalendarTaskId}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/schedule`
Expected: PASS.

- [ ] **Step 6: Full verification and commit**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

All four must succeed. `npm run build` is required — the pre-push `tsc --noEmit` does not catch everything Vercel's build does.

```bash
git add src/components/schedule/FocusInboxCard.tsx src/components/schedule/FocusInboxCard.test.tsx src/components/schedule/InboxView.tsx
git commit -m "feat(inbox): send-to-calendar in focus mode

Button plus the 'e' key — 'c' stays bound to complete."
git push origin HEAD
```

---

### Task 5: Browser verification

Type-checks are not inspection. Four tasks of green tests prove nothing about whether the picker opens in the right place.

**Files:** none — this task produces findings, not code.

- [ ] **Step 1: Start the dev server in the worktree**

```bash
cd .worktrees/inbox-send-to-calendar && npm run dev
```

The worktree's `.env` was copied at creation; a blank screen means it is missing.

- [ ] **Step 2: Walk the list-mode path**

Open `http://localhost:5173/inbox`. On a **disposable test item you created for this**, not a real inbox item:

1. Click the Calendar chip → the picker opens anchored to the row, not off-screen.
2. Pick a day → the day-context preview lists what is already on it.
3. The duration row is visible above the time presets and `1h` is preselected.
4. Pick `30m`, then a time → the row disappears and the undo toast reads "Sent to <calendar name>".
5. Check Google Calendar: the event exists, at the right time, 30 minutes long, on the domain-mapped calendar, and its description carries any notes/links/phone.
6. Click Undo → the event disappears from Google and the task returns to the inbox with its notes intact.

- [ ] **Step 3: Walk the focus-mode path**

Switch to focus mode. Confirm the button renders, `e` opens the picker, and `c` still completes the card.

- [ ] **Step 4: Force the read-only failure**

Temporarily map a domain to the read-only *"Work Schedule, Meetings, and Events"* calendar in Settings → Calendar, tag a test item with that domain, and send it. Confirm the task **stays in the inbox** and the message names the read-only cause. Restore the mapping afterward.

- [ ] **Step 5: Report findings**

List anything that looked wrong. Do not fix silently and do not claim the feature works without having watched step 4 fail correctly.

---

## Self-Review

**Spec coverage.** Every section maps to a task: the conversion, calendar routing, description carry-over, and write-before-delete → Task 1; the day/time/duration picker → Task 2; list-mode wiring, undo, and failure messaging → Task 3; focus-mode wiring → Task 4; the "type-checks are not inspection" gap → Task 5. The spec's out-of-scope note (`InboxTaskCard`) is honored — no task touches it.

**Two deliberate deviations** from the spec, both explained in the header: no `requestId`, and focus key `e` instead of the taken `c`.

**Type consistency.** `sendToCalendar(task, when)`, `undoSend(eventId, calendarId?)`, `buildEventDescription(task)`, `SendToCalendarWhen`, and `SendToCalendarResult` are defined in Task 1 and used with those exact names in Tasks 3 and 4. `showDuration` and the three-argument `onSchedule` are defined in Task 2 and consumed in Task 3. `{ kind: 'calendar' }` is defined in Task 3 and not needed by Task 4.

**Known soft spot.** Task 3, Step 5 is the one place the plan cannot be fully prescriptive: `SchedulePopover` opens on trigger click, so mounting it already-open for a row needs a decision the implementer must make against the real code. The step says which option to prefer and why. Expect that step to take the longest.
