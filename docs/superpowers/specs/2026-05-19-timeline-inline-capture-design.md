# Timeline Inline Capture + Smart Parse + Confirm/Undo Toasts — Design Spec

**Date:** 2026-05-19
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/interactive-timeline` (Phase-1.5 polish of the shipped radial-insert feature)
**Spec context:** builds on `docs/superpowers/specs/2026-05-18-interactive-timeline-design.md`

## Problem

The radial-insert feature (Phase 1) captures Task/Event/Routine titles via native
`window.prompt()` — a jarring, off-brand system dialog that breaks the in-place
feel of the timeline. It is also a *dumb* capture: no natural-language/`#`/`@`
parsing, unlike the app's main `QuickCapture`. And there is no confirmation or
undo after creation.

## Goal

1. Replace the 3 `window.prompt` calls with an elegant **in-app inline input
   anchored at the insertion point**.
2. Give that input **full QuickCapture-grade smart parsing** (time, `#project`,
   `@person`, category, assignees) via the existing engine — with the timeline
   slot's time as the default a typed time overrides.
3. After any create (Task/Event/Routine/Note), show a **confirmation toast with
   Undo**, reusing existing toast/undo infrastructure.

## Locked Decisions

- **Capture surface:** inline input anchored at the gap (the wheel collapses
  into the input at the exact insertion point). Not a popover, not the
  QuickCapture sheet.
- **Smart parse:** full parity with `QuickCapture` — parsed-field **chips with
  click-× overrides** shown inline, powered by the existing
  `parseQuickInput`. Reuse via a shared extraction (below), not duplication.
- **Command palette is OUT:** the global ⌘K `SearchModal` (fuzzy
  actions/navigation) is a different surface and is explicitly not folded into
  the timeline insertion. The radial already selects the kind and the gap
  already selects the location; only smart *entity capture* belongs here.
- **Undo:** confirmation toast includes Undo for all four entity kinds.
- **Scope:** no new toast/parser infra (reuse `useToast`, `UndoToast`,
  `parseQuickInput`); `PlanningSession` untouched; same branch.

## Architecture & Components

### Shared parse extraction (refactor — behavior-preserving)

`QuickCapture.tsx` currently owns, inline: the `parsed`/`overrides` state and
the parsed-field chip UI (date/time, project, contact, category — with
clear-× handlers). Extract this into two reusable units so the timeline input
and QuickCapture share one implementation (DRY):

- **`useQuickParse(title, ctx)`** (new hook) — wraps `parseQuickInput` +
  `hasParsedFields` + the `overrides` state and clear-handlers; returns
  `{ parsed: effectiveParsed, setOverride, clearField, hasFields }`.
- **`ParsedFieldChips.tsx`** (new) — presentational; renders the chips
  (date/time, `#project`, `@person`, category) with × handlers, given an
  `effectiveParsed` + clear callbacks.

`QuickCapture` is refactored to consume both. **Hard constraint:**
QuickCapture's externally-observable behavior (its `onAdd`/`onAddRich`/
`onAddNote` calls, inbox-vs-scheduled logic, note detection) must be
**byte-for-byte unchanged** — verified by its existing test suite passing
untouched. This is a targeted refactor of code we are extending, not unrelated
restructuring.

### `TimelineQuickInput.tsx` (new)

A slim inline capture field rendered in place of the radial wheel.

- Props: `{ kind: 'task' | 'event' | 'routine'; anchorTime: Date | null;
  parserContext: { projects; contacts; familyMembers };
  onSubmit: (result: { title: string; scheduledFor: Date | null;
  category?; projectId?; contactId?; assignedMemberIds? }) => void;
  onCancel: () => void }`
- Large-serif styling (`font-display`), matching the QuickCapture entity-input
  convention.
- Uses `useQuickParse` + renders `ParsedFieldChips` inline (full parity).
- **Anchor-time default:** if the parsed input yields no explicit time, the
  effective `scheduledFor` is the slot's `anchorTime`; if the user types a time
  (`3pm`, `tomorrow 9`), the parsed time wins. The time chip shows whichever is
  effective and is overridable via ×.
- Placeholder: `New {kind} · {h:mm}` (omit time when `anchorTime` null).
- `Enter` → `onSubmit(effective result)` when title non-empty; empty → no-op.
- `Esc` or blur (outside the chips) → `onCancel()`. Autofocus on mount.

### `TimelineInsertPoint.tsx` (modify)

Internal mode `'closed' | 'wheel' | 'input'`. Closed → `+` → wheel. Pick
**Task/Event/Routine** → mode `'input'`: wheel replaced in place by
`<TimelineQuickInput>`; on submit → `onCreate(kind, result)` then `'closed'`;
on cancel → `'closed'`. Pick **Note** → unchanged (bubbles up to open
`TimelineNoteComposer`). Esc/outside-click closes whichever of wheel/input is
open.

### `useTimelineInsert.ts` (modify)

`handlePick(ctx, kind)` no longer calls the create callbacks directly for
task/event/routine (creation happens on inline submit, routed via
`TimelineInsertPoint`'s `onCreate(kind, result)`). The `note` branch is
unchanged. The hook continues to expose the `computeAnchorTime` result so the
insert point passes `anchorTime` to the input.

### `App.tsx` (modify)

- `onCreateTaskAt`/`onCreateEventAt`/`onCreateRoutineAt`: remove
  `window.prompt`; accept the parsed `result` (title + scheduledFor +
  category/project/contact/assignees) + the gap context. Keep existing
  context/assignee derivation as fallback when the parse didn't specify them,
  and the event 30-min window (end = start + 30 min).
- Each handler `await`s its create (returns id:
  `addTask`→`string|undefined`; `createEvent`→`CreateEventResult`;
  `addRoutine`→`Routine|null`; `addNote`→`Note|null`). On success fire a
  `useToast` confirmation: **"✓ {Kind} added · {h:mm}"** with **Undo** that
  deletes the created entity by id (`deleteTask`/`deleteEvent`/routine
  delete/`deleteNote`), using the existing undo-toast duration.
- The Note composer's create-new path fires the same confirm+Undo toast.
  Append path fires confirm-only (clean append-revert is not in scope).

## Data Flow

pick → inline input → user types (parser runs live, chips render, anchor-time
is the default time) → `Enter` → `onCreate(kind, effectiveResult)` → App
handler creates, returns id → confirm+Undo toast → Undo deletes by id within
the window. `Esc`/blur → silent cancel (no create, no toast).

## Error Handling

- Create failure (throws / null / undefined): error toast
  ("Couldn't add {kind}"); input closes.
- Empty title: no-op, input stays focused.
- Undo after toast expiry: nothing (toast + handler gone).
- Undo delete failure: error toast ("Couldn't undo"); item remains.

## Testing

**Unit (Vitest + RTL):**
- `useQuickParse`: parsing + override/clear behavior matches what
  QuickCapture did pre-extraction (port/cover the relevant cases).
- `ParsedFieldChips`: renders each chip when present; × fires the clear
  callback; nothing renders with no parsed fields.
- `QuickCapture`: **existing test suite passes unchanged** (regression gate
  for the extraction — no behavioral drift).
- `TimelineQuickInput`: placeholder `New task · 6:15`; typing `#proj @person`
  shows chips; no typed time → effective `scheduledFor` = anchorTime; typed
  time overrides anchor; `Enter` emits the effective result; empty Enter
  no-op; `Esc` cancels.
- `TimelineInsertPoint`: `+` → wheel → pick Task → input appears (no immediate
  create) → submit fires `onCreate('task', result)`; Note pick still opens the
  composer. Update the existing test that asserted instant
  `onPick`-and-close for task/event/routine.
- App/seam: `onCreateTaskAt(result, ctx)` calls `addTask` (no
  `window.prompt`), applies parsed fields, and triggers a toast whose Undo
  calls `deleteTask` with the returned id; mirror for event/routine; note
  create-new fires the toast.

**Manual matrix:** desktop (inline input + chips at gap, Enter/Esc); mobile
(<768px input + chips reachable); wall kiosk (serif legible at 8 ft, Undo tap
target ≥64px).

## Out of Scope

- The global ⌘K command palette / `SearchModal` (navigation/actions) — not
  folded into timeline insertion.
- Any `TimelineNoteComposer` visual/layout redesign (only its post-create
  toast is added) and append-Undo.
- New toast/undo/parser infrastructure.
- Drag-to-reschedule and all other Phase 2 items; `PlanningSession`.
- Any QuickCapture behavior change (extraction must be behavior-preserving).
