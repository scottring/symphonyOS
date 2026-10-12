# Week, Season and Year — coordinator status

Coordinator: Claude background session (this worktree). Last updated 2026-10-12 17:35 ET.

**State: Season and Year done and integrated; Week agent still running. Nothing released. Not ready for review.**

## Integration branch

- Worktree: `.worktrees/horizon-purpose`, branch `codex/horizon-purpose`, from origin/main `06b8248d`.
- Base: Month's final commit `75cd0323` (`codex/month-purpose`, not yet on origin/main at 17:00). It is
  byte-identical in src/ to the 16:38 snapshot the agents started from, so the snapshot commit was dropped
  and the integration branch rebased onto `75cd0323`. Agent branches will be rebased the same way at merge.
- Coordinator seam (rebased SHAs `9ca3e003`, `d71eed4a`, `7e62e129`; agents started from the pre-rebase
  equivalents `16e99ce2`, `9951089c`, `8f13013a`): `useSessionProgress` (+5 tests), ConstellationPage `boardLayout` and Season/Year regions, per-horizon stylesheets. Constellation tests 66/66, typecheck clean at `8f13013a`.

## Agent assignments

| Horizon | Agent | Worktree | Branch |
|---|---|---|---|
| Week | Week agent | `.worktrees/horizon-week` | `claude/horizon-week` |
| Season | Season agent | `.worktrees/horizon-season` | `claude/horizon-season` |
| Year | Year agent | `.worktrees/horizon-year` | `claude/horizon-year` |

All three branch from `8f13013a` (pre-rebase seam tip; same content). Agent instructions: shared rules + one horizon each (Week = Scott's exact four steps; Season = year goals as source; Year = previous year as review material).

## Shared-file ownership

- `ConstellationPage.tsx` (shared with Month): Season and Year edit **only inside their marked regions**
  (flag, hooks, render). Board UI goes in their own files (`SeasonBoard.tsx`, `YearBoard.tsx`).
  Any other line in this file: coordinator only. Month's code is not edited by anyone but the Month session.
- `ConstellationPage.test.tsx` (Month's): read-only. Season/Year put tests in their own files; if a legacy
  Season/Year case there must change, the agent reports it and the coordinator edits.
- `canvas-plan.css`: read-only; reuse Month's classes (`plan-month-board`, `plan-month-goals`,
  `plan-month-source`, `plan-source`, `plan-month-list`, `plan-item-parent`, `plan-month-intro`,
  `plan-month-next`). Horizon-specific CSS goes in `src/styles/plan-season.css` / `plan-year.css`
  (imported in `src/main.tsx` next to canvas-plan.css; Week adds `plan-week-session.css` if needed).
- `PlanItemRow.tsx`, `ProposalRow.tsx`, `InlineComposer.tsx`: read-only (Month's).
- `PlanStatus.tsx` (`PlanMeetingBar`, the one session bar for every horizon): Week agent owns;
  additive, backward-compatible changes only. Season/Year use it read-only.
- `useSessionProgress.ts` (new, coordinator): per-person/horizon/period step, drafts, decisions;
  this browser only. All three use it for resume.
- `pageGuides.ts`: each agent edits only its own key (`week`, `season`, `year`).
- `src/main.tsx`: one CSS import line per agent.
- Kiosk/wall, Today, Home: no one touches.

## Progress

- [x] Month snapshot + seam committed
- [~] Week agent — running
- [x] Season agent — `claude/horizon-season` `c2e8c038`, `2ca3bd88` (28 tests); cherry-picked as `7f00f86f`, `059a5c80`
- [x] Year agent — `claude/horizon-year` `71097914`, `ac315e17`, `3091e377` (23 + 2 tests); cherry-picked as `ab31ca56`, `13bb0c37`, `4198e247`
- [x] Coordinator: 12 superseded Season/Year cases in Month's `ConstellationPage.test.tsx` rewritten to the approved board (`9cf69111`, `d073402d`); board imports consolidated; one session entry vocabulary for Season/Year ("Plan <period>", "Continue planning <period> · step N of M", "Plan <period> again", same primary button); Season look-back headed "Look back at <season>" like Year; Year look-back goes first on narrow screens like Season.
- [x] Integration branch rebased onto Month's final commit `75cd0323` (17:00)
- [ ] Integrate, cross-horizon consistency pass, desktop/phone/keyboard/reduced-motion checks
- [ ] Full tests, lint, build; PR for review (no production release without Scott's approval)

## Evidence

- Visual harness (coordinator, outside the repo): Playwright + system Chrome against `vite preview` of the
  integration build on :5210. Signs in as the demo test account, serves **fixture** tasks/goals/household
  seasons (custom seasons "Thaw / Long days / Harvest / Hearth", Saturday weeks), and **intercepts every
  write** (insert/update/delete/RPC never reach the database). Baseline Month shot taken 16:58 on the
  snapshot: complete October list + Harvest source column renders with fixture data; no page errors;
  0 writes.

## Blockers / release steps

- Month is committed (`75cd0323`) but not yet on origin/main; before review, rebase onto origin/main once Month ships.
- These horizons need their own approval before production; Month's approval does not cover them.
