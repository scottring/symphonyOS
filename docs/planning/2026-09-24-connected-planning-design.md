# Connected planning: one task, a consistent story

Status: Codex design proposal for Scott's review. No application changes, data writes, rebuild, migration, or deployment. Supersedes the isolated task-row mockup as the scope of the next usability pass.

## Objective

Make Symphony's existing UI as understandable as the proposed anatomy diagram. Use the diagram as a design and verification aid; do not add a permanent diagram panel or a new product subsystem as a prerequisite.

A person should be able to answer: What is this? What does it serve? When have I chosen to do it? What will this control change? Where can I find it afterward?

## Source-grounded baseline

Read September 24 autonomous walkthrough log and current goalSupport.ts, goalSteps.ts, planActions.ts, PlanSession.tsx. This is source/design review, not a new live verification.

- Goal-to-goal support and task-to-goal membership are distinct relationships. Scheduling an action must not change either.
- A task can retain broader commitments while receiving a week or day. Giving it a date does not prove it has a separate explicit week commitment; the UI must distinguish an actual commitment from merely falling within that week.
- Removing a day preserves broader commitments when they exist. If none exist, the resulting destination must be explained rather than promised as 'still this week.'
- Completing a task is different from completing its goal.
- Goal steps remain historical evidence when completed. They must not silently disappear or become another record when viewed elsewhere.
- Current planning session save screen still says 'Nothing is saved yet' and 'Nothing chosen' for an empty change set, even when saved work exists.
- Per-person focus, repeating routine rules, and calendar events are additional concepts. Do not quietly collapse them into task scheduling during simplification.

## Working example and anatomy

Use the existing Islanders example for design; do not mutate it for mockups.

October goal: Take Kaleb to an Islanders game in DC
- Research game dates and tickets
- Buy game tickets

Do not invent a season/year ancestor for this goal. The goal-support fixtures can test deeper ancestry separately.

For Research, the three independent facts are:
1. Purpose: supports the Islanders goal.
2. Planning: included in October; optionally explicitly chosen for Oct 4-10.
3. Execution: optionally assigned Monday Oct 5, any time; open or complete.

Ownership/sharing remains visible in details and explicit before a new item is shared. It must not interrupt a later timing choice without explaining why.

## Proposed connected screens

These are changes to responsibilities and transitions, not new destinations.

### 1. Month: see and revise the plan

October 2026

Take Kaleb to an Islanders game in DC [Open goal]
  Research game dates and tickets       [When: not chosen]
  Buy game tickets                     [When: not chosen]
  + Add action

Other October work
  + Add task

[Review September]   [Guided planning]

The existing goal and actions are the plan. The ordinary page is usable without starting a planning session. Goal-linked actions and independent work stay distinguishable, but both use the same timing language. Remaining and completed counts are explicit.

Selecting a week updates Research in place to 'Week of Oct 4'. A confirmation can offer 'View that week'; navigation is optional. Returning from goal/task details preserves October and expansion state where practical.

### 2. Week: choose what to do, with its purpose visible

October 4-10

Any day this week
  Research game dates and tickets      [When: Oct 4-10]
  For: Take Kaleb to an Islanders game in DC · October

Monday Oct 5
  [existing commitments]

[Choose more from October]   [Review last week]

A Month reference in Shelves is an optional source of work, not another competing copy of the plan. Already-included work is marked as such; choosing it again cannot duplicate it. Click a goal name to inspect its context; returning restores the viewed week.

Choosing Monday updates this same task. Show its full row once in the daily section, rather than once in the weekly list and again in the day list. A compact weekly count may still include it. This deduplication is a proposed visual treatment requiring review, not implemented behavior.

### 3. Day: do the action

Monday, October 5

Any time
  [ ] Research game dates and tickets   [When: Mon Oct 5]
      For: Take Kaleb to an Islanders game in DC · October

Task details, when opened from any screen, lead with:
- Title and completion state.
- For: linked goal, with broader ancestors available on demand.
- When: day/time and explicit broader commitments.
- Other task information below.

A day never requires a time. Reading details should not require another decision. Completing the action updates the same record across Day, Week, Month and goal details; the goal itself stays active until explicitly completed.

### 4. Review: adjust the existing plan

Review Oct 4-10

Finished
  Research game dates and tickets

Still open
  [only work actually committed to this week]

For each open item, offer outcomes with named destinations:
- Keep for Oct 11-17.
- Mark complete.
- Put on Someday.
- Remove from this week's plan, with its actual remaining destination stated.

Preview actual changes and preserve the existing plan alongside them. No changes means 'Your plan is unchanged' with Done/Close, not 'Nothing chosen' or a misleading Save requirement. Failed saves keep proposed edits and distinguish saved changes from unsuccessful ones.

## Transition contract

| Gesture | What changes | What remains | Where user sees the result |
| --- | --- | --- | --- |
| Add an action under a goal | New action linked to that goal and named period | Goal identity/status | Same goal immediately, then matching period view |
| Choose Oct 4-10 | Explicit week commitment | Action identity, goal relationship, October commitment | Month timing label; Week once |
| Assign Mon Oct 5 | Day assignment; time optional | Existing explicit broader commitments and goal | Monday row; Month/goal timing label |
| Remove Monday | Day assignment and applicable day focus removed | Existing week/month commitments and goal | Any day this week if committed; otherwise named remaining plan |
| Remove week when no day is set | Explicit week commitment removed | October commitment and goal | October row shows no chosen week/day |
| Remove week while a day is set | Requires clear handling of dated work | No silent clearing or contradictory promise | Explain that date still falls in the week, or explicitly offer clearing both |
| Complete action | Action completion state | Identity, goal link, historical placement | Completed history across matching views; goal not auto-completed |
| Reopen action | Completion state | Prior relationships and timing unless explicitly changed | Same task restored, no duplicate |
| Keep into next week | Named new week commitment; prior week decision recorded | Goal and broader commitments | New Week plus history; preview cross-month implications |
| Open details and return | Navigation only | Viewed period and saved task | Original screen and period |
| Reload | No data mutation | Saved relationships, timing, navigable period | Same period; loading state until data resolves |
| Open guided planning | Begin optional reflection/editing | Existing saved plan | Saved baseline visible before proposed changes |

Do not auto-add every horizon merely because a date falls inside it. A dated task can appear in a week calendar without being a deliberately chosen weekly commitment. How prominently to expose this distinction needs walkthrough evidence; the UI must never claim a commitment that is not saved.

## Component responsibilities

- Month/Season/Year: priorities and their supporting work; consistent links upward and downward.
- Week/Day: execution views of the same work, with purpose visible.
- Details: dependable place to inspect identity, purpose, timing and other information; the same facts wherever opened.
- Shelves: contextual reference/selection. Its heading names its period; it does not silently fall back to today during future planning.
- Guided planning: optional way to reflect on and revise the existing plan. No parallel competing plan.
- Review: explicit decisions about existing commitments and history.
- Plan from paper: proposed interpretation added to this same structure after review. Brainstorm items can remain notes or undecided; dates, repetitions and ancestry are not silently inferred into commitments.
- Planning guide: optional prompts before or during those existing flows. Not required to understand the controls.

## Smallest next design proof

Build one connected, non-persistent prototype with Month, Week, Day, details and review sharing one example task state. Keep a compact anatomy reference available for design inspection, not permanently occupying the product UI. Demonstrate:

1. Start in October with the existing goal and two actions.
2. Choose Research for Oct 4-10 without leaving Month.
3. Follow View week; see the goal relationship immediately.
4. Choose Monday with no time; see one action row on Monday.
5. Open details, return, and retain period/context.
6. Complete, inspect October, then undo.
7. Remove the day, then the week; confirm October and goal survive.
8. Open guided planning without edits; see the saved plan and close unchanged.
9. Repeat from a standalone day task, proving an ancestry/week commitment is not invented.

This is the next visual deliverable, not authorization to change production or rebuild the existing preview. Review connected behavior before styling or implementation. Reuse existing domain operations once implementation is approved.

## Stop conditions

No new graph schema, permanent anatomy dashboard, AI agent, calendar integration, routine redesign, or broad navigation replacement in this slice. Record unrelated discoveries. The test is whether Scott can predict what an action does and locate his work afterward without coaching.

## Scott-approved connected flow

Confirmed incrementally with Scott after the initial document proved too much information at once. Keep subsequent reviews short and show one transition at a time.

- Clearly indent supporting actions beneath their goal.
- Show each action's actual saved timing and a visible Choose when control. Choose a week or day in place, without task details.
- After choosing a week, retain the action under its October goal and offer View week.
- Week shows the same action, its goal, and Any day this week as an editable timing control.
- Choosing Monday shows the task once under Monday, untimed unless a time is requested. Month reflects Monday while retaining goal nesting.
- Completion propagates across all views of the same task. The goal stays active; other actions stay open. Offer Undo.
- For the example with explicit October and week commitments, Remove Monday retains week and goal. Remove day and week retains October and goal. Derive the explanatory text from actual saved commitments in other cases.
- Explain removal consequences before confirmation, then confirm the actual saved result afterward with Undo.
- Reopening Plan October shows existing goals/actions, including completed work. With no changes, say Your October plan is unchanged and allow closing; never imply existing work was not saved.

This is approval of the interaction direction. No new approval of production deployment, account mutations, or broad redesign is implied. Next deliverable: connected visual walkthrough of these transitions; no permanent anatomy subsystem required.

## Implementation authorization and delegation

Scott subsequently walked the connected prototype starting from an EMPTY October: created a goal and action, chose Oct4-10, viewed Week, assigned Monday untimed, completed, returned to Month, undid completion, removed Monday, and reopened Plan October. He confirmed relationship/timing clarity at each step. This validates the prototype experience, not production correctness.

Scott now asks Codex to build the agreed flow and delegate implementation to Claude. This supersedes the earlier mockup-only restriction for the bounded work below. Codex owns product decisions, code review and independent live walkthrough; Claude owns implementation and automated verification.

Implement on claude/onboarding-program in this worktree. Preserve existing uncommitted work. No push/merge/production deployment, shared migration, real-account edits, or cleanup of existing demo fixtures. Rebuild local preview after checks; coordinate demo browser mutations with Codex. No other session should mutate demo concurrently.

Implementation requirements:
1. Clear goal/action nesting and visible accurate timing on Month/Season/Year goal steps. Keep hierarchy optional; standalone tasks still work.
2. Consistent visible timing controls across period rows, Week/Day, and details. Allow week/day selection in place, no required detail-page detour. Explicit target period, no fallback to current month/week when a viewed period is available. Preserve goal and broader commitments. No hover overlay may obscure timing.
3. Contextual View week/day links use the selected dates and existing URL conventions. Details Back restores originating view and period.
4. Week shows a dated action once under its day, an undated weekly commitment under Any day. Count rules must be consistent. Do not conflate explicit week commitment with a dated task merely appearing in its calendar week; handle dates outside the chosen week truthfully.
5. Completion/reopening updates all views of the same task; does not complete its goal. Keep completed work accessible. Reuse reliable Undo and one confirmation, not duplicate notifications.
6. Timing removal explains actual consequences BEFORE clicking and confirms saved outcome afterward with Undo. Remove day retains an existing week, otherwise names actual remaining destination. Explicit remove day+week retains broader commitments and goal. Keep focus semantics intact.
7. Plan October (and equivalent existing sessions) starts with saved work and includes completed work appropriately. Summaries distinguish existing plan from proposed edits. An unchanged plan says it is unchanged and can close without a write. Preserve draft and partial-failure retry behavior.
8. From-empty goal/action creation and standalone-task-later-linked-to-goal paths remain functional. Existing support links, routines, calendar, permissions and task history must not regress. Do not copy prototype limitations such as fixed week choices, single-goal cap, hardcoded Monday, or volatile state.

Use the approved inline prototype only as interaction evidence, not a new layout to copy wholesale:
/Users/scottkaufman/.codex/visualizations/2026/09/22/01a0c8f3-040d-7060-8234-aaf3d407b929/build-your-october-plan.html
Read its source only. Prior browser policy rejected opening another local mockup: do not bypass that by serving blocked files or changing browser surfaces. Actual localhost app preview testing remains the established workflow.

Deliver in reviewable commits: (A) connected task presentation/timing/navigation; (B) removal/completion/Undo; (C) planning-session truthfulness. Adapt grouping if shared code requires it, but retain a clean review trail. Run meaningful regression tests for changes, typecheck, lint and build. Report precise files/commits, automated evidence, browser evidence separately, and unresolved gaps. Do not claim the full product verified from a unit-test count. Report any product ambiguity rather than inventing a new data model.

Deferred: onboarding entry paths, printable guide, paper AI, permanent anatomy panel, broad calendar/routine redesign. These remain program work; first finish and verify this connected UI flow. Standalone-task and deeper hierarchy paths still need independent live walkthrough.

## Expanded unattended authorization

Scott explicitly asks Codex to build the whole agreed program while he is away for several hours; production approval remains his. Codex interprets this as the connected planning UI plus the three optional onboarding entry paths and permanent printable Planning Guide, not the previously deferred AI onboarding agent. The preceding deferral of entry paths/guide is superseded. Continue without routine design questions, preserving approved visual language and current data semantics. Use reversible local work and demo fixtures; preserve all existing real/demo history. New credentials, consequential shared database changes, and production release remain separately gated if needed. A blocker in one part should not stop independent work.

Order: finish and verify connected planning, then implement lightweight optional entry paths and guide based on actual supported flows. Entries are Capture now; Plan weeks/month; Plan season/year. All remain optional and use the existing UI. A permanent guide supports individual/family review and planning with paper or direct entry. Use Best Laid Plans official monthly/seasonal material as a modest attributed reference, original prompts, no claimed book reading. Prioritize clarity and practicality over an emphasis on enjoyment. Do not promise unsupported AI operations or turn every brainstorm item into a goal. Preserve original notes, review interpretations and choices before imports; do not import Scott's handwritten pages into the real account.

Codex will coordinate unattended follow-ups, inspect Claude's actual diffs and checks, and perform live walkthroughs. Final handoff should offer one working preview plus concise verified/pending summary; no production deployment.
