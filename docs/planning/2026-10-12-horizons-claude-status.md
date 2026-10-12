# Week, Season and Year — coordinator status

Coordinator: Claude background session (this worktree). Last updated 2026-10-12 18:05 ET.

**State: implemented, integrated, tested and visually checked. Not released.** Ready for Scott's review as a
draft PR stacked on Month's PR #182. Production needs Scott's own approval; Month's approval does not cover it.

## Integration branch

- Worktree `.worktrees/horizon-purpose`, branch `codex/horizon-purpose` (pushed).
- Base: Month's final commit `75cd0323` (`codex/month-purpose`, PR #182, **open, not yet on origin/main**).
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

## PR

- Draft PR: https://github.com/scottring/symphonyOS/pull/183 (base `codex/month-purpose`; retarget to `main` after #182 merges)

## Release steps remaining

1. Scott reviews PR #182 (Month) and this PR.
2. After #182 merges, retarget this PR to `main`, rebase onto origin/main, rerun tsc/tests/build.
3. Only with Scott's explicit approval: merge to main (deploys production) and verify app.symphony-os.com.
