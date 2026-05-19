# Interactive Timeline — Design Spec

**Date:** 2026-05-18
**Status:** Approved (design), pending implementation plan
**Surface:** `TodaySchedule` (the state / agenda view)

## Problem

The state-view timeline is static. You can see your day but you can't act on it
in place: there's no way to add something *at a moment* between two items, and
nothing can be moved by direct manipulation. Capture and rescheduling happen
through separate triage UI, away from the timeline where the intent forms.

## Goal

Make the state view directly interactive:

1. **Insert** any entity (Note / Task / Event / Routine) at a precise moment
   between timeline items, via an explicit affordance that opens a radial menu.
2. **Drag** existing items to re-time them within the day or move them to a
   different day — with per-entity-type rules that never silently corrupt data.

## Locked Decisions

- **Scope:** Upgrade `TodaySchedule` in place. `PlanningSession` (the modal
  time-block grid) is **untouched**. The two surfaces serve different mental
  modes (deep planning grid vs. glanceable agenda) and are not redundant. A
  shared drag engine may be extracted later *deliberately* if the surfaces
  converge — not speculatively now.
- **Gesture model: Model A.** An explicit `+` affordance is always present
  between items; tapping it opens a radial quarter-wheel. Press-and-hold is
  reserved exclusively for drag (Phase 2). This resolves the gesture conflict
  (press-hold = both "create here" and "pick up to move") and the
  discoverability problem (a long-press has no visual affordance).
- **Two phases.** Phase 1 = insert + radial (high value, low risk, ships
  standalone). Phase 2 = drag-to-reschedule (per-entity rules are the real
  work). One spec, sequenced delivery.
- **Cross-day drag (Phase 2): A + B.** Drop on the `DateNavigator` date strip
  (precise day) **and** a drag-revealed push bar (Tomorrow / This Week /
  Someday). Both reuse existing backend (`DateNavigator`, `onPushTask`,
  WhenPicker) — no new persistence logic. Edge-auto-flip ("C") is rejected as a
  touch/kiosk footgun.

## Architecture

`TodaySchedule.tsx` is already ~1,631 lines. This feature is **not** added
inline. The hard logic lives in small, independently testable units; the host
component only composes them.

| Unit | Responsibility | Knows about |
|---|---|---|
| `TimelineInsertPoint.tsx` | The `+` affordance + radial quarter-wheel. Presentational + gesture only. Props: `{ beforeItem, afterItem, section, anchorTime, onPick(kind) }` | Gesture |
| `useTimelineInsert.ts` | Computes `anchorTime` for an insertion; routes each `kind` to the correct create flow | Time + routing |
| `useTimelineDrag.ts` (Phase 2) | Wraps `@dnd-kit`; owns drag state and per-entity reschedule mutation rules | Mutation |
| `TimelineNoteCard.tsx` | Renders a `timeline_at`-anchored note as a distinct timeline item | Note rendering |

**Boundary rule:** `TimelineInsertPoint` knows *gesture*; `useTimelineInsert`
knows *time + routing*; `useTimelineDrag` knows *mutation*; `TodaySchedule`
just composes them. `TodaySchedule`'s only changes: render
`<TimelineInsertPoint>` between items (Phase 1) and wrap a single
`<DndContext>` (Phase 2).

`@dnd-kit/core` + `@dnd-kit/sortable` are already project dependencies (used by
`PlanningSession`).

## Phase 1 — Insert + Radial

### Insert point placement

- Between every consecutive pair of items within a day section.
- At the **head and tail** of each section (add to top of Morning, or to an
  otherwise empty Evening).
- Empty sections render a single full-width insert affordance instead of being
  hidden.

### Trigger & radial

- The `+` is always present but visually quiet (low-opacity hairline). On
  desktop it lifts to full prominence on hover; on touch / wall it is always
  rendered at a tap-sized target.
- Tap/click the `+` → radial quarter-wheel fans out with four segments:
  📝 Note · ✅ Task · 📅 Event · 🔁 Routine.
- Tap a segment → opens that create flow. Tap-away or `Esc` dismisses the
  wheel.
- **Press-and-hold does nothing in Phase 1** (reserved for Phase 2 drag).

### Anchor time (`useTimelineInsert`)

- Between two timed items → **midpoint, snapped to 5 minutes**
  (6:00 + 6:30 → 6:15).
- Section head → start of section, or one minute before the first item.
  Section tail → just after the last item.
- All-day band / unscheduled → no time (date only).
- The anchor is always a **prefill, never a lock** — every create flow lets the
  user change it.

### Segment → create flow (reusing existing flows)

| Segment | Opens | Prefilled |
|---|---|---|
| ✅ Task | existing `TodayAddInput` / task create | `scheduled_for` = date, time = anchor |
| 📅 Event | event create → `createEvent()` | start = anchor, end = anchor + 30 min |
| 🔁 Routine | `RoutineForm` | `time_of_day` = anchor |
| 📝 Note | Note composer (see Note Flow) | `timeline_at` = anchor |

`useGoogleCalendar` already exposes `createEvent` / `updateEvent` /
`deleteEvent`, so the Event segment is fully supported.

### Surfaces

- **Desktop (≥768px):** click; hover-reveals the `+`.
- **Mobile (<768px):** wheel opens upward as a thumb-reachable arc.
- **Wall kiosk:** ≥64px targets, no hover dependence, designed for 8-foot
  viewing per the kitchen-kiosk constraint.

## Note Flow & Data Model

The only piece requiring a schema change. Everything else reuses existing
tables.

### Migration

Add nullable `timeline_at timestamptz` to the `notes` table. A note with
`timeline_at` set is a timeline-anchored note; `null` behaves exactly as today.
No backfill. Fully backward-compatible.

### Composer (opened from 📝)

A lightweight sheet with a mode toggle at the top:

1. **New note** (default) — title + content; `timeline_at` = anchor; `context`
   inferred from the active domain. Renders inline via `TimelineNoteCard`.
2. **Link existing** — search/pick an existing note, with two sub-actions:
   - **Append** — appends a timestamped block to the note's content (mirrors
     the existing inbox→Note append pattern) **and** anchors that note here by
     setting/updating `timeline_at` to this anchor. (Decision: append-also-
     anchors — if you attached a note to 6:15, you want to see it at 6:15.)
   - **Link only** — content untouched; creates a `NoteEntityLink` so the note
     is reachable from this timeline moment without duplicating text and
     without anchoring it onto the timeline.

The search / append / link selection UI is lifted from the existing inbox→Note
routing (`StagingFloat`, `useNoteSuggestion`) — reused, not rebuilt.

### Rendering

`TimelineNoteCard` sorts into position by `timeline_at` alongside tasks /
events / routines. Visually distinct (note-paper treatment, not a checkbox
row) so a note never reads as an actionable item. Tapping it opens the note.

## Phase 2 — Drag-to-Reschedule

Drag is wrapped in `useTimelineDrag`, with a single `<DndContext>` in
`TodaySchedule`. Pick up = press-and-hold (~250ms) on an item.

### Drop target classes

1. **Within the same day (re-time):** drop into a gap → the item's time becomes
   that gap's anchor (reuses the Phase 1 midpoint-snap logic).
2. **Onto the date strip (A):** `DateNavigator` dates become live drop zones
   during a drag; the hovered date highlights; drop moves the item to that
   exact day, preserving time-of-day.
3. **Onto the push bar (B):** picking up an item slides in a
   Tomorrow / This Week / Someday bar; a drop routes through the existing
   `onPushTask`.

### Per-entity mutation rules

| Entity | Re-time (same day) | Cross-day / push |
|---|---|---|
| **Task** | `scheduled_for` time updated | `scheduled_for` date updated / `onPushTask` |
| **Event** (Google) | `updateEvent()` writes start/end to Google Calendar | `updateEvent()` with new date; **confirm dialog before any Google write** |
| **Routine** | **"This day only" vs "Every time"** prompt on drop | "This day only" = one-off task / skip+shift for that date; "Every time" = edit `time_of_day` on the routine |
| **Note** (`timeline_at`) | `timeline_at` updated | `timeline_at` date updated |

### Guardrails

- A Google event drag shows a confirm ("Move on Google Calendar?") — never a
  silent external write.
- A routine drag **always** prompts this-day-vs-all — never guesses.
- Every drag is **undoable** via the existing 10s undo-toast.
- Completed items are not draggable. All-day items do not re-time but can be
  moved cross-day.

## Testing

### Unit (Vitest + React Testing Library)

- `useTimelineInsert` — anchor-time math: midpoint + 5-min snap, section
  head/tail, all-day (no time), single-item section. Pure, exhaustively
  testable.
- `TimelineInsertPoint` — `+` renders between items and at section edges;
  wheel opens on tap, closes on `Esc` / tap-away; each segment fires
  `onPick(kind)`; keyboard-accessible.
- Note flow — new note sets `timeline_at`; append adds a timestamped block
  **and** anchors (`timeline_at` set); link-only creates a `NoteEntityLink`
  without modifying content and without anchoring.
- `useTimelineDrag` (Phase 2) — one test per cell of the per-entity rule
  table. Routine drop asserts the prompt appears (no silent mutation). Event
  drop asserts the confirm gate fires before `updateEvent`. Undo restores
  prior state.

### E2E (Playwright, Desktop + Mobile Chrome)

- Insert a Task between two items via the wheel → it lands at the midpoint
  time.
- Gated behind the known auth-fixture follow-up (no Playwright login fixture
  yet). Phase 1 E2E lands when the fixture lands; unit tests carry correctness
  until then.

### Manual matrix

Desktop hover-reveal · mobile upward arc · wall-kiosk 64px targets at 8 ft.

## Rollout

- Phase 1 ships standalone and is fully usable without Phase 2. No feature
  flag: insert points are additive and inert until tapped.
- Phase 2 layers drag on top without changing Phase 1 behavior.

## Out of Scope

- Any change to `PlanningSession`.
- Extracting a shared drag engine across the two surfaces (revisit only if the
  surfaces converge).
- Edge-auto-flip cross-day drag.
- Backfilling `timeline_at` on existing notes.
