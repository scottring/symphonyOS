# Horizon flows: outcomes above, actions below — as the default

Branch `claude/horizon-flows`, based on `origin/main` 07f59ed5. Local only:
not pushed, merged or deployed. No schema change, no migration, and the
transactional-save flag (`VITE_PLACEMENT_RPC`) is untouched.

Brief: `outputs/horizon-flow-implementation-brief.md` (main worktree).
Builds on nested horizons (#66) and next-action area (#67) rather than
repeating them.

## The change in one line

Year, Season and Month now open on **goals and projects**; Week and Today
hold the **concrete actions**. #66 changed words and added paths; this
changes the defaults.

## Behaviour changes

| Where | Before | Now |
|---|---|---|
| Year / Season / Month page | The goal box opened only when the list was empty or after "+ Add a goal"; the always-open box was **"Add a task for …"**. | The goal box is always open and first ("A goal or project for October", "An outcome for 2026"), with a primary **Add goal**. The task list is renamed **Single actions**, and its box sits behind **+ Add a single action**. It is secondary but one press away. |
| New month or season goal | Linked to the goal above only afterwards, through the row control. | An optional **"Supports a season/year goal?"** picker in the goal box. It writes the existing links (`supportsGoalTaskId`, plus the season goal's `goalId`; `goalId` for a season goal), and the new goal inherits the parent's area when no single area is in view. If you pick nothing, a level is skipped. |
| Year goal / season goal rows | No path to a smaller outcome. | **+ Add a season goal for it** / **+ Add a month goal for it**, with a period picker. It creates the child goal on its own period, linked up, in the parent's area. The toast names where it went and offers **Open season/month**. The parent is not written. |
| New month goal | — | Opens with the cursor in its next-action box. |
| Month goal's next-action box | Title only; the week had to be planned afterwards. | An optional **week picker** in the box: "No week yet" or one of the month's weeks. The action is created under the goal and then planned into that week with the same write "Plan ▾" makes (the month commitment stays). The toast reads "Planned “Choose chairs” for September 20–26. Its goal stays on this month." and offers **Open week**. |
| Choosing a day (Month's timing menu, Week's timing menu, "Do it today") | Silent. | A toast: "Planned … for Wed, Sep 30 — any time that day." with **Open day / Open Today**. No time is implied. |
| Month / Season planning session | Goals and tasks were given equal weight. | Goals first, with a primary Add goal. "Single actions and next actions" is marked optional, and its box sits behind a press. |
| Week planning session | You could not write a next action toward a month goal. The month's steps were listed flat. | **"Toward a goal for October?"** writes the new week task as that goal's next action (`goal_task_id`, in the goal's area). The side panel lists each month goal's own next actions under it, each with + Add to the week. |
| Week page add box | Plain title. | An optional **"Toward a goal for October?"** that does the same from the Week page. |
| Session summary | "toward …" was missing for an existing goal. | Names the goal, whether it is new, already on the period, or the month's (week). |
| Status line | "1 goals" | "1 goal" |

**Bug found in acceptance and fixed** (`2d0c571b`). A tick flipped
`completed` but left the local commitment records, and the copy broadcast to
the page's other task-hook instances, at their pre-tick status, while the
database trigger marked them done or reopened them. The failing sequence was
complete, then reload, then reopen, then move to another week. The old week
stayed **open**, and the action showed on **both** weeks' lists. It was
reproduced in the browser, then verified fixed there, with a regression test
(`commitmentsAfterCompletion`).

Read-only check: the shared database has **0** tasks with more than one open
week record, so it has no data to repair.

Unchanged by design:
- The goal never completes itself: all of its actions done still leaves it Active.
- One row per action.
- Moving changes timing only.
- Area/privacy, assignment, flexible weekends, per-day density, long-list filter and keyboard behaviour.

## Evidence

### Automated

- `npx vitest run`: 7302 passed, 3 skipped.
- The one failing file is `connectors/src/whatsapp/adapter.test.ts`. It cannot resolve `@whiskeysockets/baileys`, which is not installed in this worktree. This is environmental and unrelated.
- tsc (`-p tsconfig.app.json`) and `npm run build` are clean. Lint shows 0 errors (warnings pre-existing).
- New tests:
  - `PeriodPlanPage.test.tsx` › "horizon flows": 8 tests. They cover the goal box with its parent, skipping a level, next action + week in one go, year→season and season→month refine, a goal staying open when all its actions are done, and the day toast.
  - `PlanSession.test.tsx`: a week next action toward a month goal, with steps under the goal.
  - `WeekList.test.tsx`: the goal picker.
  - `intentions.test.ts`: the tick mirrors the trigger, and a later move closes the old week.
  - Existing tests were updated only where the default changed (the task box is now behind a press; "Single actions"; label grammar).

### Local browser — isolated (headless Chromium, real app build)

Setup:
- A throwaway local Supabase (`127.0.0.1:55321`) built from a **schema-only** dump of the shared project. No data was copied; RLS policies, triggers and functions are the real ones.
- The branch was built against it and served on `:5211`.
- Fictional accounts: `alex@horizon.test` and `sam@horizon.test` (password `horizon-local-1`) in the "Rivera household".
- Scripts and 40+ screenshots are in `outputs/horizon-flows/` (`j1…j26.mjs`, `shots/`). Nothing touched the shared database or the demo account.

Walked, with DB rows read after each step:
1. Year: "Make our home work better for our family" (Family). → Season goal "Create a usable outdoor space" (Fall, `goalId` → year). → Month goal "Finish the patio" (September, supports the season goal, inherits the year goal). The skipped level: "Clear out the garage", with no parent. All rows were `family`/`compound`.
2. Under the patio goal:
   - "Choose chairs" was planned into Sep 20–26 as it was written.
   - "Order lights" went into Sep 27–Oct 3.
   - "Clear the patio" got no week.
   - The goal stayed on the month with its three actions under it.
3. Context on Choose chairs (notes, a link, a location) was written as Alex through RLS, and Sam was assigned through the row picker.
4. Week: Choose chairs showed under "Any day" with its goal line. The timing menu → Sat Sep 26 (today) gave a toast with Open Today. Today showed it with its goal, assignee, location, notes and link; no time was needed.
5. Optional time: Details → Schedule → 14:00 was stored on the same row.
6. Complete on Week: the goal stayed Active. All three actions done: the goal was still Active. Reopen worked.
7. Move to Sep 27–Oct 3 (week only), then Wed Sep 30, then "Remove Wed, Sep 30". The action kept its week and month. The same id `d9f60b9e` was preserved throughout, with notes, assignee, parent and area. This held after reload.
8. Review: the October session's look-back → "Keep, and add a next action" on the patio goal → Save. The **same** goal row is now October's open record, and September's record reads `carried → 10-01` (September's page says "carried to October"). The support link, the new next action (Family, under the goal) and history were kept, with no duplicate rows.
9. The week session for Oct 4–10 wrote "Measure the patio for a rug" toward the goal. The week add box wrote "Price patio heaters" toward it. Both are Family and under the goal.
10. The direct paths still work: an urgent "Call the plumber" added on Today went straight to Today, and "+ Add a single action" on the month works.
11. **Sam** (the second login) sees the Family chain on Year and Month, but not Alex's untagged private single action.
12. At 390px there is no horizontal overflow on Year, Season, Month, Week or Today. The next-action box's week picker wrapped off-screen before `560de9ae` and now wraps under it.
13. Keyboard: from the goal box, Tab reaches the parent picker, then the next row, with a 2px focus outline in view. "+ Add a goal" focuses the box. Enter adds.

### Live (shared) database

Read-only queries only:
- The extension list (to build the local copy).
- The duplicate-open-week count above (0).
- The schema dump.

No rows were written.

## Limitations and open items

- **The Week list is "my week".** An action assigned only to someone else (Choose chairs → Sam) is not on Alex's week list. It is still on the Month under its goal and on Today. This is existing, deliberate behaviour (assignment ≠ planning), but it surprised me mid-walk and is worth a look.
- **Keeping a goal does not carry its actions that already have a week.** They stay on their September week, and the session says "Left open in September" (existing rule).
- **The Season page's next-action box has no week picker.** Season actions go into a month first ("Into a month…"), as before.
- **The local copy ran without realtime, edge functions or a calendar.** Two-account privacy was checked on the local copy of the real policies, not on the shared project.
- **Importer defaults were not changed.** The paper-import session owns `PageReviewSheet`, and the model here should be applied there by that owner.
- Pre-existing, not addressed: the Details "Pick date & time…" doesn't prefill the item's current day.
- Nothing is pushed or deployed. Deployment needs Scott's approval.

## Reviewing it locally

- **Isolated local stack:** `supabase start` in the scratch project, then the `:5211` preview. The scratch project lives in the session scratchpad, so it will not persist. To rebuild it, run `supabase db dump --linked --schema public` and prepend `vector`, `pg_trgm`, `pg_net` and `pg_cron`.
- **Against your own data instead:** `npm run dev` in `.worktrees/horizon-flows`, signed in to the demo account. Note that this writes to the shared database.
