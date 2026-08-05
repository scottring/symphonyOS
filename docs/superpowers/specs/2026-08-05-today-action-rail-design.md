# The Today row has one action rail

**Date:** 2026-08-05
**Branch:** `today-action-rail`
**Status:** design approved, ready for planning

## Problem

The right side of a Today row reads as chaos. The report was "jiggity jaggity
and a little chaotic," and that is a fair description of what the layout
actually produces.

Every trailing control on a row is a **conditional flex sibling** —
`ScheduleItem.tsx:754-850` renders six of them in sequence, each behind its own
`&&` guard. Because the title column is `flex-1`, the whole group is right-packed,
so only the *last* rendered control (the assignee avatar) forms a real column.
Everything to its left lands wherever that particular row's mix of buttons
happens to put it:

| Row type | Trailing controls, left to right | Count |
|---|---|---|
| Task | Promote · Reschedule · ⋯ · Context · Discussion · Avatar | 6 |
| Event | Start meeting · Promote · ⋯ · Context · Avatar | 5 |
| Routine (`minimal`) | Skip · Context · Avatar | 3 |

Three different rails, stacked on top of each other down the page. Nothing can
line up, because there is nothing to line up *to* — the rail has no defined
shape, it is whatever falls out of the guards.

### Two further offenders

Misalignment is the one you can name. Two more are doing as much damage:

**The spacing changes mid-rail.** The row container is `gap-3` (12px), but the
context+assignee group at line 789 is its own flex box at `gap-0.5` (2px). So a
task row reads `[icon]—12px—[icon]—12px—[icon][icon]` — the rhythm breaks
partway across. Inconsistent spacing reads as disorder even more strongly than
inconsistent position does, because the eye tracks rhythm before it tracks
absolute placement.

**The boxes are three different sizes.** Action buttons are `p-1.5` + `w-4 h-4`
= 28px. `ContextPicker` is `p-2` + `w-5 h-5` = 36px. The assignee avatar at
`size="sm"` is `w-6 h-6` = 24px. So even the controls that *do* share a column
across rows fail to optically align within one.

### Why this is worth fixing

A fixed action rail — same slots, same order, same width on every row — is
standard practice (Linear, Things, Superhuman) for a specific reason: **scanning
cost.** Once the eye learns "context lives *there*," it stops re-reading each
row's rail. Today the eye must re-parse the rail on every row, because the rail's
shape is a function of the row's type. That cost is paid on every glance at the
page, forever.

This is not a cosmetic ticket. It is the same correction
`2026-08-04-today-is-a-commitment-surface` applied to chrome rather than
content: the page accumulated affordances, each defensible on its own, and
nothing was ever removed or given a shape.

## The principle

The rail cannot be fixed by geometry alone, because the current strip
interleaves two different kinds of thing: **state** (this routine has a streak,
this task is flagged for discussion) and **actions** (reschedule this, skip
this). A strip that means two things cannot have one shape.

So the design draws the line explicitly:

> **The title cluster carries state. The right rail carries actions.**

State chips already live beside the title (coaching sparkle, subtask count,
project chip). Actions move to a rail with a fixed, memorizable shape. Anything
currently on the wrong side of that line moves.

## The rail

Replace `ScheduleItem.tsx:754-850` with a single fixed-width grid, rendered
unconditionally on every row: **four cells of 28px, uniform 4px gap.**

| Slot | Contents | Renders empty when |
|---|---|---|
| 1 · verb | task → `RescheduleButton`; routine → `SkipRoutineButton`; event (timed) → `StartMeetingButton` | row is completed or skipped |
| 2 · ⋯ | `ScheduleItemActionsMenu` | `variant === 'minimal'` |
| 3 · ctx | `ContextPicker` | never |
| 4 · who | `MultiAssigneeDropdown` / `AssigneeDropdown` | no family members loaded |

Empty slots render as spacers, not as nothing — that is what holds the columns
across row types.

**Exactly one verb per row.** No row type has two of them: a task can be
rescheduled, a routine can be skipped, a timed event can be started. They share
slot 1 without ever competing for it. This is what lets the rail be four cells
wide instead of six.

Total rail width is a constant **124px** (4×28 + 3×4). The current task rail
runs roughly 220px, so this also returns ~95px of horizontal space to titles on
the row type that needs it most.

### What moves, and why

**Promote/convert-to-project moves into `⋯`.** It currently occupies a full
column on both task and event rows — `opacity-0 group-hover:opacity-100`, so it
is invisible at rest while still consuming the width — for an action taken rarely.
A hover-only icon that costs a permanent column is the worst of both trades.
Cost: 1 tap → 2 taps.

**The discussion picker moves into `⋯`; the discussion *state* moves to the
title cluster.** `DiscussionPicker` is currently always visible on every task row
(line 810, no hover gate) for a flag that is set rarely. The control becomes a
"Flag for discussion…" menu item opening the same note popover. The flagged
state becomes a small amber indicator among the title chips — so a flagged task
never becomes less visible, it just moves from the action zone to the state zone
where it belongs. This is the principle above doing its job.

**Reschedule, skip, and start-meeting stay one tap.** The comments at lines
769-782 record that these were deliberately lifted out of the menu; that decision
stands. They are the verb slot.

### What deliberately does not change

**The avatar stays 24px, centred in its 28px cell.** Resizing it means editing
`MultiAssigneeDropdown`, which `SwipeableCard`, `UpNextHero`, `InboxTaskCard`,
`ClarityIndicator`, `DenseInboxRow`, and `BulkActionToolbar` all share. The blast
radius is not worth it, and a solid 24px circle already reads as equal visual
weight to a 16px line icon — filled shapes carry more weight per pixel.

**`ContextPicker` gets an optional size prop, defaulting to today's 36px.** Only
the Today rail passes the 28px variant. Every other call site is untouched.

**Hover behaviour is preserved verbatim.** Once cells are fixed, a control fading
in or out no longer shifts anything, so there is no reason to also change when
things appear. Context stays hover-revealed while unset (that is the
`tag-needs-context` nudge).

**Scope is `ScheduleItem` only.** `InboxTaskCard`, `DenseInboxRow`, and
`UpNextHero` have their own trailing controls and are explicitly out of scope for
this pass.

## Components

`RowActionRail` — a new component in `src/components/schedule/`, taking the item
plus the handlers the current trailing controls receive. It owns the grid, the
slot assignment, and the spacers. `ScheduleItem` renders it as a single child.

This is the isolation test the current code fails: today, "what does the right
side of a row look like?" can only be answered by reading six guards spread
across ~100 lines of `ScheduleItem`. After this, it is one component with one
job, and its shape is legible at a glance.

`ScheduleItemActionsMenu` gains two items (promote/convert, flag for discussion)
and the modal/popover wiring they need.

`ContextPicker` gains a `size?: 'sm' | 'md'` prop, `'md'` being current
behaviour.

## Testing

- `RowActionRail` renders exactly four cells for every row type — task, event,
  timed event, routine, `minimal` routine, completed task. This is the invariant
  the whole spec exists to establish, so it is tested directly rather than
  inferred from snapshots.
- The verb slot holds the right control per type, and is empty for
  completed/skipped rows.
- Promote and flag-for-discussion are reachable from `⋯` and still open their
  existing modal/popover.
- A discussion-flagged task shows its indicator in the title cluster.
- Existing `ScheduleItem.test.tsx` and `TodayInvariant.test.tsx` continue to pass.

Green tests are not the finish line here: the complaint was visual, so the work
is not done until the rendered page has been looked at.

## Risks

**Tests that find controls by role/label may break** where a control moved into
the menu — those assertions need updating to open the menu first, not deleting.

**Two taps instead of one** for promote and discussion-flag. Accepted
deliberately; both are low-frequency and neither is time-critical.

**`ContextPicker` is shared.** The size prop must default to current behaviour,
and the other call sites must not be passed the new value.
