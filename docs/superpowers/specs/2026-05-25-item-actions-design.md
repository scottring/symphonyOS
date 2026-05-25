# Item Actions: discoverable skip / reschedule / delete across app + wall

**Date:** 2026-05-25
**Status:** Approved (design) — ready for implementation plan

## Problem

The actions you can take on a schedule item (skip, reschedule, delete) already
work in the data layer, but they're inconsistently exposed and hard or
impossible to reach:

| Action | Current state | Why it fails |
|---|---|---|
| Skip routine/event | `opacity-0 group-hover:opacity-100` on the row (`ScheduleItem.tsx:660-672`) | Invisible on touch (no hover). Mobile fallback is a non-obvious swipe (`SwipeableCard`). |
| Reschedule / push | `hidden md:block opacity-0 group-hover` (`ScheduleItem.tsx:675-677`) | Desktop-hover-only; effectively absent on mobile. |
| Delete | Detail panel only, **tasks + events only** (`DetailPanelRedesign.tsx:2925`, `:2944`) | No delete on routines or meals; never on the row; requires opening the panel. |
| Change event **time** | Time row opens a picker only when `isTask` (`DetailPanelRedesign.tsx:1518-1520`) | Events can only be rescheduled by dragging on the week grid. |
| Any action on the **wall** | Tapping a wall-v2 item only flashes its title (`WallV2Shell.tsx:234-246`, `WallV2EventCard.tsx:25`) | The kitchen wall has no skip/done/delete affordance at all. |

The underlying mutations are sound — `useActionableInstances().skip()`,
`App.tsx handleDeleteEvent`, `useGoogleCalendar.updateEvent/moveEvent`,
`useScheduleActions.onSkipRoutine/onSkipEvent/onPushEvent`. This is purely an
**affordance and exposure** problem, plus one genuinely missing control (event
time reschedule from the detail panel).

## Goals

1. Every schedule item exposes its valid actions through **one discoverable,
   touch-and-desktop-friendly entry point**.
2. Delete is available wherever it's valid (tasks, events); routine/meal items
   expose the correct *equivalent* action rather than a misleading "delete".
3. Event **time** can be rescheduled from the detail panel, not only via the
   week grid.
4. The **wall (wall-v2)** gains a skip / done control for routines and a skip
   control for events.

Non-goals: no DB/schema changes, no edge-function changes, no new mutation
hooks. We reuse what exists.

## Design

### Surface 1 — Main app (phone + laptop): the "⋯" row menu

Replace the hover-gated skip/push icons on `ScheduleItem` with a single
**always-visible "⋯" (kebab) button** that opens a small action menu. The menu
lists only the actions valid for that item type:

- **Task:** Reschedule… · Delete
- **Event:** Reschedule time… · Move to date… · Skip today · Delete (recurring → "this event / entire series")
- **Routine:** Skip today · Push to another day… · Delete routine… (confirm)

Behavior:

- The "⋯" button is always rendered (no `opacity-0`), tap target ≥ 44×44px, and
  identical on touch and desktop. `e.stopPropagation()` so it doesn't open the
  detail panel.
- The menu is a lightweight popover/action sheet. On mobile it may present as a
  bottom sheet; on desktop as an anchored popover. (Implementation can reuse an
  existing popover/menu primitive if one fits; otherwise a minimal local one.)
- Each action calls the existing context handler: `onSkipRoutine` /
  `onSkipEvent`, `onPushRoutine` / `onPushEvent`, `onDelete` (task),
  `onDeleteEvent`, and a new `onDeleteRoutine` (see below). All already flow
  through `ScheduleActionsContext`.
- The existing mobile **swipe** (`SwipeableCard`) stays as a power-user
  shortcut — the kebab is the discoverable primary.

**Routine deletion semantics:** a routine row is a single *occurrence*, so the
day-level action is **Skip today** (reversible, persists as
`actionable_instances.status='skipped'`). "Delete routine…" removes the routine
*definition* (every day) via the existing `deleteRoutine` and therefore always
shows a confirm. It is a deliberate, secondary menu item — never the default.

### Surface 1b — Detail panel completions

In `DetailPanelRedesign.tsx`:

1. **Event time reschedule.** Make the time row open the time picker for events,
   not just tasks (`:1518-1520`). A same-day time change writes through
   `useGoogleCalendar.updateEvent({ startTime, endTime })` (already supported);
   a whole-day move reuses the existing `onPushEvent` → `moveEvent` path. Expose
   one new callback `onUpdateEventTime(eventId, start, end)` on
   `ScheduleActionsContext` for the time case. All-day events and read-only
   fields (title/description) stay as they are — Google owns those.
2. **Routine action section.** When the panel shows a routine, render a section
   with **Skip today** and **Delete routine…** (confirm). Today the panel has no
   routine delete/skip affordance.

### Surface 2 — Wall (wall-v2): tap → action sheet

Today `WallV2EventCard` is a `<button>` whose tap flashes the title. Change the
tap to open a **small action sheet anchored to the card**, with large (≥48px)
kiosk-friendly buttons:

- **Routine:** `Skip today` · `Mark done`
- **Event:** `Skip today` (recipe/dinner cards keep their existing recipe-viewer
  behavior as the primary tap, with Skip available in the sheet)

Wiring: the wall is always "today", so actions call `skip('routine'|'calendar_event', id, today)` and `markDone(...)`
via `useActionableInstances` (already imported on the legacy wall; add to
wall-v2). `useWallData` already filters `item.skipped`, so a skipped item
disappears immediately after refetch. Provide a brief flash ("Skipped — undo")
consistent with the existing `showFlash` mechanism; undo calls `undoDone`.

## Components / units

- `ScheduleItemActionsMenu` (new) — the "⋯" trigger + menu; pure presentational,
  takes the item + a set of optional action callbacks, renders only valid ones.
  Isolated and unit-testable (given item type + callbacks → correct menu items).
- `ScheduleItem.tsx` — swap the hover-gated buttons for the menu; keep layout.
- `DetailPanelRedesign.tsx` — enable event time picker; add routine action
  section.
- `WallV2*` — a small `WallV2ItemActionSheet` (new) opened from
  `WallV2Shell.handleTapEvent`; wire skip/done/undo.
- `ScheduleActionsContext` / `useScheduleActions` — add `onDeleteRoutine`
  (wraps existing `deleteRoutine` + confirm); everything else already present.

## Data flow

Item row → menu action → `ScheduleActionsContext` handler → existing hook
(`skip` / `markDone` / `undoDone` / `reschedule` / `deleteEvent` /
`updateEvent` / `deleteRoutine`) → optimistic UI + undo toast (existing
patterns) → refetch/refresh.

## Edge cases

- **Recurring events**: delete already routes through the
  "this event / entire series" confirmation (`App.tsx:1281-1316`). Reschedule of
  a recurring instance uses the existing single-instance path.
- **Undo**: skip, delete (single event), reschedule already push undo actions;
  the wall provides an undo flash. Series-delete remains non-undoable (confirm is
  the safety), matching current behavior.
- **Completed/skipped items**: menu hides Skip/Done when already in that state
  (mirror existing `!item.completed && !item.skipped` guards).
- **Meals**: meal events are calendar events → Delete event + Skip apply.
- **All-day events**: no time picker (only "Move to date").

## Testing

- Unit: `ScheduleItemActionsMenu` renders the correct action set per item type
  and disabled/hidden states; clicking each fires the right callback.
- Unit: `useScheduleActions.onDeleteRoutine` calls `deleteRoutine` and pushes
  undo/confirm.
- Unit (wall): the wall action sheet fires `skip`/`markDone` with `today` and the
  right entity type.
- Existing `useScheduleActions.test.ts` skip/push/delete coverage stays green.
- Manual: phone + laptop (app menu) and the ViewSonic 1024×768 wall (tap sheet).

## Out of scope

- Bulk actions, drag-reschedule changes, routine editing beyond delete,
  event title/description editing (Google-owned), and any new persistence.
