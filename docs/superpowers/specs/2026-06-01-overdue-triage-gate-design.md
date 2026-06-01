# Carried-Over (Overdue) Section + Weekend Triage Option — Design

**Date:** 2026-06-01
**Status:** Approved design, pre-implementation
**Surfaces:** Desktop Today + Mobile. Wall keeps its existing overdue *glance* (see Wall).

---

## Problem

Today's view jams overdue tasks inline at the top of the timeline as an
undifferentiated pile of rows (`OverdueSection`). Two things are wrong:

1. **Wrong category.** Overdue is not part of "today's schedule" — it's work that
   *should already have been done* and rolled forward. Mixed inline, it muddies
   what today actually looks like.
2. **No structure or actions.** It's just rows. There's no calm, consistent place
   that says "here's what carried over — knock it out," with one-tap ways to do so.

Separately, the triage horizon ladder (`inbox → week → month → quarter → timed`)
has no way to say "do it this/next weekend," even though a large share of
personal/family work is weekend work.

### Framing (important)

Carried-over items are **obligations, not emergencies.** They are things that need
doing and meant-to-be-done-already — they carry quiet weight, but they are **not
urgent/crisis**. The design must read as *calm and matter-of-fact*, never as an
alarm. No red, no warning icons, no "urgent" language. Present and actionable, not
nagging.

## Goals

1. Pull overdue out of the inline timeline into a dedicated, calm **"Carried over"**
   section so "today" reads as today.
2. Make carried-over items **visible and actionable by default** — expanded, near
   the top, with one-tap actions — because they need doing.
3. Add **"This weekend" / "Next weekend"** as triage destinations, cheaply.
4. Leave the wall's existing overdue glance intact.

## Non-Goals (YAGNI)

- No "urgent"/alarm treatment — explicitly rejected (calm, plain styling only).
- No ranked "assistant feed" yet (separate, later effort).
- No new `dismissed` archive state (Drop reuses an existing bucket — see below).
- No soft "sometime this weekend" bucket (weekend is a date shortcut, not a bucket).
- No right-rail changes (separate, simpler deletion effort).
- No EndOfDayCard build-out (named as an integration point only).
- No new wall behavior (the existing wall overdue glance stays as-is).

---

## Data model (no schema change)

Uses existing `Task` fields (`src/types/task.ts`):

- `bucket?: 'inbox' | 'week' | 'month' | 'quarter' | 'timed'`
- `scheduledFor?: Date` (only set when `bucket === 'timed'`)
- `isAllDay?: boolean`
- `completed: boolean`

**"Carried over" (overdue)** = `bucket === 'timed' && scheduledFor < startOfToday
&& !completed`. (`isSomeday` is legacy/dead — do not use.)

No migration required.

---

## Behavior — Carried-Over Section

### Default state: expanded, calm, at the top
A dedicated section at the top of the Today list (replacing `OverdueSection`):

```
Carried over
  ☐ Return shoes to Amazon        2 days   [Do today] [···]
  ☐ Call plumber                  1 day    [Do today] [···]
```

- **Expanded by default.** These need doing, so they're visible, not folded behind
  a disclosure triangle.
- **Calm, plain styling.** No red, no ⚠, no "urgent" label. It reads as ordinary
  carried-over work. Label: **"Carried over."**
- **"N days" shown as plain context**, not a scold — quiet text beside the item.
- **Ordered oldest-first** (longest-waiting at top). This replaces any
  color-coded "escalation" — the genuinely-stale item simply rises, no alarm.
- **Collapse is an optional user action**, not the default state — you may fold the
  section once you've acknowledged it. (Collapse preference persistence: nice-to-have,
  decide during implementation; default is always expanded on load.)
- **Hidden entirely when empty.** Zero carried-over → section not rendered.
- **Respects the active domain filter** (work/family/personal), like the rest of Today.

### Per-item actions
Each row offers:

| Action | Effect | Prominence |
|---|---|---|
| **Do today** | `bucket: 'timed'`, `scheduledFor: today`. Moves into the timeline. | Primary |
| **Reschedule** | Opens existing `WhenPicker` → week / month / specific date / **This weekend** / **Next weekend**. | In `[···]` |
| **Drop** | Push to the **`quarter`** back-burner bucket (the modern "someday"): leaves overdue, leaves this-week, stops surfacing here, caught only by long-horizon review. *Not* inbox (inbox = active triage queue → would churn straight back). Escape hatch for genuine junk, not the headline action. | In `[···]` |

`Delete` remains available as a separate, deliberate gesture (existing task delete
affordance — not one of the triage actions).

### Safety valve for large lists
If the carried-over list is large (default threshold ~8), show the top few
oldest-first with a **"+N more"** expander, so a bad week doesn't recreate the
wall-of-rows pile. In normal use the list is short (items get done fast).

---

## Behavior — Weekend Triage Option

"This weekend" / "Next weekend" are **WhenPicker date shortcuts**, not a new
bucket. They sit alongside the existing "Tomorrow" / "Next Week" presets.

- **This weekend** → upcoming Saturday: `bucket: 'timed'`,
  `scheduledFor: <upcoming Saturday>`, `isAllDay: true`.
- **Next weekend** → the Saturday after that.
- "Upcoming Saturday": if today is Sat/Sun, "this weekend" means the *current*
  weekend's Saturday; otherwise the next Saturday. (Exact rule pinned by a small
  pure date helper + tests.)

Because the picker is reused, these appear automatically in the carried-over
section's **Reschedule** action and anywhere else `WhenPicker` is used.

Rationale for date-shortcut over a soft bucket: zero schema/filtering work,
immediately useful everywhere. Promote to a real soft bucket later only if usage
shows people want a "sometime this weekend, no day" pile.

---

## Components

| Component | Path | Change |
|---|---|---|
| `CarriedOverSection` | `src/components/schedule/CarriedOverSection.tsx` | **New.** Expanded calm section, oldest-first, per-item actions, "+N more", optional collapse. Replaces `OverdueSection`. |
| `TodayView` | `src/components/schedule/TodayView.tsx` | Render `CarriedOverSection` in place of `OverdueSection`. |
| `WhenPicker` | `src/components/triage/WhenPicker.tsx` | Add "This weekend" / "Next weekend" presets. |
| weekend date helper | `src/lib/weekendDates.ts` | **New.** `upcomingSaturday(now)` / `followingSaturday(now)`, pure + tested. |

Reuse existing task-mutation paths (the same update calls `OverdueSection` / task
cards already use) for Do today / Reschedule / Drop — no new mutation layer.

---

## Wall / Kiosk

**No change.** The wall keeps its existing overdue *glance* (per
`2026-05-28-wall-overdue-design.md` / `wall-overdue-tap-design.md`). Rationale: if
carried-over items are "need to get done" obligations, a family-facing glance that
the household has work slipping is consistent with that — which is why the wall
overdue feature exists. The interactive carried-over section here is a
desktop/mobile addition only; it is not added to `/wall-v2` (separate code, no
leak). The wall reconciliation raised earlier is resolved: **keep the wall glance.**

---

## Testing

- `weekendDates` helper: pure unit tests across each weekday, including Sat/Sun
  edge cases and month/year boundaries.
- `CarriedOverSection`:
  - hidden when empty; visible with correct items when non-empty
  - expanded by default; optional collapse toggles
  - ordered oldest-first
  - "+N more" appears past the threshold and reveals the rest
  - Do today / Reschedule / Drop each call the correct mutation with the correct
    bucket/date
  - respects the active domain filter
  - calm styling assertions where practical (no alarm/urgent classes)
- `WhenPicker`: "This weekend" / "Next weekend" presets set the expected
  `bucket`/`scheduledFor`/`isAllDay`.

---

## Integration point (not built here)

The existing **EndOfDayCard / daily-review** placeholder is the natural home for a
"clear your carried-over" prompt. Named so the section is built with that future
hook in mind; not implemented in this slice.

---

## Open decisions resolved

- Framing = **calm obligation, not urgent/emergency.** No red/alarm. Label "Carried over."
- Default = **expanded** and at the top; collapse is an optional user action.
- Escalation = **oldest-first ordering**, not color alarms.
- Drop = **`quarter` back-burner**, not inbox, not delete.
- Weekend = **date shortcut**, not a new bucket.
- Wall = **keep existing glance**; no triage section added to the wall.
