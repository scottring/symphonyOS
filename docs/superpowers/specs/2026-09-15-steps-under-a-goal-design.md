# Steps under a goal

**Date:** 2026-09-15
**Status:** design, awaiting approval
**Destination:** `docs/superpowers/specs/2026-09-15-steps-under-a-goal-design.md`

## The problem

A goal on a month or season list is an outcome with nothing beneath it. "Transform
the porch" sits on September's list; "hang plants" and "buy new chairs" sit on the
same list beside it, as unrelated rows. Nothing says they belong to it, so the goal
carries no work and the work carries no reason.

`/month` and `/season` already render two cards — a Goals card and a list card — with
no link between them. The lineage columns for a link half-exist (`source_id`,
`goal_id`) but no writer on these pages ever points a task at a goal.

## What a goal is at each altitude

- **Month and season:** a task row with `is_goal` set. "An outcome you tick, never a
  thing you place."
- **Year:** a row in the `goals` table (life area, year, status), with its own page at
  `/goals/:id` that already gathers tasks via `goal_id`.

These are different species. This design touches **month and season only**. Year goals
keep `goal_id` and their own surface, unchanged.

## The link

A new nullable column on `tasks`:

```sql
alter table tasks add column goal_task_id uuid references tasks(id) on delete set null;
create index tasks_goal_task_id_idx on tasks(goal_task_id) where goal_task_id is not null;
```

It names the `is_goal` task row a step serves.

**Why not an existing column:**

- `source_id` means "copied down from." `lineage.ts#livePlacedCopyOf` already has to
  separate *copy-of* from *child-of* by comparing titles, a hack its own comment
  apologizes for. Real children would make that ambiguity load-bearing.
- `parent_task_id` is Today's grouping key (`groupTasks`, `grouping.ts`, `todayDrop`,
  card-onto-card peer groups). Steps would start rendering as Today groups.
- `goal_id` points at the `goals` table — the year-goal link, deliberately untouched.

**Inheritance.** Copy-down carries `goal_task_id` onto the copy, so a step taken to a
week or a day still knows its goal. This is the same write path that already carries
`goal_id`.

**RLS.** No new policy. A step is an ordinary task row and is already covered; verify
against the live policies rather than trusting migrations, and confirm that a step
whose goal belongs to another member is not made visible by the join.

## Behaviour

**Ticking.** A goal is ticked by hand. Finishing every step does not complete it —
three steps done is not a transformed porch. No progress bar, no count on the goal row.

**Placing a step.** Unchanged from today's model: taking a step down a rung copies it,
the original stays under the goal wearing its `→ this week` chip, and the look-back
still sees the whole plan.

**Carry-forward.** `keepForward` on a goal also stamps the next `monthStart` /
`seasonStart` onto its **open** steps, so the goal arrives in October whole. Completed
steps stay behind as September's record.

**Deleting a goal.** `on delete set null` — its steps survive as loose rows on the
period list. Losing a goal must never lose the work.

## Surfaces

**Month / season page.** The two cards stay separate; a mixed list with an icon on some
rows "didn't say which was which" (existing comment, and still right). Goal rows in the
Goals card expand in place to show their steps, each with its placement chip, and an
inline **+ Add a step** beneath.

```
THIS MONTH — September
┌─ GOALS ──────────────────────────┐
│ ▾ ◎ Transform the porch          │
│      ○ Hang plants   → this week │
│      ○ Buy new chairs            │
│      + Add a step                │
│   ◎ Get back to swimming         │
└──────────────────────────────────┘
┌─ LIST ───────────────────────────┐
│   ○ Renew car registration       │
│   ○ Call the roofer   ⋯ [under ◎]│
└──────────────────────────────────┘
```

Expansion state is per-goal and local (see `foldState.ts` for the page's existing
pattern).

**A step renders once.** A row with `goal_task_id` set appears under its goal and is
filtered out of the list card. `selectPeriodTasks` still returns it (the look-back and
the period's record need it); the split between goal rows, steps and loose rows happens
in `goalSteps.ts`.

**Two ways in.** `+ Add a step` on an expanded goal is primary. Loose rows in the list
card get one additional verb, **Put it under a goal**, shown only when the period has
at least one goal — you write "call the roofer" and only then realize it is porch work.
The verb opens a small menu of that period's goals; picking one stamps `goal_task_id`
and the row moves up into the Goals card.

**Today and /week.** A step carries a quiet goal line under its title, resolved from
`goal_task_id`. Planning a task for today preserves its broader commitment. No counts.

## Units

- `src/lib/planning/goalSteps.ts` — pure: given tasks, group steps under their goals;
  answer "which steps carry forward with this goal." Testable without rendering.
- `PlanRow` — gains an expanded state and a steps slot; stays presentational.
- `keepForward` in `useSupabaseTasks` — extends to the goal's open steps.
- Today's row renderer — reads the goal line; no change to grouping.

## Testing

- A child is not a copy: a step with a different title under a goal must not be
  mistaken for a placed copy (the `livePlacedCopyOf` title-match regression).
- Placing a step twice does not duplicate it.
- Carry-forward moves open steps, leaves completed ones behind.
- Deleting a goal leaves its steps on the list.
- Today renders the goal line for a step and nothing for a loose task.
- Privacy: a step does not become visible through its goal. Verify with two real
  authenticated accounts, not mocked filters.

## Out of scope

No progress bars or counts. No `/year` change. No changes to `/goals/:id` or
`GoalChapters`. No drag-a-task-into-a-goal. No nesting deeper than one level — a step
does not get steps.

## Open

Whether a step should be allowed to outlive its period independently of its goal
(today a step keeps its own `monthStart`). Current answer: yes, it is an ordinary task
row; carry-forward is the only place the goal moves it.
