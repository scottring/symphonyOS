# Send to calendar, from the inbox

**Date:** 2026-07-29
**Branch:** `inbox-send-to-calendar`
**Status:** implemented — see **As-built** for where it differs from this design

## As-built (2026-07-29)

The design below is the approved intent; the shipped code differs in four
places, each for a reason found during implementation:

- **No `requestId`.** The edge function turns a `requestId` into a deterministic
  Google event id and resolves the resulting `409` by *fetching the existing
  event*. Send → undo → re-send would therefore hand back the **cancelled**
  event instead of creating a new one. The in-flight guard in
  `useSendToCalendar` covers the double-tap case the idempotency key was for.
- **Focus-mode key is `e`, not `c`.** `c` was already Complete in
  `FocusInboxCard`.
- **No `<SendToCalendarPopover>`.** `SchedulePopover` gained `showDuration` plus
  an optional controlled `open` / `onOpenChange` pair, and each call site's own
  chip *is* the trigger — the popover positions itself from
  `triggerRef.getBoundingClientRect()`, so a shared instance rendered once in
  `InboxView` would have had nothing to anchor to.
- **Seven pre-existing `SchedulePopover` call sites across six files**, not the
  17 across 10 claimed below (an unverified count). All still pass two-argument
  `onSchedule` handlers and were left untouched — as did every existing test
  render.

## Problem

An inbox item that is really an *appointment* — "Dentist appointment", "Call the
contractor back at 2" — has no way out of Symphony's inbox and into Google
Calendar. The existing Schedule button (`SchedulePopover`) sets `scheduledFor` on
the task, which puts it on Symphony's Today timeline and nowhere else. Iris
doesn't see it. The kitchen wall shows it as a task, not as a block of the day.

Quick Capture already knows how to do this — typing `Event: … tomorrow 8pm`
creates a real Google event and skips the task entirely
(`useShellChrome.ts:114-144`). That path only exists at capture time. Once
something is in the inbox, it's stuck as a task.

## What it does

A new **Calendar** action on inbox items opens a picker (day → time → duration).
On confirm the item becomes a real Google Calendar event and leaves Symphony.

1. Resolve the target calendar from the task's domain:
   `getCalendarForDomain(task.context)`.
2. `createEvent()` — **awaited**.
3. **On success:** delete the task, refetch events, show `InboxUndoToast`:
   *"Sent to Family calendar · Undo"*.
4. **On failure:** the task is untouched. Error toast names the cause — a Google
   `403` reads *"Work Schedule calendar is shared read-only"*, anything else is
   generic.

**Undo (10s)** = `deleteEvent(eventId, calendarId)` + `restoreTask(snapshot)`.

### The conversion is one-way, by design

The task is destroyed, not linked. This was chosen deliberately: an appointment
is not work-to-do, and keeping a checkbox for it clutters the inbox it just left.

To make the destruction safe:

- The full `Task` snapshot is captured **before** the Google write, so Undo can
  restore it verbatim.
- The event `description` is composed from the task's `notes`, `links`, and
  `phoneNumber`, so the context Symphony treats as first-class survives in a form
  Google can show.
- Project link, assignees, and completion state do **not** survive. That is the
  accepted cost.
- Subtasks do **not** survive either: `parent_task_id` is `ON DELETE CASCADE`
  (`supabase/migrations/016_subtasks.sql:3`) and Undo's `restoreTask` restores
  only the parent, so a converted task's children are gone for good. Theoretical
  today — inbox-bucket rows don't render subtasks — but real if that changes.

### Order of operations is the safety property

Write to Google first; delete the task only on confirmed success. The inverse
(optimistic delete, restore on failure) was rejected: a `403` on a read-only
shared calendar is a live, known failure mode in this account, and a tab closed
mid-write would strand the item. The cost is roughly one second of spinner.

## Components

### New — `src/hooks/useSendToCalendar.ts`

The entire behavior in one unit, with no UI concerns, so it can be tested
directly.

```ts
sendToCalendar(task, { start, durationMinutes } | { start, allDay: true })
  → { ok: true,  eventId, calendarId, calendarName }
  | { ok: false, reason: 'read-only' | 'not-connected' | 'failed' }
```

Responsibilities:

- resolve the write calendar via `getCalendarForDomain`
- compose the event description from notes / links / phone
- pass a `requestId` (already supported, `CreateEventParams:17`) so a retry
  cannot double-book
- call `deleteTask` **only** after Google confirms
- classify the failure; never delete on any failure

It does not render toasts and does not know about the inbox. Callers own that.

### Changed — `src/components/triage/SchedulePopover.tsx`

Two additive props:

- `showDuration?: boolean` — renders a duration chip row
  (30m / 1h / 90m / 2h / All day), defaulting to 1h
- `onSchedule` widened to `(date, isAllDay, durationMinutes?) => void`

Widening is backward-compatible: the other 17 call sites across 10 files pass
two-argument handlers and need no change.

Reusing this component rather than forking it keeps the day-context preview
(`SchedulePopover.tsx:102-131`) — the part that makes the picker worth using,
since it shows what else is already on the day you're aiming at.

The `trigger` prop (`SchedulePopover.tsx:34`) supplies the distinct calendar icon.

## Wiring — `/inbox` only

`/inbox` renders `InboxViewContainer` → `InboxView` on both routing branches
(`TasksApp.tsx:50` and `:63`), so there is one place to wire.

`InboxViewContainer` already imports `useGoogleCalendar`,
`useCalendarDomainMappings`, and `deleteTask`. No new provider plumbing.

**List mode (`DenseInboxRow`).** New `QuickAction` kind `'calendar'`. Because it
opens a picker rather than firing immediately, it follows the pattern already
established for notes at `InboxView.tsx:431`:

```ts
if (action.kind === 'calendar') { setCalendarTaskId(task.id); return }
```

**Focus mode (`FocusInboxCard`).** A new `onSendToCalendar(taskId)` prop and a
button below the four `WHEN_BUTTONS`, bound to keyboard **`c`** — keys `1`–`4`
are taken by the buckets.

Both modes route into a single `<SendToCalendarPopover>` rendered once in
`InboxView`, keyed on `calendarTaskId`.

Today's inbox section (`InboxTaskCard`, `InboxSection.tsx:223`) is deliberately
out of scope.

## Testing

`useSendToCalendar.test.ts`

- success deletes the task
- **a 403 does not delete the task**
- a disconnected calendar does not delete the task
- the description carries notes, links, and phone number
- a `requestId` is always present

`SchedulePopover.test.tsx`

- the duration row renders only when `showDuration` is set
- existing two-argument `onSchedule` callers are unaffected

`InboxView.test.tsx`

- the calendar quick action opens the popover
- Undo deletes the event and restores the task

## Known hazards

**Read-only calendars.** Per the 2026-07-07 sharing fix,
`scott.kaufman@stacksdata.com` is now `writer`, but *"Work Schedule, Meetings,
and Events"* is still `reader`. A work-domain task mapped there will 403. The
design refuses correctly and says why, but re-sharing that calendar is the real
fix.

**Wrong-tool risk.** This is right for appointments and wrong for work. Expect it
to feel good on "Dentist appointment" and bad on "Fix the gutter". Worth
revisiting after a week of real use — the fallback, if it bites, is the linked-
event variant that keeps the task.
