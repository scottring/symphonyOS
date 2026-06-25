# Unified Routine Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One Routine editor (name, schedule, context, assignee, visibility, notes, + optional Steps) used for create and edit, simple or multi-step — so creating/editing a plain standalone routine is first-class again and steps can be added to any routine.

**Architecture:** `TapRoutinePanel` (surface/) is already the rich single-routine editor (assignee, context, visibility, schedule, notes, location). We extract the dnd Steps UI from `TapCollectionPanel` into a reusable `RoutineStepsSection`, add it to `TapRoutinePanel` as an OPTIONAL section (renders only when step handlers are passed — so Today-tap is unaffected), then route all routine editing/creating in the Routines list through `TapRoutinePanel` and retire `TapCollectionPanel`. `TapStepPanel` (step editor) is unchanged.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, `@dnd-kit/*`, Supabase via `useRoutines`.

## Global Constraints

- Worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections` (branch `routine-collections`). Never edit the main worktree.
- Node PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Single test: `npx vitest run <path>`. Never `npm test` (watch mode).
- No emojis — `lucide-react` only.
- `Routine`/`RoutineWithSteps`/`RecurrencePattern` from `@/types/actionable`.
- The Steps section in `TapRoutinePanel` is OPTIONAL — gated so Today-tap (which passes no step handlers) renders exactly as before. No visual/behavior change to Today.
- Backward-compat: a routine with no steps renders as a simple editor (empty Steps section is fine / minimal); a routine with steps shows them.
- Routines stay 2-level (no nesting) — unchanged.

---

## File Structure

**Create:**
- `src/components/surface/sections/RoutineStepsSection.tsx` — the reusable dnd steps list + add-step input (extracted from `TapCollectionPanel`).
- `src/components/surface/sections/RoutineStepsSection.test.tsx` — tests.

**Modify:**
- `src/components/surface/TapRoutinePanel.tsx` — add optional Steps section (via `RoutineStepsSection`) + optional step-handler props.
- `src/components/surface/TapRoutinePanel.test.tsx` — add tests for the steps section presence/absence.
- `src/components/routine/RoutinesListRedesign.tsx` — route ALL routine clicks (standalone + multi-step) + create through `TapRoutinePanel`; wire assignee/visibility/schedule/notes/steps; stop using `TapCollectionPanel`.
- `src/components/routine/RoutinesListRedesign.test.tsx` — update assertions.

**Delete (after unused):**
- `src/components/surface/TapCollectionPanel.tsx` + `TapCollectionPanel.test.tsx` (only once no imports remain).

---

## Task 1: Extract `RoutineStepsSection`

**Files:** Create `src/components/surface/sections/RoutineStepsSection.tsx` + test.

**Interfaces:**
- Produces `RoutineStepsSection` with props:
  ```typescript
  interface RoutineStepsSectionProps {
    steps: Routine[]
    onSelectStep: (step: Routine) => void
    onAddStep: (name: string) => void
    onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  }
  ```
- Renders the "Steps" heading, the dnd `SortableContext` of `StepRow`s (drag handle + name + dose summary), and the "Add a step" input + button — i.e. the exact markup currently at `TapCollectionPanel.tsx` lines 88–112 (plus the `StepRow` at lines 28–46). Behavior identical.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/sections/RoutineStepsSection.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RoutineStepsSection } from './RoutineStepsSection'
import type { Routine } from '@/types/actionable'

function step(id: string, name: string, order: number): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    parent_routine_id: 'c1', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

function setup(overrides = {}) {
  const props = {
    steps: [step('s1', 'Chin tuck', 0), step('s2', 'Nerve glide', 1)],
    onSelectStep: vi.fn(), onAddStep: vi.fn(), onReorderSteps: vi.fn(), ...overrides,
  }
  render(<RoutineStepsSection {...props} />)
  return props
}

describe('RoutineStepsSection', () => {
  it('renders each step', () => {
    setup()
    expect(screen.getByText('Chin tuck')).toBeInTheDocument()
    expect(screen.getByText('Nerve glide')).toBeInTheDocument()
  })
  it('adding a step reports the typed name', () => {
    const { onAddStep } = setup()
    fireEvent.change(screen.getByLabelText(/add a step/i), { target: { value: 'Pendulum' } })
    fireEvent.click(screen.getByRole('button', { name: /^add step$/i }))
    expect(onAddStep).toHaveBeenCalledWith('Pendulum')
  })
  it('clicking a step opens it', () => {
    const { onSelectStep } = setup()
    fireEvent.click(screen.getByText('Chin tuck'))
    expect(onSelectStep).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })
})
```

- [ ] **Step 2: Run test — verify FAIL** (`npx vitest run src/components/surface/sections/RoutineStepsSection.test.tsx`) — cannot resolve module.

- [ ] **Step 3: Implement** — copy the `StepRow` component and the Steps `<section>` (heading + DndContext/SortableContext + add-step input) verbatim from `TapCollectionPanel.tsx` (read lines 1–14 for imports, 28–46 for `StepRow`, 88–112 for the section, 50–63 for the `draft`/`addStep`/`onDragEnd` logic) into the new file. The component owns the `draft` state and `onDragEnd`/`addStep` handlers (which now reference `props.steps`/`props.onReorderSteps`/`props.onAddStep`/`props.onSelectStep`).

- [ ] **Step 4: Run test — verify PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/RoutineStepsSection.tsx src/components/surface/sections/RoutineStepsSection.test.tsx
git commit -m "feat(routines): extract reusable RoutineStepsSection"
```

---

## Task 2: Add optional Steps section to `TapRoutinePanel`

**Files:** Modify `src/components/surface/TapRoutinePanel.tsx` + test.

**Interfaces:**
- Consumes `RoutineStepsSection` (Task 1).
- Adds optional props to `TapRoutinePanel`:
  ```typescript
  steps?: Routine[]
  onSelectStep?: (step: Routine) => void
  onAddStep?: (name: string) => void
  onReorderSteps?: (writes: { id: string; step_order: number }[]) => void
  ```
- Renders `<RoutineStepsSection ...>` (inside a bordered section) **only when** `onAddStep && onSelectStep && onReorderSteps && steps` are all provided. When absent (e.g. Today-tap), nothing new renders.

- [ ] **Step 1: Write the failing test (add to TapRoutinePanel.test.tsx)**

```tsx
import type { Routine } from '@/types/actionable'

it('renders a Steps section when step handlers + steps are provided', () => {
  const steps = [{ ...routine, id: 'st1', name: 'Chin tuck', parent_routine_id: routine.id } as Routine]
  render(
    <TapRoutinePanel
      routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()}
      steps={steps} onSelectStep={vi.fn()} onAddStep={vi.fn()} onReorderSteps={vi.fn()}
    />,
  )
  expect(screen.getByText('Chin tuck')).toBeInTheDocument()
  expect(screen.getByLabelText(/add a step/i)).toBeInTheDocument()
})

it('does NOT render a Steps section when step handlers are absent (Today-tap parity)', () => {
  render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
  expect(screen.queryByLabelText(/add a step/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — verify FAIL** (`npx vitest run src/components/surface/TapRoutinePanel.test.tsx`) — no Steps section.

- [ ] **Step 3: Implement** — import `RoutineStepsSection` and `Routine`; add the four optional props; render the section (gated on all four being present) in a sensible spot (e.g. after the schedule section, before Notes):

```tsx
{props.steps && props.onSelectStep && props.onAddStep && props.onReorderSteps && (
  <section className="pb-4 mb-4 border-b border-neutral-200">
    <RoutineStepsSection
      steps={props.steps}
      onSelectStep={props.onSelectStep}
      onAddStep={props.onAddStep}
      onReorderSteps={props.onReorderSteps}
    />
  </section>
)}
```

- [ ] **Step 4: Run test — verify PASS** (existing TapRoutinePanel tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapRoutinePanel.tsx src/components/surface/TapRoutinePanel.test.tsx
git commit -m "feat(routines): optional Steps section in TapRoutinePanel (unified editor)"
```

---

## Task 3: Route list editing/create through `TapRoutinePanel`; retire `TapCollectionPanel`

**Files:** Modify `src/components/routine/RoutinesListRedesign.tsx` + test.

**Goal:** In the overlay, replace `<TapCollectionPanel>` with `<TapRoutinePanel>` (passing steps + all handlers). Route **standalone** routine row clicks to open this panel too (not the legacy `RoutineForm`). Create already opens the panel via `setOpen({kind:'collection', id})` — keep that; it now opens the unified panel.

**Interfaces (handlers to wire on the unified `TapRoutinePanel`, using the existing `openCollection` resolution which wraps a childless routine as `{...r, steps:[]}`):**
- `routine={openCollection}` (it's a `RoutineWithSteps`; `TapRoutinePanel` accepts a `Routine`, and `RoutineWithSteps extends Routine`, so it's assignable).
- `familyMembers={familyMembers}` (already a prop of the list).
- `onRename` → `onUpdateRoutine(openCollection.id, { name })`
- `onContextChange` → `onUpdateRoutine(openCollection.id, { context: context ?? null })`
- `onVisibilityChange` → `onUpdateRoutine(openCollection.id, { visibility })`
- `onAssignChange` → `onUpdateRoutine(openCollection.id, { assigned_to_all: memberIds })`
- `onScheduleChange` (pattern, timeOfDay) → `onUpdateRoutine(openCollection.id, { recurrence_pattern: pattern, time_of_day: timeOfDay || null })`
- `onNotesChange` → `onUpdateRoutine(openCollection.id, { description })`
- `steps={openCollection.steps}`, `onSelectStep={s => setOpen({kind:'step', id:s.id})}`, `onAddStep={name => onAddStep(openCollection.id, name)}`, `onReorderSteps={onReorderSteps}`.

- [ ] **Step 1: Update tests (RED)** — in `RoutinesListRedesign.test.tsx`:
  - The standalone-row click test currently expects `onSelectRoutine` to fire. Change the intent: clicking a standalone routine now opens the editor panel. Update that test to assert the panel opens (e.g., the routine's name appears in an editable header / a "Steps" affordance like the "Add a step" input appears) rather than `onSelectRoutine` being called. (If you keep `onSelectRoutine` for some other entry, note it; otherwise the standalone click goes through `setOpen`.)
  - The create test should still pass (panel opens) — confirm it queries something `TapRoutinePanel` shows (e.g. `/add a step/i`).

  Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx` → FAIL on the updated standalone assertion.

- [ ] **Step 2: Implement** — read the current overlay render block (the `openCollection`/`openStep` rendering). Replace `<TapCollectionPanel ...>` with `<TapRoutinePanel ...>` wired per the Interfaces above (keep the existing `key={openCollection.id}` if present; add one if not). Change the standalone routine row's onClick from `onSelectRoutine(routine)` to `setOpen({ kind: 'collection', id: routine.id })` (the `openCollection` fallback already wraps a childless routine as `{...r, steps:[]}`). Remove the `TapCollectionPanel` import. Keep `<TapStepPanel>` for `openStep`.

- [ ] **Step 3: Run tests — GREEN** (`npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`).

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`. Expected: no errors. (If `onSelectRoutine` prop becomes unused, keep it optional or remove cleanly; if `RoutineForm`/route still references it, leave it.)

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): unified TapRoutinePanel for all routine create/edit in the list"
```

---

## Task 4: Remove `TapCollectionPanel` + verify

**Files:** Delete `TapCollectionPanel.tsx` + `TapCollectionPanel.test.tsx` (only if no imports remain).

- [ ] **Step 1: Confirm unused**

Run: `grep -rn "TapCollectionPanel" src` — expected: no references except the files themselves.

- [ ] **Step 2: Delete**

```bash
git rm src/components/surface/TapCollectionPanel.tsx src/components/surface/TapCollectionPanel.test.tsx
```

- [ ] **Step 3: Routines suites + full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/components/surface/sections/RoutineStepsSection.test.tsx src/components/surface/TapRoutinePanel.test.tsx \
  src/components/surface/TapStepPanel.test.tsx src/components/routine/RoutinesListRedesign.test.tsx
npx vitest run 2>&1 | tail -6
npm run build 2>&1 | tail -4
```
Expected: all green; `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(routines): remove TapCollectionPanel (merged into TapRoutinePanel)"
```

---

## Self-Review

- **Spec coverage:** one editor with assignee/schedule/context/visibility/notes + optional steps (T2 on TapRoutinePanel, which already has the rich fields); used for create + edit of standalone AND multi-step (T3 routes all clicks + create); add-steps-to-existing-simple-routine now works (any routine opens the unified panel with an Add-step input). ✓
- **Today-tap parity:** Steps section is gated on step handlers; Today-tap passes none → unchanged (T2 negative test). ✓
- **Placeholder scan:** test code complete; T1 references exact `TapCollectionPanel` line ranges to copy; T3 lists exact handler wiring.
- **Type consistency:** `RoutineStepsSection` props identical T1/T2; `{id, step_order}[]` reorder shape consistent; `RoutineWithSteps extends Routine` so `openCollection` is assignable to `TapRoutinePanel.routine`.
- **Flagged follow-ups (not in scope):** legacy `RoutineForm` + the NL natural-language quick-create remain at the `/routines/new` and `/:routineId` routes (not deleted) — a future cleanup can decide whether to retire them; suppress 0-applicable-step collection from Today (prior plan's note).
