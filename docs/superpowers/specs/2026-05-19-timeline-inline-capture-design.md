# Timeline Inline Capture + Confirm/Undo Toasts — Design Spec

**Date:** 2026-05-19
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/interactive-timeline` (Phase-1.5 polish of the shipped radial-insert feature)
**Spec context:** builds on `docs/superpowers/specs/2026-05-18-interactive-timeline-design.md`

## Problem

The radial-insert feature (Phase 1) captures Task/Event/Routine titles via native
`window.prompt()` — a jarring, off-brand system dialog that breaks the in-place
feel of the timeline. There is also no confirmation or undo after creation.

## Goal

1. Replace the 3 `window.prompt` calls with an elegant **in-app inline input
   anchored at the insertion point**.
2. After any create (Task/Event/Routine/Note), show a **world-class confirmation
   toast with Undo**, reusing existing toast/undo infrastructure.

## Locked Decisions

- **Capture surface:** inline input anchored at the gap (the wheel collapses
  into the input at the exact insertion point). Not a popover, not the
  QuickCapture sheet.
- **Undo:** confirmation toast includes Undo for all four entity kinds.
- **Scope:** no new toast infra (reuse `useToast` + `UndoToast`); no
  `TimelineNoteComposer` layout redesign (only add its post-create toast);
  `PlanningSession` untouched; same branch.

## Architecture & Components

### `TimelineQuickInput.tsx` (new)

A slim inline capture field. Presentational + minimal local state only.

- Props: `{ kind: 'task' | 'event' | 'routine'; anchorTime: Date | null;
  onSubmit: (title: string) => void; onCancel: () => void }`
- Large-serif styling (`font-display`), matching the QuickCapture entity-input
  convention in `src/index.css` / `QuickCapture.tsx`.
- Placeholder reflects context: `New {kind} · {h:mm}` (e.g. "New task · 6:15");
  when `anchorTime` is null, omit the time suffix.
- `Enter` → `onSubmit(trimmed)` when non-empty; empty → no-op (stay focused).
- `Esc` or blur → `onCancel()`.
- Autofocus on mount.

### `TimelineInsertPoint.tsx` (modify)

Add an internal mode: `'closed' | 'wheel' | 'input'`.

- Closed → `+` → `wheel` (unchanged).
- Pick **Task/Event/Routine** → mode `'input'`: the wheel is replaced in place
  by `<TimelineQuickInput kind={kind} anchorTime={computeAnchorTime(ctx)} … />`.
  On submit → call a new `onCreate(kind, title)` prop; then mode → `'closed'`.
  On cancel → mode → `'closed'`.
- Pick **Note** → unchanged: bubbles up (existing path opens
  `TimelineNoteComposer`).
- Esc / outside-click closes whichever of wheel/input is open.

### `useTimelineInsert.ts` (modify)

`handlePick(ctx, kind)` no longer calls `onCreateTaskAt/EventAt/RoutineAt`
directly for task/event/routine (creation now happens on inline submit, routed
through `TimelineInsertPoint`'s `onCreate`). The `note` branch is unchanged
(opens the note composer state). The hook still exposes `computeAnchorTime`
results so the insert point can show the resolved time. Net effect: the three
create callbacks are invoked with `(title, when)` from the inline submit, not
from a prompt.

### `App.tsx` (modify)

- `onCreateTaskAt`, `onCreateEventAt`, `onCreateRoutineAt`: remove
  `window.prompt`; signature becomes `(title: string, when: Date | null)`.
  Keep the existing context/assignee derivation and the event 30-min window.
- Each handler `await`s its create, which already returns an identifier
  (`addTask` → `string | undefined`; `createEvent` → `CreateEventResult`;
  `addRoutine` → `Routine | null`; `addNote` → `Note | null`). On success,
  fire a confirmation toast via the existing `useToast`:
  **"✓ {Kind} added · {h:mm}"** with an **Undo** action that deletes the
  created entity by id (`deleteTask` / `deleteEvent` / routine delete /
  `deleteNote`). Undo availability uses the existing undo-toast duration.
- The Note composer's create-new and append paths also fire the same
  confirm+Undo toast (append's Undo reverts the appended block / anchor;
  if a clean append-undo is not available, append shows confirm-only and the
  spec accepts that — create-new always has Undo).

## Data Flow

pick → inline input (shows resolved anchor time) → `Enter` → App create handler
creates, returns id → confirm+Undo toast → Undo within the existing window
deletes by id → `Esc`/blur → silent cancel (no create, no toast).

## Error Handling

- Create failure (handler throws / returns null/undefined): error toast
  ("Couldn't add {kind}"); input closes.
- Empty title: no-op, input stays focused.
- Undo pressed after the toast expired: nothing (toast and its handler gone).
- Undo delete failure: error toast ("Couldn't undo"); created item remains.

## Testing

**Unit (Vitest + RTL):**
- `TimelineQuickInput`: renders `New task · 6:15` placeholder for
  `kind=task, anchorTime=6:15`; omits time when `anchorTime` null; `Enter`
  with text fires `onSubmit('trimmed')`; `Enter` empty does nothing; `Esc`
  fires `onCancel`.
- `TimelineInsertPoint`: `+` → wheel → pick Task → `TimelineQuickInput`
  appears (no immediate create); submit fires `onCreate('task','X')`; pick
  Note still bubbles to the composer path (unchanged). Update the existing
  test that asserted picking a kind closes the wheel + fires `onPick` — for
  task/event/routine it now transitions to input.
- App/seam: `onCreateTaskAt('X', when)` calls `addTask` (no `window.prompt`)
  and triggers a toast with an Undo that calls `deleteTask` with the returned
  id. Mirror for event/routine; note create-new fires the toast.

**Manual matrix:** desktop (inline input at gap, Enter/Esc), mobile
(<768px input reachable), wall kiosk (large serif legible at 8 ft; Undo tap
target ≥64px).

## Out of Scope

- Any `TimelineNoteComposer` visual/layout redesign (only its post-create
  toast is added).
- New toast or undo infrastructure.
- Drag-to-reschedule and all other Phase 2 items.
- `PlanningSession`.
