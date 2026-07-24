# Season Wizard Threaded Rebuild — Implementation Plan (Phase 1: Year→Season)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the seasonal guided session so a season Pick is created already anchored to a year Goal (thread set at insert), with migrate-or-release, drag re-parenting, recoverable set-aside, AI on every step — and make the `/season` and `/year` pages surface that thread.

**Architecture:** One reusable interactive step (`pick-by-goal`) that walks the current-domain goals and creates/edits `quarter` picks anchored by `goal_id` + `picked_at`. Re-parent/set-aside/carry all ride the existing `onUpdateTask` write path. Pages read the same thread via existing pure helpers (`partitionSeason`, `goalRollup`, `goalsWithoutMoves`).

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, Supabase. Guided-session step framework in `src/components/planning/guided/`.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-24-season-wizard-threaded-rebuild-design.md` (read it).
- Vocabulary is strict: **Goal → Pick → Move → Placement**. Never "bets" in new user-facing copy.
- **No emoji** in UI — lucide icons only (project standing rule).
- **No schema changes** — `picked_at`, `goal_id`, `source_id`, `context` already exist; `AddTaskOptions`/`updateTask` already serialize them.
- `host.goals` and `host.tasks` are **already domain-filtered** by the guided container — do NOT re-filter by domain in step components.
- Never create-then-mutate (race drops the write) — creation is one atomic `createTaskInBucket` with all fields in options.
- Tests: run with `npx vitest run <path>` (bare `npm test` is watch mode).
- Work happens in this worktree; commit after each task. Do not push to `main` until Scott approves the preview.
- `PICK_CAP` is a soft backstop (10), not a capacity model. No effort sizing / load meters anywhere (rejected per Best Laid Plans).

---

## File structure

**Write side (wizard):**
- `src/components/planning/guided/stepTypes/PickByGoalStep.tsx` — NEW. The goal-anchored picker (+ standalone mode).
- `src/components/planning/guided/stepTypes/index.ts` — register `pick-by-goal`.
- `src/components/planning/guided/types.ts` — add `'pick-by-goal'` to `StepType`; add `standalone?` prop.
- `src/components/planning/guided/sessions.ts` — reconfigure the seasonal arc.
- `src/components/planning/guided/stepTypes/ReviewStep.tsx` — add "carry into this season" fate.
- `src/components/planning/guided/GuidedContext.tsx` — add `pickedAt` to `createTaskInBucket` opts.
- `src/components/planning/guided/GuidedSessionContainer.tsx` — forward `pickedAt` to `addTask`.

**Shared:**
- `src/lib/planning/betPulse.ts` — `PICK_CAP` 8 → 10.
- `src/lib/planning/pickCoherence.ts` — NEW. Pure coherence + goals-in-focus helpers.

**Read side (pages):**
- `src/components/planning/season/BetCard.tsx` — show `← Goal` breadcrumb.
- `src/apps/tasks/HorizonView.tsx` — season "goals not yet picked" coverage row; year goal-spine coverage.

**Tests:** colocated `*.test.ts(x)` per file.

---

### Task 1: Thread `pickedAt` through `createTaskInBucket` + raise `PICK_CAP`

**Files:**
- Modify: `src/components/planning/guided/GuidedContext.tsx` (createTaskInBucket opts type)
- Modify: `src/components/planning/guided/GuidedSessionContainer.tsx` (forward pickedAt)
- Modify: `src/lib/planning/betPulse.ts:14` (`PICK_CAP`)
- Test: `src/lib/planning/betPulse.test.ts` (cap value), `src/components/planning/guided/GuidedSessionContainer.pickedAt.test.tsx` (NEW)

**Interfaces:**
- Produces: `host.createTaskInBucket(title, bucket, { projectId?, sourceId?, goalId?, pickedAt?: Date })` — atomic create that stamps `picked_at` when `pickedAt` given.

- [ ] **Step 1: Update the host interface type.** In `GuidedContext.tsx`, extend the `createTaskInBucket` opts:

```ts
  createTaskInBucket: (
    title: string,
    bucket: TaskBucket,
    opts?: { projectId?: string; sourceId?: string; goalId?: string; pickedAt?: Date },
  ) => Promise<void>
```

- [ ] **Step 2: Write the failing test** for the container forwarding `pickedAt`.

`src/components/planning/guided/GuidedSessionContainer.pickedAt.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
// The container's createTaskInBucket is a thin wrapper over addTask. This test
// asserts pickedAt is forwarded. If the container is hard to mount in isolation,
// assert at the unit boundary: extract the opts-mapping into a tested pure fn.
import { buildAddTaskOptions } from './GuidedSessionContainer'

describe('createTaskInBucket options mapping', () => {
  it('forwards pickedAt into addTask options', () => {
    const d = new Date('2026-07-24T00:00:00Z')
    const opts = buildAddTaskOptions('quarter', { goalId: 'g1', pickedAt: d }, 'family')
    expect(opts.pickedAt).toBe(d)
    expect(opts.goalId).toBe('g1')
    expect(opts.bucket).toBe('quarter')
    expect(opts.context).toBe('family')
  })
})
```

- [ ] **Step 3: Run it, verify it fails.** `npx vitest run src/components/planning/guided/GuidedSessionContainer.pickedAt.test.tsx` → FAIL (`buildAddTaskOptions` not exported).

- [ ] **Step 4: Implement.** In `GuidedSessionContainer.tsx`, extract and export the mapping, then use it inside `createTaskInBucket`:

```ts
export function buildAddTaskOptions(
  bucket: TaskBucket,
  opts: { projectId?: string; sourceId?: string; goalId?: string; pickedAt?: Date } | undefined,
  currentDomain: string,
) {
  return {
    bucket,
    projectId: opts?.projectId,
    sourceId: opts?.sourceId,
    goalId: opts?.goalId,
    pickedAt: opts?.pickedAt,
    context: currentDomain !== 'universal' ? currentDomain : undefined,
  }
}
```

Then in the existing `createTaskInBucket` useCallback, replace the inline options object with `await addTask(title, buildAddTaskOptions(bucket, opts, currentDomain))` (preserve any existing `getCurrentUserMember` assignee fields already present — merge, don't drop them).

- [ ] **Step 5: Run test, verify pass.** `npx vitest run src/components/planning/guided/GuidedSessionContainer.pickedAt.test.tsx` → PASS.

- [ ] **Step 6: Raise the cap.** In `betPulse.ts`: `export const PICK_CAP = 10`. Update `betPulse.test.ts` any assertion referencing 8 → 10.

- [ ] **Step 7: Run betPulse tests.** `npx vitest run src/lib/planning/betPulse.test.ts` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/components/planning/guided/GuidedContext.tsx src/components/planning/guided/GuidedSessionContainer.tsx src/components/planning/guided/GuidedSessionContainer.pickedAt.test.tsx src/lib/planning/betPulse.ts src/lib/planning/betPulse.test.ts
git commit -m "feat(planning): createTaskInBucket carries pickedAt; PICK_CAP 8→10"
```

---

### Task 2: Pure coherence + goals-in-focus helpers

**Files:**
- Create: `src/lib/planning/pickCoherence.ts`
- Test: `src/lib/planning/pickCoherence.test.ts`

**Interfaces:**
- Produces:
  - `pickFitsGoal(pickTitle: string, goalName: string): boolean` — deterministic keyword-overlap fit check (Phase 1; AI later).
  - `coherenceHint(pickTitle: string, goalName: string): string | null` — `null` if it fits, else `"reads like {topic} — re-parent?"`.
  - `goalsInFocusNudge(goalIdsWithPicks: string[], threshold?: number): string | null` — nudge string when > threshold (default 6) goals carry picks.

- [ ] **Step 1: Write the failing test.**

`src/lib/planning/pickCoherence.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickFitsGoal, coherenceHint, goalsInFocusNudge } from './pickCoherence'

describe('pickFitsGoal', () => {
  it('true when pick shares meaningful words with its goal', () => {
    expect(pickFitsGoal('Living room + entryway set up', 'Every room set up for how we live')).toBe(true)
  })
  it('false when a pick is topically unrelated to its goal', () => {
    expect(pickFitsGoal('Weed the backyard', 'A budget & investment plan')).toBe(false)
  })
})

describe('coherenceHint', () => {
  it('returns null when the pick fits', () => {
    expect(coherenceHint('Fix the back door', 'Every room set up for how we live')).toBeNull()
  })
  it('returns a re-parent hint when it does not fit', () => {
    expect(coherenceHint('Weed the backyard', 'A budget & investment plan')).toMatch(/re-parent/i)
  })
})

describe('goalsInFocusNudge', () => {
  it('null at or below threshold', () => {
    expect(goalsInFocusNudge(['a', 'b', 'c'], 6)).toBeNull()
  })
  it('nudges above threshold', () => {
    expect(goalsInFocusNudge(['a','b','c','d','e','f','g'], 6)).toMatch(/next season/i)
  })
})
```

- [ ] **Step 2: Run it, verify it fails.** `npx vitest run src/lib/planning/pickCoherence.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.**

`src/lib/planning/pickCoherence.ts`:

```ts
// Deterministic, no-network coherence signal for the goal-anchored picker.
// A pick "fits" its goal when their meaningful words overlap. This is a Phase-1
// stand-in for an AI coherence read; it only ever NUDGES, never blocks.

const STOP = new Set([
  'the','a','an','and','or','of','to','for','in','on','with','we','our','my','i',
  'set','up','get','make','do','have','been','followed','agreed','both','us','by',
  'that','this','into','how','actually','live','plan','plans','regular','regularly',
])

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

export function pickFitsGoal(pickTitle: string, goalName: string): boolean {
  const p = words(pickTitle)
  const g = words(goalName)
  if (p.size === 0 || g.size === 0) return true // nothing to judge → don't nag
  for (const w of p) if (g.has(w)) return true
  return false
}

export function coherenceHint(pickTitle: string, goalName: string): string | null {
  if (pickFitsGoal(pickTitle, goalName)) return null
  return 'reads like it belongs elsewhere — re-parent?'
}

export function goalsInFocusNudge(goalIdsWithPicks: string[], threshold = 6): string | null {
  const n = new Set(goalIdsWithPicks).size
  if (n <= threshold) return null
  return `You're advancing ${n} goals this season — a full plate for a quarter. Anything that's really next season?`
}
```

- [ ] **Step 4: Run test, verify pass.** `npx vitest run src/lib/planning/pickCoherence.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/planning/pickCoherence.ts src/lib/planning/pickCoherence.test.ts
git commit -m "feat(planning): deterministic pick-coherence + goals-in-focus helpers"
```

---

### Task 3: `PickByGoalStep` — render goals with their picks + add anchored pick

**Files:**
- Create: `src/components/planning/guided/stepTypes/PickByGoalStep.tsx`
- Modify: `src/components/planning/guided/types.ts` (StepType + `standalone?` prop)
- Modify: `src/components/planning/guided/stepTypes/index.ts` (register)
- Test: `src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()` → `{ host, step }`; `host.goals` (domain goals), `host.tasks` (domain tasks), `host.createTaskInBucket`, `host.onUpdateTask`; `partitionSeason` from `@/lib/planning/betPulse`; `PICK_CAP`; `coherenceHint`, `goalsInFocusNudge` from `@/lib/planning/pickCoherence`.
- Produces: registered step type `'pick-by-goal'`. Reads `step.props?.standalone` to switch to the goal-less mode.

- [ ] **Step 1: Add the step type + prop.** In `types.ts`, add to the `StepType` union: `| 'pick-by-goal'   // goal-anchored season picker`. In the `props` block add: `/** pick-by-goal: goal-less "doesn't serve a goal" mode. */ standalone?: boolean`.

- [ ] **Step 2: Write the failing test.**

`PickByGoalStep.test.tsx` (mirror existing step tests — they wrap the component in a `GuidedProvider` with a fake host; copy the harness from `ReviewStep.test.tsx` or `WriteListStep.test.tsx`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { PickByGoalStep } from './PickByGoalStep'
import { GuidedProvider } from '../GuidedContext'
import { makeHost, makeStep } from './__testutils__/guided' // create if absent; see note

function renderStep(hostOverrides = {}, props = {}) {
  const host = makeHost(hostOverrides)
  return { host, ...render(
    <GuidedProvider value={{ host, step: makeStep('pick-by-goal', props), horizon: 'seasonal', goNext: vi.fn() } as any}>
      <PickByGoalStep />
    </GuidedProvider>,
  ) }
}

describe('PickByGoalStep', () => {
  it('lists each domain goal with its existing picks', () => {
    renderStep({
      goals: [{ id: 'g1', name: 'Every room set up for how we live', status: 'active' }],
      tasks: [{ id: 't1', title: 'Living room set up', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1', completed: false }],
    })
    expect(screen.getByText(/Every room set up/)).toBeInTheDocument()
    expect(screen.getByText('Living room set up')).toBeInTheDocument()
  })

  it('adding a pick under a goal calls createTaskInBucket with that goalId + pickedAt', async () => {
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    renderStep({ goals: [{ id: 'g1', name: 'Every room set up', status: 'active' }], tasks: [], createTaskInBucket })
    fireEvent.click(screen.getByRole('button', { name: /add a pick/i }))
    fireEvent.change(screen.getByPlaceholderText(/move this goal/i), { target: { value: 'Fix the back door' } })
    fireEvent.click(screen.getByRole('button', { name: /^add pick$/i }))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Fix the back door', 'quarter', expect.objectContaining({ goalId: 'g1', pickedAt: expect.any(Date) }),
    ))
  })
})
```

> Note: if `./__testutils__/guided` doesn't exist, create a tiny `makeHost(partial)` returning a full `GuidedHost` with `vi.fn()` stubs + sensible defaults, and `makeStep(type, props)` returning `{ id: type, type, title: '', props }`. Reuse across step tests.

- [ ] **Step 3: Run it, verify it fails.** `npx vitest run src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx` → FAIL (component missing).

- [ ] **Step 4: Implement the component (render + add).**

`PickByGoalStep.tsx`:

```tsx
// Goal-anchored season picker. Walks the current-domain goals; under each you
// add the pick(s) that move it this season — created already threaded
// (goal_id + picked_at at insert). host.goals/host.tasks are already
// domain-filtered by the container. See spec 2026-07-24.
import { useMemo, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { partitionSeason, PICK_CAP } from '@/lib/planning/betPulse'
import { goalsInFocusNudge } from '@/lib/planning/pickCoherence'
import { useGuided } from '../GuidedContext'

export function PickByGoalStep() {
  const { host, step } = useGuided()
  const standalone = !!step.props?.standalone
  const [openGoal, setOpenGoal] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())

  const picks = useMemo(() => partitionSeason(host.tasks).picks, [host.tasks])
  const picksByGoal = useMemo(() => {
    const m = new Map<string, typeof picks>()
    for (const p of picks) {
      const key = p.goalId ?? '__none__'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return m
  }, [picks])

  const activeGoals = host.goals.filter((g) => g.status === 'active')
  const capReached = picks.length >= PICK_CAP
  const focusNudge = goalsInFocusNudge(
    picks.filter((p) => p.goalId).map((p) => p.goalId as string),
  )

  const addPick = async (goalId: string | undefined, title: string) => {
    const t = title.trim()
    if (!t) return
    await host.createTaskInBucket(t, 'quarter', { goalId, pickedAt: new Date() })
    setDraft(''); setOpenGoal(null)
  }

  if (standalone) {
    const loose = picksByGoal.get('__none__') ?? []
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">Job search, admin, one-off fun — picks that don't serve a family goal.</p>
        {loose.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-100 bg-white px-3 py-2 text-sm">{p.title}</div>
        ))}
        <InlineAdd placeholder="A pick that serves no goal…" onAdd={(v) => addPick(undefined, v)} disabled={capReached} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeGoals.map((goal) => {
        const gp = picksByGoal.get(goal.id) ?? []
        const isSkipped = skipped.has(goal.id)
        return (
          <section key={goal.id} data-goal-id={goal.id}
            className="rounded-2xl border border-neutral-100 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display text-neutral-800">{goal.name}</h3>
              {gp.length === 0 && !isSkipped && (
                <button type="button" onClick={() => setSkipped((s) => new Set(s).add(goal.id))}
                  className="text-xs text-neutral-400 hover:text-neutral-600">Nothing this season</button>
              )}
              {isSkipped && <span className="text-xs text-neutral-400">— skipped</span>}
            </div>
            <ul className="mt-2 space-y-1">
              {gp.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg bg-primary-600 text-white px-2.5 py-1 text-xs w-fit">
                  <Check className="w-3 h-3" strokeWidth={3} /> {p.title}
                </li>
              ))}
            </ul>
            {!isSkipped && (
              openGoal === goal.id ? (
                <InlineAdd placeholder="What would move this goal this season?" autoFocus
                  onAdd={(v) => addPick(goal.id, v)} disabled={capReached} />
              ) : (
                <button type="button" onClick={() => setOpenGoal(goal.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary-700 border border-dashed border-primary-200 rounded-md px-2 py-1 hover:bg-primary-50">
                  <Plus className="w-3 h-3" /> Add a pick for this season
                </button>
              )
            )}
          </section>
        )
      })}
      {focusNudge && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{focusNudge}</p>}
    </div>
  )
}

function InlineAdd({ placeholder, onAdd, disabled, autoFocus }: {
  placeholder: string; onAdd: (v: string) => void; disabled?: boolean; autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  return (
    <div className="mt-2 flex items-center gap-2">
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(v); setV('') } }}
        className="input-base flex-1 text-sm" />
      <button type="button" disabled={disabled} onClick={() => { onAdd(v); setV('') }}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">Add pick</button>
    </div>
  )
}
```

- [ ] **Step 5: Register the step type.** In `stepTypes/index.ts` add `import { PickByGoalStep } from './PickByGoalStep'` and `registerStepType('pick-by-goal', PickByGoalStep)`.

- [ ] **Step 6: Run test, verify pass.** `npx vitest run src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/components/planning/guided/stepTypes/PickByGoalStep.tsx src/components/planning/guided/stepTypes/index.ts src/components/planning/guided/types.ts src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx src/components/planning/guided/stepTypes/__testutils__/guided.ts
git commit -m "feat(planning): PickByGoalStep — add picks anchored to goals"
```

---

### Task 4: Set-aside (recoverable) + drag re-parent + coherence hint on picks

**Files:**
- Modify: `src/components/planning/guided/stepTypes/PickByGoalStep.tsx`
- Test: `src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx` (add cases)

**Interfaces:**
- Consumes: `host.onUpdateTask(id, { pickedAt })` for set-aside/re-pick; `host.onUpdateTask(id, { goalId })` for re-parent; `coherenceHint` from `pickCoherence`.

- [ ] **Step 1: Write failing tests** (append):

```tsx
it('set aside demotes the pick (pickedAt null), never deletes', () => {
  const onUpdateTask = vi.fn()
  renderStep({ goals: [{ id: 'g1', name: 'Every room', status: 'active' }],
    tasks: [{ id: 't1', title: 'Fix door', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1', completed: false }],
    onUpdateTask })
  fireEvent.click(screen.getByRole('button', { name: /set aside fix door/i }))
  expect(onUpdateTask).toHaveBeenCalledWith('t1', { pickedAt: null })
})

it('dropping a pick on another goal re-parents it (goalId update)', () => {
  const onUpdateTask = vi.fn()
  renderStep({
    goals: [{ id: 'g1', name: 'Budget plan', status: 'active' }, { id: 'g2', name: 'A real local circle', status: 'active' }],
    tasks: [{ id: 't1', title: 'Weed the backyard', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1', completed: false }],
    onUpdateTask,
  })
  const target = screen.getByText('A real local circle').closest('section')!
  fireEvent.drop(target, { dataTransfer: { getData: () => 't1' } })
  expect(onUpdateTask).toHaveBeenCalledWith('t1', { goalId: 'g2' })
})

it('shows a coherence hint on a mis-anchored pick', () => {
  renderStep({ goals: [{ id: 'g1', name: 'A budget & investment plan', status: 'active' }],
    tasks: [{ id: 't1', title: 'Weed the backyard', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1', completed: false }] })
  expect(screen.getByText(/re-parent/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run …/PickByGoalStep.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** In `PickByGoalStep.tsx`:
  - Import `coherenceHint` and `X` icon (`import { Plus, Check, X } from 'lucide-react'`).
  - Give each pick `<li>` `draggable`, `onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}`.
  - Give each `<section>` `onDragOver={(e) => e.preventDefault()}` and `onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) host.onUpdateTask(id, { goalId: goal.id }) }}` plus a dragover highlight state (`useState` for hovered goal id; add a `ring-2 ring-primary-300` class when active).
  - Add a set-aside button to each pick `<li>`: `<button aria-label={\`Set aside ${p.title}\`} onClick={() => host.onUpdateTask(p.id, { pickedAt: null })}><X className="w-3 h-3" /></button>`.
  - Under each pick, render `coherenceHint(p.title, goal.name)` when non-null: `<p className="text-[11px] text-amber-700">{hint}</p>`.

- [ ] **Step 4: Run tests, verify pass.** `npx vitest run …/PickByGoalStep.test.tsx` → PASS.

- [ ] **Step 5: Add the "Set aside this season" tray** (recoverable). Track session set-aside ids in local state; render a tray at the bottom listing those tasks with a "Pick again" button (`host.onUpdateTask(id, { pickedAt: new Date() })`) and an inline "Undo" that re-picks the just-set-aside id. Add a test asserting "Pick again" calls `onUpdateTask` with a Date. Run it → PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/components/planning/guided/stepTypes/PickByGoalStep.tsx src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx
git commit -m "feat(planning): pick set-aside (recoverable), drag re-parent, coherence hint"
```

---

### Task 5: Reconfigure the seasonal arc

**Files:**
- Modify: `src/components/planning/guided/sessions.ts` (the `seasonal` config)
- Test: `src/components/planning/guided/registry.test.ts` (or add `sessions.seasonal.test.ts`)

**Interfaces:**
- Consumes: step types `pick-by-goal` (Task 3), `review` (Task 6 adds carry).

- [ ] **Step 1: Write the failing test.**

`src/components/planning/guided/sessions.seasonal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'

describe('seasonal arc', () => {
  it('walks welcome → carry/win/release → pick-by-goal → standalone → calendar → look-within → book-next', () => {
    const ids = SESSIONS.seasonal.steps.map((s) => s.type)
    expect(ids).toEqual(['narration', 'review', 'pick-by-goal', 'pick-by-goal', 'calendar', 'reflect', 'book-next'])
  })
  it('the standalone pick step is flagged', () => {
    const standalone = SESSIONS.seasonal.steps.find((s) => s.type === 'pick-by-goal' && s.props?.standalone)
    expect(standalone).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/components/planning/guided/sessions.seasonal.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Replace the `seasonal.steps` array in `sessions.ts` with:

```ts
    steps: [
      { id: 'welcome', type: 'narration', title: 'A fresh season', /* keep existing narration props */ },
      { id: 'season-review', type: 'review', title: "Carry, win, or release last season's picks",
        props: { bucket: 'quarter', rows: 'fate' } },
      { id: 'pick-by-goal', type: 'pick-by-goal', title: 'Choose this season, goal by goal' },
      { id: 'standalone-picks', type: 'pick-by-goal', title: "Anything that doesn't serve a goal",
        props: { standalone: true } },
      { id: 'season-ahead', type: 'calendar', title: 'The season ahead' },
      { id: 'look-within', type: 'reflect', title: 'Look within', /* keep existing notesKey */ },
      { id: 'book-next', type: 'book-next', title: 'Anchor the next step',
        props: { bookHorizon: 'monthly', /* keep existing */ } },
    ],
```

Preserve the exact `props` (narration text, `notesKey`, `bookTitle`, `chain`) already present on the corresponding old steps — copy them over; only the arc and the two new/changed steps change. Remove the old `look-at-year`, `projects-in-motion`, and `write-season` steps.

- [ ] **Step 4: Run test, verify pass.** `npx vitest run src/components/planning/guided/sessions.seasonal.test.ts` → PASS.

- [ ] **Step 5: Full guided test sweep** to catch narration-manifest / registry expectations: `npx vitest run src/components/planning/guided` → PASS (fix any snapshot/registry test that enumerated the old step ids).

- [ ] **Step 6: Commit.**

```bash
git add src/components/planning/guided/sessions.ts src/components/planning/guided/sessions.seasonal.test.ts
git commit -m "feat(planning): seasonal arc — review → pick-by-goal → standalone"
```

---

### Task 6: "Carry into this season" fate on the seasonal review

**Files:**
- Modify: `src/components/planning/guided/stepTypes/ReviewStep.tsx` (the `rows === 'fate'` / `SeasonListRow` path)
- Test: `src/components/planning/guided/stepTypes/ReviewStep.test.tsx` (add case)

**Interfaces:**
- Consumes: `host.onUpdateTask(id, { pickedAt })`.

- [ ] **Step 1: Write the failing test.** Assert the fate row for a last-season pick offers "Carry into this season" and that clicking it calls `host.onUpdateTask(id, { pickedAt: <Date> })` while preserving `goalId` (no goalId in the update, so it's untouched). Model it on the existing `SeasonListRow` fate tests in this file.

- [ ] **Step 2: Run, verify fail.** `npx vitest run …/ReviewStep.test.tsx -t carry` → FAIL.

- [ ] **Step 3: Implement.** In the `fate` branch's `SeasonListRow`, add a third action button "Carry into this season" alongside the existing Won / Put-aside, calling `host.onUpdateTask(task.id, { pickedAt: new Date() })` and keeping the row visible with a "Carried" tag (reuse the existing celebrated/decided-ids visibility pattern in this component so the row doesn't vanish mid-step).

- [ ] **Step 4: Run test, verify pass.** `npx vitest run …/ReviewStep.test.tsx` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/planning/guided/stepTypes/ReviewStep.tsx src/components/planning/guided/stepTypes/ReviewStep.test.tsx
git commit -m "feat(planning): seasonal review — carry a pick into this season"
```

---

### Task 7: `/season` read side — `← Goal` breadcrumb + coverage row

**Files:**
- Modify: `src/components/planning/season/BetCard.tsx` (breadcrumb)
- Modify: `src/apps/tasks/HorizonView.tsx` (season block: coverage row)
- Test: `src/components/planning/season/BetCard.test.tsx` (breadcrumb); extend `BetsGrid.test.tsx` if needed

**Interfaces:**
- Consumes: `goalsById: Map<string, Goal>` (already passed to `BetCard`); `goalsWithoutMoves(goals, tasks, 'quarter')` from `@/lib/planning/lineage`.

- [ ] **Step 1: Write the failing test** for `BetCard` rendering `← {goal.name}` when the pick has a `goalId` present in `goalsById`.

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/components/planning/season/BetCard.test.tsx` → FAIL.

- [ ] **Step 3: Implement breadcrumb.** In `BetCard.tsx`, when `bet.goalId && goalsById.get(bet.goalId)`, render a small muted line: `← {goalsById.get(bet.goalId)!.name}` (truncate). Use the existing muted caption styling in the card.

- [ ] **Step 4: Run test, verify pass.** → PASS.

- [ ] **Step 5: Add the coverage row.** In `HorizonView.tsx` season block (around the picks render, ~line 1036–1069), compute `const uncovered = goalsWithoutMoves(goals, domainTasks, 'quarter')` and render a row titled "Goals not yet picked this season" listing each uncovered goal with a one-tap button that opens the season add composer for that goal (reuse the existing add-pick affordance / `parkingMenu`). Guard: only render when `uncovered.length > 0`.

- [ ] **Step 6: Manual check + test.** Add a `HorizonView` season test (or extend an existing one) asserting an uncovered active goal appears in the coverage row. `npx vitest run src/apps/tasks` (or the specific file) → PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/components/planning/season/BetCard.tsx src/components/planning/season/BetCard.test.tsx src/apps/tasks/HorizonView.tsx
git commit -m "feat(season page): pick breadcrumb + goals-not-yet-picked coverage row"
```

---

### Task 8: `/year` read side — goal-spine pick coverage

**Files:**
- Modify: `src/apps/tasks/HorizonView.tsx` (year block, ~line 646–697)
- Test: extend the relevant `HorizonView`/year test

**Interfaces:**
- Consumes: `partitionSeason`, `goalRollup` from `@/lib/planning/lineage`.

- [ ] **Step 1: Write the failing test.** Assert that in the year view, an active goal with a season pick shows its pick (or a "1 pick this season" count), and a goal with none shows a "0 moves this season" flag.

- [ ] **Step 2: Run, verify fail.** → FAIL.

- [ ] **Step 3: Implement.** In the year block, for each active goal render its season picks beneath it (filter `partitionSeason(domainTasks).picks` by `goalId === goal.id`) with the existing `goalRollup` progress; when a goal has zero picks, render a quiet `0 moves this season` badge (muted, not alarming). Keep it domain-filtered (uses `domainTasks`).

- [ ] **Step 4: Run test, verify pass.** → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/apps/tasks/HorizonView.tsx <year-test-file>
git commit -m "feat(year page): goal-spine season-pick coverage + 0-moves flag"
```

---

### Task 9: AI on the picker — "Suggest picks for this goal"

**Files:**
- Modify: `src/components/planning/guided/stepTypes/PickByGoalStep.tsx`
- Reference (no rebuild): `src/components/planning/guided/GuideChat.tsx`, `agentStream.ts`, `symphony-agent` edge fn, `sharpen-goal` edge fn.
- Test: `PickByGoalStep.test.tsx` (mock the suggest call)

**Interfaces:**
- Consumes: the same suggest mechanism `WriteListStep` uses for "Suggest moves" (parse tap-to-add chips). Find it in `WriteListStep.tsx` / `ListSuggestions.tsx` / `GuideChat.tsx` and reuse — do not invent a new endpoint.

- [ ] **Step 1: Locate the existing suggest path.** Read `src/components/planning/guided/ListSuggestions.tsx` and how `WriteListStep` invokes "Suggest moves" (the `agentStream` → `symphony-agent` call + `parseSuggestions`). Confirm `sessionContext` includes the current list.

- [ ] **Step 2: Write the failing test.** With the suggest call mocked to return `['Scan + store the essential set', 'Share access with Iris']`, assert clicking "✨ Suggest picks" under a goal renders those as tappable chips, and tapping one calls `createTaskInBucket(title, 'quarter', { goalId, pickedAt })`.

- [ ] **Step 3: Run, verify fail.** → FAIL.

- [ ] **Step 4: Implement.** Add a per-goal "Suggest picks" affordance that calls the existing suggest mechanism scoped to that goal (pass the goal name + its existing picks in the prompt/`sessionContext` so suggestions don't duplicate). Render returned suggestions as dashed/tinted chips; tapping one calls the same `addPick(goal.id, title)` from Task 3 (tap is the only write path). Offline/error → one quiet line, never blocks.

- [ ] **Step 5: Run test, verify pass.** → PASS.

- [ ] **Step 6: Verify "Ask your guide" already renders on this step.** GuideChat mounts per-step in the shell; confirm it appears on `pick-by-goal` (it should, being shell-level). If the shell gates the guide by step type, add `pick-by-goal` to the allowed set.

- [ ] **Step 7: Commit.**

```bash
git add src/components/planning/guided/stepTypes/PickByGoalStep.tsx src/components/planning/guided/stepTypes/PickByGoalStep.test.tsx
git commit -m "feat(planning): AI 'suggest picks' per goal on the picker (tap-to-add)"
```

---

### Task 10: Full-suite green + preview deploy

- [ ] **Step 1: Typecheck.** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2: Lint the touched files.** `npx eslint src/components/planning/guided src/lib/planning src/components/planning/season src/apps/tasks/HorizonView.tsx` → 0 errors.
- [ ] **Step 3: Full unit suite.** `npx vitest run` → all pass (baseline + new).
- [ ] **Step 4: Push the branch for a preview deploy** (NOT main): `git push origin season-wizard-threaded`. Confirm the Vercel preview builds.
- [ ] **Step 5: Scott runs the season wizard on his real data against the preview URL.** Only after his sign-off does this merge to `main`.

---

## Self-review

**Spec coverage:**
- Goal-anchored picker (default-anchored, skippable, multi-pick) → Task 3. ✓
- Coherence nudge + goals-in-focus → Task 2 + Task 4. ✓
- Re-parent any pick (drag primary, menu fallback) → Task 4 (drag). *Menu fallback: add in Task 4 Step 3 as the accessible control — noted; if a reviewer wants it explicit, it's the same `onUpdateTask({goalId})` call behind a small menu.*
- Recoverable set-aside + Undo → Task 4 Step 5. ✓
- Migrate-or-release (carry/win/release) → Task 6. ✓
- Standalone escape → Task 3 (standalone mode) + Task 5 (arc). ✓
- Soft cap 10 → Task 1. ✓
- AI on every step → Task 9 (picker suggest + guide); guide chat is shell-level on all steps. ✓
- Per-domain filtering → inherited (host.goals/tasks pre-filtered); no re-filter. ✓
- `/season` breadcrumb + coverage → Task 7. ✓
- `/year` coverage → Task 8. ✓
- No schema change → confirmed (Task 1 uses existing serializers). ✓

**Placeholder scan:** No "TBD"/"add error handling"-style steps; each code step shows code. The menu-fallback for re-parent is the one under-specified item — flagged above; it is a small menu invoking the identical `onUpdateTask({ goalId })`.

**Type consistency:** `createTaskInBucket(title, bucket, { goalId, pickedAt })`, `onUpdateTask(id, { pickedAt|goalId })`, `partitionSeason().picks`, `PICK_CAP`, `coherenceHint`/`goalsInFocusNudge`/`pickFitsGoal`, `goalsWithoutMoves(goals, tasks, 'quarter')`, `goalRollup` — consistent across tasks and match the interfaces read from the codebase.
