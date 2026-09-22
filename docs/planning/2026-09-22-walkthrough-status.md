# Walkthrough verification status

Updated September 22, 2026, after the resumed live pass. Scope: the agreed horizon, task, routine, review,
family-filter, design, and onboarding journeys. This is not a whole-product audit.
User-confirmed results and agent-observed results are distinguished below.

| Journey | Live result | Evidence / remaining work |
| --- | --- | --- |
| Direct Today task entry | Pass — Scott | Buy groceries saved and appeared |
| Direct Week entry, no day | Pass — Scott | Any day and Today shelf; no automatic Today commitment |
| Month → Week → Today | Pass — Scott | Check furnace filter retained month commitment |
| Task completion across horizons | Pass — Scott | Completed in Today, Week, Month; goal remained open |
| Year → Season reference | Pass — Scott | Separate goal identities and reference visibility |
| Season → Month reference | Pass — Scott | Season goal visible beside existing month goal |
| Task-to-goal linking | Failed discoverability — Scott | No exposed link option in tested flow |
| Today → Tomorrow task move | Pass — Scott | Moves out of Today and into tomorrow |
| Flexible weekend | Pass with design finding — Scott | Flexible Saturday–Sunday; group ordering finding logged |
| Remove Today commitment | Fail — Scott; cause inspected | Focus removed, date retained; no complete reversal action |
| Shelves date follows Today | Pass — Scott after deployed fix | Correct date and occurrence completion |
| Routine occurrence completion | Pass — Scott | Day-specific state; repeating pattern remains |
| Routine occurrence time | Mixed | Untimed path failed for Scott; its shelf menu remains automation-blocked. Timed QA routine retimed successfully through its timeline time control |
| Routine time leaves next day unchanged | Pass — agent, timed routine | Today retimed 8 PM → 9 PM; tomorrow remained 8 PM; rule summary remained 20:00 |
| Skip one routine occurrence | Pass — agent | Today's QA occurrence disappeared; tomorrow remained at 8 PM |
| Routine date navigation while loading | Fail — agent | Tomorrow briefly showed today's 9 PM override before resolving to 8 PM |
| Hide-daily vs routine shelf | Fail — agent | Timeline preference hides eligible routine choices silently |
| Family assignment/filtering | Pass — agent | Edith includes, Liam excludes, All restores; Alex assignment restored |
| Filtered empty-state wording | Fail design — agent | Says week empty rather than no matching person |
| Weekly review entry | Fail discoverability, review exists — agent | Under Plan the week; not a visible previous-week review entry |
| Next-week Earlier shelf | Fail expectation — agent | Empty while review offers current-week work; uses wall-clock current week |
| Review Keep and untouched work | Pass — agent | Kept test task next week; Big test left in original week |
| Review Done | Pass — agent | QA Review Done appeared completed in original week's shelf, absent from new week's list |
| Review Someday | Pass with interruption — agent | QA Review Someday appeared on Someday; Save prompted for its domain partway through |
| Review Drop | Pass — agent | QA Review Drop left week and appeared in Inbox, still an incomplete task |
| Review draft close/reopen | Pass — agent | All three choices retained; prior-week tasks unchanged before Save; next week showed no duplicate kept task |
| Full application reload persistence | Automation limitation | Cmd-R produced no observable reload; native View menu has navigation but no Reload. Navigation/reopen and automated persistence checked; full reload not claimed |
| Month review | Pass with presentation finding — agent | Keep + next action saved QA goal and separate child task in October; Month tasks misleadingly said empty |
| Season review | Pass — agent | QA Season task carried from Fall to Winter; existing goal left open |
| Year review | Pass — agent | QA Year outcome carried into 2027; existing yearly goal left open |
| First-time onboarding design | Assessment drafted | Separate proposal; not implemented or validated with new users |
| Keyboard/narrow-screen walkthrough | Mixed — agent | Enter saved goal/task inputs; Tab moved within daily review; Escape did not dismiss review. Inspected Today + detail, time picker, and daily review at 830px window width; no observed edge overflow in these views. Phone widths not tested |

## Automated pass completed

- 838 tests across 74 files: planning and Today logic, planning-session hooks,
  plan actions, routine editor, daily review.
- 132 tests across six additional files: planning session UI, period page, Week
  review host, commitment persistence, legacy onboarding signals and card.
- Total for this pass: 970 passed across 80 files. Some component tests emit
  React act warnings; no failing tests. These checks do not prove production
  persistence or close the pending live checks above.

## Session recovery

Both native Symphony app installations initially displayed “Your session ended.”
Scott restored sign-in in the development-build app, and live testing resumed.
No credentials were obtained or changed by the agent. The authenticated window
was returned to Today with the daily review closed after testing.

## Completed live sequence

1. Created QA Review Done, QA Review Someday, QA Review Drop in Sep 20–26. Selected
   respective verdicts from the Sep 27–Oct 3 review, closed/reopened the draft,
   confirmed no early mutations, saved, and inspected resulting destinations.
2. Created QA Month outcome in September; kept it with QA Month next action into
   October. Expanded the goal to verify the saved supporting task.
3. Created QA Season task in Fall and kept it into Winter. Created QA Year outcome
   in 2026 and kept it into 2027. Left Scott's original goals untouched.
4. Created QA Routine Timing daily at 8 PM, verified Today schedule, changed only
   today's occurrence to 9 PM via the timeline time control, verified tomorrow at
   8 PM, skipped today, and verified tomorrow still present. Deactivated the QA
   routine afterward to avoid ongoing clutter. Scott's routine was not changed.
5. Inspected the narrower window and keyboard behavior; recorded concrete failures
   and limitations above. The audit pass is complete with failed and limited
   checks explicitly recorded; it is not an all-green release sign-off.

## New product findings

- Month/season goal review offers Keep, Keep + next action, Someday, Drop, but no
  Done action. Year review does offer Done. This conflicts with the agreed review
  choices and needs consistent goal-completion handling.
- Goal rows expose Make it a task. Reconcile this conversion control with the
  agreed separate identities rather than teaching conversion in onboarding.
- Goal linking is not wholly absent: the guided month planner has a Toward a goal
  selector, and a direct Season task exposes Put it under a goal. The original
  finding is a discoverability/consistency issue, not proof no linking exists.
- Supporting actions hidden inside collapsed goal steps are not reflected in the
  apparent Month tasks empty state. Make the presence of this work clear.
- Next-day navigation briefly renders prior-day occurrence time while loading;
  ensure stale occurrences cannot be acted on as though they belong to the new day.
- Review Save can pause for domain classification after other verdicts have
  applied. Surface required decisions before Save and explain partial progress.

## QA records retained

QA Review Done (complete), QA Review Someday (Someday, Family domain), QA Review
Drop (Inbox), QA Month outcome + QA Month next action (October), QA Season task
(Winter), QA Year outcome (2027), and QA Routine Timing (inactive). Plans for
Sep 27–Oct 3, October, Winter, and 2027 were saved. No test or user data deleted.

Cross-account privacy, calendar-provider sync, invitation delivery, and fresh-user
research are outside this single authenticated household walkthrough. Do not
claim those passed based on same-account filters or mocked tests.


## Follow-up fixes — September 22

Implemented after the walkthrough (production verification pending):

- Removing a task from a day clears that day's date and the signed-in user's focus together. Week/month commitments and other users' focus remain. The action also appears for dated tasks without focus, including the previously stranded test task. Undo restores the original date and focus.
- Today and its shelf use date-keyed occurrence loading. They hide stale occurrence state during navigation and ignore late requests; a pending time override is additionally checked against the displayed date.
- Today's routine shelf offers **Set time** for available and already-chosen occurrences. This opens an occurrence-only time picker, without an All Day shortcut or modifying the repeating schedule. It provides a direct route for the originally reported untimed routine flow; this is not a claim that the original routine-editor failure has been reproduced and resolved.

Focused regressions cover day removal through the placement writer, preserved broader commitments and other-user focus, failed writes, request races, and both routine shelf time actions. Build passed; changed-file lint has no errors (existing warnings remain). Fixture inspection at 1440px and 390px showed the picker within the viewport and allowed selecting 8 PM. Authenticated live verification remains separate.

## Closure implementation — September 22

The historical matrix above records the original findings, not the current release state.
The following changes close the implementation gaps; live verification is recorded separately.

| Finding | Implemented behavior / regression evidence |
| --- | --- |
| Complete from week shelf | Direct task checkbox; completion and choosing remain independent |
| Shelves placement and empty states | Launcher inside every horizon's date masthead; empty messages acknowledge filters and link to routine management |
| Primary navigation | Planner, Routines, Inbox; Today is the first horizon alongside Week, Month, Season, Year |
| Weekend ordering | Any day, Weekend, Assigned a day, Completed in a single reading order |
| Hidden routine choices | Hiding daily routines in the schedule no longer removes eligible shelf occurrences |
| Link task to goal | Visible Link to goal on loose and already-assigned tasks; failed links retain picker for retry |
| Goals versus tasks | Removed conversion controls from period rows; goals remain separate from supporting tasks |
| Hidden supporting tasks | Goal rows show supporting-task count; month totals and empty-state text acknowledge them |
| Previous-week review | Visible Review date-range entry beside Plan; same deliberate review flow |
| Next-week Earlier | Offers open work from the preceding period without creating a new commitment |
| Review Done for goals | Month and season now offer Done, consistent with Year |
| Review domain interruption | Required domains selected before Save; Save is disabled until complete |
| Daily review keyboard | Escape closes even from its reflection input, preserving reflection |
| Routine editor save | Repeating schedule is a local draft with explicit awaited Save, error/retry, and scope guidance; Save & close waits for success |
| Legacy first-week checklist | Optional start-with-a-task or start-with-a-goal invitation; dismissal persists and Getting started reopens it from More |
| Closed-sheet overflow | Closed goal/planning sheets do not render outside the page |

Automated regressions cover these branches, including failures/retries. Production live
verification is still required for the new release, especially routine timing and day removal.
Component fixture visual inspection at 1440, 830, and 390 pixels found no horizontal overflow;
the fixture combines components and does not represent a complete phone-app walkthrough.

The onboarding invitation is implemented, but new-user research is not thereby complete.
Cross-account database privacy, external calendar sync and invitation delivery remain separate
integration checks requiring their own real accounts/providers; none are claimed as passed.

### Release verification: 8cf7b2bc

- Production release is Ready on app.symphony-os.com (Vercel deployment
  dpl_HJnxdFdu5Hrm4p6AzYbWKJRZx2aF).
- Required pre-push typecheck and full suite passed: 632 files, 6,571 tests passed,
  3 skipped. Production build passed; changed-file lint has zero errors.
- Quit and reopened the signed-in test app. The new Planner/Routines/Inbox and
  five horizon tabs appeared; Today retained Carry forward test, Test weekly task,
  Read for 10 Minutes, and completed items. Shelves appears in the date header.
- Opened Test weekly task to verify the former day-removal bug. macOS locked
  before the action could be exercised. The user was asked to unlock; remaining
  production mutation checks are pending, not passed.

### Additional navigation closure

The final historical-log audit found the Week → Today date inheritance issue.
Today and Week now have distinct React route identities, so entering Today starts
on the actual current day while browsing within a horizon retains its date.
Explicit date deep links still apply. A route-level regression exercises Week
browsing followed by Today navigation. This is included in the follow-up release.

## Resumed production verification — after unlock

Verified in the authenticated test household on production **ed2efe40**, after using
the new-version Reload button. These results supersede the lock-related pending
checks above. The release passed 6,572 tests across 633 files (3 skipped) and build.

- **Day removal: pass.** Removed Test weekly task from Sep 22 through its inline
  Remove from this day action. It disappeared from Today, remained under Any day
  in Sep 27–Oct 3, and remained absent from Today after quitting/reopening the app.
- **Today navigation: pass.** Entering Today from the future Week returned to
  Tuesday Sep 22, rather than retaining the browsed week's Sunday.
- **Earlier shelf/review entry: pass.** Next Week visibly offers Review the week
  of Sep 20–Sep 26. Earlier offers Buy groceries from Sep 23 without adding it to
  the next week's list.
- **Shelf completion: pass.** Completed Big test directly in Today's Week tasks
  shelf. It appeared in Week's Completed group. Reopened it there; the shelf again
  offered Complete and retained Weekend Sep 26–27. It was never chosen for Today.
- **Repeating routine time: pass.** On QA Routine Timing, saved an untimed daily
  rule, then entered 8:30 PM and used Save & close. Sep 23 showed it in Schedule
  at 8:30 PM. Explicit Save repeating schedule successfully cleared the time.
- **Untimed occurrence time: pass.** With that rule untimed, selected Set time
  in Sep 23's routine shelf and chose 9 PM. It appeared in Schedule at 9 PM; Sep 24
  had no timed occurrence. After quitting/reopening, Sep 23 still showed 9 PM.
  Rule detail remained Daily without a time, confirming occurrence-only scope.
- **QA cleanup: pass.** Restored QA Routine Timing's original 8 PM rule through
  Save & close, reopened detail to confirm Daily · 20:00 while Sep 23 retained its
  own 9 PM override, then returned the routine to Resting. Scott's Read for
  10 Minutes routine was unchanged. The QA occurrence override is retained.
- **Goal linking: pass.** Created QA Goal link verification in October. Its visible
  Link to goal control linked it to QA Month outcome and expanded the goal.
  Supporting-task count and Month tasks guidance updated. Completed only the QA
  task; the goal and existing QA Month next action remained open. The completed
  QA task is retained for traceability.
- **Goal review: pass, UI.** October's previous-month review visibly offered Keep,
  Keep + next action, Done, Someday, Drop for the open September goal. Closed
  without changing that goal. Domain preflight/failure paths remain covered by
  automated regression tests, not newly exercised production writes in this pass.
- **Daily review keyboard: pass.** Escape dismissed the review with its reflection
  input focused.
- **Optional onboarding: pass, mechanics.** More → Getting started reopened the
  invitation. Add something for today opened the real Today input; Start with a
  goal exposed Month, Season, Year. Explore on my own dismissed it without
  creating sample work. Restarted the app to verify persisted dismissal.

The test app was returned to Today. No user tasks or routines were deleted.
The documented planning walkthrough blockers are resolved and the targeted live
rechecks pass. This does not extend the sign-off to cross-account security,
external provider integrations, or fresh-user comprehension research.
