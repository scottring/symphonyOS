# TapContextPanel for Tasks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new single-scroll, no-tabs `<TapContextPanel />` for **tasks only**, behind a feature flag, with Phase 1 heuristic "Might be relevant." Validates the IA on real data before generalizing to other entity types.

**Architecture:** New `src/components/surface/` directory with the panel orchestrator and one component per canonical section. Each section is independent and entity-agnostic where possible (so Plan 2 can reuse them for contacts/projects/events). A simple constant flag (`SURFACE_PANEL_ENABLED`) toggles between the existing `DetailPanelRedesign` and the new `TapContextPanel` in the task render path.

**Tech Stack:** React 19 + TypeScript strict, Vitest + RTL for unit tests, existing `@/test/test-utils` and `@/test/mocks/factories`. No new dependencies.

**Related:**
- Design spec: `docs/superpowers/specs/2026-05-08-surface-design.md`
- Supersedes: `src/components/detail/DetailPanelRedesign.tsx` (3375 lines), retired in Plan 4

---

## File Structure

**New files:**
```
src/components/surface/
├── index.ts                                  # public barrel
├── flag.ts                                   # SURFACE_PANEL_ENABLED constant
├── types.ts                                  # shared section-prop types
├── TapContextPanel.tsx                       # orchestrator
├── TapContextPanel.test.tsx
├── sections/
│   ├── PanelHeader.tsx                       # title + close + edit-in-place
│   ├── PanelHeader.test.tsx
│   ├── PanelMetaRow.tsx                      # bucket / for-whom / created-by
│   ├── PanelMetaRow.test.tsx
│   ├── PanelActions.tsx                      # verb-first action buttons
│   ├── PanelActions.test.tsx
│   ├── PanelWhy.tsx                          # notes / why
│   ├── PanelWhy.test.tsx
│   ├── PanelPeople.tsx                       # contact + assignee
│   ├── PanelPeople.test.tsx
│   ├── PanelLinked.tsx                       # project / event / sibling tasks
│   ├── PanelLinked.test.tsx
│   ├── PanelMightBeRelevant.tsx              # heuristic suggestions
│   ├── PanelMightBeRelevant.test.tsx
│   ├── PanelFooter.tsx                       # creation/update meta
│   └── PanelFooter.test.tsx
└── hooks/
    ├── useLinkedEntities.ts                  # gather contact, project, event for a task
    ├── useLinkedEntities.test.ts
    ├── useMightBeRelevant.ts                 # phase 1 heuristic
    └── useMightBeRelevant.test.ts
```

**Modified files:**
- `src/components/detail/DetailPanelRedesign.tsx` (or its caller, depending on render path) — gated by feature flag
- A test mock for `Task` with rich linkage will be added inline

---

## Task 1: Scaffold the surface module

**Files:**
- Create: `src/components/surface/index.ts`
- Create: `src/components/surface/flag.ts`
- Create: `src/components/surface/types.ts`

- [ ] **Step 1: Create `flag.ts` with the feature flag**

```ts
// src/components/surface/flag.ts
/**
 * Toggle the new TapContextPanel for tasks. While false, the existing
 * DetailPanelRedesign is rendered. Flip to true once the panel covers all
 * task render paths and we're ready to validate on real data.
 */
export const SURFACE_PANEL_ENABLED = false
```

- [ ] **Step 2: Create `types.ts` with shared section-prop types**

```ts
// src/components/surface/types.ts
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/types/calendar'
import type { FamilyMember } from '@/types/family'

export interface PanelEntity {
  /** The primary entity the panel is rendering. Plan 1: tasks only. */
  task: Task
}

export interface LinkedEntities {
  contact?: Contact
  project?: Project
  linkedEvent?: CalendarEvent
  assignee?: FamilyMember
  siblingTasks: Task[]
}

export interface MightBeRelevantItem {
  id: string
  kind: 'task' | 'contact' | 'note' | 'link'
  title: string
  /** Human-readable reason for surfacing — e.g. "same contact · 8 weeks ago" */
  reason: string
}
```

- [ ] **Step 3: Create `index.ts` barrel**

```ts
// src/components/surface/index.ts
export { TapContextPanel } from './TapContextPanel'
export { SURFACE_PANEL_ENABLED } from './flag'
```

- [ ] **Step 4: Commit**

```bash
git add src/components/surface/
git commit -m "feat(surface): scaffold module with feature flag and shared types"
```

---

## Task 2: useLinkedEntities hook

Gathers the contact, project, linked event, assignee, and sibling tasks for a given task. Pure derivation from existing hooks/contexts.

**Files:**
- Create: `src/components/surface/hooks/useLinkedEntities.ts`
- Test: `src/components/surface/hooks/useLinkedEntities.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/surface/hooks/useLinkedEntities.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLinkedEntities } from './useLinkedEntities'
import { createMockTask, createMockContact, createMockProject, createMockFamilyMember } from '@/test/mocks/factories'

describe('useLinkedEntities', () => {
  it('returns contact when task.contactId matches', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const task = createMockTask({ contactId: 'c1' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [contact],
      projects: [],
      events: [],
      familyMembers: [],
      siblingTaskCandidates: [],
    }))
    expect(result.current.contact?.name).toBe('Dr. Smith')
  })

  it('returns sibling tasks sharing the same projectId', () => {
    const task = createMockTask({ id: 't1', projectId: 'p1' })
    const sibling = createMockTask({ id: 't2', projectId: 'p1', title: 'Other' })
    const unrelated = createMockTask({ id: 't3', projectId: 'p2' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [],
      projects: [],
      events: [],
      familyMembers: [],
      siblingTaskCandidates: [task, sibling, unrelated],
    }))
    expect(result.current.siblingTasks).toEqual([sibling])
  })

  it('returns empty siblings when task has no project', () => {
    const task = createMockTask({ id: 't1' })
    const other = createMockTask({ id: 't2' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [], projects: [], events: [], familyMembers: [],
      siblingTaskCandidates: [task, other],
    }))
    expect(result.current.siblingTasks).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest src/components/surface/hooks/useLinkedEntities.test.ts --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/components/surface/hooks/useLinkedEntities.ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/types/calendar'
import type { FamilyMember } from '@/types/family'
import type { LinkedEntities } from '../types'

export interface LinkedEntitiesData {
  contacts: Contact[]
  projects: Project[]
  events: CalendarEvent[]
  familyMembers: FamilyMember[]
  /** Pool of tasks to filter siblings from — pass in already-loaded tasks. */
  siblingTaskCandidates: Task[]
}

export function useLinkedEntities(task: Task, data: LinkedEntitiesData): LinkedEntities {
  return useMemo(() => {
    const contact = task.contactId ? data.contacts.find(c => c.id === task.contactId) : undefined
    const project = task.projectId ? data.projects.find(p => p.id === task.projectId) : undefined
    const linkedEvent = task.linkedEventId
      ? data.events.find(e => (e.id === task.linkedEventId) || (e.google_event_id === task.linkedEventId))
      : undefined
    const assignee = task.assignedTo ? data.familyMembers.find(m => m.id === task.assignedTo) : undefined

    const siblingTasks = task.projectId
      ? data.siblingTaskCandidates.filter(t => t.projectId === task.projectId && t.id !== task.id && !t.completed)
      : []

    return { contact, project, linkedEvent, assignee, siblingTasks }
  }, [task, data])
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest src/components/surface/hooks/useLinkedEntities.test.ts --run`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/hooks/useLinkedEntities.ts src/components/surface/hooks/useLinkedEntities.test.ts
git commit -m "feat(surface): useLinkedEntities hook"
```

---

## Task 3: useMightBeRelevant hook (Phase 1 heuristic)

Phase 1 heuristic from the spec: same-contact, same-person, keyword match in saved notes. Each result has a visible reason. No LLM.

**Files:**
- Create: `src/components/surface/hooks/useMightBeRelevant.ts`
- Test: `src/components/surface/hooks/useMightBeRelevant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/surface/hooks/useMightBeRelevant.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMightBeRelevant } from './useMightBeRelevant'
import { createMockTask } from '@/test/mocks/factories'

describe('useMightBeRelevant', () => {
  it('surfaces another task with the same contact', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const sameContact = createMockTask({
      id: 't2', contactId: 'c1', title: 'Last call to Dr. Smith',
      completed: true,
      updatedAt: new Date('2026-03-14'),
    })
    const unrelated = createMockTask({ id: 't3', contactId: 'c9' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, sameContact, unrelated],
      now: new Date('2026-05-08'),
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).not.toContain('t3')
    const item = result.current.find(r => r.id === 't2')
    expect(item?.reason).toMatch(/same contact/i)
  })

  it('surfaces another task with the same assignee/for-person', () => {
    const target = createMockTask({ id: 't1', assignedTo: 'm1' })
    const samePerson = createMockTask({ id: 't2', assignedTo: 'm1', title: 'Other Liam task' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, samePerson],
      now: new Date('2026-05-08'),
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
  })

  it('surfaces another task with overlapping keywords in title or notes', () => {
    const target = createMockTask({ id: 't1', title: 'Call about ear infection' })
    const keywordMatch = createMockTask({
      id: 't2', title: 'Research ear infection symptoms', notes: 'pediatric ear care',
    })
    const noOverlap = createMockTask({ id: 't3', title: 'Buy groceries' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, keywordMatch, noOverlap],
      now: new Date('2026-05-08'),
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).not.toContain('t3')
  })

  it('caps results at 3 items', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1' })
    const candidates = Array.from({ length: 6 }, (_, i) =>
      createMockTask({ id: `c-${i}`, contactId: 'c1', title: `t${i}` })
    )
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, ...candidates],
      now: new Date('2026-05-08'),
    }))
    expect(result.current.length).toBeLessThanOrEqual(3)
  })

  it('returns empty when nothing matches', () => {
    const target = createMockTask({ id: 't1', title: 'lonely' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target],
      now: new Date('2026-05-08'),
    }))
    expect(result.current).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/hooks/useMightBeRelevant.test.ts --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/components/surface/hooks/useMightBeRelevant.ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { MightBeRelevantItem } from '../types'

export interface MightBeRelevantData {
  allTasks: Task[]
  now: Date
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'about', 'call', 'email', 'text', 'send', 'get', 'go', 'do', 'is', 'are',
])

function tokenize(s: string | undefined): Set<string> {
  if (!s) return new Set()
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  )
}

function intersect<T>(a: Set<T>, b: Set<T>): T[] {
  const out: T[] = []
  for (const v of a) if (b.has(v)) out.push(v)
  return out
}

export function useMightBeRelevant(target: Task, data: MightBeRelevantData): MightBeRelevantItem[] {
  return useMemo(() => {
    const out: MightBeRelevantItem[] = []
    const seen = new Set<string>([target.id])

    const targetTokens = new Set([...tokenize(target.title), ...tokenize(target.notes)])

    // 1) same contact
    if (target.contactId) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.contactId === target.contactId) {
          out.push({ id: t.id, kind: 'task', title: t.title, reason: 'same contact' })
          seen.add(t.id)
        }
      }
    }

    // 2) same assignee / for-person
    if (target.assignedTo) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.assignedTo === target.assignedTo) {
          out.push({ id: t.id, kind: 'task', title: t.title, reason: 'same person' })
          seen.add(t.id)
        }
      }
    }

    // 3) keyword overlap in title or notes
    if (targetTokens.size > 0) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        const candidateTokens = new Set([...tokenize(t.title), ...tokenize(t.notes)])
        const overlap = intersect(targetTokens, candidateTokens)
        if (overlap.length > 0) {
          out.push({
            id: t.id, kind: 'task', title: t.title,
            reason: `matches "${overlap[0]}"`,
          })
          seen.add(t.id)
        }
      }
    }

    return out.slice(0, 3)
  }, [target, data])
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/hooks/useMightBeRelevant.test.ts --run`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/hooks/useMightBeRelevant.ts src/components/surface/hooks/useMightBeRelevant.test.ts
git commit -m "feat(surface): Phase 1 heuristic for might-be-relevant"
```

---

## Task 4: PanelHeader section

Title with inline edit on click, close button.

**Files:**
- Create: `src/components/surface/sections/PanelHeader.tsx`
- Test: `src/components/surface/sections/PanelHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelHeader.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelHeader } from './PanelHeader'

describe('PanelHeader', () => {
  it('renders title', () => {
    render(<PanelHeader title="Call Dr. Smith" onTitleChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Call Dr. Smith')).toBeInTheDocument()
  })

  it('switches to input on click and saves on blur', async () => {
    const onTitleChange = vi.fn()
    const { user } = render(<PanelHeader title="Old title" onTitleChange={onTitleChange} onClose={vi.fn()} />)
    await user.click(screen.getByText('Old title'))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'New title')
    input.blur()
    expect(onTitleChange).toHaveBeenCalledWith('New title')
  })

  it('does not call onTitleChange when value unchanged', async () => {
    const onTitleChange = vi.fn()
    const { user } = render(<PanelHeader title="Same" onTitleChange={onTitleChange} onClose={vi.fn()} />)
    await user.click(screen.getByText('Same'))
    screen.getByRole('textbox').blur()
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const { user } = render(<PanelHeader title="x" onTitleChange={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelHeader.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelHeader.tsx
import { useState } from 'react'

interface PanelHeaderProps {
  title: string
  onTitleChange: (next: string) => void
  onClose: () => void
}

export function PanelHeader({ title, onTitleChange, onClose }: PanelHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft !== title) onTitleChange(draft.trim())
  }

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="flex-1 text-lg font-display font-semibold bg-transparent border-b border-neutral-300 focus:outline-none focus:border-primary-500"
        />
      ) : (
        <button
          onClick={() => { setDraft(title); setEditing(true) }}
          className="flex-1 text-left text-lg font-display font-semibold text-neutral-900 hover:text-primary-700"
        >
          {title}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-neutral-400 hover:text-neutral-700 text-xl leading-none mt-1"
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelHeader.test.tsx --run`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelHeader.tsx src/components/surface/sections/PanelHeader.test.tsx
git commit -m "feat(surface): PanelHeader with inline title edit"
```

---

## Task 5: PanelMetaRow section

Single row of metadata: bucket, for-whom, created-by. Domain chip is a placeholder element here (the `domain` prop is rendered as a chip but the L2 viewer-aware logic comes in Plan 2).

**Files:**
- Create: `src/components/surface/sections/PanelMetaRow.tsx`
- Test: `src/components/surface/sections/PanelMetaRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelMetaRow.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMetaRow } from './PanelMetaRow'

describe('PanelMetaRow', () => {
  it('renders bucket label', () => {
    render(<PanelMetaRow bucket="inbox" />)
    expect(screen.getByText(/inbox/i)).toBeInTheDocument()
  })

  it('renders for-whom when assigneeName provided', () => {
    render(<PanelMetaRow bucket="inbox" assigneeName="Liam" />)
    expect(screen.getByText(/for liam/i)).toBeInTheDocument()
  })

  it('renders creator when createdByName provided', () => {
    render(<PanelMetaRow bucket="inbox" createdByName="Iris" />)
    expect(screen.getByText(/created by iris/i)).toBeInTheDocument()
  })

  it('renders domain chip when domain provided', () => {
    render(<PanelMetaRow bucket="inbox" domain="family" />)
    expect(screen.getByText(/family/i)).toBeInTheDocument()
  })

  it('does not render domain chip when domain is undefined', () => {
    render(<PanelMetaRow bucket="inbox" />)
    expect(screen.queryByTestId('domain-chip')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelMetaRow.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelMetaRow.tsx
import type { TaskBucket } from '@/types/task'

interface PanelMetaRowProps {
  bucket: TaskBucket | string
  assigneeName?: string
  createdByName?: string
  domain?: 'work' | 'family' | 'personal'
}

const DOMAIN_STYLES: Record<NonNullable<PanelMetaRowProps['domain']>, string> = {
  family: 'bg-emerald-50 text-emerald-700',
  work: 'bg-blue-50 text-blue-700',
  personal: 'bg-amber-50 text-amber-800',
}

export function PanelMetaRow({ bucket, assigneeName, createdByName, domain }: PanelMetaRowProps) {
  const parts: string[] = [bucket]
  if (assigneeName) parts.push(`for ${assigneeName}`)
  if (createdByName) parts.push(`created by ${createdByName}`)

  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
      {domain && (
        <span
          data-testid="domain-chip"
          className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider text-[10px] ${DOMAIN_STYLES[domain]}`}
        >
          {domain}
        </span>
      )}
      <span>{parts.join(' · ')}</span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelMetaRow.test.tsx --run`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelMetaRow.tsx src/components/surface/sections/PanelMetaRow.test.tsx
git commit -m "feat(surface): PanelMetaRow with bucket/assignee/creator/domain"
```

---

## Task 6: PanelActions section

Verb-first action buttons. Plan 1 supports: Done, Call (when phone present), Schedule, More.

**Files:**
- Create: `src/components/surface/sections/PanelActions.tsx`
- Test: `src/components/surface/sections/PanelActions.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelActions.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelActions } from './PanelActions'

describe('PanelActions', () => {
  const baseProps = {
    completed: false,
    onToggleComplete: vi.fn(),
    onSchedule: vi.fn(),
    onMore: vi.fn(),
  }

  it('renders Done button when not completed', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('renders Mark incomplete when completed', () => {
    render(<PanelActions {...baseProps} completed />)
    expect(screen.getByRole('button', { name: /incomplete|reopen/i })).toBeInTheDocument()
  })

  it('renders Call button when phoneNumber present', () => {
    render(<PanelActions {...baseProps} phoneNumber="555-0107" />)
    const call = screen.getByRole('link', { name: /555-0107/ })
    expect(call).toHaveAttribute('href', 'tel:555-0107')
  })

  it('does not render Call when phoneNumber missing', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.queryByText(/call/i)).not.toBeInTheDocument()
  })

  it('calls onToggleComplete when Done clicked', async () => {
    const onToggleComplete = vi.fn()
    const { user } = render(<PanelActions {...baseProps} onToggleComplete={onToggleComplete} />)
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onToggleComplete).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelActions.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelActions.tsx
interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  onToggleComplete: () => void
  onSchedule: () => void
  onMore: () => void
}

export function PanelActions({ completed, phoneNumber, onToggleComplete, onSchedule, onMore }: PanelActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
      <button
        onClick={onToggleComplete}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        {completed ? '↺ Reopen' : '✓ Done'}
      </button>
      {phoneNumber && (
        <a
          href={`tel:${phoneNumber}`}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          📞 {phoneNumber}
        </a>
      )}
      <button
        onClick={onSchedule}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        📅 Schedule
      </button>
      <button
        onClick={onMore}
        aria-label="More actions"
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        ···
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelActions.test.tsx --run`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelActions.tsx src/components/surface/sections/PanelActions.test.tsx
git commit -m "feat(surface): PanelActions with verb-first action buttons"
```

---

## Task 7: PanelWhy section

Notes section with inline edit. Renders nothing when notes are empty (per spec: "empty sections do not render").

**Files:**
- Create: `src/components/surface/sections/PanelWhy.tsx`
- Test: `src/components/surface/sections/PanelWhy.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelWhy.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhy } from './PanelWhy'

describe('PanelWhy', () => {
  it('renders notes when present', () => {
    render(<PanelWhy notes="ear pulling 3 days" onChange={vi.fn()} />)
    expect(screen.getByText(/ear pulling 3 days/)).toBeInTheDocument()
  })

  it('renders nothing when notes are empty and onChange not given', () => {
    const { container } = render(<PanelWhy notes="" onChange={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows editable input when clicked', async () => {
    const { user } = render(<PanelWhy notes="hello" onChange={vi.fn()} />)
    await user.click(screen.getByText('hello'))
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onChange with new value on blur', async () => {
    const onChange = vi.fn()
    const { user } = render(<PanelWhy notes="hello" onChange={onChange} />)
    await user.click(screen.getByText('hello'))
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.clear(ta)
    await user.type(ta, 'updated')
    ta.blur()
    expect(onChange).toHaveBeenCalledWith('updated')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelWhy.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelWhy.tsx
import { useState } from 'react'

interface PanelWhyProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default "Why" label. Used by Plan 2 for events ("What to bring"). */
  label?: string
}

export function PanelWhy({ notes, onChange, label = 'Why' }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')

  if (!notes && !onChange) return null

  function commit() {
    setEditing(false)
    if (onChange && draft !== (notes ?? '')) onChange(draft)
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">{label}</div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className="w-full text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-md p-2 focus:outline-none focus:border-primary-400"
          rows={3}
        />
      ) : (
        <button
          onClick={() => { setDraft(notes ?? ''); setEditing(true) }}
          className="w-full text-left text-sm italic text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1 hover:text-neutral-900"
        >
          {notes || <span className="not-italic text-neutral-400">Add notes…</span>}
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelWhy.test.tsx --run`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelWhy.tsx src/components/surface/sections/PanelWhy.test.tsx
git commit -m "feat(surface): PanelWhy with inline notes edit"
```

---

## Task 8: PanelPeople section

Renders contact card + assignee. Renders nothing when both are absent.

**Files:**
- Create: `src/components/surface/sections/PanelPeople.tsx`
- Test: `src/components/surface/sections/PanelPeople.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelPeople.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelPeople } from './PanelPeople'
import { createMockContact, createMockFamilyMember } from '@/test/mocks/factories'

describe('PanelPeople', () => {
  it('renders nothing when no people present', () => {
    const { container } = render(<PanelPeople onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders contact name and phone', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<PanelPeople contact={contact} onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/555-0107/)).toBeInTheDocument()
  })

  it('renders assignee name', () => {
    const m = createMockFamilyMember({ id: 'm1', display_name: 'Liam' })
    render(<PanelPeople assignee={m} onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(screen.getByText('Liam')).toBeInTheDocument()
  })

  it('calls onOpenContact when contact is clicked', async () => {
    const onOpenContact = vi.fn()
    const contact = createMockContact({ id: 'c1', name: 'X' })
    const { user } = render(<PanelPeople contact={contact} onOpenContact={onOpenContact} onOpenMember={vi.fn()} />)
    await user.click(screen.getByText('X'))
    expect(onOpenContact).toHaveBeenCalledWith('c1')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelPeople.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelPeople.tsx
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'

interface PanelPeopleProps {
  contact?: Contact
  assignee?: FamilyMember
  onOpenContact: (id: string) => void
  onOpenMember: (id: string) => void
}

export function PanelPeople({ contact, assignee, onOpenContact, onOpenMember }: PanelPeopleProps) {
  if (!contact && !assignee) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">People</div>
      {contact && (
        <button
          onClick={() => onOpenContact(contact.id)}
          className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-neutral-100/60 rounded-md px-1"
        >
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-medium">
            {contact.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </span>
          <span className="flex-1 text-sm">
            <div className="text-neutral-800">{contact.name}</div>
            {contact.phone && <div className="text-xs text-neutral-500">📞 {contact.phone}</div>}
          </span>
        </button>
      )}
      {assignee && (
        <button
          onClick={() => onOpenMember(assignee.id)}
          className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-neutral-100/60 rounded-md px-1"
        >
          <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center text-xs font-medium">
            {(assignee.display_name || '?').slice(0, 1)}
          </span>
          <span className="flex-1 text-sm">
            <span className="text-neutral-800">{assignee.display_name}</span>
            <span className="text-xs text-neutral-500"> — for whom</span>
          </span>
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelPeople.test.tsx --run`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelPeople.tsx src/components/surface/sections/PanelPeople.test.tsx
git commit -m "feat(surface): PanelPeople with contact and assignee"
```

---

## Task 9: PanelLinked section

Linked entities: project, linked event, sibling tasks. Renders nothing when all are absent.

**Files:**
- Create: `src/components/surface/sections/PanelLinked.tsx`
- Test: `src/components/surface/sections/PanelLinked.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelLinked.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLinked } from './PanelLinked'
import { createMockProject, createMockTask } from '@/test/mocks/factories'

describe('PanelLinked', () => {
  const handlers = {
    onOpenProject: vi.fn(),
    onOpenEvent: vi.fn(),
    onOpenTask: vi.fn(),
  }

  it('renders nothing when no links', () => {
    const { container } = render(<PanelLinked siblingTasks={[]} {...handlers} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders project card', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam — Health' })
    render(<PanelLinked project={project} siblingTasks={[]} {...handlers} />)
    expect(screen.getByText('Liam — Health')).toBeInTheDocument()
  })

  it('renders linked event title and time', () => {
    render(<PanelLinked
      linkedEvent={{ id: 'e1', title: 'Annual physical', start_time: '2026-05-14T09:00:00Z' } as any}
      siblingTasks={[]}
      {...handlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders sibling tasks', () => {
    const sib = createMockTask({ id: 't9', title: 'Refill rx' })
    render(<PanelLinked siblingTasks={[sib]} {...handlers} />)
    expect(screen.getByText('Refill rx')).toBeInTheDocument()
  })

  it('calls onOpenProject when project is clicked', async () => {
    const project = createMockProject({ id: 'p1', name: 'X' })
    const onOpenProject = vi.fn()
    const { user } = render(<PanelLinked project={project} siblingTasks={[]} {...{ ...handlers, onOpenProject }} />)
    await user.click(screen.getByText('X'))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelLinked.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelLinked.tsx
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/types/calendar'

interface PanelLinkedProps {
  project?: Project
  linkedEvent?: CalendarEvent
  siblingTasks: Task[]
  onOpenProject: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenTask: (id: string) => void
}

function formatEventTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function PanelLinked({ project, linkedEvent, siblingTasks, onOpenProject, onOpenEvent, onOpenTask }: PanelLinkedProps) {
  const hasAny = project || linkedEvent || siblingTasks.length > 0
  if (!hasAny) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Linked</div>
      {project && (
        <button
          onClick={() => onOpenProject(project.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-violet-100">📁</span>
          <span className="text-sm text-neutral-800 flex-1">{project.name}</span>
        </button>
      )}
      {linkedEvent && (
        <button
          onClick={() => onOpenEvent(linkedEvent.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100">📅</span>
          <span className="text-sm text-neutral-800 flex-1">
            <div>{linkedEvent.title}</div>
            <div className="text-xs text-neutral-500">{formatEventTime((linkedEvent as any).start_time || (linkedEvent as any).startTime)}</div>
          </span>
        </button>
      )}
      {siblingTasks.map(t => (
        <button
          key={t.id}
          onClick={() => onOpenTask(t.id)}
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
          <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
        </button>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelLinked.test.tsx --run`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelLinked.tsx src/components/surface/sections/PanelLinked.test.tsx
git commit -m "feat(surface): PanelLinked with project/event/sibling tasks"
```

---

## Task 10: PanelMightBeRelevant section

Renders the heuristic results from `useMightBeRelevant`. Renders nothing when the list is empty.

**Files:**
- Create: `src/components/surface/sections/PanelMightBeRelevant.tsx`
- Test: `src/components/surface/sections/PanelMightBeRelevant.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelMightBeRelevant.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMightBeRelevant } from './PanelMightBeRelevant'

describe('PanelMightBeRelevant', () => {
  it('renders nothing when list is empty', () => {
    const { container } = render(<PanelMightBeRelevant items={[]} onOpen={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders items with reasons', () => {
    render(
      <PanelMightBeRelevant
        items={[
          { id: 't1', kind: 'task', title: 'Last call to Dr. Smith', reason: 'same contact' },
          { id: 't2', kind: 'task', title: 'Refill rx', reason: 'same person' },
        ]}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Last call to Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/same contact/i)).toBeInTheDocument()
  })

  it('calls onOpen with the item kind and id', async () => {
    const onOpen = vi.fn()
    const { user } = render(
      <PanelMightBeRelevant
        items={[{ id: 't1', kind: 'task', title: 'X', reason: 'r' }]}
        onOpen={onOpen}
      />
    )
    await user.click(screen.getByText('X'))
    expect(onOpen).toHaveBeenCalledWith('task', 't1')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelMightBeRelevant.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelMightBeRelevant.tsx
import type { MightBeRelevantItem } from '../types'

interface PanelMightBeRelevantProps {
  items: MightBeRelevantItem[]
  onOpen: (kind: MightBeRelevantItem['kind'], id: string) => void
}

const KIND_ICON: Record<MightBeRelevantItem['kind'], string> = {
  task: '📋',
  contact: '👤',
  note: '📝',
  link: '📎',
}

export function PanelMightBeRelevant({ items, onOpen }: PanelMightBeRelevantProps) {
  if (items.length === 0) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Might be relevant</div>
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => onOpen(item.kind, item.id)}
          className="flex items-start gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100 text-sm">{KIND_ICON[item.kind]}</span>
          <span className="flex-1">
            <div className="text-sm text-neutral-800 leading-tight">{item.title}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">{item.reason}</div>
          </span>
        </button>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelMightBeRelevant.test.tsx --run`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelMightBeRelevant.tsx src/components/surface/sections/PanelMightBeRelevant.test.tsx
git commit -m "feat(surface): PanelMightBeRelevant heuristic suggestions UI"
```

---

## Task 11: PanelFooter section

Tiny provenance line: "Created Mar 27 by Iris · Updated yesterday".

**Files:**
- Create: `src/components/surface/sections/PanelFooter.tsx`
- Test: `src/components/surface/sections/PanelFooter.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelFooter.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelFooter } from './PanelFooter'

describe('PanelFooter', () => {
  it('renders created date', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27')} updatedAt={new Date('2026-03-27')} />)
    expect(screen.getByText(/created/i)).toBeInTheDocument()
    expect(screen.getByText(/mar 27/i)).toBeInTheDocument()
  })

  it('renders creator name when provided', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27')} updatedAt={new Date('2026-03-27')} createdByName="Iris" />)
    expect(screen.getByText(/by iris/i)).toBeInTheDocument()
  })

  it('shows "Updated" when updatedAt is later than createdAt', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27')} updatedAt={new Date('2026-05-07')} />)
    expect(screen.getByText(/updated/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/sections/PanelFooter.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelFooter.tsx
interface PanelFooterProps {
  createdAt: Date
  updatedAt: Date
  createdByName?: string
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isLater(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) > 60_000 && a.getTime() > b.getTime()
}

export function PanelFooter({ createdAt, updatedAt, createdByName }: PanelFooterProps) {
  const parts: string[] = [`Created ${fmt(createdAt)}`]
  if (createdByName) parts[0] += ` by ${createdByName}`
  if (isLater(updatedAt, createdAt)) parts.push(`Updated ${fmt(updatedAt)}`)

  return (
    <footer className="text-[11px] text-neutral-400 pt-3 mt-3 border-t border-neutral-200">
      {parts.join(' · ')}
    </footer>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/sections/PanelFooter.test.tsx --run`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelFooter.tsx src/components/surface/sections/PanelFooter.test.tsx
git commit -m "feat(surface): PanelFooter with creation/update meta"
```

---

## Task 12: TapContextPanel orchestrator

Wires all sections together for a task. Receives data via props (no global state coupling) so it can be exercised in isolation in tests.

**Files:**
- Create: `src/components/surface/TapContextPanel.tsx`
- Test: `src/components/surface/TapContextPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/TapContextPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapContextPanel } from './TapContextPanel'
import { createMockTask, createMockContact, createMockProject } from '@/test/mocks/factories'

describe('TapContextPanel', () => {
  const baseHandlers = {
    onClose: vi.fn(),
    onTitleChange: vi.fn(),
    onNotesChange: vi.fn(),
    onToggleComplete: vi.fn(),
    onSchedule: vi.fn(),
    onMore: vi.fn(),
    onOpenContact: vi.fn(),
    onOpenMember: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenEvent: vi.fn(),
    onOpenTask: vi.fn(),
    onOpenRelated: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders task title in the header', () => {
    const task = createMockTask({ title: 'Call Dr. Smith' })
    render(<TapContextPanel
      task={task}
      contacts={[]}
      projects={[]}
      events={[]}
      familyMembers={[]}
      siblingTaskCandidates={[]}
      allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Call Dr. Smith')).toBeInTheDocument()
  })

  it('renders contact when linked', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    const task = createMockTask({ contactId: 'c1' })
    render(<TapContextPanel
      task={task}
      contacts={[contact]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/555-0107/)).toBeInTheDocument()
  })

  it('renders project when linked', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam — Health' })
    const task = createMockTask({ projectId: 'p1' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[project]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Liam — Health')).toBeInTheDocument()
  })

  it('renders Might be relevant items', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const sib = createMockTask({ id: 't2', contactId: 'c1', title: 'Last call to Dr. Smith' })
    render(<TapContextPanel
      task={target}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]}
      allTasks={[target, sib]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Last call to Dr. Smith')).toBeInTheDocument()
  })

  it('does not render empty People/Linked/Might-be-relevant sections for a sparse task', () => {
    const task = createMockTask({ title: 'lonely' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.queryByText(/^People$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Linked$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Might be relevant$/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest src/components/surface/TapContextPanel.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the orchestrator**

```tsx
// src/components/surface/TapContextPanel.tsx
import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/types/calendar'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelActions } from './sections/PanelActions'
import { PanelWhy } from './sections/PanelWhy'
import { PanelPeople } from './sections/PanelPeople'
import { PanelLinked } from './sections/PanelLinked'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useLinkedEntities } from './hooks/useLinkedEntities'
import { useMightBeRelevant } from './hooks/useMightBeRelevant'
import type { MightBeRelevantItem } from './types'

interface TapContextPanelProps {
  task: Task
  // Reference data (Plan 1: passed in by caller — Plan 2 may push into context)
  contacts: Contact[]
  projects: Project[]
  events: CalendarEvent[]
  familyMembers: FamilyMember[]
  siblingTaskCandidates: Task[]
  allTasks: Task[]
  /** Optional creator name for the meta row + footer. */
  createdByName?: string

  // Handlers
  onClose: () => void
  onTitleChange: (next: string) => void
  onNotesChange: (next: string) => void
  onToggleComplete: () => void
  onSchedule: () => void
  onMore: () => void
  onOpenContact: (id: string) => void
  onOpenMember: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenTask: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

function contextToDomain(ctx: TaskContext | null | undefined): 'work' | 'family' | 'personal' | undefined {
  if (ctx === 'work' || ctx === 'family' || ctx === 'personal') return ctx
  return undefined
}

export function TapContextPanel(props: TapContextPanelProps) {
  const { task, allTasks, createdByName } = props

  const linked = useLinkedEntities(task, {
    contacts: props.contacts,
    projects: props.projects,
    events: props.events,
    familyMembers: props.familyMembers,
    siblingTaskCandidates: props.siblingTaskCandidates,
  })

  const mightBeRelevant = useMightBeRelevant(task, { allTasks, now: new Date() })

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={task.title}
        onTitleChange={props.onTitleChange}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={task.bucket || 'inbox'}
        assigneeName={linked.assignee?.display_name}
        createdByName={createdByName}
        domain={contextToDomain(task.context)}
      />
      <PanelActions
        completed={task.completed}
        phoneNumber={task.phoneNumber || linked.contact?.phone}
        onToggleComplete={props.onToggleComplete}
        onSchedule={props.onSchedule}
        onMore={props.onMore}
      />
      <PanelWhy notes={task.notes} onChange={props.onNotesChange} />
      <PanelPeople
        contact={linked.contact}
        assignee={linked.assignee}
        onOpenContact={props.onOpenContact}
        onOpenMember={props.onOpenMember}
      />
      <PanelLinked
        project={linked.project}
        linkedEvent={linked.linkedEvent}
        siblingTasks={linked.siblingTasks}
        onOpenProject={props.onOpenProject}
        onOpenEvent={props.onOpenEvent}
        onOpenTask={props.onOpenTask}
      />
      <PanelMightBeRelevant items={mightBeRelevant} onOpen={props.onOpenRelated} />
      <PanelFooter
        createdAt={task.createdAt}
        updatedAt={task.updatedAt}
        createdByName={createdByName}
      />
    </article>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest src/components/surface/TapContextPanel.test.tsx --run`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapContextPanel.tsx src/components/surface/TapContextPanel.test.tsx
git commit -m "feat(surface): TapContextPanel orchestrator wiring all sections"
```

---

## Task 13: Wire feature flag into the existing task render path

Replace the existing `DetailPanelRedesign` in the task render path with a conditional render based on `SURFACE_PANEL_ENABLED`. The new panel needs the same data the existing panel currently consumes, gathered from the same hooks/contexts the existing panel uses.

**Files:**
- Modify: caller of `DetailPanelRedesign` for tasks (likely `src/components/home/HomeView.tsx` or `src/App.tsx` — find via grep below)

- [ ] **Step 1: Locate the task render path for `DetailPanelRedesign`**

Run: `grep -rn "DetailPanelRedesign" /Users/scottkaufman/Developer/Developer/symphonyOS/src/ --include="*.tsx"`

Note the file(s) where `DetailPanelRedesign` is rendered for tasks. Pick the highest-level one (the caller, not the definition).

- [ ] **Step 2: Add a parallel render branch behind the feature flag**

In the file from Step 1, just above where `<DetailPanelRedesign … />` is rendered for a task entity:

```tsx
import { TapContextPanel, SURFACE_PANEL_ENABLED } from '@/components/surface'
```

Wrap the existing render in a conditional. Keep `DetailPanelRedesign` as the default; render `TapContextPanel` only when the flag is on. Pseudocode (adapt to the actual file's variable names):

```tsx
{selectedTask && (
  SURFACE_PANEL_ENABLED ? (
    <TapContextPanel
      task={selectedTask}
      contacts={contacts}
      projects={projects}
      events={events}
      familyMembers={familyMembers}
      siblingTaskCandidates={tasks}
      allTasks={tasks}
      createdByName={selectedTaskCreator?.display_name}
      onClose={() => setSelectedTask(null)}
      onTitleChange={(t) => updateTask(selectedTask.id, { title: t })}
      onNotesChange={(n) => updateTask(selectedTask.id, { notes: n })}
      onToggleComplete={() => toggleTask(selectedTask.id)}
      onSchedule={() => openSchedulePopover(selectedTask.id)}
      onMore={() => openMoreMenu(selectedTask.id)}
      onOpenContact={(id) => openContact(id)}
      onOpenMember={(id) => openMember(id)}
      onOpenProject={(id) => openProject(id)}
      onOpenEvent={(id) => openEvent(id)}
      onOpenTask={(id) => setSelectedTask(tasks.find(t => t.id === id) ?? null)}
      onOpenRelated={(kind, id) => {
        if (kind === 'task') setSelectedTask(tasks.find(t => t.id === id) ?? null)
        // other kinds: no-op in Plan 1; Plan 2 wires them
      }}
    />
  ) : (
    <DetailPanelRedesign … existing props … />
  )
)}
```

For Plan 1, only `task` cross-entity is wired in `onOpenRelated`. Other kinds become no-ops, with a TODO comment referencing Plan 2.

- [ ] **Step 3: Type-check the build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the lint passes**

Run: `npx eslint src/components/surface/ <modified-file-from-step-1>`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add <modified-file> src/components/surface/
git commit -m "feat(surface): gate TapContextPanel behind SURFACE_PANEL_ENABLED flag"
```

---

## Task 14: Manual verification with the flag on

The feature flag is off in `flag.ts`. Manually flip it on, run the dev server, click a task, and verify the panel renders. Then flip back off before committing.

**Files:**
- Modify temporarily: `src/components/surface/flag.ts` (do NOT commit this change)

- [ ] **Step 1: Flip the flag on locally**

Edit `src/components/surface/flag.ts`:

```ts
export const SURFACE_PANEL_ENABLED = true
```

- [ ] **Step 2: Start the dev server**

Run (in a separate terminal): `npm run dev`
Open `http://localhost:5173`.

- [ ] **Step 3: Verify the panel renders for a task**

Click any task on the Today view. Expected:
- Title shown in the header
- Bucket and any assignee shown in the meta row
- Done / Schedule / More buttons in the action row
- Notes (if present) shown in "Why" section, click-to-edit
- Contact and assignee (if present) in "People"
- Project / linked event / sibling tasks (if present) in "Linked"
- Up to 3 heuristic items in "Might be relevant" (e.g., other tasks tagged the same person/contact)
- Footer line with creation date

Try editing the title (click → type → blur). Try clicking a sibling task → verify the panel switches to that task. Try Done.

- [ ] **Step 4: Flip the flag off**

Edit `src/components/surface/flag.ts`:

```ts
export const SURFACE_PANEL_ENABLED = false
```

- [ ] **Step 5: Confirm the flag stays off in the commit**

Run: `git status`
Expected: `flag.ts` is unmodified (your change reverted to `false`).

If you'd rather lock in the flag-off state explicitly:

```bash
git checkout -- src/components/surface/flag.ts
```

No commit needed — Plan 1 ships with the flag off. Plan 2 will flip it on after the cross-entity nav and L2 work lands.

---

## Self-review notes

- **Spec coverage:** Tasks 1–12 cover the panel structure (decisions 1–3 from the spec) and Phase 1 of "Might be relevant" (decision 6 phase 1). Inline edit (decision 5) is implemented for title and notes; schedule/contact-edit are deferred to Plan 2's polish. L2 domain awareness (decision 7) is represented as a domain chip in `PanelMetaRow` but the viewer-aware action logic is Plan 2. Cross-entity nav (decision 4) — Plan 1 handles task-to-task switching only via `onOpenTask`/`onOpenRelated`; alongside-on-desktop and stack-on-mobile come in Plan 2. The feature flag (Task 13) makes the rollout reversible.

- **Placeholder check:** No "TODO" or "TBD" steps; every code-changing step contains the actual code. Task 13 references `<modified-file-from-step-1>` as a placeholder for the engineer's grep result, which is intentional — the file location is environment-dependent and the grep command is the authoritative way to find it.

- **Type consistency:** `MightBeRelevantItem` defined in Task 1 is consumed by Tasks 3, 10, 12. `LinkedEntities` defined in Task 1 is the return type of Task 2 and consumed by Task 12. Section prop names are consistent: `onOpenContact`, `onOpenProject`, `onOpenEvent`, `onOpenTask`, `onOpenMember`, `onOpenRelated` are stable across Tasks 8–12.
