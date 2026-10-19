# Planning from the level above (2026-10-19)

Scott, 2026-10-19, after the Week page's "where is the month?" and a mockup round
(`from-the-month.html`, explainer artifact "Planning the Week"). Approved: "apply
it everywhere". Supersedes, where they conflict, the Friday-session spec's
(`2026-10-18-friday-weekly-session-design.md`) "level above beside it to look at,
not to act on" and "goals from the month appear only as the `For October · …`
line on cards", and replaces the deck as what "Plan this week" opens.

## The rule

Every item answers two questions:

1. **What is it for?** The line it sits under. Planning never changes this.
2. **When is it planned for?** One of: the period above (October / Fall / 2026),
   this period (this week / October / Fall), a day, or Done. Planning changes
   only this.

The middle zone between two levels gets a plain name. A step under an October
line that is not in a week yet is **"October"**. One line can hold steps in every
state at once, and that is normal.

A step too big for the level being planned is **broken down where it sits**: add
a smaller step under it and plan that one. The tree gets deeper; the levels stay
five.

## What the data already does

- `task_commitments` holds one row per period a task is planned for (season,
  month, week). `bucket` / `weekStart` / `monthStart` / `seasonStart` are a cache
  of the lowest open one (`src/lib/placement/model.ts`).
- Moving a task down keeps its higher commitments (`intentions.ts`), so a month
  step put on this week is still on October, still counted open there, and shows
  under the line. This *is* the rule: "planned for" is the lowest open
  commitment, and "what it's for" is untouched.

## Gaps to close

1. **Steps are stored two ways.** Lines made under a parent on the level below
   carry `sourceId`. Steps typed under a task are subtasks (`parentTaskId`),
   which are nested on load and never reach a planning page
   (`useSupabaseTasks.ts`). Rule: on a planning page a line's steps are both.
   A subtask with its own commitment for a period shows on that period's page,
   under its parent's name.
2. **No live pull-down.** Nothing writes month → week today (the deck never deals
   month-only items; `periodMoves` has no "this week"; the old `takeIntoWeek` /
   `PlanSession.takeInto` paths are unreachable). Add one verb, "This week" /
   "{period}", that adds the lower commitment to the existing row. No copies.
3. **"One at a time" view** was deleted with `FocusDeck` (#220); it has to be
   built again for step 1.

## Planning a period

Two steps for the week, one for the levels above it.

**Step 1: Choose.** One page, with a switch: **All at once** (every line of the
level above folded to a row with its counts; tap to open its steps) or **One at
a time** (one line per card, its steps beneath). Same items, same verbs; the
switch is remembered per person.

- Lines of the level above, each with its steps and their "planned for" labels.
  Step verbs: **{This period}**, **Done**, **Break it down**, and back up.
  A line's "+ A step {this period}" adds a new step under it.
- Last period's leftovers appear under their line, marked "from last {period}".
  Leftovers with no line, Inbox captures and a free "+ Add" sit in **Not under a
  line** at the end.
- No "Nothing this week" per line: lines you don't open are left alone.

**Step 2 (Week only): Give them a day.** The week's days with what is already on
them, and everything on the week without a day. Tap an item, tap a day. What is
left stays on the week with "No day yet".

**Drop something in** sits on every planning screen. Symphony files it under its
line, or in Not under a line, through the change card.

Month, Season and Year run step 1 against their own level above (Fall for
October, 2026 for Fall). Year has no level above, so its step 1 is leftovers and
Not under a line.

## Every page shows the label

Month, Season and Year pages show each line's steps with their "planned for"
label (Done / This week · Tue / October), so the level above shows how far each
line has come down.

## Stages

1. Week: step 1 (All at once), step 2, the pull-down verb, subtasks on planning
   pages, Break it down, Drop something in. "Plan this week" opens it.
2. Month, Season, Year: step 1 on the same component; labels on their pages.
3. One at a time.

All three built 2026-10-19 (branch `claude/plan-everywhere`):

- `src/lib/planning/chooseFromAbove.ts` — the tree, the "planned for" labels,
  and Drop something in's matcher (shared words with a line or its steps; a tie
  files under nothing). Not the change card: no model call.
- `src/components/plan/choose/` — `ChoosePlan` (both views), `GiveThemADay`,
  `PlanWeekFlow`. `useChooseWeek` binds the week's verbs; `ConstellationPage`
  binds Month, Season and Year's.
- The deck (`Deck`, `DeckCardView`) and the one-page `PeriodPlan` are removed.
  The deck's writers (`useDeckActions`), its opening sweep of stale items and
  its week strip stay. Finishing sends last week's unanswered leftovers that
  are on October back to October; the rest go to Later as before.
- `withPlacedSubtasks` draws a subtask with its own week or day on the Week page.
- Year goals stand in as lines on Season; their steps are the season items made
  for them (`goalId`, no `sourceId`). "Back to 2026" ends the season commitment,
  so a step with nothing else holding it shows in the Inbox as well.
- Month, Season pages name a line's subtask steps that are on the period below
  alongside its linked lines ("This week: …", "In October: …").
