# Planning and onboarding walkthrough — September 22, 2026

Scott is driving production with a test household of four people and a small
amount of sample work. Record user-observed results separately from automated
checks. Continue each journey before implementing nonblocking findings.

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
