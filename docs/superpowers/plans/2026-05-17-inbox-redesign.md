# Inbox + This-Week Popover Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Inbox triage UX with a dense one-row-per-item layout (default) plus a keyboard-driven focus mode, and rebuild the "This Week" popover on the Today page using a shared row component scoped to week-bucket items only.

**Architecture:** A new `DenseInboxRow` component is the shared atom — used by both the Inbox view and the StagingFloat popover. Each view passes a different `quickActions` set: Inbox passes `[Today, Week, Month, Someday, Delete]`; This-Week popover passes `[Today, Next-Week, Someday, Delete]`. Triage triggers a 200ms fade-out CSS animation, then the data mutation runs, then a 5-second undo toast appears. The Inbox view also exposes a mode toggle (Dense | Focus); Focus mode renders one large card at a time and processes keyboard 1/2/3/4 to triage + auto-advance.

**Tech Stack:** React 19, TypeScript strict, Vitest + RTL, Tailwind v4 (Nordic Journal). No new dependencies. CSS transitions for animation (no framer-motion).

**Spec:** `docs/superpowers/specs/2026-05-17-inbox-redesign-design.md`

---

## Task 1: Add `weekDeferredAt` field to Task type

**Files:**
- Modify: `src/types/task.ts`

- [ ] **Step 1: Add the optional field to the Task interface**

In `src/types/task.ts`, add `weekDeferredAt` as an optional `Date` field below the existing `deferCount` line:

```typescript
// Locate this block in src/types/task.ts:
//   deferredUntil?: Date
//   deferCount?: number
// and add weekDeferredAt right after deferCount:

  deferCount?: number // Times this task has been deferred
  weekDeferredAt?: Date // Set when an item already in 'week' bucket is bumped to next week — sinks it to the bottom of the This Week popover
  isAllDay?: boolean
```

- [ ] **Step 2: Run typecheck**

Run: `npm run build`
Expected: build succeeds. (The field is optional so no existing code breaks.)

- [ ] **Step 3: Commit**

```bash
git add src/types/task.ts
git commit -m "feat(types): add Task.weekDeferredAt for next-week defer ordering"
```

---

## Task 2: Create `useInboxMode` hook

The hook owns the dense | focus preference and persists it to localStorage. Storage key: `symphony-inbox-mode`.

**Files:**
- Create: `src/hooks/useInboxMode.ts`
- Create: `src/hooks/useInboxMode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useInboxMode.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInboxMode } from './useInboxMode'

describe('useInboxMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "dense" when no preference stored', () => {
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('dense')
  })

  it('reads stored preference on init', () => {
    localStorage.setItem('symphony-inbox-mode', 'focus')
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('focus')
  })

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useInboxMode())
    act(() => { result.current[1]('focus') })
    expect(localStorage.getItem('symphony-inbox-mode')).toBe('focus')
    expect(result.current[0]).toBe('focus')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('symphony-inbox-mode', 'garbage')
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('dense')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/hooks/useInboxMode.test.ts --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useInboxMode.ts
import { useState, useCallback } from 'react'

export type InboxMode = 'dense' | 'focus'

const STORAGE_KEY = 'symphony-inbox-mode'

function readStored(): InboxMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'focus' ? 'focus' : 'dense'
  } catch {
    return 'dense'
  }
}

export function useInboxMode(): [InboxMode, (m: InboxMode) => void] {
  const [mode, setModeState] = useState<InboxMode>(readStored)

  const setMode = useCallback((m: InboxMode) => {
    setModeState(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch { /* ignore */ }
  }, [])

  return [mode, setMode]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/hooks/useInboxMode.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInboxMode.ts src/hooks/useInboxMode.test.ts
git commit -m "feat(hooks): add useInboxMode for dense/focus pref"
```

---

## Task 3: Create `InboxModeToggle` component

A small two-button segmented toggle in the Inbox header.

**Files:**
- Create: `src/components/schedule/InboxModeToggle.tsx`
- Create: `src/components/schedule/InboxModeToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/schedule/InboxModeToggle.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxModeToggle } from './InboxModeToggle'

describe('InboxModeToggle', () => {
  it('renders both options with current selected', () => {
    render(<InboxModeToggle mode="dense" onChange={() => {}} />)
    const dense = screen.getByRole('button', { name: /list view/i })
    const focus = screen.getByRole('button', { name: /focus mode/i })
    expect(dense).toHaveAttribute('aria-pressed', 'true')
    expect(focus).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onChange when other option clicked', () => {
    const onChange = vi.fn()
    render(<InboxModeToggle mode="dense" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    expect(onChange).toHaveBeenCalledWith('focus')
  })

  it('does not fire onChange when clicking the already-active option', () => {
    const onChange = vi.fn()
    render(<InboxModeToggle mode="dense" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /list view/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/InboxModeToggle.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/schedule/InboxModeToggle.tsx
import { List, Layers } from 'lucide-react'
import type { InboxMode } from '@/hooks/useInboxMode'

interface InboxModeToggleProps {
  mode: InboxMode
  onChange: (mode: InboxMode) => void
}

export function InboxModeToggle({ mode, onChange }: InboxModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5">
      <button
        type="button"
        aria-pressed={mode === 'dense'}
        aria-label="List view"
        onClick={() => mode !== 'dense' && onChange('dense')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === 'dense' ? 'bg-primary-50 text-primary-700' : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        List
      </button>
      <button
        type="button"
        aria-pressed={mode === 'focus'}
        aria-label="Focus mode"
        onClick={() => mode !== 'focus' && onChange('focus')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === 'focus' ? 'bg-primary-50 text-primary-700' : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        Focus
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/schedule/InboxModeToggle.test.tsx --run`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/InboxModeToggle.tsx src/components/schedule/InboxModeToggle.test.tsx
git commit -m "feat(inbox): add mode toggle component"
```

---

## Task 4: Create `InboxUndoToast` component

A bottom-left toast with a label, an Undo button, and a × dismiss. Auto-dismisses after `durationMs` (default 5000).

**Files:**
- Create: `src/components/schedule/InboxUndoToast.tsx`
- Create: `src/components/schedule/InboxUndoToast.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/schedule/InboxUndoToast.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxUndoToast } from './InboxUndoToast'

describe('InboxUndoToast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders the message and Undo button', () => {
    render(<InboxUndoToast message="Sent to Week" onUndo={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('Sent to Week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('calls onUndo when Undo clicked', () => {
    const onUndo = vi.fn()
    render(<InboxUndoToast message="Sent to Week" onUndo={onUndo} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss after durationMs', () => {
    const onDismiss = vi.fn()
    render(<InboxUndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} durationMs={3000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3001)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when × clicked', () => {
    const onDismiss = vi.fn()
    render(<InboxUndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/InboxUndoToast.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/schedule/InboxUndoToast.tsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

interface InboxUndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
  durationMs?: number
}

export function InboxUndoToast({ message, onUndo, onDismiss, durationMs = 5000 }: InboxUndoToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [onDismiss, durationMs])

  return (
    <div
      role="status"
      className="fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-neutral-800 text-white text-sm rounded-xl px-4 py-2.5 shadow-lg animate-fade-in"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="px-2 py-0.5 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors font-medium"
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="ml-1 p-0.5 rounded text-neutral-400 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/schedule/InboxUndoToast.test.tsx --run`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/InboxUndoToast.tsx src/components/schedule/InboxUndoToast.test.tsx
git commit -m "feat(inbox): add undo toast component"
```

---

## Task 5: Create `DenseInboxRow` component

The shared atom — one task per row, with checkbox · context dot · title · project chip · assignee avatar · quick-action buttons · delete. The owning view passes the `quickActions` array; this component renders the right buttons in the right order.

**Files:**
- Create: `src/components/schedule/DenseInboxRow.tsx`
- Create: `src/components/schedule/DenseInboxRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/schedule/DenseInboxRow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DenseInboxRow } from './DenseInboxRow'
import type { QuickAction } from './DenseInboxRow'
import { createMockTask, createMockProject } from '@/test/mocks/factories'

vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({ results: [], loading: false, searchPlaces: vi.fn(), getPlaceDetails: vi.fn(), clearResults: vi.fn() }),
}))

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'delete' }
]
const WEEK_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'next-week' }, { kind: 'someday' }, { kind: 'delete' }
]

describe('DenseInboxRow', () => {
  const baseProps = {
    task: createMockTask({ id: 't1', title: 'Test row' }),
    familyMembers: [],
    onQuickAction: vi.fn(),
    onToggleComplete: vi.fn(),
    onUpdate: vi.fn(),
    onSelect: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders task title', () => {
    render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('Test row')).toBeInTheDocument()
  })

  it('renders the inbox quick-action set', () => {
    render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^week$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^month$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^someday$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('renders the week quick-action set', () => {
    render(<DenseInboxRow {...baseProps} quickActions={WEEK_ACTIONS} />)
    expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^next week$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^someday$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^week$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^month$/i })).not.toBeInTheDocument()
  })

  it('calls onQuickAction with the correct kind when a button is clicked', () => {
    const onQuickAction = vi.fn()
    render(<DenseInboxRow {...baseProps} onQuickAction={onQuickAction} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'week' })
  })

  it('calls onQuickAction with delete when × clicked', () => {
    const onQuickAction = vi.fn()
    render(<DenseInboxRow {...baseProps} onQuickAction={onQuickAction} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'delete' })
  })

  it('calls onSelect when title clicked', () => {
    const onSelect = vi.fn()
    render(<DenseInboxRow {...baseProps} onSelect={onSelect} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByText('Test row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('renders project chip when project provided', () => {
    const project = createMockProject({ id: 'p1', name: 'My Project' })
    render(<DenseInboxRow {...baseProps} project={project} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('clears project assignment when chip × clicked', () => {
    const project = createMockProject({ id: 'p1', name: 'My Project' })
    const onUpdate = vi.fn()
    render(<DenseInboxRow {...baseProps} onUpdate={onUpdate} project={project} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /remove project/i }))
    expect(onUpdate).toHaveBeenCalledWith({ projectId: undefined })
  })

  it('applies leaving class when isLeaving is true', () => {
    const { container } = render(<DenseInboxRow {...baseProps} isLeaving quickActions={INBOX_ACTIONS} />)
    const row = container.querySelector('[data-row]') as HTMLElement
    expect(row.className).toMatch(/opacity-0/)
  })

  it('renders context dot button when context is set', () => {
    const task = createMockTask({ id: 't2', title: 'Family thing', context: 'family' })
    render(<DenseInboxRow {...baseProps} task={task} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByRole('button', { name: /context/i })).toBeInTheDocument()
  })

  it('strikes through completed tasks', () => {
    const task = createMockTask({ id: 't3', title: 'Done', completed: true })
    render(<DenseInboxRow {...baseProps} task={task} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('Done').className).toMatch(/line-through/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/DenseInboxRow.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/schedule/DenseInboxRow.tsx
import { memo, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { TaskCheckbox } from './TaskCheckbox'
import { DOMAIN_COLORS } from '@/lib/domainColors'

export type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }
  | { kind: 'delete' }

const ACTION_LABELS: Record<QuickAction['kind'], string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  someday: 'Someday',
  'next-week': 'Next Week',
  delete: 'Delete',
}

interface DenseInboxRowProps {
  task: Task
  project?: Project
  familyMembers: FamilyMember[]
  quickActions: QuickAction[]
  onQuickAction: (action: QuickAction) => void
  onToggleComplete: () => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onOpenProject?: (projectId: string) => void
  onAssign?: (memberIds: string[]) => void
  isLeaving?: boolean
}

const CONTEXT_OPTIONS: Array<{ value: TaskContext | null; label: string }> = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
  { value: null, label: 'Clear' },
]

export const DenseInboxRow = memo(function DenseInboxRow({
  task,
  project,
  familyMembers,
  quickActions,
  onQuickAction,
  onToggleComplete,
  onUpdate,
  onSelect,
  onOpenProject,
  onAssign,
  isLeaving,
}: DenseInboxRowProps) {
  const [contextOpen, setContextOpen] = useState(false)
  const contextColor = task.context ? DOMAIN_COLORS[task.context]?.dot : undefined

  return (
    <div
      data-row
      data-task-id={task.id}
      className={`
        group flex items-center gap-2 bg-white rounded-xl border border-neutral-100
        px-3 py-2 shadow-sm transition-all duration-200
        ${isLeaving ? 'opacity-0 translate-x-2 max-h-0 py-0 my-0 overflow-hidden border-transparent' : 'hover:shadow-md'}
      `}
    >
      {/* Checkbox */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <TaskCheckbox
          completed={task.completed}
          isWaiting={task.isWaiting}
          onToggleComplete={onToggleComplete}
          contextColor={contextColor}
        />
      </div>

      {/* Context dot button */}
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Context"
          onClick={() => setContextOpen((v) => !v)}
          className="w-3 h-3 rounded-full border border-neutral-200 hover:scale-110 transition-transform"
          style={{ background: contextColor ?? 'transparent' }}
        />
        {contextOpen && (
          <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px]">
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50"
                onClick={() => {
                  onUpdate({ context: opt.value })
                  setContextOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title */}
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 min-w-0 text-left text-sm leading-snug truncate ${
          task.completed
            ? 'text-neutral-400 line-through'
            : task.isWaiting
              ? 'text-amber-600/70 italic'
              : 'text-neutral-800'
        }`}
      >
        {task.title}
      </button>

      {/* Project chip */}
      {project && (
        <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[140px] shrink-0">
          {onOpenProject ? (
            <button type="button" onClick={() => onOpenProject(project.id)} className="truncate hover:underline">
              {project.name}
            </button>
          ) : (
            <span className="truncate">{project.name}</span>
          )}
          <button
            type="button"
            aria-label="Remove project"
            onClick={() => onUpdate({ projectId: undefined })}
            className="ml-0.5 hover:text-blue-900 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Assignee avatar */}
      {familyMembers.length > 0 && onAssign && (
        <div className="hidden md:block shrink-0" onClick={(e) => e.stopPropagation()}>
          <MultiAssigneeDropdown
            members={familyMembers}
            selectedIds={task.assignedToAll || []}
            onSelect={onAssign}
            size="sm"
          />
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {quickActions.map((action) => {
          const label = ACTION_LABELS[action.kind]
          if (action.kind === 'delete') {
            return (
              <button
                key="delete"
                type="button"
                aria-label="Delete"
                onClick={() => onQuickAction(action)}
                className="p-1.5 rounded-md text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          }
          const isPrimary = action.kind === 'today'
          return (
            <button
              key={action.kind}
              type="button"
              aria-label={label}
              onClick={() => onQuickAction(action)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                isPrimary
                  ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/schedule/DenseInboxRow.test.tsx --run`
Expected: PASS (11/11).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/DenseInboxRow.tsx src/components/schedule/DenseInboxRow.test.tsx
git commit -m "feat(inbox): add DenseInboxRow shared component"
```

---

## Task 6: Create `FocusInboxCard` component

One-at-a-time card with keyboard 1/2/3/4/D/arrows/Enter/Esc. Auto-advances after triage.

**Files:**
- Create: `src/components/schedule/FocusInboxCard.tsx`
- Create: `src/components/schedule/FocusInboxCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/schedule/FocusInboxCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FocusInboxCard } from './FocusInboxCard'
import { createMockTask } from '@/test/mocks/factories'

const tasks = [
  createMockTask({ id: 'a', title: 'First task' }),
  createMockTask({ id: 'b', title: 'Second task' }),
  createMockTask({ id: 'c', title: 'Third task' }),
]

describe('FocusInboxCard', () => {
  const baseProps = {
    tasks,
    projects: [],
    familyMembers: [],
    onTriage: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onSelectDetail: vi.fn(),
    onExitFocus: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders the first task title and progress', () => {
    render(<FocusInboxCard {...baseProps} />)
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument()
  })

  it('calls onTriage with today bucket when "1" pressed', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: '1' })
    expect(onTriage).toHaveBeenCalledWith('a', 'today')
  })

  it('calls onTriage with week, month, someday for 2/3/4', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.keyDown(window, { key: '4' })
    expect(onTriage).toHaveBeenNthCalledWith(1, 'a', 'week')
    expect(onTriage).toHaveBeenNthCalledWith(2, 'b', 'month')
    expect(onTriage).toHaveBeenNthCalledWith(3, 'c', 'quarter')
  })

  it('auto-advances after triage', () => {
    render(<FocusInboxCard {...baseProps} />)
    expect(screen.getByText('First task')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '1' })
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('calls onDelete and advances when "d" pressed', () => {
    const onDelete = vi.fn()
    render(<FocusInboxCard {...baseProps} onDelete={onDelete} />)
    fireEvent.keyDown(window, { key: 'd' })
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('skips forward on ArrowRight without triaging', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onTriage).not.toHaveBeenCalled()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('goes back on ArrowLeft', () => {
    render(<FocusInboxCard {...baseProps} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Second task')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('First task')).toBeInTheDocument()
  })

  it('calls onExitFocus on Escape', () => {
    const onExitFocus = vi.fn()
    render(<FocusInboxCard {...baseProps} onExitFocus={onExitFocus} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExitFocus).toHaveBeenCalled()
  })

  it('calls onSelectDetail on Enter', () => {
    const onSelectDetail = vi.fn()
    render(<FocusInboxCard {...baseProps} onSelectDetail={onSelectDetail} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSelectDetail).toHaveBeenCalledWith('a')
  })

  it('shows inbox-zero message when no tasks', () => {
    render(<FocusInboxCard {...baseProps} tasks={[]} />)
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/FocusInboxCard.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/schedule/FocusInboxCard.tsx
import { useState, useEffect, useCallback } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'

type FocusBucket = 'today' | 'week' | 'month' | 'quarter'

interface FocusInboxCardProps {
  tasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  onTriage: (taskId: string, bucket: FocusBucket) => void
  onDelete: (taskId: string) => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onSelectDetail: (taskId: string) => void
  onExitFocus: () => void
}

const WHEN_BUTTONS: Array<{ key: string; bucket: FocusBucket; label: string; sub: string }> = [
  { key: '1', bucket: 'today', label: 'Today', sub: 'Do it now' },
  { key: '2', bucket: 'week', label: 'This Week', sub: 'Soon' },
  { key: '3', bucket: 'month', label: 'This Month', sub: 'Eventually' },
  { key: '4', bucket: 'quarter', label: 'Someday', sub: 'No rush' },
]

export function FocusInboxCard({
  tasks, projects, familyMembers,
  onTriage, onDelete, onUpdate, onSelectDetail, onExitFocus,
}: FocusInboxCardProps) {
  const [index, setIndex] = useState(0)

  const total = tasks.length
  const current = tasks[index]

  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0)))
  }, [total])

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  const triage = useCallback((bucket: FocusBucket) => {
    if (!current) return
    onTriage(current.id, bucket)
    advance()
  }, [current, onTriage, advance])

  const del = useCallback(() => {
    if (!current) return
    onDelete(current.id)
    advance()
  }, [current, onDelete, advance])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      switch (e.key) {
        case '1': triage('today'); break
        case '2': triage('week'); break
        case '3': triage('month'); break
        case '4': triage('quarter'); break
        case 'd':
        case 'D':
        case 'Backspace': del(); break
        case 'ArrowRight':
        case ' ': e.preventDefault(); advance(); break
        case 'ArrowLeft': goBack(); break
        case 'Enter': if (current) onSelectDetail(current.id); break
        case 'Escape': onExitFocus(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [triage, del, advance, goBack, current, onSelectDetail, onExitFocus])

  if (total === 0 || !current) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
        <p className="text-neutral-500">Press Esc to return to list</p>
      </div>
    )
  }

  const project = projects.find((p) => p.id === current.projectId)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-xs uppercase tracking-wide text-neutral-400 mb-3">
        Card {index + 1} of {total}
      </div>

      <div className="card p-8">
        <h2 className="font-display text-2xl text-neutral-900 mb-5 leading-snug">
          {current.title}
        </h2>

        <div className="flex flex-wrap gap-2 mb-6">
          {current.context && (
            <span className="px-3 py-1 rounded-full bg-neutral-50 text-neutral-700 text-xs">
              {current.context}
            </span>
          )}
          {project && (
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
              📁 {project.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {WHEN_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => triage(btn.bucket)}
              className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl border-2 border-neutral-100 bg-white hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
            >
              <span className="text-xs text-neutral-400 bg-neutral-50 rounded px-2 py-0.5 mb-1">{btn.key}</span>
              <span className="font-medium text-sm text-neutral-800">{btn.label}</span>
              <span className="text-xs text-neutral-500">{btn.sub}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs text-neutral-400">
          <button type="button" onClick={goBack} className="hover:text-neutral-600">← back</button>
          <button type="button" onClick={advance} className="hover:text-neutral-600">skip →</button>
          <button type="button" onClick={del} className="hover:text-rose-500">delete · D</button>
          <button type="button" onClick={onExitFocus} className="hover:text-neutral-600">esc · list view</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/schedule/FocusInboxCard.test.tsx --run`
Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/FocusInboxCard.tsx src/components/schedule/FocusInboxCard.test.tsx
git commit -m "feat(inbox): add focus mode card with keyboard shortcuts"
```

---

## Task 7: Rewrite `InboxView` to use new components

Replace DnD + hover-only InboxTaskCard rows with DenseInboxRow rows + mode toggle + undo toast. Keep `HomeNeedsDetailsSection`, `AssigneeFilter`, domain filtering, and the bucket sections for already-deferred items.

**Files:**
- Modify: `src/components/schedule/InboxView.tsx`

- [ ] **Step 1: Read current InboxView**

Read `src/components/schedule/InboxView.tsx` in full first. Identify the parts to keep verbatim:
- Imports and filter logic for `filteredByDomain`, `selectedAssignees`, `filteredTasks`, `inboxTasks`, `weekTasks`, `monthTasks`, `quarterTasks`, `hasUnassignedTasks` — keep all of this.
- `HomeNeedsDetailsSection` rendering — keep.
- `AssigneeFilter` in header — keep.
- Empty-state markup — keep.

Replace:
- All `DndContext`, `DragOverlay`, `useDroppable`, `useDraggable`, `DraggableInboxCard`, `BucketDropZone`, `InboxDropSection`, `DROP_ZONES`, `handleDragStart/End/Cancel` — remove entirely.
- `renderTaskCard` helper — replace with renderRow that uses `DenseInboxRow`.
- The DnD grid for buckets — replace with collapsible sections that render bucketed items as `DenseInboxRow`.

- [ ] **Step 2: Write the new InboxView**

Replace the entire contents of `src/components/schedule/InboxView.tsx` with:

```tsx
// src/components/schedule/InboxView.tsx
import { useMemo, useCallback, useState } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useDomain } from '@/hooks/useDomain'
import { useInboxMode } from '@/hooks/useInboxMode'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { HomeNeedsDetailsSection } from '@/apps/home/inbox/HomeNeedsDetailsSection'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { FocusInboxCard } from './FocusInboxCard'
import { InboxModeToggle } from './InboxModeToggle'
import { InboxUndoToast } from './InboxUndoToast'

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'delete' }
]

const BUCKET_LABELS: Record<'week' | 'month' | 'quarter', string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'Someday',
}

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
}

interface InboxViewProps {
  tasks: Task[]
  projects: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  panelOpen: boolean
  onClosePanel: () => void
  currentUserMemberId?: string
}

export function InboxView({
  tasks, projects, selectedItemId: _selectedItemId, onSelectItem,
  panelOpen: _panelOpen, onClosePanel: _onClosePanel, currentUserMemberId,
}: InboxViewProps) {
  const {
    onToggleWaiting: _onToggleWaiting, onUpdateTask, onPushTask, onDeleteTask,
    onAssignTaskAll, familyMembers = [], onOpenProject, onToggleTask,
  } = useScheduleActionsContext()

  const { currentDomain } = useDomain()
  const [mode, setMode] = useInboxMode()

  // Domain + privacy filter
  const filteredByDomain = useMemo(() => {
    return tasks.filter((task) => {
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignee = task.assignedTo || task.assignedToAll?.[0]
        if (assignee && assignee !== currentUserMemberId) return false
      }
      if (currentDomain === 'universal') return true
      if (task.bucket === 'inbox' && !task.completed) return true
      return task.context === currentDomain
    })
  }, [tasks, currentDomain, currentUserMemberId])

  // Assignee filter
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const filteredTasks = useMemo(() => {
    if (selectedAssignees.length === 0) return filteredByDomain
    return filteredByDomain.filter((t) => {
      if (selectedAssignees.includes('unassigned')) {
        return !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0)
      }
      return selectedAssignees.some((id) => t.assignedTo === id || t.assignedToAll?.includes(id))
    })
  }, [filteredByDomain, selectedAssignees])

  const hasUnassignedTasks = useMemo(() => {
    return filteredByDomain.some(
      (t) => !t.completed && !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0),
    )
  }, [filteredByDomain])

  const sortByCreated = (a: Task, b: Task) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  const inboxTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'inbox').sort(sortByCreated),
    [filteredTasks],
  )
  const weekTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'week').sort(sortByCreated),
    [filteredTasks],
  )
  const monthTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'month').sort(sortByCreated),
    [filteredTasks],
  )
  const quarterTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'quarter').sort(sortByCreated),
    [filteredTasks],
  )

  const totalCount = inboxTasks.length + weekTasks.length + monthTasks.length + quarterTasks.length

  // Leaving animation tracking
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<UndoEntry | null>(null)

  const handleSelect = useCallback((taskId: string) => {
    onSelectItem(`task-${taskId}`)
  }, [onSelectItem])

  const applyTriage = useCallback((task: Task, action: QuickAction) => {
    const previous: Partial<Task> = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
    }

    setLeavingIds((s) => new Set(s).add(task.id))

    setTimeout(() => {
      let message = ''
      if (action.kind === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (onPushTask) onPushTask(task.id, today)
        message = 'Sent to Today'
      } else if (action.kind === 'week' || action.kind === 'month' || action.kind === 'someday') {
        const bucket = action.kind === 'someday' ? 'quarter' : action.kind
        if (onPushTask) onPushTask(task.id, bucket as 'week' | 'month' | 'quarter')
        message = `Sent to ${BUCKET_LABELS[bucket as 'week' | 'month' | 'quarter']}`
      } else if (action.kind === 'delete') {
        if (onDeleteTask) onDeleteTask(task.id)
        message = 'Deleted'
      }

      setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
      setUndo({ taskId: task.id, message, previous })
    }, 220)
  }, [onPushTask, onDeleteTask])

  const handleUndo = useCallback(() => {
    if (!undo || !onUpdateTask) { setUndo(null); return }
    onUpdateTask(undo.taskId, undo.previous)
    setUndo(null)
  }, [undo, onUpdateTask])

  const handleFocusTriage = useCallback((taskId: string, bucket: 'today' | 'week' | 'month' | 'quarter') => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    applyTriage(task, bucket === 'today' ? { kind: 'today' } : { kind: bucket === 'quarter' ? 'someday' : bucket })
  }, [filteredTasks, applyTriage])

  const handleFocusDelete = useCallback((taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    applyTriage(task, { kind: 'delete' })
  }, [filteredTasks, applyTriage])

  const renderRow = (task: Task) => {
    const project = projects.find((p) => p.id === task.projectId)
    return (
      <DenseInboxRow
        key={task.id}
        task={task}
        project={project}
        familyMembers={familyMembers}
        quickActions={INBOX_ACTIONS}
        isLeaving={leavingIds.has(task.id)}
        onQuickAction={(action) => applyTriage(task, action)}
        onToggleComplete={() => onToggleTask?.(task.id)}
        onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
        onSelect={() => handleSelect(task.id)}
        onOpenProject={onOpenProject}
        onAssign={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Inbox</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {totalCount === 0
              ? 'All clear — nothing to triage'
              : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalCount > 0 && <InboxModeToggle mode={mode} onChange={setMode} />}
          {familyMembers.length > 0 && (
            <AssigneeFilter
              selectedAssignees={selectedAssignees}
              onSelectAssignees={setSelectedAssignees}
              assigneesWithTasks={familyMembers}
              hasUnassignedTasks={hasUnassignedTasks}
            />
          )}
        </div>
      </header>

      <HomeNeedsDetailsSection />

      {totalCount === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
          <p className="text-neutral-500">Press <kbd className="px-2 py-1 bg-neutral-100 rounded-md text-xs font-mono">Cmd+K</kbd> to capture something</p>
        </div>
      ) : mode === 'focus' ? (
        <FocusInboxCard
          tasks={inboxTasks}
          projects={projects}
          familyMembers={familyMembers}
          onTriage={handleFocusTriage}
          onDelete={handleFocusDelete}
          onUpdate={(taskId, updates) => onUpdateTask?.(taskId, updates)}
          onSelectDetail={handleSelect}
          onExitFocus={() => setMode('dense')}
        />
      ) : (
        <div className="space-y-6">
          {inboxTasks.length > 0 && (
            <section>
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                New ({inboxTasks.length})
              </h2>
              <div className="space-y-2">
                {inboxTasks.map(renderRow)}
              </div>
            </section>
          )}
          {(['week', 'month', 'quarter'] as const).map((bucket) => {
            const list = bucket === 'week' ? weekTasks : bucket === 'month' ? monthTasks : quarterTasks
            if (list.length === 0) return null
            return (
              <BucketSection key={bucket} title={BUCKET_LABELS[bucket]} count={list.length}>
                {list.map(renderRow)}
              </BucketSection>
            )
          })}
        </div>
      )}

      {undo && (
        <InboxUndoToast
          message={undo.message}
          onUndo={handleUndo}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  )
}

interface BucketSectionProps {
  title: string
  count: number
  children: React.ReactNode
}

function BucketSection({ title, count, children }: BucketSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 mb-3 text-neutral-500 hover:text-neutral-700"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <h2 className="font-display text-sm tracking-wide uppercase">{title}</h2>
        <span className="text-xs text-neutral-400">({count})</span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </section>
  )
}
```

- [ ] **Step 3: Run typecheck and existing tests**

Run: `npm run build`
Expected: build succeeds. (DnD imports removed; new imports compile.)

Run: `npx vitest src/components/schedule --run`
Expected: existing `InboxTaskCard.test.tsx` still passes (unchanged). The drag-related tests that previously lived inside any InboxView test files will be addressed in step 4 if any exist.

- [ ] **Step 4: Check for and update any drag-and-drop integration tests**

Run: `grep -l "DragOverlay\|useDraggable\|useDroppable\|BucketDropZone" src/components --include="*.test.tsx" -r`

If any test files reference the removed DnD machinery in InboxView, update them — remove DnD-specific assertions and adapt to the new button-click triage model. Run the suite again.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/InboxView.tsx
git commit -m "feat(inbox): rewrite InboxView with dense rows + focus mode"
```

---

## Task 8: Rewrite `StagingFloat` — scope to week, use `DenseInboxRow`

**Files:**
- Modify: `src/components/schedule/StagingFloat.tsx`

- [ ] **Step 1: Read current StagingFloat**

Read `src/components/schedule/StagingFloat.tsx` in full to understand the existing trigger + popover structure. Keep: the inline-pill trigger, the click-outside dismiss, the portal-based positioning. Replace: the row rendering and the conflated inbox+week list.

- [ ] **Step 2: Write the failing test**

```typescript
// src/components/schedule/StagingFloat.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StagingFloat } from './StagingFloat'
import { createMockTask } from '@/test/mocks/factories'

vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({ results: [], loading: false, searchPlaces: vi.fn(), getPlaceDetails: vi.fn(), clearResults: vi.fn() }),
}))

describe('StagingFloat', () => {
  const baseProps = {
    weekTasks: [
      createMockTask({ id: 'w1', title: 'Week task A', bucket: 'week' }),
      createMockTask({ id: 'w2', title: 'Week task B', bucket: 'week' }),
    ],
    projects: [],
    familyMembers: [],
    onPullToToday: vi.fn(),
    onSelectTask: vi.fn(),
    onCompleteTask: vi.fn(),
    onDeferTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onUpdateTask: vi.fn(),
    inline: true,
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders the trigger pill with the week count', () => {
    render(<StagingFloat {...baseProps} />)
    expect(screen.getByRole('button', { name: /this week/i })).toHaveTextContent('2')
  })

  it('opens the popover and shows only week tasks', () => {
    render(<StagingFloat {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    expect(screen.getByText('Week task A')).toBeInTheDocument()
    expect(screen.getByText('Week task B')).toBeInTheDocument()
  })

  it('calls onPullToToday when Today clicked', () => {
    const onPullToToday = vi.fn()
    render(<StagingFloat {...baseProps} onPullToToday={onPullToToday} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    const todayButtons = screen.getAllByRole('button', { name: /^today$/i })
    fireEvent.click(todayButtons[0])
    expect(onPullToToday).toHaveBeenCalledWith('w1')
  })

  it('calls onUpdateTask with weekDeferredAt when Next Week clicked', () => {
    const onUpdateTask = vi.fn()
    render(<StagingFloat {...baseProps} onUpdateTask={onUpdateTask} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /next week/i })[0])
    expect(onUpdateTask).toHaveBeenCalledWith('w1', expect.objectContaining({ weekDeferredAt: expect.any(Date) }))
  })

  it('calls onDeferTask with quarter when Someday clicked', () => {
    const onDeferTask = vi.fn()
    render(<StagingFloat {...baseProps} onDeferTask={onDeferTask} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /someday/i })[0])
    expect(onDeferTask).toHaveBeenCalledWith('w1', 'quarter')
  })

  it('renders empty state when no week tasks', () => {
    render(<StagingFloat {...baseProps} weekTasks={[]} />)
    // Trigger isn't rendered when count is 0
    expect(screen.queryByRole('button', { name: /this week/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest src/components/schedule/StagingFloat.test.tsx --run`
Expected: FAIL (props/shape mismatch).

- [ ] **Step 4: Rewrite StagingFloat**

Replace `src/components/schedule/StagingFloat.tsx` contents:

```tsx
// src/components/schedule/StagingFloat.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { InboxUndoToast } from './InboxUndoToast'

interface StagingFloatProps {
  weekTasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  onPullToToday: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  onCompleteTask?: (taskId: string) => void
  onDeferTask?: (taskId: string, target: 'month' | 'quarter') => void
  onDeleteTask?: (taskId: string) => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  inline?: boolean
}

const WEEK_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'next-week' }, { kind: 'someday' }, { kind: 'delete' }
]

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
}

export function StagingFloat({
  weekTasks, projects, familyMembers,
  onPullToToday, onSelectTask, onCompleteTask, onDeferTask, onDeleteTask, onUpdateTask,
  inline,
}: StagingFloatProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<UndoEntry | null>(null)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Position the popover near the trigger
  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: Math.max(rect.left - 80, 12) })
  }, [open])

  // Dismiss on click outside / Escape
  useEffect(() => {
    if (!open) return
    function onMouse(e: MouseEvent) {
      const t = e.target as Node
      if (!buttonRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Sort: undeferred first, then weekDeferredAt ascending
  const sorted = [...weekTasks].sort((a, b) => {
    if (!a.weekDeferredAt && !b.weekDeferredAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (!a.weekDeferredAt) return -1
    if (!b.weekDeferredAt) return 1
    return new Date(a.weekDeferredAt).getTime() - new Date(b.weekDeferredAt).getTime()
  })

  const applyAction = useCallback((task: Task, action: QuickAction) => {
    const previous: Partial<Task> = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
      weekDeferredAt: task.weekDeferredAt,
    }
    setLeavingIds((s) => new Set(s).add(task.id))

    setTimeout(() => {
      let message = ''
      if (action.kind === 'today') {
        onPullToToday(task.id)
        message = 'Pulled to Today'
      } else if (action.kind === 'next-week') {
        onUpdateTask?.(task.id, { weekDeferredAt: new Date() })
        message = 'Bumped to next week'
      } else if (action.kind === 'someday') {
        onDeferTask?.(task.id, 'quarter')
        message = 'Sent to Someday'
      } else if (action.kind === 'delete') {
        onDeleteTask?.(task.id)
        message = 'Deleted'
      }
      setLeavingIds((s) => { const n = new Set(s); n.delete(task.id); return n })
      setUndo({ taskId: task.id, message, previous })
    }, 220)
  }, [onPullToToday, onDeferTask, onDeleteTask, onUpdateTask])

  const handleUndo = useCallback(() => {
    if (!undo || !onUpdateTask) { setUndo(null); return }
    onUpdateTask(undo.taskId, undo.previous)
    setUndo(null)
  }, [undo, onUpdateTask])

  // Hide trigger when there's nothing
  if (weekTasks.length === 0) return null

  const triggerClass = inline
    ? 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-neutral-500 hover:bg-neutral-100 transition-colors'
    : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neutral-600 bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-label="This week"
      >
        <CalendarRange className="w-3.5 h-3.5" />
        <span>This week</span>
        <span className="font-semibold tabular-nums">{weekTasks.length}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 'min(440px, calc(100vw - 24px))' }}
          className="z-50 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 max-h-[70vh] overflow-y-auto"
          role="dialog"
          aria-label="This Week"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-display text-sm font-medium text-neutral-700">
              This Week · {sorted.length} item{sorted.length !== 1 ? 's' : ''}
            </h3>
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-6">Nothing scheduled this week.</p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                return (
                  <DenseInboxRow
                    key={task.id}
                    task={task}
                    project={project}
                    familyMembers={familyMembers}
                    quickActions={WEEK_ACTIONS}
                    isLeaving={leavingIds.has(task.id)}
                    onQuickAction={(action) => applyAction(task, action)}
                    onToggleComplete={() => onCompleteTask?.(task.id)}
                    onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                    onSelect={() => { onSelectTask(task.id); setOpen(false) }}
                  />
                )
              })}
            </div>
          )}
        </div>,
        document.body,
      )}

      {undo && (
        <InboxUndoToast
          message={undo.message}
          onUndo={handleUndo}
          onDismiss={() => setUndo(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest src/components/schedule/StagingFloat.test.tsx --run`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/StagingFloat.tsx src/components/schedule/StagingFloat.test.tsx
git commit -m "feat(inbox): rewrite StagingFloat to scope to week-bucket only"
```

---

## Task 9: Update `TodaySchedule` — split combined pill into Inbox + This Week

The current header renders one `<StagingFloat>` that gets both inboxTasks and weekTasks. Split into: an Inbox pill (link to inbox view) + the new week-only StagingFloat.

**Files:**
- Modify: `src/components/schedule/TodaySchedule.tsx`

- [ ] **Step 1: Locate the two StagingFloat call sites**

Run: `grep -n "<StagingFloat" src/components/schedule/TodaySchedule.tsx`
Expected: two matches (lines ~1052 and ~1126 — one for mobile header, one for desktop stats row).

- [ ] **Step 2: Add an InboxPill component inline in this file (or top-of-file helper)**

Near the top of `TodaySchedule.tsx` (after imports), add this small helper component:

```tsx
function InboxPill({ count, onClick, inline }: { count: number; onClick: () => void; inline?: boolean }) {
  if (count === 0) return null
  const cls = inline
    ? 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-neutral-500 hover:bg-neutral-100 transition-colors'
    : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neutral-600 bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors'
  return (
    <button type="button" onClick={onClick} className={cls} aria-label="Inbox">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" /></svg>
      <span>Inbox</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  )
}
```

- [ ] **Step 3: Find the inbox navigation callback**

The component receives an `onSelectItem` prop (or similar) that opens the inbox view. Search for how the codebase navigates to inbox:

Run: `grep -n "onSelectItem\|navigateToInbox\|'inbox'" src/components/schedule/TodaySchedule.tsx | head -20`

If `TodaySchedule` already has a prop or context method that routes to the inbox view, use that. Otherwise add a new prop `onOpenInbox?: () => void` to `TodayScheduleProps` and have the parent (`ShellRoutes.tsx` / `App.tsx`) pass it.

- [ ] **Step 4: Replace the two StagingFloat call sites**

Mobile header (around line ~1051). Replace:

```tsx
{/* This week / inbox — compact in header */}
{isToday && onUpdateTask && (inboxTasks.length + weekTasks.length) > 0 && (
  <StagingFloat
    inboxTasks={inboxTasks}
    weekTasks={weekTasks}
    onPullToToday={(taskId) => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      onUpdateTask(taskId, { bucket: 'timed' as const, scheduledFor: today, isAllDay: true })
    }}
    onSelectTask={(taskId) => handleSelectItem(`task-${taskId}`)}
    onCompleteTask={onToggleTask}
    onDeferTask={onPushTask ? (taskId, target) => onPushTask(taskId, target) : undefined}
    onDeleteTask={onDeleteTask}
    inline
  />
)}
```

With:

```tsx
{/* Inbox + This week — compact in header */}
{isToday && onUpdateTask && (
  <>
    <InboxPill count={inboxTasks.length} onClick={onOpenInbox ?? (() => {})} inline />
    <StagingFloat
      weekTasks={weekTasks}
      projects={projects}
      familyMembers={familyMembers ?? []}
      onPullToToday={(taskId) => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        onUpdateTask(taskId, { bucket: 'timed' as const, scheduledFor: today, isAllDay: true })
      }}
      onSelectTask={(taskId) => handleSelectItem(`task-${taskId}`)}
      onCompleteTask={onToggleTask}
      onDeferTask={onPushTask ? (taskId, target) => onPushTask(taskId, target) : undefined}
      onDeleteTask={onDeleteTask}
      onUpdateTask={onUpdateTask}
      inline
    />
  </>
)}
```

Desktop stats row (around line ~1125): make the same replacement (without the `inline` flag on the Inbox pill, or keep `inline` — match how the existing site looked).

- [ ] **Step 5: Add `onOpenInbox` to TodayScheduleProps**

Find the `TodayScheduleProps` interface in the file (search `interface TodayScheduleProps` or similar). Add:

```tsx
onOpenInbox?: () => void
```

And destructure it in the component signature alongside the other props.

- [ ] **Step 6: Wire `onOpenInbox` from the parent**

Find where `TodaySchedule` is rendered (likely `src/shell/ShellRoutes.tsx` or `src/App.tsx`):

Run: `grep -rn "<TodaySchedule" src --include="*.tsx"`

Pass `onOpenInbox={() => onSelectItem('view-inbox')}` (or whatever the existing route-to-inbox mechanism is — check how the sidebar's Inbox button navigates).

- [ ] **Step 7: Run typecheck and tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npx vitest src/components/schedule --run`
Expected: existing schedule tests pass; any tests that pass `inboxTasks` to `StagingFloat` are now failing — update them to pass `weekTasks` only and add the new required props, or remove if they're now covered by the new `StagingFloat.test.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/TodaySchedule.tsx src/shell/ShellRoutes.tsx src/App.tsx
git commit -m "feat(today): split combined pill into Inbox + This Week"
```

(Only stage files you actually modified.)

---

## Task 10: Manual verification

The unit tests don't cover end-to-end UX. Validate in a real browser.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts at `localhost:5173`.

- [ ] **Step 2: Verify Inbox view — dense mode (default)**

In the browser:
1. Navigate to Inbox.
2. Confirm: rows are one-line on desktop, show context dot · title · project chip · assignee avatar · 5 buttons (Today/Week/Month/Someday/×).
3. Click "Today" on a row → row fades out (~200ms), inbox count decrements, undo toast appears bottom-left.
4. Click "Undo" → row returns; count goes back up.
5. Click "Week", "Month", "Someday" on different rows → toast text matches the destination.
6. Click "×" → row removed, "Deleted" toast.
7. Click the title → detail panel opens (existing behavior).
8. Click the project chip × → project clears.
9. Click the context dot → popover with Work/Family/Personal/Clear; pick one → row updates.

- [ ] **Step 3: Verify mode toggle + focus mode**

1. Click the Focus toggle in the header.
2. One large card renders with progress "Card 1 of N", title, optional chips, four big buttons (1/2/3/4 → Today/Week/Month/Someday).
3. Press `1` → advances to next card; first item moved to today.
4. Press `2`, `3`, `4` on successive cards → each goes to right bucket.
5. Press `→` then `←` → skip forward, then back.
6. Press `Enter` → detail panel opens for current card.
7. Press `D` or `Backspace` → delete + advance.
8. Press `Esc` → returns to dense list.
9. Reload page → mode preference persists.

- [ ] **Step 4: Verify Today page — Inbox + This Week pills**

1. Go to Today view (date = today).
2. Confirm TWO pills in the header: "Inbox N" + "This week N" (each only visible when count > 0).
3. Click "Inbox" pill → navigates to Inbox view.
4. Click "This week" pill → popover opens. Contents are ONLY week-bucket items (no inbox items).
5. Each row has buttons: Today · Next Week · Someday · ×.
6. Click "Today" on a row → row fades, popover updates, item appears in today's schedule.
7. Click "Next Week" → row sinks to bottom of popover (or stays in week with new `weekDeferredAt`).
8. Click "Someday" → row removed from popover.
9. Click "×" → row removed.
10. Click outside the popover → it closes.

- [ ] **Step 5: Verify domain switching + assignee filter still work**

1. Switch domain (e.g., work → family) via sidebar.
2. Inbox list filters as before.
3. Use the assignee filter pill in the header.
4. Filtering still applies to all bucket sections.

- [ ] **Step 6: Run the full test suite once more**

Run: `npm test -- --run`
Expected: all tests pass.

Run: `npm run lint`
Expected: no errors. Warnings on unused vars are allowed if pre-existing in this codebase; new code should be clean.

- [ ] **Step 7: Commit any final fixes**

If any browser-only issues turned up (CSS edge cases, prop mismatch, etc.), fix and commit.

```bash
git status
# stage and commit only the relevant fix files
```

---

## Done criteria

- [ ] All ten tasks complete.
- [ ] All new unit tests pass; `npm test -- --run` is green.
- [ ] `npm run build` succeeds.
- [ ] Manual browser verification (Task 10) checked off for every step.
- [ ] No drag-and-drop code remains in `InboxView.tsx`.
- [ ] `InboxTaskCard.tsx` is unchanged.
- [ ] Two pills (Inbox + This Week) replace the single combined pill on the Today page.
- [ ] The This Week popover contains only `bucket: 'week'` items.
