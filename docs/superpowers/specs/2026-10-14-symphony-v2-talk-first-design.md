# Symphony v2, talk first: the change card and Week

2026-10-14. Approved mockup: https://claude.ai/artifact/WC78LdmFCEAh8hA8ooMw24
(four frames, Week before and after). Direction:
`docs/planning/2026-10-13-symphony-v2-planning-by-conversation.md`.

## What we are doing and why

Symphony's weak layer is the editing machinery: trays, menus, mode switches,
step-by-step sessions. Routine data rotted because changing it meant operating
that machinery. One conversation on 2026-10-13 fixed every weekday and weekend
routine in under an hour. So every main screen moves to four blocks:

1. **The picture.** The page shows what is true and is mostly for looking.
2. **The conversation.** The docked bar is how you change several things.
3. **The change card.** Symphony's proposal: one list, previewed dashed on the
   page, one Approve, one Undo.
4. **The item panel.** Notes, people, links and places for one thing. Unchanged.

One-item edits stay direct: tick done, drag to another day, tap to open. The
picture must work for someone who never talks to it.

## The order of work

Each stage gets its own mockup, approval and spec. This document covers stages
1 and 2 in full.

| # | Stage | What changes |
|---|---|---|
| 1 | **Change card** | Shared: proposal format, card, dashed preview, one atomic apply, one Undo |
| 2 | **Week** | The page becomes the picture; "Plan the rest of my week" runs the loop |
| 3 | **Routines** | A picture of the household rhythm; change several routines by talking; the editor modes and the tend drawer go |
| 4 | **Today** | Same trim; the review drawer, duplicate sweep and "proposed order" become asks that end in a card |
| 5 | **Month, Season, Year, Inbox** | Light pass: the bar and the card ("sort my inbox") |

The wall reuses the card later for voice requests that touch several things.

## Stage 1: the change card

### What exists today (origin/main, 5fa18d5c)

- The bar sends a turn to `symphony-agent`. Streamed events reach
  `CanvasActivityContext` through `ShellLayout`'s turn observer.
- The agent **writes directly** with `symphony_create_task` and
  `symphony_update_task`. Undo comes from a before/after diff of the turn. It is
  withheld when any change is a removal or touches a field outside
  `TASK_RESTORABLE`, and `bucket` is not in that list.
- `symphony_propose_plan_items` proposes only goals and goal links. It has no
  dates, moves or someday. "Keep all" on the Plan page is a loop of separate
  writes: not atomic, and not one Undo.
- `src/lib/tend/types.ts` already names the right operations (`place`,
  `regrade`, `put_aside`, `merge`), but nothing uses them.

### The design

**A change set** is one proposal: a short title ("6 changes to your week") and
a list of operations. Version 1 operations, tasks only:

| Op | Fields | Card wording |
|---|---|---|
| `place` | `task_id`, `date`, `time?` | MOVE · Reply to Christian → Today 9:00 |
| `unplace` | `task_id` | MOVE · Paper mail → No day yet |
| `add` | `title`, `date?`, `time?`, `assignee?`, `goal_id?` | ADD · Hold for WSWMD → Today 1:00 |
| `someday` | `task_id` | LATER · Washing machine → Someday |
| `assign` | `task_id`, `assignee` | WHO · Kids clean rooms → Ella, Kaleb |

There is deliberately no delete. Dropping something means Someday. Deleting
stays a one-item action in the item panel. Routine operations arrive in
stage 3, and calendar writes stay out until Google Calendar Undo is solved.

**Pieces:**

1. **Agent tool `symphony_propose_changes`** (`symphony-agent/canvasEvents.ts`,
   next to the existing propose tool). It validates each op: the task exists
   and belongs to the household, dates are real, at most 40 ops. It streams one
   `change_set` event and writes nothing.
2. **Prompt rule.** A request that changes more than one item ends in
   `symphony_propose_changes`. A single item is still written directly with
   Undo, as now. The agent never writes during a planning conversation.
3. **Client state.** `CanvasActivityContext` holds one `pendingChangeSet` at a
   time. A new proposal replaces the old one, and the card says so. Navigating
   away keeps it until it is approved or dismissed.
4. **`ChangeCard` component** (`src/components/canvas/ChangeCard.tsx`). It sits
   in the docked bar's expanded area, beside the conversation, and shows one row
   per op: a kind label, the title, and where it goes. It has **Approve all N**
   and **Dismiss**, and "say what to change" sends a normal turn that returns a
   revised set. No per-row toggles in v1: you correct the set by talking.
5. **Dashed preview.** Pages read `pendingChangeSet` and draw the affected items
   where they would land, with a dashed teal border on the proposal fill.
   Week is first (stage 2).
6. **All-or-nothing apply, through the app's own writers.** Approve runs each
   op through the same task writers the page's gestures use (`updateTask`,
   `addTask`), which already apply the placement rules (commitments, week and
   month stamps) and the privacy scope. Before writing anything it checks
   each task's `updated_at` against what Symphony saw, and refuses the whole
   set if one has moved. If a write fails part way, the ones already saved are
   put back. One Undo reverses the lot, newest first, through
   `CanvasActivityContext.run`. *(Changed while planning, 2026-10-14: a
   single Postgres function would have had to re-implement the client's
   placement planner. The visible behaviour is the same: all saved, or
   nothing changed.)*

**Errors.** If validation fails on the server, the agent gets the reason and
revises. If apply fails, nothing changes, and the card stays with "Couldn't
save. Nothing was changed. Try again." If an item changed in the meantime,
apply refuses with "Reply to Christian changed since I proposed this", and the
person asks for a fresh set.

### Testing

- Unit: op validation, card wording per op, and that the inverse of every op
  restores the before-values.
- Apply: all-or-nothing when a write fails part way, refusal when an item
  changed since the proposal, round-trip apply then Undo.
- Privacy, with real signed-in accounts (Scott and Iris): a set cannot touch
  the other person's private Work or Personal tasks, and the dashed preview
  shows only what the viewer may see.
- Component: the card renders, Approve calls apply once, and Undo appears after.
- Agent: a scripted turn ("move these three to Thursday") produces one
  `change_set` and no writes.

## Stage 2: Week

### The picture

Matching mockup frame "After 1":

- **Header:** the period and one plain sentence about the week, for example
  "Today: CEPI food-contact meeting. Thursday is wide open. Friday is the full
  one." The sentence comes from fixed rules over the week's own data, not
  from the model (rules decide, Symphony assists). With nothing to say, the
  header shows just the period. *(Changed while planning, 2026-10-14: the
  mockup's sentence read like the model wrote it; rules keep it reliable and
  free.)*
- **Days:** as now: events, routines, tasks, faces, free time, with past days
  stepped back.
- **No day yet:** one quiet line of the week's tasks with no day, in place of
  the tray. A task can be dragged from it onto a day, as now.
- **Rows:** tick done, drag, and tap to open the item panel. The panel already
  has people, life area and goal, so the row ⋯ menu goes.

**Removed:** the still-to-place tray (`weekShelf.ts` keeps feeding the No day
yet line), the Days/Hours switch and Hours mode (`WeekGrid.tsx`, including
drag-to-create and the routine placer), the row ⋯ menu, and the 8-step session
(`WeekStepScreen.tsx`, `WeekStepPanels.tsx`, the step list in `WeekV2.tsx`).

### Plan the rest of my week

A chip in the docked bar reads **Plan the rest of my week**, or **Plan the week**
on the first day of the week. Tapping it, or saying it, starts the loop:

1. **Symphony reads first.** A new tool `symphony_read_week(start)` returns, in
   one call: each day's events, routines and tasks, the No day yet tasks, last
   week's unfinished tasks, inbox count and titles, and the scratchpad's talk-abouts.
   The agent may also search email (school, ClassDojo) as it does today.
2. **It describes the week plainly** and asks only about gaps and conflicts,
   one or two questions at a time. There is no fixed questionnaire.
3. **The person answers** in their own words.
4. **One change set**, previewed dashed on the week, then Approve, then Undo.
5. **The page shows what is now true.**

Rules carried over: Symphony structures and never supplies. It never invents
goals. Month, Season and Year are reference only, mentioned only when
something clearly fits.

### Testing

- `WeekCanvas` renders dashed rows from a change set, and the No day yet line
  drops a task the set places.
- Removed controls are gone (the tests that covered them are deleted with
  them). Drag, tick and tap still work.
- `symphony_read_week` returns the right days for a Saturday-start week.
- A browser walkthrough on Scott's real week before it ships: plan the rest of
  the week, approve, Undo, approve again.

## The page follows the conversation (added 2026-10-14)

Scott: "the idea was to create an adaptive, dynamic canvas that responds and
updates in real time to conversations." Two pieces join this work:

- **Symphony points.** When it describes or asks about specific days or
  tasks, they light up on the page (a teal halo, the Symphony colour). A new
  tool, `symphony_point`, changes no data; the highlight clears on the next
  turn. On a phone, pointing at one day selects that day.
- **The week rebuilds as you answer.** While planning, Symphony proposes the
  change list as soon as one answer settles something, and revises the whole
  list after each later answer. The dashed rows and the card update in place;
  you approve whenever you're ready.

Later, with its own mockup: the layout itself rearranges around the
conversation (the day being discussed opens up, the rest steps back).

## How it ships

1. **PR 1, change card:** the tool, the prompt rule, the apply step, the
   context state and the card in the bar. Week stays as it
   is, but the card already works there for "move these three to Thursday".
2. **PR 2, Week picture:** dashed preview, header sentence, No day yet line,
   `symphony_read_week`, the bar chip.
3. **PR 3, removal:** the tray, Hours mode, the ⋯ menu, the 8 steps and their
   tests. This is separate, so it can wait a week of real use if wanted.

4. **PR 4, live canvas:** `symphony_point`, the halo on Week, and the
   propose-early-and-revise prompt.

Each PR goes through review and CI, and production deploys wait for Scott's OK.

## Open points, decided here unless Scott says otherwise

- **Hours mode goes.** The mockup drops it. If timed planning is missed, it
  comes back as something you ask for ("show Thursday by the hour").
- **"Hold" is an ordinary timed task,** not a tentative calendar event, until
  calendar writes are undoable.
- **No per-row toggles on the card in v1.** You correct the set by talking.
