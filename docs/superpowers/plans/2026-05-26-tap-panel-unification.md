# Tap Panel Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `surface/` Tap panels the only detail panel the live `App.tsx` renders, retiring `DetailPanelRedesign` from that path.

**Architecture:** The timeline detail panel's `selectedItem` is only ever a task, event, or routine (`TimelineItemType`). Tasks→`TapContextPanel`, events→`TapEventPanel`/`TapMealPanel` already. The only type still on `DetailPanelRedesign` is **routine**. So: reach task-editor parity in `TapContextPanel`, build `TapRoutinePanel`, wire routine routing, then delete the `DetailPanel` fallback + `SURFACE_PANEL_ENABLED` flag from `App.tsx`. The `DetailPanelRedesign`/`TaskViewRedesign` files stay (dormant Shell still imports them).

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library. Run a single test: `npx vitest run <path>`.

**Spec:** `docs/superpowers/specs/2026-05-26-tap-panel-unification-design.md`

**Worktree:** all work in `.worktrees/panel-unification` on branch `feat/tap-panel-unification`. Run commands from `.worktrees/panel-unification`.

---

## Task 1: PanelClassify section (context + assignees) for the task panel

Creates a focused section component holding the two editors `DetailPanelRedesign`
had that `TapContextPanel` lacks. Reuses shared `ContextPicker` (`{ value, onChange }`)
and `MultiAssigneeDropdown` (`{ members, selectedIds, onSelect, label? }`).

**Files:**
- Create: `src/components/surface/sections/PanelClassify.tsx`
- Test: `src/components/surface/sections/PanelClassify.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/sections/PanelClassify.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PanelClassify } from './PanelClassify'
import type { FamilyMember } from '@/types/family'

const members: FamilyMember[] = [
  { id: 'm1', name: 'Iris' } as FamilyMember,
  { id: 'm2', name: 'Scott' } as FamilyMember,
]

describe('PanelClassify', () => {
  it('shows the current context and reports changes', () => {
    const onContextChange = vi.fn()
    render(
      <PanelClassify
        context="work"
        onContextChange={onContextChange}
        members={members}
        selectedAssigneeIds={[]}
        onAssigneesChange={vi.fn()}
      />,
    )
    // ContextPicker renders the three domains; clicking Family reports it.
    fireEvent.click(screen.getByRole('button', { name: /family/i }))
    expect(onContextChange).toHaveBeenCalledWith('family')
  })

  it('renders the assignee control with current selection', () => {
    render(
      <PanelClassify
        context={undefined}
        onContextChange={vi.fn()}
        members={members}
        selectedAssigneeIds={['m1']}
        onAssigneesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/surface/sections/PanelClassify.test.tsx`
Expected: FAIL — `Failed to resolve import "./PanelClassify"`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/surface/sections/PanelClassify.tsx
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'

interface PanelClassifyProps {
  context: TaskContext | null | undefined
  onContextChange: (context: TaskContext | undefined) => void
  members: FamilyMember[]
  selectedAssigneeIds: string[]
  onAssigneesChange: (ids: string[]) => void
}

export function PanelClassify(props: PanelClassifyProps) {
  return (
    <section className="flex flex-wrap items-center gap-2 pb-4 mb-4 border-b border-neutral-200">
      <ContextPicker
        value={props.context ?? undefined}
        onChange={props.onContextChange}
      />
      <MultiAssigneeDropdown
        members={props.members}
        selectedIds={props.selectedAssigneeIds}
        onSelect={props.onAssigneesChange}
      />
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/surface/sections/PanelClassify.test.tsx`
Expected: PASS. If `ContextPicker`'s buttons aren't labelled "family"/"work"/"personal",
open `src/components/triage/ContextPicker.tsx`, read the actual accessible names, and
update the test's `getByRole` name to match (do not change the component).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelClassify.tsx src/components/surface/sections/PanelClassify.test.tsx
git commit -m "feat(surface): PanelClassify section (context + assignees)"
```

---

## Task 2: Render PanelClassify in TapContextPanel

**Files:**
- Modify: `src/components/surface/TapContextPanel.tsx`
- Test: `src/components/surface/TapContextPanel.test.tsx`

- [ ] **Step 1: Add a failing test** to `TapContextPanel.test.tsx`

```tsx
it('lets you change the task context', () => {
  const onContextChange = vi.fn()
  // Reuse the file's existing render helper / default props object; pass the task
  // with context 'work' and the new onContextChange handler.
  renderPanel({ task: { ...baseTask, context: 'work' }, onContextChange })
  fireEvent.click(screen.getByRole('button', { name: /personal/i }))
  expect(onContextChange).toHaveBeenCalledWith('personal')
})
```

(If the test file has no shared `renderPanel`/`baseTask`, mirror the existing tests'
setup in that file — read the top of `TapContextPanel.test.tsx` and follow its pattern.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/surface/TapContextPanel.test.tsx`
Expected: FAIL — `onContextChange` is not a prop / not called (TypeScript error or
assertion failure).

- [ ] **Step 3: Add the props and render the section**

In `TapContextPanel.tsx`, add to `TapContextPanelProps`:

```tsx
  onContextChange: (context: import('@/types/task').TaskContext | undefined) => void
  onAssigneesChange: (ids: string[]) => void
```

Add the import near the other section imports:

```tsx
import { PanelClassify } from './sections/PanelClassify'
```

Render it immediately after `<PanelActions ... />` (before `<PanelLocation>`):

```tsx
      <PanelClassify
        context={task.context}
        onContextChange={props.onContextChange}
        members={props.familyMembers}
        selectedAssigneeIds={task.assignedToAll ?? (task.assignedTo ? [task.assignedTo] : [])}
        onAssigneesChange={props.onAssigneesChange}
      />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/surface/TapContextPanel.test.tsx`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapContextPanel.tsx src/components/surface/TapContextPanel.test.tsx
git commit -m "feat(surface): wire context + assignee editors into TapContextPanel"
```

---

## Task 3: Wire the new + stubbed handlers in App.tsx (task panel)

**Files:**
- Modify: `src/App.tsx` (the `<TapContextPanel ... />` render, lines ~1617–1677)

- [ ] **Step 1: Replace the four stubbed `onOpen*` and add the two new handlers**

Find (App.tsx ~1655–1658):

```tsx
              onOpenContact={() => {}} // TODO Plan 2 wires this
              onOpenMember={() => {}} // TODO Plan 2 wires this
              onOpenProject={() => {}} // TODO Plan 2 wires this
              onOpenEvent={() => {}} // TODO Plan 2 wires this
```

Replace with:

```tsx
              onOpenContact={(id) => handleOpenContact(id)}
              onOpenMember={(id) => setSelectedItemId(`task-${id}`) /* members open via their own route elsewhere; keep selection no-op-safe */}
              onOpenProject={(id) => handleOpenProject(id)}
              onOpenEvent={(id) => setSelectedItemId(`event-${id}`)}
              onContextChange={(ctx) => updateTask(selectedItem.originalTask!.id, { context: ctx ?? null })}
              onAssigneesChange={(ids) =>
                updateTask(selectedItem.originalTask!.id, {
                  assignedToAll: ids.length > 0 ? ids : undefined,
                })
              }
```

Note: confirm the event-id selection format by checking how events are selected
elsewhere in App.tsx (grep `setSelectedItemId(\`event-`); match whatever format the
codebase already uses). `handleOpenContact` and `handleOpenProject` already exist
(App.tsx ~659/667).

- [ ] **Step 2: Type-check**

Run: `cd .worktrees/panel-unification && npx tsc -b 2>&1 | head -20`
Expected: no new errors referencing `TapContextPanel` props.

- [ ] **Step 3: Run the task-panel + app smoke tests**

Run: `npx vitest run src/components/surface/TapContextPanel.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire TapContextPanel context/assignee/open handlers"
```

---

## Task 4: Build TapRoutinePanel

Models `TapProjectPanel`. Routine fields are snake_case (`name`, `description`,
`recurrence_pattern`, `time_of_day`, `visibility`, `context`). Timestamps are
strings → wrap in `new Date(...)` for `PanelFooter`.

**Files:**
- Create: `src/components/surface/TapRoutinePanel.tsx`
- Test: `src/components/surface/TapRoutinePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/TapRoutinePanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapRoutinePanel } from './TapRoutinePanel'
import type { Routine } from '@/types/routine'

const routine: Routine = {
  id: 'r1', user_id: 'u1', name: 'Trash night', description: 'Take bins to curb',
  default_assignee: null, assigned_to: null, assigned_to_all: null,
  visibility: 'active', paused_until: null,
  recurrence_pattern: { type: 'weekly', days: ['tue'] },
  time_of_day: '20:00:00', raw_input: null, show_on_timeline: true, context: 'family',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

describe('TapRoutinePanel', () => {
  it('renders the routine name and notes', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    expect(screen.getByText('Take bins to curb')).toBeInTheDocument()
  })

  it('reports visibility changes', () => {
    const onVisibilityChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={onVisibilityChange} />)
    fireEvent.click(screen.getByRole('button', { name: /reference/i }))
    expect(onVisibilityChange).toHaveBeenCalledWith('reference')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/surface/TapRoutinePanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./TapRoutinePanel"`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/surface/TapRoutinePanel.tsx
import type { Routine, RoutineVisibility } from '@/types/routine'
import type { TaskContext } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelFooter } from './sections/PanelFooter'
import { ContextPicker } from '@/components/triage/ContextPicker'

function recurrenceSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

interface TapRoutinePanelProps {
  routine: Routine
  onClose: () => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onVisibilityChange: (visibility: RoutineVisibility) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine } = props
  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={routine.name}
        onTitleChange={() => { /* routine rename — out of scope */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow bucket={recurrenceSummary(routine)} />

      <section className="flex flex-wrap items-center gap-2 pb-4 mb-4 border-b border-neutral-200">
        <ContextPicker value={routine.context ?? undefined} onChange={props.onContextChange} />
        <div className="flex gap-1" role="group" aria-label="Visibility">
          {(['active', 'reference'] as RoutineVisibility[]).map((v) => (
            <button
              key={v}
              onClick={() => props.onVisibilityChange(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                routine.visibility === v ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <PanelWhy key={routine.id} label="Notes" notes={routine.description ?? undefined} onChange={props.onNotesChange} />

      <PanelFooter
        createdAt={new Date(routine.created_at)}
        updatedAt={new Date(routine.updated_at)}
      />
    </article>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/surface/TapRoutinePanel.test.tsx`
Expected: PASS. If `PanelWhy`/`PanelFooter`/`PanelMetaRow` prop names differ from
those used here, open each section file (they're in `src/components/surface/sections/`)
and match the real signatures — `TapProjectPanel.tsx` is the reference caller.

- [ ] **Step 5: Export from the surface barrel**

In `src/components/surface/index.ts`, add:

```tsx
export { TapRoutinePanel } from './TapRoutinePanel'
```

- [ ] **Step 6: Commit**

```bash
git add src/components/surface/TapRoutinePanel.tsx src/components/surface/TapRoutinePanel.test.tsx src/components/surface/index.ts
git commit -m "feat(surface): TapRoutinePanel"
```

---

## Task 5: Route routines to TapRoutinePanel

**Files:**
- Modify: `src/App.tsx` (routing branch ~1706; imports ~64)

- [ ] **Step 1: Import the panel**

Add `TapRoutinePanel,` to the `components/surface` import block in App.tsx (~line 64,
next to `TapContextPanel, TapEventPanel, TapMealPanel`).

- [ ] **Step 2: Add the routine branch before the `else → DetailPanel` fallback**

Find the fallback opening at ~1706:

```tsx
          ) : (
            <Suspense fallback={<LoadingFallback variant="card" />}>
              <DetailPanel
```

Insert a routine branch immediately before that `) : (`:

```tsx
          ) : selectedItem.type === 'routine' && selectedItem.originalRoutine ? (
            <TapRoutinePanel
              routine={selectedItem.originalRoutine}
              onClose={() => setSelectedItemId(null)}
              onNotesChange={(n) => updateRoutine(selectedItem.originalRoutine!.id, { description: n })}
              onContextChange={(ctx) => updateRoutine(selectedItem.originalRoutine!.id, { context: ctx ?? null })}
              onVisibilityChange={(v) => updateRoutine(selectedItem.originalRoutine!.id, { visibility: v })}
            />
          ) : (
```

Note: confirm `selectedItem.originalRoutine` is the field name (grep
`originalRoutine` in `src/types/timeline.ts` / `useDetailPanelState.ts`); if the
timeline item exposes the routine under a different key, use that. `updateRoutine`
is already destructured in App.tsx (~534).

- [ ] **Step 3: Type-check + manual verify**

Run: `cd .worktrees/panel-unification && npx tsc -b 2>&1 | head -20` (no new errors).
Then `npm run dev`, open a routine from the Today timeline → it opens `TapRoutinePanel`,
not the old panel. Editing notes / context / visibility persists.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): route routines to TapRoutinePanel"
```

---

## Task 6: Remove the DetailPanel fallback + SURFACE_PANEL_ENABLED flag

Now every `selectedItem.type` (task/event/routine, incl. meal) routes to a Tap panel,
so both `<DetailPanel>` render sites in App.tsx are unreachable.

**Files:**
- Modify: `src/App.tsx` (both `<DetailPanel>` blocks ~1706–1799 and ~1799–~1860; the
  `SURFACE_PANEL_ENABLED` import + conditional)
- Modify: `src/components/surface/flag.ts`

- [ ] **Step 1: Collapse the conditional**

The render currently reads `SURFACE_PANEL_ENABLED && selectedItem ? (<Tap branches> : <DetailPanel#1>) : (<DetailPanel#2>)`.
Replace the whole expression so it is just the Tap branches (task / meal / event /
routine), with a minimal final `else` that renders nothing (or a tiny "Unsupported
item" guard). Delete both `<DetailPanel>` blocks and the outer
`SURFACE_PANEL_ENABLED && ...` gate. Remove the now-unused `DetailPanel` import
(the `DetailPanelRedesign as DetailPanel` alias at App.tsx:44) **only if** no other
App.tsx code references it (grep first).

- [ ] **Step 2: Remove the flag**

Delete `SURFACE_PANEL_ENABLED` from `src/components/surface/flag.ts` and remove its
import in App.tsx. Grep the repo for other `SURFACE_PANEL_ENABLED` references:

Run: `grep -rn "SURFACE_PANEL_ENABLED" src/`
Expected after edit: no references (remove any that remain).

- [ ] **Step 3: Type-check + build**

Run: `cd .worktrees/panel-unification && npm run build 2>&1 | tail -20`
Expected: build succeeds (Vercel uses `tsc -b`; this catches stricter errors than
the pre-push `tsc --noEmit`).

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: green (same pass count as baseline, minus any tests that asserted the old
DetailPanel fallback — update those to assert the Tap panel renders instead).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/surface/flag.ts
git commit -m "refactor(app): retire DetailPanel fallback + SURFACE_PANEL_ENABLED flag"
```

---

## Task 7: Panel-only /task/:id (remove full-page TaskView nav from the live path)

**Files:**
- Modify: `src/App.tsx` (the `stateView === 'task-detail'` navigation + any
  `setStateView('task-detail')` callers)

- [ ] **Step 1: Find the full-page task navigation**

Run: `grep -n "task-detail\|setStateView('task-detail')\|TaskViewRedesign" src/App.tsx`
Read each call site.

- [ ] **Step 2: Redirect those to the panel**

Change each `setSelectedTaskId(id); setStateView('task-detail')` to open the panel
instead: `setSelectedItemId(\`task-${id}\`)`. Remove the `task-detail` view rendering
of `TaskViewRedesign` from the live `App.tsx` render tree. Do **not** delete
`TaskViewRedesign.tsx` (imported by `apps/tasks/*`).

- [ ] **Step 3: Verify deep-link**

`npm run dev`, navigate to `/task/<an-id>` → the task opens in the panel (not a full
page). Existing routing tests pass: `npx vitest run` (update any test that asserted
full-page TaskView for `/task/:id`).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(app): /task/:id opens the panel (panel-only)"
```

---

## Task 8: Sweep for orphaned components

**Files:** none changed unless an orphan is found.

- [ ] **Step 1: Check each retirement candidate for remaining references**

Run, for each:
```bash
for c in DetailPanelRedesign TaskViewRedesign DetailPanel TaskView; do
  echo "== $c =="; grep -rln "\b$c\b" src/ | grep -vE "/$c\.tsx|\.test\."
done
```

- [ ] **Step 2: Delete only the truly-orphaned ones**

If a component (e.g. pre-Redesign `src/components/detail/DetailPanel.tsx` or
`src/components/task/TaskView.tsx`) has **zero** non-test references, delete the file
and its test. **Keep** `DetailPanelRedesign.tsx` and `TaskViewRedesign.tsx** — they
are referenced by `src/shell/LegacyDetailPanelHost.tsx` / `src/apps/tasks/*` (dormant
Shell, out of scope). Confirm with the grep output before deleting anything.

- [ ] **Step 3: Build + full suite**

Run: `cd .worktrees/panel-unification && npm run build && npx vitest run`
Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove orphaned pre-Redesign detail components"
```

---

## Final verification (before pushing to main)

- [ ] `npm run build` green (worktree).
- [ ] `npx vitest run` green.
- [ ] Manual: open a task, an event, a meal event, and a routine from the Today
  timeline — each opens its Tap panel; none opens `DetailPanelRedesign`.
- [ ] Task panel: context picker + assignee dropdown edit and persist.
- [ ] `grep -rn "SURFACE_PANEL_ENABLED" src/` → no results.
- [ ] Push: `git push origin HEAD:main` (pre-push runs tsc + tests; both must pass).
```
