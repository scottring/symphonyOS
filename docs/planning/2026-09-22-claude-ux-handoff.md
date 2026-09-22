# Claude handoff: full Symphony usability and UI/UX assessment and improvement

## Scott's request

Scott asked whether Codex had completed a full usability and UI/UX assessment and
improvement. Codex clarified that it had only improved planning horizons and fixed
specific walkthrough findings. Scott then explicitly asked to pass the task of
performing the full assessment and improvement to Claude. This is that handoff.

Own this work through assessment, implementation of justified improvements, and
verification. Do not stop at a generic critique or claim a whole-app pass from
unit tests alone. Start by making a coverage inventory and a prioritized,
evidence-backed findings log, then fix the concrete problems. Preserve the
existing Nordic Journal visual identity and the agreed product model.

## Workspace and baseline

- Work here: /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/claude-ux-assessment
- Branch: codex/claude-ux-assessment, created from freshly fetched origin/main.
- Baseline production: ed2efe40, live at https://app.symphony-os.com.
- Read CLAUDE.md, VISION.md, POSITIONING.md and applicable repository instructions.
- Never edit or switch branches in the main worktree. Preserve other sessions.
- The updated walkthrough-status.md has been copied here from the prior worktree;
  it is an intentional uncommitted handoff change, not someone else's unfinished code.
- Prior worktree (reference only): ../planning-chooser-cleanup. Its 71903e71 commit
  adds the final live verification report; implementation commits are already on main.
- Do not change personal accounts, send invitations/messages, delete user data,
  or make security/access changes as incidental UI testing.
- Scott authorized implementation and prior production releases in this conversation.
  This handoff asks you to own assessment/improvement; do not infer unlimited
  deployment authority for a future app-wide redesign. Follow CLAUDE.md for release
  approval once the concrete tested changes are reviewable. Never bypass hooks.

## Required breadth

Inventory actual routes/features and assess the entire app, including:

1. Navigation/information architecture and consistency between destinations.
2. Today, Week, Month, Season, Year, Shelves, goals, tasks, routine definitions and
   occurrences, planning reviews, carry-forward and direct capture.
3. Inbox/triage, search, global Add, task/detail editors, assignment and context.
4. Routines management and discoverability, optional onboarding, help/reentry,
   settings/account/family setup and connection flows.
5. Other exposed areas: Someday, meals, lists, house, contacts, notes, documents,
   discussions, history, and any additional destinations discovered in the app.
6. Visual hierarchy, density, typography, spacing, alignment, redundant controls,
   labels, affordances, feedback, destructive-action clarity and reversibility.
7. Empty, filtered-empty, populated, completed, loading, error, offline/failed-save
   and first-use states. Distinguish no data from no matching filters.
8. Keyboard-only use, focus visibility/order, dialogs, Escape, accessible names,
   contrast, touch targets, narrow screens and desktop with side panes open.
9. Realistic end-to-end journeys and persistence after actual reload/restart.

Use the rendered app and screenshots as well as source/tests. Cover desktop,
side-pane layouts and phone widths (e.g. 1440, 830, 390 px). Do not describe a
component fixture as a fully tested mobile app. Fix accessibility/interaction and
functional failures alongside visual problems. Avoid gratuitous redesign.

## Agreed product model (preserve)

Symphony connects what matters over the year with today's actions. Users may
enter at any horizon; no mandatory cascade or setup checklist.

- Year holds broad goals, not appointments or a giant task list.
- Season has its own goals and tasks, informed by year goals.
- Month primarily holds goals, plus tasks that need not have a week yet.
- Week has a task list of commitments plus calendar/dated tasks/routine occurrences.
- Today shows the displayed day's tasks/events/routine occurrences. Untimed dated
  tasks belong in For today/For this day, timed items in Schedule.
- Today's Shelves offers week tasks and relevant routine occurrences, visibly
  separated. Month tasks are reference material on Week, never directly offered
  in Today's chooser. Direct Today entry remains available.
- The same task retains broader commitments when assigned a week/day, with shared
  completion. Goals stay separate identities from the tasks that support them.
- Completing or retiming one routine occurrence never alters its repeating rule.
- Weekend is flexible Saturday–Sunday, not an invented Saturday assignment.
- Reviews use the prior period's actual finished/open list and deliberate
  Keep/Done/Someday/Drop choices. No silent carry-forward. Drop removes a period's
  commitment, not the underlying item. A kept goal may get a separate next action.
- Primary navigation: Planner, Routines, Inbox; horizon tabs start with Today,
  then Week, Month, Season, Year.
- Shelves launcher belongs bottom right inside the large date masthead. The panel
  opens on the left on desktop, optionally rather than persistently.
- Work and Personal are private; Family shared as authorized. Assignment is not
  permission. Never claim actual privacy from mocked tests or one-account filters.

Scott dislikes scattered controls, horizontal laundry lists of "available" work,
hidden two-click triage actions, repeated date labels, unclear empty shelves,
and UI that forces planning before useful direct entry. Prefer clear hierarchy
and context, without piling on explanations or another layer of controls.

Original agreed reference (local, read-only):
/Users/scottkaufman/.codex/visualizations/2026/09/21/01a0c5c4-27c9-7f50-b8db-f2615f2fe92f/symphony-item-flow-reference.md
Related thread: codex://threads/01a0c5c4-27c9-7f50-b8db-f2615f2fe92f

## Prior work and evidence

Read these before assessing so fixed issues are not presented as still open:
- docs/planning/2026-09-22-walkthrough-status.md (latest sections supersede history)
- docs/planning/2026-09-22-walkthrough.md (historical findings)
- docs/planning/2026-09-22-onboarding-assessment.md (implemented invitation versus
  remaining contextual teaching proposal and unperformed fresh-user research)

Production fixes include day-removal preserving broader commitments, date-keyed
routine loading, explicit occurrence Set time, routine save/error/retry, direct
shelf completion, visible goal links, supporting-task counts, review entry/Done,
pre-save domain classification, unified navigation, and optional onboarding.
Last full suite: 6,572 passing tests / 633 files, 3 skipped; build passed.
NODE_OPTIONS=--no-experimental-webstorage is needed with the local Node 26 runtime.

Live rechecks passed after restarting the signed-in app: day removal, Week
retention, actual-Today navigation, shelf completion shared with Week, repeating
routine save, untimed occurrence timing isolated to one day, reload persistence,
goal linking/completion, daily-review Escape, onboarding reentry and dismissal.
This is not a full usability sign-off. Fresh-user comprehension, cross-account
security, and external-provider integration checks remain unverified.

## Test environment/data

Test household: symphonygoals@gmail.com; Alex, Edith, Liam, Mia. Scott signed in.
The native app used for live testing is:
/Users/scottkaufman/Developer/Developer/symphonyOS/desktop/src-tauri/target/release/bundle/macos/Symphony.app
It loads production. /Applications/Symphony.app may instead be signed out.
Local browser URL was http://127.0.0.1:5201; verify before assuming server/account.
Use available browser/computer tools; do not extract credentials. If needed,
ask Scott only for the actual authentication/unlock blocker and keep independent
assessment work moving. Native restart works; Cmd-R did not reliably reload.

QA Routine Timing is inactive/Resting, original daily 8 PM rule; Sep 22 skipped
with a retained 9 PM override, Sep 23 retained 9 PM override from testing.
Read for 10 Minutes was left unchanged. Big test is open, flexible Sep 26–27.
Test weekly task is open in Sep 27–Oct 3, removed from Sep 22.
QA Month outcome and QA Month next action remain open in October;
QA Goal link verification is completed beneath that goal. Other retained QA
records are detailed in walkthrough-status.md. Do not erase user or QA history.

## Deliverables / acceptance

Maintain a durable app-wide coverage matrix and severity-ranked findings with
specific journey/viewport/state, observed evidence, expected behavior, fix and
verification. Distinguish observed problems from hypotheses. Implement warranted
improvements in this worktree, adding meaningful regressions and running required
checks. Verify layouts visually and exercise fixed flows, including failed saves.
Present a concise change summary, before/after evidence where helpful, a reviewable
diff and explicit remaining gaps. New-user research cannot be simulated by an AI
and called complete. Do not claim "the app is finished" without qualifying scope.
