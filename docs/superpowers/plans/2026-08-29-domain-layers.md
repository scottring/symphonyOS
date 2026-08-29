# Domain Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-select domain lens with Google-Calendar-style layers (Work / Family / Personal / Unsorted, any subset), make sharing (`scope`) a pure derivation of domain + assignees, land every capture Unsorted, and force a domain choice before an Unsorted item can be processed.

**Architecture:** One typed list `DOMAINS` in `src/lib/domains.ts`; `useDomain` holds a `ReadonlySet<Layer>`; the three `domainFilter.ts` helpers take that set; `scopeForDomain()` in `src/lib/scope.ts` is the only thing that ever produces a `scope` value; a `DomainGate` provider intercepts schedule/assign/project writes on Unsorted tasks. Migration is incremental: `useDomain` keeps a deprecated `currentDomain`/`setDomain` shim until Task 12 deletes it, so every task leaves `tsc` green.

**Tech Stack:** React 19, TypeScript strict, Vitest + RTL, Supabase JS, Deno edge functions, Tailwind v4 / lucide icons (no emoji).

**Spec:** `docs/superpowers/specs/2026-08-29-domain-layers-design.md`

## Global Constraints

- Work in `.worktrees/domain-layers` on branch `feat/domain-layers`. **Never** edit or commit in the main worktree.
- Node **22.14.0** for tests: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` (this machine's default is 26.x, which breaks the localStorage tests).
- Tests: `npx vitest run <path>` (bare `npm test` is watch mode). Type-check: `npx tsc -p tsconfig.app.json --noEmit` (root `tsc --noEmit` is a no-op). Lint: `npm run lint` (CI runs it; the pre-push hook doesn't).
- `tasks` writes: `.update().eq()` only — never a partial `upsert`.
- Every new task mutation must `announceLocalWrite` (already done inside `useSupabaseTasks`; don't add raw inserts).
- Icons are lucide; no emoji in UI strings.
- No DB migration in this plan. `scope` stays `NOT NULL DEFAULT 'individual'`; RLS unchanged.
- Domain colours stay what `DomainSwitcher`/`ContextPicker` use today: work blue-600 `rgb(37 99 235)`, family amber-600 `rgb(217 119 6)`, personal purple-600 `rgb(147 51 234)`.
- Commit after every task with the trailer:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NehhJ6kRqSFcq8jjyZe2my
  ```
- Do **not** push to `main` until Task 13's manual check passes. Feature-branch pushes are fine at any time.

---

### Task 1: `src/lib/domains.ts` — the one list

**Files:**
- Create: `src/lib/domains.ts`
- Test: `src/lib/domains.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DomainId = 'work' | 'family' | 'personal'          // === TaskContext
  export const UNSORTED = 'unsorted' as const
  export type Layer = DomainId | typeof UNSORTED
  export interface DomainDef { id: DomainId; label: string; icon: LucideIcon; color: string; bgClass: string; shared: boolean }
  export const DOMAINS: readonly DomainDef[]                     // work, family, personal
  export const ALL_LAYERS: ReadonlySet<Layer>                    // all four
  export const LAYER_LABELS: Record<Layer, string>
  export function layerOf(context: TaskContext | null | undefined): Layer
  export function domainById(id: DomainId): DomainDef
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domains.test.ts
import { describe, it, expect } from 'vitest'
import { DOMAINS, ALL_LAYERS, UNSORTED, LAYER_LABELS, layerOf, domainById } from './domains'

describe('DOMAINS', () => {
  it('lists work, family, personal in that order and only family is shared', () => {
    expect(DOMAINS.map((d) => d.id)).toEqual(['work', 'family', 'personal'])
    expect(DOMAINS.filter((d) => d.shared).map((d) => d.id)).toEqual(['family'])
  })

  it('ALL_LAYERS is the three domains plus unsorted', () => {
    expect([...ALL_LAYERS].sort()).toEqual(['family', 'personal', 'unsorted', 'work'])
  })

  it('layerOf maps null/undefined context to unsorted and a context to itself', () => {
    expect(layerOf(null)).toBe(UNSORTED)
    expect(layerOf(undefined)).toBe(UNSORTED)
    expect(layerOf('work')).toBe('work')
  })

  it('every layer has a label and every domain resolves by id', () => {
    for (const l of ALL_LAYERS) expect(LAYER_LABELS[l]).toBeTruthy()
    expect(domainById('family').label).toBe('Family')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domains.test.ts`
Expected: FAIL — cannot resolve `./domains`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/domains.ts
//
// THE list of domains. A domain is a layer you can tick on or off (like a
// Google calendar) AND the unit of sharing: `shared: true` means every
// household member subscribes to it. Nothing else in src/ may enumerate the
// three ids for UI purposes — iterate DOMAINS, so a `domains` table can
// replace this file later without touching every surface.
import { Briefcase, Users, User, Inbox, type LucideIcon } from 'lucide-react'
import type { TaskContext } from '@/types/task'

export type DomainId = TaskContext
export const UNSORTED = 'unsorted' as const
/** A pickable layer: a real domain, or the pseudo-layer for `context IS NULL`. */
export type Layer = DomainId | typeof UNSORTED

export interface DomainDef {
  id: DomainId
  label: string
  icon: LucideIcon
  /** Dot / accent colour (CSS rgb). */
  color: string
  /** Tailwind classes for the page tint when this is the sole domain. */
  bgClass: string
  /** Every household member subscribes; scope derives to 'compound'. */
  shared: boolean
}

export const DOMAINS: readonly DomainDef[] = [
  { id: 'work',     label: 'Work',     icon: Briefcase, color: 'rgb(37 99 235)',  bgClass: 'bg-blue-50/20',   shared: false },
  { id: 'family',   label: 'Family',   icon: Users,     color: 'rgb(217 119 6)',  bgClass: 'bg-amber-50/20',  shared: true },
  { id: 'personal', label: 'Personal', icon: User,      color: 'rgb(147 51 234)', bgClass: 'bg-purple-50/20', shared: false },
]

export const UNSORTED_ICON: LucideIcon = Inbox

export const ALL_LAYERS: ReadonlySet<Layer> = new Set<Layer>([...DOMAINS.map((d) => d.id), UNSORTED])

export const LAYER_LABELS: Record<Layer, string> = {
  work: 'Work',
  family: 'Family',
  personal: 'Personal',
  unsorted: 'Unsorted',
}

export function layerOf(context: TaskContext | null | undefined): Layer {
  return context ?? UNSORTED
}

export function domainById(id: DomainId): DomainDef {
  const def = DOMAINS.find((d) => d.id === id)
  if (!def) throw new Error(`unknown domain ${id}`)
  return def
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domains.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domains.ts src/lib/domains.test.ts
git commit -m "feat(domains): one typed list of domains and layers"
```

---

### Task 2: `scopeForDomain` — the only scope producer

**Files:**
- Modify: `src/lib/scope.ts`
- Test: `src/lib/scope.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export function scopeForDomain(
    context: TaskContext | null | undefined,
    assignees: readonly (string | null | undefined)[] | null | undefined,
    selfMemberId: string | null | undefined,
  ): Scope
  ```
- Keeps `defaultScopeForArea` and `scopeForContextChange` exported **for now** (Task 8 deletes them once no caller remains).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scope.test.ts
import { describe, it, expect } from 'vitest'
import { scopeForDomain } from './scope'

const ME = 'member-me'
const IRIS = 'member-iris'

describe('scopeForDomain', () => {
  it('family is always household-shared, whatever the assignees', () => {
    expect(scopeForDomain('family', [], ME)).toBe('compound')
    expect(scopeForDomain('family', [IRIS], ME)).toBe('compound')
    expect(scopeForDomain('family', null, null)).toBe('compound')
  })

  it('a private domain handed to someone else is shared with them (couple)', () => {
    expect(scopeForDomain('personal', [IRIS], ME)).toBe('couple')
    expect(scopeForDomain('work', [ME, IRIS], ME)).toBe('couple')
  })

  it('a private domain assigned to yourself, or nobody, stays private', () => {
    expect(scopeForDomain('personal', [ME], ME)).toBe('individual')
    expect(scopeForDomain('work', [], ME)).toBe('individual')
    expect(scopeForDomain('personal', undefined, ME)).toBe('individual')
  })

  it('unsorted is private', () => {
    expect(scopeForDomain(null, [], ME)).toBe('individual')
    expect(scopeForDomain(undefined, [IRIS], ME)).toBe('couple') // handed off before triage still has to be readable
  })

  it('ignores null/undefined entries in the assignee list', () => {
    expect(scopeForDomain('personal', [null, undefined], ME)).toBe('individual')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scope.test.ts`
Expected: FAIL — `scopeForDomain` is not exported.

- [ ] **Step 3: Add the function** (append to `src/lib/scope.ts`; leave the existing two exports in place)

```ts
/**
 * THE scope a row must carry, computed from what it is and who does it.
 * Nothing else may produce a scope value. No history, no "leave it alone":
 * the row's scope is always exactly what its current domain + assignees say.
 *
 * - family → compound (the household layer; every member subscribes)
 * - anything else handed to another member → couple (the minimum RLS share,
 *   and it keeps the item off the kitchen wall, which needs compound)
 * - otherwise → individual
 */
export function scopeForDomain(
  context: TaskContext | null | undefined,
  assignees: readonly (string | null | undefined)[] | null | undefined,
  selfMemberId: string | null | undefined,
): Scope {
  if (context === 'family') return 'compound'
  const others = (assignees ?? []).filter((id): id is string => !!id && id !== selfMemberId)
  return others.length > 0 ? 'couple' : 'individual'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scope.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scope.ts src/lib/scope.test.ts
git commit -m "feat(scope): scopeForDomain — scope is derived from domain + assignees"
```

---

### Task 3: `useDomain` holds layers (with a transitional `currentDomain` shim)

**Files:**
- Modify: `src/hooks/useDomain.tsx`
- Modify: `src/hooks/useDomain.test.ts` (rewrite)

**Interfaces:**
- Produces:
  ```ts
  interface DomainContextType {
    layers: ReadonlySet<Layer>
    setLayers: (next: ReadonlySet<Layer>) => void
    toggle: (layer: Layer) => void          // no-op if it would empty the set
    only: (layer: Layer) => void
    all: () => void
    soleDomain: DomainId | null             // exactly one real domain checked (unsorted may also be) → that id
    /** @deprecated transitional — removed in Task 12 */ currentDomain: Domain
    /** @deprecated transitional — removed in Task 12 */ setDomain: (d: Domain) => void
  }
  export type Domain = TaskContext | 'universal'   // stays until Task 12
  export function resolveInitialLayers(stored: string | null): ReadonlySet<Layer>
  export const LAYERS_KEY = 'symphony-layers'
  ```
- `currentDomain` shim = `soleDomain ?? 'universal'`. `setDomain('universal')` = `all()`; `setDomain(d)` = `only(d)`.

- [ ] **Step 1: Replace the test file**

```ts
// src/hooks/useDomain.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { DomainProvider, useDomain, resolveInitialLayers, LAYERS_KEY } from './useDomain'
import { ALL_LAYERS, UNSORTED } from '@/lib/domains'

// The lens is persisted FOREVER, like a Google Calendar checkbox. That used to
// be unsafe because quick capture stamped the lens onto new rows; captures now
// land Unsorted, so a stale lens can't mislabel anything.

describe('resolveInitialLayers', () => {
  it('defaults to every layer with nothing stored', () => {
    expect(resolveInitialLayers(null)).toEqual(ALL_LAYERS)
  })
  it('restores a stored subset', () => {
    expect([...resolveInitialLayers('["work","unsorted"]')].sort()).toEqual(['unsorted', 'work'])
  })
  it('falls back to all on garbage, an empty set, or unknown ids', () => {
    expect(resolveInitialLayers('nope')).toEqual(ALL_LAYERS)
    expect(resolveInitialLayers('[]')).toEqual(ALL_LAYERS)
    expect(resolveInitialLayers('["bogus"]')).toEqual(ALL_LAYERS)
  })
})

describe('useDomain', () => {
  beforeEach(() => localStorage.clear())
  const wrapper = DomainProvider

  it('toggle removes and re-adds a layer, and persists', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    act(() => result.current.toggle('work'))
    expect(result.current.layers.has('work')).toBe(false)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)).not.toContain('work')
    act(() => result.current.toggle('work'))
    expect(result.current.layers.has('work')).toBe(true)
  })

  it('refuses to uncheck the last layer', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    act(() => result.current.only('family'))
    act(() => result.current.toggle('family'))
    expect([...result.current.layers]).toEqual(['family'])
  })

  it('soleDomain is the single real domain checked; unsorted does not count', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    expect(result.current.soleDomain).toBeNull()
    act(() => result.current.only('personal'))
    expect(result.current.soleDomain).toBe('personal')
    act(() => result.current.toggle(UNSORTED))
    expect(result.current.soleDomain).toBe('personal')
    act(() => result.current.toggle('work'))
    expect(result.current.soleDomain).toBeNull()
  })

  it('transitional currentDomain mirrors soleDomain', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    expect(result.current.currentDomain).toBe('universal')
    act(() => result.current.setDomain('work'))
    expect(result.current.currentDomain).toBe('work')
    expect([...result.current.layers]).toEqual(['work'])
    act(() => result.current.setDomain('universal'))
    expect(result.current.layers).toEqual(ALL_LAYERS)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useDomain.test.ts`
Expected: FAIL — `resolveInitialLayers`/`LAYERS_KEY` not exported.

- [ ] **Step 3: Rewrite `src/hooks/useDomain.tsx`**

```tsx
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { TaskContext } from '@/types/task'
import { ALL_LAYERS, DOMAINS, UNSORTED, type DomainId, type Layer } from '@/lib/domains'

/** @deprecated transitional; the single-lens value. Removed once every consumer reads `layers`. */
export type Domain = TaskContext | 'universal'

interface DomainContextType {
  /** The checked layers. Never empty. */
  layers: ReadonlySet<Layer>
  setLayers: (next: ReadonlySet<Layer>) => void
  toggle: (layer: Layer) => void
  only: (layer: Layer) => void
  all: () => void
  /** Exactly one real domain checked (Unsorted may ride along) → that domain. */
  soleDomain: DomainId | null
  /** @deprecated */ currentDomain: Domain
  /** @deprecated */ setDomain: (domain: Domain) => void
}

const DomainContext = createContext<DomainContextType | undefined>(undefined)

export const LAYERS_KEY = 'symphony-layers'

/** Layers persist forever, like a calendar checkbox. Anything unreadable, empty,
 *  or unknown falls back to everything — the only default that hides nothing. */
export function resolveInitialLayers(stored: string | null): ReadonlySet<Layer> {
  if (!stored) return ALL_LAYERS
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return ALL_LAYERS
    const valid = parsed.filter((x): x is Layer => ALL_LAYERS.has(x as Layer))
    return valid.length > 0 ? new Set(valid) : ALL_LAYERS
  } catch {
    return ALL_LAYERS
  }
}

export function soleDomainOf(layers: ReadonlySet<Layer>): DomainId | null {
  const real = DOMAINS.map((d) => d.id).filter((id) => layers.has(id))
  return real.length === 1 ? real[0] : null
}

export function DomainProvider({ children }: { children: ReactNode }) {
  const [layers, setLayersState] = useState<ReadonlySet<Layer>>(() => {
    try { return resolveInitialLayers(localStorage.getItem(LAYERS_KEY)) } catch { return ALL_LAYERS }
  })

  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify([...layers])) } catch { /* ignore */ }
  }, [layers])

  const setLayers = useCallback((next: ReadonlySet<Layer>) => {
    if (next.size > 0) setLayersState(new Set(next))
  }, [])
  const toggle = useCallback((layer: Layer) => {
    setLayersState((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) { if (next.size === 1) return prev; next.delete(layer) } else next.add(layer)
      return next
    })
  }, [])
  const only = useCallback((layer: Layer) => setLayersState(new Set([layer])), [])
  const all = useCallback(() => setLayersState(ALL_LAYERS), [])

  const value = useMemo<DomainContextType>(() => {
    const soleDomain = soleDomainOf(layers)
    return {
      layers, setLayers, toggle, only, all, soleDomain,
      currentDomain: soleDomain ?? 'universal',
      setDomain: (d) => (d === 'universal' ? all() : only(d)),
    }
  }, [layers, setLayers, toggle, only, all])

  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>
}

export function useDomain() {
  const context = useContext(DomainContext)
  if (!context) throw new Error('useDomain must be used within DomainProvider')
  return context
}

export { UNSORTED }
```

- [ ] **Step 4: Run tests + tsc**

Run: `npx vitest run src/hooks/useDomain.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: tests PASS. tsc passes (all consumers still read `currentDomain`/`setDomain`). `DomainSwitcher.test.tsx` will fail on the old localStorage key — fixed in Task 4; don't chase it here.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDomain.tsx src/hooks/useDomain.test.ts
git commit -m "feat(domain): useDomain holds a set of layers; currentDomain is a transitional shim"
```

---

### Task 4: `DomainSwitcher` becomes a checkbox set

**Files:**
- Modify: `src/components/domain/DomainSwitcher.tsx` (rewrite)
- Modify: `src/components/domain/DomainSwitcher.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `useDomain().layers/toggle/only/all/soleDomain`, `DOMAINS`, `UNSORTED`, `UNSORTED_ICON`, `LAYER_LABELS`.
- Trigger `aria-label`: `Layers: All` / `Layers: Work` / `Layers: Work, Family`.
- Rows are `role="menuitemcheckbox"` with `aria-checked`; each row also has a hidden-until-hover `Only` button (`aria-label="Only Work"`). Footer has an `All` button.

- [ ] **Step 1: Rewrite the test**

```tsx
// src/components/domain/DomainSwitcher.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DomainProvider, LAYERS_KEY } from '@/hooks/useDomain'
import { DomainSwitcher } from './DomainSwitcher'

function renderSwitcher() {
  return render(<DomainProvider><DomainSwitcher /></DomainProvider>)
}

describe('DomainSwitcher', () => {
  beforeEach(() => localStorage.clear())

  it('starts with every layer on and the menu closed', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('unchecking a layer keeps the menu open and persists the set', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Work' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Work' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!).sort()).toEqual(['family', 'personal', 'unsorted'])
    expect(screen.getByRole('button', { name: 'Layers: Family, Personal, Unsorted' })).toBeInTheDocument()
  })

  it('"Only" narrows to one layer and "All" restores everything', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('button', { name: 'Only Family' }))
    expect(screen.getByRole('button', { name: 'Layers: Family' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
  })

  it('the last checked layer cannot be unchecked', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('button', { name: 'Only Work' }))
    const work = screen.getByRole('menuitemcheckbox', { name: 'Work' })
    expect(work).toBeDisabled()
  })

  // The bug this component replaced: expanding in-flow re-wrapped the header
  // and yanked the control out from under the cursor. A portalled menu can't.
  it('renders the menu outside its own subtree', async () => {
    const user = userEvent.setup()
    const { container } = renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    expect(container.contains(screen.getByRole('menu'))).toBe(false)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/domain/DomainSwitcher.test.tsx`
Expected: FAIL — no `Layers: All` button.

- [ ] **Step 3: Rewrite the component.** Keep the existing positioning + outside-click + Escape effects verbatim (lines 33–63 of the current file); replace the `DOMAINS` const, the `menu` JSX and the trigger.

```tsx
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, Layers } from 'lucide-react'
import { useDomain } from '@/hooks/useDomain'
import { DOMAINS, UNSORTED, UNSORTED_ICON, LAYER_LABELS, type Layer } from '@/lib/domains'

// (keep the existing "why this is a portalled click menu" comment block)

const ROWS: { id: Layer; label: string; icon: typeof Layers; color: string }[] = [
  ...DOMAINS.map((d) => ({ id: d.id as Layer, label: d.label, icon: d.icon, color: d.color })),
  { id: UNSORTED, label: LAYER_LABELS.unsorted, icon: UNSORTED_ICON, color: 'rgb(115 115 115)' },
]

function triggerLabel(layers: ReadonlySet<Layer>): string {
  if (ROWS.every((r) => layers.has(r.id))) return 'All'
  return ROWS.filter((r) => layers.has(r.id)).map((r) => r.label).join(', ')
}

export function DomainSwitcher() {
  const { layers, toggle, only, all } = useDomain()
  const [isOpen, setIsOpen] = useState(false)
  // …existing menuPosition state, triggerRef, menuRef, and the two useEffects unchanged…

  const label = triggerLabel(layers)
  const checked = ROWS.filter((r) => layers.has(r.id))
  const isAll = label === 'All'

  const menu = isOpen ? (
    <div ref={menuRef} role="menu"
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[200px] animate-fade-in-up"
      style={{ top: menuPosition.top, bottom: menuPosition.bottom, right: menuPosition.right }}>
      <div className="space-y-0.5">
        {ROWS.map(({ id, label, icon: Icon, color }) => {
          const on = layers.has(id)
          const last = on && layers.size === 1
          return (
            <div key={id} className="group flex items-center gap-1">
              <button role="menuitemcheckbox" aria-checked={on} disabled={last}
                onClick={() => toggle(id)}
                className={`flex-1 px-3 py-2 text-sm text-left rounded-lg flex items-center gap-2.5 transition-colors ${on ? 'text-neutral-800' : 'text-neutral-400'} hover:bg-neutral-50 disabled:cursor-default`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'border-transparent' : 'border-neutral-300'}`}
                  style={on ? { background: color } : undefined}>
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <Icon className="w-4 h-4 shrink-0" style={{ color: on ? color : undefined }} />
                <span className="flex-1">{label}</span>
              </button>
              <button type="button" aria-label={`Only ${label}`} onClick={() => only(id)}
                className="px-2 py-1 text-[11px] text-neutral-500 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-neutral-100">
                Only
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-1 pt-1 border-t border-neutral-100">
        <button type="button" onClick={all} disabled={isAll}
          className="w-full px-3 py-1.5 text-xs text-left text-neutral-600 rounded-lg hover:bg-neutral-50 disabled:opacity-40">
          All
        </button>
      </div>
    </div>
  ) : null

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={isOpen}
        aria-label={`Layers: ${label}`} title={`Layers: ${label}`}
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-bg-elevated/90 backdrop-blur-sm border transition-colors ${isOpen ? 'border-primary-300 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50/50'}`}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
        {isAll ? (
          <Layers className="w-[18px] h-[18px] text-neutral-700" strokeWidth={2.25} />
        ) : checked.length === 1 ? (
          (() => { const Icon = checked[0].icon; return <Icon className="w-[18px] h-[18px]" style={{ color: checked[0].color }} strokeWidth={2.5} /> })()
        ) : (
          <span className="flex items-center -space-x-1">
            {checked.map((r) => <span key={r.id} className="w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: r.color }} />)}
          </span>
        )}
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  )
}
```

The trigger's fixed footprint rule still holds: the chip's width may vary with dot count (≤ 4 dots ≈ 40px) but never on hover/open.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/domain/DomainSwitcher.test.tsx src/hooks/useDomain.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/DomainSwitcher.tsx src/components/domain/DomainSwitcher.test.tsx
git commit -m "feat(domain): DomainSwitcher is a checkbox set of layers"
```

---

### Task 5: Layer-set filter helpers

**Files:**
- Modify: `src/lib/today/domainFilter.ts`
- Test: `src/lib/today/domainFilter.test.ts` (create if absent; extend if present)

**Interfaces:**
- Produces (added alongside the old helpers; old ones deleted in Task 6):
  ```ts
  export function matchesLayers(context: TaskContext | null | undefined, layers: ReadonlySet<Layer>): boolean
  export function filterTasksForLayers(tasks: Task[], layers: ReadonlySet<Layer>): Task[]
  export function filterEventsForLayers(events: CalendarEvent[], layers: ReadonlySet<Layer>, deps?: EventDomainDeps): CalendarEvent[]
  export function filterRoutinesForLayers<T extends { context?: TaskContext | null }>(routines: T[], layers: ReadonlySet<Layer>): T[]
  export function filterByLayers<T extends { context?: TaskContext | null }>(items: T[], layers: ReadonlySet<Layer>): T[]   // projects, goals, notes
  ```
- Event rule: resolved context (override → calendar mapping → null) maps through `layerOf`; an unmapped calendar is **Unsorted**. If `family` is checked, a private event whose note has `sharedWithFamily` also shows.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/today/domainFilter.test.ts (append or create)
import { describe, it, expect } from 'vitest'
import { matchesLayers, filterTasksForLayers, filterEventsForLayers, filterRoutinesForLayers } from './domainFilter'
import { ALL_LAYERS, UNSORTED, type Layer } from '@/lib/domains'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const L = (...xs: Layer[]) => new Set<Layer>(xs)
const task = (context: Task['context'], id = String(Math.random())) => ({ id, title: 't', completed: false, bucket: 'inbox', context, createdAt: new Date(), updatedAt: new Date() }) as Task

describe('matchesLayers', () => {
  it('a context matches when its layer is checked; null matches Unsorted', () => {
    expect(matchesLayers('work', L('work'))).toBe(true)
    expect(matchesLayers('work', L('family'))).toBe(false)
    expect(matchesLayers(null, L(UNSORTED))).toBe(true)
    expect(matchesLayers(null, L('work', 'family', 'personal'))).toBe(false)
    expect(matchesLayers(undefined, ALL_LAYERS)).toBe(true)
  })
})

describe('filterTasksForLayers', () => {
  it('returns the union of checked layers and nothing else', () => {
    const ts = [task('work', 'w'), task('family', 'f'), task(null, 'u')]
    expect(filterTasksForLayers(ts, L('work', UNSORTED)).map((t) => t.id)).toEqual(['w', 'u'])
    expect(filterTasksForLayers(ts, ALL_LAYERS)).toHaveLength(3)
  })
})

describe('filterRoutinesForLayers', () => {
  it('an untagged routine is Unsorted, not universal', () => {
    const rs = [{ id: 'a', context: null }, { id: 'b', context: 'family' as const }]
    expect(filterRoutinesForLayers(rs, L('family')).map((r) => r.id)).toEqual(['b'])
    expect(filterRoutinesForLayers(rs, L(UNSORTED)).map((r) => r.id)).toEqual(['a'])
  })
})

describe('filterEventsForLayers', () => {
  const ev = (id: string, calendar_id: string) => ({ id, google_event_id: id, calendar_id, title: id } as unknown as CalendarEvent)
  const getDomainForCalendar = (calendarId?: string) => (calendarId === 'work-cal' ? 'work' : calendarId === 'fam-cal' ? 'family' : null)

  it('an unmapped calendar is Unsorted', () => {
    const evs = [ev('w', 'work-cal'), ev('x', 'mystery-cal')]
    expect(filterEventsForLayers(evs, L('work'), { getDomainForCalendar }).map((e) => e.id)).toEqual(['w'])
    expect(filterEventsForLayers(evs, L(UNSORTED), { getDomainForCalendar }).map((e) => e.id)).toEqual(['x'])
  })

  it('a per-event override beats the calendar mapping', () => {
    const evs = [ev('w', 'work-cal')]
    const eventContextOverrides = new Map([['w', 'personal' as const]])
    expect(filterEventsForLayers(evs, L('personal'), { getDomainForCalendar, eventContextOverrides })).toHaveLength(1)
    expect(filterEventsForLayers(evs, L('work'), { getDomainForCalendar, eventContextOverrides })).toHaveLength(0)
  })

  it('family also shows a private event explicitly shared with family', () => {
    const evs = [ev('w', 'work-cal')]
    const eventNotesMap = new Map([['w', { sharedWithFamily: true }]])
    expect(filterEventsForLayers(evs, L('family'), { getDomainForCalendar, eventNotesMap })).toHaveLength(1)
    expect(filterEventsForLayers(evs, L('personal'), { getDomainForCalendar, eventNotesMap })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/today/domainFilter.test.ts`
Expected: FAIL — `matchesLayers` not exported.

- [ ] **Step 3: Add the helpers** (append to `domainFilter.ts`; import `layerOf`, `type Layer` from `@/lib/domains`)

```ts
/** Layer-set rule: an item shows iff the layer its context maps to is checked.
 *  `context IS NULL` is the Unsorted layer — a real layer, not "everywhere". */
export function matchesLayers(context: TaskContext | null | undefined, layers: ReadonlySet<Layer>): boolean {
  return layers.has(layerOf(context))
}

export function filterByLayers<T extends { context?: TaskContext | null }>(items: T[], layers: ReadonlySet<Layer>): T[] {
  return items.filter((i) => matchesLayers(i.context, layers))
}

export function filterTasksForLayers(tasks: Task[], layers: ReadonlySet<Layer>): Task[] {
  return filterByLayers(tasks, layers)
}

export function filterRoutinesForLayers<T extends { context?: TaskContext | null }>(routines: T[], layers: ReadonlySet<Layer>): T[] {
  return filterByLayers(routines, layers)
}

/** Events: override → calendar mapping → Unsorted. An unmapped calendar used to
 *  leak into every domain; now it sits in Unsorted, which is the nudge to map it.
 *  Family additionally shows a private event explicitly shared with family. */
export function filterEventsForLayers(events: CalendarEvent[], layers: ReadonlySet<Layer>, deps: EventDomainDeps = {}): CalendarEvent[] {
  return events.filter((event) => {
    const resolved = resolveEventContext(event, deps.eventContextOverrides, deps.getDomainForCalendar)
    if (matchesLayers(resolved, layers)) return true
    if (layers.has('family')) {
      const note = deps.eventNotesMap?.get(event.google_event_id || event.id)
      return !!note?.sharedWithFamily
    }
    return false
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/today/domainFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/domainFilter.ts src/lib/today/domainFilter.test.ts
git commit -m "feat(domain): layer-set filter helpers; unmapped calendars are Unsorted"
```

---

### Task 6: `resolveRoutine` and `computeTodayData` take `layers`

**Files:**
- Modify: `src/lib/routineUtils.ts:213-222, 310`
- Modify: `src/lib/today/types.ts:8, 22-23`
- Modify: `src/lib/today/computeTodayData.ts:53`
- Modify: every caller passing `prefs: { hideRoutines, domain: currentDomain }` → `prefs: { hideRoutines, layers }`:
  `src/components/home/MonthView.tsx`, `WeekView.tsx`, `CascadingRiverView.tsx`, `week/WeekViewMobile.tsx`, `week/WeekViewV2.tsx`, `src/components/schedule/TodayView.tsx` (both sites), `src/apps/tasks/HomeViewContainer.tsx:279`, `src/components/planning/guided/GuidedSessionContainer.tsx:179`
- Modify tests that build `prefs`/`TodayDataInput` with `domain: '…'` (list from `grep -rl "domain: '" src --include='*.test.*'`): `riverParity`, `weekParity`, `InboxSendToCalendar`, `TodayInvariant`, `planningParity`, `useTodayData`, `useSendToCalendar`, `useNoteSuggestion`, `routineUtils.resolveRoutine`, `computeTodayData`, `contextParity`, `statusMaps`, plus any `apps/home/*.test.tsx` that turn out to pass `domain:` into these (check each; the AssetView ones likely mean something else — leave those).

**Interfaces:**
- `ResolveRoutinePrefs.layers: ReadonlySet<Layer>` replaces `.domain`. Rung 4 becomes `if (!matchesLayers(routine.context, ctx.prefs.layers)) return hide('other-domain')`.
- `TodayDataInput.layers: ReadonlySet<Layer>` replaces `.domain`.
- View props: `currentDomain?: PlanningDomain` → `layers: ReadonlySet<Layer>` (required) on MonthView, WeekView, CascadingRiverView, WeekViewMobile, WeekViewV2.

- [ ] **Step 1: Add one focused test to `src/lib/routineUtils.resolveRoutine.test.ts`**

```ts
it('rung 4: an untagged routine is Unsorted — hidden unless Unsorted is checked', () => {
  const r = routine({ context: null })                 // use the file's existing routine() factory
  expect(resolveRoutine(r, { date: null, member: null, prefs: { hideRoutines: false, layers: new Set(['family']) } }).reason).toBe('other-domain')
  expect(resolveRoutine(r, { date: null, member: null, prefs: { hideRoutines: false, layers: new Set(['unsorted']) } }).shows).toBe(true)
})
```

- [ ] **Step 2: Run it — expect a type/compile failure** (`layers` does not exist on prefs).

- [ ] **Step 3: Change the types and rung 4**

`routineUtils.ts`: replace the `PlanningDomain` import with `import { matchesLayers } from '@/lib/today/domainFilter'` and `import type { Layer } from '@/lib/domains'`; prefs field `layers: ReadonlySet<Layer>`; line 310 → `if (!matchesLayers(routine.context, ctx.prefs.layers)) return hide('other-domain')`.
`today/types.ts`: `layers: ReadonlySet<Layer>` with doc "The checked layers. Unsorted is a layer, not a wildcard."
`computeTodayData.ts:53`: `prefs: { hideRoutines: input.hideRoutines, layers: input.layers }`.

- [ ] **Step 4: Thread `layers` through the views.** In each view listed above, replace the `currentDomain?: PlanningDomain` prop with `layers: ReadonlySet<Layer>`, and every `domain: currentDomain` with `layers`. In `HomeView.tsx` and `HomeViewContainer.tsx` read `const { layers } = useDomain()` and pass `layers={layers}` where `currentDomain={currentDomain}` was passed to these views (HomeView lines 268–387). In `TodayView.tsx` read `layers` from `useDomain()` for the two `prefs` sites and `useTodayData` input. Leave the `currentDomain` uses that feed `TodaySectionList`/`TimelineQuickInput`/`TodayAddInput` alone for now (Task 9 handles capture).

- [ ] **Step 5: Mechanical test update.** In each test file from the list, add `import { ALL_LAYERS } from '@/lib/domains'` and replace `domain: 'universal'` → `layers: ALL_LAYERS`, `domain: 'family'` → `layers: new Set(['family'])`, etc. Run:

```bash
grep -rn "domain: '" src --include='*.test.*' | grep -v "apps/home/"
```
Expected after edits: no hits in the files you touched.

- [ ] **Step 6: Run tsc + the affected suites**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/lib src/hooks/useTodayData.test.ts src/components/home src/components/schedule src/components/planning`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(domain): resolveRoutine + Today/Week/Month views filter on the layer set"
```

---

### Task 7: Every remaining filter consumer reads `layers`; old helpers deleted

**Files:**
- Modify: `src/components/home/HomeView.tsx:77-113, 440-450`
- Modify: `src/apps/tasks/HomeViewContainer.tsx:83, 256-289`
- Modify: `src/components/schedule/InboxView.tsx:69, 298-300, 571` and `src/components/notes/NotePicker.tsx:14-37`
- Modify: `src/components/planning/guided/GuidedSessionContainer.tsx:63-104`
- Modify: `src/apps/tasks/horizons/shared.tsx:191-207, 329, 415`, `SeasonPage.tsx:54,194,255`
- Modify: `src/apps/goals/GoalsApp.tsx:33`, `src/apps/projects/ProjectsApp.tsx:33-35`, `src/apps/routines/RoutinesApp.tsx:47-54`
- Modify: `src/components/domain/DomainPageOutline.tsx`
- Modify: `src/lib/today/domainFilter.ts` — delete `PlanningDomain`, `DOMAIN_LABELS`, `matchesDomain`, `filterTasksForPlanning`, `filterTasksForDomainView`, `filterEventsForDomain`, `filterRoutinesForDomain`; change `domainSessionToken(baseToken, domain: DomainId | null)` (null = bare token).
- Modify: `src/components/planning/guided/GuidedSession.tsx:11,62,87,231`, `guided/types.ts:96`, `stepTypes/BookNextStep.tsx:9,23` — `domain: DomainId | null`; label via `domainById(domain).label`.

**Interfaces:**
- Consumes: `filterTasksForLayers`, `filterEventsForLayers`, `filterRoutinesForLayers`, `filterByLayers`, `useDomain().layers/soleDomain`, `DOMAINS`, `domainById`.
- Produces: `GuidedSession`'s `domain` prop is `DomainId | null` (was `PlanningDomain`).

- [ ] **Step 1: Replace each filter call.** Patterns:

```ts
// HomeView / HomeViewContainer / InboxView
const { layers, soleDomain } = useDomain()
const filteredTasks = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
const filteredRoutines = useMemo(() => filterRoutinesForLayers(routines, layers), [routines, layers])
const filteredProjects = useMemo(() => filterByLayers(projects, layers), [projects, layers])
const filteredEvents = useMemo(() => filterEventsForLayers(events, layers, { eventContextOverrides, getDomainForCalendar, eventNotesMap }), [...])

// GuidedSessionContainer (was filterTasksForPlanning — the inbox exception is now just the Unsorted layer)
const domainTasks = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
const domainProjects = useMemo(() => filterByLayers(projects, layers), [projects, layers])
const domainGoals = useMemo(() => filterByLayers(goals, layers), [goals, layers])
// line 112: `if (currentDomain === 'universal') return` → `if (!soleDomain) return`; stamp `soleDomain`.
// line 186: <GuidedSession domain={soleDomain} …>

// horizons/shared.tsx:206, 329; SeasonPage; GoalsApp; ProjectsApp
tasks.filter((t) => matchesLayers(t.context, layers))

// RoutinesApp:47-54 — a Step inherits its collection's layer
routines.filter((r) => {
  if (matchesLayers(r.context, layers)) return true
  const parent = r.parent_routine_id ? byId.get(r.parent_routine_id) : undefined
  return !!parent && matchesLayers(parent.context, layers)
})

// NotePicker: prop `layers: ReadonlySet<Layer>`; `if (!matchesLayers(n.context, layers)) return false`
```

- [ ] **Step 2: Page tint.** `HomeView.tsx:442-450` → `const tint = soleDomain ? domainById(soleDomain).bgClass : ''`. `DomainPageOutline.tsx` → key `outlineEffects` by `DomainId`, `const effect = soleDomain ? outlineEffects[soleDomain] : null`, render the vignette only when `effect` is non-null.

- [ ] **Step 3: Delete the old helpers** from `domainFilter.ts` and fix the header comment to describe layers. Update `domainSessionToken`:

```ts
/** planning_sessions period token. A sole domain gets its own session; the
 *  bare token is the whole-life session, so every pre-existing row keeps working. */
export function domainSessionToken(baseToken: string, domain: DomainId | null): string {
  return domain ? `${baseToken}|${domain}` : baseToken
}
```

- [ ] **Step 4: tsc, then chase every error it reports** — they are exactly the remaining `PlanningDomain`/old-helper references. `grep -rn "PlanningDomain\|filterTasksForDomainView\|filterTasksForPlanning\|filterEventsForDomain\b\|filterRoutinesForDomain\|matchesDomain\|DOMAIN_LABELS" src` must return nothing.

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run`
Expected: PASS. (If `planningParity.test.ts` or `contextParity.test.ts` assert the OLD "untagged shows everywhere" rule, rewrite that assertion to the layer rule: untagged shows iff Unsorted is checked.)

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(domain): every surface filters on the layer set; single-lens helpers deleted"
```

---

### Task 8: Scope is derived everywhere; scope picker removed; tripwire widened

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts:9, 542, 617, 655, 1050-1078, 1156-1166, 1312-1315, 1374-1392`
- Modify: `src/hooks/useRoutines.ts:5, 59, 82, 271, 316-324`
- Modify: `src/hooks/useProjects.ts:111`, `src/hooks/useNotes.ts:204`, `src/hooks/usePhotoCapture.ts:68`, `src/desktop/captureInsert.ts:17`, `src/components/wall-v2/WallV2Shell.tsx:521`
- Modify: `src/components/surface/sections/PanelClassify.tsx` (drop scope control), `src/components/surface/TapContextPanel.tsx:88, 241-242`, `src/apps/tasks/TaskDetailPanel.tsx:289`
- Modify: `supabase/functions/symphony-agent/index.ts:603-605, 762, 783-787, 880`, `supabase/functions/extract-capture/index.ts:72,168`, `supabase/functions/vault-sync/index.ts:333`
- Modify: `src/lib/scope.ts` — delete `defaultScopeForArea`, `scopeForContextChange`
- Modify: `src/lib/scopeDefaultCoverage.test.ts` (widen), `src/hooks/useSupabaseTasks.assignScope.test.ts` (rewrite cases), `src/hooks/useRoutines.scope.test.ts` (adjust)

**Interfaces:**
- Consumes: `scopeForDomain(context, assignees, selfMemberId)`.
- `AddTaskOptions.scope` and `CreateRoutineInput.scope` / `UpdateRoutineInput.scope` are **removed**. `Partial<Task>.scope` in `updateTask` is ignored (scope is recomputed).
- Edge functions (Deno, can't import `src/`): each keeps one local `scopeFor(context, assignees, self)` with the same body, and a comment naming `src/lib/scope.ts` as canonical.

- [ ] **Step 1: Rewrite `useSupabaseTasks.assignScope.test.ts` cases** (keep the file's mock harness; replace the `describe` body):

```ts
describe('scope is derived from domain + assignees on every task write', () => {
  it('assigning a private task to a partner shares it as couple', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: PARTNER.id }))
    expect(rowWrites.at(-1)!.data).toMatchObject({ assigned_to: PARTNER.id, scope: 'couple' })
  })

  it('assigning to yourself changes nothing about sharing', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: ME.id }))
    expect(rowWrites.at(-1)!.data.scope).toBe('individual')
  })

  it('un-assigning takes the share back', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'couple', assigned_to: PARTNER.id }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: undefined, assignedToAll: undefined }))
    expect(rowWrites.at(-1)!.data.scope).toBe('individual')
  })

  it('re-tagging family → personal on a compound row makes it private (the August leak)', async () => {
    mockSupabaseData.push(dbTask({ context: 'family', scope: 'compound' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { context: 'personal' }))
    expect(rowWrites.at(-1)!.data).toMatchObject({ context: 'personal', scope: 'individual' })
  })

  it('tagging family shares with the household even if the caller passed a scope', async () => {
    mockSupabaseData.push(dbTask({ context: null, scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { context: 'family', scope: 'individual' }))
    expect(rowWrites.at(-1)!.data.scope).toBe('compound')
  })
})
```

- [ ] **Step 2: Run — expect the last three to fail** (`npx vitest run src/hooks/useSupabaseTasks.assignScope.test.ts`).

- [ ] **Step 3: `useSupabaseTasks.ts`.**
  - Import: `import { scopeForDomain, type Scope } from '@/lib/scope'`.
  - Remove `scope?: Scope` from the add options (line 542). In `addTask` (617, 655): `scope: scopeForDomain(options?.context ?? null, [effectiveAssignedTo, ...(options?.assignedToAll ?? [])], getCurrentUserMember()?.id)`.
  - `updateTask`: delete the whole assignment→couple block (1050–1078) and the scope block (1156–1166). After `dbUpdates.context` is set, add:
    ```ts
    // Scope is DERIVED. Recompute whenever anything it depends on moves; a
    // caller-supplied `scope` is ignored on purpose.
    if ('context' in updates || 'assignedTo' in updates || 'assignedToAll' in updates) {
      const next = { ...task, ...updates }
      dbUpdates.scope = scopeForDomain(
        next.context ?? null,
        [next.assignedTo, ...(next.assignedToAll ?? [])],
        getCurrentUserMember()?.id,
      )
    }
    ```
    Keep the "Shared with X" toast: after computing, `if (dbUpdates.scope === 'couple' && task.scope !== 'couple') showToast(…)`. Also make the optimistic local task carry the same `scope`.
  - `updateTasksBulk`: delete lines 1312–1315 and the unshare block 1374–1392. Instead, when `'context' in updates || 'assignedTo' in updates || 'assignedToAll' in updates`, group `tasksToUpdate` by their computed scope and issue one `.update({ ...dbUpdates, scope }).in('id', ids)` per group (replacing the single bulk update). Never `upsert`.
- [ ] **Step 4: `useRoutines.ts`.** Remove `scope` from both input types. `addRoutine`: `scope: scopeForDomain(input.context ?? null, [effectiveAssignedTo, ...(input.assigned_to_all ?? [])], currentMemberId)` (find how the hook already resolves the current member for `effectiveAssignedTo`; reuse it). `updateRoutine`: replace 316–324 with a recompute from `{ ...current, ...input }` whenever `context`/`assigned_to`/`assigned_to_all` is in the input. Adjust `useRoutines.scope.test.ts` expectations that passed an explicit `scope` (they now assert derivation).
- [ ] **Step 5: Other src writers.** `useProjects:111`, `useNotes:204`, `usePhotoCapture:68`, `captureInsert:17`, `WallV2Shell:521` → `scopeForDomain(context, [], null)` (none of these assign). `actionable.ts` comment: point at `scopeForDomain`.
- [ ] **Step 6: Remove the scope control.** `PanelClassify`: delete `scope`/`onScopeChange` props, `SCOPE_OPTIONS`, the `role="group"` block and the lucide imports it used. `TapContextPanel`: delete the prop and the two JSX lines. `TaskDetailPanel:289`: delete the line. `UsView` is read-only on scope — untouched.
- [ ] **Step 7: Edge functions.** In each of the three, add near the top:
    ```ts
    // Mirror of src/lib/scope.ts scopeForDomain — the app's single scope rule.
    function scopeFor(context: string | null | undefined, assignees: (string | null | undefined)[], self: string | null): 'individual' | 'couple' | 'compound' {
      if (context === 'family') return 'compound'
      return assignees.some((a) => a && a !== self) ? 'couple' : 'individual'
    }
    ```
    `symphony-agent`: 603–605 → `row.scope = scopeFor(row.context, [row.assigned_to, ...(row.assigned_to_all ?? [])], currentMemberId)` (unconditional); 762 same for routines; 783–787 → always recompute from `{ ...before, ...updates }` when `context`/`assigned_to`/`assigned_to_all` is in `updates`, selecting those columns in the `before` query; 880 → `scopeFor(input.context, [], null)`. `extract-capture` 72/168 and `vault-sync` 333 → `scopeFor(context, [], null)` (extract-capture stays `context: 'family'` — it ingests the household's school/activity feeds and is family by construction, like the wall).
- [ ] **Step 8: Delete `defaultScopeForArea` and `scopeForContextChange`** from `scope.ts`, then `grep -rn "defaultScopeForArea\|scopeForContextChange" src supabase` → nothing.
- [ ] **Step 9: Widen the tripwire.** In `scopeDefaultCoverage.test.ts`:
  - Replace the `defaultScopeForArea` import/test with `scopeForDomain('family', [], null) === 'compound'`.
  - Keep the "context implies scope" scan as is.
  - Add: **no literal scope outside scope.ts** —
    ```ts
    it('no source file outside scope.ts writes a literal scope value', () => {
      const offenders: string[] = []
      for (const file of [...sourceFiles(SRC), ...sourceFiles(FUNCTIONS)]) {
        const rel = file.replace(process.cwd() + '/', '')
        if (rel === 'src/lib/scope.ts') continue
        const text = stripComments(readFileSync(file, 'utf8'))
        if (/\bscope:\s*'(individual|couple|compound)'/.test(text)) offenders.push(rel)
      }
      expect(offenders, 'scope is derived by scopeForDomain — never written as a literal').toEqual([])
    })
    ```
    The edge functions' `scopeFor` helpers use `return '…'`, not `scope: '…'`, so they pass; `UsView`'s reads compare with `===`, so they pass. Replace the old extract-capture / vault-sync pinned assertions with `expect(text).toMatch(/scope:\s*scopeFor\(/)` for each of the three functions.
  - Mutation check (once, by hand): temporarily change `captureInsert.ts` to `scope: 'individual'`, run the test, see it fail, revert.
- [ ] **Step 10: Run everything**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run && npm run lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add -A src supabase/functions
git commit -m "feat(scope): scope is derived by scopeForDomain on every write; scope picker removed"
```

---

### Task 9: Every capture lands Unsorted

**Files:**
- Modify: `src/shell/useShellChrome.ts:57, 107, 111, 123, 166`
- Modify: `src/components/layout/QuickCapture.tsx:76, 87, 103, 496-511`
- Modify: `src/hooks/useQuickParse.ts:6, 41, 77, 79`
- Modify: `src/components/schedule/InboxView.tsx:264`, `src/apps/tasks/InboxViewContainer.tsx:106`, `src/apps/tasks/HomeViewContainer.tsx:306, 344, 362, 391`, `src/apps/tasks/horizons/WeekPage.tsx:223`, `src/apps/tasks/horizons/shared.tsx:442`, `src/hooks/useCommitPage.ts:61`
- Modify (deliberate creates → `soleDomain`): `src/components/routine/RoutineBuilderModal.tsx:68`, `src/apps/routines/RoutinesApp.tsx:94,104,187`, `src/apps/projects/ProjectsApp.tsx:47`, `src/apps/goals/GoalsApp.tsx:46`, `src/apps/tasks/horizons/SeasonPage.tsx:270`, `src/components/planning/guided/GuidedSessionContainer.tsx:51,140,155`
- Modify: `src/contexts/ScheduleActionsContext.tsx:158`, `src/components/schedule/TimelineQuickInput.tsx:47`, `TodayAddInput.tsx:36`, `TimelineInsertPoint.tsx:21`, `TodaySectionList.tsx:100` — rename the prop `currentDomain` → `soleDomain: DomainId | null`.
- Test: `src/hooks/useQuickParse.test.ts` (extend), `src/components/layout/QuickCapture.test.tsx` (extend)

**Interfaces:**
- `useQuickParse(title, ctx, resolver?)` — the domain parameter is **removed**; `effectiveParsed.context` is only what the text said (`#work`) or an override.
- Rule: capture paths write `context: null`. Deliberate-create paths pre-fill `soleDomain ?? undefined`.

- [ ] **Step 1: Failing test in `useQuickParse.test.ts`**

```ts
it('does not stamp a context from the lens — only explicit syntax or an override sets one', () => {
  const { result } = renderHook(() => useQuickParse('Call the plumber', ctx))
  expect(result.current.effectiveParsed.context).toBeUndefined()
  const { result: r2 } = renderHook(() => useQuickParse('Call the plumber #family', ctx))
  expect(r2.current.effectiveParsed.context).toBe('family')
})
```
(Match the file's existing `ctx` fixture and `#`/`@` syntax — read the parser test to confirm which token sets context.)

- [ ] **Step 2: Run — fails on arity/type.**

- [ ] **Step 3: Edit.**
  - `useQuickParse`: drop the `Domain` type and param; line 77 → `context: overrides.context === null ? undefined : (overrides.context ?? parsed.context)`.
  - Capture sites listed above: replace `context: currentDomain !== 'universal' ? currentDomain : undefined` with `context: undefined` (or delete the key) and drop `currentDomain` from deps. `useCommitPage:61` → `const context = null`. `QuickCapture:87` → `photo.captureFromFile(named, null)`.
  - `QuickCapture:496-511` — the "Add to X?" chip is the user choosing, so keep it but key off `soleDomain`: `{!effectiveParsed.isNote && soleDomain && !effectiveParsed.context && (… applyContext(soleDomain) … domainById(soleDomain).label …)}`.
  - Deliberate-create sites: `context: soleDomain ?? undefined`.
  - Prop rename `currentDomain` → `soleDomain` through the ScheduleActionsContext chain; `TimelineQuickInput`/`TodayAddInput` pass nothing to `useQuickParse` for domain now, so the prop may end up unused — if so delete it rather than keep a dead prop.
- [ ] **Step 4: Failing→passing test in `QuickCapture.test.tsx`:** render with the provider set to `only('work')` (via a wrapper that calls `useDomain().only`), type "Buy milk", submit, and assert the `addTask` mock was called with options whose `context` is `undefined`/`null`.
- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/hooks/useQuickParse.test.ts src/components/layout src/shell src/apps`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(capture): every capture lands Unsorted; deliberate creates pre-fill the sole domain"
```

---

### Task 10: Domain gate — processing an Unsorted item asks for a domain first

**Files:**
- Create: `src/components/domain/DomainChooser.tsx` (three buttons, reused by Task 11)
- Create: `src/components/domain/DomainGate.tsx` (provider + modal + `useDomainGate`)
- Create: `src/hooks/useGatedTaskActions.ts`
- Modify: `src/main.tsx:143` (mount `DomainGateProvider` inside `DomainProvider`), `src/test/test-utils.tsx:14`
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (provider value: `onUpdateTask`, `onPushTask`, `onUpdateTasksBulk`, `onAssignTask`, `onAssignTaskAll`), `src/apps/tasks/InboxViewContainer.tsx:120-129`, `src/apps/tasks/horizons/shared.tsx` (wherever it exposes the same handlers)
- Test: `src/hooks/useGatedTaskActions.test.ts`, `src/components/domain/DomainGate.test.tsx`

**Interfaces:**
```ts
// DomainChooser
export function DomainChooser(props: { onChoose: (d: DomainId) => void; size?: 'sm' | 'md' }): JSX.Element

// DomainGate
export function DomainGateProvider({ children }): JSX.Element
export function useDomainGate(): { requireDomain: (task: Pick<Task,'id'|'title'|'context'>) => Promise<DomainId | null> }
//   resolves immediately with task.context when non-null; otherwise opens the modal and resolves the choice, or null on cancel.

// useGatedTaskActions
export function useGatedTaskActions(raw: {
  updateTask: (id: string, u: Partial<Task>) => Promise<void> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void> | void
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<void>
  onAssignTask?: (id: string, memberId: string | null) => void
  onAssignTaskAll?: (id: string, ids: string[]) => void
}, findTask: (id: string) => Task | undefined): the same five, gated
```
- Gate rule (`needsDomain(task, updates)`): `task.context == null && !('context' in updates && updates.context) && (('scheduledFor' in updates && updates.scheduledFor) || ('bucket' in updates && updates.bucket !== 'inbox') || 'weekStart' in updates || 'assignedTo' in updates || 'assignedToAll' in updates || ('projectId' in updates && updates.projectId))`. Push and assign always need one when `context == null`.

- [ ] **Step 1: Failing test for the pure rule + wrapper** (`useGatedTaskActions.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest'
import { needsDomain, gateUpdate } from './useGatedTaskActions'

const unsorted = { id: 't', title: 'x', context: null } as never
const tagged = { id: 't', title: 'x', context: 'work' } as never

describe('needsDomain', () => {
  it('scheduling, bucketing, assigning, or projecting an Unsorted task needs a domain', () => {
    expect(needsDomain(unsorted, { scheduledFor: new Date() })).toBe(true)
    expect(needsDomain(unsorted, { bucket: 'week' })).toBe(true)
    expect(needsDomain(unsorted, { assignedToAll: ['m'] })).toBe(true)
    expect(needsDomain(unsorted, { projectId: 'p' })).toBe(true)
  })
  it('does not fire for a tagged task, a title edit, or an update that carries its own context', () => {
    expect(needsDomain(tagged, { scheduledFor: new Date() })).toBe(false)
    expect(needsDomain(unsorted, { title: 'y' })).toBe(false)
    expect(needsDomain(unsorted, { scheduledFor: new Date(), context: 'family' })).toBe(false)
  })
})

describe('gateUpdate', () => {
  it('asks, then writes the update WITH the chosen domain; cancel writes nothing', async () => {
    const write = vi.fn()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => 'family', write)
    expect(write).toHaveBeenCalledWith('t', { bucket: 'week', context: 'family' })
    write.mockClear()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => null, write)
    expect(write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — fails (module missing).**

- [ ] **Step 3: Write `useGatedTaskActions.ts`**

```ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { useDomainGate } from '@/components/domain/DomainGate'

type Ask = (task: Pick<Task, 'id' | 'title' | 'context'>) => Promise<DomainId | null>

/** Iris's rule: any process on an Unsorted item has to involve giving it a
 *  domain. These are the processes. A bare title/notes edit is not one. */
export function needsDomain(task: Pick<Task, 'context'>, updates: Partial<Task>): boolean {
  if (task.context != null) return false
  if ('context' in updates && updates.context) return false
  return (
    ('scheduledFor' in updates && !!updates.scheduledFor) ||
    ('bucket' in updates && updates.bucket !== 'inbox') ||
    'weekStart' in updates ||
    'assignedTo' in updates ||
    'assignedToAll' in updates ||
    ('projectId' in updates && !!updates.projectId)
  )
}

export async function gateUpdate(
  task: Pick<Task, 'id' | 'title' | 'context'>,
  updates: Partial<Task>,
  ask: Ask,
  write: (id: string, u: Partial<Task>) => Promise<void> | void,
): Promise<void> {
  if (!needsDomain(task, updates)) { await write(task.id, updates); return }
  const context = await ask(task)
  if (!context) return
  await write(task.id, { ...updates, context })
}

export function useGatedTaskActions<R extends {
  updateTask: (id: string, u: Partial<Task>) => Promise<void> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void> | void
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<void>
  onAssignTask?: (id: string, memberId: string | null) => void
  onAssignTaskAll?: (id: string, ids: string[]) => void
}>(raw: R, findTask: (id: string) => Task | undefined): R {
  const { requireDomain } = useDomainGate()
  return useMemo(() => ({
    ...raw,
    updateTask: async (id, updates) => {
      const t = findTask(id)
      if (!t) return raw.updateTask(id, updates)
      return gateUpdate(t, updates, requireDomain, raw.updateTask)
    },
    pushTask: async (id, target) => {
      const t = findTask(id)
      if (t && t.context == null) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      return raw.pushTask(id, target)
    },
    updateTasksBulk: async (ids, updates) => {
      const untagged = ids.map(findTask).filter((t): t is Task => !!t && needsDomain(t, updates))
      if (untagged.length === 0) return raw.updateTasksBulk(ids, updates)
      const context = await requireDomain({ id: untagged[0].id, title: `${untagged.length} items`, context: null })
      if (!context) return
      await raw.updateTasksBulk(ids, { ...updates, context })
    },
    onAssignTask: raw.onAssignTask && (async (id, memberId) => {
      const t = findTask(id)
      if (t && t.context == null && memberId) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      raw.onAssignTask!(id, memberId)
    }),
    onAssignTaskAll: raw.onAssignTaskAll && (async (id, memberIds) => {
      const t = findTask(id)
      if (t && t.context == null && memberIds.length > 0) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      raw.onAssignTaskAll!(id, memberIds)
    }),
  }) as R, [raw, findTask, requireDomain])
}
```

- [ ] **Step 4: Write `DomainChooser.tsx` and `DomainGate.tsx`**

```tsx
// DomainChooser.tsx
import { DOMAINS, type DomainId } from '@/lib/domains'
export function DomainChooser({ onChoose, size = 'md' }: { onChoose: (d: DomainId) => void; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <div role="group" aria-label="Choose a domain" className="inline-flex gap-1.5">
      {DOMAINS.map(({ id, label, icon: Icon, color }) => (
        <button key={id} type="button" onClick={() => onChoose(id)}
          className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 ${pad}`}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
```

```tsx
// DomainGate.tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { DomainChooser } from './DomainChooser'

type Pending = { task: Pick<Task, 'id' | 'title' | 'context'>; resolve: (d: DomainId | null) => void }
const Ctx = createContext<{ requireDomain: (t: Pick<Task, 'id' | 'title' | 'context'>) => Promise<DomainId | null> } | null>(null)

export function DomainGateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const requireDomain = useCallback((task: Pick<Task, 'id' | 'title' | 'context'>) => {
    if (task.context) return Promise.resolve(task.context as DomainId)
    pendingRef.current?.resolve(null) // a second ask cancels the first
    return new Promise<DomainId | null>((resolve) => {
      const p = { task, resolve }
      pendingRef.current = p
      setPending(p)
    })
  }, [])
  const settle = (d: DomainId | null) => { pendingRef.current = null; pending?.resolve(d); setPending(null) }
  const value = useMemo(() => ({ requireDomain }), [requireDomain])
  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Which domain?" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20"
          onMouseDown={(e) => { if (e.target === e.currentTarget) settle(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') settle(null) }}>
          <div className="card p-5 max-w-sm w-[92vw]">
            <p className="text-sm text-neutral-500">Where does this belong?</p>
            <p className="font-display text-lg mt-1 mb-4 truncate">{pending.task.title}</p>
            <DomainChooser onChoose={settle} />
            <button type="button" onClick={() => settle(null)} className="mt-4 text-xs text-neutral-500 hover:text-neutral-800">Cancel</button>
          </div>
        </div>, document.body)}
    </Ctx.Provider>
  )
}

export function useDomainGate() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDomainGate must be used within DomainGateProvider')
  return ctx
}
```

- [ ] **Step 5: `DomainGate.test.tsx`** — render a button inside `DomainGateProvider` whose click calls `requireDomain({ id: 't', title: 'Call plumber', context: null })` and stores the result; assert the dialog appears with the title; click `Family` → result `'family'`, dialog gone; click again, press Escape → result `null`. Also: `requireDomain` with `context: 'work'` resolves `'work'` without a dialog.

- [ ] **Step 6: Mount and wire.** `main.tsx:143`: `<DomainProvider><DomainGateProvider>…</DomainGateProvider></DomainProvider>`; same in `test-utils.tsx`. In `HomeViewContainer`, `InboxViewContainer`, and `horizons/shared.tsx`, build `const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk, onAssignTask: scheduleActions.onAssignTask, onAssignTaskAll: scheduleActions.onAssignTaskAll }, findTaskById)` (`findTaskById` = `useCallback((id) => tasks.find(t => t.id === id), [tasks])`) and put `gated.*` into the provider value in place of the raw handlers. `InboxView` also calls `addTask`/`onPushTask` locally via the context — it gets the gated ones automatically.

- [ ] **Step 7: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/hooks/useGatedTaskActions.test.ts src/components/domain && npx vitest run`
Expected: PASS. If a Today/Inbox test now hangs on a pending gate, it is scheduling an untagged fixture — give the fixture a `context` (that is what the gate is for) or assert the dialog.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(domain): processing an Unsorted item asks for a domain first"
```

---

### Task 11: Re-filing strip in the Inbox

**Files:**
- Create: `src/components/schedule/RefileStrip.tsx`
- Create: `src/lib/today/refile.ts` (pure selector)
- Modify: `src/components/schedule/InboxView.tsx` (render the strip above the list)
- Test: `src/lib/today/refile.test.ts`, `src/components/schedule/RefileStrip.test.tsx`

**Interfaces:**
```ts
// refile.ts
export type RefileKind = 'family-private' | 'private-shared'
export interface RefileRow { task: Task; kind: RefileKind }
export function selectRefileRows(tasks: Task[], currentUserId: string | null): RefileRow[]
//   family-private: context==='family' && scope==='individual' && user_id===me (open tasks)
//   private-shared: context in (work,personal) && scope==='compound' && user_id===me (open tasks)
// RefileStrip: { rows: RefileRow[]; onFile: (task: Task, context: DomainId) => void }
```
- `Task` needs `userId` exposed. Check `useSupabaseTasks.ts:128` mapping — if `user_id` is not mapped onto `Task`, add `userId: dbTask.user_id` to the mapper and `userId?: string` to `src/types/task.ts`. `currentUserId` comes from `useAuth().user?.id`.
- Filing writes `updateTask(task.id, { context })` — Task 8's derivation sets scope; for "Keep private" on a `private-shared` row write `{ context: task.context }` (re-asserting the same context recomputes scope to individual because `'context' in updates`).

- [ ] **Step 1: Failing selector test**

```ts
import { describe, it, expect } from 'vitest'
import { selectRefileRows } from './refile'
import type { Task } from '@/types/task'
const t = (o: Partial<Task>) => ({ id: Math.random().toString(), title: 't', completed: false, bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), userId: 'me', ...o }) as Task

describe('selectRefileRows', () => {
  it('finds my open family/individual and work-or-personal/compound rows only', () => {
    const rows = selectRefileRows([
      t({ context: 'family', scope: 'individual' }),
      t({ context: 'personal', scope: 'compound' }),
      t({ context: 'family', scope: 'compound' }),
      t({ context: 'family', scope: 'individual', completed: true }),
      t({ context: 'family', scope: 'individual', userId: 'iris' }),
      t({ context: null, scope: 'individual' }),
    ], 'me')
    expect(rows.map((r) => r.kind)).toEqual(['family-private', 'private-shared'])
  })
})
```

- [ ] **Step 2: Run — fails.** **Step 3: Write `refile.ts`** to satisfy it (a `filter` + `map`, oldest first by `createdAt`).

- [ ] **Step 4: `RefileStrip.tsx`**

```tsx
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { DomainChooser } from '@/components/domain/DomainChooser'
import type { RefileRow } from '@/lib/today/refile'

export function RefileStrip({ rows, onFile }: { rows: RefileRow[]; onFile: (task: Task, context: DomainId) => void }) {
  if (rows.length === 0) return null
  const familyPrivate = rows.filter((r) => r.kind === 'family-private')
  const privateShared = rows.filter((r) => r.kind === 'private-shared')
  return (
    <section aria-label="Needs re-filing" className="card p-4 mb-4 space-y-3">
      {familyPrivate.length > 0 && (
        <p className="text-sm text-neutral-700">{familyPrivate.length} {familyPrivate.length === 1 ? 'item is' : 'items are'} marked Family but only you can see {familyPrivate.length === 1 ? 'it' : 'them'}.</p>
      )}
      {privateShared.length > 0 && (
        <p className="text-sm text-neutral-700">{privateShared.length} private {privateShared.length === 1 ? 'item is' : 'items are'} readable by the household.</p>
      )}
      <ul className="space-y-2">
        {rows.map(({ task, kind }) => (
          <li key={task.id} className="flex items-center justify-between gap-3">
            <span className="text-sm truncate">{task.title}</span>
            {kind === 'family-private'
              ? <DomainChooser size="sm" onChoose={(d) => onFile(task, d)} />
              : <span className="inline-flex gap-1.5">
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, task.context as DomainId)}>Keep private</button>
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, 'family')}>Move to Family</button>
                </span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: `RefileStrip.test.tsx`** — renders nothing for `[]`; with one `family-private` row shows the "marked Family" sentence and clicking `Personal` calls `onFile(task, 'personal')`; with one `private-shared` row clicking `Keep private` calls `onFile(task, task.context)`.

- [ ] **Step 6: Wire into `InboxView`** just above the inbox list: `const { user } = useAuth()`; `const refileRows = useMemo(() => selectRefileRows(tasks, user?.id ?? null), [tasks, user?.id])`; `<RefileStrip rows={refileRows} onFile={(t, context) => onUpdateTask?.(t.id, { context })} />`. Note `tasks` here is the unfiltered prop, not `filteredByDomain` — a stranded row must appear regardless of which layers are checked.

- [ ] **Step 7: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/lib/today/refile.test.ts src/components/schedule/RefileStrip.test.tsx src/components/schedule/InboxView.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(inbox): re-filing strip for family/private and private/shared rows"
```

---

### Task 12: Remove the transitional shim

**Files:**
- Modify: `src/hooks/useDomain.tsx` — delete `Domain` type, `currentDomain`, `setDomain`.
- Modify: `src/components/layout/Sidebar.tsx:107-109` — delete the dead `useDomain()` read.
- Any file `tsc` then flags.

- [ ] **Step 1:** Delete the shim; run `npx tsc -p tsconfig.app.json --noEmit`; fix each remaining reference by reading `layers`/`soleDomain`. `grep -rn "currentDomain\|'universal'" src` must return **nothing** outside comments describing history.
- [ ] **Step 2:** `npx vitest run && npm run lint` — PASS.
- [ ] **Step 3: Commit**

```bash
git add -A src
git commit -m "refactor(domain): remove the single-lens shim; layers are the only model"
```

---

### Task 13: Look at it, then ship

- [ ] **Step 1: Dev server in the worktree** (`cp ../../.env .` if `.env` is missing — a blank screen means it is). `npm run dev`, open `http://localhost:5173`.
- [ ] **Step 2: Walk the picker** on Today, Week, Month, Inbox: uncheck Work → work rows vanish; `Only Family`; `All`; reload → selection persisted. Trigger chip shows dots for 2–3 layers.
- [ ] **Step 3: Capture** "Test unsorted capture" from quick capture with `Only Work` on → it appears under Unsorted (check the Unsorted layer on), tag pulse visible, `context` null in the panel.
- [ ] **Step 4: Gate:** on that row, tap the calendar icon → Today → the "Where does this belong?" dialog appears; Cancel → row unchanged; again → Family → row is scheduled AND tagged Family. Open the panel: no Just me / Us / Everyone control.
- [ ] **Step 5: Derivation:** tag a personal task, assign to Iris → toast "Shared with Iris"; un-assign → (verify in Supabase table view) `scope` back to `individual`.
- [ ] **Step 6: The acceptance test.** Sign in as Scott and as Iris (two browsers), `Only Family` on both, same day → same rows. Any row one sees and the other doesn't must show up in that owner's re-filing strip.
- [ ] **Step 7: Wall unaffected:** `/wall-v2` still renders family items; no picker.
- [ ] **Step 8: Edge functions.** Deploy the three changed functions (`supabase functions deploy symphony-agent`, `extract-capture`, `vault-sync`) **before** pushing main.
- [ ] **Step 9: Ship**

```bash
git fetch origin && git rebase origin/main
npx tsc -p tsconfig.app.json --noEmit && npx vitest run && npm run lint
git push origin HEAD:main
gh api repos/{owner}/{repo}/deployments --jq '.[0].sha'   # confirm the deploy fired
git worktree remove .worktrees/domain-layers
```
- [ ] **Step 10: Memory.** Write `domain_layers_shipped.md` in the memory dir (model, the gate rule, the strip, the "scope is derived — never literal" tripwire, the `symphony-layers` key) and update the index; mark `context_chooser_filters_life_area_only.md` and `assignment_shares_never_relabels.md` as superseded.
