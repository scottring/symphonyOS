# Week, Season and Year — coordinator status

Coordinator: Claude background session (this worktree). Last updated 2026-10-12 (late evening) ET.

**State: implemented, integrated, tested and visually checked. Not released.** Ready for Scott's review as a
draft PR stacked on Month's PR #182. Production needs Scott's own approval; Month's approval does not cover it.

## Integration branch

- Worktree `.worktrees/horizon-purpose`, branch `codex/horizon-purpose` (pushed).
- Month PR #182 **merged to main** (`de4ca203`, identical tree to `75cd0323`). origin/main merged into this branch
  (`6536261f`, no content change) and PR #183 retargeted to `main` (32 files, horizons only).
- Formerly based on Month's commit `75cd0323` (`codex/month-purpose`).
  The 16:38 Month snapshot the agents started from was byte-identical in `src/`; it was dropped and the branch
  rebased onto `75cd0323`.
- Draft PR (base `codex/month-purpose`, so it shows only Week/Season/Year): see "PR" below.

## Agent assignments

| Horizon | Agent | Worktree | Branch / commits | Integrated as |
|---|---|---|---|---|
| Week | Week agent | `.worktrees/horizon-week` | `claude/horizon-week` `88385920`…`70022e45` (6) | `ca8acde5`…`e1af49bd` |
| Season | Season agent | `.worktrees/horizon-season` | `claude/horizon-season` `c2e8c038`, `2ca3bd88` | `7f00f86f`, `059a5c80` |
| Year | Year agent | `.worktrees/horizon-year` | `claude/horizon-year` `71097914`, `ac315e17`, `3091e377` | `ab31ca56`, `13bb0c37`, `4198e247` |

All three started from the coordinator seam (`useSessionProgress`, flagged Season/Year regions in the shared
`ConstellationPage.tsx`, per-horizon stylesheets). No agent edited Month's code, `canvas-plan.css`,
`PlanItemRow`, `ProposalRow` or Month's test file; there were no SHARED: commits and no migrations.

## What each horizon now does

- **Week** — "Plan the week" runs Scott's four steps in order: Inbox → Last week → Monthly goals → Days & times,
  on the shared session bar. One week list stays in place through all four (same DOM node); the source beside
  it changes per step; step 4 puts the days (events, routines, dated tasks) beside the list. Inbox picks and
  last-week pulls visibly join the list; carry uses existing `keepForward` (no clones, nothing automatic).
  Both months' goals for a boundary week. "Review last week" opens step 2. The old eight-step session is gone.
- **Season** — "What do you want to accomplish in <season>?": every season goal in one collection; the year's
  goals are a hideable source (select highlights, never filters; add-under in one write; quiet "<year> goal"
  label). Optional 3-step session: Look back at <previous season> (carry / done / leave, never automatic),
  your <year> goals, write <season>. "Plan a month from these goals →".
- **Year** — "What do you want to accomplish in <year>?": every year goal in one collection with season-goal
  counts; last year is hideable review material, not a parent. Renew creates a **new** goal (`carriedFrom`),
  old goal untouched; mark done is explicit and undoable. Optional 2-step session (Look back with notes,
  Shape <year>). "Plan a season from these goals →".
- **All** — same Month board classes and cards; one session vocabulary: "Plan <period>", "Continue planning
  <period> · step N of M", "Plan <period> again"; sessions pause/resume per person and period in this browser
  only (said so in the page guides); hide/show never unmounts unfinished input.

## Coordinator integration fixes (from the cross-horizon pass)

- Rewrote 12 Season/Year cases in Month's `ConstellationPage.test.tsx` that asserted the superseded layouts.
- One session entry label/weight across Week, Season and Year; Season's look-back headed like Year's.
- Narrow screens: the look-back/Inbox source comes first during those steps on all three.
- **Bug fixed:** Week step 4's day columns were ~120px wide beside the list, wrapping event titles one letter
  per line; the session's days now measure their own column (3 across or an agenda).

## Evidence

- Full suite: **8752 passed, 3 skipped**; 1 file fails to load: `connectors/src/whatsapp/adapter.test.ts`
  (`@whiskeysockets/baileys` isn't installed in this worktree; connectors/ untouched).
- Horizon suites (`src/components/plan`, `canvas`, `home/week`): 906 passed. New tests: Week 32, Season 28,
  Year 25, session hook 5.
- `tsc -p tsconfig.app.json` clean; `eslint .` 0 errors; `npm run build` succeeds.
- Visual pass with a read-only harness (Playwright + Chrome on a `vite preview` of this branch, :5210; demo
  test account for sign-in; **fixture** tasks/goals and custom seasons "Thaw/Long days/Harvest/Hearth" with
  Saturday weeks; every write intercepted — no database records changed). Checked at 1440, 1280 and 390px:
  Month unchanged; Season and Year boards, selection highlight, sessions through every step, Leave → reload →
  "Continue planning … step 3 of 3" restores the step and a half-written goal; Week all four steps, Inbox add
  joins the list, "Review last week" opens step 2, the Oct 31–Nov 6 week shows October and November goals,
  resume label shows the saved step; no horizontal scroll on phones; keyboard select (Enter) / clear (Esc)
  with a visible focus ring; reduced-motion media query active. Screenshots are local to the session, not committed.
- Kiosk/wall, Today and Home files: not touched.

## Not verified / decisions for Scott

- No real-account or two-account privacy test (filtering is proved with mocks); no live drag-and-drop on
  real data in Week step 4.
- Week's columns are source 3fr / list 2fr (Month is 2fr/3fr) so the days fit in step 4 without the list moving.
- Week plans the week on screen (it opens on the current week); planning next week means stepping forward first.
- Year renewals copy area/context/people but not notes or strategy (the old Year page copied notes).
- Last year's and last season's look-backs now follow the people filter like every other list (behaviour change).
- Season's year source uses the anchor date's year (a December-start winter viewed from January shows the
  next year's goals).
- Removed from Week's session: "put the month goal on the week as is" and completing a month goal from Week
  (the brief says the month goal stays as it is).

## Added requirement: uniform triage (2026-10-12) — implemented and verified, not released

Scott's addendum (`canvas-first-slice/docs/planning/2026-10-12-uniform-triage-claude-addendum.md`). One owner (the
Triage agent) built a single shared contract; delivered as a **separate draft PR stacked on #183** (see PR below),
branch `claude/uniform-triage` (worktree `.worktrees/uniform-triage`). The finished Week/Season/Year agents were not
running and their transcripts couldn't be resumed, so they could not race it.

**Contract** (`src/lib/triage/contract.ts`, dates in `periods.ts`, writes in `applyWhen.ts` / `feedback.ts`).
When, always in this order, each with its destination date: Today · Tonight · Tomorrow · This week · Next week ·
This weekend · Next weekend · This month · Next month · This season · Someday · Pick date & time…
- Task / capture: all When, then More (Complete/Reopen, Open details, People, Life area, Move under, Delete where
  the surface has a safe writer). Dated task adds **Skip this day** (removes only the day; week + goal links stay).
- Routine occurrence: Today/Tonight/Tomorrow direct; week/weekend/month **ask for an actual day**; This season and
  Someday shown as "Not for one time" with Skip/Open routine offered instead; **Skip this time** (one occurrence,
  Undo); Complete; Open routine. Never edits the routine.
- Season/Month goal: no day choices — Carry to next {period} · name, Remove from this {period}, Complete, Open,
  Delete. Year goal: Complete/Reopen, Archive. Calendar event: unchanged, event-only.
- Dates count from the actual today (also while viewing another week/day), household week start, custom seasons;
  `dateHelpers.ts` (used by the kiosk) unchanged.

**Coverage, before → after** (reproduced the two reported menus first on the pre-change build):

| Surface | Entity | Before | After |
|---|---|---|---|
| Week canvas day row | task | Move to another day, Back to still to place, Open, Complete, People, Life area, Move under | Another day in this week · full When · Skip this day · Complete · Open details · People · Life area · Move under |
| Week canvas day row | routine occurrence | Move to another day, Open, Complete | Another day · full When (periods pick a day; season/Someday explained) · Skip this time · Complete · Open routine |
| Week canvas shelf | undated task | People, Life area, Move under | Give it a day · When · More |
| Week planning rows | week task | Done, Carry, Someday, Drop, Do it today | When… (shared grid) · Carry/Drop kept as review verbs (distinct from Skip) · Complete · Open details |
| Today rail / ⋯ | task | 8 tiles; weekend = Saturday; "Remove from this day" | Full When · Skip this day (Undo/Retry) · Open details |
| Today rail | occurrence | Tomorrow, two weekend days, next Monday, Skip | Full occurrence contract |
| Today day-scale → routine panel | occurrence | "Hide for today" beside whole-routine settings | "This time · date" section: shared occurrence menu + Skip this time; "Whole routine" section for rest/schedule |
| Inbox More | capture | Grid; next week = Monday; weekend = Saturday | Full When grid in contract order, dated |
| Details Schedule | task | 8 tiles; "Clear schedule" (left focus, no Undo) | Full When · Skip this day (same write as Week, Undo/Retry) |
| Details | calendar event | Event tiles | Unchanged |
| Season/Month goal menu | goal | Full day When (could turn a goal into a day task) | Period verbs only, no days |
| Year goal menu | goal | Complete, Archive | Complete/Reopen, Archive |
| Review drawer / pools / Someday / Expired / Reference (TriageRow) | task | Today/Tomorrow from the viewed day; weekend/next week as Saturday/Monday | Actual today (date in title); periods per contract |

**Coordinator fixes on top:** TriageRow Today/Tomorrow from the actual today (`dac7cae8`); moves to a later pool
count as deferrals again, as the dated writes did (urgency reads `defer_count`); routine panel occurrence menu and
details "Skip this day" (requested from the Triage agent: `c674838e`, `deeea373`).

**Evidence:** full suite 8810 passed / 3 skipped (only `connectors/…/adapter.test.ts` fails to load — missing
package in this worktree, untouched); wall-v2 tests pass; tsc clean; eslint 0 errors; build passes. New tests
cover parity across Week canvas / Today / Inbox / details, Tomorrow under another viewed week, Saturday weeks,
next month, custom seasons, occurrence pick-day and Someday explanation, Skip this time + Undo touching one
occurrence, Skip this day keeping week + goal links, goal menus without days, failed write → Retry and no Undo,
keyboard (arrows, Escape returns focus). Browser (read-only harness, fixtures, all writes intercepted): both
Week menus at 1440 and 390px (menu stays inside the viewport and scrolls), Skip this time → "Saved … Undo",
Today routine panel occurrence menu, details Skip this day → "Skipped Mon, Oct 12 … Its week and goal are
unchanged.", Inbox More grid. No kiosk/wall files changed.

**Genuine model limitations / known gaps (not silently omitted):**
1. A routine occurrence can't be undated: This season and Someday are shown as "Not for one time" and point to
   Skip this time or Open routine.
2. Goals have no "move to any later period" picker — only Carry to next and Remove from this period.
3. No Delete on Week canvas task rows (no canvas delete writer with an honest Undo); Delete stays in details.
4. Today keeps its rail layout: When/Skip in the calendar popover, People/Life area as rail cells, Open/Skip/Delete
   in ⋯ — same vocabulary, not merged into one menu.
5. `TaskTimingMenu` (the "timing" control on Today/details) is not converted.
6. This season's name comes from the `symphony-seasons` cache; a browser that has only opened Inbox shows the
   default season name until a page that loads household seasons has run once.
7. Pre-existing: the routine panel opens focused on Location, scrolled past the new "This time" section.
8. Behaviour change: for a task, Next week / weekends / Next month now land in that period's list (household
   week start, a weekend as either day) instead of a date on next Monday / Saturday / the 1st.

## PR

- Draft PR: https://github.com/scottring/symphonyOS/pull/183 (base `codex/month-purpose`; retarget to `main` after #182 merges)

## Release steps remaining

1. Scott reviews PR #182 (Month) and this PR.
2. After #182 merges, retarget this PR to `main`, rebase onto origin/main, rerun tsc/tests/build.
3. Only with Scott's explicit approval: merge to main (deploys production) and verify app.symphony-os.com.
