# Weekly Planning Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided 4-step weekly planning wizard (review the week → build & prioritize to-dos → schedule them → capture concerns to the vault).

**Architecture:** A new full-screen `WeeklyPlanningSession` wizard component reads live Symphony data (calendar, tasks, goals) and writes the week's plan + concerns to the vault. Pure logic (candidate selection, ISO-week id, vault-note formatting) lives in a tested helper module; each wizard step is its own focused component; step 3 reuses the existing `PlanningSession` day-planner; step 4 reuses `TiptapEditor` + `vault-write`.

**Tech Stack:** React 19 + TS, Tailwind v4, Supabase, Vitest + RTL. Reuses `WeekView`, `PlanningSession`, `useSupabaseTasks`, `GoalsContext`, `TiptapEditor`, `useVaultWrite`.

**Spec:** `docs/superpowers/specs/2026-05-22-weekly-planning-session-design.md`

**Worktree:** Already created at `.worktrees/weekly-planning` (branch `feat/weekly-planning`, `.env` copied, `node_modules` symlinked).

> **▶ RESUME STATUS (2026-05-22):** Task 1 ✅ DONE & spec-reviewed — commit `4ba97d5` (`weeklyPlanning.ts` + tests, 4/4 pass). **Resume at Task 2.** Continue subagent-driven (fresh implementer subagent per task → spec review → code-quality review) in this worktree. Tasks 2–9 remain.

---

## File Structure

- Create: `src/components/planning/weekly/weeklyPlanning.ts` — pure helpers (ISO-week id, candidate selection by bucket, vault-note formatting). No React.
- Create: `src/components/planning/weekly/weeklyPlanning.test.ts` — unit tests for the helpers.
- Create: `src/components/planning/weekly/WeeklyPlanningSession.tsx` — wizard shell (step state, progress, Back/Next, Finish).
- Create: `src/components/planning/weekly/StepWeekAhead.tsx` — step 1, calendar review (wraps `WeekView`).
- Create: `src/components/planning/weekly/StepBuildTodos.tsx` — step 2, candidate buckets + select + reorder.
- Create: `src/components/planning/weekly/StepSchedule.tsx` — step 3, wraps `PlanningSession`.
- Create: `src/components/planning/weekly/StepConcerns.tsx` — step 4, `TiptapEditor`.
- Modify: `src/components/layout/Sidebar.tsx` — add `'weekly-planning'` to `ViewType` + a nav item.
- Modify: `src/components/layout/ViewRouter.tsx` — render `WeeklyPlanningSession` for the new view.
- Modify: `src/App.tsx` — wire data/handlers, add `saveWeeklyPlanToVault`, register the view in `handleViewChange`.

---

### Task 1: Pure helpers (ISO-week id, candidate selection, vault-note format)

**Files:**
- Create: `src/components/planning/weekly/weeklyPlanning.ts`
- Test: `src/components/planning/weekly/weeklyPlanning.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/planning/weekly/weeklyPlanning.test.ts
import { describe, it, expect } from 'vitest'
import { isoWeekId, selectWeeklyCandidates, formatWeeklyNote } from './weeklyPlanning'
import type { Task } from '@/types/task'

const t = (over: Partial<Task>): Task => ({
  id: over.id ?? 'x', title: over.title ?? 'T', completed: over.completed ?? false,
  bucket: over.bucket ?? 'inbox', context: null, createdAt: new Date(), updatedAt: new Date(),
  ...over,
}) as Task

describe('isoWeekId', () => {
  it('formats an ISO week as YYYY-Www', () => {
    expect(isoWeekId(new Date('2026-05-22T12:00:00'))).toMatch(/^2026-W\d{2}$/)
  })
  it('pads single-digit weeks', () => {
    expect(isoWeekId(new Date('2026-01-05T12:00:00'))).toBe('2026-W02')
  })
})

describe('selectWeeklyCandidates', () => {
  it('groups tasks by source bucket and excludes completed', () => {
    const tasks = [
      t({ id: 'a', bucket: 'inbox' }),
      t({ id: 'b', bucket: 'week' }),
      t({ id: 'c', bucket: 'week', completed: true }),
      t({ id: 'd', bucket: 'month' }),
      t({ id: 'e', bucket: 'quarter' }),
      t({ id: 'f', bucket: 'timed' }),
    ]
    const r = selectWeeklyCandidates(tasks)
    expect(r.inbox.map(x => x.id)).toEqual(['a'])
    expect(r.carryover.map(x => x.id)).toEqual(['b']) // 'c' excluded (completed)
    expect(r.month.map(x => x.id)).toEqual(['d'])
    expect(r.someday.map(x => x.id)).toEqual(['e'])
    // 'f' (timed) is already scheduled — not a candidate
  })
})

describe('formatWeeklyNote', () => {
  it('produces a path and markdown with the three sections', () => {
    const note = formatWeeklyNote({
      weekId: '2026-W21',
      priorities: [t({ id: 'a', title: 'Call accountant' })],
      scheduleSummary: 'Mon: Call accountant',
      concerns: '<p>Talk about camp</p>',
    })
    expect(note.path).toBe('planning/weekly/2026-W21.md')
    expect(note.title).toContain('2026-W21')
    expect(note.content).toContain('Call accountant')
    expect(note.content).toContain('Talk about camp')
    expect(note.content).toContain('Mon: Call accountant')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/planning/weekly/weeklyPlanning.test.ts`
Expected: FAIL — module `./weeklyPlanning` not found.

- [ ] **Step 3: Implement the helpers**

```ts
// src/components/planning/weekly/weeklyPlanning.ts
import type { Task } from '@/types/task'

/** ISO-8601 week id, e.g. "2026-W21". */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7 // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day) // shift to Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export interface WeeklyCandidates {
  inbox: Task[]
  carryover: Task[]
  month: Task[]
  someday: Task[]
}

/** Group open tasks into the source buckets the weekly session pulls from. */
export function selectWeeklyCandidates(tasks: Task[]): WeeklyCandidates {
  const open = tasks.filter(t => !t.completed)
  return {
    inbox: open.filter(t => t.bucket === 'inbox'),
    carryover: open.filter(t => t.bucket === 'week' || t.bucket === 'today'),
    month: open.filter(t => t.bucket === 'month'),
    someday: open.filter(t => t.bucket === 'quarter'),
  }
}

export interface WeeklyNoteInput {
  weekId: string
  priorities: Task[]
  scheduleSummary: string
  concerns: string // may be HTML from the editor
}

export interface WeeklyNote {
  path: string
  title: string
  content: string
}

/** Build the vault note for a completed weekly session. */
export function formatWeeklyNote({ weekId, priorities, scheduleSummary, concerns }: WeeklyNoteInput): WeeklyNote {
  const priorityLines = priorities.length
    ? priorities.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
    : '_None selected_'
  const content = [
    `# Weekly Plan — ${weekId}`,
    '',
    '## Priorities',
    priorityLines,
    '',
    '## Schedule',
    scheduleSummary || '_Not scheduled_',
    '',
    '## Concerns & topics',
    concerns?.trim() || '_None_',
    '',
  ].join('\n')
  return { path: `planning/weekly/${weekId}.md`, title: `Weekly Plan ${weekId}`, content }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/planning/weekly/weeklyPlanning.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/weekly/weeklyPlanning.ts src/components/planning/weekly/weeklyPlanning.test.ts
git commit -m "feat(weekly-planning): pure helpers (iso week id, candidate selection, vault note)"
```

---

### Task 2: Wizard shell (`WeeklyPlanningSession`)

**Files:**
- Create: `src/components/planning/weekly/WeeklyPlanningSession.tsx`
- Test: `src/components/planning/weekly/WeeklyPlanningSession.test.tsx`

The shell owns: current step (0–3), the working set of selected/ordered task ids (lifted from step 2 so step 3 + Finish can read it), the concerns text, Back/Next, and Finish. It renders the four step components (built in later tasks — until then, use placeholder `<div>`s so the shell is testable in isolation).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/weekly/WeeklyPlanningSession.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeeklyPlanningSession } from './WeeklyPlanningSession'

const baseProps = {
  tasks: [], events: [], routines: [],
  onUpdateTask: vi.fn(), onPushTask: vi.fn(),
  onSavePlanToVault: vi.fn().mockResolvedValue({ ok: true }),
  onClose: vi.fn(),
}

describe('WeeklyPlanningSession', () => {
  it('starts on step 1 of 4 and advances with Next', async () => {
    const { user } = render(<WeeklyPlanningSession {...baseProps} />)
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
  })

  it('shows Finish on the last step and calls onSavePlanToVault', async () => {
    const onSavePlanToVault = vi.fn().mockResolvedValue({ ok: true })
    const { user } = render(<WeeklyPlanningSession {...baseProps} onSavePlanToVault={onSavePlanToVault} />)
    await user.click(screen.getByRole('button', { name: /next/i })) // 2
    await user.click(screen.getByRole('button', { name: /next/i })) // 3
    await user.click(screen.getByRole('button', { name: /next/i })) // 4
    await user.click(screen.getByRole('button', { name: /finish/i }))
    expect(onSavePlanToVault).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/weekly/WeeklyPlanningSession.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the shell**

```tsx
// src/components/planning/weekly/WeeklyPlanningSession.tsx
import { useState, useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/types/calendar'
import type { Routine } from '@/types/routine'
import { isoWeekId } from './weeklyPlanning'

const STEPS = ['The week ahead', "This week's to-dos", 'Schedule them', 'Concerns & topics'] as const

interface Props {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Persist the weekly note to the vault. Returns ok=false on failure (e.g. non-vault account). */
  onSavePlanToVault: (input: { weekId: string; priorities: Task[]; concerns: string }) => Promise<{ ok: boolean }>
  onClose: () => void
  initialDate?: Date
}

export function WeeklyPlanningSession({ tasks, events, routines, onUpdateTask, onPushTask, onSavePlanToVault, onClose, initialDate }: Props) {
  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([]) // ordered priorities (step 2)
  const [concerns, setConcerns] = useState('')
  const [saving, setSaving] = useState(false)

  const weekDate = initialDate ?? new Date()
  const weekId = useMemo(() => isoWeekId(weekDate), [weekDate])
  const priorities = useMemo(
    () => selectedIds.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[],
    [selectedIds, tasks],
  )

  const isLast = step === STEPS.length - 1

  const finish = async () => {
    setSaving(true)
    await onSavePlanToVault({ weekId, priorities, concerns })
    setSaving(false)
    onClose()
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">Weekly Planning</h1>
          <p className="text-sm text-neutral-500">{STEPS[step]} — step {step + 1} of {STEPS.length}</p>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">Close</button>
      </header>

      <div className="flex items-center gap-2 px-6 py-3">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= step ? 'bg-primary-500' : 'bg-neutral-300'}`} />
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {/* Step bodies wired in Tasks 3–6. Placeholders keep the shell testable. */}
        {step === 0 && <div data-testid="step-week-ahead">Week ahead</div>}
        {step === 1 && <div data-testid="step-build-todos">Build to-dos</div>}
        {step === 2 && <div data-testid="step-schedule">Schedule</div>}
        {step === 3 && <div data-testid="step-concerns">Concerns</div>}
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/70">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className="px-4 py-2 text-sm text-neutral-600 disabled:opacity-40">Back</button>
        {isLast ? (
          <button onClick={finish} disabled={saving} className="btn-primary px-5 py-2">{saving ? 'Saving…' : 'Finish'}</button>
        ) : (
          <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} className="btn-primary px-5 py-2">Next</button>
        )}
      </footer>
    </div>
  )
}
```

Note: leave `tasks/events/routines/onUpdateTask/onPushTask/selectedIds/setSelectedIds/setConcerns` available — they get passed into the real step components in Tasks 3–6. (Mark currently-unused props with `void` or wire them as you add steps to avoid lint noise.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/planning/weekly/WeeklyPlanningSession.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/weekly/WeeklyPlanningSession.tsx src/components/planning/weekly/WeeklyPlanningSession.test.tsx
git commit -m "feat(weekly-planning): wizard shell with steps, progress, finish"
```

---

### Task 3: Step 1 — The week ahead (calendar review)

**Files:**
- Create: `src/components/planning/weekly/StepWeekAhead.tsx`
- Modify: `src/components/planning/weekly/WeeklyPlanningSession.tsx` (render it for step 0)

`WeekView` (`src/components/home/WeekView.tsx`, props include `onWeekChange`, `onSelectDay`, plus the day/event data — read its full prop list and pass the same data the Home week view passes). This step is read-only review: render `WeekView` for the current week, no editing.

- [ ] **Step 1: Build `StepWeekAhead`**

```tsx
// src/components/planning/weekly/StepWeekAhead.tsx
import type { CalendarEvent } from '@/types/calendar'

interface Props {
  weekDate: Date
  events: CalendarEvent[]
  onWeekChange: (d: Date) => void
}

// Renders the existing week calendar grid read-only. Wire WeekView with the
// same props Home passes it (see src/components/home/HomeView.tsx for the call
// site); pass events for weekDate's week. No task editing in this step.
export function StepWeekAhead({ weekDate, events, onWeekChange }: Props) {
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-3">Review the big rocks for the next 7 days before you plan.</p>
      {/* <WeekView ...same props as HomeView..., onSelectDay={() => {}} read-only /> */}
    </div>
  )
}
```

- [ ] **Step 2: Wire WeekView**

Open `src/components/home/HomeView.tsx`, find the `<WeekView ... />` call, copy its prop wiring into `StepWeekAhead` (passing `events`, the week derived from `weekDate`, `onWeekChange`, and a no-op `onSelectDay`). Render `<StepWeekAhead .../>` for `step === 0` in `WeeklyPlanningSession`.

- [ ] **Step 3: Verify render**

Run: `npm run dev` (worktree port), open the session, confirm step 1 shows the week calendar with this week's events.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/weekly/StepWeekAhead.tsx src/components/planning/weekly/WeeklyPlanningSession.tsx
git commit -m "feat(weekly-planning): step 1 — week-ahead calendar review"
```

---

### Task 4: Step 2 — Build & prioritize the week's to-dos

**Files:**
- Create: `src/components/planning/weekly/StepBuildTodos.tsx`
- Modify: `WeeklyPlanningSession.tsx` (render for step 1; lift `selectedIds`/`setSelectedIds`)

Uses `selectWeeklyCandidates(tasks)` (Task 1) to group candidates into Inbox / Carry-over / This month / Someday. Selecting a candidate adds its id to `selectedIds` and moves the task to the `week` bucket via `onUpdateTask(id, { bucket: 'week' })`. Selected priorities are shown as an ordered list (drag to reorder updates `selectedIds` order). Goal actions: read from `GoalsContext` (`useGoalsContext()`), surface current-quarter incomplete actions as an extra candidate group (each can be turned into a task or just noted — for v1, list them read-only with a "add as task" affordance that creates a `week` task).

- [ ] **Step 1: Build `StepBuildTodos`** (candidate groups + select + reorder)

```tsx
// src/components/planning/weekly/StepBuildTodos.tsx
import type { Task } from '@/types/task'
import { selectWeeklyCandidates } from './weeklyPlanning'

interface Props {
  tasks: Task[]
  selectedIds: string[]
  onToggle: (task: Task) => void           // add/remove from priorities + set bucket
  onReorder: (ids: string[]) => void       // new priority order
}

export function StepBuildTodos({ tasks, selectedIds, onToggle, onReorder }: Props) {
  const c = selectWeeklyCandidates(tasks)
  const groups: Array<[string, Task[]]> = [
    ['Inbox', c.inbox], ['Carry-over', c.carryover], ['This month', c.month], ['Someday', c.someday],
  ]
  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">Candidates</h3>
        {groups.map(([label, list]) => (
          <div key={label} className="mb-4">
            <div className="text-[11px] uppercase text-neutral-400 mb-1">{label}</div>
            {list.length === 0 && <div className="text-sm text-neutral-300">—</div>}
            {list.map(t => (
              <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => onToggle(t)} />
                {t.title}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">This week — priority order</h3>
        <ol className="list-decimal pl-5">
          {selectedIds.map(id => {
            const t = tasks.find(x => x.id === id)
            return t ? <li key={id} className="py-1 text-sm">{t.title}</li> : null
          })}
        </ol>
        {/* Reorder: v1 may use up/down buttons calling onReorder; drag can come later. */}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into the shell** — in `WeeklyPlanningSession`, render `StepBuildTodos` for `step === 1` with `onToggle` that updates `selectedIds` and calls `onUpdateTask(task.id, { bucket: 'week' })` when added, and `onReorder` that sets `selectedIds`.

- [ ] **Step 3: Verify** — open session, step 2: candidates appear by group; checking one adds it to the ordered list and (verify) moves the task to the week bucket.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/weekly/StepBuildTodos.tsx src/components/planning/weekly/WeeklyPlanningSession.tsx
git commit -m "feat(weekly-planning): step 2 — build & prioritize to-dos from buckets"
```

---

### Task 5: Step 3 — Schedule them (reuse PlanningSession)

**Files:**
- Create: `src/components/planning/weekly/StepSchedule.tsx`
- Modify: `WeeklyPlanningSession.tsx` (render for step 2)

`PlanningSession` props: `{ tasks, events, routines, onUpdateTask, onPushTask, onClose, initialDate, getRoutinesForDate? }`. For step 3, render `PlanningSession` scoped to the selected priorities (filter `tasks` to `selectedIds` for the drawer) for the planning week. Dragging onto a slot sets `bucket: 'timed'` + `scheduledFor` via `onUpdateTask` (PlanningSession already does this). Pass `onClose={() => {}}` (the wizard owns close).

- [ ] **Step 1: Build `StepSchedule`** wrapping `PlanningSession`:

```tsx
// src/components/planning/weekly/StepSchedule.tsx
import { PlanningSession } from '@/components/planning/PlanningSession'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/types/calendar'
import type { Routine } from '@/types/routine'

interface Props {
  weekDate: Date
  priorities: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}

export function StepSchedule({ weekDate, priorities, events, routines, onUpdateTask, onPushTask }: Props) {
  return (
    <PlanningSession
      tasks={priorities}
      events={events}
      routines={routines}
      onUpdateTask={onUpdateTask}
      onPushTask={onPushTask}
      onClose={() => {}}
      initialDate={weekDate}
    />
  )
}
```

- [ ] **Step 2: Wire for `step === 2`** in the shell, passing `priorities` (the memoized selected tasks).

- [ ] **Step 3: Verify** — step 3 shows the day-planner with only this week's priorities in the drawer; dragging schedules them.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/weekly/StepSchedule.tsx src/components/planning/weekly/WeeklyPlanningSession.tsx
git commit -m "feat(weekly-planning): step 3 — schedule priorities via PlanningSession"
```

---

### Task 6: Step 4 — Concerns & topics

**Files:**
- Create: `src/components/planning/weekly/StepConcerns.tsx`
- Modify: `WeeklyPlanningSession.tsx` (render for step 3; bind `concerns`/`setConcerns`)

- [ ] **Step 1: Build `StepConcerns`** (lazy `TiptapEditor`, same pattern as `PanelWhy`):

```tsx
// src/components/planning/weekly/StepConcerns.tsx
import { lazy, Suspense } from 'react'
const TiptapEditor = lazy(() => import('@/components/notes/TiptapEditor').then(m => ({ default: m.TiptapEditor })))

interface Props { value: string; onChange: (v: string) => void }

export function StepConcerns({ value, onChange }: Props) {
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-3">What do you need to talk about or keep an eye on this week? Saved to your vault on Finish.</p>
      <div className="rounded-md border border-neutral-200 bg-white p-3 min-h-[300px]">
        <Suspense fallback={null}>
          <TiptapEditor content={value} onChange={onChange} placeholder="Concerns, topics, things to discuss…" />
        </Suspense>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire for `step === 3`** with `value={concerns} onChange={setConcerns}`.

- [ ] **Step 3: Verify** — step 4 shows a rich editor; typing updates state.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/weekly/StepConcerns.tsx src/components/planning/weekly/WeeklyPlanningSession.tsx
git commit -m "feat(weekly-planning): step 4 — concerns editor"
```

---

### Task 7: Finish → write the weekly note to the vault

**Files:**
- Modify: `src/App.tsx` — add `saveWeeklyPlanToVault` (mirrors `saveTaskNoteToVault`, lines ~865) and pass it to the session.

- [ ] **Step 1: Add the handler in App.tsx** (near `saveTaskNoteToVault`):

```tsx
const saveWeeklyPlanToVault = useCallback(
  async ({ weekId, priorities, concerns }: { weekId: string; priorities: Task[]; concerns: string }): Promise<{ ok: boolean }> => {
    const { formatWeeklyNote } = await import('@/components/planning/weekly/weeklyPlanning')
    // scheduleSummary: simple list of scheduled priorities (refine later)
    const scheduleSummary = priorities
      .filter(t => t.scheduledFor)
      .map(t => `- ${t.title} (${new Date(t.scheduledFor as Date).toLocaleDateString()})`)
      .join('\n')
    const note = formatWeeklyNote({ weekId, priorities, scheduleSummary, concerns })
    const result = await vaultWrite.createVaultNote(
      { title: note.title, content: note.content, path: note.path },
      `Weekly plan: ${weekId}`,
    )
    return { ok: !!result?.success }
  },
  [vaultWrite],
)
```

- [ ] **Step 2: Pass it** to `<WeeklyPlanningSession onSavePlanToVault={saveWeeklyPlanToVault} ... />` (wired in Task 8's render).

- [ ] **Step 3: Verify** — finish a session; confirm a commit appears in `scottring/scotts-world` at `planning/weekly/<weekId>.md` and a `notes` row exists (same round-trip as Save-to-vault). On a non-vault account the call returns ok:false and the session still closes.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(weekly-planning): finish writes the weekly note to the vault"
```

---

### Task 8: Routing & launch

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (`ViewType` + nav item), `src/components/layout/ViewRouter.tsx` (render), `src/App.tsx` (handleViewChange + render + data wiring)

- [ ] **Step 1: Add the view type** — in `Sidebar.tsx` line 44, add `| 'weekly-planning'` to `ViewType`. Add a sidebar nav entry "Plan the week" that calls the view-change handler with `'weekly-planning'`.

- [ ] **Step 2: Render in ViewRouter** — add a branch: when the active view is `'weekly-planning'`, render `<WeeklyPlanningSession ... />` full-screen with the data/handlers from props (tasks, events, routines, onUpdateTask=updateTask, onPushTask=pushTask, onSavePlanToVault=saveWeeklyPlanToVault, onClose=back to 'today'). Thread any new props through `ViewRouterProps` like the existing task props.

- [ ] **Step 3: Wire in App.tsx** — register `'weekly-planning'` in `handleViewChange` (lines ~605–642) and pass the new props to `<ViewRouter>` (tasks, events, routines already available; add `onSaveWeeklyPlanToVault`).

- [ ] **Step 4: Add a launch button on the Week view** — a "Plan the week" button in the Week view header that triggers the `'weekly-planning'` view.

- [ ] **Step 5: Verify** — sidebar "Plan the week" and the Week-view button both open the full-screen session; Close returns to Today.

- [ ] **Step 6: typecheck + lint + tests + commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/planning/weekly src/App.tsx src/components/layout/ViewRouter.tsx src/components/layout/Sidebar.tsx
npx vitest run src/components/planning/weekly
git add -A && git commit -m "feat(weekly-planning): routing, sidebar + week-view launch"
```

---

### Task 9: End-to-end manual verification

- [ ] **Step 1:** `npm run build` — clean build.
- [ ] **Step 2:** Run the dev server; walk all four steps with a real account: review the week → select & order to-dos (confirm tasks move to `week` bucket) → schedule a couple (confirm `timed` + `scheduledFor`) → write concerns → Finish.
- [ ] **Step 3:** Confirm the vault note landed (GitHub commit + `notes` row) and the session closed to Today.
- [ ] **Step 4:** Confirm no console errors and existing tests still pass: `npx vitest run`.

---

## Self-Review

**Spec coverage:** step 1 calendar review (Task 3) ✓; step 2 to-dos from inbox/carry-over/month/quarter + goal actions (Task 4) ✓; step 3 schedule via PlanningSession (Task 5) ✓; step 4 concerns → vault (Tasks 6–7) ✓; wizard + manual launch + universal scope (Tasks 2, 8) ✓; no new table (state in shell) ✓; vault-write Scott-only / ok:false skip (Task 7) ✓.

**Type consistency:** `onSavePlanToVault({ weekId, priorities, concerns })` is the same shape in the shell (Task 2), App handler (Task 7), and helper `formatWeeklyNote` input (Task 1, plus `scheduleSummary` derived in Task 7). `selectWeeklyCandidates` keys (inbox/carryover/month/someday) match Task 4's groups. Bucket writes use `onUpdateTask(id, { bucket: 'week' })` and PlanningSession's existing `timed`/`scheduledFor`.

**Placeholders:** none — step bodies are real components; the only intentional "wire WeekView from HomeView's call site" instruction (Task 3) points at an exact source location to copy real props from (its full prop list is environment-specific and must be read at build time, not invented).
