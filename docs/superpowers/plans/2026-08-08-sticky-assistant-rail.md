# Sticky Assistant Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse Symphony's two independent assistant rails into one conversation that stays open and intact across every route.

**Architecture:** A single `AssistantProvider` owns the one `useSymphonyAssistant` instance plus the rail's open/closed state. A single `AssistantRail` host renders it on every route, sliding left of whatever detail pane is open. `Shell.tsx`'s `ShellAssistantHost` and `ShellLayout.tsx`'s duplicate instance are both deleted; both become consumers.

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, react-router-dom, Tailwind v4.

## Global Constraints

- Working directory is the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/sticky-assistant` on branch `feat/sticky-assistant`. Never edit or commit in the main worktree.
- Node must be 22.14.0 before running tests. Run first in every shell:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- `npm test` is watch mode. Always use `npx vitest run <path>`.
- Type-check with `npx tsc --noEmit -p tsconfig.app.json`. Bare `npx tsc --noEmit` is a no-op.
- Rail width is `420`. Default detail-panel width is `480`. Wide-viewport threshold is `1600`.
- The rail's persisted open state keeps the existing localStorage key `symphony-scratchpad-hidden` (value `'0'` means open; anything else, including absent, means hidden) so Scott's current preference carries over.
- No emojis in UI copy — lucide icons only.
- Do not touch `AssistDrawer`, `GuideChat`, or the `symphony-agent` edge function.

## File Structure

| File | Responsibility |
|---|---|
| `src/hooks/useWideViewport.ts` (new) | `matchMedia` hook, `>= 1600px` |
| `src/shell/railLayout.ts` (new) | Pure layout math: rail/detail widths, content inset |
| `src/shell/useDetailPaneWidth.ts` (new) | Active selection's detail-panel width, or 0 |
| `src/contexts/AssistantContext.tsx` (new) | The one assistant instance + open state |
| `src/shell/AssistantRail.tsx` (new) | The one rail host (desktop aside, mobile overlay, edge tab, NoteViewer) |
| `src/shell/types.ts` | Add `detailPanelWidth?: number` to `AppDef` |
| `src/apps/job-pipeline/index.ts` | Declare `detailPanelWidth: 420` |
| `src/shell/Shell.tsx` | Mount provider + rail; delete `ShellAssistantHost` |
| `src/shell/ShellLayout.tsx` | Consume context; delete duplicate instance + `chatOpen`; use `computeContentInset` |
| `src/apps/tasks/TasksApp.tsx` | Masthead toggle reads `useAssistant` |

---

### Task 1: `useWideViewport` hook

**Files:**
- Create: `src/hooks/useWideViewport.ts`
- Test: `src/hooks/useWideViewport.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useWideViewport(): boolean` — true when the viewport is at least 1600px wide. Also exports `WIDE_BREAKPOINT = 1600`.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useWideViewport.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWideViewport, WIDE_BREAKPOINT } from './useWideViewport'

type Listener = (e: { matches: boolean }) => void

/** Replaces window.matchMedia with a controllable stub. Returns a fire(). */
function stubMatchMedia(initialMatches: boolean) {
  const listeners: Listener[] = []
  const original = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: initialMatches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, cb: Listener) => { listeners.push(cb) },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  return {
    fire: (matches: boolean) => listeners.forEach((cb) => cb({ matches })),
    restore: () => Object.defineProperty(window, 'matchMedia', { writable: true, value: original }),
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('useWideViewport', () => {
  it('starts false on a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 1512)
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(false)
    mm.restore()
  })

  it('starts true at exactly the breakpoint', () => {
    vi.stubGlobal('innerWidth', WIDE_BREAKPOINT)
    const mm = stubMatchMedia(true)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(true)
    mm.restore()
  })

  it('updates when the media query changes', () => {
    vi.stubGlobal('innerWidth', 1200)
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(false)
    act(() => { mm.fire(true) })
    expect(result.current).toBe(true)
    mm.restore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useWideViewport.test.ts`
Expected: FAIL — cannot resolve `./useWideViewport`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useWideViewport.ts
//
// True when there is room to reflow the content column alongside BOTH the
// detail pane (480) and the assistant rail (420). Below this, 420 + 480 + a
// 256px sidebar leaves the content column too narrow to read, so the rail
// overlays it instead. Mirrors useMobile's matchMedia shape.

import { useState, useEffect } from 'react'

export const WIDE_BREAKPOINT = 1600 // px

export function useWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= WIDE_BREAKPOINT
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`)
    const handleChange = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isWide
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useWideViewport.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWideViewport.ts src/hooks/useWideViewport.test.ts
git commit -m "feat(shell): add useWideViewport hook for the 1600px rail threshold"
```

---

### Task 2: Pure layout math

**Files:**
- Create: `src/shell/railLayout.ts`
- Test: `src/shell/railLayout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ASSISTANT_RAIL_WIDTH = 420`
  - `DEFAULT_DETAIL_PANEL_WIDTH = 480`
  - `computeContentInset(args: { isMobile: boolean; railOpen: boolean; detailWidth: number; isWide: boolean }): string` — the CSS `marginRight` value for the content column.

Why a pure function: `ShellLayout` needs a dozen hooks (tasks, auth, calendar) to render, so its existing test file only tests the pure `deriveActiveView` export. Same pattern here — the branch that matters is testable without mounting the tree.

- [ ] **Step 1: Write the failing test**

```ts
// src/shell/railLayout.test.ts
import { describe, expect, it } from 'vitest'
import { computeContentInset, ASSISTANT_RAIL_WIDTH, DEFAULT_DETAIL_PANEL_WIDTH } from './railLayout'

const base = { isMobile: false, railOpen: false, detailWidth: 0, isWide: false }

describe('computeContentInset', () => {
  it('is 0 with nothing open', () => {
    expect(computeContentInset(base)).toBe('0')
  })

  it('reserves the rail width when only the rail is open', () => {
    expect(computeContentInset({ ...base, railOpen: true })).toBe('420px')
  })

  it('reserves the detail width when only a detail pane is open', () => {
    expect(computeContentInset({ ...base, detailWidth: 480 })).toBe('480px')
  })

  it('reserves both on a wide viewport', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 480, isWide: true })).toBe('900px')
  })

  it('reserves only the detail pane below the wide threshold, letting the rail overlay', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 480, isWide: false })).toBe('480px')
  })

  it('respects a non-default detail width', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 420, isWide: true })).toBe('840px')
  })

  it('never insets on mobile', () => {
    expect(computeContentInset({ isMobile: true, railOpen: true, detailWidth: 480, isWide: true })).toBe('0')
  })

  it('exports the shared widths', () => {
    expect(ASSISTANT_RAIL_WIDTH).toBe(420)
    expect(DEFAULT_DETAIL_PANEL_WIDTH).toBe(480)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shell/railLayout.test.ts`
Expected: FAIL — cannot resolve `./railLayout`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shell/railLayout.ts
//
// Layout math shared by the assistant rail and the content column, kept pure
// so the branch that matters is testable without mounting ShellLayout (which
// needs a dozen data hooks). See
// docs/superpowers/specs/2026-08-08-sticky-assistant-rail-design.md.

export const ASSISTANT_RAIL_WIDTH = 420
export const DEFAULT_DETAIL_PANEL_WIDTH = 480

interface ContentInsetArgs {
  isMobile: boolean
  /** The assistant rail is open (desktop only — mobile is a full overlay). */
  railOpen: boolean
  /** Width of the open detail pane, or 0 when none is open. */
  detailWidth: number
  /** Viewport is wide enough to reflow content past BOTH panes. */
  isWide: boolean
}

/**
 * CSS `marginRight` for the content column.
 *
 * The detail pane always keeps its flush-right slot; the rail sits to its
 * left. When both are open but the viewport is too narrow to reflow past
 * them, we reserve only the detail pane and let the rail overlay the content
 * — losing a cramped content column beats hiding the conversation.
 */
export function computeContentInset({ isMobile, railOpen, detailWidth, isWide }: ContentInsetArgs): string {
  if (isMobile) return '0'
  const both = railOpen && detailWidth > 0
  if (both) return isWide ? `${detailWidth + ASSISTANT_RAIL_WIDTH}px` : `${detailWidth}px`
  if (detailWidth > 0) return `${detailWidth}px`
  if (railOpen) return `${ASSISTANT_RAIL_WIDTH}px`
  return '0'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shell/railLayout.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shell/railLayout.ts src/shell/railLayout.test.ts
git commit -m "feat(shell): add pure content-inset math for rail + detail pane"
```

---

### Task 3: Detail-panel width on `AppDef`

**Files:**
- Modify: `src/shell/types.ts` (add field to `AppDef`, after `ownsSelectionKinds`)
- Modify: `src/apps/job-pipeline/index.ts` (declare `detailPanelWidth: 420`)
- Create: `src/shell/useDetailPaneWidth.ts`
- Test: `src/shell/useDetailPaneWidth.test.tsx`

**Interfaces:**
- Consumes: `useSelection()` from `./providers/SelectionProvider`, `resolveAppForSelection` from `./appRegistry`, `DEFAULT_DETAIL_PANEL_WIDTH` from `./railLayout` (Task 2).
- Produces: `useDetailPaneWidth(registry: AppRegistry): number` — 0 when nothing is selected, otherwise the owning app's `detailPanelWidth` or the 480 default.

Why: every app's detail panel hardcodes its own `fixed right-0` width — `TaskDetailPanel.tsx:66` is `md:w-[480px]`, `ApplicationDetailPanel.tsx:93` is `w-[420px]`. Rather than offsetting each one, the rail slides left by whatever the active panel's width is.

- [ ] **Step 1: Write the failing test**

```tsx
// src/shell/useDetailPaneWidth.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SelectionProvider } from './providers/SelectionProvider'
import { createRegistry } from './appRegistry'
import { useDetailPaneWidth } from './useDetailPaneWidth'
import type { AppDef } from './types'

const WideApp: AppDef = {
  id: 'wide',
  route: '/wide',
  index: true,
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['wide-thing'],
}

const NarrowApp: AppDef = {
  id: 'narrow',
  route: '/narrow',
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['narrow-thing'],
  detailPanelWidth: 420,
}

const registry = createRegistry([WideApp, NarrowApp])

function Probe() {
  return <span data-testid="width">{useDetailPaneWidth(registry)}</span>
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <SelectionProvider registry={registry}>
        <Probe />
      </SelectionProvider>
    </MemoryRouter>,
  )
  return screen.getByTestId('width').textContent
}

describe('useDetailPaneWidth', () => {
  it('is 0 with no selection', () => {
    expect(renderAt('/wide')).toBe('0')
  })

  it('falls back to the 480 default for an app that declares no width', () => {
    expect(renderAt('/wide?detail=wide-thing:abc')).toBe('480')
  })

  it("uses the owning app's declared width", () => {
    expect(renderAt('/narrow?detail=narrow-thing:abc')).toBe('420')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shell/useDetailPaneWidth.test.tsx`
Expected: FAIL — cannot resolve `./useDetailPaneWidth`; `detailPanelWidth` is not a valid `AppDef` field.

- [ ] **Step 3: Write minimal implementation**

Add to `AppDef` in `src/shell/types.ts`, directly after the `ownsSelectionKinds` field:

```ts
  /**
   * Width in px of this app's DetailPanelComponent (which positions itself
   * `fixed right-0`). The assistant rail slides left by this much so the two
   * sit side by side. Defaults to DEFAULT_DETAIL_PANEL_WIDTH (480).
   */
  detailPanelWidth?: number;
```

Add to `jobPipelineAppDef` in `src/apps/job-pipeline/index.ts`, after `ownsSelectionKinds`:

```ts
  // ApplicationDetailPanel renders at w-[420px], not the 480 default.
  detailPanelWidth: 420,
```

Create `src/shell/useDetailPaneWidth.ts`:

```ts
// src/shell/useDetailPaneWidth.ts
//
// Width of the currently-open detail pane, or 0 when none is open. The
// assistant rail uses this as its `right` offset so it sits beside the pane
// instead of under it — and so the panes themselves never have to move.

import { useSelection } from './providers/SelectionProvider'
import { resolveAppForSelection, type AppRegistry } from './appRegistry'
import { DEFAULT_DETAIL_PANEL_WIDTH } from './railLayout'

export function useDetailPaneWidth(registry: AppRegistry): number {
  const { selection } = useSelection()
  if (!selection) return 0
  const app = resolveAppForSelection(registry, selection.kind)
  // A selection whose app has no panel renders nothing — reserve no space.
  if (!app?.DetailPanelComponent) return 0
  return app.detailPanelWidth ?? DEFAULT_DETAIL_PANEL_WIDTH
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shell/useDetailPaneWidth.test.tsx src/shell/appRegistry.test.ts`
Expected: PASS — 3 new tests, existing registry tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/shell/types.ts src/apps/job-pipeline/index.ts src/shell/useDetailPaneWidth.ts src/shell/useDetailPaneWidth.test.tsx
git commit -m "feat(shell): declare detail-panel widths and expose the active one"
```

---

### Task 4: `AssistantProvider` — the one instance

**Files:**
- Create: `src/contexts/AssistantContext.tsx`
- Test: `src/contexts/AssistantContext.test.tsx`

**Interfaces:**
- Consumes: `useSymphonyAssistant` from `@/hooks/useSymphonyAssistant`, `useScratchpadHidden` from `@/hooks/useScratchpadHidden`, `useMobile` from `@/hooks/useMobile`.
- Produces:
  - `AssistantProvider({ children }: { children: ReactNode })`
  - `useAssistant(): ReturnType<typeof useSymphonyAssistant> & { open: boolean; setOpen: (v: boolean) => void }` — throws outside the provider.

Two open-state rules, both from the spec:
- Desktop persists through `useScratchpadHidden` (localStorage key `symphony-scratchpad-hidden`).
- Mobile does **not** persist and closes on route change — the mobile rail is a `fixed inset-0` overlay, so a persisted "open" would reload into a screen covering the whole app.

- [ ] **Step 1: Write the failing test**

```tsx
// src/contexts/AssistantContext.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { AssistantProvider, useAssistant } from './AssistantContext'

// Drive the agent without touching the network: resolve one assistant turn.
vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(async (_messages, handlers) => {
    handlers.onText('pack sunscreen')
    handlers.onDone('pack sunscreen', 'session-1', undefined)
  }),
}))

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

/** Two independent consumers of the context, to prove they share one instance. */
function ConsumerA() {
  const { messages, sendMessage, open, setOpen } = useAssistant()
  return (
    <div>
      <button onClick={() => void sendMessage('what should I pack?')}>send-a</button>
      <button onClick={() => setOpen(true)}>open-a</button>
      <span data-testid="a-count">{messages.length}</span>
      <span data-testid="a-open">{String(open)}</span>
    </div>
  )
}

function ConsumerB() {
  const { messages, open } = useAssistant()
  return (
    <div>
      <span data-testid="b-count">{messages.length}</span>
      <span data-testid="b-open">{String(open)}</span>
      <span data-testid="b-text">{messages.map((m) => m.content).join('|')}</span>
    </div>
  )
}

function renderShared() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <AssistantProvider>
        <ConsumerA />
        <ConsumerB />
      </AssistantProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => { localStorage.clear() })

describe('AssistantProvider', () => {
  it('shares one conversation across consumers', async () => {
    renderShared()
    expect(screen.getByTestId('b-count').textContent).toBe('0')
    await act(async () => { screen.getByText('send-a').click() })
    // user turn + assistant turn, visible to the consumer that never sent.
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    expect(screen.getByTestId('b-text').textContent).toContain('pack sunscreen')
    expect(screen.getByTestId('a-count').textContent).toBe('2')
  })

  it('shares the open state across consumers', async () => {
    renderShared()
    expect(screen.getByTestId('b-open').textContent).toBe('false')
    await act(async () => { screen.getByText('open-a').click() })
    expect(screen.getByTestId('b-open').textContent).toBe('true')
  })

  it('persists desktop open state to the existing scratchpad key', async () => {
    renderShared()
    await act(async () => { screen.getByText('open-a').click() })
    expect(localStorage.getItem('symphony-scratchpad-hidden')).toBe('0')
  })

  it('starts closed when the key is absent', () => {
    renderShared()
    expect(screen.getByTestId('a-open').textContent).toBe('false')
  })

  it('keeps the conversation across a route change', async () => {
    function Navigator() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/projects')}>go</button>
    }
    render(
      <MemoryRouter initialEntries={['/today']}>
        <AssistantProvider>
          <ConsumerA />
          <Navigator />
          <Routes>
            <Route path="/today" element={<ConsumerB />} />
            <Route path="/projects" element={<ConsumerB />} />
          </Routes>
        </AssistantProvider>
      </MemoryRouter>,
    )
    await act(async () => { screen.getByText('send-a').click() })
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    await act(async () => { screen.getByText('go').click() })
    // THE BUG THIS FIXES: the transcript survives navigation.
    expect(screen.getByTestId('b-count').textContent).toBe('2')
    expect(screen.getByTestId('b-text').textContent).toContain('pack sunscreen')
  })
})

describe('useAssistant outside the provider', () => {
  it('throws', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ConsumerB />)).toThrow(/AssistantProvider/)
    quiet.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/contexts/AssistantContext.test.tsx`
Expected: FAIL — cannot resolve `./AssistantContext`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/contexts/AssistantContext.tsx
//
// The ONE Symphony assistant instance. Before this, Shell.tsx and
// ShellLayout.tsx each called useSymphonyAssistant with the same persistKey,
// so navigating between Today and anywhere else swapped which conversation you
// were looking at and the other one appeared to vanish. Hoisting the hook here
// means the conversation follows you.
//
// Any new assistant surface should consume this rather than mounting its own
// instance. (Entity-scoped chats — AssistDrawer, GuideChat — are deliberately
// separate and keep their own.)

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden'
import { useMobile } from '@/hooks/useMobile'

type AssistantValue = ReturnType<typeof useSymphonyAssistant> & {
  open: boolean
  setOpen: (v: boolean) => void
}

const AssistantContext = createContext<AssistantValue | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const assistant = useSymphonyAssistant({ persistKey: 'symphony_rail' })
  const isMobile = useMobile()
  const { pathname } = useLocation()

  // Desktop: persisted (localStorage, cross-tab synced) — the rail stays where
  // the user left it. Mobile: ephemeral, because the mobile rail is a
  // fixed inset-0 overlay and a persisted "open" would reload into a screen
  // covering the whole app.
  const { hidden, setHidden } = useScratchpadHidden()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Mobile can't keep a full-screen overlay up over a page you navigated to.
  useEffect(() => {
    if (isMobile) setMobileOpen(false)
  }, [pathname, isMobile])

  const open = isMobile ? mobileOpen : !hidden
  const setOpen = useMemo(
    () => (v: boolean) => { if (isMobile) setMobileOpen(v); else setHidden(!v) },
    [isMobile, setHidden],
  )

  const value = useMemo<AssistantValue>(
    () => ({ ...assistant, open, setOpen }),
    [assistant, open, setOpen],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant(): AssistantValue {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/contexts/AssistantContext.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AssistantContext.tsx src/contexts/AssistantContext.test.tsx
git commit -m "feat(assistant): hoist the rail's conversation into one provider"
```

---

### Task 5: `AssistantRail` — the one host

**Files:**
- Create: `src/shell/AssistantRail.tsx`
- Test: `src/shell/AssistantRail.test.tsx`

**Interfaces:**
- Consumes: `useAssistant` (Task 4), `useDetailPaneWidth` (Task 3), `ASSISTANT_RAIL_WIDTH` (Task 2), `useMobile`, `useAssistantLaunchRequests` from `@/contexts/AssistantLaunchContext`, `ChatPanel` and `NoteViewer` from `@/components/chat/…`.
- Produces: `AssistantRail({ registry }: { registry: AppRegistry })`.

Behavior lifted from the two deleted hosts, minus every route condition:
- Desktop, open: `<aside>` fixed right, 420px, `right: <detail pane width>px`.
- Desktop, closed: the `PanelRightOpen` edge tab (previously `Shell.tsx:87-97`, Today-only) — now on every route.
- Mobile, open: full-screen overlay (previously `ShellLayout.tsx:383-409`).
- Owns the launch nonce: on a new nonce, open and send the seed. Exactly one listener now, so no `isToday`/`isMobile` arbitration.
- Owns `NoteViewer` (source clicks), previously Today-only.

- [ ] **Step 1: Write the failing test**

```tsx
// src/shell/AssistantRail.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssistantRail } from './AssistantRail'
import { AssistantProvider } from '@/contexts/AssistantContext'
import { SelectionProvider } from './providers/SelectionProvider'
import { createRegistry } from './appRegistry'
import type { AppDef } from './types'

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(async (_m, h) => { h.onDone('ok', 's1', undefined) }),
}))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}))

const ThingApp: AppDef = {
  id: 'thing',
  route: '/things',
  index: true,
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['thing'],
}
const registry = createRegistry([ThingApp])

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SelectionProvider registry={registry}>
        <AssistantProvider>
          <AssistantRail registry={registry} />
        </AssistantProvider>
      </SelectionProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => { localStorage.clear() })

describe('AssistantRail', () => {
  it('shows the reopen tab when closed, on any route', () => {
    renderAt('/things')
    expect(screen.getByLabelText('Show Symphony AI')).toBeTruthy()
    expect(screen.queryByTestId('chat-panel')).toBeNull()
  })

  it('opens from the tab and renders the panel', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
  })

  it('sits flush right with no detail pane open', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByLabelText('Symphony AI').style.right).toBe('0px')
  })

  it('slides left of an open detail pane', async () => {
    renderAt('/things?detail=thing:abc')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByLabelText('Symphony AI').style.right).toBe('480px')
  })

  it('stays mounted and open after the route changes', async () => {
    // Desktop open state is persisted, so a fresh render at another route
    // (what navigation looks like to this component's conditions) keeps it.
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
    renderAt('/things/other')
    expect(screen.getAllByTestId('chat-panel').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shell/AssistantRail.test.tsx`
Expected: FAIL — cannot resolve `./AssistantRail`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/shell/AssistantRail.tsx
//
// The single assistant rail host. Renders on EVERY route — no pathname check,
// no selection check. Previously this lived in two places (Shell.tsx's
// ShellAssistantHost for desktop-Today, ShellLayout.tsx's rail for everything
// else), each with its own conversation; navigating swapped which one you saw.
//
// Layout: the detail panes each hardcode `fixed right-0` at their own width,
// so the rail is the thing that moves — it offsets left by the active pane's
// width (useDetailPaneWidth) and the panes never budge.

import { useEffect, useRef, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { NoteViewer } from '@/components/chat/NoteViewer'
import { useAssistant } from '@/contexts/AssistantContext'
import { useAssistantLaunchRequests } from '@/contexts/AssistantLaunchContext'
import { useMobile } from '@/hooks/useMobile'
import { useDetailPaneWidth } from './useDetailPaneWidth'
import { ASSISTANT_RAIL_WIDTH } from './railLayout'
import type { AppRegistry } from './appRegistry'

export function AssistantRail({ registry }: { registry: AppRegistry }) {
  const assistant = useAssistant()
  const { open, setOpen } = assistant
  const isMobile = useMobile()
  const detailWidth = useDetailPaneWidth(registry)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  // Programmatic launches (unibox "Ask Symphony", Add-to-today, plan cards).
  // One listener now, so there is no "which host owns this" arbitration.
  const { nonce, consumeSeed } = useAssistantLaunchRequests()
  const seenNonce = useRef(0)
  useEffect(() => {
    if (nonce === 0 || nonce === seenNonce.current) return
    seenNonce.current = nonce
    setOpen(true)
    const seed = consumeSeed()
    if (seed && seed.autoSend !== false) void assistant.sendMessage(seed.message)
  }, [nonce, consumeSeed, assistant, setOpen])

  const panel = (
    <ChatPanel
      messages={assistant.messages}
      loading={assistant.loading}
      error={assistant.error}
      entityContext={null}
      mode="chat"
      onSend={assistant.sendMessage}
      onClear={assistant.resetSession}
      onClose={() => setOpen(false)}
      onNewChat={assistant.resetSession}
      onSourceClick={setActiveNoteId}
      toolActivity={assistant.toolActivity}
      sessions={assistant.sessions}
      sessionsLoading={assistant.sessionsLoading}
      onLoadSession={assistant.loadSession}
      onDeleteSession={assistant.deleteSession}
      activeSessionId={assistant.activeSessionId}
    />
  )

  const note = activeNoteId ? (
    <NoteViewer key={activeNoteId} noteId={activeNoteId} onClose={() => setActiveNoteId(null)} />
  ) : null

  if (isMobile) {
    if (!open) return null
    return (
      <>
        <div
          className="fixed inset-0 z-50 bg-bg-elevated"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {panel}
        </div>
        {note}
      </>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show Symphony AI"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-neutral-200 rounded-l-lg px-1.5 py-3 text-neutral-400 hover:text-neutral-600 shadow-card transition-colors"
      >
        <PanelRightOpen size={16} />
      </button>
    )
  }

  return (
    <>
      <aside
        className="fixed top-0 bottom-0 z-10 bg-bg-elevated border-l border-neutral-200/80 shadow-xl transition-[right] duration-300 ease-in-out"
        style={{ right: `${detailWidth}px`, width: `${ASSISTANT_RAIL_WIDTH}px` }}
        aria-label="Symphony AI"
      >
        {panel}
      </aside>
      {note}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shell/AssistantRail.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shell/AssistantRail.tsx src/shell/AssistantRail.test.tsx
git commit -m "feat(shell): add the single always-on assistant rail host"
```

---

### Task 6: Wire `Shell.tsx`, delete `ShellAssistantHost`

**Files:**
- Modify: `src/shell/Shell.tsx` (delete lines 38-129 — `TODAY_PATHS` and `ShellAssistantHost`; rewire the provider stack and `content`)
- Test: `src/shell/Shell.test.tsx` (add a case)

**Interfaces:**
- Consumes: `AssistantProvider` (Task 4), `AssistantRail` (Task 5).
- Produces: nothing new; removes the `ShellAssistantHost` export-adjacent internals.

- [ ] **Step 1: Write the failing test**

Append to `src/shell/Shell.test.tsx`, and add `screen` usage as already imported:

```tsx
describe('Shell assistant rail', () => {
  it('mounts the rail on every chromed route', () => {
    renderAt('/chromed');
    expect(screen.getByLabelText('Show Symphony AI')).toBeTruthy();
  });

  it('does not mount the rail on a chromeless app', () => {
    renderAt('/chromeless');
    expect(screen.queryByLabelText('Show Symphony AI')).toBeNull();
  });
});
```

Note: the chromeless case passes only if `AssistantRail` is rendered inside the `useChrome` branch. Put it there — kiosk surfaces (`/wall`) must stay full-bleed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shell/Shell.test.tsx`
Expected: FAIL — no element labelled "Show Symphony AI" (the old host only rendered on Today paths, and `/chromed` is not one).

- [ ] **Step 3: Write minimal implementation**

In `src/shell/Shell.tsx`:

1. Delete the `TODAY_PATHS` constant and the entire `ShellAssistantHost` function (lines 38-129), plus these now-unused imports: `useEffect`, `useRef`, `useState`, `useLocation`'s use inside the host (keep `useLocation` — `Shell` itself uses it), `PanelRightOpen`, `NoteViewer`, `ChatPanel`, `useSymphonyAssistant`, `useScratchpadHidden`, `useSelection`, `useMobile`, `useAssistantLaunchRequests` (keep `AssistantLaunchProvider`).
2. Add `import { AssistantProvider } from '@/contexts/AssistantContext';` and `import { AssistantRail } from './AssistantRail';`.
3. Replace the body of `Shell` with:

```tsx
export function Shell({ registry = appRegistry, Layout = DefaultShellLayout, layout }: Props) {
  const { pathname } = useLocation();
  // A file dropped outside a real drop zone would otherwise navigate the tab
  // to that file, replacing the app and any unsaved state.
  useFileDropGuard();
  const activeApp = resolveActiveApp(registry, pathname);
  const useChrome = activeApp ? activeApp.chromeless !== true : true;

  const content = (
    <>
      <ShellRoutes registry={registry} />
      <DetailPanel registry={registry} />
      <LegacyDetailPanelHost registry={registry} />
      {/* The rail lives beside the routes, not inside ShellLayout's scrolling
          content div, so it can stay position:fixed. Chromeless (kiosk)
          surfaces render full-bleed and get no rail. */}
      {useChrome && <AssistantRail registry={registry} />}
    </>
  );

  // Render-prop override (legacy) wins over the default Layout component
  // — kept so existing test sites keep working unchanged.
  const wrapped = layout
    ? layout(content)
    : useChrome
      ? <Layout>{content}</Layout>
      : content;

  return (
    <SelectionProvider registry={registry}>
      <AssistantLaunchProvider>
        <AssistantProvider>
          <MealEventsProvider>{wrapped}</MealEventsProvider>
        </AssistantProvider>
      </AssistantLaunchProvider>
    </SelectionProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shell/Shell.test.tsx src/shell/cutoverRouting.test.tsx`
Expected: PASS — 2 new cases, existing chrome-wrapping and routing cases unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/shell/Shell.tsx src/shell/Shell.test.tsx
git commit -m "refactor(shell): replace ShellAssistantHost with the shared rail"
```

---

### Task 7: Wire `ShellLayout.tsx`, delete the duplicate instance

**Files:**
- Modify: `src/shell/ShellLayout.tsx` (lines 50-51, 140-159, 224-233, 263-276, 318-334, 356-409)

**Interfaces:**
- Consumes: `useAssistant` (Task 4), `useDetailPaneWidth` (Task 3), `computeContentInset` (Task 2), `useWideViewport` (Task 1), `appRegistry`.
- Produces: nothing.

- [ ] **Step 1: Delete the duplicate assistant and its rails**

Remove from `src/shell/ShellLayout.tsx`:
- The `TODAY_PATHS` constant (line 51) and the `isToday` binding (line 97) — nothing else uses them once the rail conditions are gone. (`activeView !== 'today'` at line 320 stays; it drives the top-right button cluster, not the rail.)
- Lines 140-159: the `chatOpen` state, the `useSymphonyAssistant` call, `showAiRail`, and the whole launch-nonce effect (`AssistantRail` owns it now). Keep the `useAssistantLauncher()` line — QuickCapture's `onAskSymphony` still uses `openAssistant`.
- Lines 224-233: `rightRailVisible`, the `useScratchpadHidden` call, and `todayRailVisible`.
- Lines 356-409: both `<aside>` and mobile-overlay `ChatPanel` blocks.
- The now-unused imports: `ChatPanel`, `useSymphonyAssistant`, `useScratchpadHidden`, `useAssistantLaunchRequests`.

- [ ] **Step 2: Add the shared reads**

Add these imports:

```tsx
import { appRegistry } from './appRegistry';
import { useAssistant } from '@/contexts/AssistantContext';
import { useDetailPaneWidth } from './useDetailPaneWidth';
import { useWideViewport } from '@/hooks/useWideViewport';
import { computeContentInset } from './railLayout';
```

And, where the deleted rail state used to live (around line 140):

```tsx
  // The assistant rail is rendered by Shell's <AssistantRail>; ShellLayout only
  // reserves space for it and drives the top-bar toggle.
  const { open: assistantOpen, setOpen: setAssistantOpen } = useAssistant();
  const detailPaneWidth = useDetailPaneWidth(appRegistry);
  const isWide = useWideViewport();
```

- [ ] **Step 3: Replace the content inset**

At line 275, replace the `marginRight` expression:

```tsx
            : {
                marginRight: computeContentInset({
                  isMobile,
                  railOpen: assistantOpen,
                  detailWidth: detailPaneWidth,
                  isWide,
                }),
              }
```

Delete the now-dead `selection` read if nothing else in the file uses it; if `useSelection()` is still needed elsewhere, leave it.

- [ ] **Step 4: Point the top-bar button at the shared toggle**

At line 324, replace `onClick` and the active-ring condition:

```tsx
            <button
              onClick={() => setAssistantOpen(!assistantOpen)}
              className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
                assistantOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
              }`}
              aria-label="AI chat"
              title="AI chat"
            >
              <Sparkles className="w-4 h-4" />
            </button>
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/shell/ && npx tsc --noEmit -p tsconfig.app.json`
Expected: all shell tests PASS; tsc reports no errors (it will catch every unused import left behind).

- [ ] **Step 6: Commit**

```bash
git add src/shell/ShellLayout.tsx
git commit -m "refactor(shell): ShellLayout consumes the shared assistant instead of its own"
```

---

### Task 8: Point the Today masthead toggle at the shared state

**Files:**
- Modify: `src/apps/tasks/TasksApp.tsx:29-40`

**Interfaces:**
- Consumes: `useAssistant` (Task 4).
- Produces: nothing.

`HomeHeader`'s ✨ (`HomeHeader.tsx:148`) reads `chatOpen`/`onChatOpenChange` from `AppShellChromeContext`, which `TasksApp` populates from `useScratchpadHidden`. Repoint it so the masthead button, the top-bar button, and the edge tab are one control.

- [ ] **Step 1: Make the change**

Replace the `useScratchpadHidden` usage in `src/apps/tasks/TasksApp.tsx`:

```tsx
export function TasksApp() {
  // HomeHeader (rendered by HomeView) consumes AppShellChrome. The Today AI
  // button toggles the shared assistant rail — the same state the top-bar
  // button and the rail's edge tab drive, so all three stay in sync.
  const { open, setOpen } = useAssistant();
  const chrome = useMemo<AppShellChromeContextValue>(
    () => ({
      chatOpen: open,
      onChatOpenChange: setOpen,
    }),
    [open, setOpen],
  );
```

Swap the import: drop `useScratchpadHidden`, add `import { useAssistant } from '@/contexts/AssistantContext';`.

- [ ] **Step 2: Verify**

Run: `npx vitest run src/apps/tasks/ && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/tasks/TasksApp.tsx
git commit -m "fix(today): masthead AI button drives the shared rail state"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: no new failures versus the pre-change baseline. Check the **Errors** count as well as **Tests** — unhandled rejections from the global supabase mock have masqueraded as flakes before.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: tsc clean. Lint: 9 pre-existing errors on main (OverdueSection, RoutineCollectionRow, and friends) are not from this work — no *new* ones.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. Pre-push `tsc` is not the same as the Vercel build, so build here before pushing.

- [ ] **Step 4: Browser walkthrough — type-checks are not inspection**

The worktree needs the env file or the app renders a blank screen:
`cp ../../.env .` (from the worktree root), then `npm run dev` and open the printed port.

Walk it and confirm each:
1. On `/today`, open the rail from the masthead ✨ and send a message. The reply arrives.
2. Navigate to `/projects`. **The rail is still open and the transcript is still there.** This is the bug being fixed.
3. Navigate to `/lists`, then back to `/today`. Still one continuous conversation.
4. Open a task detail pane on Today. The rail stays visible and slides left of the pane; the pane itself does not move.
5. Close the detail pane. The rail slides back flush right.
6. Narrow the window below 1600px with both open: the rail overlays the content column, the detail pane keeps its slot, nothing is clipped off-screen.
7. Close the rail with its X. The edge tab appears. Navigate — the tab is on the new route too. Reopen: transcript intact.
8. Reload the page with the rail open. It comes back open (desktop persistence).
9. ⌘K → "Ask Symphony" from a non-Today route: the rail opens and sends the seed exactly once (not twice — this is what deleting the second nonce listener protects).
10. Resize to mobile width: the overlay opens full-screen, navigating closes it, reopening shows the same conversation.

- [ ] **Step 5: Push**

```bash
git push -u origin feat/sticky-assistant
```

Do not merge to `main` until the walkthrough above is done — pushes to `main` auto-deploy to production.
