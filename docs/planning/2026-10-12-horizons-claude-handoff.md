# Claude: coordinate Week, Season and Year implementation

## User assignment

Scott asked Codex to implement Week, Season and Year separately from the
ongoing Month work, following the same approved principles, adapted to each
horizon. He then explicitly said:

> can you just assign the work to claude also?

And then:

> can you ask claude to assign each one to its own agents?

**You are the coordinating Claude session. Assign Week, Season and Year to
three distinct Claude agents, one horizon per agent.** Own shared design
decisions, integration and end-to-end verification yourself. Each agent
must work in an isolated worktree, preserving other sessions' work. Do not
let Season and Year agents independently overwrite their shared page.
Define ownership for common components and integrate their changes with
the latest Month implementation. Use the existing configured model unless
you have a justified local instruction to do otherwise.

The prepared integration worktree is:
`/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/horizon-purpose`

Branch: `codex/horizon-purpose`, from freshly fetched `origin/main`
(`06b8248d` at creation). Only this handoff has been added here; Codex has
inspected the code but has made no application changes for this assignment.
Read CLAUDE.md and applicable instructions. Never modify, commit or switch
branches in the primary checkout. Preserve the kiosk/wall and Today.

## Coordinate with the already-running Month session

Month is owned by Claude background session `a5661de6`, named
“Symphony Month planning — build and ship”, in:
`/Users/scottkaufman/.codex/worktrees/month-purpose/symphonyOS`

Its approved brief is:
`/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/canvas-first-slice/docs/planning/2026-10-12-month-purpose-claude-handoff.md`

Its requested status report is the adjacent file
`2026-10-12-month-purpose-claude-status.md`.

Read the Month brief and actual implementation to match functionality and
aesthetics. Inspect it read-only; do not alter that agent's worktree or
interrupt its release. There is useful independent work to do on Week
while Month settles. Before integrating changes to shared horizon files,
fetch the finished Month baseline or explicitly incorporate its completed
commit; preserve its behavior and tests. Do not mix in the unrelated
canvas-lab/AI experiments in the source trial at `canvas-first-slice`.

Scott specifically asked whether these pages would fit Claude's choices.
Codex committed to using the actual Month implementation's card styling,
spacing, reference controls and interactions, then checking all horizons
together. Avoid three separately invented visual systems. Preserve the
current scenery/place theme, typography and established styling.

## Shared product principles

- The horizon is an enduring place; a review/planning session is an optional
  purposeful activity within it. Ordinary edits remain available without
  starting a session. No mandatory wizard or setup gate.
- The complete collection for the active horizon is always the primary
  surface. Supporting reference may be hidden and shown. Linking an item
  never removes it from the complete active-horizon collection.
- Relationships use one record with a quiet parent label and optional
  nested preview/count in its reference container. A preview is not a copy.
  Direct edits, links, completion and undo stay synchronized.
- A session tells the user which step they are on and what it is for,
  preserves their emerging plan, allows revisiting a step, remembers
  progress and finishes with a clear view of what they chose. Pause/resume
  must preserve decisions and unfinished input appropriately and isolate
  progress by user and period. Use existing persistence mechanisms where
  suitable; do not invent claims of cross-device persistence.
- Supporting material changes as a session progresses while the emerging
  plan stays anchored. Motion explains a saved change or relationship;
  respect reduced motion. Avoid unnecessary page replacement.
- Yearly, seasonal and monthly **goals**; weekly and daily **tasks**. No
  project entity. The cascade and parent connections are optional.
- Reviews preserve history. Carry-forward is deliberate, never automatic.
  Do not duplicate records or erase broader commitments when adding a day.
- Preserve authorized privacy/domain/people filtering for lists, counts,
  previews and candidate pickers, and existing save/error/undo behavior.
- Use actual selected dates, household week boundaries and custom seasons.
  Do not hardcode current October/Fall dates or default Monday weeks.
- Keep horizon navigation distinct from previous/next period controls.
  No global Plan-navigation redesign in this assignment.
- Prefer a stable bounded workspace without tiny type or inaccessible
  content; adapt gracefully to phones. All reference areas are hideable.

## Agent 1: Week

Scott gave this exact ordered sequence for planning the coming week:

1. **Inbox:** Look at captures and choose the items that need to happen in
   the selected coming week. Add them to the weekly list.
2. **Last week:** Review the previous week's list and deliberately pull
   forward relevant items. Preserve historical commitments and avoid
   automatic carryover or cloning the task.
3. **Monthly goals / new tasks:** Show the selected week's monthly goals
   as reference while the user freely enters new weekly tasks. Optional
   goal links should be easy and transparent. Show both months for a week
   spanning a month boundary. Preserve the monthly goal itself.
4. **Days and optional times:** Place the assembled tasks on their days,
   with times optional. Existing calendar commitments must be visible so
   placement reflects actual availability. Preserve existing routine and
   scheduling behavior, drag/drop and accessible timing controls.

**The same complete weekly list builds throughout all four steps.** Inbox
and review decisions must visibly add to it. During the early steps the
supporting area is the selected source; during placement the calendar is
available alongside the task list. Already-dated tasks are still visible
when assessing the full week's commitments. Reference hide/show never
loses work or changes placement. Direct task entry/adjustment outside a
session remains available. Review and planning are prominent meaningful
activities; do not reintroduce a separate permanent Plan destination.

The current WeekV2 has an older eight-step session (Last week, Inbox,
Between us, Can't move, Look ahead, Routines, Write the week, The week).
**The approved four-step order supersedes that sequence.** Keep useful
calendar/routine/context functionality without making it extra mandatory
steps. A specific “Review last week” entry may go directly to review,
while “Plan the week” begins with Inbox. Resume should return to the saved
step rather than force a restart.

Useful existing files: `src/components/plan/v2/WeekV2.tsx`,
`WeekListV2.tsx`, `WeekStepScreen.tsx`, `WeekStepPanels.tsx`, `PlanStatus.tsx`,
`src/components/home/week/WeekViewV2.tsx`, `WeekJournal.tsx`,
`src/hooks/usePlanningSession.ts`, and their tests. Reuse existing writers,
carry-forward logic, scheduling helpers and calendar data.

## Agent 2: Season

Purpose: **What do I want to accomplish this season?** Build a complete
seasonal goal collection informed by yearly goals, allowing independent
goals. This is the direct counterpart to Month's approved primary-plan /
supporting-reference structure.

- Seasonal goals remain together and visually primary, whether linked to
  a year goal or independent. Yearly goals are useful hideable reference.
- Selecting a yearly goal highlights related seasonal goals without
  hiding the rest of the season. A clear add action creates a seasonal
  goal with the intended relationship in one operation.
- Show parent context and optional nested previews, with the same visual
  language as Month. Keep titles, add actions and guidance appropriate to
  the selected custom season and year.
- Support optional review/planning: review the previous season, make
  deliberate carry-forward decisions, consider yearly goals, and freely
  write the season's goals. Use the same stable main collection and
  changing supporting material. Do not manufacture content or force a
  task/day calendar into this horizon.
- Clear onward action into Month planning and backward horizon navigation
  to Year; period arrows still move between seasons.

## Agent 3: Year

Purpose: **What do I want to accomplish this year?** The complete set of
yearly goals is the primary surface. There is no invented parent horizon.

- Strong, clear yearly goal collection; easy freeform addition and editing
  in the user's own words. Show existing seasonal connections through the
  shared preview/relationship patterns where useful.
- Previous year is optional review material, not a fake parent. Its
  reference area is hideable. Keep review history intact and any renewed
  commitment an explicit decision; don't silently change past goal years.
- Offer purposeful review/planning with previous-year reflection followed
  by shaping this year's goals. Preserve the current year's collection
  throughout, allow pause/resume and ordinary editing outside a session.
- Onward action to Season explains translating yearly goals into the
  next horizon. Keep explicit year navigation and no daily scheduling UI.

Year and Season currently share
`src/components/plan/constellation/ConstellationPage.tsx` with Month.
Coordinate their component boundaries with the integrator before edits.
Keep Month behavior intact; do not fork the same shared page three ways.

## Verification and delivery

Each agent must implement meaningful functional coverage, not just a
static mockup. Verify successful writes and failures, incomplete input,
complete active-horizon inventory, same-entity links, filtered counts,
optional references, review/carry-forward history, session resume and
period changes. Week must prove the exact four-step order and anchored
list, with calendar commitments at placement. Update outdated tests rather
than preserving the old eight-step sequence. Add focused regression tests.

The coordinating Claude must integrate all three, inspect desktop and
phone layouts, keyboard/focus behavior and reduced motion, run relevant
regressions and the required build/checks, and inspect the resulting
Month/Season/Year/Week consistency. Do not change live user records merely
to test. Keep credentials out of artifacts, output and commits. Preserve
kiosk/wall, Today and unrelated Home work.

Do the implementation and verification fully; report actual completion
separately from release. The earlier explicit production authorization
was for Month. Prepare these additional horizons for review and follow
repository release instructions; do not assume that Month's deployment
approval independently authorizes a broader production release.

Keep a concise coordinator status report at:
`/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/horizon-purpose/docs/planning/2026-10-12-horizons-claude-status.md`

Include the three agent assignments/worktrees, current progress, integration
branch/commits, tests/build, local preview and screenshots, any PR URL for
Codex to attach, and concrete blockers or remaining release steps. Do not
call the pages ready until integrated consistency and functional checks
are done.
