# Assign people on planning rows — handoff for Codex review

Branch `claude/plan-row-assign` (worktree `.worktrees/plan-row-assign`), based on
`origin/main b9b6077e`. Not pushed, not merged, not deployed. No shared
migration applied. The Stage 2 switch was not touched.

## What changed

Goal rows and their step rows on the Year, Season and Month pages now carry a
visible **Assign people** control. It uses the existing household picker
(`MultiAssigneeDropdown`) and the existing assignment fields.

- **Season and month goals, and all steps** (these are `tasks` rows): the
  control writes `{ assignedToAll: ids, assignedTo: ids[0] ?? undefined }`,
  the shape Today's actions, Triage, the detail panel and Projects already
  send. The write goes through `gated.updateTask`, so:
  - an untagged row is asked for its area first, as everywhere else
    (`needsDomain`);
  - `updateTask` derives scope from the people chosen (someone else →
    `couple`; only yourself or no one → `individual`; family stays
    `compound`) and never changes the context.
- **Each row is independent.** Assigning a goal never writes its steps, and
  no assignment cascades.
- **Past periods get no picker**, since a look-back is read, not written.
  The same applies when the household has no members.
- **Year goals** are `goals` rows, and that table has no assignee column. The
  prepared migration `supabase/migrations/2026-09-25_goals_assigned_to_all.sql`
  adds `goals.assigned_to_all uuid[] default '{}'`, the same model as tasks,
  events and routines. **It is NOT applied.** The client detects the column:
  - `useGoals` maps `assignedToAll` only when the row has the key, and a year
    row without it shows no picker.
  - `updateGoal({ assignedToAll })` derives scope with the task rule and
    ignores the call if the column is absent.
  - So the client is safe to ship before or after the migration.
- **Picker accessibility** (`MultiAssigneeDropdown`, which also improves every
  existing use):
  - an optional `triggerLabel` gives each trigger a row-specific name and
    reads out who is assigned;
  - the trigger has `aria-haspopup` and `aria-expanded`;
  - the menu is `role="menu"`, and each person is a `menuitemcheckbox` with
    `aria-checked`;
  - focus moves into the portalled menu when it opens (before, Tab could never
    reach it);
  - Escape, or Tab past either end, returns focus to the trigger.
- **Layout:** on desktop the picker sits beside the timing control; on a phone
  it sits under the title, next to "Choose when".

Files: `PlanRow.tsx`, `PeriodPlanPage.tsx`, `family/MultiAssigneeDropdown.tsx`,
`hooks/useGoals.ts`, `contexts/GoalsContext.tsx`, `types/goal.ts`, the
migration, and the tests.

## Evidence

- **Tests.** New assignment tests:
  - the page: a goal and its step each get their own control; assigning one
    person, several, and clearing; no cascade to steps; the season goal;
    year goals with and without the column; past periods; an empty household;
    the keyboard path;
  - `useGoals`: scope derivation and the absent-column guard;
  - the picker: its names and states, focus moving in, and Tab out.

  Full suite: 686/686 files, 7247 tests. tsc passes (both configs), eslint has
  0 errors, and the build passes.
- **Live, on :5199** (the demo account, with disposable December 2026
  fixtures, since deleted):
  - Goal → Edith: one PATCH `{scope: couple, assigned_to, assigned_to_all}`;
    context and the December record unchanged; the step untouched; a "Shared
    with Edith" toast.
  - Step → Alex (self): scope stays `individual`. Adding Mia: `couple`, and
    two avatars show.
  - Reload: the step reads "Assigned: Alex, Mia".
  - Keyboard only: Enter opens the picker with focus on "Alex (checked)";
    Shift+Tab to Clear, then Enter, writes
    `{scope: individual, assigned_to: null, assigned_to_all: []}`; Escape
    returns focus to the trigger.
  - 390px (same-origin iframe): the picker sits under a wrapped title, three
    avatars plus "+1", a 44px tap target, and no horizontal scroll.
- **Not touched:** Scott's in-progress "Identify activities for the family"
  (checked before and after; unchanged). "Research" was not present in the
  demo DB when checked.

## Decision needed (not a code defect)

**A row assigned only to other people leaves your own Season/Month page.**
The period pages list only unassigned rows and your own (`doableBy` in
`selectPeriodTasks`, Scott's 2026-09-05 rule "scope month dropdown properly").
Live: assigning the goal only to Edith removed it from the demo owner's page
("0 goals"), and its unassigned step then showed as a loose task. This is
pinned by a test and left unchanged, because the rule was a deliberate
decision.

- **Recommendation:** exempt goals (and their steps) from that filter, since
  a household plan is shared by design, or show an "Assigned to others"
  fold. Scott's call.

## Smaller notes

- The picker's existing footer says "Shared event — subway lines will
  converge!" when 2+ people are chosen. It is odd on a goal, but it is
  existing copy on a shared component, so it is left alone.
- :5199 now serves this branch (the previous server there was this session's
  own onboarding preview).
- Two-account verification of year-goal assignment waits for the migration.
  Task-row sharing uses the existing `updateTask` path, which is already
  covered by the earlier two-account checks.
