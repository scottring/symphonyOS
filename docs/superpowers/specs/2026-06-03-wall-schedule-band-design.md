# Wall kiosk: prioritized Schedule band vs Home rhythm

**Date:** 2026-06-03
**Surface:** `wall-v2` (the `/wall-v2` Chromium kiosk on the Raspberry Pi touchscreen)
**Status:** Approved design, ready for implementation plan

---

## Problem

The center "Today's plan" timeline groups everything by time of day
(Overdue → All day → Morning → Afternoon → Evening → Night → Anytime), and
**inside each section calendar events, routines, and tasks are intermixed** —
same card size, distinguished only by a small icon/tint. A real commitment like
"Soccer 4:00" sits in the same visual stream as "Brush teeth." Walking past the
wall, you cannot tell at a glance *what is actually happening today and when*
without parsing a stream of chores.

## Goal

Make **timed commitments** the prioritized, separated top of the wall, and demote
the do-it-whenever rhythm below. Glanceable from 6 feet: read the day's real
schedule in the top third without parsing a single chore.

## The split rule (the heart of it)

An item is a **commitment** → goes in the **Schedule band** if it has a real
clock time:

- **Calendar event** with a `startTime` and **not** all-day.
- **Task** with `bucket === 'timed'` — i.e. `scheduledFor` is set and
  `isAllDay` is false. (Per `types/task.ts`, `scheduledFor` is only set when
  `bucket === 'timed'`, so on a `TimelineItem` this reads reliably as
  `startTime != null && !allDay` for `type === 'task'`.)

Everything else is **rhythm** → stays below:

- **All routines** — even ones with a `time_of_day`. Routines are rhythm, not
  commitments. A "brush teeth 7:30" routine never competes with appointments.
- **Untimed tasks** (no scheduled clock time).
- **All-day tasks.**
- **Carried-over / overdue** tasks.

Concretely, the adapter predicate for the band is:

```
isCommitment(item) =
  (item.type === 'event' && item.startTime != null && !item.allDay) ||
  (item.type === 'task'  && item.startTime != null && !item.allDay)
```

Routines are excluded from the band by `type`, regardless of their time.

## Layout — center column, top → bottom

### 1. Schedule band (prioritized, visually dominant)

- A single **chronological** list ordered by `startTime`. No time-of-day
  sub-headers — time *is* the ordering.
- Each row leads with a **large time** (`2:00p`) then the title. Cards are
  larger, higher-contrast, more accented than rhythm rows (kiosk Level-1/2
  hierarchy: this is what the family needs to know first).
- **Calendar events stay subtly distinguished** from timed tasks (a calendar
  marker / the event's calendar color), so the firmest commitments read at a
  glance — but events and timed tasks live in **one unified time-sorted
  stream**, not separate sub-bands.
- **All-day events** ("Mia field trip", "Iris OOO") sit in a small `All day`
  strip at the **top of the band** — day-level commitments, not buried with
  chores.
- **Family dinner** stays in the band as its special card (keeps the recipe
  viewer tap behavior it has today), placed by its time.
- **Empty state:** when there are no timed commitments today, the band still
  renders a calm `No appointments today` placeholder, so the separation is
  always visible even on a quiet day.

### 2. Home rhythm (demoted, calmer)

- Smaller cards, muted treatment.
- Keeps the **Morning / Afternoon / Evening / Night / Anytime** grouping.
- Contains **only** routines + untimed tasks (timed events/tasks have moved up
  into the band).

### 3. Carried over (calm, inside the rhythm zone, below the schedule)

- Carried-over / overdue tasks render as a calm section **below** the schedule,
  inside the rhythm zone. They are untimed obligations, not urgent — this
  matches how the wall already frames "carried over."
- (Decision: *below* the schedule, not pinned above it. Events are the clear
  top priority; carried-over does not push today's real appointments down.)

## Implementation shape (minimal, testable)

### Adapters — `src/components/wall-v2/wallV2Adapter.ts`

- **Add** `adaptScheduleBand(today, members, now, dinnerEvent)` → returns the
  timed agenda (all-day strip + chronological timed rows, dinner card placed by
  time). Pure function, unit-tested like the existing adapters.
- **Narrow** `adaptTimelineSections(...)` to emit only the **rhythm** sections +
  the **carried-over** section. It must filter timed events/tasks out of the
  Morning/Afternoon/Evening/Night time buckets before grouping, so a timed item
  never appears in both the band and the rhythm zone.
- Reuse the existing `dedupeRoutines`, `iconForItem`, `memberBubble`,
  `adaptOverdueSection`, and dinner-promotion logic where applicable.

### Components

- **New** `src/components/wall-v2/WallV2ScheduleBand.tsx` — renders the
  prioritized block (all-day strip + chronological timed rows + empty state).
- `WallV2Timeline.tsx` renders **band-then-rhythm**: the Schedule band on top,
  the existing sectioned rhythm list below.
- Reuse `WallV2EventCard` with a `prominent` (band) variant vs. the muted
  rhythm variant — avoid a second card component if the existing one can carry a
  size/emphasis prop.

### Wiring — `WallV2Shell.tsx`

- Compute the band alongside the existing `timeline` memo and pass both into
  `WallV2Timeline`.
- The **hide-routines toggle**, **tap-to-complete**, **action sheet**
  (`WallV2ItemActionSheet`), **drag-scroll** (`useDragScroll`), and **dark
  mode** all carry through unchanged — the band and rhythm rows route taps the
  same way they do today (prefixed ids: `task-` / `routine-` / `event-` /
  `dinner-`).

## Out of scope (YAGNI)

- No change to the left date column, right widget column, or action dock.
- No new data fetching — same `useWallData` / meal events sources.
- No change to the underlying time-of-day bucketing in `useWallData`.
- No reworking of overdue *computation* — only its placement (already below).

## Testing

- Unit tests for `adaptScheduleBand`: timed event, timed task, all-day event,
  dinner placement, empty → placeholder, chronological ordering, routines
  excluded.
- Unit tests for the narrowed `adaptTimelineSections`: timed items removed from
  rhythm buckets, routines retained (including timed routines), carried-over
  below.
- Component smoke test for `WallV2ScheduleBand` (band renders rows + empty
  state).

## Success criteria

- From 6 feet, the day's timed commitments are readable in the top third of the
  center column without reading any chore.
- A timed item appears exactly once (band only), never duplicated in rhythm.
- Routines — including timed ones — never appear in the Schedule band.
- Quiet day still shows the band with a `No appointments today` placeholder.
