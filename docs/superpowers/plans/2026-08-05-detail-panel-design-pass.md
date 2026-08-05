# Detail Panel Design Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the right-hand detail panel one coherent surface — every section collapsible, every panel on one shell, one scheduler that shows how full each day already is.

**Architecture:** Two new primitives (`PanelShell` owning zone order and chrome, `PanelSection` owning label + collapse + preview) that all four live panels adopt. `PanelWhy`'s two state machines are replaced by `PanelNotes` with an always-live editor. The task and event schedulers merge into one `SchedulePicker` fed by a pure `computeDayLoad` and an isolated `useDayLoadEvents` cache that never touches `GoogleCalendarProvider`.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4 (Nordic Journal), Vitest + React Testing Library, Supabase edge functions (Deno).

**Spec:** `docs/superpowers/specs/2026-08-05-detail-panel-design-pass-design.md`

## Global Constraints

- Work happens on branch `panel-design-pass` in worktree `.worktrees/panel-design-pass`. Never `checkout`/`cherry-pick`/`reset` in the main worktree.
- Node must be nvm 22.14.0. Check `node -v` first. PATH fix if needed:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- Run tests with `npx vitest run <path>` — **`npm test` is watch mode** and will hang.
- Type-check with `npx tsc --noEmit -p tsconfig.app.json`. Plain `npx tsc --noEmit` at root is a no-op.
- Imports use the `@/` alias for `src/`.
- **No emojis in UI.** Use lucide icons or `ConceptIcon` from `@/lib/conceptIcons`.
- Canonical section-label class, used verbatim everywhere:
  `text-[10px] uppercase tracking-wider font-semibold text-neutral-400`
- Canonical panel chrome, used verbatim in `PanelShell`:
  `bg-bg-elevated max-w-md w-full rounded-2xl px-4 md:px-5 py-3 md:py-5 divide-y divide-neutral-200/60 [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0`
- Test fixtures for anything DB-shaped must use the **raw column value** (ISO strings for timestamps), never a hand-constructed `Date` — a hand-made Date once shipped a dead feature past 25 green tests.
- Handler props passed to children get `useCallback`.
- Commit after every task. Do not push to `main`.

---

### Task 1: `PanelSection` primitive + collapse persistence + `PanelRow`

The one label/collapse primitive every section will use, plus the repeated row chrome currently copy-pasted in `PanelLinks`, `PanelLinked`, and `PanelMightBeRelevant`.

**Files:**
- Create: `src/components/surface/sections/PanelSection.tsx`
- Create: `src/components/surface/sections/PanelSection.test.tsx`
- Create: `src/components/surface/hooks/usePanelCollapse.ts`
- Create: `src/components/surface/hooks/usePanelCollapse.test.ts`
- Create: `src/components/surface/sections/PanelRow.tsx`

**Interfaces:**
- Produces:
  ```ts
  // usePanelCollapse.ts
  export const PANEL_COLLAPSE_KEY = 'symphony.panel.collapsed'
  export function usePanelCollapse(id: string): [boolean, () => void]

  // PanelSection.tsx
  export interface PanelSectionProps {
    id: string
    label: string
    preview?: string
    actions?: React.ReactNode
    children: React.ReactNode
  }
  export function PanelSection(props: PanelSectionProps): JSX.Element

  // PanelRow.tsx
  export interface PanelRowProps {
    icon: React.ReactNode
    onClick?: () => void
    href?: string
    children: React.ReactNode
  }
  export function PanelRow(props: PanelRowProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing collapse-hook test**

Create `src/components/surface/hooks/usePanelCollapse.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelCollapse, PANEL_COLLAPSE_KEY } from './usePanelCollapse'

describe('usePanelCollapse', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to expanded', () => {
    const { result } = renderHook(() => usePanelCollapse('notes'))
    expect(result.current[0]).toBe(false)
  })

  it('persists a collapse across mounts', () => {
    const first = renderHook(() => usePanelCollapse('notes'))
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(true)

    const second = renderHook(() => usePanelCollapse('notes'))
    expect(second.result.current[0]).toBe(true)
  })

  it('scopes collapse to the section id', () => {
    const notes = renderHook(() => usePanelCollapse('notes'))
    act(() => notes.result.current[1]())

    const links = renderHook(() => usePanelCollapse('links'))
    expect(links.result.current[0]).toBe(false)
  })

  it('two live instances of the same id agree', () => {
    const a = renderHook(() => usePanelCollapse('notes'))
    const b = renderHook(() => usePanelCollapse('notes'))
    act(() => a.result.current[1]())
    expect(b.result.current[0]).toBe(true)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem(PANEL_COLLAPSE_KEY, 'not json')
    const { result } = renderHook(() => usePanelCollapse('notes'))
    expect(result.current[0]).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/hooks/usePanelCollapse.test.ts`
Expected: FAIL — cannot resolve `./usePanelCollapse`.

- [ ] **Step 3: Implement the hook**

Create `src/components/surface/hooks/usePanelCollapse.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Which panel sections the user has collapsed. One key holding a list of
 * section ids — a preference per section TYPE, not per entity: collapse Notes
 * once and Notes stays collapsed on every task until you reopen it, so the
 * panel looks the same every time it opens.
 */
export const PANEL_COLLAPSE_KEY = 'symphony.panel.collapsed'

const listeners = new Set<() => void>()

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(PANEL_COLLAPSE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    // Corrupt or unavailable storage must not take the panel down with it.
    return new Set()
  }
}

function write(next: Set<string>): void {
  try {
    localStorage.setItem(PANEL_COLLAPSE_KEY, JSON.stringify([...next]))
  } catch { /* private mode / quota — the toggle still works for this session */ }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Snapshot must be a stable primitive: useSyncExternalStore compares by
// Object.is, and a fresh Set every call would loop forever.
function makeSnapshot(id: string) {
  return () => (read().has(id) ? 'collapsed' : 'open')
}

/** [collapsed, toggle] for one section id. Every live instance stays in sync. */
export function usePanelCollapse(id: string): [boolean, () => void] {
  const snapshot = useSyncExternalStore(subscribe, makeSnapshot(id), () => 'open' as const)

  const toggle = useCallback(() => {
    const next = read()
    if (next.has(id)) next.delete(id)
    else next.add(id)
    write(next)
  }, [id])

  return [snapshot === 'collapsed', toggle]
}
```

- [ ] **Step 4: Run the hook test and confirm it passes**

Run: `npx vitest run src/components/surface/hooks/usePanelCollapse.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing `PanelSection` test**

Create `src/components/surface/sections/PanelSection.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelSection } from './PanelSection'

describe('PanelSection', () => {
  beforeEach(() => localStorage.clear())

  it('renders label and children when expanded', () => {
    render(<PanelSection id="notes" label="Notes"><p>body text</p></PanelSection>)
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('hides children and shows the preview when collapsed', async () => {
    const user = userEvent.setup()
    render(
      <PanelSection id="notes" label="Notes" preview="Ask about the 3pm slot">
        <p>body text</p>
      </PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: /collapse notes/i }))

    expect(screen.queryByText('body text')).not.toBeInTheDocument()
    expect(screen.getByText('Ask about the 3pm slot')).toBeInTheDocument()
  })

  it('reopens on a second click', async () => {
    const user = userEvent.setup()
    render(<PanelSection id="notes" label="Notes"><p>body text</p></PanelSection>)
    await user.click(screen.getByRole('button', { name: /collapse notes/i }))
    await user.click(screen.getByRole('button', { name: /expand notes/i }))
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('renders no preview element when none is given', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PanelSection id="links" label="Links"><p>body</p></PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: /collapse links/i }))
    expect(container.querySelector('[data-panel-preview]')).toBeNull()
  })

  it('renders trailing actions and they do not toggle the section', async () => {
    const user = userEvent.setup()
    render(
      <PanelSection id="notes" label="Notes" actions={<button>Widen</button>}>
        <p>body text</p>
      </PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Widen' }))
    expect(screen.getByText('body text')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/sections/PanelSection.test.tsx`
Expected: FAIL — cannot resolve `./PanelSection`.

- [ ] **Step 7: Implement `PanelSection`**

Create `src/components/surface/sections/PanelSection.tsx`:

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePanelCollapse } from '../hooks/usePanelCollapse'

export interface PanelSectionProps {
  /** Stable section TYPE id — collapse is remembered against this, not the entity. */
  id: string
  label: string
  /**
   * One line standing in for the body while collapsed. A section with content
   * must always say so: collapsing is "get this out of my way", never "hide
   * that this exists".
   */
  preview?: string
  /** Trailing controls (e.g. Notes' widen button). Never toggles the section. */
  actions?: ReactNode
  children: ReactNode
}

/**
 * The one titled block in the detail panel.
 *
 * Before this, every section hand-rolled its own label div — fifteen copies that
 * had already drifted (mb-1 vs mb-2, one at text-[11px], some with trailing
 * actions and some without), and none of which could be collapsed. Opening
 * Notes meant living with Notes.
 */
export function PanelSection({ id, label, preview, actions, children }: PanelSectionProps) {
  const [collapsed, toggle] = usePanelCollapse(id)
  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left group"
        >
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 group-hover:text-neutral-600 transition-colors">
            {label}
          </span>
          {collapsed && preview && (
            <span
              data-panel-preview
              className="min-w-0 flex-1 truncate text-[13px] text-neutral-400"
            >
              {preview}
            </span>
          )}
          <Chevron className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-300 group-hover:text-neutral-500 transition-colors" aria-hidden />
        </button>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
      {!collapsed && children}
    </section>
  )
}
```

- [ ] **Step 8: Run the `PanelSection` test and confirm it passes**

Run: `npx vitest run src/components/surface/sections/PanelSection.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 9: Implement `PanelRow`**

The chrome in `PanelLinks.tsx:38`, `PanelLinked.tsx:31`, and `PanelMightBeRelevant.tsx:24` is character-identical. Create `src/components/surface/sections/PanelRow.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface PanelRowProps {
  /** Leading badge — pass a ConceptIcon wrapped in the caller's tint. */
  icon: ReactNode
  onClick?: () => void
  /** When set, renders an external link instead of a button. */
  href?: string
  children: ReactNode
}

const ROW_CLASS =
  'flex items-start gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md ' +
  'bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50'

/** One tappable line inside a PanelSection — a link, a related entity, a suggestion. */
export function PanelRow({ icon, onClick, href, children }: PanelRowProps) {
  const body = (
    <>
      <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md text-sm">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={ROW_CLASS}>
      {body}
    </button>
  )
}
```

- [ ] **Step 10: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/components/surface/sections/PanelSection.tsx \
        src/components/surface/sections/PanelSection.test.tsx \
        src/components/surface/sections/PanelRow.tsx \
        src/components/surface/hooks/usePanelCollapse.ts \
        src/components/surface/hooks/usePanelCollapse.test.ts
git commit -m "feat(panel): add PanelSection, PanelRow and sticky collapse state"
```

---

### Task 2: `PanelShell` — one chrome, one zone order

**Files:**
- Create: `src/components/surface/PanelShell.tsx`
- Create: `src/components/surface/PanelShell.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface PanelShellProps {
    identity: React.ReactNode
    act?: React.ReactNode
    classify?: React.ReactNode
    details?: React.ReactNode
    related?: React.ReactNode
    footer?: React.ReactNode
    /** Forwarded to the <article> — TapContextPanel/TapEventPanel use it as the file drop zone. */
    innerRef?: React.Ref<HTMLElement>
    /** Rendered outside the divided flow (overlays, drawers). */
    children?: React.ReactNode
  }
  export function PanelShell(props: PanelShellProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/surface/PanelShell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelShell } from './PanelShell'

describe('PanelShell', () => {
  it('renders zones in the fixed order regardless of prop order', () => {
    const { container } = render(
      <PanelShell
        footer={<p>zone-footer</p>}
        identity={<p>zone-identity</p>}
        related={<p>zone-related</p>}
        act={<p>zone-act</p>}
        details={<p>zone-details</p>}
        classify={<p>zone-classify</p>}
      />,
    )
    const order = [...container.querySelectorAll('p')].map((n) => n.textContent)
    expect(order).toEqual([
      'zone-identity', 'zone-act', 'zone-classify',
      'zone-details', 'zone-related', 'zone-footer',
    ])
  })

  it('renders no wrapper for an omitted zone, so no ghost divider appears', () => {
    const { container } = render(<PanelShell identity={<p>only</p>} />)
    const article = container.querySelector('article')!
    expect(article.children).toHaveLength(1)
  })

  it('treats a zone rendering null as omitted', () => {
    const { container } = render(<PanelShell identity={<p>only</p>} act={null} details={undefined} />)
    expect(container.querySelector('article')!.children).toHaveLength(1)
  })

  it('renders children outside the divided flow', () => {
    render(<PanelShell identity={<p>id</p>}><div data-testid="overlay" /></PanelShell>)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/PanelShell.test.tsx`
Expected: FAIL — cannot resolve `./PanelShell`.

- [ ] **Step 3: Implement `PanelShell`**

Create `src/components/surface/PanelShell.tsx`:

```tsx
import type { ReactNode, Ref } from 'react'

export interface PanelShellProps {
  identity: ReactNode
  act?: ReactNode
  classify?: ReactNode
  details?: ReactNode
  related?: ReactNode
  footer?: ReactNode
  innerRef?: Ref<HTMLElement>
  children?: ReactNode
}

/**
 * The detail panel's chrome and zone order, in one place.
 *
 * Panels used to style themselves, and drifted into two languages: task and
 * event on hairline dividers with even padding, routine on p-5 and meal on p-6
 * with none. Same app, three rhythms. A panel now supplies zones; the order and
 * the spacing are not its business.
 *
 * A zone that renders nothing draws nothing — no empty wrapper, so `divide-y`
 * never lays down a hairline with nothing on either side of it.
 */
export function PanelShell({
  identity, act, classify, details, related, footer, innerRef, children,
}: PanelShellProps) {
  const zones: ReactNode[] = [identity, act, classify, details, related, footer]

  return (
    <article
      ref={innerRef}
      className="
        bg-bg-elevated max-w-md w-full
        rounded-2xl
        px-4 md:px-5 py-3 md:py-5
        divide-y divide-neutral-200/60
        [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
      "
    >
      {zones.map((zone, i) => (zone == null || zone === false ? null : <div key={i}>{zone}</div>))}
      {children}
    </article>
  )
}
```

Note: an empty React fragment still counts as a zone; panels must pass `undefined`, not `<></>`, for a zone they don't use.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/surface/PanelShell.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/components/surface/PanelShell.tsx src/components/surface/PanelShell.test.tsx
git commit -m "feat(panel): add PanelShell owning chrome and zone order"
```

---

### Task 3: `PanelNotes` replaces `PanelWhy`

Deletes both state machines: `editing` (click to edit, no exit) and the four-step `expand` cycle.

**Files:**
- Create: `src/components/surface/sections/PanelNotes.tsx`
- Create: `src/components/surface/sections/PanelNotes.test.tsx`
- Delete: `src/components/surface/sections/PanelWhy.tsx`
- Delete: `src/components/surface/sections/PanelWhy.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx:229`, `TapEventPanel.tsx:349`, `TapRoutinePanel.tsx:237`, `TapMealPanel.tsx:160`, `TapStepPanel.tsx:130`, `TapProjectPanel.tsx:71`, `TapContactPanel.tsx:83` — swap the import and tag name.

**Interfaces:**
- Consumes: `PanelSection` from Task 1.
- Produces:
  ```ts
  export interface PanelNotesProps {
    notes: string | undefined
    onChange?: (next: string) => void
    label?: string        // default 'Notes'
    id?: string           // default 'notes' — collapse key
    onSaveToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>
  }
  export function PanelNotes(props: PanelNotesProps): JSX.Element | null
  export function notesPreview(html: string | undefined): string | undefined
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/surface/sections/PanelNotes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelNotes, notesPreview } from './PanelNotes'

// The real editor is a lazy Tiptap chunk; stand in for it so these tests
// assert THIS component's behavior, not Tiptap's.
vi.mock('@/components/notes/TiptapEditor', () => ({
  TiptapEditor: ({ content }: { content: string }) => (
    <div data-testid="editor">{content}</div>
  ),
}))

describe('notesPreview', () => {
  it('strips tags and collapses whitespace', () => {
    expect(notesPreview('<p>Ask about  the 3pm</p>')).toBe('Ask about the 3pm')
  })
  it('truncates long text', () => {
    expect(notesPreview(`<p>${'a'.repeat(100)}</p>`)).toBe(`${'a'.repeat(60)}…`)
  })
  it('returns undefined for empty markup', () => {
    expect(notesPreview('<p></p>')).toBeUndefined()
    expect(notesPreview(undefined)).toBeUndefined()
  })
})

describe('PanelNotes', () => {
  beforeEach(() => localStorage.clear())

  it('shows the editor immediately — there is no click-to-edit mode', async () => {
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)
    expect(await screen.findByTestId('editor')).toBeInTheDocument()
  })

  it('opens and closes the wide overlay with one control', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /widen notes/i }))
    expect(screen.getByTestId('notes-overlay')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /narrow notes/i }))
    expect(screen.queryByTestId('notes-overlay')).not.toBeInTheDocument()
  })

  it('closes the wide overlay on Escape', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /widen notes/i }))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('notes-overlay')).not.toBeInTheDocument()
  })

  it('collapses to a preview and unmounts the editor', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>Ask about the 3pm</p>" onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /collapse notes/i }))

    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    expect(screen.getByText('Ask about the 3pm')).toBeInTheDocument()
  })

  it('honours a custom label and collapse id', () => {
    render(<PanelNotes notes="<p>x</p>" onChange={vi.fn()} label="What to bring" id="what-to-bring" />)
    expect(screen.getByText('What to bring')).toBeInTheDocument()
  })

  it('renders nothing when there is no content and no way to add any', () => {
    const { container } = render(<PanelNotes notes={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/sections/PanelNotes.test.tsx`
Expected: FAIL — cannot resolve `./PanelNotes`.

- [ ] **Step 3: Implement `PanelNotes`**

Create `src/components/surface/sections/PanelNotes.tsx`:

```tsx
import { useEffect, useState, lazy, Suspense } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { PanelSection } from './PanelSection'

const TiptapEditor = lazy(() =>
  import('@/components/notes/TiptapEditor').then((m) => ({ default: m.TiptapEditor })),
)

/** The right panel is 380px; the wide overlay doubles it, clamped to the viewport. */
const PANEL_W = 380

export interface PanelNotesProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default heading (event: "What to bring", step: "Instructions"). */
  label?: string
  /** Collapse key. Defaults to 'notes' so every panel's Notes shares one preference. */
  id?: string
  onSaveToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>
}

/** One line of plain text standing in for the note while the section is collapsed. */
export function notesPreview(html: string | undefined): string | undefined {
  const text = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/**
 * Notes, with exactly two reversible controls.
 *
 * The predecessor (PanelWhy) ran two state machines at once: `editing`, entered
 * by clicking the note and impossible to leave, and `expand`, a four-step cycle
 * you had to ride all the way around to get small again. Both are gone. The
 * editor is always live, so there is no mode to be trapped in, and width is one
 * boolean that Escape also clears.
 *
 * Because the editor lives inside PanelSection's body, collapsing the section
 * unmounts it — a collapsed Notes never pulls the Tiptap chunk at all.
 */
export function PanelNotes({ notes, onChange, label = 'Notes', id = 'notes', onSaveToVault }: PanelNotesProps) {
  const [wide, setWide] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!wide) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWide(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wide])

  if (!notes && !onChange) return null

  const hasContent = !!(notes || '').replace(/<[^>]*>/g, '').trim()

  const handleSaveToVault = async () => {
    if (!hasContent || !onSaveToVault) return
    setVaultStatus('saving')
    const res = await onSaveToVault(notes || '')
    setVaultStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setVaultStatus('idle'), 4000)
  }

  const saveButton = onSaveToVault && hasContent && (
    <button
      type="button"
      onClick={handleSaveToVault}
      disabled={vaultStatus === 'saving'}
      className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-primary-600 disabled:opacity-40 transition-colors"
      title="Save these notes as a permanent note in your vault, linked to this task"
    >
      {vaultStatus === 'saved' ? 'Saved to vault'
        : vaultStatus === 'saving' ? 'Saving…'
        : vaultStatus === 'error' ? 'Retry save'
        : 'Save to vault'}
    </button>
  )

  const widenButton = onChange && (
    <button
      type="button"
      onClick={() => setWide((w) => !w)}
      aria-label={wide ? `Narrow ${label}` : `Widen ${label}`}
      title={wide ? 'Back into the panel' : 'Give the note room'}
      className="text-neutral-400 hover:text-primary-600 transition-colors"
    >
      {wide ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>
  )

  const editor = onChange ? (
    <Suspense fallback={null}>
      <TiptapEditor content={notes ?? ''} onChange={onChange} placeholder="Add notes…" />
    </Suspense>
  ) : (
    <div className="text-sm text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1 prose-sm"
         dangerouslySetInnerHTML={{ __html: notes ?? '' }} />
  )

  return (
    <>
      <PanelSection
        id={id}
        label={label}
        preview={notesPreview(notes)}
        actions={<>{saveButton}{widenButton}</>}
      >
        {wide
          ? <div className="text-sm italic text-neutral-400 border-l-2 border-neutral-300 pl-3 py-1">Editing — widened</div>
          : <div className="rounded-md border border-neutral-200 bg-white p-2">{editor}</div>}
      </PanelSection>

      {wide && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setWide(false)} aria-hidden />
          <div
            data-testid="notes-overlay"
            className="fixed top-0 bottom-0 right-0 z-40 bg-bg-elevated border-l border-neutral-200/80 shadow-2xl flex flex-col"
            style={{ width: Math.min(PANEL_W * 2, typeof window !== 'undefined' ? window.innerWidth - 40 : PANEL_W * 2) }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/70">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">{label}</div>
              <div className="flex items-center gap-3">{saveButton}{widenButton}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">{editor}</div>
          </div>
        </>
      )}
    </>
  )
}
```

Note: the overlay's click-catcher sits at `z-40` **behind** the overlay itself, which is why the overlay is declared after it and both share the layer.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/surface/sections/PanelNotes.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Swap every call site and delete `PanelWhy`**

In each of `TapContextPanel.tsx`, `TapEventPanel.tsx`, `TapRoutinePanel.tsx`, `TapMealPanel.tsx`, `TapStepPanel.tsx`, `TapProjectPanel.tsx`, `TapContactPanel.tsx`: change the import from
`import { PanelWhy } from './sections/PanelWhy'` to `import { PanelNotes } from './sections/PanelNotes'`
and rename the tag `<PanelWhy` → `<PanelNotes`.

Two call sites also need an `id` so their collapse preference doesn't share the task Notes key:
- `TapEventPanel.tsx` (label `"What to bring"`) → add `id="what-to-bring"`
- `TapStepPanel.tsx` (label `"Instructions"`) → add `id="instructions"`

`TapProjectPanel`/`TapContactPanel` pass `label="Why"`; give them `id="why"`.

Then:

```bash
git rm src/components/surface/sections/PanelWhy.tsx src/components/surface/sections/PanelWhy.test.tsx
```

- [ ] **Step 6: Verify nothing still references `PanelWhy`**

Run: `grep -rn "PanelWhy" src/`
Expected: no output.

- [ ] **Step 7: Run the full surface suite and type-check**

```bash
npx vitest run src/components/surface
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS. Any panel test asserting the old click-to-edit behavior must be updated to assert the editor is present immediately — that behavior change is the point of the task, not a regression.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/surface
git commit -m "feat(panel): replace PanelWhy with PanelNotes — always-live editor, one width toggle"
```

---

### Task 4: Convert every remaining section to `PanelSection` / `PanelRow`

Mechanical, but it is what makes the panel read as one surface.

**Files (all Modify):**
- `src/components/surface/sections/PanelReach.tsx:77` — labels Phone/Email; `id={kind}`
- `src/components/surface/sections/PanelLocation.tsx:35` — `id="location"`
- `src/components/surface/sections/PanelLinks.tsx:30` — `id="links"`, rows → `PanelRow`
- `src/components/surface/sections/PanelLinked.tsx:27` — `id="linked"`, rows → `PanelRow`
- `src/components/surface/sections/PanelMightBeRelevant.tsx:22` — `id="might-be-relevant"`, rows → `PanelRow`
- `src/components/surface/sections/PanelSubtasks.tsx:94` — `id="subtasks"`
- `src/components/surface/sections/PanelPeople.tsx:42` — `id="people"`
- `src/components/surface/sections/PanelPhotos.tsx:234` — `id="photos"`
- `src/components/surface/sections/PanelConversations.tsx:56` — `id="conversations"`
- Test: the existing `*.test.tsx` beside each file.

**Interfaces:**
- Consumes: `PanelSection`, `PanelRow` from Task 1.
- Produces: no new exports; every section's props are unchanged.

- [ ] **Step 1: Convert one section and confirm the pattern**

In `PanelLinks.tsx`, replace the `<section>` wrapper and label div:

```tsx
// before
<section>
  <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Links</div>
  …
</section>

// after
<PanelSection id="links" label="Links" preview={list.length ? `${list.length} link${list.length === 1 ? '' : 's'}` : undefined}>
  …
</PanelSection>
```

and each `<a>` row with `PanelRow`:

```tsx
<PanelRow key={link.url} href={link.url} icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100"><ConceptIcon name="attachment" decorative /></span>}>
  <span className="block text-sm text-neutral-800 truncate">{link.title || hostname(link.url)}</span>
</PanelRow>
```

- [ ] **Step 2: Run that section's test**

Run: `npx vitest run src/components/surface/sections/PanelLinks.test.tsx`
Expected: PASS. If a test queried the label via a bare text match it still passes — the label text is unchanged.

- [ ] **Step 3: Convert the remaining eight sections the same way**

Preview strings, one per section — each must state what is there without revealing it:

| Section | `id` | `preview` |
|---|---|---|
| PanelReach (phone) | `phone` | the number |
| PanelReach (email) | `email` | the address |
| PanelLocation | `location` | the location string |
| PanelLinked | `linked` | `"{project name}"` or `"{n} linked"` |
| PanelMightBeRelevant | `might-be-relevant` | `"{n} suggestion(s)"` |
| PanelSubtasks | `subtasks` | `"{done}/{total} done"` |
| PanelPeople | `people` | the contact's name |
| PanelPhotos | `photos` | `"{n} file(s)"` |
| PanelConversations | `conversations` | `"{n} message(s)"` |

- [ ] **Step 4: Confirm no hand-rolled label survives**

Run: `grep -rn 'uppercase tracking-wider font-semibold text-neutral-400' src/components/surface/sections/`
Expected: matches only in `PanelSection.tsx` and `PanelNotes.tsx` (the vault button and the overlay header).

- [ ] **Step 5: Run the whole surface suite and type-check**

```bash
npx vitest run src/components/surface
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/surface/sections
git commit -m "refactor(panel): move every section onto PanelSection and PanelRow"
```

---

### Task 5: `PanelActions` renders descriptors

**Files:**
- Modify: `src/components/surface/sections/PanelActions.tsx` (full rewrite)
- Modify: `src/components/surface/sections/PanelActions.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface PanelAction {
    id: string
    label: string
    icon?: import('@/lib/conceptIcons').ConceptName
    kind?: 'primary' | 'default' | 'flagged'
    href?: string
    onClick?: () => void
    render?: () => React.ReactNode
  }
  export interface PanelActionsProps {
    actions: PanelAction[]
    overflow?: React.ReactNode   // the PanelMoreMenu element, always last
  }
  export function PanelActions(props: PanelActionsProps): JSX.Element
  export const ACTION_CHIP = '…'          // shared chip class string
  export const MAX_VISIBLE_ACTIONS = 5
  ```

- [ ] **Step 1: Write the failing test**

Replace `src/components/surface/sections/PanelActions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelActions, MAX_VISIBLE_ACTIONS, type PanelAction } from './PanelActions'

const act = (id: string, over: Partial<PanelAction> = {}): PanelAction =>
  ({ id, label: id, onClick: vi.fn(), ...over })

describe('PanelActions', () => {
  it('renders actions in the given order', () => {
    render(<PanelActions actions={[act('Complete'), act('Call'), act('Schedule')]} />)
    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Complete', 'Call', 'Schedule'])
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<PanelActions actions={[act('Complete', { onClick })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders an href action as a link', () => {
    render(<PanelActions actions={[act('Call', { href: 'tel:5551234' })]} />)
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:5551234')
  })

  it('delegates a render action to its own node', () => {
    render(<PanelActions actions={[act('Schedule', { render: () => <button>Custom</button> })]} />)
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it(`folds actions past ${MAX_VISIBLE_ACTIONS} into an overflow menu`, async () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => act(id))
    render(<PanelActions actions={many} />)

    expect(screen.getByRole('button', { name: 'e' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'f' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('button', { name: 'f' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'g' })).toBeInTheDocument()
  })

  it('renders the supplied overflow node last', () => {
    render(<PanelActions actions={[act('Complete')]} overflow={<button>More</button>} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toHaveTextContent('More')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/sections/PanelActions.test.tsx`
Expected: FAIL — `PanelActions` does not export `MAX_VISIBLE_ACTIONS` and takes different props.

- [ ] **Step 3: Rewrite `PanelActions`**

Replace `src/components/surface/sections/PanelActions.tsx`:

```tsx
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'

export interface PanelAction {
  id: string
  label: string
  icon?: ConceptName
  /** primary = the outlined Complete pill; flagged = the amber "To discuss" state. */
  kind?: 'primary' | 'default' | 'flagged'
  href?: string
  onClick?: () => void
  /** Owns its own popover (schedule, duration). Rendered verbatim. */
  render?: () => ReactNode
}

export interface PanelActionsProps {
  actions: PanelAction[]
  /** The panel's more-menu. Always rendered last, never counted against the cap. */
  overflow?: ReactNode
}

const BASE = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
export const ACTION_CHIP = `${BASE} bg-neutral-100 text-neutral-700 hover:bg-neutral-200`
const PRIMARY_CHIP = `${BASE} border border-primary-600 text-primary-700 hover:bg-primary-50`
const FLAGGED_CHIP = `${BASE} bg-amber-100 text-amber-800 hover:bg-amber-200`

/**
 * Actions past this point fold into the overflow menu rather than wrapping onto
 * a second row. Six chips wrapping mid-row is what made the panel read as a
 * scatter of unrelated buttons.
 */
export const MAX_VISIBLE_ACTIONS = 5

function chipClass(kind: PanelAction['kind']): string {
  if (kind === 'primary') return PRIMARY_CHIP
  if (kind === 'flagged') return FLAGGED_CHIP
  return ACTION_CHIP
}

function Chip({ action }: { action: PanelAction }) {
  if (action.render) return <>{action.render()}</>
  const body = <>{action.icon && <ConceptIcon name={action.icon} decorative />}{action.label}</>
  if (action.href) {
    return <a href={action.href} className={chipClass(action.kind)}>{body}</a>
  }
  return (
    <button type="button" onClick={action.onClick} className={chipClass(action.kind)}>
      {body}
    </button>
  )
}

/**
 * The panel's action row, rendered from descriptors.
 *
 * Every panel used to build its own: the task panel a flat flex-wrap, the event
 * panel a hand-assembled block with its own chip classes. Same buttons, three
 * spellings. Panels now say what the actions ARE; this decides how they look and
 * where they stop.
 */
export function PanelActions({ actions, overflow }: PanelActionsProps) {
  const visible = actions.slice(0, MAX_VISIBLE_ACTIONS)
  const folded = actions.slice(MAX_VISIBLE_ACTIONS)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((a) => <Chip key={a.id} action={a} />)}

      {folded.length > 0 && (
        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={ACTION_CHIP}
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden />
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-20 min-w-[10rem] rounded-xl border border-neutral-100 bg-white py-1 shadow-lg">
              {folded.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setOpen(false); a.onClick?.() }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {a.icon && <ConceptIcon name={a.icon} decorative />}{a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {overflow}
    </div>
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/surface/sections/PanelActions.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

`TapContextPanel` will not type-check until Task 6 rewires it — commit the primitive alone and fix the caller next.

```bash
git add src/components/surface/sections/PanelActions.tsx src/components/surface/sections/PanelActions.test.tsx
git commit -m "refactor(panel): make PanelActions a descriptor renderer with an overflow cap"
```

---

### Task 6: Convert `TapContextPanel` to `PanelShell`

**Files:**
- Modify: `src/components/surface/TapContextPanel.tsx:154-292`
- Test: `src/components/surface/TapContextPanel.test.tsx`

**Interfaces:**
- Consumes: `PanelShell` (Task 2), `PanelActions` + `PanelAction` (Task 5), `PanelNotes` (Task 3).
- Produces: `TapContextPanelProps` unchanged — the host needs no edits.

- [ ] **Step 1: Build the action descriptor list**

Inside `TapContextPanel`, above the return, replacing the old `<PanelActions .../>` prop soup:

```tsx
const phone = task.phoneNumber || linked.contact?.phone || linked.project?.phoneNumber

const actions: PanelAction[] = [
  {
    id: 'complete',
    label: task.completed ? 'Completed' : 'Complete',
    kind: 'primary',
    onClick: props.onToggleComplete,
  },
  ...(phone ? [{ id: 'call', label: phone, icon: 'call' as const, href: `tel:${phone}` }] : []),
  ...(task.location ? [{ id: 'directions', label: 'Directions', icon: 'location' as const, onClick: () => setShowDirections((v) => !v) }] : []),
  {
    id: 'schedule',
    label: 'Schedule',
    render: () => (
      <SchedulePicker
        scheduledFor={task.scheduledFor || undefined}
        onReschedule={props.onReschedule}
        onSchedule={props.onSchedule}
        onClearSchedule={props.onClearSchedule}
        loads={dayLoads}
      />
    ),
  },
  ...(props.onAssistMutate ? [{ id: 'assist', label: 'Help me plan', icon: 'ai' as const, onClick: () => setAssistOpen(true) }] : []),
]
```

`SchedulePicker` and `dayLoads` arrive in Tasks 11–12. Until then, keep the existing `RescheduleGrid` popover markup inside the `render` thunk so the panel stays working between commits.

- [ ] **Step 2: Rewrite the return using `PanelShell`**

```tsx
return (
  <PanelShell
    innerRef={panelRef}
    identity={
      <>
        <PanelHeader title={task.title} onTitleChange={props.onTitleChange} onClose={props.onClose} />
        {props.whyChain}
      </>
    }
    act={
      <>
        <PanelActions
          actions={actions}
          overflow={
            <PanelMoreMenu
              isPinned={props.isPinned}
              onTogglePin={props.onTogglePin}
              onDelete={props.onDelete}
              onUngroup={(task.subtasks?.length ?? 0) > 0 ? props.onUngroup : undefined}
              onDeleteGroup={(task.subtasks?.length ?? 0) > 0 ? props.onDeleteGroup : undefined}
            />
          }
        />
        <PanelAssistant taskId={task.id} />
      </>
    }
    classify={
      <PanelClassify
        context={task.context}
        onContextChange={props.onContextChange}
        scope={task.scope}
        onScopeChange={props.onScopeChange}
        members={props.familyMembers}
        selectedAssigneeIds={task.assignedToAll ?? (task.assignedTo ? [task.assignedTo] : [])}
        onAssigneesChange={props.onAssigneesChange}
      />
    }
    details={
      <>
        {show('phone') && <PanelReach kind="phone" value={task.phoneNumber} onChange={props.onPhoneChange} autoFocus={revealed.has('phone')} asLink={false} />}
        {show('email') && <PanelReach kind="email" value={task.email} onChange={props.onEmailChange} autoFocus={revealed.has('email')} />}
        {show('location') && <PanelLocation location={task.location} locationPlaceId={task.locationPlaceId} title={task.title} showDirections={showDirections} onUpdateLocation={props.onUpdateLocation} onClearLocation={props.onClearLocation} directions={task.directions} onDirectionsChange={props.onDirectionsChange} />}
        {show('notes') && <PanelNotes key={task.id} notes={task.notes} onChange={props.onNotesChange} onSaveToVault={props.onSaveNoteToVault} />}
        <PanelPhotos hideWhenEmpty={!revealed.has('photo')} onContentChange={setPhotosHaveContent} entityType="task" entityId={task.id} dropZoneRef={panelRef} entityContext={[task.title, task.notes?.split('\n')[0]].filter(Boolean).join(' — ')} promotions={{ onAddPrepTask: props.onAddSubtask, onAddLink: props.onAddLink, onUseLocation: (address) => props.onUpdateLocation(address) }} />
        <PanelConversations taskId={task.id} />
        {show('subtask') && <PanelSubtasks subtasks={task.subtasks ?? []} onToggleSubtask={props.onToggleSubtask} onAddSubtask={props.onAddSubtask} onOpenSubtask={props.onOpenTask} onRemoveSubtask={props.onRemoveSubtask} onRescheduleSubtask={props.onRescheduleSubtask} onScheduleSubtask={props.onScheduleSubtask} />}
        {show('person') && <PanelPeople contact={linked.contact} onOpenContact={props.onOpenContact} contacts={props.contacts} onContactChange={props.onContactChange} onSearchContacts={props.onSearchContacts} onAddContact={props.onAddContact} />}
        {show('link') && <PanelLinks links={task.links} onAddLink={props.onAddLink} />}
        <PanelAddRow fields={addable} onReveal={reveal} />
      </>
    }
    related={
      <>
        <PanelLinked project={linked.project} linkedEvent={linked.linkedEvent} siblingTasks={linked.siblingTasks} onOpenProject={props.onOpenProject} onOpenEvent={props.onOpenEvent} onOpenTask={props.onOpenTask} />
        <PanelMightBeRelevant items={mightBeRelevant} onOpen={props.onOpenRelated} />
      </>
    }
    footer={<PanelFooter createdAt={task.createdAt} updatedAt={task.updatedAt} createdByName={createdByName} />}
  >
    {assistOpen && (
      <AssistDrawer
        item={{ id: task.id, title: task.title, notes: task.notes ?? null, projectName: linked.project?.name ?? null }}
        onClose={() => setAssistOpen(false)}
        onMutate={props.onAssistMutate}
      />
    )}
  </PanelShell>
)
```

`PanelAddRow` moves into `details` — it is the tail of the details list, not its own zone.

- [ ] **Step 3: Run the task-panel tests and type-check**

```bash
npx vitest run src/components/surface/TapContextPanel.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/surface/TapContextPanel.tsx
git commit -m "refactor(panel): move the task panel onto PanelShell"
```

---

### Task 7: Convert `TapEventPanel` to `PanelShell` + `PanelActions`

The event panel hand-builds its chip row at `TapEventPanel.tsx:235-330`. That block becomes descriptors.

**Files:**
- Modify: `src/components/surface/TapEventPanel.tsx:170-433`
- Test: `src/components/surface/TapEventPanel.test.tsx`

**Interfaces:**
- Consumes: `PanelShell`, `PanelActions`, `PanelAction`, `PanelNotes`.
- Produces: `TapEventPanelProps` unchanged.

- [ ] **Step 1: Build the descriptor list**

```tsx
const actions: PanelAction[] = [
  ...(props.onToggleComplete ? [{
    id: 'complete',
    label: props.completed ? 'Completed' : 'Complete',
    kind: 'primary' as const,
    onClick: props.onToggleComplete,
  }] : []),
  ...(event.location && joinUrl ? [{ id: 'join', label: 'Join meeting', icon: 'video' as const, href: joinUrl }] : []),
  ...(event.location && isPhysicalLocation ? [{ id: 'directions', label: 'Directions', icon: 'location' as const, onClick: () => setShowDirections((v) => !v) }] : []),
  ...(canEdit && props.onReschedule ? [{
    id: 'reschedule',
    label: 'Reschedule',
    render: () => (
      <SchedulePicker
        scheduledFor={startTime ? new Date(startTime) : undefined}
        onSchedule={(date, isAllDay) => handleReschedule(date, isAllDay)}
        loads={dayLoads}
        label="Reschedule"
      />
    ),
  }] : []),
  ...(canEdit && props.onReschedule && durationMinutes ? [{
    id: 'duration',
    label: formatDuration(durationMinutes),
    render: () => durationMenu,
  }] : []),
  ...(props.onToggleDiscussion ? [{
    id: 'discuss',
    label: discussionFlagged ? 'To discuss' : 'Discuss',
    kind: discussionFlagged ? ('flagged' as const) : ('default' as const),
    onClick: () => props.onToggleDiscussion?.(!discussionFlagged),
  }] : []),
]
```

Keep the existing duration-menu JSX, extracted verbatim into a `durationMenu` const above the return. Same for the virtual-meeting label chip, which stays inline in `identity` — it is a fact about the event, not an action.

- [ ] **Step 2: Rewrite the return using `PanelShell`**

`identity` takes the existing `<header>` contents minus the chip row: `PanelHeader`, the when-line (`TapEventPanel.tsx:187-201`), and the calendar row (`:204-233`). `act` takes `<PanelActions actions={actions} />`. `details` takes `PanelLocation`, `PanelNotes` (label `"What to bring"`, `id="what-to-bring"`), the For-discussion section, `PanelPhotos`, `PanelLinks`. `related` takes `PanelMightBeRelevant`. `footer` takes `PanelFooter`.

The event panel has no `classify` zone — pass nothing.

- [ ] **Step 3: Run the tests and type-check**

```bash
npx vitest run src/components/surface/TapEventPanel.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/surface/TapEventPanel.tsx
git commit -m "refactor(panel): move the event panel onto PanelShell and shared actions"
```

---

### Task 8: Convert `TapRoutinePanel` and `TapMealPanel` to `PanelShell`

These are the two on the odd `p-5`/`p-6` shell.

**Files:**
- Modify: `src/components/surface/TapRoutinePanel.tsx:90-343`
- Modify: `src/components/surface/TapMealPanel.tsx:70-185`
- Test: the existing test files beside each.

**Interfaces:**
- Consumes: `PanelShell`, `PanelNotes`.
- Produces: both components' props unchanged.

- [ ] **Step 1: Convert `TapRoutinePanel`**

Replace `<article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">` with `PanelShell`:
- `identity`: `PanelHeader`
- `act`: the assignee/context/assist/streak row (`:97-125`)
- `classify`: the Active/Resting block
- `details`: recurrence controls, `PanelLocation`, `PanelNotes` (`id="notes"`), `PanelAttachments`, `ExtractSteps`, the steps list, and the Save & close button
- `footer`: `PanelFooter`
- children: `AssistDrawer`

Delete the bespoke `<section className="pb-4 mb-4 border-b border-neutral-200 …">` wrappers — `PanelShell`'s `divide-y` now owns separation, and leaving them produces doubled rules.

- [ ] **Step 2: Convert `TapMealPanel`**

Replace `<article className="bg-bg-elevated rounded-2xl p-6 max-w-md w-full">` with `PanelShell`:
- `identity`: the meal header block
- `details`: `PanelNotes`, `PanelWhatToBring`, `PanelIngredients`, `PanelSteps`, `PanelLinks`
- `footer`: `PanelFooter`

- [ ] **Step 3: Confirm no bespoke panel chrome survives**

Run: `grep -rn 'rounded-2xl p-5\|rounded-2xl p-6' src/components/surface/`
Expected: matches only in the two unwired panels (`TapProjectPanel`, `TapContactPanel`) and `TapStepPanel`, which are out of scope.

- [ ] **Step 4: Run the tests and type-check**

```bash
npx vitest run src/components/surface
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/TapRoutinePanel.tsx src/components/surface/TapMealPanel.tsx
git commit -m "refactor(panel): move routine and meal panels onto PanelShell"
```

---

### Task 9: `computeDayLoad` — the pure fullness calculation

**Files:**
- Create: `src/lib/today/dayLoad.ts`
- Create: `src/lib/today/dayLoad.test.ts`

**Interfaces:**
- Consumes: `selectTimed` from `@/lib/today/taskPools`, `countRoutineUnits` from `@/lib/today/routineCollections`, `buildRoutineStatusMap` + `selectVisibleRoutines` from `@/lib/today/statusMaps`, `makeAssigneeFilter` from `@/lib/today/assigneeFilter`.
- Produces:
  ```ts
  export const DAY_WINDOW = { startHour: 8, endHour: 21 } as const
  export const EVENING_WINDOW = { startHour: 17, endHour: 21 } as const
  export const UNTIMED_TASK_MINUTES = 30
  export const MIN_OPEN_SLOT_MINUTES = 30

  export interface DayLoadItem {
    id: string
    title: string
    start: Date | null      // null = all-day
    end: Date | null
    kind: 'event' | 'task'
  }
  export interface DayLoad {
    date: Date
    bookedMinutes: number
    windowMinutes: number
    timedCount: number
    allDayCount: number
    items: DayLoadItem[]
    openSlots: { start: Date; end: Date }[]
    eventsAvailable: boolean
  }
  export interface DayLoadInput {
    tasks: Task[]
    events: CalendarEvent[]
    routines: Routine[]
    dateInstances: ActionableInstance[]
    eventsAvailable: boolean
    window?: { startHour: number; endHour: number }
  }
  export function computeDayLoad(date: Date, input: DayLoadInput): DayLoad
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/dayLoad.test.ts`. **Fixtures use raw column values** — ISO strings for event times, exactly as the edge function returns them:

```ts
import { describe, it, expect } from 'vitest'
import { computeDayLoad, DAY_WINDOW, EVENING_WINDOW, UNTIMED_TASK_MINUTES } from './dayLoad'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const DAY = new Date(2026, 7, 6) // Thu Aug 6 2026, local

// Raw shape: the edge function returns snake_case ISO strings, never Date objects.
const event = (id: string, startISO: string, endISO: string, title = id): CalendarEvent =>
  ({ id, title, start_time: startISO, end_time: endISO }) as CalendarEvent

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id, title: id, completed: false, bucket: 'timed',
    scheduledFor: new Date(2026, 7, 6, 10, 0), isAllDay: false,
    createdAt: new Date(2026, 7, 1), updatedAt: new Date(2026, 7, 1),
    ...over,
  }) as Task

const base = { tasks: [], events: [], routines: [], dateInstances: [], eventsAvailable: true }

describe('computeDayLoad', () => {
  it('reports an empty day', () => {
    const load = computeDayLoad(DAY, base)
    expect(load.bookedMinutes).toBe(0)
    expect(load.allDayCount).toBe(0)
    expect(load.windowMinutes).toBe((DAY_WINDOW.endHour - DAY_WINDOW.startHour) * 60)
  })

  it('books a timed event by its duration', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T09:00:00', '2026-08-06T10:30:00')],
    })
    expect(load.bookedMinutes).toBe(90)
    expect(load.timedCount).toBe(1)
  })

  it('ignores events on other days', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-07T09:00:00', '2026-08-07T10:00:00')],
    })
    expect(load.bookedMinutes).toBe(0)
  })

  it('clips an event to the window', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T06:00:00', '2026-08-06T09:00:00')],
    })
    expect(load.bookedMinutes).toBe(60) // only 08:00–09:00 falls inside
  })

  it(`gives an untimed timed-bucket task ${UNTIMED_TASK_MINUTES} minutes`, () => {
    const load = computeDayLoad(DAY, { ...base, tasks: [task('t1')] })
    expect(load.bookedMinutes).toBe(UNTIMED_TASK_MINUTES)
  })

  it('counts an all-day task without booking time', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      tasks: [task('t1', { isAllDay: true, scheduledFor: new Date(2026, 7, 6) })],
    })
    expect(load.allDayCount).toBe(1)
    expect(load.bookedMinutes).toBe(0)
  })

  it('dedupes the same meeting synced to two calendars', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('a', '2026-08-06T13:00:00Z', '2026-08-06T14:00:00Z', 'Standup'),
        event('b', '2026-08-06T13:00:00Z', '2026-08-06T14:00:00Z', 'Standup'),
      ],
    })
    expect(load.timedCount).toBe(1)
  })

  it('finds the gap between two events', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('e1', '2026-08-06T09:00:00', '2026-08-06T10:00:00'),
        event('e2', '2026-08-06T14:00:00', '2026-08-06T15:00:00'),
      ],
    })
    const gap = load.openSlots.find((s) => s.start.getHours() === 10)
    expect(gap).toBeDefined()
    expect(gap!.end.getHours()).toBe(14)
  })

  it('drops gaps shorter than the minimum', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('e1', '2026-08-06T09:00:00', '2026-08-06T10:00:00'),
        event('e2', '2026-08-06T10:15:00', '2026-08-06T11:00:00'),
      ],
    })
    expect(load.openSlots.some((s) => s.start.getHours() === 10 && s.start.getMinutes() === 0)).toBe(false)
  })

  it('scopes to the evening window when asked', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T09:00:00', '2026-08-06T11:00:00')],
      window: EVENING_WINDOW,
    })
    expect(load.bookedMinutes).toBe(0) // the morning meeting is outside the evening
    expect(load.windowMinutes).toBe((EVENING_WINDOW.endHour - EVENING_WINDOW.startHour) * 60)
  })

  it('reports when event data is missing rather than under-counting silently', () => {
    const load = computeDayLoad(DAY, { ...base, eventsAvailable: false })
    expect(load.eventsAvailable).toBe(false)
  })

  it('never books more than the window', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T00:00:00', '2026-08-06T23:59:00')],
    })
    expect(load.bookedMinutes).toBeLessThanOrEqual(load.windowMinutes)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/today/dayLoad.test.ts`
Expected: FAIL — cannot resolve `./dayLoad`.

- [ ] **Step 3: Implement `computeDayLoad`**

Create `src/lib/today/dayLoad.ts`:

```ts
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { selectTimed } from './taskPools'
import { countRoutineUnits } from './routineCollections'
import { buildRoutineStatusMap, selectVisibleRoutines } from './statusMaps'
import { makeAssigneeFilter } from './assigneeFilter'

/** The waking window a fullness bar measures against. Matches Today's day-part
 *  bands (Early morning < 8:00, Morning 8:00–12:00, Evening 17:00–21:00). */
export const DAY_WINDOW = { startHour: 8, endHour: 21 } as const
/** "Tonight" is the evening band only — a packed morning must not make tonight
 *  look full. */
export const EVENING_WINDOW = { startHour: 17, endHour: 21 } as const
/** A timed task carries no duration on the row, so it books a nominal block. */
export const UNTIMED_TASK_MINUTES = 30
/** Shorter than this isn't a slot you can put anything in. */
export const MIN_OPEN_SLOT_MINUTES = 30

export interface DayLoadItem {
  id: string
  title: string
  start: Date | null
  end: Date | null
  kind: 'event' | 'task'
}

export interface DayLoad {
  date: Date
  bookedMinutes: number
  windowMinutes: number
  timedCount: number
  allDayCount: number
  items: DayLoadItem[]
  openSlots: { start: Date; end: Date }[]
  /** False when the calendar range couldn't be fetched — the caller must say so
   *  rather than render a bar that quietly omits every meeting. */
  eventsAvailable: boolean
}

export interface DayLoadInput {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  eventsAvailable: boolean
  window?: { startHour: number; endHour: number }
}

function startOf(date: Date, hour: number): Date {
  const d = new Date(date)
  d.setHours(hour, 0, 0, 0)
  return d
}

function eventTimes(e: CalendarEvent): { start: string | undefined; end: string | undefined; allDay: boolean } {
  return {
    start: e.start_time ?? e.startTime,
    end: e.end_time ?? e.endTime,
    allDay: e.all_day ?? e.allDay ?? false,
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * How full a day already is.
 *
 * Reuses the selectors computeTodayData uses — selectTimed, the same
 * instant-keyed event dedupe, countRoutineUnits — and skips only the grouping.
 * That sharing is load-bearing: a flat routine count double-counts collection
 * steps, invents rows for steps whose parent isn't on the day, and misses a
 * dosed routine's extra slots, so a bar built on one would report on a day that
 * isn't there.
 *
 * It departs from Today in exactly one way, on purpose: there is NO assignee
 * filter. You are asking whether a DAY has room, and a day is shared — filtering
 * to your own items would call a Thursday open when someone else has three
 * appointments on it.
 */
export function computeDayLoad(date: Date, input: DayLoadInput): DayLoad {
  const win = input.window ?? DAY_WINDOW
  const windowStart = startOf(date, win.startHour)
  const windowEnd = startOf(date, win.endHour)
  const windowMinutes = (win.endHour - win.startHour) * 60
  const matchAll = makeAssigneeFilter(null) // everyone — see the doc comment above

  // Events on this day, deduped by title+instant (the same meeting synced to two
  // calendars reports identical times in different string forms).
  const seen = new Set<string>()
  const dayEvents: DayLoadItem[] = []
  for (const e of input.events) {
    const { start, end, allDay } = eventTimes(e)
    if (!start) continue
    const s = new Date(start)
    if (!sameDay(s, date)) continue
    const key = `${e.title}|${s.getTime()}`
    if (seen.has(key)) continue
    seen.add(key)
    dayEvents.push({
      id: e.id,
      title: e.title,
      start: allDay ? null : s,
      end: allDay ? null : end ? new Date(end) : new Date(s.getTime() + 60 * 60_000),
      kind: 'event',
    })
  }

  const dayTasks = selectTimed(input.tasks, date, matchAll)
  const taskItems: DayLoadItem[] = dayTasks.map((t) => {
    const s = t.isAllDay || !t.scheduledFor ? null : new Date(t.scheduledFor)
    return {
      id: t.id,
      title: t.title,
      start: s,
      end: s ? new Date(s.getTime() + UNTIMED_TASK_MINUTES * 60_000) : null,
      kind: 'task',
    }
  })

  const items = [...dayEvents, ...taskItems].sort((a, b) => {
    if (!a.start) return -1
    if (!b.start) return 1
    return a.start.getTime() - b.start.getTime()
  })

  const timed = items.filter((i): i is DayLoadItem & { start: Date; end: Date } => i.start !== null && i.end !== null)

  // Booked minutes = union of the timed blocks clipped to the window, so
  // overlapping meetings don't double-count the same hour.
  const clipped = timed
    .map((i) => ({
      start: Math.max(i.start.getTime(), windowStart.getTime()),
      end: Math.min(i.end.getTime(), windowEnd.getTime()),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  let bookedMs = 0
  let cursor = 0
  for (const b of clipped) {
    const from = Math.max(b.start, cursor)
    if (b.end > from) {
      bookedMs += b.end - from
      cursor = b.end
    }
  }

  // Open slots = the window's gaps between merged blocks.
  const openSlots: { start: Date; end: Date }[] = []
  let gapFrom = windowStart.getTime()
  for (const b of clipped) {
    if (b.start - gapFrom >= MIN_OPEN_SLOT_MINUTES * 60_000) {
      openSlots.push({ start: new Date(gapFrom), end: new Date(b.start) })
    }
    gapFrom = Math.max(gapFrom, b.end)
  }
  if (windowEnd.getTime() - gapFrom >= MIN_OPEN_SLOT_MINUTES * 60_000) {
    openSlots.push({ start: new Date(gapFrom), end: new Date(windowEnd) })
  }

  const routineUnits = countRoutineUnits(
    selectVisibleRoutines(input.routines, false),
    date,
    buildRoutineStatusMap(input.dateInstances),
    matchAll,
  )

  const allDayCount = items.filter((i) => i.start === null).length + routineUnits.actionable

  return {
    date,
    bookedMinutes: Math.round(bookedMs / 60_000),
    windowMinutes,
    timedCount: timed.length,
    allDayCount,
    items,
    openSlots,
    eventsAvailable: input.eventsAvailable,
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/today/dayLoad.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/lib/today/dayLoad.ts src/lib/today/dayLoad.test.ts
git commit -m "feat(schedule): add computeDayLoad sharing Today's selectors"
```

---

### Task 10: `useDayLoadEvents` — an isolated calendar cache

**Files:**
- Create: `src/hooks/useDayLoadEvents.ts`
- Create: `src/hooks/useDayLoadEvents.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DAY_LOAD_RANGE_DAYS = 45
  export interface DayLoadEvents {
    events: CalendarEvent[]
    available: boolean
    loading: boolean
  }
  export function useDayLoadEvents(enabled: boolean): DayLoadEvents
  ```

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useDayLoadEvents.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

import { useDayLoadEvents, DAY_LOAD_RANGE_DAYS } from './useDayLoadEvents'

describe('useDayLoadEvents', () => {
  beforeEach(() => { invoke.mockReset() })

  it('fetches nothing until enabled', () => {
    renderHook(() => useDayLoadEvents(false))
    expect(invoke).not.toHaveBeenCalled()
  })

  it(`fetches a ${DAY_LOAD_RANGE_DAYS}-day range when enabled`, async () => {
    invoke.mockResolvedValue({ data: { events: [{ id: 'e1', title: 'Standup' }] }, error: null })
    const { result } = renderHook(() => useDayLoadEvents(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toHaveLength(1)
    expect(result.current.available).toBe(true)

    const body = invoke.mock.calls[0][1].body
    const days = Math.round((new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000)
    expect(days).toBe(DAY_LOAD_RANGE_DAYS)
  })

  it('fetches once, not on every re-render', async () => {
    invoke.mockResolvedValue({ data: { events: [] }, error: null })
    const { result, rerender } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender()
    rerender()
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('reports unavailable on failure instead of pretending the days are empty', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.available).toBe(false)
    expect(result.current.events).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/hooks/useDayLoadEvents.test.ts`
Expected: FAIL — cannot resolve `./useDayLoadEvents`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useDayLoadEvents.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

/** Far enough forward to cover every relative tile, including "this month". */
export const DAY_LOAD_RANGE_DAYS = 45

export interface DayLoadEvents {
  events: CalendarEvent[]
  available: boolean
  loading: boolean
}

// Session cache. The scheduler opens often; the calendar does not change often.
let cache: CalendarEvent[] | null = null
let cacheFailed = false
let inflight: Promise<void> | null = null

/**
 * Calendar events for the fullness readout, in their OWN cache.
 *
 * This deliberately does not use GoogleCalendarProvider. That provider's
 * fetchEvents REPLACES its state rather than merging
 * (useGoogleCalendar.tsx — `setEvents(data.events || [])`), and Today fetches
 * only the viewed day, so reading from it would see one day of events and
 * report every other day as empty. Widening ITS fetch is worse: it would blank
 * the events in the view behind the open panel — the same failure
 * HomeViewContainer already carries a restore-hack for.
 *
 * So: one extra call, held here, touching nothing on screen.
 */
export function useDayLoadEvents(enabled: boolean): DayLoadEvents {
  const [, force] = useState(0)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    if (!enabled || cache !== null || cacheFailed || inflight) return

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + DAY_LOAD_RANGE_DAYS)

    inflight = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-calendar-events', {
          body: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            domain: 'universal',
          },
        })
        if (error || data?.error) throw error ?? new Error(String(data.error))
        cache = (data?.events ?? []) as CalendarEvent[]
      } catch {
        // A failed fetch must NOT read as "these days are free".
        cacheFailed = true
      } finally {
        inflight = null
        if (mounted.current) force((n) => n + 1)
      }
    })()

    void inflight
  }, [enabled])

  return {
    events: cache ?? [],
    available: cache !== null,
    loading: enabled && cache === null && !cacheFailed,
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/hooks/useDayLoadEvents.test.ts`
Expected: PASS, 4 tests. The module-level cache leaks across tests — reset it by adding `vi.resetModules()` in `beforeEach` and re-importing, or export a `__resetDayLoadCache()` used only by tests.

- [ ] **Step 5: Confirm it never writes to the shared provider**

Run: `grep -n "useGoogleCalendar\|setEvents" src/hooks/useDayLoadEvents.ts`
Expected: only the `import type { CalendarEvent }` line.

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/hooks/useDayLoadEvents.ts src/hooks/useDayLoadEvents.test.ts
git commit -m "feat(schedule): fetch day-load events into an isolated cache"
```

---

### Task 11: `SchedulePicker` — one scheduler with a fullness readout

**Files:**
- Create: `src/components/schedule/SchedulePicker.tsx`
- Create: `src/components/schedule/SchedulePicker.test.tsx`
- Create: `src/components/schedule/DayLoadBar.tsx`
- Create: `src/components/schedule/DayPeek.tsx`
- Modify: `src/components/schedule/RescheduleGrid.tsx` — accept an optional `loads` map and render a bar under each dated tile.

**Interfaces:**
- Consumes: `DayLoad` + `computeDayLoad` (Task 9), `TriageWhen` from `@/components/schedule/TriageWhenMenu`, `getBaseDate`/`getNextWeekend`/`getWeekendAfterNext`/`getNextMonday` from `@/lib/dateHelpers`.
- Produces:
  ```ts
  export interface SchedulePickerProps {
    scheduledFor?: Date
    onSchedule: (date: Date, isAllDay: boolean) => void
    onReschedule?: (when: TriageWhen) => void
    onClearSchedule?: () => void
    loads: Map<string, DayLoad>        // key = ymd
    label?: string                      // trigger text, default 'Schedule'
  }
  export function SchedulePicker(props: SchedulePickerProps): JSX.Element
  export function dayLoadKey(d: Date): string   // 'YYYY-MM-DD'
  /** Dated tiles only — the pool whens (this-month, someday) have no day to measure. */
  export const DATED_WHENS: { when: TriageWhen; date: () => Date; window?: { startHour: number; endHour: number } }[]
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/SchedulePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SchedulePicker, dayLoadKey } from './SchedulePicker'
import type { DayLoad } from '@/lib/today/dayLoad'

const load = (date: Date, over: Partial<DayLoad> = {}): DayLoad => ({
  date, bookedMinutes: 0, windowMinutes: 780, timedCount: 0, allDayCount: 0,
  items: [], openSlots: [], eventsAvailable: true, ...over,
})

const today = new Date()

describe('SchedulePicker', () => {
  beforeEach(() => localStorage.clear())

  it('opens the grid from the trigger', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={new Map()} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('shows a fullness bar for a dated tile', async () => {
    const user = userEvent.setup()
    const loads = new Map([[dayLoadKey(today), load(today, { bookedMinutes: 390, allDayCount: 5 })]])
    render(<SchedulePicker onSchedule={vi.fn()} loads={loads} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))

    const bar = screen.getByLabelText(/50% booked/i)
    expect(bar).toBeInTheDocument()
    expect(within(bar.closest('[data-tile]')!).getByText('+5')).toBeInTheDocument()
  })

  it('shows no bar for a pool tile', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={new Map()} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    const someday = screen.getByText('Someday').closest('[data-tile]')!
    expect(within(someday).queryByRole('progressbar')).toBeNull()
  })

  it('the tile label still schedules directly', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    render(<SchedulePicker onSchedule={vi.fn()} onReschedule={onReschedule} loads={new Map()} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    await user.click(screen.getByText('Tomorrow'))
    expect(onReschedule).toHaveBeenCalledWith('tomorrow')
  })

  it('the bar opens the day peek instead of scheduling', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    const loads = new Map([[dayLoadKey(today), load(today, { bookedMinutes: 120 })]])
    render(<SchedulePicker onSchedule={vi.fn()} onReschedule={onReschedule} loads={loads} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    await user.click(screen.getByLabelText(/15% booked/i))

    expect(onReschedule).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /back to schedule for/i })).toBeInTheDocument()
  })

  it('schedules at an open slot from the peek', async () => {
    const user = userEvent.setup()
    const onSchedule = vi.fn()
    const slotStart = new Date(today); slotStart.setHours(10, 0, 0, 0)
    const slotEnd = new Date(today); slotEnd.setHours(14, 0, 0, 0)
    const loads = new Map([[dayLoadKey(today), load(today, {
      bookedMinutes: 60,
      openSlots: [{ start: slotStart, end: slotEnd }],
    })]])
    render(<SchedulePicker onSchedule={onSchedule} loads={loads} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    await user.click(screen.getByLabelText(/7% booked/i))
    await user.click(screen.getByRole('button', { name: /open 10:00 AM/i }))

    expect(onSchedule).toHaveBeenCalledWith(slotStart, false)
  })

  it('says so when event data is unavailable rather than under-reporting', async () => {
    const user = userEvent.setup()
    const loads = new Map([[dayLoadKey(today), load(today, { eventsAvailable: false })]])
    render(<SchedulePicker onSchedule={vi.fn()} loads={loads} />)
    await user.click(screen.getByRole('button', { name: /schedule/i }))
    expect(screen.getByText(/events unavailable/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/schedule/SchedulePicker.test.tsx`
Expected: FAIL — cannot resolve `./SchedulePicker`.

- [ ] **Step 3: Implement `DayLoadBar`**

Create `src/components/schedule/DayLoadBar.tsx`:

```tsx
import type { DayLoad } from '@/lib/today/dayLoad'

const SEGMENTS = 8

/** Bands are informational, drawn from the primary ramp — a full day is a fact,
 *  not an error, so nothing here turns red. */
function bandClass(ratio: number): string {
  if (ratio > 0.6) return 'bg-primary-600'
  if (ratio > 0.25) return 'bg-primary-400'
  return 'bg-primary-200'
}

export function DayLoadBar({ load, onPeek }: { load: DayLoad; onPeek?: () => void }) {
  const ratio = load.windowMinutes > 0 ? load.bookedMinutes / load.windowMinutes : 0
  const filled = Math.round(ratio * SEGMENTS)
  const pct = Math.round(ratio * 100)

  return (
    <button
      type="button"
      onClick={onPeek}
      disabled={!onPeek}
      aria-label={`${pct}% booked — see the day`}
      className="mt-1 flex w-full items-center gap-1.5 disabled:cursor-default"
    >
      {/* role="progressbar" belongs on the meter itself, not on the button —
          putting it on the button would erase the button's own semantics. */}
      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="flex flex-1 gap-0.5"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < filled ? bandClass(ratio) : 'bg-neutral-200'}`}
          />
        ))}
      </span>
      {load.allDayCount > 0 && (
        <span className="text-[11px] tabular-nums text-neutral-400">+{load.allDayCount}</span>
      )}
      {!load.eventsAvailable && (
        <span className="text-[10px] text-neutral-400">events unavailable</span>
      )}
    </button>
  )
}
```

- [ ] **Step 4: Implement `DayPeek`**

Create `src/components/schedule/DayPeek.tsx`:

```tsx
import { ChevronLeft } from 'lucide-react'
import type { DayLoad } from '@/lib/today/dayLoad'
import { DayLoadBar } from './DayLoadBar'

const MAX_ALL_DAY = 3

function clock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  load: DayLoad
  onBack: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
}

/** One day's agenda, so "which day has room" is answered where you decide it. */
export function DayPeek({ load, onBack, onSchedule }: Props) {
  const allDay = load.items.filter((i) => i.start === null)
  const timed = load.items.filter((i) => i.start !== null)
  const hours = Math.round((load.bookedMinutes / 60) * 10) / 10

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Schedule for"
        className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Schedule for
      </button>

      <div className="px-1">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500">
          {load.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
            {hours}h booked{load.allDayCount > 0 && ` · ${load.allDayCount} all-day`}
          </span>
        </div>
        <DayLoadBar load={load} />
      </div>

      <div className="max-h-64 space-y-1 overflow-auto px-1">
        {allDay.slice(0, MAX_ALL_DAY).map((i) => (
          <div key={i.id} className="flex gap-2 text-[13px]">
            <span className="w-16 shrink-0 text-neutral-400">all-day</span>
            <span className="truncate text-neutral-700">{i.title}</span>
          </div>
        ))}
        {allDay.length > MAX_ALL_DAY && (
          <div className="pl-[4.5rem] text-[13px] text-neutral-400">… {allDay.length - MAX_ALL_DAY} more</div>
        )}

        {timed.map((i) => (
          <div key={i.id} className="flex gap-2 text-[13px]">
            <span className="w-16 shrink-0 tabular-nums text-neutral-400">{clock(i.start!)}</span>
            <span className="truncate text-neutral-700">{i.title}</span>
          </div>
        ))}

        {load.openSlots.map((slot) => (
          <button
            key={slot.start.toISOString()}
            type="button"
            onClick={() => onSchedule(slot.start, false)}
            aria-label={`open ${clock(slot.start)} to ${clock(slot.end)} — put it here`}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary-300 px-2 py-1.5 text-[13px] text-primary-700 hover:bg-primary-50"
          >
            <span className="flex-1 text-left">open {clock(slot.start)} – {clock(slot.end)}</span>
            <span className="text-[11px]">+ here</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSchedule(load.date, true)}
        className="w-full rounded-lg bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-700"
      >
        Put it here · all day
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Implement `SchedulePicker`**

Create `src/components/schedule/SchedulePicker.tsx` wrapping `RescheduleGrid`, `DayPeek` and `SpecificDatePicker` behind one trigger, holding `step: 'grid' | 'peek' | 'date'` and the peeked date. Export `dayLoadKey` and `DATED_WHENS`:

```tsx
export const DATED_WHENS = [
  { when: 'today' as const,         date: () => getBaseDate(0) },
  { when: 'tonight' as const,       date: () => getBaseDate(0), window: EVENING_WINDOW },
  { when: 'tomorrow' as const,      date: () => getBaseDate(1) },
  { when: 'this-weekend' as const,  date: getNextWeekend },
  { when: 'next-weekend' as const,  date: getWeekendAfterNext },
  { when: 'next-week' as const,     date: getNextMonday },
]

export function dayLoadKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

`tonight` keys as `${ymd}|evening` so its evening-window load doesn't collide with `today`'s full-day load in the same map.

- [ ] **Step 6: Wire the bar into `RescheduleGrid`**

Add an optional prop; when absent the grid renders exactly as today, so no existing caller changes:

```tsx
interface Props {
  onPick: (when: TriageWhen) => void
  onPickDate?: (date: Date, isAllDay: boolean) => void
  /** Fullness per tile, keyed by dayLoadKey. Omit for a plain grid. */
  loads?: Map<string, DayLoad>
  onPeek?: (date: Date, key: string) => void
}
```

Each tile becomes `<div data-tile>` wrapping the existing label button plus, when a load exists for its key, a `<DayLoadBar>`.

- [ ] **Step 7: Run the tests and type-check**

```bash
npx vitest run src/components/schedule/SchedulePicker.test.tsx src/components/schedule/RescheduleGrid.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/SchedulePicker.tsx src/components/schedule/SchedulePicker.test.tsx \
        src/components/schedule/DayLoadBar.tsx src/components/schedule/DayPeek.tsx \
        src/components/schedule/RescheduleGrid.tsx
git commit -m "feat(schedule): add SchedulePicker with a day-fullness readout and peek"
```

---

### Task 12: Wire the picker and day loads into both panels

**Files:**
- Create: `src/components/surface/hooks/useDayLoads.ts`
- Create: `src/components/surface/hooks/useDayLoads.test.ts`
- Modify: `src/components/surface/TapContextPanel.tsx` — swap the placeholder `render` thunk for `SchedulePicker`
- Modify: `src/components/surface/TapEventPanel.tsx` — same
- Modify: `src/apps/tasks/TaskDetailPanel.tsx:148-180` and `:406-510` — pass `routines` and `dateInstances`

**Interfaces:**
- Consumes: `computeDayLoad`, `useDayLoadEvents`, `DATED_WHENS`, `dayLoadKey`.
- Produces:
  ```ts
  export function useDayLoads(input: {
    tasks: Task[]
    routines: Routine[]
    dateInstances: ActionableInstance[]
    enabled: boolean
  }): Map<string, DayLoad>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/surface/hooks/useDayLoads.test.ts` asserting: it returns one entry per `DATED_WHENS` row; `tonight`'s entry uses the evening window; every entry carries `eventsAvailable: false` when the fetch failed; and it returns an empty map when `enabled` is false.

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/hooks/useDayLoadEvents', () => ({
  useDayLoadEvents: () => ({ events: [], available: true, loading: false }),
  DAY_LOAD_RANGE_DAYS: 45,
}))

import { useDayLoads } from './useDayLoads'
import { DATED_WHENS } from '@/components/schedule/SchedulePicker'
import { EVENING_WINDOW } from '@/lib/today/dayLoad'

const base = { tasks: [], routines: [], dateInstances: [], enabled: true }

describe('useDayLoads', () => {
  it('returns one load per dated tile and none for pool tiles', () => {
    const { result } = renderHook(() => useDayLoads(base))
    expect(result.current.size).toBe(DATED_WHENS.length)
  })

  it('scopes tonight to the evening window', () => {
    const { result } = renderHook(() => useDayLoads(base))
    const tonight = [...result.current.values()].find((l) => l.windowMinutes === (EVENING_WINDOW.endHour - EVENING_WINDOW.startHour) * 60)
    expect(tonight).toBeDefined()
  })

  it('returns an empty map when disabled', () => {
    const { result } = renderHook(() => useDayLoads({ ...base, enabled: false }))
    expect(result.current.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/surface/hooks/useDayLoads.test.ts`
Expected: FAIL — cannot resolve `./useDayLoads`.

- [ ] **Step 3: Implement `useDayLoads`**

```ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { computeDayLoad, type DayLoad } from '@/lib/today/dayLoad'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { DATED_WHENS, dayLoadKey } from '@/components/schedule/SchedulePicker'

/** Fullness for the six dated scheduler tiles. Pool tiles (this-month, someday)
 *  have no day to measure and get no entry. */
export function useDayLoads(input: {
  tasks: Task[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  enabled: boolean
}): Map<string, DayLoad> {
  const { events, available } = useDayLoadEvents(input.enabled)

  return useMemo(() => {
    const map = new Map<string, DayLoad>()
    if (!input.enabled) return map
    for (const tile of DATED_WHENS) {
      const date = tile.date()
      const key = tile.window ? `${dayLoadKey(date)}|evening` : dayLoadKey(date)
      map.set(key, computeDayLoad(date, {
        tasks: input.tasks,
        events,
        routines: input.routines,
        dateInstances: input.dateInstances,
        eventsAvailable: available,
        window: tile.window,
      }))
    }
    return map
  }, [input.enabled, input.tasks, input.routines, input.dateInstances, events, available])
}
```

- [ ] **Step 4: Call it in both panels and pass `loads` to `SchedulePicker`**

In `TapContextPanel` and `TapEventPanel`:

```tsx
const dayLoads = useDayLoads({
  tasks: props.allTasks,
  routines: props.routines ?? [],
  dateInstances: props.dateInstances ?? [],
  enabled: true,
})
```

Add `routines?: Routine[]` and `dateInstances?: ActionableInstance[]` to both panels' props.

- [ ] **Step 5: Pass them from the host**

`TaskDetailPanel.tsx` already calls `useRoutines()` and `useActionableInstances()` for the routine branch. Lift those calls to the component top and pass `routines={routines}` / `dateInstances={dateInstances}` into `<TapContextPanel>` (`:173`) and `<TapEventPanel>` (`:507`). Do **not** add another `useSupabaseTasks()` call — the file already has two, and each opens its own realtime channel.

- [ ] **Step 6: Run the tests and type-check**

```bash
npx vitest run src/components/surface src/components/schedule src/lib/today
npx tsc --noEmit -p tsconfig.app.json
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/surface src/apps/tasks/TaskDetailPanel.tsx
git commit -m "feat(panel): wire the fullness-aware scheduler into task and event panels"
```

---

### Task 13: Verify in the running app

Type-checks are not inspection. This step is not optional — a previous pass shipped a redundant panel that every test approved.

- [ ] **Step 1: Start the dev server in the worktree**

```bash
cd .worktrees/panel-design-pass
npm run dev
```
Port 5173. If the worktree shows a blank screen, `.env` is missing — copy it from the main worktree. Restart the dev server before trusting anything; stale HMR state has faked results before.

- [ ] **Step 2: Walk the task panel**

Open a task with notes, a phone number and subtasks. Confirm: sections collapse and reopen; a collapsed section shows its preview; the collapse survives a reload and applies to a different task; Notes types without entering a mode; the widen button opens the overlay and Escape closes it; the chip row is one row with an overflow menu.

- [ ] **Step 3: Walk the scheduler**

Open Schedule. Confirm: dated tiles show a bar, pool tiles don't; the bar matches what Today shows for that day; tapping a tile label schedules; tapping a bar opens the peek; an open slot schedules to its start; Today's events behind the panel are still there afterward — that last one is the regression this design exists to avoid.

- [ ] **Step 4: Walk the event, routine and meal panels**

Confirm all four now share one rhythm — same padding, same dividers, same label style — and that no doubled hairlines appear where the routine panel's old `border-b` sections were.

- [ ] **Step 5: Full suite, lint and type-check**

```bash
npx vitest run
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```
Expected: all pass. CI runs lint and the pre-push hook does not — a lint failure here is a red build later.

- [ ] **Step 6: Commit any fixes and push the branch**

```bash
git add -A && git commit -m "fix(panel): walkthrough corrections"
git push -u origin panel-design-pass
```

Do **not** push to `main`. Pushing to `main` auto-deploys to production; this merges after review.
