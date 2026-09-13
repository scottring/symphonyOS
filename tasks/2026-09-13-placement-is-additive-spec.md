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

Every existing reader keeps working unchanged, because the narrowest-grain value is exactly what they already read. What changes is that the *wider* stamps are still there to be read by the surfaces that want them.

### Backfill kills the August/September bleed

Scott's "August-specific items appear under September" is the NULL-means-current rule, not a layout problem. Backfill `month_start` / `season_start` / `week_start` from `created_at` (and from `scheduled_for` where present) so every row is explicitly stamped, then **retire `belongsTo*`'s NULL-is-true branch** and keep one predicate per period instead of two. Real labels ("September 13–19") become readable off the data rather than assumed from what you're looking at.

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

- `date` becomes **nullable**; add `week_start date`. Uniqueness becomes `(user_id, entity_type, entity_id, coalesce(date, week_start), grain)` — or an equivalent partial-unique pair, decided at implementation.
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

**The occurrence half is wrong today, in the strict direction.** `actionable_instances` RLS is owner-only (`auth.uid() = user_id`, migration `009:82-96`) and the uniqueness key is per `user_id`. It does **not** mirror the routine's `scope`. Routines share on scope (that was fixed); their instances don't. Promoting occurrences to first-class planning objects therefore requires the instance policies to mirror the routine's own scope — the same "mirror each table's OWN RLS" rule that fixed context-graph blindness. Until that lands, a shared family occurrence ticked by Iris is invisible to Scott. **Verify before building any shared-occurrence UI.**

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

Rejected or deferred, with reasons, so they don't come back by accident:

- **"Carry forward" on every row.** The missed-placement rule already returns a slipped card to the week's list next morning. `keep` is deliberately scoped to a PAST period's look-back (`periodPage.ts:141`, gated on `isPast`), where re-committing is a real decision. Keep it there.
- **"1 of 5 complete" on the weekly list.** Scoreboard; and the weekly list isn't meant to be finished. Two peers, no scoreboards; no counts on Today.
- **Two text links under every row.** Reads as a form. Hover/press-reveal, as the row action rail already does.
- **Three always-visible domain checkboxes.** Shipped is `DomainSwitcher` — a lens that reads as a tag and derives scope. A tri-checked filter panel trains people to ignore it.
- **Today split into "Chosen for today" + "Appointments" + an embedded weekly list.** Today is flat, one agenda, in time order; the embedded panel duplicates /week inside Today.
- **Someday / Unplanned / Completed as filter chips.** A view, not a bucket — the distinction custom spans were killed over. They're groupings in §4, not buckets.

---

## §7 Sequence

1. **§5 month page** — hierarchy, labels, look-back kept. No data change. ~1 day.
2. **§1 tasks** — migration (backfill stamps), `deriveBucket` + tripwire, writers stop clearing, `belongsTo*` NULL branch retired, `PlanRow` fate read from stamps, `lineage` copy-down retired for placement (kept for threading). **The big one** — the risk is the writer sweep and the iOS/wall/MCP readers, not the migration.
3. **§2 routine occurrences** — nullable `date` + `week_start` + grain, week-grained materialization, day-choice adds a date, occurrence-vs-pattern vocabulary. **Blocked on the §3 RLS verification.**
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

1. **Does a placed row still belong to its month's *list*, or only to its look-back?** i.e. after "Get extender" goes into the week of Sep 13, does it still print on the September page? (Claude: yes, marked — that's the trust fix. Say if you'd rather it leave the list and appear only in the look-back.)
2. **All tasks: Library or sidebar?** Unsettled between Codex and Claude; §4 records both positions.
3. **Does an untimed weekly occurrence that goes unfinished get offered to next week, or just stay in its week?** (Spec says it stays and is reviewable; the offer would be a Review-drawer verdict, not an automatic move.)
4. **`quarter` vs `season`:** the bucket is still named `quarter` while the product says Season. Rename in step 2, or leave the column alone?

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
- `supabase/migrations/009_actionable_system.sql:82-96` — instance RLS is owner-only; it does not mirror the routine's scope.
- `src/lib/week/unhomedRoutines.ts:2-3,14-19` — untimed / dayless-weekly routines are classified as having "NO HOME yet — nothing the week grid can place."

**The month page:**
- `src/components/plan/PeriodPlanPage.tsx:254` ("On the calendar") renders before `:272` (the period list); the season rail follows at `:316`.
- `src/components/plan/PlanRow.tsx:56` — goals marked only by an amber target icon inside the shared list.
- `src/lib/planning/periodPage.ts:141` — `keep` is gated on `isPast`.
