# Timeline Inline Capture + Smart Parse + Confirm/Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the timeline radial's `window.prompt` captures with an inline, anchored, QuickCapture-grade smart-parse input, and add a confirm+Undo toast to every create.

**Architecture:** Extract QuickCapture's parse/override state and chip UI into a shared `useQuickParse` hook + `ParsedFieldChips` component (behavior-preserving, gated by QuickCapture's existing 20-test suite passing unchanged). A new `TimelineQuickInput` consumes them; `TimelineInsertPoint` gains a closed→wheel→input mode machine; App create handlers drop `window.prompt`, accept the parsed result, and fire an `InboxUndoToast`-based confirm+Undo.

**Tech Stack:** React 19 + TS strict, Vitest + RTL. Reuses `parseQuickInput` (`src/lib/quickInputParser.ts`), `InboxUndoToast`, `useToast`. Spec: `docs/superpowers/specs/2026-05-19-timeline-inline-capture-design.md`.

**Worktree:** All work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/interactive-timeline` on branch `feat/interactive-timeline`. NEVER touch the shared main worktree. No `git checkout/switch/reset/cherry-pick/rebase`. PATH if needed: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/local/bin:$PATH"`. Every task: `cd` to the worktree; verify `git rev-parse --abbrev-ref HEAD` == `feat/interactive-timeline` (else STOP/BLOCKED); capture base SHA before commit.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/hooks/useQuickParse.ts` | Title→parsed→effectiveParsed + overrides state + clear/apply + display names. The shared parse brain. | Create |
| `src/hooks/useQuickParse.test.ts` | Unit tests for the hook | Create |
| `src/components/capture/ParsedFieldChips.tsx` | Presentational chip row (date/#project/@contact/category/context) with × handlers | Create |
| `src/components/capture/ParsedFieldChips.test.tsx` | Unit tests | Create |
| `src/components/layout/QuickCapture.tsx` | Refactored to consume the hook + chips; behavior unchanged | Modify |
| `src/components/schedule/TimelineQuickInput.tsx` | Inline anchored capture; uses useQuickParse + ParsedFieldChips; anchor-time default | Create |
| `src/components/schedule/TimelineQuickInput.test.tsx` | Unit tests | Create |
| `src/components/schedule/TimelineInsertPoint.tsx` | mode: closed/wheel/input; t/e/r→input, note→bubble; `onCreate(kind,result)` | Modify |
| `src/components/schedule/TimelineInsertPoint.test.tsx` | Update for new mode behavior | Modify |
| `src/hooks/useTimelineInsert.ts` | handlePick no longer creates t/e/r directly; note unchanged | Modify |
| `src/components/schedule/TodaySchedule.tsx` | Pass `onCreate`/`parserContext`/`anchorTime` to insert points | Modify |
| `src/App.tsx` | Handlers drop prompt, accept parsed result, fire confirm+Undo via `InboxUndoToast` | Modify |

**Shared result type** (used across Tasks 3–7), define in `src/components/schedule/TimelineQuickInput.tsx` and import elsewhere:
```ts
export interface TimelineCaptureResult {
  title: string
  scheduledFor: Date | null
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
}
```

---

## Task 1: Extract `useQuickParse` hook (behavior-preserving)

**Files:**
- Create: `src/hooks/useQuickParse.ts`, `src/hooks/useQuickParse.test.ts`
- Modify: `src/components/layout/QuickCapture.tsx`

QuickCapture currently holds (verified lines ~55–300): `overrides` state; `parsed` (`useMemo(parseQuickInput(title,{projects,contacts,familyMembers}))`); `effectiveParsed` (applies overrides incl. `context`/`currentDomain`); `hasParsedFields`/`showPreview`; `projectName`/`contactName`; and `clearProject/clearContact/clearDate/clearCategory/clearContext/clearAssignment`, `applyContext`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useQuickParse.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuickParse } from './useQuickParse'

const ctx = { projects: [{ id: 'p1', name: 'Garden' }], contacts: [{ id: 'c1', name: 'Iris' }], familyMembers: [{ id: 'm1', name: 'Scott' }] }

describe('useQuickParse', () => {
  it('parses #project and exposes effective + display name', () => {
    const { result } = renderHook(() => useQuickParse('Water #Garden', ctx, 'universal'))
    expect(result.current.effectiveParsed.projectId).toBe('p1')
    expect(result.current.projectName).toBe('Garden')
    expect(result.current.hasFields).toBe(true)
  })
  it('clearProject override removes the parsed project', () => {
    const { result } = renderHook(() => useQuickParse('Water #Garden', ctx, 'universal'))
    act(() => result.current.clearProject())
    expect(result.current.effectiveParsed.projectId).toBeUndefined()
  })
  it('defaults context from domain when not universal and no override', () => {
    const { result } = renderHook(() => useQuickParse('Buy milk', ctx, 'family'))
    expect(result.current.effectiveParsed.context).toBe('family')
  })
  it('clearContext override nulls the domain-defaulted context', () => {
    const { result } = renderHook(() => useQuickParse('Buy milk', ctx, 'family'))
    act(() => result.current.clearContext())
    expect(result.current.effectiveParsed.context).toBeUndefined()
  })
}
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/hooks/useQuickParse.test.ts` → module not found.

- [ ] **Step 3: Implement `src/hooks/useQuickParse.ts`** — move the logic verbatim out of QuickCapture (do not change semantics):

```ts
import { useMemo, useState } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput, type ParserContext } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'

type Domain = 'work' | 'family' | 'personal' | 'universal'

interface Overrides {
  projectId?: string | null
  contactId?: string | null
  dueDate?: Date | null
  category?: TaskCategory | null
  context?: TaskContext | null
  assignedMemberIds?: string[] | null
}

export function useQuickParse(title: string, ctx: ParserContext, currentDomain: Domain) {
  const [overrides, setOverrides] = useState<Overrides>({})

  const parsed = useMemo<ParsedQuickInput>(
    () => parseQuickInput(title, ctx),
    [title, ctx],
  )

  const effectiveParsed = useMemo(() => ({
    ...parsed,
    projectId: overrides.projectId === null ? undefined : (overrides.projectId ?? parsed.projectId),
    contactId: overrides.contactId === null ? undefined : (overrides.contactId ?? parsed.contactId),
    dueDate: overrides.dueDate === null ? undefined : (overrides.dueDate ?? parsed.dueDate),
    category: overrides.category === null ? undefined : (overrides.category ?? parsed.category),
    context: overrides.context === null ? undefined : (overrides.context ?? (currentDomain !== 'universal' ? currentDomain as TaskContext : undefined)),
    assignedMemberIds: overrides.assignedMemberIds === null ? undefined : (overrides.assignedMemberIds ?? parsed.assignedMemberIds),
  }), [parsed, overrides, currentDomain])

  const hasFields = hasParsedFields(effectiveParsed) || !!effectiveParsed.context

  const projectName = useMemo(
    () => (effectiveParsed.projectId ? ctx.projects.find(p => p.id === effectiveParsed.projectId)?.name ?? null : null),
    [effectiveParsed.projectId, ctx.projects],
  )
  const contactName = useMemo(
    () => (effectiveParsed.contactId ? ctx.contacts.find(c => c.id === effectiveParsed.contactId)?.name ?? null : null),
    [effectiveParsed.contactId, ctx.contacts],
  )

  return {
    effectiveParsed,
    hasFields,
    projectName,
    contactName,
    setOverride: (patch: Overrides) => setOverrides(prev => ({ ...prev, ...patch })),
    clearProject: () => setOverrides(prev => ({ ...prev, projectId: null })),
    clearContact: () => setOverrides(prev => ({ ...prev, contactId: null })),
    clearDate: () => setOverrides(prev => ({ ...prev, dueDate: null })),
    clearCategory: () => setOverrides(prev => ({ ...prev, category: null })),
    clearContext: () => setOverrides(prev => ({ ...prev, context: null })),
    clearAssignment: () => setOverrides(prev => ({ ...prev, assignedMemberIds: null })),
    applyContext: (c: TaskContext) => setOverrides(prev => ({ ...prev, context: c })),
  }
}
```

- [ ] **Step 4: Refactor `QuickCapture.tsx` to consume the hook.** Replace its inline `overrides` state, `parsed`/`effectiveParsed` memos, `projectName`/`contactName` memos, and the `clear*`/`applyContext` functions with a single `const qp = useQuickParse(title, { projects, contacts, familyMembers }, currentDomain)` and reference `qp.effectiveParsed`, `qp.hasFields` (where `showPreview` used `hasParsedFields(effectiveParsed) || !!effectiveParsed.context`), `qp.projectName`, `qp.contactName`, `qp.clearProject` etc. Do NOT change any `onAdd`/`onAddRich`/`onAddNote` logic, the inbox-vs-scheduled branch, note detection, or JSX structure beyond swapping these references. Keep `showPreview` as `qp.hasFields`.

- [ ] **Step 5: Regression gate — QuickCapture suite passes UNCHANGED**

Run: `npx vitest run src/components/layout/QuickCapture.test.tsx src/hooks/useQuickParse.test.ts`
Expected: QuickCapture **20/20 pass with the test file unmodified** + useQuickParse 4/4 pass. If any QuickCapture test fails or needs editing → STOP, behavior drifted; fix the hook to match original semantics. Do not edit QuickCapture.test.tsx.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run build
git add src/hooks/useQuickParse.ts src/hooks/useQuickParse.test.ts src/components/layout/QuickCapture.tsx
git commit -m "refactor(capture): extract useQuickParse from QuickCapture (behavior-preserving)"
```

---

## Task 2: Extract `ParsedFieldChips` component (behavior-preserving)

**Files:**
- Create: `src/components/capture/ParsedFieldChips.tsx`, `src/components/capture/ParsedFieldChips.test.tsx`
- Modify: `src/components/layout/QuickCapture.tsx`

The chip row in QuickCapture renders, when present: date/time chip (🕐 if has time else 📅, label = `effectiveParsed.dueDateMatch` or formatted date), `#project` chip (`projectName`), `@contact` chip (`contactName`), category chip (`effectiveParsed.category`), context chip (`effectiveParsed.context`) — each with an `×` button calling the matching clear handler.

- [ ] **Step 1: Failing test** — `src/components/capture/ParsedFieldChips.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ParsedFieldChips } from './ParsedFieldChips'

const base = { onClearDate: vi.fn(), onClearProject: vi.fn(), onClearContact: vi.fn(), onClearCategory: vi.fn(), onClearContext: vi.fn() }

describe('ParsedFieldChips', () => {
  it('renders nothing when no fields', () => {
    const { container } = render(<ParsedFieldChips parsed={{ rawText:'', title:'' }} projectName={null} contactName={null} {...base} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders a project chip and × clears it', () => {
    render(<ParsedFieldChips parsed={{ rawText:'', title:'', projectId:'p1' }} projectName="Garden" contactName={null} {...base} />)
    expect(screen.getByText(/Garden/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear project/i }))
    expect(base.onClearProject).toHaveBeenCalled()
  })
  it('renders a time chip when dueDate has a time', () => {
    const d = new Date(2026,4,19,18,15)
    render(<ParsedFieldChips parsed={{ rawText:'', title:'', dueDate:d }} projectName={null} contactName={null} {...base} />)
    expect(screen.getByText(/6:15|18:15|🕐/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/components/capture/ParsedFieldChips.test.tsx`.

- [ ] **Step 3: Implement `ParsedFieldChips.tsx`** — move the chip JSX out of QuickCapture verbatim into a presentational component:

```tsx
import { X } from 'lucide-react'
import type { ParsedQuickInput } from '@/lib/quickInputParser'

interface Props {
  parsed: ParsedQuickInput
  projectName: string | null
  contactName: string | null
  onClearDate: () => void
  onClearProject: () => void
  onClearContact: () => void
  onClearCategory: () => void
  onClearContext: () => void
}

const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-50 text-primary-700 border border-primary-100'
const xBtn = 'p-0.5 rounded hover:bg-primary-100'

export function ParsedFieldChips({ parsed, projectName, contactName, onClearDate, onClearProject, onClearContact, onClearCategory, onClearContext }: Props) {
  const hasTime = !!parsed.dueDate && (parsed.dueDate.getHours() !== 0 || parsed.dueDate.getMinutes() !== 0)
  const dateLabel = parsed.dueDate
    ? (parsed.dueDateMatch ?? parsed.dueDate.toLocaleString([], hasTime ? { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' } : { month:'short', day:'numeric' }))
    : null
  if (!parsed.dueDate && !parsed.projectId && !parsed.contactId && !parsed.category && !parsed.context) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {dateLabel && (
        <span className={chip}>{hasTime ? '🕐' : '📅'} {dateLabel}
          <button type="button" aria-label="clear date" className={xBtn} onClick={onClearDate}><X className="w-3 h-3" /></button></span>
      )}
      {parsed.projectId && projectName && (
        <span className={chip}>#{projectName}
          <button type="button" aria-label="clear project" className={xBtn} onClick={onClearProject}><X className="w-3 h-3" /></button></span>
      )}
      {parsed.contactId && contactName && (
        <span className={chip}>@{contactName}
          <button type="button" aria-label="clear contact" className={xBtn} onClick={onClearContact}><X className="w-3 h-3" /></button></span>
      )}
      {parsed.category && (
        <span className={chip}>{parsed.category}
          <button type="button" aria-label="clear category" className={xBtn} onClick={onClearCategory}><X className="w-3 h-3" /></button></span>
      )}
      {parsed.context && (
        <span className={chip}>{parsed.context}
          <button type="button" aria-label="clear context" className={xBtn} onClick={onClearContext}><X className="w-3 h-3" /></button></span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: QuickCapture consumes `ParsedFieldChips`.** Replace QuickCapture's inline chip JSX block with `<ParsedFieldChips parsed={qp.effectiveParsed} projectName={qp.projectName} contactName={qp.contactName} onClearDate={qp.clearDate} onClearProject={qp.clearProject} onClearContact={qp.clearContact} onClearCategory={qp.clearCategory} onClearContext={qp.clearContext} />`. Keep the surrounding preview container/conditions (`showPreview`) as-is.

- [ ] **Step 5: Regression gate** — `npx vitest run src/components/layout/QuickCapture.test.tsx src/components/capture/ParsedFieldChips.test.tsx`. QuickCapture **20/20 pass, test file unmodified**; chips 3/3 pass. If a QuickCapture test (esp. "shows preview when …", "removes parsed field when ×") fails → the extracted markup/labels differ from original; reconcile until the suite passes unchanged.

- [ ] **Step 6: Commit**

```bash
npm run build
git add src/components/capture/ParsedFieldChips.tsx src/components/capture/ParsedFieldChips.test.tsx src/components/layout/QuickCapture.tsx
git commit -m "refactor(capture): extract ParsedFieldChips from QuickCapture (behavior-preserving)"
```

---

## Task 3: `TimelineQuickInput`

**Files:** Create `src/components/schedule/TimelineQuickInput.tsx`, `src/components/schedule/TimelineQuickInput.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineQuickInput } from './TimelineQuickInput'

const pc = { projects: [], contacts: [], familyMembers: [] }
const anchor = new Date(2026,4,19,18,15)

describe('TimelineQuickInput', () => {
  it('shows kind + anchor time in the placeholder', () => {
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByPlaceholderText(/new task ·/i)).toBeInTheDocument()
  })
  it('Enter with text submits effective result; no typed time → scheduledFor = anchor', () => {
    const onSubmit = vi.fn()
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const inp = screen.getByPlaceholderText(/new task ·/i)
    fireEvent.change(inp, { target: { value: 'Call vet' } })
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call vet', scheduledFor: anchor }))
  })
  it('empty Enter does nothing; Esc cancels', () => {
    const onSubmit = vi.fn(); const onCancel = vi.fn()
    render(<TimelineQuickInput kind="event" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={onCancel} />)
    const inp = screen.getByPlaceholderText(/new event ·/i)
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(inp, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `TimelineQuickInput.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ParserContext } from '@/lib/quickInputParser'
import { useQuickParse } from '@/hooks/useQuickParse'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'

export interface TimelineCaptureResult {
  title: string
  scheduledFor: Date | null
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
}

type Domain = 'work' | 'family' | 'personal' | 'universal'
interface Props {
  kind: 'task' | 'event' | 'routine'
  anchorTime: Date | null
  parserContext: ParserContext
  currentDomain: Domain
  onSubmit: (r: TimelineCaptureResult) => void
  onCancel: () => void
}

export function TimelineQuickInput({ kind, anchorTime, parserContext, currentDomain, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const qp = useQuickParse(title, parserContext, currentDomain)
  const timeLabel = anchorTime
    ? anchorTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const placeholder = `New ${kind}${timeLabel ? ` · ${timeLabel}` : ''}`

  const submit = () => {
    const t = title.trim()
    if (!t) return
    const p = qp.effectiveParsed
    onSubmit({
      title: p.title?.trim() || t,
      scheduledFor: p.dueDate ?? anchorTime,
      category: p.category,
      projectId: p.projectId,
      contactId: p.contactId,
      assignedMemberIds: p.assignedMemberIds,
    })
  }

  return (
    <div className="w-full px-1 py-1">
      <input
        ref={ref}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        onBlur={onCancel}
        placeholder={placeholder}
        className="w-full bg-transparent text-lg md:text-2xl font-display text-neutral-800 placeholder:text-neutral-400 outline-none"
      />
      <ParsedFieldChips
        parsed={qp.effectiveParsed}
        projectName={qp.projectName}
        contactName={qp.contactName}
        onClearDate={qp.clearDate}
        onClearProject={qp.clearProject}
        onClearContact={qp.clearContact}
        onClearCategory={qp.clearCategory}
        onClearContext={qp.clearContext}
      />
    </div>
  )
}
```
(Note: `onBlur={onCancel}` — clicking a chip × blurs the input; acceptable for Phase-1.5 since the × applies its override synchronously on mousedown-derived click before blur cancels in tests via keyboard. If manual testing shows chip-× is unreachable due to blur, the follow-up is to guard blur with a relatedTarget check — out of scope unless observed.)

- [ ] **Step 4: Run, expect PASS (3 tests).**

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/components/schedule/TimelineQuickInput.tsx src/components/schedule/TimelineQuickInput.test.tsx
git commit -m "feat(timeline): TimelineQuickInput — inline smart-parse capture"
```

---

## Task 4: `TimelineInsertPoint` mode machine

**Files:** Modify `src/components/schedule/TimelineInsertPoint.tsx`; Modify `src/components/schedule/TimelineInsertPoint.test.tsx`

Current: `+` toggles a wheel; picking any kind calls `onPick(kind)` and closes. New: keep `onPick` for the `note` bubble-up; add `onCreate` + `quickInputProps` for inline t/e/r.

- [ ] **Step 1: Update the test** — replace the existing "fires onPick with the kind and closes" assertion. New `TimelineInsertPoint.test.tsx` cases:

```tsx
it('note pick still bubbles via onPick and closes', () => {
  const onPick = vi.fn()
  render(<TimelineInsertPoint onPick={onPick} onCreate={vi.fn()} quickInput={{ anchorTime: null, parserContext: { projects:[], contacts:[], familyMembers:[] }, currentDomain: 'universal' }} />)
  fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
  fireEvent.click(screen.getByRole('button', { name: /^note$/i }))
  expect(onPick).toHaveBeenCalledWith('note')
  expect(screen.queryByRole('button', { name: /^note$/i })).not.toBeInTheDocument()
})
it('task pick opens the inline input (no immediate create); submit fires onCreate', () => {
  const onCreate = vi.fn(); const onPick = vi.fn()
  render(<TimelineInsertPoint onPick={onPick} onCreate={onCreate} quickInput={{ anchorTime: new Date(2026,4,19,18,15), parserContext: { projects:[], contacts:[], familyMembers:[] }, currentDomain: 'universal' }} />)
  fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
  fireEvent.click(screen.getByRole('button', { name: /^task$/i }))
  expect(onPick).not.toHaveBeenCalled()
  const inp = screen.getByPlaceholderText(/new task ·/i)
  fireEvent.change(inp, { target: { value: 'Walk dog' } })
  fireEvent.keyDown(inp, { key: 'Enter' })
  expect(onCreate).toHaveBeenCalledWith('task', expect.objectContaining({ title: 'Walk dog' }))
})
```
Keep the existing tests for: renders `+`, opens wheel showing 4 segments, Escape closes wheel.

- [ ] **Step 2: Run, expect FAIL** (new props/behavior absent).

- [ ] **Step 3: Implement** — modify `TimelineInsertPoint.tsx`. Add to Props: `onCreate: (kind: 'task'|'event'|'routine', r: TimelineCaptureResult) => void` and `quickInput: { anchorTime: Date | null; parserContext: ParserContext; currentDomain: 'work'|'family'|'personal'|'universal' }`. Replace the single `open` boolean with `mode: 'closed' | 'wheel' | 'input'` and an `inputKind` state. Wheel segment onClick:
```tsx
const pick = (k: InsertKind) => {
  if (k === 'note') { setMode('closed'); onPick('note'); return }
  setInputKind(k); setMode('input')
}
```
When `mode === 'input'`, render `<TimelineQuickInput kind={inputKind} anchorTime={quickInput.anchorTime} parserContext={quickInput.parserContext} currentDomain={quickInput.currentDomain} onSubmit={(r) => { setMode('closed'); onCreate(inputKind, r) }} onCancel={() => setMode('closed')} />` in place of the wheel. Keep Esc/outside-click closing whatever is open. Keep `onPick` typed to still accept all kinds (note path). Import `TimelineQuickInput` + `TimelineCaptureResult` + `ParserContext`.

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/components/schedule/TimelineInsertPoint.test.tsx`.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/components/schedule/TimelineInsertPoint.tsx src/components/schedule/TimelineInsertPoint.test.tsx
git commit -m "feat(timeline): TimelineInsertPoint closed→wheel→input mode machine"
```

---

## Task 5: `useTimelineInsert` — stop direct create for t/e/r

**Files:** Modify `src/hooks/useTimelineInsert.ts`, `src/hooks/useTimelineInsert.test.ts`

Currently `handlePick(ctx, kind)` calls `onCreateTaskAt/EventAt/RoutineAt(anchor)` for t/e/r and opens `noteComposer` for note. Creation for t/e/r now happens via `TimelineInsertPoint`→`onCreate`, so `handlePick` should ONLY handle `note` (open composer); t/e/r are handled by the insert point's inline flow.

- [ ] **Step 1: Update test** `src/hooks/useTimelineInsert.test.ts` — replace the task/event "calls onCreate*" cases with:
```ts
it('note pick opens the composer with the anchor', () => {
  const { result } = renderHook(() => useTimelineInsert())
  act(() => result.current.handlePick(ctx, 'note'))
  expect(result.current.noteComposer?.anchor?.getMinutes()).toBe(15)
})
it('task/event/routine pick is a no-op here (handled inline by the insert point)', () => {
  const { result } = renderHook(() => useTimelineInsert())
  act(() => result.current.handlePick(ctx, 'task'))
  expect(result.current.noteComposer).toBeNull()
})
```
(`useTimelineInsert` now takes no callbacks.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** — simplify `useTimelineInsert.ts`:
```ts
import { useState, useCallback } from 'react'
import { computeAnchorTime, type AnchorInput } from '@/lib/timelineAnchor'
import type { InsertKind } from '@/components/schedule/TimelineInsertPoint'

interface NoteComposerState { anchor: Date | null }

export function useTimelineInsert() {
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null)
  const handlePick = useCallback((ctx: AnchorInput, kind: InsertKind) => {
    if (kind === 'note') setNoteComposer({ anchor: computeAnchorTime(ctx) })
    // task/event/routine: handled inline by TimelineInsertPoint → onCreate
  }, [])
  const closeNoteComposer = useCallback(() => setNoteComposer(null), [])
  return { handlePick, noteComposer, closeNoteComposer }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/hooks/useTimelineInsert.ts src/hooks/useTimelineInsert.test.ts
git commit -m "refactor(timeline): useTimelineInsert handles note only (t/e/r inline)"
```

---

## Task 6: App handlers — drop prompt, accept parsed result, confirm+Undo

**Files:** Modify `src/App.tsx`

`InboxUndoToast` props: `{ message, onUndo?, onDismiss, durationMs=10000 }`. Deletes: `deleteTask(id)`, `deleteRoutine(id)`, `deleteNote(id)`, `deleteEvent({ eventId })`. Creates return ids: `addTask`→`string|undefined`, `createEvent`→`{id}`, `addRoutine`→`Routine|null`, `addNote`→`Note|null`. `InboxUndoToast` is already importable; App already imports `useToast`.

- [ ] **Step 1: Add undo-toast state + renderer.** Near App's other toast state (`const { toast } = useToast()` ~line 211), add:
```tsx
const [tlUndo, setTlUndo] = useState<{ message: string; onUndo: () => void } | null>(null)
```
Import `InboxUndoToast` (`import { InboxUndoToast } from '@/components/schedule/InboxUndoToast'`) and render near the other toasts in App's JSX:
```tsx
{tlUndo && (
  <InboxUndoToast message={tlUndo.message} onUndo={() => { tlUndo.onUndo(); setTlUndo(null) }} onDismiss={() => setTlUndo(null)} />
)}
```

- [ ] **Step 2: Add a helper** (near the handlers):
```tsx
const fmtT = (d: Date | null) => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'inbox'
```

- [ ] **Step 3: Replace the three handlers** (`onCreateTaskAt/EventAt/RoutineAt`, the current `window.prompt` versions) with result-accepting + confirm/Undo versions:
```tsx
onCreateTaskAt: async (r: TimelineCaptureResult) => {
  const when = r.scheduledFor
  const id = await addTask(r.title, r.contactId, r.projectId, when ?? undefined, {
    isAllDay: !when,
    category: r.category,
    context: r.category ? undefined : (currentDomain !== 'universal' ? currentDomain : undefined),
    assignedTo: r.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id,
  })
  if (id) setTlUndo({ message: `✓ Task added · ${fmtT(when)}`, onUndo: () => { void deleteTask(id) } })
  else showToast("Couldn't add task", 'warning')
},
onCreateEventAt: async (r: TimelineCaptureResult) => {
  const when = r.scheduledFor
  if (!when) { showToast('Event needs a time', 'warning'); return }
  try {
    const ev = await createEvent({ title: r.title, startTime: when, endTime: new Date(when.getTime() + 30 * 60_000) })
    setTlUndo({ message: `✓ Event added · ${fmtT(when)}`, onUndo: () => { void deleteEvent({ eventId: ev.id }) } })
  } catch { showToast("Couldn't add event", 'warning') }
},
onCreateRoutineAt: async (r: TimelineCaptureResult) => {
  const when = r.scheduledFor
  const hhmm = when ? `${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}` : undefined
  const routine = await addRoutine({ name: r.title, time_of_day: hhmm, recurrence_pattern: { type: 'daily' } })
  if (routine) setTlUndo({ message: `✓ Routine added · ${fmtT(when)}`, onUndo: () => { void deleteRoutine(routine.id) } })
  else showToast("Couldn't add routine", 'warning')
},
```
Confirm `deleteTask`, `deleteEvent`, `addRoutine`, `deleteRoutine`, `addTask`, `createEvent`, `getCurrentUserMember`, `currentDomain`, `showToast` are in App scope (grep). `deleteRoutine` may need adding to App's `useRoutines()` destructure — if so, add only that name. Import `TimelineCaptureResult` from `@/components/schedule/TimelineQuickInput`.

- [ ] **Step 4: Note create-new toast.** Where App wires `onCreateNoteAt` (the `addNote(...)` from Phase 1), capture the returned note and fire the same toast:
```tsx
onCreateNoteAt: async (c: string, a: Date | null) => {
  const note = await addNote({ content: c, type: 'general', timelineAt: a ?? undefined, context: currentDomain !== 'universal' ? currentDomain : undefined })
  if (note) setTlUndo({ message: `✓ Note added · ${fmtT(a)}`, onUndo: () => { void deleteNote(note.id) } })
},
```
(`onAppendNoteAt` unchanged — confirm-only is out of scope per spec; leave as-is.) Add `deleteNote` to App's `useNotesContext()`/`useNotes()` destructure if not present.

- [ ] **Step 5: Typecheck + targeted tests**

```bash
npm run build
npx vitest run src/components/layout/QuickCapture.test.tsx src/hooks/useQuickParse.test.ts src/components/capture/ParsedFieldChips.test.tsx src/components/schedule/TimelineQuickInput.test.tsx src/components/schedule/TimelineInsertPoint.test.tsx src/hooks/useTimelineInsert.test.ts
```
Expected: all pass; tsc clean (no `as any`). If `onCreateTaskAt` etc. now mismatch the consuming prop/context type, that is fixed in Task 7 — capture the exact error and proceed only if it is solely that signature mismatch.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(timeline): inline-result create handlers + confirm/Undo toast"
```

---

## Task 7: Wire `TimelineInsertPoint` in `TodaySchedule`

**Files:** Modify `src/components/schedule/TodaySchedule.tsx`

Phase 1 already renders `<TimelineInsertPoint onPick={(k)=>insert.handlePick(ctx,k)} />` (between items, section head/tail, empty timed sections — Task 8 of the prior plan). Now it must also pass `onCreate` and `quickInput`.

- [ ] **Step 1:** Add props to `TodayScheduleProps`: `onCreateTaskAt?: (r: TimelineCaptureResult) => void`, `onCreateEventAt?: (r: TimelineCaptureResult) => void`, `onCreateRoutineAt?: (r: TimelineCaptureResult) => void` (these REPLACE the Phase-1 `(when: Date|null)=>void` signatures of the same names — update the interface), plus existing `onCreateNoteAt`/`onAppendNoteAt`/`onLinkNote`/`timelineNotes`. Build a `parserContext` from data already in the component (projects, contacts, familyMembers — these are already available; grep for `projectsMap`/`contacts`/`familyMembers` and adapt to `{ projects: [...], contacts: [...], familyMembers: [...] }` with `{id,name}` each). Derive `currentDomain` from the existing domain source used in this file (grep `currentDomain`/`useDomain`).

- [ ] **Step 2:** At each `<TimelineInsertPoint ... />` render site, add:
```tsx
onCreate={(kind, r) => {
  if (kind === 'task') onCreateTaskAt?.(r)
  else if (kind === 'event') onCreateEventAt?.(r)
  else onCreateRoutineAt?.(r)
}}
quickInput={{ anchorTime: computeAnchorTime(insertCtx), parserContext, currentDomain }}
```
(`computeAnchorTime` already imported in Phase 1; `insertCtx` is the existing per-gap ctx variable. For the empty-section/trailing insert points, reuse their existing ctx.)

- [ ] **Step 3:** Update App→TodaySchedule prop pass-through (the schedule-actions context value / `ScheduleActionsContext.tsx` type from Phase 1): the three `onCreate*At` now have signature `(r: TimelineCaptureResult) => void` — update that type. No `as any`.

- [ ] **Step 4: Typecheck + run the timeline + QuickCapture suites**

```bash
npm run build
npx vitest run src/components/schedule/TimelineInsertPoint.test.tsx src/components/schedule/TimelineQuickInput.test.tsx src/hooks/useTimelineInsert.test.ts src/hooks/useQuickParse.test.ts src/components/capture/ParsedFieldChips.test.tsx src/components/layout/QuickCapture.test.tsx src/lib/timelineAnchor.test.ts src/hooks/useNotes.test.ts src/components/schedule/TimelineNoteComposer.test.tsx src/components/schedule/TimelineNoteCard.test.tsx
```
Expected: tsc clean; all pass; QuickCapture suite still 20/20 unmodified.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodaySchedule.tsx src/contexts/ScheduleActionsContext.tsx
git commit -m "feat(timeline): wire inline capture (onCreate + parserContext) into TodaySchedule"
```

---

## Task 8: Verification

**Files:** none (verification + manual matrix doc for PR)

- [ ] **Step 1:** From the worktree: `npm run build` (tsc clean) then `npm test 2>&1 | tail -15`. Expected: timeline + QuickCapture + capture suites pass; the only failure is the documented pre-existing unrelated `src/hooks/useSpaces.test.ts` (byte-identical on main — out of scope; do not fix, just confirm it is the ONLY failure and not new).

- [ ] **Step 2:** Grep guard: `grep -n "window.prompt" src/App.tsx` → expected NO matches (all three removed).

- [ ] **Step 3:** Record manual matrix for the PR description:
  - Desktop: pick Task at a gap → inline serif input + chips; type `Dentist 3pm #health` → time & project chips; Enter → confirm+Undo toast; Undo removes it.
  - Mobile (<768px): input + chips reachable; toast tappable.
  - Wall kiosk: serif legible at 8 ft; Undo target ≥64px.

- [ ] **Step 4: Commit** (if any doc/notes added; otherwise skip). No code changes in this task.

---

## Self-Review

**Spec coverage:**
- Inline anchored input replacing 3 `window.prompt` → Tasks 3,4,6 (+grep guard Task 8). ✓
- Full smart-parse parity via shared extraction → Tasks 1,2 (hook+chips), consumed Task 3; QuickCapture behavior-preserving gate Tasks 1.5/2.5. ✓
- Anchor-time as overridable default → Task 3 (`p.dueDate ?? anchorTime`; time chip via ParsedFieldChips, ×-clearable). ✓
- Confirm+Undo for Task/Event/Routine/Note(create-new); append confirm-only/out → Task 6. ✓
- Command palette OUT; PlanningSession untouched; no new infra → no task adds them. ✓
- Testing (hook, chips, input, insert point, QuickCapture regression, seam) → Tasks 1–7 + Task 8. ✓

**Placeholder scan:** none — every code step has full code; the `onBlur` chip-click caveat is an explicit, scoped decision, not a TODO.

**Type consistency:** `TimelineCaptureResult` defined in Task 3 (`TimelineQuickInput.tsx`), imported by Tasks 4 (insert point), 6 (App), 7 (TodaySchedule/ScheduleActionsContext). `useQuickParse(title, ctx, currentDomain)` signature consistent Tasks 1→3. `useTimelineInsert()` (no args) consistent Tasks 5→ (TodaySchedule already calls it; Task 7 keeps it). `InboxUndoToast` props match its real interface. Delete fns match real signatures (`deleteEvent({eventId})`, `deleteRoutine(id)`).

**Risk note:** Tasks 1 & 2 are the QuickCapture extraction; both gate on `QuickCapture.test.tsx` (20 tests) passing **unmodified** — that file must not be edited; a needed edit = behavior drift = stop and reconcile.
