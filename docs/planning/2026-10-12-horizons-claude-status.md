# Week, Season and Year — coordinator status

Coordinator: Claude background session (this worktree). Last updated 2026-10-12 16:50 ET.

**State: three agents running (launched 16:48); nothing integrated or released yet. Not ready for review.**

## Integration branch

- Worktree: `.worktrees/horizon-purpose`, branch `codex/horizon-purpose`, from origin/main `06b8248d`.
- `10f369b5` handoff doc.
- `dae0cb29` **TEMP Month baseline snapshot** — the Month session's uncommitted working tree at 16:38
  (`codex/month-purpose`). Season and Year build on it so they match Month's board. It will be dropped
  and replaced by Month's final commit (or origin/main once Month ships) before review.
- `16e99ce2`, `9951089c`, `8f13013a` coordinator seam: `useSessionProgress` (+5 tests), ConstellationPage `boardLayout` and Season/Year regions, per-horizon stylesheets. Constellation tests 66/66, typecheck clean at `8f13013a`.

## Agent assignments

| Horizon | Agent | Worktree | Branch |
|---|---|---|---|
| Week | Week agent | `.worktrees/horizon-week` | `claude/horizon-week` |
| Season | Season agent | `.worktrees/horizon-season` | `claude/horizon-season` |
| Year | Year agent | `.worktrees/horizon-year` | `claude/horizon-year` |

All three branch from `8f13013a`. Agent instructions: shared rules + one horizon each (Week = Scott's exact four steps; Season = year goals as source; Year = previous year as review material).

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
- [~] Season agent — running
- [~] Year agent — running
- [ ] Rebase onto Month's final commit
- [ ] Integrate, cross-horizon consistency pass, desktop/phone/keyboard/reduced-motion checks
- [ ] Full tests, lint, build; PR for review (no production release without Scott's approval)

## Evidence

(none yet)

## Blockers / release steps

- Month has not committed yet; its final commit must replace the snapshot before review.
- These horizons need their own approval before production; Month's approval does not cover them.
