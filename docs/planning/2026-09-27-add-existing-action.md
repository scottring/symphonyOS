# Add an existing action under a goal (2026-09-27)

Branch `claude/goal-existing-action`, stacked on `claude/paper-type-selector`. It is local only: not pushed, merged or deployed. Each commit covers one scope, so the selector can ship without it:

1. `Page review: "Use existing item" instead of "Link"`: import-sheet wording only.
2. `Goals: add an existing action`: the feature (UI, lib, unit tests).
3. `Prepared migration: goal links only to goals you can see`: **NOT APPLIED to the shared project**; needs review and Scott's approval.
4. This doc and the local acceptance scripts.

A separate commit on the selector branch, `19a47bac`, fixes a pre-existing bug found in the audit: a reused ("Use existing item") year-goal, routine or day-fact line was still inserted. It needs its own review before the selector ships.

## The relationship (audited; no parallel link invented)

A next action is a task whose `tasks.goal_task_id` points at an `is_goal` task. This is the same link used by:
- the next-action box;
- the week's "Toward a goal";
- plan sessions;
- "Link to goal" (`fileUnderGoal`).

Filing an existing action writes that one column through `updateTask`, which has no side effects for it. Removing it clears the column. Nothing else changes: notes, people, area, privacy (`scope`), dates, week/month/season commitments, focus and completion all stay as they are. The goal's area is **not** inherited (#67's rule applies to *new* actions only). The column holds one goal, so an action under another goal is moved only after an explicit "Move it to …".

## Coverage

| Surface | Add an existing action | Remove from goal | Shows the link |
|---|---|---|---|
| Month plan: goal rows (`PeriodPlanPage` → `PlanRow`) | Yes, beside "Add a next action" | Yes, a row verb (hover on desktop, the Move menu on a phone) | Yes: under the goal after reload, including actions **not on the month's list** ("Not on this list · Inbox") |
| Season plan: goal rows | Yes | Yes | Yes |
| Goal details page (`TaskViewContainer`/`TaskViewRedesign`, month/season goals) | Yes, beside "Add a step" | Yes, per step | Yes: Steps lists every accessible action with this goal |
| Task details page (an action) | — | Yes | **New:** "Next action for October · …", at every width |
| Task side panel (`TaskDetailPanel`) | — | — | Already showed "For …" (`goalOfTask`); unchanged |
| Week list "Toward a goal" | — (creates new actions only) | — | Already groups by goal; unchanged |
| Plan session (draft) | — (a draft adds new rows) | — | Unchanged |
| **Year goals** (`goals` table) | **Not offered: genuine storage difference.** A year goal has no next actions. `tasks.goal_id` is how a *season goal* supports a year goal; the unused `goal_actions` table has no UI; and nothing lists tasks under a year goal. Faking parity would write a link no page reads. Actions belong under a season or month goal, which supports the year goal. | — | — |
| Import review "Use existing item" (was "Link") | Reuse only: nothing new saved; **makes no goal relationship** (said on screen) | — | — |

## Authorization and privacy

- **Candidates** come only from the rows RLS lets the reader load. Another member's private work is never offered; this was checked live as Alex.
- **The task side:** tasks RLS `UPDATE` already limits who may change `goal_task_id`: the owner, or a household member when the task is shared (`couple`/`compound`).
- **The goal side is a gap on production today.** The applied `guard_goal_link_target` is `SECURITY DEFINER` and checks only that the target is a goal. A signed-in user could therefore file a task under a goal id they cannot see, including one in another household. The prepared migration `2026-09-27_goal_link_visible.sql` refuses that (`42501`), using the tasks SELECT rule. Server writers are unchanged.
  - Proof: `supabase/tests/102_goal_link_visible.test.sql` runs as real `authenticated` users on the local stack, rolled back (`run-102.sh`). Case 4 fails without the migration and every case passes with it.
- **A private action under a shared goal** stays private. The picker says so, and a household member sharing the goal does not see it (test case 9, and live as Sam: two shared actions shown, the private one not).
- The UI now **must not be deployed without the migration**, or the goal side is enforced only by the client offering visible goals.

## Verification

- **Unit and component tests:**
  - `existingActions.test.ts`: eligibility, search ranking, here / elsewhere / hidden-goal states, same-title disambiguation by date and then time, 50-row bound with the total count, privacy note, off-list steps, off-goal verbs.
  - `AddExistingActionDialog.test.tsx`: link, already-here disabled, explicit move with Keep, honest failure, duplicates, long list, keyboard and Escape.
  - `PlanRow.test.tsx`.
  - Full suite: 7,462 pass. The one failing file is the connectors WhatsApp dependency, as on main. `tsc` is clean, and lint shows no new errors.
- **Local end-to-end** (`outputs/goal-existing-action/`): isolated local Supabase `:55321` with the migration applied locally, the app built against it on `:5212`, fictional Alex/Sam household, and Playwright. Every request to the shared project was blocked in the driver.
  - Filing the Inbox "Look up music lessons" (the example) under "Identify family activities for fall" left the row fingerprint identical before and after, apart from `goal_task_id`. It persisted after reload.
  - Two identical "Look up music lessons" (Alex's Inbox / Sam's Week of Oct 5) are told apart by where they are, whose they are and the time added.
  - A scheduled action (Oct 14, 3:00 PM) was filed, then removed: it keeps its date and time.
  - Swim lessons, under "Get the house ready for winter", required "Move it to …" before moving.
  - A private action was filed with its privacy note, and Sam did not see it. Sam's private work was not offered to Alex.
  - 60 errands: "Showing 50 of 60".
  - Goal page, month page and task page all show the link after reload.
  - At 390px there is no sideways scroll and the dialog is a bottom sheet.
  - Keyboard: Enter opens the dialog, the search field is focused, Tab moves to a result, Enter files it, Escape closes.
  - An injected 500 shows "Could not add … Nothing was changed", and the DB was confirmed unchanged.

## Codex review of ee451922: fixed

- **A lost save response** is no longer reported from what was sent.
  - Every link, move and removal goes through `setGoalLink`. If a write doesn't come back with its row, the row is read again, and `linkOutcome` decides from the database:
    - committed → "Added";
    - unchanged → "Nothing was changed";
    - changed by someone else → a conflict;
    - read-back also failed → "Couldn't confirm", which claims neither success nor failure.
  - The local row always ends on the database value.
  - Proved on the local stack (`a4.mjs`): the PATCH was allowed to commit and its response was dropped; the dialog said "Added" and the DB held the link.
- **Concurrent relink.** The write is a compare-and-set, `… where goal_task_id = <the goal it was shown under>` (or `is null`). In `a4.mjs`, while "Move it to …" was open, Sam moved "Look up swim lessons" to his own goal. Alex's move said "Not changed … it is now under 'GEA Plan winter break'", and the DB kept Sam's change. "Remove from goal" is conditional the same way.

## Codex follow-up review of 6c942547: fixed

- **A relationship-only broadcast.** `setGoalLink` announces `{ kind: 'goalLink', id, goalTaskId }`, which every instance applies to its current row, rather than a whole pre-request snapshot.
  - Hook test: a notes edit made in another instance while the link request is held keeps its new notes in both instances.
  - Mutation check: putting the old snapshot broadcast back fails this test.
- **A recovery gate.** When both the write and the read-back fail, the task goes into a module-scope `unverifiedGoalLinks`, which every mounted instance honours. No further link write for that task starts until a fresh read succeeds.
  - The retry recovers first. If the row turns out to be under a different goal than expected, the result is a conflict, not an overwrite.
  - Hook tests cover: a gated retry with reads still failing (nothing written), recovery then conflict, and the gate shared across instances.
  - Local DB (`a4.mjs` step 4): after an unknown result, the retry read the row back and then added it.
- **The dialog can't get stuck.** `onLink` is wrapped in try/catch/finally; a throwing callback reports "Couldn't confirm" and releases the busy state (test).
- **Hook tests** (`useSupabaseTasks.goalLink.test.ts`, fake DB) cover:
  - the exact conditional query (`eq id`, plus `is goal_task_id null` or `eq goal_task_id <expected>`), with only `goal_task_id` in the payload;
  - lost-response recovery reaching both instances;
  - a competing relink and a stale unlink leaving the other goal in place;
  - a refused write coming back as `failed`.

## Limitations and follow-ups

- Year goals take no existing actions (see above). Offering it would need a real next-action relationship for the `goals` table, which is a product decision plus a migration.
- One goal per action. A second parent would need a join table; that is not proposed here.
- Candidates are open actions only. A finished task is not offered, so nothing is re-filed into a goal's history by accident.
- An action filed from another list shows under the goal with "Not on this list". Its "Choose when" control still works (an explicit choice that adds a commitment). Its other verbs (take into a week, today, drop) are withheld here because they assume this list's commitment.
- The guard migration's file header (`2026-09-27_guard_goal_conversion.sql`) still says "PREPARED — NOT APPLIED"; the triggers are live on production (checked 2026-09-27). That header should be corrected when the migration set is next touched.
