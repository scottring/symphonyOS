# Routine Editing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person create and edit routine collections by hand — a two-level Routines page, live-save collection/step panels with dose pills, multi-select "group into routine", and dnd-kit step reorder.

**Architecture:** Spec #1 already shipped the model (`parent_routine_id`, `step_order`, `times_per_day`) and Today rendering. This plan is UI + a few CRUD wirings on top of the existing `useRoutines` hook. Pure ordering logic is extracted to a testable module; two new `surface/` panels follow the live-save `TapRoutinePanel` pattern; the existing `RoutinesListRedesign` becomes a two-level list. No schema migration.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Vitest + React Testing Library, `@dnd-kit/core` + `@dnd-kit/sortable@10`, Supabase via `useRoutines`.

## Global Constraints

- Work in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections` (branch `routine-collections`). Never edit the main worktree.
- Node PATH for all commands: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Run a single test file with: `npx vitest run <path>`. `npm test` is watch mode — never use it in a one-shot.
- No emojis in UI — use `lucide-react` icons only.
- `Routine` type is imported from `@/types/actionable` (or `@/types/routine`, which re-exports it). It includes `parent_routine_id`, `step_order`, `times_per_day`, `image_url`.
- Time strings are `'HH:MM'`. Stored `times_per_day` / `time_of_day` may carry seconds; always `.slice(0, 5)` for display/compare.
- Live-save: panels call handler props immediately on change — no Save button (mirrors `TapRoutinePanel`).
- Inherited-not-overridden (Fork C): step panels show context/assignment/recurrence read-only; no per-step override in v2.
- Grouping is non-destructive (Fork B): it only writes `parent_routine_id` + `step_order`; it never rewrites a child's stored context/assignment/recurrence.
- Backward-compat: parentless routines must render and behave exactly as today.

---

## File Structure

**Create:**
- `src/lib/today/stepOrdering.ts` — pure helpers for `step_order` (next order, normalize, reorder-by-drag).
- `src/lib/today/stepOrdering.test.ts` — unit tests for the above.
- `src/components/surface/TapStepPanel.tsx` — lightweight step editor (name, dose pills, image, notes, re-parent).
- `src/components/surface/TapStepPanel.test.tsx` — render/behavior tests.
- `src/components/surface/TapCollectionPanel.tsx` — collection editor (name/context/assignment/recurrence/notes + embedded sortable step list).
- `src/components/surface/TapCollectionPanel.test.tsx` — render/behavior tests.
- `src/components/surface/sections/DosePills.tsx` — add/remove time-chip editor for `times_per_day`.
- `src/components/surface/sections/DosePills.test.tsx` — tests.

**Modify:**
- `src/components/routine/RoutinesListRedesign.tsx` — two-level rendering, multi-select grouping, panel open state.
- `src/apps/routines/RoutinesApp.tsx` — wire new handlers (create collection, group, add step, reorder, delete, reparent) to `useRoutines`.

**Touch for tests only:**
- `src/lib/today/routineCollections.test.ts` — already exists; no change required (grouping already covered) unless a gap surfaces.

---

## Task 1: Pure `step_order` helpers

**Files:**
- Create: `src/lib/today/stepOrdering.ts`
- Test: `src/lib/today/stepOrdering.test.ts`

**Interfaces:**
- Produces:
  - `nextStepOrder(steps: Routine[]): number` — the order to assign a newly added step (max existing order + 1, or `steps.length` if none have orders).
  - `normalizeStepOrders(orderedIds: string[]): { id: string; step_order: number }[]` — assign gap-free `0..n-1` in the given id order.
  - `reorderByDrag(orderedSteps: Routine[], activeId: string, overId: string): { id: string; step_order: number }[]` — move `activeId` to `overId`'s slot (arrayMove semantics) and return normalized writes for every step.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/today/stepOrdering.test.ts
import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { nextStepOrder, normalizeStepOrders, reorderByDrag } from './stepOrdering'

function step(id: string, order: number | null): Routine {
  return {
    id, user_id: 'u', name: id, recurrence_pattern: { type: 'daily' },
    visibility: 'active', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

describe('stepOrdering', () => {
  it('nextStepOrder returns max order + 1', () => {
    expect(nextStepOrder([step('a', 0), step('b', 2)])).toBe(3)
  })
  it('nextStepOrder falls back to length when no orders set', () => {
    expect(nextStepOrder([step('a', null), step('b', null)])).toBe(2)
  })
  it('nextStepOrder is 0 for an empty collection', () => {
    expect(nextStepOrder([])).toBe(0)
  })
  it('normalizeStepOrders assigns gap-free 0..n-1', () => {
    expect(normalizeStepOrders(['x', 'y', 'z'])).toEqual([
      { id: 'x', step_order: 0 }, { id: 'y', step_order: 1 }, { id: 'z', step_order: 2 },
    ])
  })
  it('reorderByDrag moves active before over and renormalizes', () => {
    const steps = [step('a', 0), step('b', 1), step('c', 2)]
    // drag 'c' onto 'a' → order becomes c, a, b
    expect(reorderByDrag(steps, 'c', 'a')).toEqual([
      { id: 'c', step_order: 0 }, { id: 'a', step_order: 1 }, { id: 'b', step_order: 2 },
    ])
  })
  it('reorderByDrag is a no-op set when active === over', () => {
    const steps = [step('a', 0), step('b', 1)]
    expect(reorderByDrag(steps, 'a', 'a')).toEqual([
      { id: 'a', step_order: 0 }, { id: 'b', step_order: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/stepOrdering.test.ts`
Expected: FAIL — `Failed to resolve import './stepOrdering'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/today/stepOrdering.ts
import type { Routine } from '@/types/actionable'
import { arrayMove } from '@dnd-kit/sortable'

/** The step_order to assign a newly added step in this collection. */
export function nextStepOrder(steps: Routine[]): number {
  const orders = steps.map(s => s.step_order).filter((o): o is number => o != null)
  if (orders.length === 0) return steps.length
  return Math.max(...orders) + 1
}

/** Assign gap-free 0..n-1 step_order in the given id order. */
export function normalizeStepOrders(orderedIds: string[]): { id: string; step_order: number }[] {
  return orderedIds.map((id, i) => ({ id, step_order: i }))
}

/** Move activeId into overId's position (arrayMove) and return normalized writes for all steps. */
export function reorderByDrag(
  orderedSteps: Routine[],
  activeId: string,
  overId: string,
): { id: string; step_order: number }[] {
  const ids = orderedSteps.map(s => s.id)
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1) return normalizeStepOrders(ids)
  return normalizeStepOrders(arrayMove(ids, from, to))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/stepOrdering.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/stepOrdering.ts src/lib/today/stepOrdering.test.ts
git commit -m "feat(routines): pure step_order helpers (next/normalize/reorder)"
```

---

## Task 2: Dose-pills editor (`DosePills`)

**Files:**
- Create: `src/components/surface/sections/DosePills.tsx`
- Test: `src/components/surface/sections/DosePills.test.tsx`

**Interfaces:**
- Produces: `DosePills` component.
  - Props: `{ times: string[]; onChange: (times: string[]) => void }`.
  - Renders each time as a chip with a remove button (`aria-label="Remove {time}"`); an `<input type="time">` + "Add" button appends. `onChange` receives the sorted, de-duped `'HH:MM'` list.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/sections/DosePills.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DosePills } from './DosePills'

describe('DosePills', () => {
  it('renders a chip per time', () => {
    render(<DosePills times={['09:00', '18:00']} onChange={vi.fn()} />)
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('removing a chip reports the remaining times', () => {
    const onChange = vi.fn()
    render(<DosePills times={['09:00', '18:00']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /remove 09:00/i }))
    expect(onChange).toHaveBeenCalledWith(['18:00'])
  })

  it('adding a time appends it sorted and de-duped', () => {
    const onChange = vi.fn()
    render(<DosePills times={['18:00']} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/add a dose time/i), { target: { value: '08:30' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).toHaveBeenCalledWith(['08:30', '18:00'])
  })

  it('ignores a duplicate add', () => {
    const onChange = vi.fn()
    render(<DosePills times={['08:30']} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/add a dose time/i), { target: { value: '08:30' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/surface/sections/DosePills.test.tsx`
Expected: FAIL — cannot resolve `./DosePills`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/surface/sections/DosePills.tsx
import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface DosePillsProps {
  times: string[]
  onChange: (times: string[]) => void
}

function norm(t: string): string {
  return t.slice(0, 5)
}

export function DosePills({ times, onChange }: DosePillsProps) {
  const [draft, setDraft] = useState('')

  const remove = (t: string) => onChange(times.filter(x => norm(x) !== norm(t)))

  const add = () => {
    if (!draft) return
    const next = norm(draft)
    if (times.some(x => norm(x) === next)) return
    onChange([...times.map(norm), next].sort())
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {times.map(t => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 text-primary-700 text-sm px-2.5 py-1">
            {norm(t)}
            <button type="button" aria-label={`Remove ${norm(t)}`} onClick={() => remove(t)} className="hover:text-primary-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {times.length === 0 && <span className="text-sm text-neutral-500">No set times — runs once.</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          aria-label="Add a dose time"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="input-base text-sm py-1 px-2"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-900">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/surface/sections/DosePills.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/DosePills.tsx src/components/surface/sections/DosePills.test.tsx
git commit -m "feat(routines): DosePills editor for times_per_day"
```

---

## Task 3: Step editor panel (`TapStepPanel`)

**Files:**
- Create: `src/components/surface/TapStepPanel.tsx`
- Test: `src/components/surface/TapStepPanel.test.tsx`

**Interfaces:**
- Consumes: `DosePills` (Task 2), `PanelHeader`, `PanelWhy` (existing in `surface/sections/`).
- Produces: `TapStepPanel` component.
  - Props:
    ```typescript
    interface TapStepPanelProps {
      step: Routine
      parentName: string
      onClose: () => void
      onRename: (name: string) => void
      onDosesChange: (times: string[]) => void
      onNotesChange: (next: string) => void
      onPromote: () => void   // un-parent → standalone
    }
    ```
  - Shows the parent name as the read-only inherited context line, the dose pills (bound to `step.times_per_day ?? []`), notes, and a "Remove from collection" button calling `onPromote`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/TapStepPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapStepPanel } from './TapStepPanel'
import type { Routine } from '@/types/actionable'

const step: Routine = {
  id: 's1', user_id: 'u1', name: 'Chin tuck', description: 'Tuck chin, hold 5s',
  recurrence_pattern: { type: 'daily' }, visibility: 'active',
  times_per_day: ['09:00', '18:00'], parent_routine_id: 'c1', step_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
} as Routine

function setup(overrides = {}) {
  const props = {
    step, parentName: 'Shoulder HEP', onClose: vi.fn(), onRename: vi.fn(),
    onDosesChange: vi.fn(), onNotesChange: vi.fn(), onPromote: vi.fn(), ...overrides,
  }
  render(<TapStepPanel {...props} />)
  return props
}

describe('TapStepPanel', () => {
  it('renders the step name and its dose times', () => {
    setup()
    expect(screen.getByText('Chin tuck')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('shows the inherited parent as read-only context', () => {
    setup()
    expect(screen.getByText(/inherited from Shoulder HEP/i)).toBeInTheDocument()
  })

  it('removing a dose reports the remaining times', () => {
    const { onDosesChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /remove 09:00/i }))
    expect(onDosesChange).toHaveBeenCalledWith(['18:00'])
  })

  it('promotes the step to standalone', () => {
    const { onPromote } = setup()
    fireEvent.click(screen.getByRole('button', { name: /remove from collection/i }))
    expect(onPromote).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/surface/TapStepPanel.test.tsx`
Expected: FAIL — cannot resolve `./TapStepPanel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/surface/TapStepPanel.tsx
import { Link2Off } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import { PanelHeader } from './sections/PanelHeader'
import { PanelWhy } from './sections/PanelWhy'
import { DosePills } from './sections/DosePills'

interface TapStepPanelProps {
  step: Routine
  parentName: string
  onClose: () => void
  onRename: (name: string) => void
  onDosesChange: (times: string[]) => void
  onNotesChange: (next: string) => void
  onPromote: () => void
}

export function TapStepPanel(props: TapStepPanelProps) {
  const { step, parentName } = props
  const times = (step.times_per_day ?? []).map(t => t.slice(0, 5))

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader title={step.name} onTitleChange={props.onRename} onClose={props.onClose} />

      <p className="text-xs text-neutral-500 mb-4">
        Context, people and schedule are <span className="font-medium">inherited from {parentName}</span>.
      </p>

      <section className="pb-4 mb-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Dose times</h3>
        <DosePills times={times} onChange={props.onDosesChange} />
      </section>

      <PanelWhy key={step.id} label="Instructions" notes={step.description ?? undefined} onChange={props.onNotesChange} />

      <button
        type="button"
        onClick={props.onPromote}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-red-600"
      >
        <Link2Off className="w-4 h-4" /> Remove from collection
      </button>
    </article>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/surface/TapStepPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapStepPanel.tsx src/components/surface/TapStepPanel.test.tsx
git commit -m "feat(routines): TapStepPanel — lightweight step editor with dose pills"
```

---

## Task 4: Collection editor panel (`TapCollectionPanel`)

**Files:**
- Create: `src/components/surface/TapCollectionPanel.tsx`
- Test: `src/components/surface/TapCollectionPanel.test.tsx`

**Interfaces:**
- Consumes: `PanelHeader`, `PanelWhy`, `ContextPicker`, `RoutineScheduleEditor`; `nextStepOrder` + `reorderByDrag` (Task 1); `@dnd-kit/core` + `@dnd-kit/sortable`.
- Produces: `TapCollectionPanel` component.
  - Props:
    ```typescript
    interface TapCollectionPanelProps {
      collection: RoutineWithSteps
      onClose: () => void
      onRename: (name: string) => void
      onContextChange: (context: TaskContext | undefined) => void
      onScheduleChange: (pattern: RecurrencePattern, timeOfDay: string) => void
      onNotesChange: (next: string) => void
      onSelectStep: (step: Routine) => void
      onAddStep: (name: string) => void
      onReorderSteps: (writes: { id: string; step_order: number }[]) => void
    }
    ```
  - Renders the step list (already ordered by `groupRoutineSteps`) as a `SortableContext`; dragging reorders via `reorderByDrag` → `onReorderSteps`. An "Add step" input calls `onAddStep`. Clicking a step row calls `onSelectStep`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/TapCollectionPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapCollectionPanel } from './TapCollectionPanel'
import type { Routine, RoutineWithSteps } from '@/types/actionable'

function step(id: string, name: string, order: number): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    parent_routine_id: 'c1', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

const collection: RoutineWithSteps = {
  id: 'c1', user_id: 'u1', name: 'Shoulder HEP', recurrence_pattern: { type: 'daily' },
  visibility: 'active', context: 'personal',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  steps: [step('s1', 'Chin tuck', 0), step('s2', 'Nerve glide', 1)],
} as RoutineWithSteps

function setup(overrides = {}) {
  const props = {
    collection, onClose: vi.fn(), onRename: vi.fn(), onContextChange: vi.fn(),
    onScheduleChange: vi.fn(), onNotesChange: vi.fn(), onSelectStep: vi.fn(),
    onAddStep: vi.fn(), onReorderSteps: vi.fn(), ...overrides,
  }
  render(<TapCollectionPanel {...props} />)
  return props
}

describe('TapCollectionPanel', () => {
  it('renders the collection name and each step', () => {
    setup()
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/surface/TapCollectionPanel.test.tsx`
Expected: FAIL — cannot resolve `./TapCollectionPanel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/surface/TapCollectionPanel.tsx
import { useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import type { Routine, RoutineWithSteps } from '@/types/actionable'
import type { TaskContext } from '@/types/task'
import type { RecurrencePattern } from '@/types/actionable'
import { PanelHeader } from './sections/PanelHeader'
import { PanelWhy } from './sections/PanelWhy'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { RoutineScheduleEditor } from '@/components/routine/RoutineScheduleEditor'
import { reorderByDrag } from '@/lib/today/stepOrdering'

interface TapCollectionPanelProps {
  collection: RoutineWithSteps
  onClose: () => void
  onRename: (name: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onScheduleChange: (pattern: RecurrencePattern, timeOfDay: string) => void
  onNotesChange: (next: string) => void
  onSelectStep: (step: Routine) => void
  onAddStep: (name: string) => void
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
}

function StepRow({ step, onSelect }: { step: Routine; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const dosed = (step.times_per_day ?? []).map(t => t.slice(0, 5))
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-2"
    >
      <button type="button" aria-label={`Reorder ${step.name}`} className="text-neutral-400 cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex-1 text-left text-sm text-neutral-800">
        {step.name}
        {dosed.length > 0 && <span className="ml-2 text-xs text-neutral-500">{dosed.join(', ')}</span>}
      </button>
    </div>
  )
}

export function TapCollectionPanel(props: TapCollectionPanelProps) {
  const { collection } = props
  const [draft, setDraft] = useState('')
  const [editingSchedule, setEditingSchedule] = useState(false)

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    props.onReorderSteps(reorderByDrag(collection.steps, String(e.active.id), String(e.over.id)))
  }

  const addStep = () => {
    const name = draft.trim()
    if (!name) return
    props.onAddStep(name)
    setDraft('')
  }

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader title={collection.name} onTitleChange={props.onRename} onClose={props.onClose} />

      <section className="pb-4 mb-4 border-b border-neutral-200 flex flex-col gap-3">
        <ContextPicker value={collection.context ?? undefined} onChange={props.onContextChange} />
        {editingSchedule ? (
          <div className="rounded-xl border border-neutral-200 p-3">
            <RoutineScheduleEditor
              size="sm"
              recurrencePattern={collection.recurrence_pattern}
              timeOfDay={(collection.time_of_day ?? '').slice(0, 5)}
              onChange={({ recurrencePattern, timeOfDay }) => props.onScheduleChange(recurrencePattern, timeOfDay)}
            />
            <button onClick={() => setEditingSchedule(false)} className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-700">Done</button>
          </div>
        ) : (
          <button onClick={() => setEditingSchedule(true)} className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-neutral-100 text-sm text-neutral-700 hover:bg-neutral-200">
            <span>Schedule</span><span className="text-xs text-neutral-500">Edit schedule</span>
          </button>
        )}
      </section>

      <section className="pb-4 mb-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Steps</h3>
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={collection.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {collection.steps.map(s => (
                <StepRow key={s.id} step={s} onSelect={() => props.onSelectStep(s)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="flex items-center gap-2 mt-3">
          <input
            aria-label="Add a step"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStep() }}
            placeholder="New step name"
            className="input-base text-sm py-1 px-2 flex-1"
          />
          <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-900">
            <Plus className="w-4 h-4" /> Add step
          </button>
        </div>
      </section>

      <PanelWhy key={collection.id} label="Notes" notes={collection.description ?? undefined} onChange={props.onNotesChange} />
    </article>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/surface/TapCollectionPanel.test.tsx`
Expected: PASS (3 tests). (dnd-kit renders without a pointer in jsdom; the reorder path is unit-tested in Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapCollectionPanel.tsx src/components/surface/TapCollectionPanel.test.tsx
git commit -m "feat(routines): TapCollectionPanel — collection editor + sortable steps"
```

---

## Task 5: Two-level rendering + panel state in `RoutinesListRedesign`

**Files:**
- Modify: `src/components/routine/RoutinesListRedesign.tsx`
- Test: `src/components/routine/RoutinesListRedesign.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `groupRoutineSteps` (`@/lib/today/routineCollections`), `TapCollectionPanel`, `TapStepPanel`.
- Adds these props to `RoutinesListProps`:
  ```typescript
  onUpdateRoutine: (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void   // already present
  onAddStep: (collectionId: string, name: string) => void
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  onPromoteStep: (stepId: string) => void
  ```
- Produces: collection rows render expandable; clicking a collection opens `TapCollectionPanel`; clicking a step opens `TapStepPanel`. Standalone routines render via the existing path unchanged.

Notes for the implementer: `RoutinesListRedesign` currently receives `routines`, `onSelectRoutine`, `onCreateRoutine`, `onUpdateRoutine`. Keep `onSelectRoutine` for standalone routines (still navigates to `RoutineForm`). Feed `routines` through `groupRoutineSteps` and render `collections` above `standalone`. Maintain panel state with `useState<{ kind: 'collection'; id: string } | { kind: 'step'; id: string } | null>`. Render the active panel in a fixed overlay (`fixed inset-0 z-50 flex items-center justify-center bg-black/30`) so it behaves like the existing tap panels. Live-save handlers map to props: rename/context/schedule/notes → `onUpdateRoutine(id, …)`; add step → `onAddStep`; reorder → `onReorderSteps`; promote → `onPromoteStep`. Re-derive the open collection/step from `groupRoutineSteps(routines)` each render so edits reflect immediately.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/routine/RoutinesListRedesign.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RoutinesListRedesign } from './RoutinesListRedesign'
import type { Routine } from '@/types/actionable'

function r(id: string, name: string, extra: Partial<Routine> = {}): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...extra,
  } as Routine
}

const routines: Routine[] = [
  r('c1', 'Shoulder HEP'),
  r('s1', 'Chin tuck', { parent_routine_id: 'c1', step_order: 0 }),
  r('s2', 'Nerve glide', { parent_routine_id: 'c1', step_order: 1 }),
  r('flat', 'Trash night'),
]

function setup(overrides = {}) {
  const props = {
    routines, onSelectRoutine: vi.fn(), onCreateRoutine: vi.fn(), onUpdateRoutine: vi.fn(),
    onAddStep: vi.fn(), onReorderSteps: vi.fn(), onPromoteStep: vi.fn(), ...overrides,
  }
  render(<RoutinesListRedesign {...props} />)
  return props
}

describe('RoutinesListRedesign two-level', () => {
  it('renders a collection row and the standalone routine', () => {
    setup()
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
    expect(screen.getByText('Trash night')).toBeInTheDocument()
  })

  it('marks the collection with its step count', () => {
    setup()
    expect(screen.getByText(/2 steps/i)).toBeInTheDocument()
  })

  it('clicking a standalone routine uses the existing onSelectRoutine path', () => {
    const { onSelectRoutine } = setup()
    fireEvent.click(screen.getByText('Trash night'))
    expect(onSelectRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: 'flat' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`
Expected: FAIL — "2 steps" not found (and possibly the new props are unused), proving the two-level render isn't there yet.

- [ ] **Step 3: Implement two-level rendering + panel state**

In `src/components/routine/RoutinesListRedesign.tsx`:
1. Add imports:
   ```tsx
   import { groupRoutineSteps } from '@/lib/today/routineCollections'
   import { TapCollectionPanel } from '@/components/surface/TapCollectionPanel'
   import { TapStepPanel } from '@/components/surface/TapStepPanel'
   import type { UpdateRoutineInput } from '@/hooks/useRoutines'
   ```
2. Extend `RoutinesListProps` with `onAddStep`, `onReorderSteps`, `onPromoteStep` (signatures in Interfaces above) and ensure `onUpdateRoutine` is typed `(id: string, updates: UpdateRoutineInput) => Promise<boolean> | void`.
3. In the component body, derive: `const { collections, standalone } = groupRoutineSteps(routines)`.
4. Render `collections` as rows (name + `{steps.length} steps` + a chevron) above the existing standalone list. Render `standalone` with the existing row component/click handler (`onSelectRoutine`).
5. Add panel state:
   ```tsx
   const [open, setOpen] = useState<{ kind: 'collection' | 'step'; id: string } | null>(null)
   const openCollection = open?.kind === 'collection' ? collections.find(c => c.id === open.id) : undefined
   const openStep = open?.kind === 'step'
     ? collections.flatMap(c => c.steps).find(s => s.id === open.id)
     : undefined
   const parentOfOpenStep = openStep ? collections.find(c => c.steps.some(s => s.id === openStep.id)) : undefined
   ```
6. Render the overlay when a panel is open:
   ```tsx
   {(openCollection || openStep) && (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(null)}>
       <div onClick={e => e.stopPropagation()}>
         {openCollection && (
           <TapCollectionPanel
             collection={openCollection}
             onClose={() => setOpen(null)}
             onRename={name => onUpdateRoutine(openCollection.id, { name })}
             onContextChange={context => onUpdateRoutine(openCollection.id, { context: context ?? null })}
             onScheduleChange={(recurrence_pattern, timeOfDay) =>
               onUpdateRoutine(openCollection.id, { recurrence_pattern, time_of_day: timeOfDay || null })}
             onNotesChange={description => onUpdateRoutine(openCollection.id, { description })}
             onSelectStep={s => setOpen({ kind: 'step', id: s.id })}
             onAddStep={name => onAddStep(openCollection.id, name)}
             onReorderSteps={onReorderSteps}
           />
         )}
         {openStep && parentOfOpenStep && (
           <TapStepPanel
             step={openStep}
             parentName={parentOfOpenStep.name}
             onClose={() => setOpen({ kind: 'collection', id: parentOfOpenStep.id })}
             onRename={name => onUpdateRoutine(openStep.id, { name })}
             onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
             onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
             onPromote={() => { onPromoteStep(openStep.id); setOpen({ kind: 'collection', id: parentOfOpenStep.id }) }}
           />
         )}
       </div>
     </div>
   )}
   ```
7. Wire a collection row's click to `setOpen({ kind: 'collection', id: c.id })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck the changed file's module graph**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors referencing `RoutinesListRedesign`, `TapCollectionPanel`, `TapStepPanel`.

- [ ] **Step 6: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): two-level Routines list with collection/step panels"
```

---

## Task 6: Multi-select "Group into routine" + "New collection"

**Files:**
- Modify: `src/components/routine/RoutinesListRedesign.tsx`
- Test: `src/components/routine/RoutinesListRedesign.test.tsx` (extend)

**Interfaces:**
- Adds props:
  ```typescript
  onCreateCollection: (name: string) => void
  onGroupIntoCollection: (name: string, routineIds: string[]) => void
  ```
- Produces: a "Select" toggle that shows checkboxes on **standalone** rows; selecting ≥2 reveals a "Group into routine" action that prompts for a name and calls `onGroupIntoCollection(name, selectedIds)`. A "New collection" button calls `onCreateCollection(name)`.

Notes: use a simple `window.prompt` for the collection name in v2 (YAGNI — a styled name dialog can come later); the test stubs `window.prompt`.

- [ ] **Step 1: Write the failing test (append to the existing describe)**

```tsx
it('group mode: selecting two standalone routines and grouping reports their ids', () => {
  const onGroupIntoCollection = vi.fn()
  vi.spyOn(window, 'prompt').mockReturnValue('Morning')
  // Two standalone routines so we can select both
  const rs = [r('a', 'Make bed'), r('b', 'Brush teeth')]
  render(<RoutinesListRedesign
    routines={rs} onSelectRoutine={vi.fn()} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
    onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
    onCreateCollection={vi.fn()} onGroupIntoCollection={onGroupIntoCollection} />)
  fireEvent.click(screen.getByRole('button', { name: /^select$/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /select make bed/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /select brush teeth/i }))
  fireEvent.click(screen.getByRole('button', { name: /group into routine/i }))
  expect(onGroupIntoCollection).toHaveBeenCalledWith('Morning', expect.arrayContaining(['a', 'b']))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx -t "group mode"`
Expected: FAIL — no "Select" button / checkboxes.

- [ ] **Step 3: Implement multi-select grouping**

In `RoutinesListRedesign.tsx`:
1. Add the two props to `RoutinesListProps`.
2. Add state: `const [selecting, setSelecting] = useState(false)` and `const [selected, setSelected] = useState<Set<string>>(new Set())`.
3. Add a "Select" toggle button near the existing "New Routine" button: `onClick={() => { setSelecting(v => !v); setSelected(new Set()) }}`.
4. When `selecting`, render a checkbox on each **standalone** row: `<input type="checkbox" aria-label={`Select ${routine.name}`} checked={selected.has(routine.id)} onChange={() => toggleSelected(routine.id)} />` where `toggleSelected` adds/removes from the set.
5. When `selected.size >= 2`, show a footer button:
   ```tsx
   <button onClick={() => {
     const name = window.prompt('Name this routine collection')?.trim()
     if (!name) return
     onGroupIntoCollection(name, Array.from(selected))
     setSelecting(false); setSelected(new Set())
   }}>Group into routine</button>
   ```
6. Add a "New collection" button: `onClick={() => { const name = window.prompt('Name the new collection')?.trim(); if (name) onCreateCollection(name) }}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx`
Expected: PASS (all, including the new group-mode test).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): multi-select Group into routine + New collection"
```

---

## Task 7: Wire handlers in `RoutinesApp` to `useRoutines`

**Files:**
- Modify: `src/apps/routines/RoutinesApp.tsx`

**Interfaces:**
- Consumes: `useRoutines` (`addRoutine`, `updateRoutine`, `deleteRoutine`, `routines`); `groupRoutineSteps`, `nextStepOrder`.
- Produces: the concrete handlers passed into `RoutinesListRedesign`:
  - `onAddStep(collectionId, name)` → `addRoutine({ name, parent_routine_id: collectionId, step_order: nextStepOrder(thatCollectionSteps) })`.
  - `onReorderSteps(writes)` → `Promise.all(writes.map(w => updateRoutine(w.id, { step_order: w.step_order })))`.
  - `onPromoteStep(stepId)` → `updateRoutine(stepId, { parent_routine_id: null, step_order: null })`.
  - `onCreateCollection(name)` → `addRoutine({ name })` (parentless empty parent; becomes a collection once it has steps).
  - `onGroupIntoCollection(name, ids)` → `addRoutine({ name })` then for each id `updateRoutine(id, { parent_routine_id: newId, step_order: i })`.

Notes: locate where `RoutinesListRedesign` is currently rendered in `RoutinesApp.tsx` (it's the `index` route, per `src/apps/routines/RoutinesApp.tsx`). The hook providing routines to that route is the source for `addRoutine`/`updateRoutine`/`deleteRoutine` — reuse it; do not instantiate a second `useRoutines`.

- [ ] **Step 1: Add the handlers and pass them as props**

In `RoutinesApp.tsx`, where `RoutinesListRedesign` is rendered, add (using the existing `routines`, `addRoutine`, `updateRoutine`, `deleteRoutine` from the hook in scope):

```tsx
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { nextStepOrder } from '@/lib/today/stepOrdering'

const handleAddStep = useCallback(async (collectionId: string, name: string) => {
  const { collections } = groupRoutineSteps(routines)
  const steps = collections.find(c => c.id === collectionId)?.steps ?? []
  await addRoutine({ name, parent_routine_id: collectionId, step_order: nextStepOrder(steps) })
}, [routines, addRoutine])

const handleReorderSteps = useCallback(async (writes: { id: string; step_order: number }[]) => {
  await Promise.all(writes.map(w => updateRoutine(w.id, { step_order: w.step_order })))
}, [updateRoutine])

const handlePromoteStep = useCallback(async (stepId: string) => {
  await updateRoutine(stepId, { parent_routine_id: null, step_order: null })
}, [updateRoutine])

const handleCreateCollection = useCallback(async (name: string) => {
  await addRoutine({ name })
}, [addRoutine])

const handleGroupIntoCollection = useCallback(async (name: string, ids: string[]) => {
  const parent = await addRoutine({ name })
  if (!parent) return
  await Promise.all(ids.map((id, i) => updateRoutine(id, { parent_routine_id: parent.id, step_order: i })))
}, [addRoutine, updateRoutine])
```

Pass them to the element:
```tsx
<RoutinesListRedesign
  routines={routines}
  onSelectRoutine={/* existing */}
  onCreateRoutine={/* existing */}
  onUpdateRoutine={updateRoutine}
  onAddStep={handleAddStep}
  onReorderSteps={handleReorderSteps}
  onPromoteStep={handlePromoteStep}
  onCreateCollection={handleCreateCollection}
  onGroupIntoCollection={handleGroupIntoCollection}
/>
```

- [ ] **Step 2: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors. (If `addRoutine`/`updateRoutine` aren't already in scope at the `index` route, lift the `useRoutines` call so the same instance feeds both the list and these handlers.)

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/apps/routines/RoutinesApp.tsx
git commit -m "feat(routines): wire collection/step handlers to useRoutines"
```

---

## Task 8: Full suite + backward-compat verification

**Files:** none new — verification + any fixes surfaced.

- [ ] **Step 1: Run the routines-related suites**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/lib/today/stepOrdering.test.ts src/lib/today/routineCollections.test.ts \
  src/components/surface/sections/DosePills.test.tsx src/components/surface/TapStepPanel.test.tsx \
  src/components/surface/TapCollectionPanel.test.tsx src/components/routine/RoutinesListRedesign.test.tsx
```
Expected: all PASS.

- [ ] **Step 2: Backward-compat check — a parentless-only routine set still renders flat**

Confirm via the existing `RoutinesListRedesign.test.tsx` "renders … the standalone routine" + "uses the existing onSelectRoutine path" tests (already in Task 5). If a regression appears (e.g. standalone rows lost their click), fix `RoutinesListRedesign` so `standalone` rows use the unchanged path, then re-run.

- [ ] **Step 3: Full unit suite**

Run: `npx vitest run 2>&1 | tail -8`
Expected: all green (≈2890+ passing, 3 skipped), no new failures.

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -4`
Expected: `✓ built`.

- [ ] **Step 5: Commit (if any fixes were made)**

```bash
git add -A
git commit -m "test(routines): verify routine-editing suite + backward-compat green"
```

- [ ] **Step 6: Push the feature branch (preview only — NOT main)**

```bash
git push origin routine-collections
```
Expected: pushes the branch; Vercel builds a preview. (Do not push to `main` — the collections feature merges as a whole when Scott approves, per the spec's Rollout section.)

---

## Self-Review

**Spec coverage:**
- Two-level Routines list → Task 5. ✓
- Collection editor (name/context/assignment/recurrence/notes) → Task 4. ✓ (assignment via `ContextPicker` + schedule editor present; `MultiAssigneeDropdown` can be added in Task 4 if assignment editing is wanted on the collection — see note below.)
- Lightweight step editor + dose pills, inherited read-only → Tasks 2 + 3. ✓
- Multi-select "group into routine" + new empty collection → Task 6. ✓
- dnd-kit step reorder writing `step_order` → Tasks 1 (logic) + 4 (UI) + 7 (persist). ✓
- Promote/re-parent → Task 3 (UI) + 7 (persist). ✓ Move-between-collections is deferred (not in the 8 tasks) — it's listed in the spec under §5; **flagged as a follow-up**, not silently dropped (YAGNI for v2; promote-then-regroup achieves the same result).
- No migration / backward-compat → Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one prose-only step (Task 5 Step 3) enumerates exact imports, state, and JSX with full handler bodies.

**Type consistency:** `Routine`/`RoutineWithSteps` from `@/types/actionable`; `UpdateRoutineInput`/`CreateRoutineInput` from `@/hooks/useRoutines`; handler names (`onAddStep`, `onReorderSteps`, `onPromoteStep`, `onCreateCollection`, `onGroupIntoCollection`, `onDosesChange`, `onSelectStep`) are identical across Tasks 3–7. `reorderByDrag`/`nextStepOrder`/`normalizeStepOrders` names match between Task 1 and Tasks 4/7. Reorder write shape `{ id: string; step_order: number }[]` is consistent end-to-end.

**Two flagged follow-ups (not blockers):**
1. Collection-level **assignment editing** (`MultiAssigneeDropdown`) — Task 4 includes context + schedule; if you want assignment on the collection too, add the dropdown there wired to `onUpdateRoutine(collectionId, { assigned_to_all })`. Left out of the minimal path to keep the panel lean.
2. **Move step between collections** — deferred; promote-to-standalone then group-again covers the use case for v2.
