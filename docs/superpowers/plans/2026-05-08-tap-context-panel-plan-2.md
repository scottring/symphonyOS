# TapContextPanel Plan 2 — Generalize to Contacts, Projects, Events

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the single-scroll panel scaffolding from tasks to **contacts, projects, and events**. Wire cross-entity navigation so tapping a linked person, project, or event opens that entity's panel. After this plan, the new panel handles every entity type that Symphony has detail views for today.

**Architecture:** Three new entity-specific orchestrators (`TapContactPanel`, `TapProjectPanel`, `TapEventPanel`) parallel to the existing `TapContextPanel` (tasks). All four reuse the same section components from `src/components/surface/sections/` with light prop tweaks (e.g., `label="What to bring"` for events, custom header content for contacts). App.tsx routes by `selectedItem.type` when `SURFACE_PANEL_ENABLED` is on.

**Tech Stack:** Same as Plan 1 / 1.5.

**Related:**
- Plan 1: `docs/superpowers/plans/2026-05-08-tap-context-panel-tasks.md`
- Plan 1.5: `docs/superpowers/plans/2026-05-08-tap-context-panel-plan-1.5.md`
- Design spec: `docs/superpowers/specs/2026-05-08-surface-design.md`

---

## File Structure

**New files:**
```
src/components/surface/
├── TapContactPanel.tsx + .test.tsx
├── TapProjectPanel.tsx + .test.tsx
├── TapEventPanel.tsx + .test.tsx
└── hooks/
    └── useEntityRelations.ts + .test.ts   # gathers tasks/events/projects for a contact/person
```

**Modified files:**
```
src/components/surface/
├── index.ts                 # add new panel exports
├── sections/
│   ├── PanelWhy.tsx         # already supports `label` prop — just used by callers
│   └── PanelMetaRow.tsx     # already supports domain chip — used as-is
src/App.tsx                  # routes selection by type → correct panel
```

**Section reuse map:**

| Entity | Header | MetaRow | Actions | Why/About | Subtasks | People | Linked | Links | MightBeRelevant | Footer |
|---|---|---|---|---|---|---|---|---|---|---|
| Task (Plan 1+1.5) | title | bucket/assignee/created | Done/Call/Schedule/More | "Why" | yes | contact + assignee | project + event + siblings | links | yes | yes |
| **Contact** | name | category/relationship | Call/Email/Add note/More | "About" | — | "For whom" (related people) | "Open with them" (tasks + events) | links | yes | yes |
| **Project** | name | status/created | Add task/Schedule/More | "What this is" | — | members | "Open work" + "Upcoming" | links | yes | yes |
| **Event** | title | time + calendar | Directions/Office/+Prep task/More | "What to bring" | — | attendees | project + prep tasks | links | yes | yes |

Sections marked "—" are not rendered for that entity (return null, same pattern Plan 1 used).

---

## Task 1: useEntityRelations hook

A small hook that gathers the things that *orbit* a non-task entity. For a contact: tasks linked via `contactId`, events with the contact as attendee, projects mentioning them. For a project: open tasks (already have via `useLinkedEntities`'s sibling logic), upcoming events. For an event: prep tasks, related project.

**Files:**
- Create: `src/components/surface/hooks/useEntityRelations.ts`
- Test: `src/components/surface/hooks/useEntityRelations.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/components/surface/hooks/useEntityRelations.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEntityRelations } from './useEntityRelations'
import { createMockTask, createMockContact, createMockProject } from '@/test/mocks/factories'

describe('useEntityRelations', () => {
  describe('contact', () => {
    it('returns tasks linked via contactId', () => {
      const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
      const linked = createMockTask({ id: 't1', contactId: 'c1', completed: false })
      const unrelated = createMockTask({ id: 't2', contactId: 'c9' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'contact',
        entity: contact,
        allTasks: [linked, unrelated],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })

    it('excludes completed tasks by default', () => {
      const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
      const done = createMockTask({ id: 't1', contactId: 'c1', completed: true })
      const open = createMockTask({ id: 't2', contactId: 'c1', completed: false })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'contact',
        entity: contact,
        allTasks: [done, open],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t2'])
    })
  })

  describe('project', () => {
    it('returns open tasks tagged with the project', () => {
      const project = createMockProject({ id: 'p1', name: 'Liam Health' })
      const open = createMockTask({ id: 't1', projectId: 'p1', completed: false })
      const done = createMockTask({ id: 't2', projectId: 'p1', completed: true })
      const other = createMockTask({ id: 't3', projectId: 'p2' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'project',
        entity: project,
        allTasks: [open, done, other],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })
  })

  describe('event', () => {
    it('returns prep tasks linked via linkedEventId', () => {
      const event = { id: 'e1', title: 'Annual physical' } as any
      const prep = createMockTask({ id: 't1', linkedEventId: 'e1' })
      const other = createMockTask({ id: 't2' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'event',
        entity: event,
        allTasks: [prep, other],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })
  })
})
```

Run: `npx vitest src/components/surface/hooks/useEntityRelations.test.ts --run` (with PATH export). Expect FAIL (module not found).

- [ ] **Step 2: Implement**

```ts
// src/components/surface/hooks/useEntityRelations.ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export interface EntityRelationsInput {
  kind: 'contact' | 'project' | 'event'
  entity: Contact | Project | CalendarEvent
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]
  /** Include completed tasks (default false). */
  includeCompleted?: boolean
}

export interface EntityRelations {
  tasks: Task[]
  events: CalendarEvent[]
  projects: Project[]
}

export function useEntityRelations(input: EntityRelationsInput): EntityRelations {
  return useMemo(() => {
    const { kind, entity, allTasks, allEvents, allProjects, includeCompleted = false } = input

    const taskFilter = (t: Task) => includeCompleted || !t.completed

    if (kind === 'contact') {
      const contact = entity as Contact
      const tasks = allTasks.filter(t => t.contactId === contact.id && taskFilter(t))
      // Events: best-effort match via attendees containing the contact's email/name (out of scope for now — return [])
      return { tasks, events: [], projects: [] }
    }

    if (kind === 'project') {
      const project = entity as Project
      const tasks = allTasks.filter(t => t.projectId === project.id && taskFilter(t))
      // Events tied to project — out of scope for Plan 2; return []
      return { tasks, events: [], projects: [] }
    }

    if (kind === 'event') {
      const event = entity as CalendarEvent
      const eventId = (event as { google_event_id?: string }).google_event_id || event.id
      const tasks = allTasks.filter(t => t.linkedEventId === eventId && taskFilter(t))
      return { tasks, events: [], projects: [] }
    }

    return { tasks: [], events: [], projects: [] }
  }, [input])
}
```

Run tests, expect 4 PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/surface/hooks/useEntityRelations.ts src/components/surface/hooks/useEntityRelations.test.ts
git commit -m "feat(surface): useEntityRelations for non-task entity orbits"
```

---

## Task 2: TapContactPanel

Single-scroll panel for a contact. Shows: avatar + name (header), category/role (meta), Call/Email/Add note (actions), notes (about), related people, "Open with them" (linked tasks + events), might-be-relevant, footer.

**Files:**
- Create: `src/components/surface/TapContactPanel.tsx`
- Test: `src/components/surface/TapContactPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/surface/TapContactPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapContactPanel } from './TapContactPanel'
import { createMockContact, createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenEvent: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenRelated: vi.fn(),
}

describe('TapContactPanel', () => {
  it('renders contact name in header', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
  })

  it('renders Call link when phone present', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    const call = screen.getByRole('link', { name: /555-0107/ })
    expect(call).toHaveAttribute('href', 'tel:555-0107')
  })

  it('renders linked tasks under "Open with them"', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const t1 = createMockTask({ id: 't1', contactId: 'c1', title: 'Call about ear' })
    render(<TapContactPanel
      contact={contact} allTasks={[t1]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Call about ear')).toBeInTheDocument()
    expect(screen.getByText(/open with them/i)).toBeInTheDocument()
  })

  it('does not render "Open with them" when no linked entities', () => {
    const contact = createMockContact({ id: 'c1', name: 'Lone Wolf' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.queryByText(/open with them/i)).not.toBeInTheDocument()
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement TapContactPanel**

```tsx
// src/components/surface/TapContactPanel.tsx
import type { Contact } from '@/types/contact'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Project } from '@/types/project'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'

interface TapContactPanelProps {
  contact: Contact
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

export function TapContactPanel(props: TapContactPanelProps) {
  const { contact, allTasks, allEvents, allProjects } = props
  const relations = useEntityRelations({
    kind: 'contact',
    entity: contact,
    allTasks,
    allEvents,
    allProjects,
  })

  const hasOpenItems = relations.tasks.length > 0 || relations.events.length > 0

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={contact.name}
        onTitleChange={() => { /* contact name editing — out of scope for Plan 2 */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={contact.category || 'Contact'}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors">
            📞 {contact.phone}
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">
            ✉️ {contact.email}
          </a>
        )}
        <button onClick={props.onMore} aria-label="More actions" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">···</button>
      </div>

      <PanelWhy
        notes={contact.notes}
        onChange={props.onNotesChange}
        label="About"
      />

      {hasOpenItems && (
        <section className="mb-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Open with them</div>
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={contact.links} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={contact.createdAt ?? new Date()}
        updatedAt={contact.updatedAt ?? new Date()}
      />
    </article>
  )
}
```

(If `Contact` type doesn't have `notes`, `links`, `category`, `email`, `createdAt`, or `updatedAt` fields, check the actual schema and adjust. The structure is correct — the field names may need tweaks. Use the actual type's field names; the goal is fidelity to data, not strict adherence to my placeholders.)

Run tests, expect 4 PASS.

- [ ] **Step 3: Add to barrel export**

In `src/components/surface/index.ts`, add:

```ts
export { TapContactPanel } from './TapContactPanel'
```

- [ ] **Step 4: Type-check + full surface suite**

```bash
npx tsc --noEmit
npx vitest src/components/surface --run
```

Expect: no errors, 62 + 4 + 4 (entity relations) = 70 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/
git commit -m "feat(surface): TapContactPanel with Open-with-them section"
```

---

## Task 3: TapProjectPanel

Single-scroll panel for a project. Shows: name (header), status/created (meta), Add task / Schedule / More (actions), description (what this is), members (people), "Open work" (active tasks), "Upcoming" (events) — for now defer events; just show active tasks. Links + might-be-relevant + footer.

**Files:**
- Create: `src/components/surface/TapProjectPanel.tsx`
- Test: `src/components/surface/TapProjectPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/surface/TapProjectPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapProjectPanel } from './TapProjectPanel'
import { createMockProject, createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onAddTask: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenRelated: vi.fn(),
}

describe('TapProjectPanel', () => {
  it('renders project name in header', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam Health' })
    render(<TapProjectPanel
      project={project} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Liam Health')).toBeInTheDocument()
  })

  it('renders open tasks under "Open work"', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam Health' })
    const t1 = createMockTask({ id: 't1', projectId: 'p1', title: 'Refill rx', completed: false })
    const t2 = createMockTask({ id: 't2', projectId: 'p1', completed: true })
    render(<TapProjectPanel
      project={project} allTasks={[t1, t2]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Refill rx')).toBeInTheDocument()
    expect(screen.getByText(/open work/i)).toBeInTheDocument()
  })

  it('calls onAddTask with text after Enter', async () => {
    const onAddTask = vi.fn()
    const project = createMockProject({ id: 'p1', name: 'Project' })
    const { user } = render(<TapProjectPanel
      project={project} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers} onAddTask={onAddTask}
    />)
    const input = screen.getByPlaceholderText(/add a task/i)
    await user.type(input, 'New task{Enter}')
    expect(onAddTask).toHaveBeenCalledWith('New task')
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/components/surface/TapProjectPanel.tsx
import { useState } from 'react'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'

interface TapProjectPanelProps {
  project: Project
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddTask: (title: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

export function TapProjectPanel(props: TapProjectPanelProps) {
  const { project, allTasks, allEvents, allProjects } = props
  const relations = useEntityRelations({
    kind: 'project',
    entity: project,
    allTasks,
    allEvents,
    allProjects,
  })
  const [draftTask, setDraftTask] = useState('')

  function commitTask() {
    const text = draftTask.trim()
    if (text) {
      props.onAddTask(text)
      setDraftTask('')
    }
  }

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={project.name}
        onTitleChange={() => { /* project rename — out of scope */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={project.status || 'Project'}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        <button onClick={props.onMore} aria-label="More actions" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">···</button>
      </div>

      <PanelWhy
        notes={project.notes}
        onChange={props.onNotesChange}
        label="What this is"
      />

      <section className="mb-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
          Open work · {relations.tasks.length}
        </div>
        <div className="flex flex-col gap-1.5">
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50 text-left"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
          <input
            type="text"
            value={draftTask}
            onChange={(e) => setDraftTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTask() }}
            onBlur={commitTask}
            placeholder="+ Add a task to this project…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        </div>
      </section>

      <PanelLinks links={project.links} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={project.createdAt ?? new Date()}
        updatedAt={project.updatedAt ?? new Date()}
      />
    </article>
  )
}
```

(Adjust field names to match `Project` type — e.g., `description` vs `notes`. Check `@/types/project`.)

Run tests, expect 3 PASS.

- [ ] **Step 3: Add to barrel**

```ts
export { TapProjectPanel } from './TapProjectPanel'
```

- [ ] **Step 4: Type-check + full surface suite**

Expect: no errors, 70 + 3 = 73 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/
git commit -m "feat(surface): TapProjectPanel with Open-work section"
```

---

## Task 4: TapEventPanel

Panel for a calendar event. Shows: title (header), time + calendar (meta), Directions / Office / +Prep task (actions), what to bring (notes), attendees (people), linked project + prep tasks, links, might-be-relevant, footer.

**Files:**
- Create: `src/components/surface/TapEventPanel.tsx`
- Test: `src/components/surface/TapEventPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/surface/TapEventPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapEventPanel } from './TapEventPanel'
import { createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onAddPrepTask: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenRelated: vi.fn(),
}

const mockEvent = {
  id: 'e1',
  title: 'Annual physical',
  start_time: '2026-05-14T09:00:00Z',
  end_time: '2026-05-14T09:30:00Z',
  location: 'Park Ave Pediatrics',
} as any

describe('TapEventPanel', () => {
  it('renders event title in header', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders prep tasks linked to the event', () => {
    const prep = createMockTask({ id: 't1', linkedEventId: 'e1', title: 'Bring vaccine card' })
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[prep]} {...baseHandlers}
    />)
    expect(screen.getByText('Bring vaccine card')).toBeInTheDocument()
  })

  it('uses "What to bring" label for notes', () => {
    render(<TapEventPanel
      event={mockEvent} notes="Insurance card" allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText(/what to bring/i)).toBeInTheDocument()
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/components/surface/TapEventPanel.tsx
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'

interface TapEventPanelProps {
  event: CalendarEvent
  /** User's notes for the event (from event_notes table). */
  notes: string | undefined
  allTasks: Task[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddPrepTask: (title: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TapEventPanel(props: TapEventPanelProps) {
  const { event, allTasks } = props
  const relations = useEntityRelations({
    kind: 'event',
    entity: event,
    allTasks,
    allEvents: [],
    allProjects: [],
  })

  const startTime = (event as { start_time?: string; startTime?: string }).start_time
    || (event as { start_time?: string; startTime?: string }).startTime

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={event.title}
        onTitleChange={() => { /* event title is read-only from gcal */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={formatTime(startTime)}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        {event.location && (
          <a
            href={`https://maps.apple.com/?q=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            📍 Directions
          </a>
        )}
        <button onClick={props.onMore} aria-label="More actions" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">···</button>
      </div>

      <PanelWhy
        notes={props.notes}
        onChange={props.onNotesChange}
        label="What to bring"
      />

      {relations.tasks.length > 0 && (
        <section className="mb-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Prep tasks</div>
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={undefined} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={new Date(startTime ?? Date.now())}
        updatedAt={new Date(startTime ?? Date.now())}
      />
    </article>
  )
}
```

Run tests, expect 3 PASS.

- [ ] **Step 3: Add to barrel + commit**

```ts
export { TapEventPanel } from './TapEventPanel'
```

```bash
git add src/components/surface/
git commit -m "feat(surface): TapEventPanel with What-to-bring section"
```

---

## Task 5: Wire all four panels into App.tsx

Replace the single TapContextPanel render with a switch by entity type. When the flag is on AND the selectedItem is one of `task | contact | project | event`, route to the appropriate panel.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the new panels**

```tsx
import { TapContextPanel, TapContactPanel, TapProjectPanel, TapEventPanel, SURFACE_PANEL_ENABLED } from '@/components/surface'
```

- [ ] **Step 2: Restructure the panel ternary**

The current code is:

```tsx
panel={
  recipeUrl ? (
    <Suspense fallback={<LoadingFallback />}>
      <RecipeViewer … />
    </Suspense>
  ) : SURFACE_PANEL_ENABLED && selectedItem?.type === 'task' && selectedItem.originalTask ? (
    <TapContextPanel … />
  ) : (
    <Suspense fallback={<LoadingFallback variant="card" />}>
      <DetailPanel … />
    </Suspense>
  )
}
```

Refactor to:

```tsx
panel={
  recipeUrl ? (
    <Suspense fallback={<LoadingFallback />}>
      <RecipeViewer … />
    </Suspense>
  ) : SURFACE_PANEL_ENABLED && selectedItem ? (
    selectedItem.type === 'task' && selectedItem.originalTask ? (
      <TapContextPanel … existing wiring … />
    ) : selectedItem.type === 'event' && selectedItem.originalEvent ? (
      <TapEventPanel
        event={selectedItem.originalEvent}
        notes={getNote(selectedItem.id.replace('event-', ''))?.notes}
        allTasks={tasks}
        onClose={() => setSelectedItemId(null)}
        onNotesChange={(html) => updateNote(selectedItem.id.replace('event-', ''), html)}
        onAddPrepTask={() => { /* TODO: integrate addPrepTask */ }}
        onMore={() => {}}
        onAddLink={() => {}}
        onOpenTask={(id) => setSelectedItemId(`task-${id}`)}
        onOpenProject={() => {}}
        onOpenRelated={() => {}}
      />
    ) : (
      <Suspense fallback={<LoadingFallback variant="card" />}>
        <DetailPanel … existing event/routine path … />
      </Suspense>
    )
  ) : (
    <Suspense fallback={<LoadingFallback variant="card" />}>
      <DetailPanel … />
    </Suspense>
  )
}
```

For tasks: keep the existing TapContextPanel wiring from Plan 1.5 unchanged.

For contacts and projects: these aren't in `selectedItem` (which is a TimelineItem). They live in `selectedContactId` and `selectedProjectId` as separate state. **Don't try to route those through the timeline panel in this task** — that's a routing refactor outside Plan 2's scope. For Plan 2, just verify the Contact and Project panels exist and are tested in isolation; integration with the routing system can be a separate task.

Update the comment near the panel prop to reflect the new state.

- [ ] **Step 3: Type-check + run full suite**

```bash
npx tsc --noEmit
npx vitest --run --reporter=dot 2>&1 | tail -5
```

Expect no type errors, no test regressions.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(surface): route by entity type to TapEventPanel"
```

---

## Self-review

- **Spec coverage:** Tasks 1–5 cover migration steps 3 (generalize panel to other entity types) — task, contact, project, event panels all exist, share section components.
- **Cross-entity navigation (step 4) and L2 viewer-aware actions (step 5):** Deferred to a Plan 2.5 if needed. The existing `onOpenContact` / `onOpenProject` / `onOpenEvent` stubs in App.tsx still no-op — proper integration with `selectedContactId`/`selectedProjectId` routing is a larger refactor.
- **Placeholder check:** Task 5 has explicit "out of scope" comments for prep task integration and contact/project routing — both are flagged with TODO.
- **Type consistency:** `useEntityRelations` returns `{ tasks, events, projects }` and is used by all three new panels. Section component prop names match Plan 1's convention.
- **Field name caveats:** Tasks 2/3/4 each note that field names on `Contact`/`Project`/`CalendarEvent` may differ from placeholders. Implementer must verify against actual types.
