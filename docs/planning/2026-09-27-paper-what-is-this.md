# Plan from paper: one "What is this?" per line (2026-09-27)

> **Superseded above the week (2026-10-08, branch `claude/ff-paper-next`).** On Month, Season and
> Year pages there is no goal/task choice any more (planning model: lists above the week are for
> looking). Every line starts as a plain item on the page's list (a year's list is its `goals` rows);
> the row's one choice is **Where it goes** (the page's list first, This week, a day, Someday, Inbox),
> and an optional, secondary **Kind** (List item · Appointment · Activity · Routine). A line moved off
> the list says what that means ("A step on Tue, Oct 14."). A month or season "goal" from the reader
> is saved as a plain line (`is_goal` false); an undated appointment or a routine with no days starts
> as a plain line so nothing blocks the save. The Week page keeps the five-way control below. After a
> save, a panel stays on the page (`PaperImportNext`) naming the period and count, with
> "Continue planning" and "Done for now".

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
- **Defaults: this branch does NOT change them, and does not by itself fix the original September classification.** The parser (`parse-page` v10, deployed with #73) is untouched. Evidence is split in two:
  - *Deterministic, tested* (`PageReviewSheet.defaults.test.tsx`): given the model's answer, the real `parsePageResponse` → `validatePageResult` path carries it to the sheet unchanged. On a representative month or season page, "Plan Mia's birthday party" and "Finish the patio" (`day: "goal"`) start as **Goal or project**. "Renew the passports" (`month`) starts as **Action**, a dated dentist line as **Appointment**, and a Tue/Thu line as **Routine**. A year page's goals are year goals. Week and Today start as actions, even for a line the model called a goal (it goes to Someday).
  - *Model-dependent, NOT verified here:* whether the model answers `goal` for a real handwritten project line and `month` for a single action. That depends on the image and the model. The tests only assert that the v10 instructions ask for it ("goal for an OUTCOME or PROJECT … whether or not the page labels it a goal"; "Never make a line a goal just because it is on a month page"). The September page has not been re-parsed by this branch. Check it by re-importing it after deploy. What this branch guarantees is that a wrong guess is one control to fix.
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
- At 320px, a long title ("Dentist appointment for Mia") is cut off at the row's edge. It is an editable input, so the text is all still there. This predates this change.
- Fixed on this branch: the time input sizes to its content, so "02:00 PM" is fully readable at 390px and 320px, with no sideways scroll. Day-fact rows (saved as notes) no longer show a time input.

## Verification (local, isolated fixtures; no real-account writes)

- `npx vitest run`: 7,440 passed. The one failing file is `connectors/src/whatsapp/adapter.test.ts`, whose dependency (`@whiskeysockets/baileys`) is not installed; the same happens on main.
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
  - 390px and 320px side by side (Month): times read "02:00 PM" / "04:30 PM"; page scrollWidth equals viewport (390/320); no time input on the "No school" day-fact;
  - a 390px phone view (Month) with no horizontal scroll;
  - keyboard: Tab from the checkbox reaches "What is this?", and typing "G" makes it a goal, which shows "Goal for September";
  - the save payload for the Year fixture carried only each type's own fields.
