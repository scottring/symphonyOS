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

---

## Correction: existing imported lists (after #71 shipped)

Scott, on the deployed Fall page: "this isn't really what we discussed, is
it?" The page showed 0 goals and 21 tasks: an empty Season goals box above a
Single actions list full of broad outcomes ("Plan winter vacation",
"Nourish a love of reading"). Each row also repeated Break into next actions,
Choose when and Into a month. #71 fixed only what new items default to.
Existing imported plans kept their flat shape, and #71's acceptance had not
tested a real imported list. This branch continues locally. It is **not
pushed or deployed**, and **no real data was converted**.

### What changes

- **A period with no goals opens on the question, not an empty box.**
  "Fall 2026's list has 18 items and no goals yet. Some are probably outcomes
  or projects — like “Plan winter vacation” — and some are single actions."
  It offers **Choose Fall 2026's goals** and **Not now**, which is remembered
  per period. After Not now, or once goals exist, a quiet **"Any of these
  goals? Choose…"** stays beside Single actions.
- **Choose the goals in one reviewed step** (`SortPlanPanel`, rules in
  `lib/planning/sortPlan.ts`). You pick with checkboxes, with "Tick all N"
  and Clear. Nothing is pre-ticked. Each row shows its area, people, notes
  and links, so you can decide.
  - Rows that cannot become goals are listed with the reason: a dated
    action, work already planned into a narrower period, a step under a
    goal, or a subtask.
  - A **preview** says what changes and what doesn't: "The same items, not
    copies: their notes, links, people, area and history stay exactly as
    they are. Nothing is scheduled or unscheduled." It names untagged items
    ("stays private to its owner") and says how many stay single actions.
  - **Confirm** flips `is_goal` on exactly those rows and nothing else.
    It is not gated, so twenty rows don't raise twenty area questions.
  - A row that fails to save is named, and you retry just that row.
- **Recovery.** "N of these goals came from sorting Fall's list · **Undo the
  sort** · Keep" stays on the page after the toast has gone. Undo puts
  back every row that hasn't gained next actions since. A row that has
  stays a goal, and the toast explains why.
- **Less repetition.** While the whole-list sort is on offer, the per-row
  "Break into next actions" link is not shown. It remains in task details,
  and a single candidate still gets it. A goal's "+ Add a month goal for it"
  and "+ Add a next action" now share one line. Choose when and Into a month
  stay on season rows, as an earlier requirement asked.
- Nothing else about the model changed. Parents stay visible, dated actions
  stay where they are, and the direct paths (single actions, urgent Today)
  still work.

### Evidence

**Automated.**
- Full suite: 7311 passed, 3 skipped. The only failure is the same WhatsApp connector test, which can't find a package that isn't installed here.
- tsc, build and lint are clean (0 errors).
- New tests:
  - `sortPlan.test.ts`: which rows are eligible and why others are refused; the preview; Undo keeping a goal that now holds actions.
  - PeriodPlanPage › "choosing goals from an imported, flat season list": the prompt replaces the empty box and the row link steps aside; pick → preview (focus lands on the preview heading) → confirm writes `{ isGoal: true }` on the chosen ids only; partial failure and retry; Undo after a remount; "Not now" is remembered and the quiet entry is kept.

**Local browser (isolated).**
- Local Supabase built from the real schema, as above.
- New fictional "Morgan household": Casey (owner) and Jordan (partner login).
- Fixture `outputs/horizon-flows/fixture-fall-tasks.mjs`, written as the users through RLS:
  - 22 Fall items with no goals, mixing broad outcomes and true actions across Family, Personal, Work and untagged.
  - Notes and a link, two items with assignees, one assigned only to Jordan.
  - A dated action (Book flu shots, Oct 3), one already placed in October, one finished.
  - Two of Jordan's private items.

Screenshots are in `outputs/horizon-flows/shots/`:
- **Before:** `k1-fall-before-desk` and `k1-fall-before-phone` show the prompt in place of the empty box. Casey's list reads 18: the assignee-only item, the dated, placed and finished ones, and Jordan's private items are not on her list, as before.
- **Sort:** `k2-sort-pick` → `k3-sort-preview` → confirm. 9 goals were chosen, with 9 single actions left. The keyboard path: Enter on the prompt moves focus to the panel heading; Tab, Tab reaches the first checkbox and Space ticks it; Enter on Preview moves focus to the preview heading.
- **After:** `k4-fall-after-desk` and `k8-fall-final-desk` show "9 goals · 9 tasks". The goals come first, with notes and people, each with "+ Add a month goal for it · + Add a next action". Single actions come second.
- **Database after:** the same 9 ids with `is_goal = true`. Area, scope, people, notes, links, season stamp and `season:open` record are unchanged. The dated and October-placed items are untouched.
- **Undo** on the real UI took the goals from 9 to 0, and the prompt returned. Re-sorting brought them back to 9.
- **Route down:** "Get the house ready for winter" → "+ Add a month goal for it" gave "Winterize the yard" in October, and the season goal now reads "Supported by October · Winterize the yard". On October, "Drain the outdoor taps" was added with the week of Oct 4–10. The week list shows it under "Winterize the yard". "Buy snow tires" was filed under the season goal with Link to goal.
- **Phone (390px):** `k9-*` shows the sorted season, the Single actions list and the sort panel, with no horizontal overflow.

**Live database.**
- One read-only aggregate showed Scott's real account has 35 season items, all tasks and none goals.
- Reading their titles was refused by the permission check, so the fixture is fictional and modelled on the screenshot.
- Nothing was written.

### Limitations

- **The Undo banner remembers the batch in this browser only** (per period). On another device the sort cannot be undone in one step. Each goal can still be turned back through the row's Make it a task or task details, one at a time.
- **An item assigned only to someone else is not on your list**, so it is not offered for sorting. This is the existing "my plan" lens. That person sorts it, or it can be converted from task details.
- **Nothing is pre-ticked.** A "looks like an outcome" suggestion was considered and left out: guessing from titles would mislabel real items. "Tick all N" followed by unticking the actions is the fast path.
- **Scott's actual data has not been converted.** When approved, he runs the sort himself on his real Fall page and reviews the preview before anything changes.

### Importer defaults: for the paper-import owner

The paper-import session owns `PageReviewSheet` and the parser (branch
`claude/plan-from-paper`, 3 commits ahead, last touched 2026-09-25). It was
not running, so nothing was changed there. What causes the flat list:
`paperIntoDraft` makes a line a goal only when the parser marks it
(`item.goal` or `placement.kind === 'goal'`), so season and month pages
import as tasks.

The proposed default, to be built by that owner:
1. On a **year, season or month** page, the review sheet asks the same
   question this page asks: "Which of these are outcomes or projects?" Nothing
   is pre-ticked unless the parser marks a line as a goal, and "Tick all" is
   available.
2. Lines with a date or a time stay actions.
3. On a **week or day** page, lines stay actions, as now.
4. The mark is shown before import, never applied silently, and it stays
   editable on the plan page afterwards through the sort above.
