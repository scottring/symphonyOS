# Item pathways: where everything comes from

Traced 2026-09-19 against `main` @ `46aa9280`. Line numbers are from that commit.

> **2026-09-21 — one enduring action.** The placement model in §1 and §3 changed
> (decided in the D1 sitting, 2026-09-20). A task is ONE row for its whole life:
>
> | Record | Table | Meaning |
> | --- | --- | --- |
> | commitments | `task_commitments` | "committed for" a season / month / week — one row per period, each with its own status (`open` / `done` / `carried` / `removed`, `carried_to`) |
> | the day | `tasks.scheduled_for` + `is_all_day` | scheduled on a day |
> | focus | `task_focus` | this PERSON chose it for this day (one row per person, task, date) |
> | history | `task_placement_events` | every commitment and schedule change, written by triggers |
> | aliases | `task_aliases` | ids retired by the 2026-09-21 chain fold → the enduring row |
>
> - **Nothing is copied any more.** Taking a month/season task lower ADDS the lower
>   commitment (or the day) on the same row; the higher commitment stays, so the
>   period's look-back still sees the whole list, marked "→ Wednesday, September 23"
>   / "→ September 13–19". Moving UP releases the lower commitments. "Keep" carries the
>   SAME id: this period's row → `carried`, next period → `open`.
> - **Scheduling touches only the day** (and aligns the cached `week_start` with it);
>   unscheduling keeps the week and period commitments and the focus.
> - **Focus is personal.** `tasks.planned_on` is no longer written for tasks; it is read
>   only as a legacy fallback on rows with no focus rows (iOS still writes it).
> - `tasks.bucket` / `week_start` / `month_start` / `season_start` are a **cache** of the
>   lowest open commitment (`timed` when dated), kept by DB triggers both ways at trigger
>   depth 1 and mirrored locally by `lib/placement/model.deriveCache()`. Readers that only
>   need "lowest level" (Today's pools, the week list) keep reading the cache; readers that
>   must see a row on MORE than one list (`selectPeriodTasks`, the month rail) read the
>   commitments via `committedTo()`. A row with no records answers from its cache with the
>   NULL rule below.
> - Every writer goes through `lib/placement/intentions.planPlacement()` inside
>   `updateTask`: the same intention through drag, arrow, pin or verb produces the same
>   state. `lib/planning/lineage.ts` is a thin shim over the row; `copyDown`,
>   `isDescent`, `livePlacedCopyOf` and the copy-down explainer are gone.
> - `source_id` survives only as the "came from" thread on steps (different-title
>   children of a season item) and as history on rows the fold left alone.

This document answers one question: **for any task, event or routine on screen,
why is it there?** It covers where items are born, which columns decide where
they live, and which predicate each surface uses to decide membership.

---

## 1. The shape of the model

### One table per kind

| Kind | Table | Notes |
| --- | --- | --- |
| Task | `tasks` | Also holds `category:'event'` rows (see §5) |
| Routine definition | `routines` | The repeating pattern. Never becomes a task. |
| Routine occurrence | `actionable_instances` | Lazily created, one row per `(entity_type, entity_id, date)` |
| Event | Google Calendar, cached in `calendar_events` | Owner-only RLS; no scope axis |

`actionable_instances` also carries per-day state for events
(`entity_type:'calendar_event'`).

### The placement ladder on `tasks`

Placement is not one column. It is a rung plus a stamp, and the stamp is
supposed to be mutually exclusive:

| Column | Meaning |
| --- | --- |
| `bucket` | The rung: `inbox` / `week` / `month` / `quarter` / `someday` / `timed`. `quarter` is what the UI calls a **season**. |
| `scheduled_for` | timestamptz. Only meaningful with `bucket='timed'`. |
| `is_all_day` | `false` = a clock time. Must be a real boolean; null reads as "unscheduled". |
| `week_start` | DATE. Which week a `bucket='week'` row is on. |
| `month_start` | DATE (the 1st). Which month a `bucket='month'` row is on. |
| `season_start` | DATE. Which season a `bucket='quarter'` row is on; membership is a **range** test, not equality. |
| `needed_on` | DATE. "Today needs this." The closest thing to a due date. Feeds the wall's kid cards and homework. |
| `planned_on` | DATE. The day this was **deliberately chosen for**. Puts it on Today's main list. |
| `is_goal` | Month/season only. A goal is ticked, never placed — `updateTask` refuses any placement write on it. |
| `goal_task_id` | The goal row, on the same list, that this step serves. |
| `source_id` | The row this was **copied down** from (season → month → week). |
| `picked_at` | Season picks: explicitly chosen vs. still on the shelf. |
| `scope` | `individual` / `couple` / `compound` — **who can see it**. RLS reads this, not `context`. Always derived by `scopeForDomain`. |
| `context` | Life area: `work` / `family` / `personal` / null (Unsorted). |

There is **no `due_date`** and **no `completed_at`** on `tasks`.

### The NULL rule — the single most important thing in this document

Every period predicate comes in two forms, and they disagree about NULL:

```ts
// src/lib/today/weekPlacement.ts:88-104
belongsToWeek(t, w)   // NULL week_start  => TRUE  ("legacy row, call it this week")
isPlacedOnWeek(t, w)  // NULL week_start  => FALSE ("never actually placed")
```

`belongsToMonth` / `isPlacedOnMonth` behave the same way
(`src/lib/planning/periodPlacement.ts:26-29`).

**Every pool that renders a list uses `belongsTo…`.** So a row that was never
stamped shows up in the current week *and* the current month *and* keeps doing
so forever, because "this period" is recomputed from `new Date()` on every
render. Mixing the two predicates up is the bug; this is called out in the
source itself.

---

## 2. Where items are born

### The canonical writer

`addTask` / `updateTask` in `src/hooks/useSupabaseTasks.ts` (insert at `:683`).
It derives `scope` itself, stamps exactly one period column, and enforces the
date ⇄ bucket invariants both directions.

### Surfaces that go through it

| Surface | Lands as |
| --- | --- |
| ⌘K quick add, plain | `bucket:'inbox'`, no date |
| ⌘K with a parsed date | `bucket:'timed'` |
| ⌘K with a recurrence | **a `routines` row**, not a task |
| ⌘K `category:'event'` + connected calendar | **a Google event**, not a task |
| Today typed capture | dated today, `planned_on` set to today |
| Today timeline "+" | `bucket:'timed'`, timed |
| Inbox add | dated today, all-day |
| Week grid drag-create | `bucket:'timed'`, timed |
| Month / Season plan pages | `bucket:'month'\|'quarter'` + the page's `month_start`/`season_start` |
| Plan-from-paper commit | per parsed altitude: date → timed; week → `week`+`week_start`; month/season → bucket + stamp + `is_goal`; recurring lines → `routines`; year lines → the `goals` table |
| Routine prep templates | `bucket:'timed'` on the day, linked to the routine instance |

### Paths that bypass it

These `.insert()` into `tasks` directly:

| Origin | What it writes |
| --- | --- |
| Mac capture window | `bucket:'inbox'`, scope derived |
| **Wall / kiosk capture** | **no `bucket` at all** — relies on the DB default |
| Photo capture | `bucket:'inbox'` + `capture_meta`, enriched later |
| Supernote / WhatsApp ingest (`extract-capture`) | `bucket:'inbox'`, family scope |
| School email (`extract-email`) | events → `bucket:'timed'` + `category:'event'`; todos → inbox + `needed_on` |
| `capture-to-inbox` edge fn | inbox, **no `scope`** |
| Agent action queue | payload bucket, **no `scope`** |
| MCP `symphony_create_task` | accepts `week`/`month`/`quarter` but **writes no period stamp** |
| iOS app | local insert, queued to the sync engine |

Apple Reminders bridge writes **`list_items`**, not tasks.

---

## 3. What moves an item

Everything funnels through `updateTask` (`useSupabaseTasks.ts:1209`).

- **Goals refuse placement.** `if (task.isGoal && isPlacement(updates))` → toast, no write.
- **Descending copies, it does not move.** `month`/`season` → a lower rung calls
  `copyDown`, which mints a new row with `source_id` pointing back and **leaves
  the original untouched**. The original's "→ where it went" annotation is
  derived at read time from the copy. `week → day` is a real move.
  Only one open copy is allowed in flight (deduped on `source_id` + title,
  after ten identical rows landed in twenty seconds on 2026-09-10).
- **`pushTask`** stamps the rung entered and clears the other two. It is the
  only writer of `defer_count`.
- **Choosing a day** (`planActions.chooseTaskDay`): a week/month row **keeps its
  bucket** and only gains `planned_on`, so un-choosing returns it to its list.
  Anything else also gets dated all-day.
- **Un-choosing** writes `planned_on = NULL` and nothing else — never un-dates,
  never deletes.
- **Group cascade**: touching `scheduledFor`/`isAllDay`/`bucket` on a parent
  moves its children in a second write, after the parent's write lands.
- **Unsorted gate**: any placement on a `context IS NULL` item forces the
  "Where does this belong?" prompt first. Choosing a day is deliberately ungated.

Routine occurrences never rewrite the rule. Choosing, completing, skipping,
deferring and rescheduling all write to the one `actionable_instances` row for
that date.

---

## 4. What each surface actually asks for

### `/today`

Pipeline: `computeTodayData` → `dayPlan` (computed first, decides what the main
list may *not* draw) → `splitTodayJournal` → three sections.

| Section | Membership |
| --- | --- |
| **My focus** | Non-event rows in the `allday` bucket + everything untimed that was chosen. Concretely: all-day tasks dated today **whose `planned_on` is today**, plus any task anywhere with `planned_on = today`, plus chosen untimed routine occurrences, plus routines pinned to the timeline. |
| **Still ahead** | The timed rows, cut by **index**: the first row that hasn't ended yet, and everything after it. Not a per-row time test. |
| **Earlier today** | The complementary prefix. A row with no start time can never land here. |
| **All-day events** | Peeled out of `allday` and drawn above Still ahead — they never enter My focus. |
| **"N need a decision"** | `slipped` (dated > 2 days ago) + `stranded-week` (stale `week_start`) + `aging-month` (created > 45 days) + `aging-inbox` (created > 14 days), plus unreviewed email captures and suggestions. `someday` and `quarter` are deliberately excluded. |
| **Review footer** | Overdue within the 2-day grace window, minus anything chosen for today. No counts, ever. |

### The Today pin

| Group | Membership |
| --- | --- |
| SCHEDULED TODAY | `bucket:'timed'`, dated today, **`is_all_day = true`**. Timed work never appears here — it's a commitment the main list keeps. |
| AVAILABLE TODAY | Untimed routine occurrences for the day (no `time_of_day`, not pinned, not moved away). |
| THIS WEEK | `bucket='week'` ∧ `belongsToWeek` ← **NULL counts** |
| THIS MONTH | `bucket='month'` ∧ `belongsToMonth` ← **NULL counts** |

Group header counts exclude completed and already-planned rows; the panel's
own emptiness test does not.

### `/week` left column

Since 2026-09-20 this column is two things, not one:

1. **`WeekPlanColumn`** — this week's list. Calls `weekListEntries`, the same
   function the Today pin's week group calls, so the two surfaces cannot
   disagree about what is on the week. Always present (not a pin — pins are
   opt-in and live in sessionStorage), opens by default, uncapped, and folds to
   its own header with the fold remembered in `localStorage`.
2. **`WeekPoolLane`** — only what the list cannot say: **"Didn't happen"**
   (spent placements), routines that need a day, and the collapsed
   **"Unfinished last week"**.

What follows describes the pool machinery the lane still runs for (1)'s
predecessor and for "Didn't happen".

### The pool predicates

`unscheduledPool` → `weekList` → `orderPool` → `groupPool`, then stale
week-placements are subtracted into the carryover fold.

```ts
// src/lib/planning/poolViews.ts:95-117
if (t.isAllDay) { if (!t.scheduledFor) return true; ... }   // <- no bucket test
if (t.bucket === 'week') return belongsToWeek(t, currentWeek) || isStaleWeekPlacement(...)
if (t.scheduledFor) { ... if (d < today) return true }       // carried over
return false
```

So "This week" is four populations at once:

1. `bucket='week'` placed on this week — correct.
2. `bucket='week'` with `week_start IS NULL` — legacy, counted as this week forever.
3. **Any `is_all_day` row with no date, in any bucket** — the first line never
   looks at `bucket`, so month and season rows leak in.
4. Open rows whose `scheduled_for` is in the past — the missed-placement rule.
   The card returns to the pool without rewriting `scheduled_for`, annotated
   "Didn't happen · Thu".

"This month · N" is `bucket='month'` ∧ `belongsToMonth` ∧ assignee — with **no
`completed` filter**, so finished rows inflate it.

Three scoping quirks:

- The pool anchors on `new Date()`, not the week being viewed. Paging the grid
  does not rescope the left column. It also won't recompute at midnight.
- "Unfinished last week" filters the raw task list, skipping the assignee
  scope the other groups apply — a task assigned only to someone else can
  appear in your carryover.
- `planned_on` is read **nowhere** in the week pool. A task pinned to today
  still sits in the week list.

### Where routines come from in each pool

Routines in a pool are **definition rows**, never occurrences. A routine rides
in the week pool exactly when it is eligible and **cannot be placed**: no
`time_of_day`, or weekly with an empty `days` array.

Eligibility is the 7-rung `resolveRoutine` ladder, first match wins:
resting → not-today (recurrence) → `show_on_timeline = false` → domain layers →
owners → in-collection → the hide-daily sweep.

### Events

Google is the source of truth. Fetched per viewed day (and refetched on tab
return — there is no realtime or polling), deduped, layer-filtered, then
grouped like any other timeline item. Meal-plan entries are synthesized as
events and concatenated. Events never enter the Today pin.

---

## 5. Known holes

Found during this trace, not fixed:

1. ~~**The all-day wildcard.**~~ Fixed 2026-09-19: `weekList` tested `isAllDay`
   before `bucket`, so month and season items appeared under "This week".
   Bucket decides first now.
2. **The NULL stamp.** As of this trace, `month_start` and `season_start` are
   set on **zero** rows in production, and `week_start` on 30 of 32 week rows.
   Because `belongsTo…` treats NULL as a member, the month rail is effectively
   "every row ever bucketed month".
3. **The month rail has no `completed` filter**, so its count includes done rows.
4. **Three insert paths write no `scope`** (`capture-to-inbox`, the agent action
   queue, the MCP server), landing on the `individual` default despite
   non-private intent.
5. **MCP `symphony_create_task` accepts a period bucket but writes no stamp**,
   manufacturing exactly the NULL-stamped rows in (2).
6. **The wall capture writes no `bucket`**, relying on the DB default.
7. `planActions.timeTask` sends `endTime`, which `updateTask` silently drops
   for tasks — there is no `end_time` column.
8. Today's page and the shell pin compute the same plan twice from two
   separately-fetched task arrays. Same selector, different data.
9. **`tasks` UPDATE policy still has no `WITH CHECK`** (pre-existing, proved
   2026-09-19): a member can reassign a shared task to themselves and
   `individual`, erasing it from the other person's view.

---

## 6. Reading this in practice

To answer "why is this item here?", in order:

1. What is its `bucket`, and is the matching period column stamped or NULL?
2. Is `is_all_day` true with no `scheduled_for`? If so it's in the week pool
   regardless of bucket.
3. Is `scheduled_for` in the past and the row still open? Then it's a missed
   placement, not a placement.
4. Is `planned_on` today? That, and only that, is what "I chose this" means.
5. Is `context` null? Then it's Unsorted and gated.
6. Is `scope` what you'd expect, given that RLS reads `scope` and not `context`?
