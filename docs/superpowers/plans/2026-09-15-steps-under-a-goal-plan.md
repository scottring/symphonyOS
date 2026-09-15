# Steps Under a Goal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a month or season goal hold the concrete tasks that serve it — "hang plants" under "Transform the porch" — so a goal carries work and the work carries its reason.

**Architecture:** One new nullable column, `tasks.goal_task_id`, pointing at the `is_goal` task row a step serves. A pure model (`goalSteps.ts`) splits a period's rows into goals, their steps, and loose tasks; `PlanRow` gains an expanded state; `keepForward` carries a goal's open steps into the next period; Today renders a quiet goal line under a step's title.

**Tech Stack:** React 19 + TS strict, Vite 7, Tailwind v4, Supabase (Postgres + RLS), Vitest.

**Spec:** `2026-09-15-steps-under-a-goal-design.md` (scratchpad; moves to `docs/superpowers/specs/` when git is usable)

## Global Constraints

- Node 22.14.0. Check `node -v` FIRST. PATH fix if needed:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- `npm test` is WATCH mode — always run `npx vitest run <path>`.
- Typecheck is `npx tsc --noEmit -p tsconfig.app.json`. Root `tsc --noEmit` is a NO-OP.
- Never edit, commit, or switch branches in the main worktree. Work in a fresh worktree off a freshly fetched `origin/main`.
- `@/` imports from `src/`. Nordic Journal styling from `src/index.css`. No emoji — lucide icons.
- Never partial-`upsert` `tasks` — use `.update().eq()`.
- Month and season ONLY. `/year`, the `goals` table, `/goals/:id` and `GoalChapters` are out of scope.
- No counts, progress bars, or scoreboards on any goal row.
- DDL goes through the Management API `POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`; the classifier blocks that curl in auto mode, and afterwards you must `notify pgrst` to reload the schema cache.

---

### Task 0: Unblock the toolchain

**Files:** none (environment)

- [ ] **Step 1: Agree the Xcode licence**

`git` is currently returning "You have not agreed to the Xcode license agreements" for every invocation, which blocks fetch, branch, worktree and commit.

Run: `sudo xcodebuild -license`
Expected: licence agreed; `git --version` then prints a version.

- [ ] **Step 2: Create the worktree**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git fetch origin
git worktree add .worktrees/goal-steps -b feat/goal-steps origin/main
cd .worktrees/goal-steps
cp ../../.env .env    # a worktree without .env renders a blank screen
npm install
```

- [ ] **Step 3: Move the spec into the repo**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/1d6f5164-7892-42c4-b149-c8c764a21136/scratchpad/2026-09-15-steps-under-a-goal-design.md docs/superpowers/specs/
cp /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/1d6f5164-7892-42c4-b149-c8c764a21136/scratchpad/2026-09-15-steps-under-a-goal-plan.md docs/superpowers/plans/
git add docs/superpowers && git commit -m "docs: spec and plan for steps under a goal"
```

---

### Task 1: The column, the type, the mapping

**Files:**
- Migration: `supabase/migrations/20260915000000_goal_task_id.sql`
- Modify: `src/types/task.ts` (add `goalTaskId`, near `sourceId`/`goalId` at ~line 122)
- Modify: `src/hooks/useSupabaseTasks.ts` (row type ~line 97, `mapDbTask` ~line 180, `addTask` insert ~line 708, both `dbUpdates` blocks ~1356 and ~1548, `copyDown` ~1132)
- Modify: `src/hooks/useSupabaseTasks.ts` — `AddTaskOptions`
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Task.goalTaskId?: string`; `AddTaskOptions.goalTaskId?: string`; `updateTask(id, { goalTaskId })` writes `goal_task_id`; `copyDown` carries `goalTaskId` onto the copy.

- [ ] **Step 1: Write the failing tests**

Add to `src/hooks/useSupabaseTasks.test.ts`:

```ts
it('maps goal_task_id onto the task', () => {
  const task = mapDbTask({ ...dbTaskFixture, goal_task_id: 'goal-1' })
  expect(task.goalTaskId).toBe('goal-1')
})

it('addTask writes goal_task_id when a step names its goal', async () => {
  const { result } = renderHook(() => useSupabaseTasks(), { wrapper })
  await act(async () => {
    await result.current.addTask('Hang plants', undefined, undefined, undefined, {
      bucket: 'month',
      monthStart: new Date(2026, 8, 1),
      goalTaskId: 'goal-1',
    })
  })
  expect(insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({ goal_task_id: 'goal-1' }),
  )
})

it('a copy taken down a rung keeps the goal it serves', async () => {
  const { result } = renderHook(() => useSupabaseTasks(), { wrapper })
  await act(async () => {
    await result.current.pushTask('step-1', 'week')   // step-1 has goalTaskId 'goal-1'
  })
  expect(insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({ goal_task_id: 'goal-1', source_id: 'step-1' }),
  )
})
```

Match the file's existing fixture and spy names — read the top of `useSupabaseTasks.test.ts` and reuse them rather than inventing `dbTaskFixture`/`insertSpy` if they are called something else.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — `goalTaskId` is not a property; `goal_task_id` not in the insert payload.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260915000000_goal_task_id.sql`:

```sql
-- A step serves a goal. The goal is an is_goal task row on the same month or
-- season list. Losing a goal must never lose the work, so the step survives as
-- a loose row (set null), never cascades.
alter table public.tasks
  add column if not exists goal_task_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_goal_task_id_idx
  on public.tasks(goal_task_id)
  where goal_task_id is not null;

comment on column public.tasks.goal_task_id is
  'The is_goal task row this step serves (month/season only). Distinct from source_id (copied-down-from) and goal_id (the annual goals-table row).';
```

Apply it through the Management API, then reload PostgREST:

```bash
# token from keychain — see reference_supabase_management_token
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'SQL'
{"query": "alter table public.tasks add column if not exists goal_task_id uuid references public.tasks(id) on delete set null; create index if not exists tasks_goal_task_id_idx on public.tasks(goal_task_id) where goal_task_id is not null;"}
SQL
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "notify pgrst, '\''reload schema'\''"}'
```

- [ ] **Step 4: Add the type**

In `src/types/task.ts`, immediately after `goalId` (~line 125):

```ts
  /** The month/season GOAL this task serves — an is_goal task row on the same
   *  list. Distinct from sourceId (copied down FROM) and goalId (the annual
   *  goals-table row): this one says "belongs under", and it is what lets a
   *  goal hold the work that serves it. One level only; a step has no steps. */
  goalTaskId?: string
```

- [ ] **Step 5: Wire the hook**

In `src/hooks/useSupabaseTasks.ts`:

Row type (beside `goal_id`, ~line 98):
```ts
  goal_task_id: string | null
```

`mapDbTask` (beside `goalId`, ~line 181):
```ts
    goalTaskId: dbTask.goal_task_id ?? undefined,
```

`AddTaskOptions` — add `goalTaskId?: string`.

`addTask` insert payload (beside `goal_id`, ~line 709):
```ts
        goal_task_id: options?.goalTaskId ?? null,
```

Both `dbUpdates` blocks (~1357 and ~1549), beside the `goalId` line:
```ts
    if ('goalTaskId' in updates) dbUpdates.goal_task_id = updates.goalTaskId ?? null
```

`copyDown` (~line 1145, beside `goalId: original.goalId`):
```ts
      // A copy serves the same goal as the row it came from — that is how a
      // step taken down to a week still knows what it is for.
      goalTaskId: original.goalTaskId,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add supabase/migrations src/types/task.ts src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(goals): a task can name the goal it serves"
```

---

### Task 2: The pure model — `goalSteps.ts`

**Files:**
- Create: `src/lib/planning/goalSteps.ts`
- Test: `src/lib/planning/goalSteps.test.ts`

**Interfaces:**
- Consumes: `Task` from `@/types/task`; `PlacementFate`, `placementFate` from `@/lib/planning/lineage`.
- Produces:
  - `splitGoalRows(rows: readonly Task[]): { goals: Task[]; stepsByGoal: Map<string, Task[]>; loose: Task[] }`
  - `stepsThatCarryForward(goalId: string, tasks: readonly Task[]): Task[]`
  - `goalTitleMap(tasks: readonly Task[]): Map<string, string>`

- [ ] **Step 1: Write the failing tests**

`src/lib/planning/goalSteps.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitGoalRows, stepsThatCarryForward, goalTitleMap } from './goalSteps'
import { livePlacedCopyOf } from './lineage'
import type { Task } from '@/types/task'

const t = (over: Partial<Task>): Task => ({
  id: 'x', title: 'x', completed: false, createdAt: new Date(2026, 8, 1),
  bucket: 'month', ...over,
} as Task)

const goal = t({ id: 'g1', title: 'Transform the porch', isGoal: true })
const step = t({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' })
const loose = t({ id: 'l1', title: 'Renew car registration' })

describe('splitGoalRows', () => {
  it('files a step under its goal and keeps it out of the loose list', () => {
    const { goals, stepsByGoal, loose: rest } = splitGoalRows([goal, step, loose])
    expect(goals.map((g) => g.id)).toEqual(['g1'])
    expect(stepsByGoal.get('g1')?.map((s) => s.id)).toEqual(['s1'])
    expect(rest.map((r) => r.id)).toEqual(['l1'])
  })

  it('a step whose goal is not on this list falls back to loose', () => {
    const orphan = t({ id: 's2', title: 'Buy chairs', goalTaskId: 'gone' })
    const { stepsByGoal, loose: rest } = splitGoalRows([goal, orphan])
    expect(stepsByGoal.get('g1')).toEqual([])
    expect(rest.map((r) => r.id)).toEqual(['s2'])
  })

  it('never nests a step under a step', () => {
    const nested = t({ id: 's3', title: 'Nested', goalTaskId: 's1' })
    const { stepsByGoal, loose: rest } = splitGoalRows([goal, step, nested])
    expect(stepsByGoal.has('s1')).toBe(false)
    expect(rest.map((r) => r.id)).toEqual(['s3'])
  })

  it('orders goals then steps by creation, oldest first', () => {
    const older = t({ id: 's0', title: 'Older', goalTaskId: 'g1', createdAt: new Date(2026, 7, 1) })
    const { stepsByGoal } = splitGoalRows([goal, step, older])
    expect(stepsByGoal.get('g1')?.map((s) => s.id)).toEqual(['s0', 's1'])
  })
})

describe('stepsThatCarryForward', () => {
  it('takes open steps and leaves finished ones behind', () => {
    const done = t({ id: 's2', title: 'Painted', goalTaskId: 'g1', completed: true })
    expect(stepsThatCarryForward('g1', [goal, step, done]).map((s) => s.id)).toEqual(['s1'])
  })

  it('leaves a step behind once it has been placed lower', () => {
    const placed = t({ id: 's4', title: 'Hang plants', goalTaskId: 'g1' })
    const copy = t({ id: 'c1', title: 'Hang plants', bucket: 'week', sourceId: 's4', createdAt: new Date(2026, 8, 2) })
    expect(stepsThatCarryForward('g1', [goal, placed, copy]).map((s) => s.id)).toEqual([])
  })
})

describe('goalTitleMap', () => {
  it('names every goal, and nothing else', () => {
    const m = goalTitleMap([goal, step, loose])
    expect(m.get('g1')).toBe('Transform the porch')
    expect(m.has('s1')).toBe(false)
    expect(m.has('l1')).toBe(false)
  })

  it('is empty when the reader can see no goals', () => {
    expect(goalTitleMap([step]).size).toBe(0)
  })
})

describe('placing a step twice', () => {
  it('does not mint a second copy', () => {
    // The guard lives in livePlacedCopyOf; this pins that a STEP is subject to
    // it too, so a step dragged to two different days leaves one copy.
    const placed = t({ id: 's6', title: 'Hang plants', goalTaskId: 'g1' })
    const copy = t({ id: 'c2', title: 'Hang plants', bucket: 'week', sourceId: 's6', createdAt: new Date(2026, 8, 3) })
    expect(livePlacedCopyOf(placed, [goal, placed, copy])?.id).toBe('c2')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/planning/goalSteps.test.ts`
Expected: FAIL — "Failed to resolve import ./goalSteps"

- [ ] **Step 3: Write the implementation**

`src/lib/planning/goalSteps.ts`:

```ts
// src/lib/planning/goalSteps.ts
//
// A goal holds the work that serves it. `goal_task_id` names the is_goal row a
// task belongs under; this module is the only place that reads it, so the
// pages stay presentational and the rule lives in one testable spot.
//
// One level only. A step under a step is a hierarchy nobody asked for, and the
// planning cadence already has altitudes — so a goalTaskId pointing at a
// non-goal row is ignored and the row stays loose.

import type { Task } from '@/types/task'
import { placementFate } from './lineage'

const byCreation = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()

/**
 * Split one period's rows into the three things a plan page draws: its goals,
 * the steps filed under each, and the loose tasks that serve no goal.
 *
 * A step renders ONCE — under its goal, never also in the loose list. A step
 * whose goal is not on this list (deleted, or carried to another period ahead
 * of its steps) falls back to loose rather than vanishing: losing a goal must
 * never lose the work.
 */
export function splitGoalRows(rows: readonly Task[]): {
  goals: Task[]
  stepsByGoal: Map<string, Task[]>
  loose: Task[]
} {
  const goals = rows.filter((r) => r.isGoal === true).sort(byCreation)
  const goalIds = new Set(goals.map((g) => g.id))
  const stepsByGoal = new Map<string, Task[]>(goals.map((g) => [g.id, []]))
  const loose: Task[] = []
  for (const row of rows) {
    if (row.isGoal === true) continue
    const parent = row.goalTaskId
    if (parent && goalIds.has(parent)) stepsByGoal.get(parent)!.push(row)
    else loose.push(row)
  }
  for (const steps of stepsByGoal.values()) steps.sort(byCreation)
  loose.sort(byCreation)
  return { goals, stepsByGoal, loose }
}

/**
 * The steps that should travel with a goal when it is kept into the next
 * period. Open work only: a finished step is the period's record and stays
 * where it was done, and a step already placed lower has a copy carrying on
 * without it.
 */
export function stepsThatCarryForward(goalId: string, tasks: readonly Task[]): Task[] {
  return tasks
    .filter((t) => t.goalTaskId === goalId && !t.completed && placementFate(t, tasks) === 'open')
    .sort(byCreation)
}

/**
 * Goal id → title, for the quiet line Today and /week draw under a step.
 *
 * Built from the caller's OWN task list, which RLS has already filtered: a
 * goal the reader may not see is simply not in the map, so its title cannot
 * leak through a step that is shared. Only is_goal rows go in — the same rule
 * splitGoalRows applies, in the same module, so the two cannot drift.
 */
export function goalTitleMap(tasks: readonly Task[]): Map<string, string> {
  return new Map(
    tasks.filter((t) => t.isGoal === true).map((t) => [t.id, t.title] as const),
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/planning/goalSteps.test.ts`
Expected: PASS

- [ ] **Step 5: Guard the copy-vs-child boundary**

`lineage.ts#livePlacedCopyOf` separates a *copy of* a row from a *child of* it by comparing titles — a heuristic its own comment apologises for. `goal_task_id` now carries children explicitly, so that heuristic must not start mis-firing. Add to `src/lib/planning/lineage.test.ts`:

```ts
it('a step is not mistaken for a copy of its goal', () => {
  const goal = makeTask({ id: 'g1', title: 'Transform the porch', bucket: 'month', isGoal: true })
  const step = makeTask({ id: 's1', title: 'Transform the porch', bucket: 'week', goalTaskId: 'g1' })
  // Same title, but the step was never copied FROM the goal: no source_id.
  expect(livePlacedCopyOf(goal, [goal, step])).toBeUndefined()
})
```

Use the file's existing task factory rather than inventing `makeTask` if it is named differently.

- [ ] **Step 6: Run the lineage tests**

Run: `npx vitest run src/lib/planning/lineage.test.ts src/lib/planning/goalSteps.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/planning/goalSteps.ts src/lib/planning/goalSteps.test.ts src/lib/planning/lineage.test.ts
git commit -m "feat(goals): the pure model for steps under a goal"
```

---

### Task 3: `PlanRow` expands to show its steps

**Files:**
- Modify: `src/components/plan/PlanRow.tsx`
- Test: `src/components/plan/PlanRow.test.tsx`

**Interfaces:**
- Consumes: `PlanRowModel` (existing).
- Produces: `PlanRowModel.steps?: PlanRowModel[]`; `PlanRow` props gain `expanded?: boolean`, `onToggleExpand?: (row: PlanRowModel) => void`, `onAddStep?: (row: PlanRowModel, title: string) => void`, `stepActionsFor?: (step: PlanRowModel) => RowAction[]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/plan/PlanRow.test.tsx`:

```tsx
const goalWithSteps: PlanRowModel = {
  id: 'g1', title: 'Transform the porch', isGoal: true, fate: 'open', kind: 'task',
  steps: [
    { id: 's1', title: 'Hang plants', isGoal: false, fate: 'open', kind: 'task' },
    { id: 's2', title: 'Buy new chairs', isGoal: false, fate: 'open', kind: 'task' },
  ],
}

it('hides its steps until it is expanded', () => {
  render(<PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />)
  expect(screen.queryByText('Hang plants')).not.toBeInTheDocument()
})

it('shows its steps when expanded', () => {
  render(<PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded />)
  expect(screen.getByText('Hang plants')).toBeInTheDocument()
  expect(screen.getByText('Buy new chairs')).toBeInTheDocument()
})

it('offers a disclosure only when it has steps or can take them', () => {
  const bare: PlanRowModel = { id: 'g2', title: 'Swim again', isGoal: true, fate: 'open', kind: 'task' }
  render(<PlanRow row={bare} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /steps under Swim again/i })).not.toBeInTheDocument()
})

it('adds a step from the inline form', async () => {
  const onAddStep = vi.fn()
  render(<PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={onAddStep} />)
  const input = screen.getByLabelText(/step for Transform the porch/i)
  await userEvent.type(input, 'Repaint the railing{enter}')
  expect(onAddStep).toHaveBeenCalledWith(goalWithSteps, 'Repaint the railing')
})

it('shows no count on the goal row', () => {
  render(<PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />)
  expect(screen.queryByText('2')).not.toBeInTheDocument()
  expect(screen.queryByText(/0\/2/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/plan/PlanRow.test.tsx`
Expected: FAIL — steps are not rendered; no disclosure; no step form.

- [ ] **Step 3: Extend the model**

In `src/components/plan/PlanRow.tsx`, add to `PlanRowModel`:

```ts
  /** The tasks filed under this goal. Present only on a month/season goal row;
   *  one level deep — a step never carries steps of its own. */
  steps?: PlanRowModel[]
```

- [ ] **Step 4: Render the disclosure and the steps**

Add `ChevronRight` and `ChevronDown` to the lucide import. Extend the props:

```tsx
export function PlanRow({ row, actions, onAction, onOpen, onOpenPlaced, lowerLabel = 'this week',
  expanded = false, onToggleExpand, onAddStep, stepActionsFor,
}: {
  row: PlanRowModel
  actions: RowAction[]
  onAction: (action: RowAction, row: PlanRowModel) => void
  onOpen: (row: PlanRowModel) => void
  onOpenPlaced?: (taskId: string) => void
  lowerLabel?: string
  /** Goal rows only: whether the steps beneath are showing. */
  expanded?: boolean
  onToggleExpand?: (row: PlanRowModel) => void
  onAddStep?: (row: PlanRowModel, title: string) => void
  stepActionsFor?: (step: PlanRowModel) => RowAction[]
}) {
```

A goal that can hold steps gets a disclosure in place of nothing; put it immediately before the `<Target …/>` icon, inside the existing `<li>`:

```tsx
      {canHoldSteps && (
        <button
          type="button"
          aria-label={`${expanded ? 'Hide' : 'Show'} steps under ${row.title}`}
          aria-expanded={expanded}
          onClick={() => onToggleExpand?.(row)}
          className="mt-[3px] shrink-0 text-neutral-400 transition-colors hover:text-neutral-700"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      )}
```

with, above the `return`:

```tsx
  // Only a month/season goal holds steps. A year row is a goals-table entity
  // and a step never nests further, so neither offers a disclosure.
  const canHoldSteps = row.isGoal && row.kind === 'task' && (!!onAddStep || (row.steps?.length ?? 0) > 0)
  const [stepDraft, setStepDraft] = useState('')
```

Then, because the steps render BELOW the row, wrap the existing `<li>` and the new block in a fragment — the steps are their own `<li>` elements in the same `<ul>`, indented, so the list stays flat for a screen reader:

```tsx
  return (
    <>
      <li className="group flex items-start gap-2.5 border-b border-neutral-100 px-2 py-2 transition-colors last:border-0 hover:bg-neutral-50">
        {/* …existing row body, with the disclosure added… */}
      </li>
      {canHoldSteps && expanded && (
        <li className="border-b border-neutral-100 last:border-0">
          <ul className="pl-7">
            {(row.steps ?? []).map((step) => (
              <PlanRow
                key={step.id}
                row={step}
                actions={stepActionsFor?.(step) ?? []}
                onAction={onAction}
                onOpen={onOpen}
                onOpenPlaced={onOpenPlaced}
                lowerLabel={lowerLabel}
              />
            ))}
          </ul>
          {onAddStep && (
            <form
              className="flex items-center gap-2 py-1.5 pl-7 pr-2"
              onSubmit={(e) => {
                e.preventDefault()
                const t = stepDraft.trim()
                setStepDraft('')
                if (t) onAddStep(row, t)
              }}
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <input
                aria-label={`New step for ${row.title}`}
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                placeholder="Add a step"
                className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
              />
            </form>
          )}
        </li>
      )}
    </>
  )
```

Add `useState` to the React import and `Plus` to the lucide import.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/plan/PlanRow.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/plan/PlanRow.tsx src/components/plan/PlanRow.test.tsx
git commit -m "feat(plan): a goal row opens to show the steps under it"
```

---

### Task 4: The month and season pages draw the steps

**Files:**
- Modify: `src/components/plan/PeriodPlanPage.tsx` — `taskRow` (~line 76), `rows` (~line 149), `goalRows`/`openTaskRows`/`doneTaskRows` (~329-334), `act` (~199), `addRow` (~307), the goals `<section>` (~409)
- Modify: `src/lib/planning/periodPage.ts` — `RowAction`, `actionsFor`
- Test: `src/components/plan/PeriodPlanPage.test.tsx`, `src/lib/planning/periodPage.test.ts`

**Interfaces:**
- Consumes: `splitGoalRows` from `@/lib/planning/goalSteps`; `PlanRowModel.steps` and `PlanRow`'s `expanded`/`onToggleExpand`/`onAddStep` from Task 3.
- Produces: `RowAction` gains `'under-goal'`; `addStep(goalId, title)` on the page.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/planning/periodPage.test.ts`:

```ts
it('offers "under a goal" to a loose task only when the period has goals', () => {
  expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, hasGoals: true }))
    .toContain('under-goal')
  expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, hasGoals: false }))
    .not.toContain('under-goal')
})

it('never offers "under a goal" to a goal', () => {
  expect(actionsFor({ fate: 'open', isGoal: true, isPast: false, hasGoals: true }))
    .not.toContain('under-goal')
})
```

Add to `src/components/plan/PeriodPlanPage.test.tsx`:

```tsx
it('draws a step under its goal and not in the task list', async () => {
  renderMonthPage({ tasks: [
    monthTask({ id: 'g1', title: 'Transform the porch', isGoal: true }),
    monthTask({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' }),
    monthTask({ id: 'l1', title: 'Renew car registration' }),
  ] })
  await userEvent.click(await screen.findByRole('button', { name: /Show steps under Transform the porch/i }))
  const goalsCard = screen.getByRole('region', { name: /goals/i })
  expect(within(goalsCard).getByText('Hang plants')).toBeInTheDocument()
  const listCard = screen.getByRole('region', { name: /list/i })
  expect(within(listCard).queryByText('Hang plants')).not.toBeInTheDocument()
  expect(within(listCard).getByText('Renew car registration')).toBeInTheDocument()
})

it('adding a step writes the goal it serves', async () => {
  const { addTask } = renderMonthPage({ tasks: [monthTask({ id: 'g1', title: 'Transform the porch', isGoal: true })] })
  await userEvent.click(await screen.findByRole('button', { name: /Show steps under Transform the porch/i }))
  await userEvent.type(screen.getByLabelText(/New step for Transform the porch/i), 'Buy new chairs{enter}')
  expect(addTask).toHaveBeenCalledWith('Buy new chairs', undefined, undefined, undefined,
    expect.objectContaining({ bucket: 'month', goalTaskId: 'g1' }))
})
```

Reuse the file's existing render helper and task factory — read the top of `PeriodPlanPage.test.tsx` and match its names rather than inventing `renderMonthPage`/`monthTask`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/plan/PeriodPlanPage.test.tsx src/lib/planning/periodPage.test.ts`
Expected: FAIL — no disclosure button; the step renders in the list card.

- [ ] **Step 3: Add the verb**

In `src/lib/planning/periodPage.ts`, extend the union:

```ts
  /** File a loose row under one of the period's goals. You write "call the
   *  roofer" and only then realise it is porch work. */
  | 'under-goal'
```

and `actionsFor` — add `hasGoals` to the parameter object (default `false`) and insert the verb for an open, non-goal, non-past row:

```ts
export function actionsFor(
  { fate, isGoal, isPast, level = 'month', hasGoals = false }:
  { fate: PlacementFate; isGoal: boolean; isPast: boolean; level?: PlanLevel; hasGoals?: boolean },
): RowAction[] {
  if (fate === 'done' || fate === 'placed-done') return []
  if (fate === 'placed-open') return isPast ? ['keep', 'drop'] : []
  const kind: RowAction = isGoal ? 'make-task' : 'make-goal'
  const canDescend = !isGoal && level !== 'year'
  const underGoal: RowAction[] = !isGoal && hasGoals ? ['under-goal'] : []
  if (!isPast) {
    return canDescend
      ? ['complete', 'to-lower', 'today', ...underGoal, kind, 'drop']
      : ['complete', ...underGoal, kind, 'drop']
  }
  return isGoal ? ['complete', 'keep', kind, 'drop'] : ['complete', 'keep', 'someday', kind, 'drop']
}
```

Add its label and icon in `PlanRow.tsx`'s `ACTION_LABEL` (`'under-goal': 'Put it under a goal'`) and `ActionIcon` (`Target`).

- [ ] **Step 4: Split the rows on the page**

In `PeriodPlanPage.tsx`, carry `goalTaskId` into the row model — extend `taskRow` to set `steps` later, and replace the `goalRows`/`openTaskRows`/`doneTaskRows` memos with a split that uses the pure model:

```tsx
  // A step renders ONCE, under its goal. selectPeriodTasks still returns it —
  // the look-back and the period's record need the whole list — so the split
  // happens here, in the one place that knows about goalSteps.
  const split = useMemo(() => {
    if (level === 'year') return null
    const periodTasks = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons)
    return splitGoalRows(periodTasks)
  }, [level, layered, bounds.start, isCurrent, meId, seasons])

  const goalRows = useMemo(() => {
    if (!split) return rows.filter((r) => r.isGoal)
    return split.goals.map((g) => ({
      ...taskRow(g, tasks),
      steps: (split.stepsByGoal.get(g.id) ?? []).map((s) => taskRow(s, tasks)),
    }))
  }, [split, rows, tasks])

  const looseRows = useMemo(() => (split ? split.loose.map((t) => taskRow(t, tasks)) : []), [split, tasks])
  const openTaskRows = useMemo(() => looseRows.filter((r) => !rowIsDone(r.fate)), [looseRows])
  const doneTaskRows = useMemo(() => looseRows.filter((r) => rowIsDone(r.fate)), [looseRows])
```

Import `splitGoalRows` from `@/lib/planning/goalSteps`.

- [ ] **Step 5: Wire expansion, adding, and the new verb**

Expansion state, using the page's existing fold convention:

```tsx
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())
  const toggleGoal = useCallback((row: PlanRowModel) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.add(row.id)
      return next
    })
  }, [])
```

Adding a step reuses `addRow`'s writer:

```tsx
  const addStep = useCallback(async (goal: PlanRowModel, title: string) => {
    const t = title.trim()
    if (!t) return
    await addTask(t, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter',
      monthStart: level === 'month' ? bounds.start : undefined,
      seasonStart: level === 'season' ? bounds.start : undefined,
      goalTaskId: goal.id,
      context: soleDomain,
    })
  }, [level, bounds.start, soleDomain, addTask])
```

In `act`, handle the new verb by opening a picker of this period's goals:

```tsx
    else if (action === 'under-goal') setPickingGoalFor(row.id)
```

State and writer:

```tsx
  const [pickingGoalFor, setPickingGoalFor] = useState<string | null>(null)

  const fileUnderGoal = useCallback(async (taskId: string, goalId: string) => {
    setPickingGoalFor(null)
    await gated.updateTask(taskId, { goalTaskId: goalId })
    // Open the goal you just filed into, or the row appears to vanish from the
    // list card with nowhere visible to have gone.
    setExpandedGoals((prev) => new Set(prev).add(goalId))
  }, [gated])
```

The menu, rendered once at the end of the list `<section>` (not per row — one
instance, the way PinsContext is one instance):

```tsx
  {pickingGoalFor && (
    <div
      role="dialog"
      aria-label="Put it under a goal"
      className="mt-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm"
    >
      <p className="px-2 py-1 text-[12px] text-neutral-500">Put it under…</p>
      <ul>
        {goalRows.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => { void fileUnderGoal(pickingGoalFor, g.id) }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
            >
              <Target className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{g.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setPickingGoalFor(null)}
        className="mt-1 px-2 py-1 text-[12px] text-neutral-500 transition-colors hover:text-neutral-800"
      >
        Cancel
      </button>
    </div>
  )}
```

Pass the new props at the goal `<section>`'s `PlanRow`:

```tsx
                    <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced}
                      onAction={(a, r) => { void act(a, r) }}
                      lowerLabel={lowerLabelText}
                      expanded={expandedGoals.has(row.id)}
                      onToggleExpand={toggleGoal}
                      onAddStep={isPast ? undefined : (g, t) => { void addStep(g, t) }}
                      stepActionsFor={(s) => actionsFor({ fate: s.fate, isGoal: false, isPast, level })}
                      actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
```

and pass `hasGoals={goalRows.length > 0}` into `actionsFor` for the list card's rows.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/plan/PeriodPlanPage.test.tsx src/lib/planning/periodPage.test.ts src/components/plan/PlanRow.test.tsx`
Expected: PASS

- [ ] **Step 7: Check it in the browser, including narrow**

```bash
npm run dev
```
Open `/month`. Confirm: a goal with no steps still shows a disclosure (it can take one); expanding shows steps with their placement chips; a step does not also appear in the task list; the goals card does not show any count. Then narrow the window to ~390px and confirm the indented steps and the step input still fit without horizontal scroll.

- [ ] **Step 8: Commit**

```bash
git add src/components/plan src/lib/planning/periodPage.ts src/lib/planning/periodPage.test.ts
git commit -m "feat(plan): month and season goals hold the steps that serve them"
```

---

### Task 5: Keeping a goal keeps its open steps

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` — `keepForward` (~line 1163)
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Consumes: `stepsThatCarryForward` from `@/lib/planning/goalSteps`; `copyDown` (existing, in-module).
- Produces: `keepForward` unchanged in signature; a goal's copy now has its open steps copied beneath it.

- [ ] **Step 1: Write the failing tests**

```ts
it('keeping a goal brings its open steps into the next period', async () => {
  // g1 (is_goal, September) with steps s1 (open) and s2 (completed)
  const { result } = renderHook(() => useSupabaseTasks(), { wrapper })
  await act(async () => {
    await result.current.keepForward('g1', { monthStart: new Date(2026, 9, 1) })
  })
  const inserted = insertSpy.mock.calls.map((c) => c[0])
  const goalCopy = inserted.find((r) => r.title === 'Transform the porch')
  const stepCopy = inserted.find((r) => r.title === 'Hang plants')
  expect(goalCopy).toMatchObject({ is_goal: true, month_start: '2026-10-01' })
  expect(stepCopy).toMatchObject({ month_start: '2026-10-01', goal_task_id: goalCopy.id })
  expect(inserted.find((r) => r.title === 'Painted the railing')).toBeUndefined()
})

it('keeping a plain task copies only itself', async () => {
  const { result } = renderHook(() => useSupabaseTasks(), { wrapper })
  await act(async () => {
    await result.current.keepForward('l1', { monthStart: new Date(2026, 9, 1) })
  })
  expect(insertSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — only the goal is copied; no step copy.

- [ ] **Step 3: Extend `keepForward`**

```ts
  /**
   * The look-back's "Keep": copy a month/season row — task OR goal — into the
   * next period, leaving the original on the list it was reviewed from. Same
   * copy as copyDown, same lineage (source_id), no descent: the bucket stays.
   *
   * A GOAL keeps its open steps too. Carrying "Transform the porch" into
   * October and leaving "buy new chairs" behind in September would empty the
   * goal of the work that defines it, and re-deciding four steps one at a time
   * is the deliberation the cadence already spent on the goal itself.
   * Completed steps stay behind — they are September's record.
   */
  const keepForward = useCallback(async (id: string, period: { monthStart?: Date; seasonStart?: Date }): Promise<string | undefined> => {
    const task = findTaskById(id)
    if (!task || (task.bucket !== 'month' && task.bucket !== 'quarter')) return undefined
    const copyId = await copyDown(task, { bucket: task.bucket, monthStart: period.monthStart, seasonStart: period.seasonStart })
    if (copyId && task.isGoal) {
      for (const step of stepsThatCarryForward(task.id, tasksRef.current)) {
        await copyDown(step, {
          bucket: step.bucket,
          monthStart: period.monthStart,
          seasonStart: period.seasonStart,
          goalTaskId: copyId,
        })
      }
    }
    return copyId
  }, [findTaskById, copyDown])
```

`copyDown` currently reads `goalTaskId` from the original; make it prefer an override so the step attaches to the NEW goal rather than the old one:

```ts
      goalTaskId: updates.goalTaskId ?? original.goalTaskId,
```

Import `stepsThatCarryForward` from `@/lib/planning/goalSteps`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(goals): keeping a goal carries its open steps forward"
```

---

### Task 6: Today says what a step is for

**Files:**
- Modify: `src/types/timeline.ts` — `TimelineItem` (~line 24), `taskToTimelineItem` (~line 95)
- Modify: `src/lib/today/grouping.ts` — `GroupingInput` (~line 20), `buildGroupedSections` (~line 36)
- Modify: `src/apps/tasks/HomeViewContainer.tsx` — pass the titles map
- Modify: `src/components/schedule/ScheduleItem.tsx` — `hasBelowTitleContent` (~line 261), the line itself (beside the waiting line, ~768)
- Modify: `src/components/home/week/WeekViewV2.tsx` — the two `taskToTimelineItem` call sites (~416, ~461)
- Test: `src/components/schedule/ScheduleItem.test.tsx`, `src/lib/today/grouping.test.ts`

**Interfaces:**
- Consumes: `goalTitleMap` from `@/lib/planning/goalSteps`.
- Produces: `TimelineItem.goalLabel?: string`; `taskToTimelineItem(task, goalLabel?)`; `GroupingInput.goalTitles?: Map<string, string>`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('a step names the goal it serves, under its title', () => {
  render(<ScheduleItem item={{ ...taskItem, title: 'Hang plants', goalLabel: 'Transform the porch' }} {...noopHandlers} />)
  expect(screen.getByText('Transform the porch')).toBeInTheDocument()
})

it('a loose task says nothing extra', () => {
  render(<ScheduleItem item={{ ...taskItem, title: 'Call the roofer' }} {...noopHandlers} />)
  expect(screen.queryByText(/Transform the porch/)).not.toBeInTheDocument()
})
```

and in `src/lib/today/grouping.test.ts`:

```ts
it('carries the goal label onto a step', () => {
  const grouped = buildGroupedSections({
    ...baseInput,
    timedTasks: [task({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' })],
    goalTitles: new Map([['g1', 'Transform the porch']]),
  })
  const item = Object.values(grouped).flat().find((i) => i.title === 'Hang plants')
  expect(item?.goalLabel).toBe('Transform the porch')
})
```

Reuse each file's existing fixtures (`taskItem`, `noopHandlers`, `baseInput`, `task`) — read the tops of both test files and match their real names.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/schedule/ScheduleItem.test.tsx src/lib/today/grouping.test.ts`
Expected: FAIL — `goalLabel` is not a property of `TimelineItem`.

- [ ] **Step 3: Carry the label through**

`src/types/timeline.ts` — add to `TimelineItem`, beside `waitingFor`:

```ts
  /** The month/season goal a step serves, by name. Planning a task for today
   *  should preserve its broader commitment — so Today says what it is for. */
  goalLabel?: string
```

and to `taskToTimelineItem`:

```ts
export function taskToTimelineItem(task: Task, goalLabel?: string): TimelineItem {
```
```ts
    goalLabel,
```

Every existing call site keeps working: the second argument is optional and `undefined` renders nothing.

`src/lib/today/grouping.ts` — add to `GroupingInput`:

```ts
  /** goalTaskId → the goal's title, for the line a step draws under itself. */
  goalTitles?: Map<string, string>
```

and use it:

```ts
  const taskItems = timedTasks.map((t) =>
    taskToTimelineItem(t, t.goalTaskId ? goalTitles?.get(t.goalTaskId) : undefined))
```

remembering to destructure `goalTitles` alongside the rest of `input`.

`src/apps/tasks/HomeViewContainer.tsx` — build the map once from the tasks it already holds and pass it into `buildGroupedSections`:

```tsx
  const goalTitles = useMemo(() => goalTitleMap(tasks), [tasks])
```

Import `goalTitleMap` from `@/lib/planning/goalSteps`. The map is built from the
task list this container already holds — already RLS-filtered — so a goal the
reader cannot see contributes no title.

- [ ] **Step 4: Render the line**

In `ScheduleItem.tsx`, add to `hasBelowTitleContent` (~line 261) — **this is required, or the leading columns unpin from the title's first line:**

```tsx
    || !!(item.goalLabel && !item.completed)
```

and render it directly after the waiting-on block (~line 774):

```tsx
          {/* What this step is FOR. A commitment made at the month's altitude
              should still be legible on the day you act on it. No count, no
              progress — just the goal's name. */}
          {item.goalLabel && !item.completed && (
            <div className="flex items-baseline gap-1.5 text-[12px] text-neutral-500 leading-tight mt-0.5 min-w-0">
              <Target className="w-3 h-3 shrink-0 translate-y-[1px]" aria-hidden />
              <span className="truncate" title={item.goalLabel}>{item.goalLabel}</span>
            </div>
          )}
```

Add `Target` to the lucide import.

- [ ] **Step 5: Do the same on /week**

`/week` renders the same cards from the same `taskToTimelineItem`, so a step
placed on a week must carry its goal too. In `src/components/home/week/WeekViewV2.tsx`,
build the map once beside the other memos:

```tsx
  const goalTitles = useMemo(() => goalTitleMap(tasks), [tasks])
```

and pass it at both call sites:

```tsx
    const taskItems = scheduledTasks.map((t) =>
      taskToTimelineItem(t, t.goalTaskId ? goalTitles.get(t.goalTaskId) : undefined))
```
```tsx
            if (task) blocks.push(taskToTimelineItem(task, task.goalTaskId ? goalTitles.get(task.goalTaskId) : undefined))
```

Import `goalTitleMap` from `@/lib/planning/goalSteps`. Read the file first to
confirm which task list is in scope at each site — `scheduledTasks` is a
filtered subset, and the MAP must come from the full list or a goal whose step
is on this week but whose goal row is not will lose its label.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/schedule/ScheduleItem.test.tsx src/lib/today/grouping.test.ts`
Expected: PASS

- [ ] **Step 7: Check it in the browser**

`npm run dev`, open `/today` with a step placed on today. Confirm the goal line sits under the title, the row's checkbox and time column stay pinned to the title's first line, and a plain task shows nothing. Then open `/week` and confirm the same card carries the line. Narrow to ~390px and confirm the line truncates rather than wrapping the row.

- [ ] **Step 8: Commit**

```bash
git add src/types/timeline.ts src/lib/today src/apps/tasks/HomeViewContainer.tsx src/components/home/week/WeekViewV2.tsx src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "feat(today): a step says which goal it serves"
```

---

### Task 7: Prove the privacy boundary with real accounts

**Files:**
- Test: `src/lib/planning/goalSteps.test.ts` (one added case)
- Manual verification against the live database

**Interfaces:**
- Consumes: everything above.
- Produces: a recorded result, and a `docs/` note if anything needed changing.

- [ ] **Step 1: Add the unit case**

```ts
it('a step whose goal the reader cannot see stays loose, never hidden', () => {
  // The reader's query returned the step but not the goal row (RLS filtered
  // it). The step must still appear — as a loose row — not vanish.
  const step = t({ id: 's9', title: 'Hang plants', goalTaskId: 'private-goal' })
  const { loose } = splitGoalRows([step])
  expect(loose.map((r) => r.id)).toEqual(['s9'])
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/planning/goalSteps.test.ts`
Expected: PASS (the fallback from Task 2 already covers it; this pins the intent).

- [ ] **Step 3: Verify against the database with two real accounts**

Mocked filtering tests do not prove database privacy. Sign in as Scott, create a private (`individual` scope) month goal with a step. Sign in as the second household account and confirm:

- neither the goal nor the step is returned by the tasks query;
- no new policy was needed — `goal_task_id` is a plain column on `tasks` and the existing row policies cover it;
- `goal_task_id` never widens a read: a shared step pointing at a private goal shows the step (loose, unlabelled), never the private goal's title.

Record the result. If the third point fails — if the goal's title leaks through Today's `goalTitles` map — the map must be built from the same filtered task list the reader already has, which it is; re-check `HomeViewContainer` rather than adding a policy.

- [ ] **Step 4: Full suite, lint and typecheck**

```bash
npx vitest run
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
A red suite may be a calendar-date artefact rather than this change — check `tend_tests_rot_on_wall_clock` before chasing a failure that looks unrelated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/goalSteps.test.ts
git commit -m "test(goals): a step outlives a goal it cannot see"
```

---

## Not in this plan

No progress bars or counts on a goal row. No `/year` change, and no changes to the `goals` table, `/goals/:id` or `GoalChapters`. No drag-a-task-into-a-goal. No nesting deeper than one level. No iOS work — `goal_task_id` reaching the iOS client is its own change on `ios-sliders`.
