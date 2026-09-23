# Onboarding program — findings log

Persistent across sessions. One row per finding. Plan:
[`2026-09-23-onboarding-and-planning-guide-program.md`](./2026-09-23-onboarding-and-planning-guide-program.md).

**Kinds:** `bug` (behaviour is wrong) · `usability` (behaviour is right, the person is
lost) · `onboarding` (nothing is wrong; something needs teaching or a path).

**Severity:** `blocker` (cannot continue) · `high` (wrong data, lost work, or a wrong
mental model) · `medium` (friction, recoverable) · `low` (polish).

**Retest:** `open` · `fixed` · `retested-pass` · `retested-fail` · `wontfix` · `parked`.

## Log

| ID | Storyline | Kind | Sev | Steps to reproduce | Expected | Actual | Evidence | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1-01 | 1 | onboarding | high | Arrive at an empty Today as a new household. | An entry path for "just start using it" that covers a calendar/event, a capture, a day choice and a routine. | The card offers exactly two paths — "Add something for today" and "Start with a goal". Nothing mentions calendar, capture, routines, or choosing a day. Storyline 1 is represented by a single task. | Screenshot 2026-09-23, `FirstWeekCard.tsx` | open |
| S1-02 | 1 | usability | medium | Look at the header on first arrival. | Some sign of who is signed in — a name or household. | No name anywhere on the page. Identity is behind an unlabelled person icon top-right. `docs/onboarding.md` Step 0 still promises "Today opens, greeting you by name"; the web redesign removed it. Doc and build have drifted. | Screenshot 2026-09-23 | open |
| S1-03 | 1 | usability | medium | Read the masthead subline on an empty week. | Language a first-time user can decode. | "Nothing on the board this week." — "the board" is never defined and is not a surface the user has seen. | Screenshot 2026-09-23 | open |
| S1-04 | 1 | usability | medium | Count the ways to add the first thing. | One obvious first action. | Four competing routes on one empty screen: the card's "Add something for today", For today's "Choose from this week's tasks, or add something for today", the "+ Add task" link, and the global "+ Add ⌘K". Each lands somewhere slightly different. | Screenshot 2026-09-23 | open |
| S1-05 | 1 | usability | high | New user reads the primary navigation: Planner › Today · Week · Month · Season · Year. | Tabs named after periods of time show what is happening in that period. | They are planning lists of goals and tasks, not period views. Scott, verbatim: "it's confusing that the menu bar/nav says Planner >> Today - Week - Month etc... but those aren't calendars for viewing items but rather goals and tasks from/for planning. i think it's probably a minor fix but imp;ortnat nonetheless" | Live walk 2026-09-23 | open |
| S1-05a | 1 | usability | high | Visit Today, Week, Month, Season in turn. | Five tabs in one ladder behave alike. | They split in two. Today and Week read as period views — Scott on Week: "i think that page looks like 'my week'", and the dentist event appeared there correctly. Month and Season read as "a list to fill in". The nav presents all five as one row, so the break is invisible until you click. | Live walk 2026-09-23 | open |
| S1-06 | 1 | usability | high | Add a dated appointment as a brand-new user. | The control is findable without prior knowledge. | Scott found it "but only bgecause i know where to look for stuff". The event itself was written correctly (`calendar_events`, Tue 29 Sep 14:00 local, not a task). Discovery failed; the write succeeded. | Live walk 2026-09-23; `calendar_events` 8864e8f4 | open |
| S1-07 | 1 | usability | high | ⌘K, type a line, Enter. Repeat three times from a page that is not Today. | A confirmation that names where the item went and offers a way to it. | All three wrote correctly to `bucket='inbox'` in ~7s, but the only feedback is a fly-away animation (`symphony:inbox-add`) with no destination when you are not on Today. Asked where the items now lived, Scott proposed the fix instead of answering: "perhaps we should add a hyperlink to 'go to inbox' after items have been entered in cmd-k". Confirms walkthrough Run 1 #8 ("disappears into the ether"). | Live walk 2026-09-23; `QuickCapture.tsx:227,271`; tasks in `inbox` 19:19–19:20Z | open |
| S1-08 | 1 | usability | medium | Place three inbox items — one for today, one flexible this week, one on a named day. | — | Placement itself passed: Scott, "no it all made sense." Nothing had to be guessed before clicking. | Live walk 2026-09-23 | retested-pass |
| S1-09 | 1 | usability | medium | Open the "..." triage menu on an inbox row. | A quick, scannable way to place an item. | A long plain-text list (Today / Week / Month / Someday / Next Week / Note / Done / Delete, plus context tags). Scott: "it's a very long list and quite ugly. can we get those iconographic menus back with the progress bar indicators of how much you already have committed for each horizon?" **Needs a mockup before build** — no per-horizon load/capacity component exists in the codebase today, so the indicators are new work, and they must read from the same selectors the horizon pages render so counts mirror render. | Live walk 2026-09-23; `DenseInboxRow.tsx:20-28`, `InboxView.tsx` | open |

## Carried in from earlier work

These are not re-findings; they are the open items this program inherits. Confirm or
close each as the matching storyline is walked.

| Source | Item | Storyline that tests it |
| --- | --- | --- |
| Walkthrough Run 1 (#1) | Navigation "highly confusing" | 1 |
| Walkthrough Run 1 (#6) | Empty Today "totally confusing … even as the creator" | 1 |
| Walkthrough Run 1 (#8) | ⌘K capture "disappears into the ether" | 1 |
| Walkthrough Run 1 (#9) | Inbox verdict — "not clear where the task went" | 1 |
| `docs/onboarding.md` A5–A12 | Inbox: three "when" controls per row; "Calendar" deletes the task | 1 |
| Onboarding assessment | Contextual teaching sequence is a proposal, never built | 1–4 |
| This inspection | `firstWeekSteps` computed but no longer rendered | 1 |
| This inspection | No way back into onboarding once dismissed | 1 |
| This inspection | No Planning Guide surface anywhere | 2–4 |
