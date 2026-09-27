# Plan from paper: one "What is this?" per line (2026-09-27)

Branch `claude/paper-type-selector`, from main `a0307f2e`. Local only — not pushed, merged or deployed.

## What changed

Every line on the review sheet ("From your page") has ONE control that decides what it is saved as:
**Goal or project · Action / task · Appointment · Activity · Routine**. The separate
"Make it a goal / Goal or project" button, the static Year "Goal" chip and the "Year goal" entry in
When are gone, so a row can no longer read Task and Goal at once.

| Choice | Written as (existing writers, unchanged) | Its own inputs |
|---|---|---|
| Goal or project | Year page: a `goals` row (`addGoal`). Season/Month: `is_goal` on that list (`addTask`, bucket `quarter`/`month`). Week: the month's list (a week holds actions). | "Goal for 2026 / Fall 2026 / October" — a list, never a day |
| Action / task | `tasks.category = 'task'` | When (horizon or a day), time on a day |
| Appointment | `tasks.category = 'event'` | Day (required; any date), time |
| Activity | `tasks.category = 'activity'` | When, time on a day |
| Routine | a `routines` row (`addRoutine`) | Days (required), time |

- **Switching keeps everything else.** Title, note, person, inclusion, link state and phone are untouched. Each type's where-and-when (day, time, days, list) is kept on the row while you try another type, and comes back when you return. Only the selected type's fields are saved (`normalizeForSave`). A goal never saves a day, time or pattern.
- **Validation before Add.** A routine needs days; an appointment needs a day. Add is disabled with a message naming what is missing.
- **Linked lines.** A line linked to an existing item shows "Linked", has no type or When, and saves nothing (it never edits the existing record). Unlink returns its own type and details.
- **Summary.** "Ready to add" counts each selected type ("2 goals or projects / 3 actions / 1 appointment …"), with linked lines counted separately as "already on your plan".
- **Adding to a plan draft.** A goal joins a draft only when it is for that draft's own list (the Year draft takes year goals; Month and Season drafts take their own list's goals; Week drafts take none). Anything else is saved directly on its own list. Before this change, a month goal added to a Year draft became a year goal.
- **Defaults** are unchanged, and still come from `parse-page` (deployed v10). On Year/Season/Month pages, outcomes and multi-step projects start as goals, while dated, repeating and single actions keep their evidence. Week and Today start as actions (`validatePlanItems` turns a week "goal" into Someday).
- No schema or migration changes.

## Coverage matrix

| Entry point | Altitudes | Device | Review UI | Status |
|---|---|---|---|---|
| Add → "Plan from paper" (`QuickCapture`, phone Add sheet and desktop ⌘K) → `PageFromPaperFlow` | Year / Season / Month / Week (picked in `CameraCaptureModal`); Today = Week page | desktop + phone | `PageReviewSheet` | Covered |
| Sidebar / top nav "Plan from paper" (`Sidebar`, `DesktopNavigation`) → same flow | all | desktop | `PageReviewSheet` | Covered |
| `/guide` (`PlanningGuide`), `?plan=paper` / `?plan=sample` (first week) | all | both | `PageReviewSheet` | Covered |
| Inbox → pending Supernote / uploaded pages → Review (`SupernotePagesSection`) | from the page | both | `PageReviewSheet` | Covered |
| "Add to the plan I'm writing" (`mergePaperIntoDraft` → `PlanSession`) | Year / Season / Month / Week drafts | both | `PageReviewSheet`, then the draft's goal/task lists (review decisions only, no type control) | Covered; goal routing fixed |
| Phone hand-off `/paper/phone/:id` (`PhonePaperPage`) | — | phone | none (upload only; review happens on the desktop) | N/A |
| **Plan from paper rebuild — `PaperPlanFlow` (draft PR #61, `claude/plan-from-paper`)** | Year / Season / Month / Week | both | its own kind selector: Goal / Task / Routine idea / Note | **Not on main; owned by the paper-import session.** It diverges: no Appointment or Activity, and "Routine idea". Align it with `PAPER_ITEM_TYPES` / `withItemType` before it merges. |

Checked and not in scope (not import classification):

- Quick-add preview (`TaskKindBadge`, read-only).
- `EmailReviewSheet` (no type control).
- Task-details "Make it a goal" (`MakeGoalControl`), and Break into next actions on plan rows. These convert saved tasks.
- Inbox `TriageRow` Goal badge (read-only).

## Adjacent gaps (documented, not built)

- There is no general "change what this is" for items already saved (task ⇄ event ⇄ routine). The out-of-scope list above covers the existing goal conversions.
- `ExistingTask` carries no type. A linked line therefore shows "Linked", not the existing item's own type.
- At 390px, the review sheet's time input (fixed 104px) clips "PM". This predates this change and is also visible on main.
- A day-fact row on a date still shows an (unused) time input. This also predates this change.

## Verification (local, isolated fixtures; no real-account writes)

- `npx vitest run`: 7,424 passed. The one failing file is `connectors/src/whatsapp/adapter.test.ts`, whose dependency (`@whiskeysockets/baileys`) is not installed; the same happens on main.
- New tests:
  - all 20 type-to-type switches and back;
  - Year, Season, Month and Week defaults and goal placement;
  - appointment and routine validation;
  - linked rows;
  - summary counts;
  - draft routing;
  - an end-to-end commit for each of the five choices through `useCommitPage`'s writers.
- `tsc -p tsconfig.app.json` and eslint are clean.
- Visual checks on a local fixture page (made-up rows, no auth, no database):
  - desktop Season, Year and Week;
  - a 390px phone view (Month) with no horizontal scroll;
  - keyboard: Tab from the checkbox reaches "What is this?", and typing "G" makes it a goal, which shows "Goal for September";
  - the save payload for the Year fixture carried only each type's own fields.
