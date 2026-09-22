# Onboarding assessment from the planning walkthrough

Status: the optional first-arrival invitation, persistent dismissal, help reentry,
navigation, and task/goal entry paths are implemented in 8cf7b2bc. The contextual
teaching sequence below remains a design proposal, not a validated guided tour.
Not yet tested with fresh users. Product reference: Symphony — agreed item flow &
design reference, codex://threads/01a0c5c4-27c9-7f50-b8db-f2615f2fe92f.

## First arrival

Keep the date, task entry, and schedule visible. Replace the large Your first
week checklist with a small dismissible invitation:

> Where would you like to start?
> Add something for today · Start with a goal · Explore on my own

Neither path requires naming family members, inviting someone, importing paper,
connecting a calendar, or filling every horizon. Those are optional features,
introduced when useful. A dismissal should persist until the user explicitly
reopens help; do not reintroduce the checklist after seven days.

## Today-first path

1. Add something for today. Use the real task-entry control, without creating
   sample work automatically. Success is a visible saved task, including after
   reload. The first task provides value without any planning hierarchy.
2. Offer an optional next step: “Have work for later this week?” Open Week and
   add an untimed task under Any day. Explain that a week commitment needs no day.
3. Back on Today, introduce Shelves when it contains that task: “Choose from your
   week's work.” Choosing it must retain its week commitment.
4. After completion, explain once: “Done here, done wherever this task appears.”
   Keep undo available. Do not turn completion into a required onboarding step.

## Goal-first path

1. Let the user choose a horizon and enter an outcome. A year goal is an option,
   not the default prerequisite. Suggested prompt: “What would you like to make
   progress on?”
2. When opening the next narrower horizon, explain Shelves as a place to consult
   broader goals. Creating a season or month goal does not replace its parent
   reference or imply a link that has not been explicitly created.
3. Offer a supporting task when the user is ready. Expose the goal-link control
   before teaching this step; do not describe a relationship the UI cannot save.
4. Let the user commit that task to Week and choose a day later. Both identities
   remain visible: the task is an action, and the goal is the desired outcome.

## Contextual introductions

| Trigger | Guidance | Required product behavior |
| --- | --- | --- |
| Empty Shelves | Explain the relevant source and link to it | Mention active person/domain filters; distinguish no matches from no data |
| First routine | “What repeats?”; day and time optional where supported | Clearly separate the repeating pattern from one occurrence |
| First occurrence chosen | “This choice applies to this occurrence.” | Completion and time changes must not alter tomorrow's pattern |
| First family assignment | Explain who is responsible and how to filter | Assignment must not be presented as a privacy control |
| First next-period plan | “Review the previous week” (or month/season/year) | Show actual prior list and deliberate Keep/Done/Someday/Drop choices |
| First weekend commitment | “Either Saturday or Sunday” | No invented Saturday date |

## Navigation and language

Use the agreed proposed primary navigation Planner · Routines · Inbox and horizon
tabs Today · Week · Month · Season · Year. Put the Shelves launcher consistently
at the bottom-right of the large date header. Keep the panel on the left.

Use Remove from this day for reversing a day commitment; do not require users to
understand focus flags. Use This occurrence and Repeating routine for schedule
scope. Explain Drop as removing this period's commitment while keeping the item.
These labels are proposed; the current UI does not consistently implement them.

## Implementation gates

Before shipping guided onboarding, fix removal of a Today commitment, resolve
routine timing, expose task-to-goal links, and make prior-period review easy to
find. Stop the guide on failed saves and preserve input for retry. Dismissal and
navigation must not lose drafts. Do not count opening a panel as completing work.

## New-user validation

Test both entry paths with fresh users, including one solo user and one household.
Observe whether they can add work without planning first, explain why a chosen
task remains on Week, distinguish a routine from its occurrence, and find review
without coaching. Check keyboard and narrow-screen flows separately. The current
four-person test household verifies mechanics, not first-time comprehension or
cross-account permissions. Those require separate validation, not a claimed pass.
