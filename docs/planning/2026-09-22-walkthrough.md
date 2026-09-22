# Planning and onboarding walkthrough — September 22, 2026

Scott is driving production with a test household of four people and a small
amount of sample work. Record user-observed results separately from automated
checks. Continue each journey before implementing nonblocking findings.

The agent subsequently completed the scoped follow-up audit. For final statuses,
including corrections to earlier provisional findings, see
[walkthrough status](2026-09-22-walkthrough-status.md). The
[onboarding assessment](2026-09-22-onboarding-assessment.md) proposes the resulting
first-use flows. Historical pending notes below are superseded by that status
matrix. Failed flows remain open for implementation; this is not release sign-off.

## Product reference

Use “Symphony — agreed item flow & design reference”:
codex://threads/01a0c5c4-27c9-7f50-b8db-f2615f2fe92f

People may enter work directly at any horizon. Goals guide tasks without becoming
tasks. One task retains its identity, broader commitments, and completion across
views. Routine completion affects only an occurrence. Carry-forward is deliberate.
Today-first and goal-first onboarding are both valid; neither is a prerequisite.

## Confirmed in the walkthrough

- Adding “Buy groceries” directly to Today worked and its destination was clear.
- Scott completed “Book dentist appointment” on Today and confirmed it appeared
  under Completed on Week. This verifies shared completion for that tested task.
- Quick planning actions and viewport bounds were a blocker. Fixed and deployed:
  Today button in Today's task shelf; This week and Weekend in Week's shelf;
  remaining menus and the date picker constrained to the viewport. Scott reported
  “all set” after deployment.

## Open findings

1. **Complete tasks directly in Today's Week tasks shelf.** Add a separate
   completion checkbox; Today remains the action for choosing the task. A task
   need not be chosen for Today before being completed. Completion must update
   every view. Scott asked to log this and continue, not implement it yet.
2. **Shelves launcher placement.** Scott's final preference is the bottom-right
   corner of the large date header, as a page-level reference control across
   horizons. This supersedes the earlier suggestion to place it beside For today.
   The panel continues to open on the left. Not implemented.
3. **Empty Shelves guidance.** An empty shelf does not explain what belongs there
   or how to populate it. Explain the week's tasks and relevant routine occurrences,
   with an appropriate path to Week. Direct entry on Today must remain useful.
4. **Legacy “Your first week” checklist.** Dominates Today and implies starting
   with annual planning, paper capture, and partner participation. Recommendation:
   retire the rigid checklist and use contextual guidance informed by this
   walkthrough. No removal or replacement implemented. Preserve both immediate
   work and broader-goal starting paths.

## Next journey

Test choosing and completing one untimed daily routine occurrence. Verify that
completion applies only to the displayed day and preserves the repeating pattern.
Then test a month goal and supporting task through Week and Today, followed by
period-end review and deliberate carry-forward.

## Routine creation findings

- Scott created Read for 10 Minutes; it appeared under Daily / Flexible time in
  Routines but not in Today's routine shelf.
- Inspected the actual app: Active and On Today were enabled, Layers was All.
  Today's More controls offered Show daily, confirming the hide-daily display
  preference was enabled. Turning Show daily on immediately exposed Read for
  10 Minutes in Shelves. No routine data was changed.
- **Open:** Shelves silently inherits the hide-daily timeline preference. Keep
  relevant routine occurrences discoverable in Shelves independently of this
  display setting, while preserving domain/assignee and recurrence rules.
- **Open navigation finding:** Give Routines a visible primary navigation entry
  alongside Today, Plan, and Inbox; Scott finds More inappropriate for its
  importance. Shelves offers occurrences; Routines manages repeating patterns.

## Displayed-day mismatch blocker

Scott completed the reading routine, navigated the main page to another day,
and saw the completed occurrence persist in Shelves. The panel header also
remained on the original day. Root cause: the desktop PlanningPanelHost used
new Date() instead of the day displayed by TodayView. Fix: publish the displayed
day while Today is mounted, subscribe in the dock, and remount occurrence data
and actions on a day change. Other pages fall back to the current day. Regression
coverage checks the header, day-data request, and routine action date together.

## Follow-up checks and weekend ordering

- Scott confirmed the displayed-day fix works as expected: Shelves follows the
  navigator and shows the appropriate routine occurrence completion state.
- Scott confirmed moving Buy groceries to tomorrow works in the walkthrough.
- Scott confirmed flexible weekend assignment works, but reported the weekend
  task appears on the left after Assigned a day (containing Buy groceries).
- **Open presentation finding:** Put flexible weekend commitments before dated
  tasks. Proposed group order: Any day → This weekend → Assigned a day → Completed.
  Keep weekend tasks flexible across Saturday–Sunday; ordering must not assign
  them to Saturday. Logged at Scott's request; not implemented.

## Month task-to-goal connection

- During the Month walkthrough, Scott reported no available option to link a
  task to a goal and identified this as important functionality to expose.
- **Open finding:** Provide a discoverable way to link a month task to the goal
  it supports. The walkthrough example is Check furnace filter supporting Get
  the house ready for fall. Preserve separate task and goal identities, and
  retain that relationship when the task is committed to Week or chosen for
  Today. This observation establishes a missing UI option, not whether an
  underlying relationship already exists. Logged; not implemented.

## Month → Week → Today walkthrough passed

- Check furnace filter was committed to the week. Scott's screenshot confirmed
  it remained on Month under Already assigned, labeled September 20–26.
- Scott chose it from Today's Week tasks shelf and confirmed it appeared on Today.
- Scott completed it on Today and confirmed completion appeared on both Week and
  Month, while Get the house ready for fall remained open. Shared task completion
  and separate goal identity passed for this journey; the missing goal-link UI
  remains an open finding.

## Carry-forward walkthrough blocked

- After navigating to next week, Scott could not find a previous-week review.
  When prompted to look in Shelves for Earlier / Unfinished from earlier, he
  reported no carry-forward was available there either.
- **Open functional/discoverability finding:** Provide a clear review of the
  previous week's actual list, including finished and open work, with deliberate
  choices to keep an item for the new week, mark it done, send it to Someday, or
  drop the prior commitment without deleting the item. Unfinished work must not
  silently become a new commitment.
- This journey is blocked in the user walkthrough. The report does not establish
  whether the review is absent, hidden, or filtering the items incorrectly;
  investigate before selecting a fix. Logged; not implemented.

## Unified horizon navigation

- Scott agreed to bring Today into the horizon tabs as the first entry:
  Today → Week → Month → Season → Year.
- Rename the parent destination Plan to Planner, encompassing today's work and
  longer-term planning. Proposed primary navigation: Planner · Routines · Inbox.
  This incorporates the earlier finding that Routines deserves a visible entry.
- Keep the Shelves control and date header in consistent positions across
  horizons. Logged for the next design pass; not implemented.

## Year → Season walkthrough passed

- Scott confirmed the Year-to-Season test passed: the yearly goal was available
  as reference in Season's Shelves while creating a separate season goal.
- The tested journey used Make our home easier to maintain as the yearly goal
  and Get ready for winter as the season goal. Reference visibility and separate
  goal identity passed; this does not establish an explicit goal-to-goal link.

## Season → Month walkthrough passed

- Scott confirmed Get ready for winter was visible as season reference in
  September's Shelves alongside the existing month goal Get the house ready for
  fall. No duplicate month goal was needed.

## Direct Week entry walkthrough passed

- Scott confirmed a task added directly to Week without a day appeared under
  Any day and in Today's Week tasks shelf, without automatically appearing on
  Today's task list.

## Remove Today commitment walkthrough failed

- Scott could not find how to remove a chosen task's Today commitment. After
  guidance to use Remove from today in Today's Week tasks shelf, he reported
  that it did not appear to work.
- His screenshot shows Test weekly task still in For today. Its shelf row
  shows Tue and offers Today / Choose date, rather than Remove from today.
- **Open functional and discoverability finding:** Removing a Today commitment
  must remove the task from that day's list while preserving its Week commitment
  and identity. Shelf actions must reflect the resulting state consistently.
  Investigate whether a day assignment remains after the choice/focus is cleared;
  the screenshot alone does not establish the cause. Logged; not implemented.

## Routine occurrence timing walkthrough failed

- Asked to give one Read for 10 Minutes occurrence a time and verify tomorrow
  remains flexible, Scott reported setting a time and saving, but the routine
  still appeared in For today with no visible time. His screenshot confirms an
  untimed-looking row and an empty upcoming Schedule.
- **Open functional finding:** A saved occurrence time must be visible and place
  that occurrence in the day's schedule. Investigate whether the time failed to
  persist, was not propagated, or was ignored by display grouping; cause is not
  established by the screenshot.
- **Open scope/discoverability finding:** The screenshot shows the routine editor
  with Active, Daily / Edit schedule, and Save & close. Make editing this
  occurrence versus the repeating pattern explicit. We have not established
  which scope Scott's save changed, nor verified tomorrow remains flexible.
  This occurrence-only timing journey failed; logged, not implemented.

## Agent-driven follow-up in production

Scott authorized the agent to take over the walkthrough. Tested through the
native Symphony UI against the existing Alex/Edith/Liam/Mia test household.

### Confirmed

- Assigned Test weekly task from Alex to Edith. Edith's filter showed it in both
  Today and Shelves; Liam's filter excluded it; All restored it. Restored the
  task's assignment to Alex and the filter to All afterward. This tests filtering
  within this account, not cross-account database permissions.
- Found the previous-week review by opening next week and clicking Plan the week
  of Sep 27–Oct 3. It listed completed Book dentist appointment / Check furnace
  filter and open Big test / Test weekly task, with Keep, Done, Someday, Drop.
- Chose Keep only for Test weekly task. The save summary explicitly left Big test
  open in Sep 20–26. After Save, Test weekly task appeared under next week's Any
  day with “kept from last week”; Big test remained in the original week.
  Thus Keep-and-save works. The earlier blanket carry-forward blocker is narrowed
  to discoverability and the Earlier shelf's behavior; Done/Someday/Drop have not
  been exercised in this follow-up.

### Findings and diagnosis

- Next week's Earlier shelf said “No unfinished tasks waiting for a decision,”
  although the planning review offered prior-week items. Source inspection shows
  unfinishedEntries intentionally uses the real current week, rather than the
  displayed week. That explains the mismatch while planning ahead. Provide a
  clear route to previous-period review and distinguish overdue work from work
  available for next-period review.
- Removal cause confirmed in source: chooseTaskDay writes scheduledFor plus
  plannedOn; unchooseTask removes only focus. The date survives, so the task still
  belongs on Today. In the live shelf, the now-unfocused task had a disabled Today
  action and its More menu offered only Someday and Delete.
- Under Liam's filter the shelf says “No tasks on this week's list yet” and offers
  Plan your week. It should explain that no tasks match the selected person,
  rather than implying the household's week is empty.
- Clicking Today from the Sep 20–26 Week page opened Sunday Sep 20, requiring Go
  to today to reach Sep 22. Log as a navigation expectation issue: distinguish
  entering the Today destination from intentionally browsing another day.
- The routine shelf exposes a Schedule action for the occurrence, but desktop
  automation became stuck on the native popup: selecting the action and keyboard
  dismissal yielded unchanged menu state and screenshots were unavailable.
  An alternate installed build opened the same test household and allowed the
  carry-forward test above; its routine popup hit the same automation limitation.
  This is a testing limitation, not proof the menu fails for a human. The reported
  routine-time persistence/display issue remains unverified by the agent.

### Test data left after this pass

- Test weekly task is assigned to Alex and committed to Sep 27–Oct 3 by the Keep
  test; it still appeared on Sep 22 through its existing date assignment.
- Next week's plan was saved. Big test was left in its original week. No task
  was deleted and no repeating routine rule was changed by the agent.

### Onboarding implications

- Offer two optional starting paths: add something for today, or name a broader
  goal. Introduce Shelves when there is relevant content to choose or reference.
- Teach the same-task connection after the first Week-to-Today choice and explain
  that completing a routine applies only to its occurrence.
- Introduce previous-period review through a visible entry point when planning
  the next period. Resolve removal, routine timing, and review discoverability
  before embedding those actions in guided onboarding.

### Automated checks

67 existing tests passed across planActions, applySession, routineTime, and
dayPlan. These are unit checks, not substitutes for the failed live journeys;
in particular, the existing unchooseTask contract tests focus removal without
asserting that choosing and then removing Today clears the day assignment.
