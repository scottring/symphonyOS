# Horizon flows: release handoff (for Codex review)

**The branch to review is `claude/horizon-release`**, in worktree `.worktrees/horizon-release`.
- Head: this document's commit, on top of `39049dab`.
- Base: `main` 3b3981d6, 13 commits ahead.
- It **contains** `claude/horizon-everyday` (all its commits) and the Plan-from-paper owner's `fdcb6126` and `1272ccee`, cherry-picked with their authorship.
- **Nothing is pushed, merged or deployed.** No shared migration is applied. No real or demo plan was written.

Contract: `outputs/horizon-flow-product-contract-2026-09-27.md`. The earlier
reports are `2026-09-27-everyday-horizons.md` (the contract map, which is
still accurate for everyday pages) and `2026-09-26-horizon-flows.md`.

## Diff scope (`git diff --stat main..claude/horizon-release`: 59 files, +2362 −169)

| Area | Files |
|---|---|
| Everyday pages | `PeriodPlanPage.tsx`, `PlanRow.tsx`, `RefineGoalControl.tsx`, `SortPlanPanel.tsx`, `WeekList.tsx`, `lib/planning/{goalConversion,sortPlan}.ts` and their tests |
| Importer | `supabase/functions/parse-page/lib/parse.ts` (season and month guidance) and its test; `useCommitPage.ts` (Link reuses the existing task); `PageReviewSheet.tsx` (wording); from the owner: `ItemTypeControls.tsx`, `paperItemType.ts`, `paperAssignee.ts`, `PageFromPaperFlow.tsx`, `SupernotePagesSection.tsx`, `applySession.ts`, `paperIntoDraft.ts`, `planParse.ts`, `session.ts`, `useFamilyMembers.ts`, `WeekPlanHost.tsx` and tests |
| Database (prepared, not applied) | `supabase/migrations/2026-09-27_guard_goal_conversion.sql`, `supabase/migrations/rollback/…down.sql`, `supabase/tests/101_guard_goal_conversion.test.sql`, `supabase/tests/guard_goal_conversion.concurrency.mjs` |
| Docs and acceptance scripts | `docs/planning/2026-09-27-*`, `outputs/horizon-everyday/*.mjs`, `outputs/horizon-release/*.mjs` |

## 1. Paper import: integrated, with one dependency still open

- **Owner status.** The Plan-from-paper session (PR #61, draft, author scottring) is idle: last commit 2026-09-25, not running. Its worktree is untouched, including the dirty `src/__fixtures__/` and `fixture-types.html`. My handoff on PR #61 is https://github.com/scottring/symphonyOS/pull/61#issuecomment-5853984048.
- **Integration.** Its two review-sheet commits are cherry-picked here: the type selector `fdcb6126`, and "one you" plus a real Unassigned, `1272ccee`.
  - One conflict was resolved: `applySession` keeps area inheritance and the owner's assignee pass-through.
  - `PaperPlanFlow.tsx` (PR #61's rebuild, not on main) was left out.
  - PR #61's rebuild and its edge function `plan-from-paper` are **not** in this branch.
- **Default change (`parse-page`).** On season and month pages, the parser now proposes an outcome or project as `goal` whether or not the page labels it one. It keeps single actions as season or month tasks, dated lines dated and repeating lines as routines, and it is told never to make a line a goal because of the page. Week pages are unchanged; year pages already defaulted to goals.
- **Review before writes** (existing and the owner's work, unchanged apart from wording):
  - Each line has include/exclude, an editable type, a destination ("When"), a goal toggle ("Goal or project" / "Make it a goal") and an assignee.
  - A likely duplicate offers Link or Keep separate, and Cancel writes nothing.
- **Fixed during acceptance.** "Link" on a likely duplicate used to insert a second row pointing at the first. The same errand then appeared on the plan twice, which is pre-existing behaviour from 2026-09-06. Now a linked line **is** the existing task: nothing is inserted, and the existing row is untouched.
- **Blocker for full effect.** The prompt change reaches users only after `parse-page` is **redeployed**, which needs its own approval. No Anthropic key is available locally, so **the model's classification was not run**. What *was* verified is the unit test of the prompt, and the whole review → save → horizon-page path live with a recorded parser answer (below).

## 2. Database guard: release artifact

- **The files:** migration `2026-09-27_guard_goal_conversion.sql` (v2), a rollback that drops only what it adds, `101_guard_goal_conversion.test.sql`, and the two-connection RLS harness.
- **What it enforces:** no goal link (`supports_goal_task_id`, `goal_task_id`) is left pointing at a non-goal.
  - The link path locks the parent `FOR SHARE` and re-reads it.
  - Conversion checks for children only after taking its own row lock.
  - Both functions are security definer, and refusals name nothing.
  - New rule: a next action can only be filed under a goal when the link is set.
- **Existing data:** a read-only count on the shared project found **0** rows that break the invariant, and 0 goal links at all. The guard validates only *changes*, so nothing needs repair.
- **Compatibility:**
  - Paths still allowed: create (addTask, addStep, week add toward a goal, session next actions), edit, move (week, day, month), undo, keep-forward and delete (the foreign keys' SET NULL). Verified by `101` section 5 and by the harness's "ordinary" cases.
  - Operations it now refuses: exactly the ones the app refuses (`goalToTaskConversion`), plus filing under a non-goal, which the app never does.
  - Nothing else writes these columns: no edge function, and not the iOS app (searched).
- **Privacy:** refusal messages are generic. A caller who already knows a hidden row's uuid could learn whether it is a goal from which message comes back. Treated as acceptable, because uuids aren't guessable and the foreign key already confirms existence.
- **Release order:**
  1. Deploy the app. It already refuses these conversions, so it is safe on its own.
  2. Apply the migration with the Management API, **on approval**.
  3. Run `101` plus `095` against the shared database. Both run inside a transaction and roll back.
  4. **Rollback:** the down file. Data is unaffected either way.

## 3. Reconciled: everyday-horizons items

| Item | Status |
|---|---|
| Year rows open and close; refine and link inside | Done (earlier on this branch) |
| Week shows only goals it serves, capped at 3 (2 on a phone), with the month behind a disclosure | Done |
| Make it a single action: no false success; no stranded links | Done (app rule plus prepared guard) |
| **Partial sort failure, verified live** | Done. A real save request was dropped in the browser: the panel said "1 didn't save — nothing else about it changed", the database had 2 of 3 converted, "Try the 1 again" converted the third, the panel closed, 22 rows remained, and every other field hashed identical (`i7.mjs`). |
| Undo of a whole sort works only in the browser that sorted | **Intentional limitation.** The durable fallback is per goal: Make it a single action. |
| An item assigned only to someone else isn't offered for sorting | **Intentional.** It is the existing "my plan" lens. |
| A saved area lens hides an urgent item on Today until "All" is chosen | **Existing behaviour.** Verified to be a filter, not a loss (`i8.mjs`). |
| After the weekly review, a kept dated action shows under "Scheduled outside this week" with its old date | **Existing carry-forward behaviour.** It is visible and the row is the same; left as is. |
| The Week page's "No calendar connected" banner is cramped on a phone | **Pre-existing, out of scope.** |
| Changing an item's type by keyboard in the review sheet | Native select. Headless Chromium can't drive the OS menu with arrow keys, so it was set through the select in testing. Tab and focus reach it, but it was not proven with the keyboard in the harness. |

## 4. Integrated acceptance (isolated local database, real app)

**Setup:**
- Local Supabase `127.0.0.1:55321` (schema copied from the shared project, no data), serving this branch's build on `:5211`.
- Fictional household **Nova**: `sky@horizon.test` (owner) and `rowan@horizon.test` (second login), password `horizon-local-1`.
- Scripts `outputs/horizon-release/i1.mjs`–`i8.mjs`; screenshots in `outputs/horizon-release/shots/`.
- **Two network calls were intercepted, and only these:** the photo upload to Storage (not running locally) and the `parse-page` model call (no key). Its answer is a recorded fixture shaped as the new guidance produces. Everything else — review sheet, save, RLS and pages — is real.

**Journey:**
1. **Manual creation:**
   - Year goal "Make home life calmer" (Family), added via the keyboard with "+ Add a goal or project".
   - Existing Fall single action "Renew the passports".
2. **Paper import (Fall page)**, via + Add → Plan from paper → Season → choose a file (a generated JPEG):
   - **Review** (`i01`/`i02`): three outcomes arrive as "Goal or project", and every line shows its type, "This season" or its date, and an assignee.
   - Cancel wrote nothing.
   - Then: Link the duplicate passports line, change "Pick apples" to Activity, untick "Clean out the gutters", assign "Nourish a love of reading" to Rowan, and save.
   - **Database after save:** 3 season goals; single actions; Activity kept; Flu shots dated Oct 3 at 10:00; Swim lessons as a routine; **passports still one row**; everything Family; Rowan's assignment kept.
3. **Season** (`i10`, `i32`): leads with the 3 goals, with no repair notice.
   - Optional link: "Get the house ready for winter" → year goal. "Plan winter vacation" was deliberately left unlinked.
   - Refined: vacation → October goal "Book the beach house".
4. **Month** (`i11`, `i33`):
   - Next action "Compare three rentals" planned into Sep 27–Oct 3 as it was written.
   - "Ask Grandma about dates" left with no week.
5. **Week** (`i12`): "This week serves: Book the beach house (1)". The action moved to Sunday (today) with no time, keeping its week.
6. **Today** (`i13`/`i14`, `i35`): a note and a link were added in the details panel itself and saved to the row. Urgent: "Call the plumber" added straight on Today; it is private.
7. **Complete, reopen, reload:**
   - Completing on Today left "Book the beach house" and "Plan winter vacation" open.
   - Reopening from the Week list, then reloading, gave the **same id** `f69d7834…` with week 09-27 and day 09-27.
8. **Review** (`i15`/`i16`): the Oct 4 week session's look-back → Keep → Save. The result is **one row**, with records `week 09-27 carried→10-04`, `week 10-04 open` and `month 10-01 open`.
9. **Sharing:** Rowan sees the three Fall goals and his assignment, but **not** Sky's private urgent call.
10. **390px** (`i21`–`i25`): Year, Season, Month, Week and Today have no horizontal overflow. From the keyboard on Month: "2 open · hide" (focus kept) → Assign → Move → the first next action, each with a 2px outline, in view.

The five horizon screenshots in the same example are `i31-year`, `i32-season`, `i33-month`, `i34-week` and `i35-today` (desktop) and `i21`–`i25` (phone).

## 5. Reproducible commands and results (on `claude/horizon-release`)

**App and unit tests:**
- `npx tsc --noEmit -p tsconfig.app.json`: clean.
- `npx vitest run`: 7392 passed, 3 skipped, and 1 file failed. That file is `connectors/src/whatsapp/adapter.test.ts`, which cannot resolve `@whiskeysockets/baileys` (not installed in these worktrees). It is unrelated to this change and pre-existing in this environment.
- `npm run lint`: 0 errors (368 pre-existing warnings).
- `npm run build`: clean.

**Database guard, isolated local copy only:**
- `psql <local> -f supabase/tests/101_guard_goal_conversion.test.sql`: all assertions pass. It fails at assertion 1 after the rollback file is applied, and passes again after re-applying the migration.
- `095_goal_supports_goal.test.sql`, in a rolled-back wrapper that seeds its fixed fictional ids: 12/12 pass.
- `PG_MODULE=<pg> node supabase/tests/guard_goal_conversion.concurrency.mjs`: **19/19** on v2, versus 10/19 on v1.

**Browser journeys:** `node outputs/horizon-release/i1.mjs … i8.mjs` against the local stack.

## Evidence: observed versus mocked

- **Observed against a real database** (the local copy of the shared schema, RLS on, fictional accounts):
  - Everything in section 4, except the two intercepted calls.
  - The partial sort failure: a real dropped request.
  - The guard's races and hidden-row cases (two real connections).
- **Mocked:**
  - The `parse-page` model answer and the Storage upload in section 4.
  - Vitest component and integration tests, which mock Supabase.
- **Production:** nothing on this branch was checked in or released to production.

## Open items and blockers

1. **Needs approval: redeploy `parse-page`** so the new import defaults reach users. Before relying on it, check it once with a real photographed season page.
2. **Needs approval: apply the guard migration** to the shared project (release order in section 2).
3. **Needs approval: push, PR, CI, merge and deploy** of `claude/horizon-release`.
4. **PR #61** (the plan-from-paper rebuild) remains its owner's.
   - Its two review-sheet commits are now in this branch, so when that PR is revived it should rebase onto this, or drop those two commits.
   - The owner's dirty worktree was left untouched.
5. The remaining limitations are listed in section 3: whole-sort Undo only in the sorting browser; items assigned only to someone else not offered for sorting; and the lens, carry-forward and banner behaviours.
6. **An outbound call to the shared project was noticed:** the Today weather widget calls its public weather function via a hard-coded URL, even from the local build. It is read-only and carries no user data. It is pre-existing.
