# Planning horizons spruce-up — make the Year→Season→Month→Week→Today cascade foolproof & spectacular

Trigger: Scott + Iris's July plan + 6-mo goal brainstorm happened in a PAPER
NOTEBOOK because the app's upper horizons were empty and the planning sessions
offer no way to capture anything new (pull-down only). Acceptance test: the
notebook's contents live comfortably in Symphony, visible on the Month/Season
rungs, and next month's session can be done entirely in-app.

Diagnosis (from live prod walkthrough + code map):
- Sessions are pull-down only — "Nothing to pull down" dead end from a blank slate.
- Month/Season/Year rung views are flat task lists (or a placeholder card) — no
  goals, no projects, no sense of place in the cascade.
- Year rung is severed: points at a separate Goals app; Goals is empty.
- TriageWhenMenu has no "This season" — quarter bucket unreachable from rows.
- Weekly session notes save to Scott's vault only (Iris can't see them);
  monthly/seasonal/annual use the shared planning_sessions table.
- goal_milestones table queried by code but no migration ever created it.
- Seasons (meteorological, YYYY-Sx) vs goal quarters (Q1-Q4) mismatch — noted,
  display-level only for now.

## Todo

- [ ] T1 lib: `src/lib/cadence/periods.ts` — periodLabel(horizon), periodProgress
      (day N of M + pct), horizon neighbors (up/down) helpers. Unit tests.
- [ ] T2 triage: add `this-season` to TriageWhen vocabulary (Month group fan-out
      → "This season"), applyTriageWhen + describeTriageWhen; refactor
      HorizonView's duplicate applyWhen switch to use applyTriageWhen. Tests.
- [ ] T3 sessions from blank: CadenceSession gets inline capture ("Add something
      new to {period}…") in the Plan section, always visible when thisBucket —
      wired via new onCreateTask prop from HomeViewContainer (bucket=thisBucket).
- [ ] T4 horizon one-pager: HorizonView masthead (period label + progress line),
      cascade rail (neighbor rungs + counts, tappable), goals strip
      (current-season goal actions w/ "Plan it" pull for month/season), projects-
      in-motion grouping (pool grouped by project, loose tasks after), improved
      empty state (door to the planning session). Nordic Journal, calm.
- [ ] T5 year rung real: annual goals by area rendered inline on /year (name,
      season-action progress, door to GoalView), keep Plan-the-year + Open Goals.
- [ ] T6 weekly shared notes: StepConcerns dual-writes to planning_sessions
      (horizon 'weekly', ISO-week token) alongside the vault save.
- [ ] T7 db: goal_milestones migration (check prod first — may exist manually);
      apply via Management API if missing.
- [ ] T8 verify: lint + vitest run + build; push to main (auto-deploy).
- [ ] T9 seed the notebook: July plan → month bucket tasks (+ projects), 6-mo
      brainstorm → season bucket + goals (areas/goals/actions), family context +
      proper scope; verify live in browser on prod as Scott.

## Review

(to fill after)
