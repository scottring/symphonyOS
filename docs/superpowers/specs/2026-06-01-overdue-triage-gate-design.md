# Overdue Triage Gate + Weekend Triage Option — Design

**Date:** 2026-06-01
**Status:** Approved design, pre-implementation
**Surfaces:** Desktop Today + Mobile. **Not** the kiosk/wall (see Reconciliation).

---

## Problem

Today's view jams overdue tasks inline at the top of the timeline as a pile of
rows (`OverdueSection`). This is the loudest noise on the surface, it's the wrong
*category* (overdue is decision-debt from the past, not part of "today's
schedule"), and it grows silently until it becomes permanent wallpaper —
"overdue bankruptcy." A plain collapse would hide it, which fights *active
management*: the one thing that most needs a decision gets tucked behind a fold
and rots.

Separately, the triage horizon ladder (`inbox → week → month → quarter → timed`)
has no way to say "do it this/next weekend," even though a large share of
personal/family work is weekend work.

## Goals

1. Replace the inline overdue pile with a **collapsed-but-accountable triage
   gate** that forces a decision per item and escalates stale items.
2. Pull overdue out of the timeline so "today" reads as today.
3. Add **"This weekend" / "Next weekend"** as triage destinations, cheaply.
4. Keep the kiosk/wall calm — no overdue triage there.

## Non-Goals (YAGNI)

- No ranked "assistant feed" yet (separate, later effort).
- No new `dismissed` archive state (Drop reuses an existing bucket — see below).
- No soft "sometime this weekend" bucket (weekend is a date shortcut, not a bucket).
- No right-rail changes (separate, simpler deletion effort).
- No EndOfDayCard build-out (named as an integration point only).

---

## Data model (no schema change)

Uses existing `Task` fields (`src/types/task.ts`):

- `bucket?: 'inbox' | 'week' | 'month' | 'quarter' | 'timed'`
- `scheduledFor?: Date` (only set when `bucket === 'timed'`)
- `isAllDay?: boolean`
- `completed: boolean`

**"Overdue"** = `bucket === 'timed' && scheduledFor < startOfToday && !completed`.
(`isSomeday` is legacy/dead — do not use.)

No migration required.

---

## Behavior — Overdue Triage Gate

### Collapsed state (default)
A single sticky strip at the top of the Today list (replacing `OverdueSection`):

```
⚠  8 overdue — triage
```

- Shows only when count > 0. **Zero overdue → strip is not rendered** (calm).
- Respects the active domain filter (work/family/personal), like the rest of Today.
- Persistent: it stays until the count reaches zero. It cannot be dismissed
  without deciding on its items — that is the accountability mechanism.

### Escalation
- Items **3+ days overdue** escalate: the count badge / strip adopts an
  intensified (red) treatment so genuinely-rotting items get *louder*, not
  quieter. (Threshold constant, default 3 days.)

### Expanded state (on tap)
Expands into a triage list. Each row: task title + "N days overdue" + three
one-tap actions:

| Action | Effect |
|---|---|
| **Do today** | `bucket: 'timed'`, `scheduledFor: today`. Drops into the timeline. |
| **Reschedule** | Opens existing `WhenPicker` → week / month / specific date / **This weekend** / **Next weekend**. |
| **Drop** | Push to the **`quarter`** back-burner bucket (the modern "someday"): leaves overdue, leaves this-week, stops nagging, caught only by long-horizon review. *Not* inbox (inbox = active triage queue → would churn straight back). Not deleted. |

`Delete` remains available as a separate, deliberate gesture for genuine garbage
(existing task delete affordance — not one of the three primary triage actions).

### Empty / cleared
When the last item is triaged, the strip disappears and the timeline reclaims the
space.

---

## Behavior — Weekend Triage Option

"This weekend" / "Next weekend" are **WhenPicker date shortcuts**, not a new
bucket. They sit alongside the existing "Tomorrow" / "Next Week" presets.

- **This weekend** → upcoming Saturday: `bucket: 'timed'`,
  `scheduledFor: <upcoming Saturday>`, `isAllDay: true`.
- **Next weekend** → the Saturday after that.
- "Upcoming Saturday": if today is Sat/Sun, "this weekend" means the *current*
  weekend's Saturday; otherwise the next Saturday. (Exact rule to confirm with a
  small date helper + tests.)

Because the picker is reused, these appear automatically in the triage gate's
**Reschedule** action and anywhere else `WhenPicker` is used.

Rationale for date-shortcut over a soft bucket: zero schema/filtering work,
immediately useful everywhere. If usage shows people genuinely want a soft
"sometime this weekend, no day" pile, promote it to a bucket later.

---

## Components

| Component | Path | Change |
|---|---|---|
| `OverdueTriageStrip` | `src/components/schedule/OverdueTriageStrip.tsx` | **New.** Collapsed strip + expanded triage list + escalation styling. |
| `TodayView` | `src/components/schedule/TodayView.tsx` | Replace `OverdueSection` render with `OverdueTriageStrip`. |
| `WhenPicker` | `src/components/triage/WhenPicker.tsx` | Add "This weekend" / "Next weekend" presets. |
| weekend date helper | `src/lib/` (e.g. `weekendDates.ts`) | **New.** `upcomingSaturday(now)` / `followingSaturday(now)`, pure + tested. |

Reuse existing task-mutation paths (the same update calls `OverdueSection` /
task cards already use) for Do today / Reschedule / Drop — no new mutation layer.

---

## Kiosk / Wall

Per decision: **the wall renders zero overdue triage.** Triage is a sit-down,
focused, per-item decision; the wall is 8-foot glance-able, mouse-drag-only input,
shared and family-facing, and much overdue is private work. The wall stays the
calm household "today" (timed events, routines, meals).

`/wall-v2` is separate code from desktop Today, so the new gate will not leak onto
the wall by default.

### ⚠ Reconciliation needed (open)
Prior specs exist: `2026-05-28-wall-overdue-design.md` and
`2026-05-28-wall-overdue-tap-design.md`. The wall already has *some* overdue
handling. The "wall stays silent" decision may require gating or removing that
existing behavior — **this must be confirmed with Scott before implementation**,
because it may have been a deliberate family-facing choice. Do not assume removal.

---

## Testing

- `weekendDates` helper: pure unit tests across each weekday, including Sat/Sun
  edge cases and year/month boundaries.
- `OverdueTriageStrip`:
  - hidden when count 0; visible with correct count when > 0
  - expand/collapse
  - each of Do today / Reschedule / Drop calls the correct mutation with the
    correct bucket/date
  - escalation styling at the 3-day threshold
  - respects domain filter
- `WhenPicker`: "This weekend" / "Next weekend" presets set the expected
  `bucket`/`scheduledFor`/`isAllDay`.

---

## Integration point (not built here)

The existing **EndOfDayCard / daily-review** placeholder is the natural home for a
"triage your overdue" prompt. Named here so the gate is built with that future
hook in mind; not implemented in this slice.

---

## Open decisions resolved

- Active management = **forced triage** (persistent strip, escalation), not
  quiet-available or auto-aging.
- Drop = **`quarter` back-burner**, not inbox, not delete.
- Weekend = **date shortcut**, not a new bucket.
- Wall = **silent** (pending wall-overdue reconciliation above).
