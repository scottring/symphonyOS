# Week boundary unification + mid-period planning threshold rule

**Date:** 2026-07-19
**Status:** Spec — awaiting Scott's approval of open questions before implementation
**Source:** Full cascade walkthrough (year → season → month → week → today) on the demo
account, 2026-07-19 (a Sunday). Reproduction data is still in the demo account, prefixed
`TEST-`.

## Problems observed

### P1. Two week conventions coexist

| Site | Convention | Used by |
|---|---|---|
| `src/components/planning/guided/periods.ts` | **Monday-start** (private `startOfWeek`), token `isoWeekId(start)` → `"2026-W29"`, label "Week of July 13" | The guided weekly wizard (session row, resume, header, `periodStart/End` fed to every step) |
| `src/lib/cadence/config.ts` | **`weekStartsOn` config, default 0 = Sunday** (user-configurable in Settings → Planning Rhythm), `weekStartAnchor`, `weekToken` → `"2026-7-19"` | Nudge timing (`getDueSession`) |
| `src/lib/cadence/periods.ts` (`periodLabel`/`periodProgress` for `'week'`) | cadence config (Sunday by default) | Standing /week page header ("Week of Jul 19 · Day 1 of 7") |
| `src/lib/dateUtils.ts` `startOfWeek` | **Hardcoded Sunday** | General utilities; meals/wall are also Sunday-start (`week_start=Sunday`) |

Observed consequence on a Sunday: the weekly wizard plans "Week of July 13" (the week
that ends today), then drops the user on a /week page headed "Week of Jul 19 · Day 1 of
7" saying **"Nothing planned for Week yet"**, with the Today banner still nagging "It's a
good time to plan the week."

### P2. Sessions always target the *current* period, planned from its start

`guidedPeriod(horizon, now)` returns the period containing `now`, and steps anchor to
`period.start`:

- "The month ahead" / "The season ahead" list commitments from period start — on Jul 19
  the month session showed only Jul 3/4/7, all past, as the weeks "ahead".
- `ScheduleGridStep` passes `weekDate={periodStart}` → the rocks grid opens on a past
  Monday and silently accepts drops on past days. A rock placed there immediately
  classifies as overdue (`selectOverdue`) and surfaces on Today as "carried over · 6 days
  ago" — a fresh plan reading as week-old failure.

### P3. The /week page can't see placed rocks

Placing a rock flips `bucket week → timed` (the timed-bucket invariant), so it leaves
`selectHorizonPool(…, 'week')`. The /week page renders only *Carried over* + the
bucket-`week` pool — there is no "placed this week" section. Net effect: finish planning
and placing rocks → the page reports an empty week. (The wizard's own
`ScheduleGridStep` already solves this with a scheduled-within-`[periodStart,
periodEnd]` filter; the page needs the same.)

### P4. The weekly nudge doesn't know the session happened

"It's a good time to plan the week" is dismissed only by the manual ✕ (token-scoped via
`weekToken`). Finishing the weekly session does not record a dismissal.

### P5. Smaller copy/behavior nits (cheap; fix in the same pass)

- Month session step order: "Projects in motion" (step 4) says "the list you're **about
  to write**" but the write step is step 3. Reorder projects → before write (mirrors the
  season session, where the goals reference precedes the write step).
- "Last year's goals" step title shows *this* year's goals on a mid-year re-run.
- Carried-over "←" annotations accumulate duplicate text on repeated carries.
- `BookNextStep` ("Put it on the calendar") appears to insert a new anchor task per run —
  demo Sept 1 has 3× "Seasonal planning session" + 2× "Monthly planning session" stacked.
  Dedup: match an existing incomplete task with same title + date, update instead of
  insert.

## Design

### D1. One week truth: cadence config

`weekStartsOn` from `readCadenceConfig()` (already user-configurable, default Sunday)
becomes the *only* week-boundary convention. `guided/periods.ts` deletes its private
Monday `startOfWeek` and uses `weekStartAnchor(now, readCadenceConfig().weekStartsOn)`.
`lib/dateUtils.ts startOfWeek` gains the config parameter (or is replaced by
`weekStartAnchor`) so utilities agree. Meals/wall already assume Sunday and match the
default.

### D2. Weekly session token follows the anchor

Weekly `planning_sessions` token changes from `isoWeekId` (`"2026-W29"`) to the anchor's
ISO date (`"2026-07-19"`). Same shape as the daily token; no collision (rows are keyed by
horizon + token). **Migration note:** annual/seasonal/monthly tokens are untouched
(legacy byte-match preserved); the weekly change orphans any in-progress weekly session's
notes/resume state once — old rows stay in the DB, harmless. Ship at a week boundary or
accept the one-time reset.

### D3. The threshold rule — `plannablePeriod()`

New pure helper (proposed `src/lib/cadence/plannable.ts`, unit-tested):

```ts
type PlanMode = 'fresh' | 'midstream' | 'next'
function plannablePeriod(
  horizon: 'weekly' | 'monthly' | 'seasonal' | 'annual',
  now: Date,
  config: CadenceConfig,
): { period: GuidedPeriod; mode: PlanMode }
```

- Compute the current period (per D1 for weeks). Let `daysRemaining` = whole days from
  today (inclusive) to period end.
- **If `daysRemaining` ≤ cutoff → return the NEXT period, `mode: 'next'`.**
- Else if today > period start → current period, `mode: 'midstream'`.
- Else `mode: 'fresh'`.

Proposed cutoffs (open question Q1):

| Horizon | Cutoff | Effect with Sunday-start weeks |
|---|---|---|
| weekly | ≤ 3 days remaining | Thu/Fri/Sat plan next week; **Sunday = day 1 plans the new week naturally** |
| monthly | ≤ 7 days remaining | Last ~week of a month plans the next month |
| seasonal | ≤ 21 days remaining | Final 3 weeks plan the next season |
| annual | now ≥ Nov 1 | Nov/Dec plan next year |

Daily is exempt — "Plan today" always targets today.

**Escape hatch:** the wizard header shows the target period as a chip ("Week of Jul 26")
with a one-tap toggle to the other candidate ("plan the rest of this week instead" /
"plan next week instead"). Deep-linkable via `?plan=week&period=current|next` so the
toggle is stateless.

### D4. Mode-aware steps

- **Lookahead steps** (`CalendarStep`, month/season "ahead"): window is
  `max(period.start, todayMidnight) → period.end`. Midstream labels say "the rest of
  July" / "the rest of this week". Never render already-past days as "ahead".
- **`ScheduleGridStep`:** `weekDate = max(periodStart, todayMidnight)` (mode `next` keeps
  `periodStart`). `StepSchedule` dims past-day columns and **rejects drops on days before
  today** with a toast ("That day is already behind you — pick a day ahead"). No silent
  past scheduling. (Open question Q3: hard-block vs confirm.)
- **Review steps** in `mode: 'next'` (e.g. "Last week's list" run on a Thursday for next
  week) review the *in-progress* period's open items — carry-forward becomes seeding the
  new plan. Copy already fits; only the pool's period token changes.
- **Midstream copy variants:** on-screen hint text only (a `<p>` under the narration).
  **Do not touch spoken narration strings** — they're TTS-pinned; any change to
  `narration` fields breaks `narration.test.ts` and requires `ELEVENLABS_API_KEY=… npm
  run narration`.

### D5. "Placed this week" on the /week page

`HorizonView` (week rung only) adds a section between *Carried over* and the pool:
tasks with `bucket === 'timed'` and `scheduledFor` within `[weekAnchor, weekAnchor + 7d)`
— the same predicate as `ScheduleGridStep`'s placed-rocks branch (extract it into
`lib/today/horizons.ts` as `selectPlacedThisWeek` and share). The empty-state
("Nothing planned for Week yet") shows only when *both* the week pool and placed set are
empty. Carried-over semantics stay as-is: overdue = dated before today — but a freshly
planned week no longer *reads* as failure because its placed rocks are visible.

### D6. Completing a session dismisses its nudge

Weekly wizard Finish records the period token through the same dismissal store the
banner's ✕ uses, so `getDueSession` consumers stay quiet for that period. Applies to all
four horizons (monthly/seasonal/annual anchors too). With D1–D3, the Sunday nudge and the
Sunday session finally refer to the same week.

### D7 (P2, optional). Weekly → daily cascade

Add "Plan today now →" beside Finish on the weekly session, completing the chain's
symmetry (annual→seasonal→monthly→weekly already exists). Skippable like the others.

## Implementation map

| File | Change |
|---|---|
| `src/lib/cadence/plannable.ts` (new) | `plannablePeriod` + cutoffs + tests (matrix: each weekday × `weekStartsOn` 0/1, month/season/year ends, December season wrap) |
| `src/components/planning/guided/periods.ts` | Drop private `startOfWeek`; weekly uses `weekStartAnchor` + anchor-date token; accept an explicit target date (for `mode next`) |
| `src/components/planning/guided/GuidedSession.tsx` / `GuidedSessionContainer.tsx` | Resolve target via `plannablePeriod`; header chip + `period=` override param |
| `src/components/planning/guided/sessions.ts` | Step reorder (projects before write, monthly); midstream on-screen hints; "Your goals so far" title fix — spoken narration untouched |
| `src/components/planning/guided/stepTypes/CalendarStep.tsx` | Today-forward window + "rest of" labels |
| `src/components/planning/guided/stepTypes/ScheduleGridStep.tsx`, `weekly/StepSchedule.tsx` | Today anchor, past-column dim + drop guard |
| `src/components/planning/guided/stepTypes/BookNextStep.tsx` | Anchor-task dedup (title + date upsert) |
| `src/apps/tasks/HorizonView.tsx`, `src/lib/today/horizons.ts` | `selectPlacedThisWeek` + "Placed this week" section + empty-state condition |
| `src/lib/cadence/config.ts` (+ nudge dismissal store) | Completion-dismissal helper |
| `src/lib/dateUtils.ts` | `startOfWeek` honors cadence config (audit its callers) |

Verify with `npm run build` (not bare `tsc --noEmit`) and `npx vitest run`; lint before
push (CI runs lint, the pre-push hook doesn't).

## Out of scope

- Rolling "next 7 days" weeks — rejected: kills the shared family/wall rhythm and the
  discrete period tokens the cascade is built on.
- Server-side cadence config sync (stays per-device localStorage this pass).
- Season/Week grid views (separate track — see horizon-calendar-grids spec).
- An evening "plan tomorrow" daily variant.

## Open questions (Scott)

1. **Cutoffs:** week ≤ 3 days remaining (i.e. Thu onward with Sunday start), month ≤ 7,
   season ≤ 21, annual from Nov 1 — right feel?
2. **Weekly token migration:** OK to orphan the current in-progress weekly session's
   notes once, or ship the token change on a week boundary?
3. **Past-day rock drops:** hard-block with toast, or allow with a confirm ("Schedule in
   the past?") for backfilling done-but-unlogged work?
