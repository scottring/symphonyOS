# Today is a commitment surface

**Date:** 2026-08-04
**Branch:** `intentional-today`
**Status:** design approved, ready for planning

## Problem

Today assembles six task pools (`src/lib/today/taskPools.ts`): `selectTimed`,
`selectCarriedOver`, `selectSlipped`, `selectInbox`, `selectWeek`, `selectMonth` —
plus events, routines, and med doses. Three of those pools are backlog, not
commitments: the entire untriaged inbox (48 items today), the week staging pool,
and the month staging pool. On top of that, 39 active routines have no
`time_of_day` and render as undifferentiated all-day rows.

The result is a page that cannot be finished. That is not a sizing problem, and
capping it does not fix it: **Today is doing two incompatible jobs.** An
execution surface earns trust by being completable — you look at it and know
you're done. A triage surface is by definition never done. Fused together, Today
can never be finished, so it stops being trusted, so it stops being read, so work
rots in it.

Every one of those pools arrived for a defensible reason. Nothing was ever
removed. `f47cc307` ("spend the page on the day, not on itself") started the
correction on chrome; this spec finishes it on content.

### The failure this also closes

On 2026-08-04 three tasks — "schedule podiatrist", "schedule dermatology", "pack
for ny trip" — were believed lost. They were in the database, `bucket='week'`,
`week_start='2026-07-26'`: placed on a week that had passed. `belongsToWeek()`
correctly returns `false` for a past week, so `/week` didn't show them, Today
didn't show them (no `scheduled_for`), and the month row had moved on. The only
surface that would have surfaced them is the weekly planning session, which
hadn't run in nine days.

Stated precisely:

> **Expiry solved aging for _dated_ work. Nothing ages _placed-but-undated_ work.**

`2026-08-03-today-dates-expire` gave dated tasks a lifecycle (today → carried
over → slipped). A task placed on a week or a month has no equivalent. This spec
gives it one.

## The invariant

> **Anything on Today that is not a commitment gets a fixed space budget that
> does not grow with backlog size.**

One line is one line whether the pool holds 12 items or 1,200. The moment a
section's height becomes a function of how much you haven't done, Today starts
regressing toward what it is now. This is the regression guard, and it is
testable (see Testing).

`f47cc307` already states the same rule in its own words, about the assistant
lines: *"Still a bare list with no header and no count: that property is what
kept it from growing into another 57-row section."*

## What Today renders

### Body — commitments only, and it can be finished

| Renders | Source | Change |
|---|---|---|
| Events on the viewed date | existing | none |
| Tasks dated to the viewed date | `selectTimed` | none |
| Timed routines due today | existing | none |
| Untimed routines → **one collapsed row** | existing Unscheduled section | bounded |
| Carried over (1–2 days past) | `selectCarriedOver` | none |

A routine with a time is a commitment to a moment and keeps its timeline row. A
routine without one is not, and 39 of them are not worth 39 rows — but they are
your daily rhythm, and "did I do my daily stuff" is a question that belongs on
Today. So they collapse to a single row carrying its own answer:

```
Anytime · 4 of 12 done                                    ⌄
```

TodayView already has an Unscheduled section that starts collapsed and holds the
untimed-routine slab (`TodayView.tsx:313-317`). The work is to make its
**collapsed** presentation a single fixed-height row with a completion count, not
to build a new section.

### Mouth — bounded, drainable, impossible to lose

`SlippedPointer` is already exactly the right pattern, and its own doc comment
states the contract:

> *The floor guarantee. Expiry means work leaves Today on its own, so the pointer
> back to it must be impossible to lose: whenever the slipped queue is non-empty
> this renders, it never expands inline, and it has no dismiss control.*

We generalize it from "slipped dated tasks" to "everything that needs attention",
preserving all three properties verbatim: always renders when non-empty, never
expands inline, no dismiss control, and it sits **outside** the "Your day is
clear" ternary (trap #1 in the expiry spec — a day whose only work had slipped
rendered "Your day is clear" with the queue invisible behind it).

```
⌸  3 need attention · oldest 38 days                            Review
```

**A count that can never reach zero is wallpaper.** This one counts only what is
genuinely wrong, so it can hit zero and usually will. That is what makes it a
signal rather than decoration, and it is why this is not a nav badge over the
whole 96-item backlog.

Four reasons qualify:

| Reason | Rule | Threshold |
|---|---|---|
| `slipped` | dated, 3+ days past | `GRACE_DAYS = 2` (existing) |
| `stranded-week` | `bucket='week'`, `week_start` before the current week | immediate |
| `aging-month` | `bucket='month'`, aged since **`created_at`** | `AGING_MONTH_DAYS = 45` |
| `aging-inbox` | `bucket='inbox'`, aged since **`created_at`** | `AGING_INBOX_DAYS = 14` |

**Why month aging is not month *stranding*.** `tasks` has exactly one period
anchor — `week_start`. There is no month column, and this spec forbids schema
changes. So a `bucket='month'` task has no month of its own; by the same rule
that makes `weekStart: null` mean "the current week", it can never be *placed on
a past month*, and `stranded-month` is not a derivable state.

Month items still need an aging signal — there are 31 of them, and burying them
is the same hole the podiatrist fell through. So the rule is honest about what it
knows: not "you placed this on a month that passed" but "this has sat in the
month bucket for 45 days." 45 covers a full month plus slack, so a genuine
this-month placement never trips it.

If a month anchor is ever added, this becomes `stranded-month` with the same
shape as `stranded-week`. That is a later decision, not a prerequisite.

Age for `aging-inbox` is measured from **`created_at`, never `updated_at`**.
`tasks` has no `updated_at` trigger (unlike `contacts`, `projects`, and
`event_notes`, which all do), so the column is written only when app code happens
to set it and cannot be trusted as a "last touched" signal. Measuring from it
would silently under-report age on exactly the oldest items.

`bucket='someday'` is **excluded** from aging entirely. Someday means "no
timeline"; aging it would make the signal un-drainable, which is the exact
failure mode this design exists to avoid.

### Proposals

The unprompted assistant lines from `f47cc307` stay as they are, with one added
constraint: **capped at a fixed number per day.** Relevance decides *which*
items surface, never *how many*. Without the cap, Today's finishability is only
as good as the model's restraint, and the invariant is silently at the mercy of a
scoring function.

## Carry-forward is read-side. The AI writes nothing.

The expiry spec's load-bearing decision:

> *Expiry is a READ-SIDE contract and never writes. `scheduled_for` is never
> cleared. A wrong filter is a one-line fix where a wrong migration against
> Scott's only copy of his life is not — and the original date *is* the aging
> signal.*

That reasoning applies unchanged here, so carry-forward is derived, not written:

- `isStaleWeekPlacement(task, viewedWeekStart)` **already exists and is tested**
  (`src/lib/today/weekPlacement.ts:107`). It returns `left-behind` for exactly
  the podiatrist case. No new predicate is needed for weeks.
- A month equivalent is added alongside it, same shape.
- `week_start` is never mutated. The original placement *is* the aging signal —
  "stranded 9 days" is only knowable because the stale value is kept.

Consequences: **the assistant is granted no write authority at all.** No cron, no
midnight/timezone edge, works offline, works on the wall, and the whole feature
reverts by changing a filter.

## Non-goals

- **No new page.** Inbox stays capture-only (`InboxView.tsx:331` — *"The inbox is
  capture-triage ONLY … Those belong to their horizon views"*), `/week` and
  `/month` keep their placements. The ladder from the placement cascade is
  untouched.
- **No nav badge.** It would show ~96 and habituate within a week.
- **No pool restructuring, no flattening of the horizon ladder.**
- **No schema change, no migration, no backfill.**

## Components and data flow

**New — `src/lib/today/attention.ts`:**

```ts
export type AttentionReason =
  | 'slipped' | 'stranded-week' | 'aging-month' | 'aging-inbox'

export const AGING_INBOX_DAYS = 14
export const AGING_MONTH_DAYS = 45

export interface AttentionItem {
  task: Task
  reason: AttentionReason
  ageDays: number
}

export function selectNeedsAttention(
  tasks: Task[],
  match: Match,
  now: Date,
  weekStart: Date,
): AttentionItem[]
```

No `monthStart` parameter: month aging is measured from `created_at`, so the
current month's boundary is never needed.

`Match` is currently declared but **not exported** in `taskPools.ts:4`. Export it
there and import it here rather than redeclaring — two copies of the assignee
predicate drifting apart is precisely the class of bug `weekPlacement.ts` was
extracted to prevent.

Deterministic and `now`-injected, matching `curate.ts` and `urgency.ts`. Composed
from existing predicates (`selectSlipped`, `isStaleWeekPlacement`) rather than
re-deriving them, so the union stays correct by construction — the same technique
the expiry work used for `selectCarriedOver`/`selectSlipped`.

**Changed:**

| File | Change |
|---|---|
| `computeTodayData.ts` | drop `inboxTasks`/`weekTasks`/`monthTasks`; add `attentionItems` |
| `lib/today/types.ts` | matching `TodayData` shape change |
| `TodayView.tsx` | remove `PullStrip`; remove both inline `StagingFloat` triggers (L465, L469); swap `SlippedPointer` → `AttentionLine` |
| `SlippedPointer.tsx` | becomes `AttentionLine.tsx`, taking `AttentionItem[]` |
| `SlippedReview.tsx` | review surface accepts all four reasons, grouped by reason |

**Deleted from Today (not from the app):** `PullStrip.tsx` is Today-only and goes.
`StagingFloat` stays — it is still used by the horizon pages.

**Untouched:** `selectInbox`/`selectWeek`/`selectMonth` remain exported and
tested. `InboxView`, `useSystemHealth`, and the horizon pages still consume them.
Only Today stops calling them.

## Known follow-through

- **`PullStrip` was the "pull something into today" affordance.** Removing it
  removes that path. Its replacement is Plan-today plus the proposals; if that
  proves too thin in walkthrough, the answer is a Plan-today entry point, **not**
  restoring an unbounded strip.
- **`computeClaritySteps` reads `inboxCount` and `weekCount`** (`TodayView.tsx:485-495`)
  to compute the clarity score. Those pools no longer render on Today; decide
  whether clarity keeps counting them (defensible — it measures system health, not
  the page) or moves to the attention set. Default: leave it, it is a different
  question.
- **`totalItems` in `computeTodayData` includes `inboxTasks`** (L96). It must stop,
  or "Your day is clear" breaks — this is exactly expiry trap #1 recurring.

## Testing

1. **The invariant, as an actual test.** Render Today with a 5-item backlog and a
   500-item backlog; assert the non-commitment row count is *identical*. This is
   the regression guard and the most important test in the change.
2. **`selectNeedsAttention` unit table** over `src/lib/today/__fixtures__` — one
   case per reason, plus the boundaries: exactly `GRACE_DAYS`, exactly
   `AGING_INBOX_DAYS`, `someday` never qualifying, completed tasks never
   qualifying.
3. **Regression for the incident.** A `bucket='week'` task with
   `week_start='2026-07-26'` viewed on 2026-08-04 appears in the attention set as
   `stranded-week`. This test is the podiatrist.
4. **Floor guarantee preserved.** `AttentionLine` renders in *both* branches of
   the "day is clear" ternary, and exposes no dismiss control.
5. **Proposal cap** holds regardless of how many proposals score well.
6. **No writes.** Assert `selectNeedsAttention` and the render path issue zero
   mutations — the read-side contract, enforced rather than documented.

## Rollout

Read-side only: no migration, no backfill, no cron. The change is revertible by
restoring three pool calls in `computeTodayData`. Verify on `localhost:5173`
against real data before merge — the stranded trio should appear in the attention
line on first load, which is the end-to-end proof.
