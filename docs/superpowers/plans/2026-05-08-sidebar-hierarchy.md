# Sidebar Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-08-sidebar-hierarchy-design.md`](../specs/2026-05-08-sidebar-hierarchy-design.md)

**Goal:** Replace the flat 13-item sidebar with a collapsible 4-group hierarchy (Do / Plan / Library / Spaces / Apps), persisted per-user, with a small header icon strip for Wall + AI launchers and inline contextual children for Home, Meals, and Lists.

**Architecture:** One new `SidebarGroup` component (renders a header + collapsible body); one persistence hook (`useSidebarGroupState`); a refactored `Sidebar.tsx` that composes these. No DB changes, no new routes, no API impact.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4, Vitest + React Testing Library. Existing patterns from `src/components/layout/Sidebar.tsx`.

---

## Task overview (6 tasks, sequenced)

| # | Task | Files |
|---|------|-------|
| 1 | `SidebarGroup` component (TDD) | `src/components/layout/SidebarGroup.tsx` + test |
| 2 | `useSidebarGroupState` persistence hook (TDD) | `src/hooks/useSidebarGroupState.ts` + test |
| 3 | Refactor `Sidebar.tsx` to use groups | `src/components/layout/Sidebar.tsx` |
| 4 | Header icon strip (Wall, AI) | `src/components/layout/Sidebar.tsx` |
| 5 | Inline contextual children (Home, Lists) | `src/components/layout/Sidebar.tsx` |
| 6 | Self-review + manual smoke | — |

---

## Task 1: `SidebarGroup` component

**Files:**
- Create: `src/components/layout/SidebarGroup.tsx`
- Create: `src/components/layout/SidebarGroup.test.tsx`

A reusable header-+-body component used by Sidebar's collapsible sections. Header is a button that toggles open/closed. When closed, children don't render. When the parent passes `forceOpen={true}` (because the active view falls under this group), the open state is overridden.

When `collapsed=true` (parent sidebar is in icon-only mode), the group renders no header and renders its children in a flat strip (their parent decides what to do; SidebarGroup just unconditionally renders the children when `collapsed` is true). This preserves the existing icon-only layout.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/SidebarGroup.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarGroup } from './SidebarGroup'

describe('SidebarGroup', () => {
  it('renders the label and is closed by default', () => {
    render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toBeInTheDocument()
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
  })

  it('renders children when open', () => {
    render(
      <SidebarGroup label="Plan" open={true} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('clicking the header calls onToggle', () => {
    const onToggle = vi.fn()
    render(
      <SidebarGroup label="Plan" open={false} onToggle={onToggle}>
        <button>Projects</button>
      </SidebarGroup>
    )
    fireEvent.click(screen.getByRole('button', { name: /plan/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('forceOpen overrides open=false and renders children', () => {
    render(
      <SidebarGroup label="Plan" open={false} forceOpen onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('when collapsed=true, renders only children (no header)', () => {
    render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()} collapsed>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.queryByRole('button', { name: /plan/i })).not.toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('aria-expanded reflects open state', () => {
    const { rerender } = render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toHaveAttribute('aria-expanded', 'false')
    rerender(
      <SidebarGroup label="Plan" open={true} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toHaveAttribute('aria-expanded', 'true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest src/components/layout/SidebarGroup.test.tsx --run
```

Expected: FAIL ("Failed to resolve import").

- [ ] **Step 3: Implement `SidebarGroup`**

Create `src/components/layout/SidebarGroup.tsx`:

```typescript
import type { ReactNode } from 'react'

interface Props {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  /** When true (active view falls under this group), behave as if open regardless of `open`. */
  forceOpen?: boolean
  /** Sidebar-collapsed (icon-only) mode: skip the header, render children inline. */
  collapsed?: boolean
}

export function SidebarGroup({ label, open, onToggle, children, forceOpen, collapsed }: Props) {
  if (collapsed) {
    return <>{children}</>
  }

  const isOpen = open || forceOpen === true

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3.5 pt-4 pb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wider hover:text-neutral-600 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span>{label}</span>
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest src/components/layout/SidebarGroup.test.tsx --run
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SidebarGroup.tsx src/components/layout/SidebarGroup.test.tsx
git commit -m "feat(sidebar): add SidebarGroup collapsible component"
```

---

## Task 2: `useSidebarGroupState` persistence hook

**Files:**
- Create: `src/hooks/useSidebarGroupState.ts`
- Create: `src/hooks/useSidebarGroupState.test.ts`

A small hook that reads/writes group open/closed state to `localStorage`. State shape:

```ts
{ plan: boolean, library: boolean, spaces: boolean, apps: boolean }
```

Default if absent: all four false (closed).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useSidebarGroupState.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarGroupState } from './useSidebarGroupState'

beforeEach(() => {
  localStorage.clear()
})

describe('useSidebarGroupState', () => {
  it('defaults to all groups closed when nothing in localStorage', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    expect(result.current.state).toEqual({ plan: false, library: false, spaces: false, apps: false })
  })

  it('toggle flips a single group', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.toggle('plan'))
    expect(result.current.state.plan).toBe(true)
    expect(result.current.state.library).toBe(false)
  })

  it('persists to localStorage after toggle', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.toggle('library'))
    const stored = JSON.parse(localStorage.getItem('symphony-sidebar-groups') || '{}')
    expect(stored.library).toBe(true)
  })

  it('reads existing localStorage on mount', () => {
    localStorage.setItem(
      'symphony-sidebar-groups',
      JSON.stringify({ plan: true, library: false, spaces: true, apps: false }),
    )
    const { result } = renderHook(() => useSidebarGroupState())
    expect(result.current.state).toEqual({ plan: true, library: false, spaces: true, apps: false })
  })

  it('setOpen sets a group to true even if already true (no-op safe)', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.setOpen('spaces'))
    expect(result.current.state.spaces).toBe(true)
    act(() => result.current.setOpen('spaces'))
    expect(result.current.state.spaces).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest src/hooks/useSidebarGroupState.test.ts --run
```

Expected: FAIL ("Failed to resolve import").

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useSidebarGroupState.ts`:

```typescript
import { useCallback, useState } from 'react'

export type SidebarGroupId = 'plan' | 'library' | 'spaces' | 'apps'

export interface SidebarGroupState {
  plan: boolean
  library: boolean
  spaces: boolean
  apps: boolean
}

const STORAGE_KEY = 'symphony-sidebar-groups'
const DEFAULT_STATE: SidebarGroupState = { plan: false, library: false, spaces: false, apps: false }

function readState(): SidebarGroupState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<SidebarGroupState>
    return {
      plan: !!parsed.plan,
      library: !!parsed.library,
      spaces: !!parsed.spaces,
      apps: !!parsed.apps,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(s: SidebarGroupState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore quota / disabled-storage errors
  }
}

export function useSidebarGroupState() {
  const [state, setState] = useState<SidebarGroupState>(() => readState())

  const toggle = useCallback((id: SidebarGroupId) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeState(next)
      return next
    })
  }, [])

  const setOpen = useCallback((id: SidebarGroupId) => {
    setState((prev) => {
      if (prev[id]) return prev
      const next = { ...prev, [id]: true }
      writeState(next)
      return next
    })
  }, [])

  return { state, toggle, setOpen }
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest src/hooks/useSidebarGroupState.test.ts --run
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSidebarGroupState.ts src/hooks/useSidebarGroupState.test.ts
git commit -m "feat(sidebar): add useSidebarGroupState persistence hook"
```

---

## Task 3: Refactor `Sidebar.tsx` to use groups

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

This is the structural refactor. Replace the flat nav list with five logical sections (Do / Plan / Library / Spaces / Apps). Keep every existing button as-is — only their grouping changes. Keep all existing behavior (collapsed mode, pinned section, footer, domain theming).

Header icon strip (Wall, AI) and inline-contextual-children (Home, Lists) are deferred to Tasks 4 and 5 to keep this commit focused.

- [ ] **Step 1: Add imports + group state to the top of `Sidebar.tsx`**

Open `src/components/layout/Sidebar.tsx` and add at the top of the imports block (after the existing `import` lines):

```typescript
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
```

Inside the `Sidebar` function body, just below `const theme = DOMAIN_THEME[currentDomain]`, add:

```typescript
const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

// Force a group open when the user is viewing one of its children.
const planActive = activeView === 'projects' || activeView === 'routines' || activeView === 'goals'
const libraryActive =
  activeView === 'notes' || activeView === 'lists' ||
  activeView === 'contacts' || activeView === 'contact-detail' || activeView === 'history'
const spacesActive = activeView === 'home-app' || activeView === 'meals'

// When the user lands on a child via URL, persist that group as open
// so it stays open after they navigate elsewhere.
useEffect(() => {
  if (planActive) openGroup('plan')
  if (libraryActive) openGroup('library')
  if (spacesActive) openGroup('spaces')
}, [planActive, libraryActive, spacesActive, openGroup])
```

Add `useEffect` to the React imports at the top of the file. (`import { useEffect } from 'react'`.)

- [ ] **Step 2: Restructure the `<nav>` block**

Find the `<nav className="flex-1 px-3 mt-6 space-y-1 overflow-y-auto">` block (around line 172). The existing content inside this `<nav>` is the entire flat list of buttons.

Replace the entire `<nav>` body with this layout. The existing `button` JSX for each row stays the same — only the wrapping changes.

```tsx
<nav className="flex-1 px-3 mt-6 space-y-1 overflow-y-auto">
  {/* Do — always visible (no group header) */}
  {/* Today */}
  <button
    onClick={() => onViewChange('today')}
    className={`
      w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
      ${activeView === 'today'
        ? 'text-primary-700 bg-primary-50/80 font-medium'
        : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
      }
      ${collapsed ? 'justify-center' : ''}
    `}
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
    {!collapsed && <span className="text-[15px]">Today</span>}
  </button>

  {/* Inbox */}
  <button
    onClick={() => onViewChange('inbox')}
    className={`
      w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
      ${activeView === 'inbox'
        ? 'text-primary-700 bg-primary-50/80 font-medium'
        : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
      }
      ${collapsed ? 'justify-center' : ''}
    `}
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
    </svg>
    {!collapsed && <span className="text-[15px]">Inbox</span>}
  </button>

  {/* Plan group */}
  <SidebarGroup
    label="Plan"
    open={groupState.plan}
    forceOpen={planActive}
    onToggle={() => toggleGroup('plan')}
    collapsed={collapsed}
  >
    {/* Projects */}
    <button
      onClick={() => onViewChange('projects')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'projects'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
      {!collapsed && <span className="text-[15px]">Projects</span>}
    </button>

    {/* Routines */}
    <button
      onClick={() => onViewChange('routines')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'routines'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
      </svg>
      {!collapsed && <span className="text-[15px]">Routines</span>}
    </button>

    {/* Goals */}
    <button
      onClick={() => onViewChange('goals')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'goals'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
      </svg>
      {!collapsed && <span className="text-[15px]">Goals</span>}
    </button>
  </SidebarGroup>

  {/* Library group */}
  <SidebarGroup
    label="Library"
    open={groupState.library}
    forceOpen={libraryActive}
    onToggle={() => toggleGroup('library')}
    collapsed={collapsed}
  >
    {FEATURES.notes && (
      <button
        onClick={() => onViewChange('notes')}
        className={`
          w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
          ${activeView === 'notes'
            ? 'text-primary-700 bg-primary-50/80 font-medium'
            : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
          }
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
          <path d="M3 8a1 1 0 011-1h1v10H4a1 1 0 01-1-1V8z" />
        </svg>
        {!collapsed && <span className="text-[15px]">Notes</span>}
      </button>
    )}

    {FEATURES.lists && (
      <button
        onClick={() => onViewChange('lists')}
        className={`
          w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
          ${activeView === 'lists'
            ? 'text-primary-700 bg-primary-50/80 font-medium'
            : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
          }
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        {!collapsed && <span className="text-[15px]">Lists</span>}
      </button>
    )}

    <button
      onClick={() => onViewChange('contacts')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'contacts' || activeView === 'contact-detail'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
      {!collapsed && <span className="text-[15px]">Contacts</span>}
    </button>

    <button
      onClick={() => onViewChange('history')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'history'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      {!collapsed && <span className="text-[15px]">History</span>}
    </button>
  </SidebarGroup>

  {/* Spaces group */}
  <SidebarGroup
    label="Spaces"
    open={groupState.spaces}
    forceOpen={spacesActive}
    onToggle={() => toggleGroup('spaces')}
    collapsed={collapsed}
  >
    {/* Home */}
    <button
      onClick={() => onViewChange('home-app')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'home-app'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
      aria-label="Home"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
      {!collapsed && <span className="text-[15px]">Home</span>}
    </button>

    {/* Meals */}
    <button
      onClick={() => onViewChange('meals')}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
        ${activeView === 'meals'
          ? 'text-primary-700 bg-primary-50/80 font-medium'
          : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 2a1 1 0 011 1v5a2 2 0 002 2h.5a.5.5 0 01.5.5V17a1 1 0 11-2 0v-6H5a4 4 0 01-4-4V3a1 1 0 011-1h1zm6 0a1 1 0 011 1v4a3 3 0 01-2 2.83V17a1 1 0 11-2 0V9.83A3 3 0 015 7V3a1 1 0 112 0v4a1 1 0 102 0V3a1 1 0 011-1zm6 0a3 3 0 013 3v6.5a.5.5 0 01-.5.5H16v5a1 1 0 11-2 0V3a1 1 0 011-1z" />
      </svg>
      {!collapsed && <span className="text-[15px]">Meals</span>}
    </button>

    {/* Meals inline children when active */}
    {!collapsed && activeView === 'meals' && (
      <>
        <button
          onClick={() => navigate('/meals/shelf')}
          className={`
            w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200
            ${location.pathname.startsWith('/meals/shelf')
              ? 'text-primary-700 bg-primary-50/60 font-medium'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
          `}
        >
          <span className="text-[14px]">Shelf</span>
        </button>
        <button
          onClick={() => navigate('/meals/habits')}
          className={`
            w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200
            ${location.pathname.startsWith('/meals/habits')
              ? 'text-primary-700 bg-primary-50/60 font-medium'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
          `}
        >
          <span className="text-[14px]">Habits</span>
        </button>
      </>
    )}
  </SidebarGroup>

  {/* Apps group (registry-driven) */}
  {(() => {
    const registryEntries = appRegistry
      .filter((a) => a.sidebar)
      .sort((a, b) => a.sidebar!.order - b.sidebar!.order)
    if (registryEntries.length === 0) return null
    return (
      <SidebarGroup
        label="Apps"
        open={groupState.apps}
        onToggle={() => toggleGroup('apps')}
        collapsed={collapsed}
      >
        {registryEntries.map((app) => {
          const Icon = app.sidebar!.icon
          const isActive = location.pathname === app.route || location.pathname.startsWith(`${app.route}/`)
          return (
            <button
              key={app.id}
              onClick={() => navigate(app.route)}
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
                ${isActive
                  ? 'text-primary-700 bg-primary-50/80 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-[15px]">{app.sidebar!.label}</span>}
            </button>
          )
        })}
      </SidebarGroup>
    )
  })()}
</nav>
```

This deletes the old AI button, Wall button (top section), the "Reference" header strip, and the "Apps" header logic — they're all replaced by the group structure. AI and Wall return as header icons in Task 4.

- [ ] **Step 3: Run typecheck and existing tests**

```bash
npx tsc --noEmit
npx vitest src/components/layout --run
```

Expected: tsc clean, layout tests pass.

If `tsc` fails because `useEffect` isn't imported, add it to the React imports.

If a Sidebar test exists and breaks because the rendered structure changed, update the test selectors to match the new group structure (e.g., expecting "Plan" header before "Projects" appears).

- [ ] **Step 4: Smoke-check in the browser**

Run `npm run dev` if it isn't already running. Open `localhost:5173`. Verify:
- First paint: Pinned (if any), Today, Inbox, then four collapsed group headers (Plan, Library, Spaces, Apps).
- Click Plan: it expands to Projects/Routines/Goals.
- Click Projects: navigates to /projects, group stays open.
- Reload the page: Plan is still open (localStorage persistence).
- Click Plan again: collapses.
- Toggle the sidebar collapsed state (chevron in header): groups disappear, all icons render flat. Expand again: groups return.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): collapsible groups (Do/Plan/Library/Spaces/Apps)"
```

---

## Task 4: Header icon strip (Wall, AI)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

Move Wall (was a row) and AI (was a row) into a small icon strip next to the search button. Each is 32×32 with a tooltip.

- [ ] **Step 1: Find the search button block**

In `src/components/layout/Sidebar.tsx`, locate the existing search-button block (around line 134, the `{onOpenSearch && ...}` JSX). It currently renders a single full-width button.

- [ ] **Step 2: Wrap it with the icon strip**

Replace the search-button block with:

```tsx
{/* Search + launcher icons */}
<div className="px-3 mt-4 flex items-center gap-1">
  {onOpenSearch && (
    <button
      onClick={onOpenSearch}
      className={`
        flex-1 flex items-center gap-3 px-3.5 py-3 rounded-lg
        text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100/80
        transition-all duration-200
        ${collapsed ? 'justify-center' : ''}
      `}
      aria-label="Search"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
      {!collapsed && (
        <>
          <span className="flex-1 text-left text-[15px]">Search</span>
          <kbd className="hidden lg:inline text-[11px] text-neutral-400 font-medium">⌘/</kbd>
        </>
      )}
    </button>
  )}

  {!collapsed && (
    <>
      {onOpenChat && (
        <button
          onClick={onOpenChat}
          className="p-2 rounded-lg text-primary-600 hover:bg-primary-50/80 hover:text-primary-700 transition-colors"
          aria-label="Open AI chat"
          title="AI chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      <button
        onClick={() => window.open('/wall', '_blank')}
        className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-700 transition-colors"
        aria-label="Open Wall in new tab"
        title="Wall"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
        </svg>
      </button>
    </>
  )}
</div>

{/* AI/Wall icons stacked when sidebar collapsed */}
{collapsed && (
  <div className="px-3 mt-2 flex flex-col items-center gap-1">
    {onOpenChat && (
      <button
        onClick={onOpenChat}
        className="p-2 rounded-lg text-primary-600 hover:bg-primary-50/80 hover:text-primary-700 transition-colors"
        aria-label="Open AI chat"
        title="AI"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      </button>
    )}
    <button
      onClick={() => window.open('/wall', '_blank')}
      className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-700 transition-colors"
      aria-label="Open Wall in new tab"
      title="Wall"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **Step 3: Verify no duplicate Wall/AI rows remain in the nav**

In Task 3, the AI button and Wall button were already removed from the flat list. After Task 4 they only exist in the header strip. Search the file:

```bash
grep -n "onOpenChat\|/wall" src/components/layout/Sidebar.tsx
```

Expected: only the header-strip occurrences appear (no leftover row buttons).

- [ ] **Step 4: tsc + tests + smoke**

```bash
npx tsc --noEmit
npx vitest src/components/layout --run
```

Smoke check in browser: Wall and AI icons appear next to Search at top of sidebar; tooltip on hover; clicking Wall opens new tab; clicking AI invokes chat. When sidebar collapsed, both render stacked under search.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): move Wall + AI to header icon strip"
```

---

## Task 5: Inline contextual children (Home, Lists)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

When `activeView === 'home-app'`, render up to 5 rooms inline under the Home button. When `activeView === 'lists'`, render up to 5 most-recently-updated lists inline under Lists. Each child navigates to the specific entity.

- [ ] **Step 1: Add hooks at the top of the function body**

In `src/components/layout/Sidebar.tsx`, just below the existing `useSidebarGroupState` line, add:

```typescript
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useLists } from '@/hooks/useLists'
```

(Add these to the imports block at the top of the file, not inside the component.)

Inside the function body:

```typescript
// Inline contextual children — only fetch when the relevant view is active
const homeAppActive = activeView === 'home-app'
const listsActive = activeView === 'lists'

const { homes } = useHomes()
const home = homes[0]
const { rooms } = useSpaces(homeAppActive ? home?.id : undefined)
const { lists: allLists } = useLists()

const inlineRooms = homeAppActive ? rooms.slice(0, 5) : []
const moreRoomsCount = homeAppActive ? Math.max(0, rooms.length - 5) : 0

const inlineLists = listsActive
  ? [...allLists].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5)
  : []
const moreListsCount = listsActive ? Math.max(0, allLists.length - 5) : 0
```

The `useSpaces` hook already accepts `undefined` and returns empty `rooms`. `useLists` always loads — calling it conditionally would violate hook rules, so we always call it but only use the result when `listsActive`.

- [ ] **Step 2: Render inline rooms under Home (in the Spaces group)**

Find the Home button inside the Spaces SidebarGroup (added in Task 3). Directly after it, add:

```tsx
{!collapsed && homeAppActive && inlineRooms.map((r) => (
  <button
    key={r.id}
    onClick={() => navigate(`/home/space/${r.id}`)}
    className={`
      w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200
      ${location.pathname === `/home/space/${r.id}`
        ? 'text-primary-700 bg-primary-50/60 font-medium'
        : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
      }
    `}
  >
    <span className="text-[14px] truncate">{r.name}</span>
  </button>
))}
{!collapsed && homeAppActive && moreRoomsCount > 0 && (
  <button
    onClick={() => navigate('/home')}
    className="w-full flex items-center gap-3 pl-9 pr-3.5 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600"
  >
    All rooms ({rooms.length}) →
  </button>
)}
```

- [ ] **Step 3: Render inline lists under Lists (in the Library group)**

Find the Lists button inside the Library SidebarGroup. Directly after it, add:

```tsx
{!collapsed && listsActive && inlineLists.map((l) => (
  <button
    key={l.id}
    onClick={() => onViewChange('lists')}
    className="w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700 transition-all duration-200"
  >
    <span className="text-[14px] truncate">{l.icon ?? '📋'} {l.title}</span>
  </button>
))}
{!collapsed && listsActive && moreListsCount > 0 && (
  <button
    onClick={() => onViewChange('lists')}
    className="w-full flex items-center gap-3 pl-9 pr-3.5 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600"
  >
    All lists ({allLists.length}) →
  </button>
)}
```

(Note: clicking an inline list keeps `onViewChange('lists')` because there is no per-list URL today; the lists view itself can highlight which one is selected. Replace this with `navigate(\`/lists/${l.id}\`)` if a per-list route exists later.)

- [ ] **Step 4: tsc + tests + smoke**

```bash
npx tsc --noEmit
npx vitest src/components/layout --run
```

Smoke check:
- Navigate to `/home`. Spaces group expands; Home button shows; under Home, your rooms appear (up to 5). Click a room → navigates to that room's space view.
- Navigate to `/` (Today). Spaces group still has Home, but no inline rooms.
- Navigate to Lists. Library group expands; under Lists, up to 5 lists appear by recency.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): inline rooms/lists under their group when active"
```

---

## Task 6: Self-review + manual smoke

**Files:** none (review-only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
```

Expected: all PASS (1 pre-existing unhandled rejection in `src/hooks/useSpaces.test.ts` is acceptable — see Phase 1A handoff notes).

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

Expected: zero errors. Warnings tolerated.

- [ ] **Step 3: Spec coverage walkthrough**

Open `docs/superpowers/specs/2026-05-08-sidebar-hierarchy-design.md`. Verify each numbered requirement maps to the implementation:

- Header strip with Wall + AI icons → Task 4
- "Do" group always-open → Task 3
- Plan/Library/Spaces/Apps groups collapsible → Tasks 1+3
- Active group force-open → Task 3 (`forceOpen` + `useEffect` opening on activate)
- localStorage persistence → Task 2
- Inline contextual children for Home/Meals/Lists → Task 5 (Meals already in Task 3)
- Pinned section unchanged → Task 3 leaves it intact

If anything is missing, add a fix-up commit before claiming done.

- [ ] **Step 4: Manual smoke**

In the dev server:
1. Open `/`. Confirm first paint: Pinned (if any), Search/AI/Wall icon strip, Today, Inbox, then four collapsed group headers.
2. Click each group header. Each expands.
3. Reload. State persists.
4. Click Today, then back to a Plan child (e.g., Projects). Plan auto-opens; the bookmark stays after navigating away.
5. Collapse the sidebar (chevron). Group headers disappear; all child buttons render as icons.
6. Expand the sidebar. Groups return to their previous state.
7. Open `/home`. Spaces group is open and shows rooms inline. Click a room → navigates correctly.
8. Open Lists. Library group is open and shows up to 5 lists inline.

If any step breaks, file as a bug commit before finishing.

- [ ] **Step 5: Done**

No final commit needed unless Step 4 produced fixes.
