# Placement is additive — one item, many plans

**Status:** design spec. Implementation PAUSED, awaiting Scott's approval.
**Date:** 2026-09-13
**Worktree:** `.worktrees/task-stamps` (branch `spec/task-stamps`, off `origin/main` @ `5a67d4a0`)
**Origin:** Codex flow proposal (7 screens: Inbox / Tasks / Today / Week / Month / Season / Year), reviewed against `origin/main`; three rounds of critique between Codex and Claude.

---

## The two complaints

Scott, on the shipped app: **"I can't find my stuff"** and **"I don't trust that placing an item keeps it."** He says it's both.

They have one root cause.

**`bucket` is single-valued, so stepping an item down the ladder has to either erase its old association or duplicate the row.** Symphony chose duplicate (`lib/planning/lineage.ts`): placing a month task COPIES it, the copy carries `source_id`, the original stays so the month's look-back still sees the whole list. That fork is where both complaints come from:

- **Trust.** Two rows means two checkboxes, which forced a derived third status to reconcile them — the `→ placed` / `→ done` annotations at `PlanRow.tsx:64-65` that Scott called "competing statuses." The model is correct and completely silent about itself.
- **Findability.** An item's identity fragments across copies, so no surface can list "the" task. Nothing in the app answers *"everything open, wherever it lives"* (evidence in Appendix A).

And the same defect has a second head: **routine occurrences can't be commitments unless they're timed** (§2).

## The rule

> **Placement is additive stamping, not a move. Grain is derived from the stamps present.**

One row. Stepping down ADDS a narrower association and keeps the wider one. Nothing is copied, nothing is erased, there is one checkbox, and "where does this live" is answered by reading the row itself.

This holds for both kinds of item:

| Item | Permanent home | Stamps it can carry at once |
|---|---|---|
| Task — "Choose a cleaner" | All tasks | `season_start` + `month_start` + `week_start` + `scheduled_for` |
| Routine — "Kitchen laundry, weekly" | Routines | the pattern; not placed, never on a plan list |
| Occurrence — "Kitchen laundry, week of Sep 13" | that week's plan | `week_start` + (optionally) `date` |

A task and an occurrence are different objects with the same placement grammar. That symmetry is the point: Today and Week can then mix them without special cases, and one mental model covers both.

---

## §1 Tasks: stamps, not buckets

### What exists already

The stamps are in the schema (`src/types/task.ts:59-66`):

```ts
bucket?: TaskBucket   // inbox | week | month | quarter | timed
scheduledFor?: Date   // only set when bucket='timed'
weekStart?: Date      // which week a bucket='week' task belongs to
monthStart?: Date      // which month a bucket='month' task belongs to
seasonStart?: Date     // which season a bucket='quarter' task belongs to
```

So this is largely a **relabeling, not a new data model**. Two things make the stamps mutually exclusive today, and both are decisions in code rather than facts in the database:

1. **`monthStartForBucket` / `seasonStartForBucket` / `weekStartForBucket` clear the stamp on the way out.** `periodPlacement.ts:62-68` states the reason outright: *"The clear is as important as the stamp — a task sent from the month to the week that kept its month_start would come back in that month's look-back as still open."*
2. **NULL means "the current period"** (`belongsToMonth` returns `true` for a NULL row, `periodPlacement.ts:26`), so unstamped rows follow you into whatever period you page to.

### The change

**Stop clearing. Always stamp.** A row sent from September's list into the week of Sep 13 ends up with `month_start = 2026-09-01` AND `week_start = 2026-09-13`. Choosing Tuesday adds `scheduled_for`; the month and week associations survive.

The look-back problem that justified the clear doesn't come back — **it relocates, and gets cheaper.** The distinction `→ placed` was drawing ("this row has been taken down a level") becomes readable from the row's own stamps instead of from hunting for a copy:

| Row on September's list | Reads as |
|---|---|
| `month_start` only | on the list, not yet taken up |
| `month_start` + `week_start` | in the week of Sep 13 |
| `month_start` + `scheduled_for` | on Tuesday |
| `completed` | done — one checkbox, wherever it was ticked |

September's look-back shows every `month_start = September` row with that reading beside it. Nothing is invented; the copy is simply no longer needed to record it.

**`source_id` goes back to meaning what its own comment says it means** — a season goal threading its own month steps, four genuinely different tasks (`lineage.ts:41-44`) — not "this is a duplicate of that."

### `bucket` becomes a cache, written in one place

**Do NOT convert 125 files.** `git grep -l bucket -- 'src/*'` is 125 files on `origin/main`, plus independent readers in iOS `SyncEngine`, the wall, and the MCP tools. Instead:

- `bucket` **stays a stored column** and keeps its current meaning — *the narrowest grain this row has been placed at* (`timed` > `week` > `month` > `quarter` > `inbox`).
- It is **computed from the stamps by exactly one function** (`deriveBucket(stamps)`) called by every writer. No caller sets it directly.
- A **tripwire test** asserts no code outside that writer assigns `bucket`, the way `scopeDefaultCoverage.test.ts` guards literal `scope:`.

Readers asking **"what grain is this row at?"** keep working unchanged — the narrowest-grain value is exactly what they already read.

**Readers asking "does this row belong to September / to this week?" do NOT, and an earlier draft was wrong to claim otherwise.** Under copy-down, the September original kept `bucket='month'` forever, so `bucket === 'month'` doubled as a membership test. Under additive stamps, that same row acquires a day and derives `bucket='timed'` — and every membership query gated on the bucket silently drops it. The canonical case is `src/lib/planning/poolViews.ts:106`:

```ts
if (t.bucket === 'week') return belongsToWeek(t, currentWeek) || isStaleWeekPlacement(t, currentWeek)
```

It gates on the bucket and only *then* consults the stamp — so a week row given a Tuesday falls out of the week pool entirely.

**Every membership question must read its stamp directly** (`isPlacedOnMonth` / `belongsToWeek` / …) with no bucket gate in front of it. Measured: **33 such comparisons across 14 non-test files** — `poolViews`, `taskPools`, `horizons`, `weekPlacement`, `attention`, `betPulse`, `periodPlacement`, `useSupabaseTasks`, `useSystemHealth`, `WeekMonthRail`, `WeekPoolLane`, `InboxView`, `TodayView`, `WhenPicker`. That is the real sweep: bounded and enumerable, but not zero. Each site must be classified as grain-question (leave) or membership-question (convert), and the conversions need parity tests before the writers change.

### No backfill from creation dates

Scott's "August-specific items appear under September" is the NULL-means-current rule, not a layout problem — `belongsToMonth` returns `true` for a NULL row, so unstamped rows follow you into whatever month you page to.

The fix is **not** to infer the missing stamps. Backfilling `month_start` from `created_at` would invent planning decisions the user never made — a task written on August 3rd was not thereby assigned to August's plan. Instead:

- **NULL stops meaning "the current period" and starts meaning "not assigned to one."** `belongsTo*`'s NULL-is-true branch is retired; one predicate per period replaces the pair.
- Unstamped rows surface in All tasks' **Unplanned** group, explicitly, for review.
- Stamp only where the evidence is reliable — e.g. a row with `scheduled_for` genuinely belongs to that date's week and month.

**Consequence to accept deliberately:** legacy rows currently printing on the September page will leave it (they were never assigned to September) and reappear under Unplanned. On Scott's live account that will look like data loss on first load, so step 2 ships with a one-time review prompt naming the count — nothing disappears silently.

Real labels ("September 13–19") then become readable off the data rather than assumed from what you happen to be looking at.

### Carry-forward history — out of scope, deliberately

A single `week_start` cannot record that a row was committed to Sep 6–12, slipped, and was re-committed to Sep 13–19. Worth being precise about what that costs, because it is **not a regression this spec introduces**: week→week is already a *move* today, not a copy (`lineage.ts:58-60` — "the week list is a checklist, not a reference list"), so that history doesn't exist now either.

- The **month** association survives under additive stamps, so "carried forward inside September" becomes visible for the first time.
- A cheap slip record already exists in the schema — `defer_count` and `weekDeferredAt` — and one more field (`last_week_start`) would answer "where did this come from" without new rows.
- **Durable plan-membership rows are rejected for now.** A `task_placements` table is the theoretically right model, but it re-fragments the row this spec just unified, and every surface would again have to ask "which membership is authoritative" — the exact question `→ placed` existed to answer. If a week-level look-back is ever wanted, that is the design to reopen, as its own spec.

---

## §2 Routine occurrences: a week is a grain

### What exists already

The occurrence object exists and is close to right — `actionable_instances` (`supabase/migrations/009_actionable_system.sql:56`): `entity_type` + `entity_id` + `date`, `status: pending | completed | skipped | deferred`, per-instance assignee override, `completed_at` / `skipped_at`, `progress`, plus `instance_notes` and `coverage_requests`.

So three of Codex's asks are **already true**: an occurrence has its own checkbox, completing one leaves the routine active, and past occurrences persist with their dates.

### The gap

**`date date not null`, and the uniqueness key is `(user_id, entity_type, entity_id, date)`.** A day is the only grain an occurrence can have. So "kitchen laundry, this week" — untimed, no day chosen — **cannot exist as an occurrence at all**, which means it cannot have a checkbox and cannot be a commitment.

What happens instead is stated plainly by `src/lib/week/unhomedRoutines.ts:2-3`: the week shelf lists routines *"that have NO HOME yet — **nothing the week grid can place**"*, defined as no `time_of_day`, or weekly with no days chosen. That's the yellow cards in Scott's week screenshot: the app is literally classifying an untimed weekly routine as unplaced work awaiting a drag.

### The change

Give an occurrence the same additive stamps a task gets:

- `date` becomes **nullable**; add `week_start date` and an explicit `grain` ('day' | 'week').
- **Identity is the recurrence period, never the chosen day.** Uniqueness is `(entity_type, entity_id, period_start, grain)` — where `period_start` is the week start for a weekly routine and the date itself for a daily one — plus the scope-dependent owner key from §3. `date` is a **mutable attribute** of that row and must not appear in its key: a key that changes when a day is picked would leave the materializer unable to see the occurrence it already created, and it would make a second one. That is the ten-duplicate-rows failure of 2026-09-10, re-entered through the routine door.
- An untimed weekly routine materializes a **week-grained occurrence** for the current week: its own checkbox, on the weekly checklist, **already a valid commitment while untimed**.
- **Choosing Tuesday adds `date` to that same occurrence row.** It does not create a second occurrence, and it does not touch the recurrence pattern.
- **"Every Tuesday from now on" is a different action** on a different object (the routine), and must be worded differently in the UI — "this week only" vs "from now on."
- An unfinished occurrence **stays in its own week**. It does not silently merge into next week's — same rule as the missed-placement behavior for tasks (the day passes, the commitment doesn't).
- **Occurrences never enter the period plan lists.** `PeriodPlanPage` reads `tasks` only; that stays true, so a routine can serve a monthly goal without its occurrences flooding the goals reference.

`unhomedRoutines` then narrows to what it should have meant all along: routines the **grid** can't position on a time axis — not routines that aren't commitments.

---

## §3 Privacy and counts

Codex's requirement is right: Iris's private Work and Personal items — and their occurrences and counts — never enter Scott's results. Two notes.

**The task half is already correct** and must not be routed around: the All tasks surface reads through the same RLS as every other surface, via the normal client. No service-role path, ever.

**The occurrence half: the policies are fine; the IDENTITY isn't.** An earlier draft of this spec claimed instance RLS was owner-only, reading migration `009:82-96`. That was wrong — migrations are not the source of truth here (DDL is applied by hand via the Management API), and the live policies were replaced. Queried on 2026-09-13, all three of SELECT / UPDATE / DELETE on `actionable_instances` read:

```sql
auth.uid() = user_id
OR (users_share_household(auth.uid(), user_id)
    AND (entity_type = 'calendar_event'
         OR (entity_type = 'routine'
             AND EXISTS (SELECT 1 FROM routines r
                         WHERE r.id::text = actionable_instances.entity_id
                           AND r.scope IN ('couple', 'compound')))))
```

So instances **do** mirror the routine's scope: a shared routine's occurrences are visible household-wide, a private one's are not. Iris's private Work and Personal occurrences are already invisible to Scott, by the table's own policy. Nothing to fix.

**What is broken is uniqueness.** The key is `(user_id, entity_type, entity_id, date)` — per user. A shared family occurrence therefore has **one row per member who touches it**, with no single agreed identity: two people can tick "their" copy of the same commitment and neither sees the other's. That's tolerable while an occurrence is a private checkmark on a shared routine; it is not tolerable once an occurrence is a **planning object on a shared weekly list**, which is what §2 makes it. Household-scoped identity for `couple`/`compound` routines (drop `user_id` from the key at those scopes, dedupe existing rows, keep per-member *status* on a child row or a status map) is therefore in scope for step 3 — and it is a genuine migration with a dedupe, not a column add.

**Still verify by test, not by reading.** Two accounts (Scott + Iris): a private routine's occurrence must be invisible; a shared routine's completion must be visible to both. The policy text above is evidence, not proof.

**Counts are computed after the domain/scope filter, never before** — counts that don't mirror what renders is a bug this codebase has already shipped once.

---

## §4 All tasks

Every open item, **grouped by where it lives**, with real period labels: `September 13–19` · `September 2026` · `Fall 2026` · `Unplanned` · `Someday`, including past and future periods. Grouping by placement is the whole point — a flat master list teaches nothing, a grouped one answers "where did it go" in its own structure, and it is the global twin of §1's per-row reading.

Each task has **one** completion state; its wider associations stay visible on the row.

An unfinished September task is therefore **discoverable in October without waiting for a review** — it appears under `September 2026`, keeps its September association, and does not silently become an October commitment.

**Its home is undecided** (see Open questions). Claude's position: ship it reachable via empty-⌘K plus a Library row, watch whether Scott reaches for it daily, promote it to the spine if he does — promoting is cheap, demoting after a habit forms isn't; and whether it's a lookup or a daily chooser depends on whether Today and Week become trustworthy, which §1 determines. Codex's position: compare Library vs sidebar in the mockup before deciding. **Not settled; decide after §5 and §1 land.**

---

## §5 The month page — the cheap first step

Independent of the model work, and worth doing first because it's the visible half of the trust problem.

- **Reorder.** `PeriodPlanPage.tsx:254` renders "On the calendar" BEFORE the period list at `:272`. The page should answer "what do we want from September?" first: **September goals**, **September tasks**, the season rail for reference. The calendar becomes a view you open.
- **Label the two kinds.** Goals and tasks share one `<ul>` today, distinguished only by a small amber target icon (`PlanRow.tsx:56`). Give each its own heading.
- **One status.** The checkbox carries completion; the `→ placed` / `→ done` annotations become a single quiet link to where the row now lives ("in the week of Sep 13"), derived per §1.
- Keep the **look-back**, on Season and Year too. The proposal's Season and Year pages drop it; it is what makes the cadence deliberate rather than aspirational.

---

## §6 What is NOT in this spec

An earlier draft ran two different kinds of "no" together. Split, because only one kind is settled.

### Settled — Scott's own recorded product decisions

Not reopened here. Reopening any of them is Scott's call, not a reviewer's.

- **No counts on the weekly list or Today** ("1 of 5 complete"). Two peers, no scoreboards; and the weekly list isn't meant to be finished.
- **`keep` stays scoped to a PAST period's look-back** (`periodPage.ts:141`, gated on `isPast`), where re-committing is a real decision. A per-row "Carry forward" on the current week duplicates the missed-placement rule, which already returns a slipped card to the week's list next morning.
- **The domain lens is `DomainSwitcher`** — reads as a tag, derives scope — not three always-visible checkboxes. A tri-checked filter panel trains people to ignore it.
- **Today is flat: one agenda, in time order.** It was deliberately un-split.
- **Someday / Unplanned / Completed are groupings, not buckets.** A view is not a bucket — the distinction custom spans were killed over. They group in §4; they don't become placement states.

### Open — design questions this spec does not settle

- **How Today offers the weekly list.** Codex is right that Today must let you choose from the week; an earlier draft read as rejecting the requirement when the objection was only to *duplicating /week as a panel inside Today*. The shipped mechanism is `HorizonPoolDropdown` in Today's controls strip — week and month pools as dropdowns, deliberately outside the daily review. Whether that presentation is good enough is a fair question and belongs with the §5 layout work, not here.
- **Two text links under every row** vs hover/press-reveal. The row action rail is the shipped pattern; the proposal's always-visible links read as a form. A preference, not a finding.
- **All tasks' home** — §4, and Open question 2.

---

## §7 Sequence

1. **§5 month page** — hierarchy, labels, look-back kept. No data change. ~1 day.
2. **§1 tasks** — `deriveBucket` + tripwire, writers stop clearing, the 33 membership sites classified and converted (parity tests FIRST), `belongsTo*` NULL branch retired with the Unplanned review prompt, `PlanRow` fate read from stamps, `lineage` copy-down retired for placement (kept for threading). **The big one** — the risk is the membership sweep and the iOS/wall/MCP readers, not the migration. No inference backfill.
3. **§2 routine occurrences** — nullable `date` + `week_start` + `grain`, period-keyed identity, week-grained materialization, day-choice adds a date, occurrence-vs-pattern vocabulary. **Blocked on the §3 identity migration** (household-scoped uniqueness + dedupe) and on the two-account privacy test.
4. **§4 All tasks** — grouped by placement, real labels.
5. **Decide §4's home** on evidence.

Each step ships to `main` green and browser-verified before the next starts.

## §8 House constraints (any implementation)

- **Node 22.14.0** — `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`; check `node -v` first.
- Work in `.worktrees/task-stamps`, **never the main worktree**; rebase onto `origin/main` before every push. A push to `main` deploys to prod.
- `npx tsc --noEmit -p tsconfig.app.json` (root is a no-op). `npx vitest run <file>` (`npm test` is watch mode).
- `date` columns go through `localYmd` / `parseLocalYmd`, never `toISOString()`.
- **Never partial-`upsert` `tasks`** — `.update().eq()`. Never a literal `scope:` outside `lib/scope.ts`.
- DDL by hand via the Management API; deploy edge functions BEFORE pushing main.
- No emojis in UI — lucide icons.

## §9 Open questions for Scott

Codex recommended on all four; Claude agrees with all four. Each still needs Scott's yes — they are recorded as the spec's working answers, not as approval.

1. **Does a placed row still print on September's list?** → **Yes, with its week/day association shown and one checkbox.** That IS the trust fix; a row that vanishes from the list when you take it into a week is the thing Scott doesn't trust.
2. **All tasks: Library or sidebar?** → **Start in Library plus empty-⌘K.** Cheap to promote later if Scott reaches for it daily; expensive to demote once it's a habit.
3. **An unfinished untimed weekly occurrence?** → **Stays in its original week, with an explicit review decision.** Never silently merged into the next occurrence.
4. **`quarter` vs `season`?** → **Keep `quarter` in the column, display "Season."** A rename is an unrelated compatibility migration across iOS, the wall and MCP; it doesn't belong in this change.

---

## Changelog

**2026-09-13, rev 2** — Codex review of rev 1. Corrections applied:

- **§3 rewritten. Rev 1 was wrong**: it read instance RLS off migration `009` and reported owner-only policies. The live policies mirror the routine's scope (queried 2026-09-13). The real occurrence-privacy defect is per-`user_id` uniqueness — no single agreed identity for a shared occurrence.
- **§1's "no sweep" claim corrected.** Membership queries gated on `bucket` break under additive stamps; 33 comparisons across 14 non-test files must be classified and converted.
- **§1 backfill reversed.** No inference from `created_at` — that invents planning decisions. NULL becomes "unassigned," surfaced in Unplanned, with a one-time review prompt so nothing vanishes silently.
- **§2 identity fixed.** Uniqueness keys the recurrence period, never the chosen day; `date` is a mutable attribute. Rev 1's `coalesce(date, week_start)` key would have let the materializer duplicate an occurrence the moment a day was picked.
- **§6 split** into Scott's recorded decisions vs open design questions; the Today→weekly-list presentation moved to open.
- **Carry-forward history** addressed explicitly and scoped out, with the reason and the cheap alternative.
- **§9** records the four working answers.

---

## Appendix A — evidence

Findings behind the claims above, all on `origin/main` @ `5a67d4a0`.

**No surface answers "everything open":**
- `src/hooks/useSearch.ts` — Fuse over a query string; empty query, empty result. Answers "find this," not "show me everything."
- `src/components/schedule/ReviewDrawer.tsx:33` — `BACKLOG_SESSION_CAP = 5`, scoped to carried-over + needs-attention; its own comment says the week and month pools are deliberately excluded.
- Inbox's Expired section is **past-dated** only. A month-bucket row that was never dated isn't past-dated — it sits on that month's look-back, reachable only by paging back into the period.

**The fork and its consequences:**
- `src/types/task.ts:59-66` — the stamps exist; each is documented as meaningful only while `bucket` names its level.
- `src/lib/planning/periodPlacement.ts:62-68` — "the clear is as important as the stamp."
- `src/lib/planning/periodPlacement.ts:26` — `belongsToMonth` returns `true` for NULL (the bleed).
- `src/lib/planning/lineage.ts` — copy-down, `source_id`, and `livePlacedCopyOf`, added 2026-09-10 after ten duplicate "block potluck" rows landed in twenty seconds.
- `src/components/plan/PlanRow.tsx:64-65` — the `→ placed` / `→ done` annotations.
- `git grep -l bucket -- 'src/*'` → **125 files**, plus iOS `SyncEngine`, the wall, and the MCP tools reading `bucket` independently.

**Routines:**
- `supabase/migrations/009_actionable_system.sql:56` — `actionable_instances`, `date date not null`, unique `(user_id, entity_type, entity_id, date)`.
- Live policies on `actionable_instances`, queried 2026-09-13 via `pg_policy`: SELECT / UPDATE / DELETE all read `auth.uid() = user_id OR (users_share_household(...) AND (entity_type='calendar_event' OR (entity_type='routine' AND EXISTS(... r.scope IN ('couple','compound')))))`. They **do** mirror the routine's scope; migration `009:82-96`'s owner-only policies were superseded live. Migrations are not the source of truth in this repo.
- Live columns, same date: `date` is still `date NOT NULL`; there is no `week_start`. Uniqueness remains `(user_id, entity_type, entity_id, date)` — per user, hence no agreed identity for a shared occurrence.
- `src/lib/week/unhomedRoutines.ts:2-3,14-19` — untimed / dayless-weekly routines are classified as having "NO HOME yet — nothing the week grid can place."

**The month page:**
- `src/components/plan/PeriodPlanPage.tsx:254` ("On the calendar") renders before `:272` (the period list); the season rail follows at `:316`.
- `src/components/plan/PlanRow.tsx:56` — goals marked only by an amber target icon inside the shared list.
- `src/lib/planning/periodPage.ts:141` — `keep` is gated on `isPast`.
