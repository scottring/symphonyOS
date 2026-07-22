# Routines Draggable Day Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the /routines day timeline and week band a drag-and-drop canvas: steps move between routines, routines move in time and across days, auto-groups get named on-canvas; the Tend drawer shrinks to suggestions + sleepers.

**Architecture:** Native HTML5 drag-and-drop (the `MonthCalendarGrid.tsx` pattern — `draggable` + `dataTransfer` + `onDragOver`/`onDrop`). Two new pure modules (`dragTypes.ts` payloads/time-mapping, `dropRules.ts` payload×target→intent), one tiny popover component, drag wiring in DailyArc/WeekStrip, and an intent executor in RhythmPage that composes the EXISTING handler props. No new RoutinesApp handlers, no new libraries.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (Nordic Journal), Vitest + RTL, lucide-react icons only.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-routines-drag-canvas-design.md` — read it if any step seems ambiguous.
- Drag payload keys exactly: `text/rhythm-payload` (JSON) plus gate keys `text/rhythm-kind-step|routine|collection|group`; `timeFromAxisX` maps linearly over ARC_START=360 → ARC_END=1290 minutes, clamps, rounds to 5 minutes, and returns `'06:00'` when `rect.width <= 0` (jsdom guard).
- Drop resolution table (payload × target → intent) is normative in the spec — implement exactly, null cases included (self-drop, chip on own day; step-onto-own-parent is filtered in the EXECUTOR, not dropRules).
- Tap keeps working everywhere drag is added (click opens panels; drag never replaces tap).
- Tend drawer keeps ONLY TendCard findings + SeasonalShelf; badge = `findings.length`; `groupSuggestionKey` is deleted from `tendHeuristics.ts`.
- Tests: `npx vitest run <paths>` (never plain `npm test`). PATH fix if node missing: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/rhythm-canvas` (branch `rhythm-canvas`). Never touch the main worktree.
- Mock DataTransfer for tests (reuse this exact factory wherever a test fires drag events):

```typescript
function mkDT() {
  const data: Record<string, string> = {}
  return {
    data,
    setData(k: string, v: string) { data[k] = v },
    getData(k: string) { return data[k] ?? '' },
    get types() { return Object.keys(data) },
    effectAllowed: 'none',
    dropEffect: 'none',
  }
}
```

---

### Task 1: dragTypes — payloads and time mapping

**Files:**
- Create: `src/components/routine/rhythm/dragTypes.ts`
- Test: `src/components/routine/rhythm/dragTypes.test.ts`
- Modify: `src/components/routine/rhythm/DailyArc.tsx` (import ARC constants instead of defining them)

**Interfaces:**
- Consumes: `DayKey` from `./rhythmModel`.
- Produces (Tasks 2, 4, 5, 6 rely on these exact names): `ARC_START`, `ARC_END`, `type DragPayload`, `setDragPayload(e, payload)`, `readDragPayload(e)`, `acceptsDrag(e, kinds)`, `timeFromAxisX(clientX, rect)`.

- [ ] **Step 1: Write the failing test**

Create `src/components/routine/rhythm/dragTypes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { setDragPayload, readDragPayload, acceptsDrag, timeFromAxisX, type DragPayload } from './dragTypes'

function mkDT() {
  const data: Record<string, string> = {}
  return {
    data,
    setData(k: string, v: string) { data[k] = v },
    getData(k: string) { return data[k] ?? '' },
    get types() { return Object.keys(data) },
    effectAllowed: 'none',
    dropEffect: 'none',
  }
}
const ev = (dt: ReturnType<typeof mkDT>) => ({ dataTransfer: dt }) as unknown as React.DragEvent

describe('drag payload round-trip', () => {
  it('carries a step payload with a kind gate key', () => {
    const dt = mkDT()
    const payload: DragPayload = { kind: 'step', id: 's1' }
    setDragPayload(ev(dt), payload)
    expect(readDragPayload(ev(dt))).toEqual(payload)
    expect(dt.types).toContain('text/rhythm-kind-step')
  })

  it('carries fromDay on routine payloads', () => {
    const dt = mkDT()
    setDragPayload(ev(dt), { kind: 'routine', id: 'r1', fromDay: 'thu' })
    expect(readDragPayload(ev(dt))).toEqual({ kind: 'routine', id: 'r1', fromDay: 'thu' })
  })

  it('returns null for foreign drags', () => {
    const dt = mkDT()
    dt.setData('text/plain', 'hello')
    expect(readDragPayload(ev(dt))).toBeNull()
  })
})

describe('acceptsDrag', () => {
  it('matches on gate keys without reading data', () => {
    const dt = mkDT()
    setDragPayload(ev(dt), { kind: 'group', ids: ['a', 'b'] })
    expect(acceptsDrag(ev(dt), ['group', 'step'])).toBe(true)
    expect(acceptsDrag(ev(dt), ['collection'])).toBe(false)
  })
})

describe('timeFromAxisX', () => {
  const rect = { left: 0, width: 1000 }
  it('maps the edges to the arc bounds', () => {
    expect(timeFromAxisX(0, rect)).toBe('06:00')
    expect(timeFromAxisX(1000, rect)).toBe('21:30')
  })
  it('maps the middle and rounds to 5 minutes', () => {
    expect(timeFromAxisX(500, rect)).toBe('13:45')      // 360 + 465 = 825
    expect(timeFromAxisX(501, rect)).toBe('13:45')      // rounds to nearest 5
  })
  it('clamps outside the axis', () => {
    expect(timeFromAxisX(-80, rect)).toBe('06:00')
    expect(timeFromAxisX(2000, rect)).toBe('21:30')
  })
  it('guards a zero-width rect (jsdom)', () => {
    expect(timeFromAxisX(300, { left: 0, width: 0 })).toBe('06:00')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/dragTypes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/routine/rhythm/dragTypes.ts`:

```typescript
import type { DayKey } from './rhythmModel'

export const ARC_START = 6 * 60   // 6:00
export const ARC_END = 21.5 * 60  // 21:30

export type DragPayload =
  | { kind: 'step'; id: string }
  | { kind: 'routine'; id: string; fromDay?: DayKey }
  | { kind: 'collection'; id: string }
  | { kind: 'group'; ids: string[] }

const PAYLOAD_KEY = 'text/rhythm-payload'
const kindKey = (kind: DragPayload['kind']) => `text/rhythm-kind-${kind}`

export function setDragPayload(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(PAYLOAD_KEY, JSON.stringify(payload))
  // Gate key: dataTransfer values are unreadable during dragover, but the
  // TYPES are — targets use these to decide whether to accept the drag.
  e.dataTransfer.setData(kindKey(payload.kind), '1')
  e.dataTransfer.effectAllowed = 'move'
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(PAYLOAD_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as DragPayload } catch { return null }
}

export function acceptsDrag(e: React.DragEvent, kinds: DragPayload['kind'][]): boolean {
  const types = Array.from(e.dataTransfer.types ?? [])
  return kinds.some(k => types.includes(kindKey(k)))
}

/** Map an x position on the day axis to 'HH:MM' (5-minute grid, clamped to the arc). */
export function timeFromAxisX(clientX: number, rect: { left: number; width: number }): string {
  if (rect.width <= 0) return '06:00'
  const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  const rounded = Math.round((ARC_START + frac * (ARC_END - ARC_START)) / 5) * 5
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}
```

In `src/components/routine/rhythm/DailyArc.tsx`, delete the local constants:

```typescript
const ARC_START = 6 * 60   // 6:00
const ARC_END = 21.5 * 60  // 21:30
```

and add to the imports:

```typescript
import { ARC_START, ARC_END } from './dragTypes'
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/dragTypes.test.ts src/components/routine/rhythm/DailyArc.test.tsx`
Expected: PASS (dragTypes 8 tests; DailyArc 6 unchanged tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/dragTypes.ts src/components/routine/rhythm/dragTypes.test.ts src/components/routine/rhythm/DailyArc.tsx
git commit -m "feat(rhythm): drag payload types + axis time mapping"
```

---

### Task 2: dropRules — payload × target → intent

**Files:**
- Create: `src/components/routine/rhythm/dropRules.ts`
- Test: `src/components/routine/rhythm/dropRules.test.ts`

**Interfaces:**
- Consumes: `DragPayload` from `./dragTypes`, `DayKey` from `./rhythmModel`.
- Produces (Tasks 4, 5, 6 rely on these exact names): `type DropTarget`, `type DropIntent`, `resolveDrop(payload, target): DropIntent | null`.

- [ ] **Step 1: Write the failing test**

Create `src/components/routine/rhythm/dropRules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveDrop } from './dropRules'

describe('collection-block target', () => {
  const target = { kind: 'collection-block', collectionId: 'bed' } as const
  it('folds steps, routines, and groups in as steps', () => {
    expect(resolveDrop({ kind: 'step', id: 's1' }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['s1'] })
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['r1'] })
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['a', 'b'] })
  })
  it('rejects collections (no nesting) and self-drops', () => {
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, target)).toBeNull()
    expect(resolveDrop({ kind: 'routine', id: 'bed' }, target)).toBeNull()
    expect(resolveDrop({ kind: 'group', ids: ['x', 'bed'] }, target)).toBeNull()
  })
})

describe('axis target', () => {
  const target = { kind: 'axis', time: '07:15' } as const
  it('promotes steps to stand alone at the drop time', () => {
    expect(resolveDrop({ kind: 'step', id: 's1' }, target))
      .toEqual({ type: 'stand-alone-at', id: 's1', time: '07:15' })
  })
  it('retimes routines and collections', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, target))
      .toEqual({ type: 'retime', id: 'r1', time: '07:15' })
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, target))
      .toEqual({ type: 'retime', id: 'camp', time: '07:15' })
  })
  it('shifts whole groups', () => {
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, target))
      .toEqual({ type: 'shift-group', ids: ['a', 'b'], time: '07:15' })
  })
})

describe('week-day target', () => {
  const thu = { kind: 'week-day', day: 'thu' } as const
  it('moves one day of a multi-day routine when fromDay is known', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1', fromDay: 'sat' }, thu))
      .toEqual({ type: 'move-day', id: 'r1', fromDay: 'sat', toDay: 'thu' })
  })
  it('is a no-op on the chip’s own day', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1', fromDay: 'thu' }, thu)).toBeNull()
  })
  it('sets weekly-on for day payloads without a source day', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['r1'], day: 'thu' })
    expect(resolveDrop({ kind: 'step', id: 's1' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['s1'], day: 'thu' })
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['camp'], day: 'thu' })
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, thu))
      .toEqual({ type: 'weekly-on', ids: ['a', 'b'], day: 'thu' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/dropRules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/routine/rhythm/dropRules.ts`:

```typescript
import type { DayKey } from './rhythmModel'
import type { DragPayload } from './dragTypes'

export type DropTarget =
  | { kind: 'collection-block'; collectionId: string }
  | { kind: 'axis'; time: string }
  | { kind: 'week-day'; day: DayKey }

export type DropIntent =
  | { type: 'add-steps'; collectionId: string; ids: string[] }
  | { type: 'stand-alone-at'; id: string; time: string }
  | { type: 'retime'; id: string; time: string }
  | { type: 'shift-group'; ids: string[]; time: string }
  | { type: 'weekly-on'; ids: string[]; day: DayKey }
  | { type: 'move-day'; id: string; fromDay: DayKey; toDay: DayKey }

/** Pure drop resolution. Null = incompatible or no-op drop; the executor
 *  additionally skips steps dropped onto their own parent. */
export function resolveDrop(payload: DragPayload, target: DropTarget): DropIntent | null {
  switch (target.kind) {
    case 'collection-block': {
      if (payload.kind === 'collection') return null
      const ids = payload.kind === 'group' ? payload.ids : [payload.id]
      if (ids.includes(target.collectionId)) return null
      return { type: 'add-steps', collectionId: target.collectionId, ids }
    }
    case 'axis': {
      if (payload.kind === 'step') return { type: 'stand-alone-at', id: payload.id, time: target.time }
      if (payload.kind === 'group') return { type: 'shift-group', ids: payload.ids, time: target.time }
      return { type: 'retime', id: payload.id, time: target.time }
    }
    case 'week-day': {
      if (payload.kind === 'routine' && payload.fromDay) {
        if (payload.fromDay === target.day) return null
        return { type: 'move-day', id: payload.id, fromDay: payload.fromDay, toDay: target.day }
      }
      const ids = payload.kind === 'group' ? payload.ids : [payload.id]
      return { type: 'weekly-on', ids, day: target.day }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/dropRules.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/dropRules.ts src/components/routine/rhythm/dropRules.test.ts
git commit -m "feat(rhythm): pure drop-intent resolution rules"
```

---

### Task 3: GroupNamePopover

**Files:**
- Create: `src/components/routine/rhythm/GroupNamePopover.tsx`
- Test: `src/components/routine/rhythm/GroupNamePopover.test.tsx`

**Interfaces:**
- Consumes: `RhythmCard` type from `./rhythmModel`.
- Produces (Task 4 relies on this): `GroupNamePopover` with props `{ card, foldTargets, onName, onFoldInto, onClose }` — `onName(card, name)`, `onFoldInto(targetId, memberIds)`.

- [ ] **Step 1: Write the failing test**

Create `src/components/routine/rhythm/GroupNamePopover.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupNamePopover } from './GroupNamePopover'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

const r = (id: string, name: string) => ({ id, name } as Routine)
const card: RhythmCard = {
  kind: 'cluster', id: 'c1', name: null, startTime: '19:01:00', endTime: '19:06:00',
  suggestedName: 'Bedtime', routines: [r('a', 'Hamper'), r('b', 'Reading')],
}
const base = { card, foldTargets: [] as { id: string; name: string }[], onName: vi.fn(), onFoldInto: vi.fn(), onClose: vi.fn() }

describe('GroupNamePopover', () => {
  it('names the group on Enter and closes', () => {
    const onName = vi.fn(); const onClose = vi.fn()
    render(<GroupNamePopover {...base} onName={onName} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onName).toHaveBeenCalledWith(card, 'Evening reset')
    expect(onClose).toHaveBeenCalled()
  })

  it('folds into an exact-name match instead of creating', () => {
    const onName = vi.fn(); const onFoldInto = vi.fn()
    render(<GroupNamePopover {...base} onName={onName} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'kids bedtime routine' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
    expect(onName).not.toHaveBeenCalled()
  })

  it('filters suggestions by typed text and folds on click', () => {
    const onFoldInto = vi.fn()
    render(<GroupNamePopover {...base} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }, { id: 'camp', name: 'Camp Mornings' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'bedtime' } })
    expect(screen.queryByRole('button', { name: 'Camp Mornings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
  })

  it('closes on Escape without acting', () => {
    const onClose = vi.fn(); const onName = vi.fn()
    render(<GroupNamePopover {...base} onClose={onClose} onName={onName} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Name this rhythm'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onName).not.toHaveBeenCalled()
  })

  it('excludes the group’s own members from suggestions', () => {
    render(<GroupNamePopover {...base} foldTargets={[{ id: 'a', name: 'Hamper' }, { id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    expect(screen.queryByRole('button', { name: 'Hamper' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kids Bedtime Routine' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/GroupNamePopover.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/routine/rhythm/GroupNamePopover.tsx`:

```tsx
import { useState } from 'react'
import type { RhythmCard } from './rhythmModel'

/** Inline popover under an auto-group title: name it into a rhythm, or fold
 *  its members into an existing routine (exact name match folds too). */
export function GroupNamePopover({ card, foldTargets, onName, onFoldInto, onClose }: {
  card: RhythmCard
  foldTargets: { id: string; name: string }[]
  onName: (card: RhythmCard, name: string) => void
  onFoldInto: (targetId: string, memberIds: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const memberIds = card.routines.map(r => r.id)
  const targets = foldTargets.filter(t => !memberIds.includes(t.id))
  const typed = name.trim().toLowerCase()
  const suggestions = targets.filter(t => !typed || t.name.toLowerCase().includes(typed)).slice(0, 4)

  const submit = () => {
    if (!name.trim()) return
    const exact = targets.find(t => t.name.toLowerCase() === typed)
    if (exact) onFoldInto(exact.id, memberIds)
    else onName(card, name.trim())
    onClose()
  }

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-lg"
      onClick={e => e.stopPropagation()}
    >
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Name this rhythm"
        className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">or add these into</span>
          {suggestions.map(t => (
            <button
              key={t.id}
              onClick={() => { onFoldInto(t.id, memberIds); onClose() }}
              className="text-left text-xs rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900 hover:bg-emerald-100 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/GroupNamePopover.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/GroupNamePopover.tsx src/components/routine/rhythm/GroupNamePopover.test.tsx
git commit -m "feat(rhythm): on-canvas group naming popover"
```

---

### Task 4: DailyArc — drag wiring + popover

**Files:**
- Modify: `src/components/routine/rhythm/DailyArc.tsx` (full rewrite below)
- Test: `src/components/routine/rhythm/DailyArc.test.tsx` (append new tests; keep the 6 existing ones — ONE existing test changes, see Step 1)

**Interfaces:**
- Consumes: Task 1 (`setDragPayload`, `acceptsDrag`, `readDragPayload`, `timeFromAxisX`, ARC constants), Task 2 (`resolveDrop`, `DropIntent`), Task 3 (`GroupNamePopover`).
- Produces: `DailyArcProps` gains OPTIONAL `onDropIntent?: (intent: DropIntent) => void`, `foldTargets?: { id: string; name: string }[]`, `onNameGroup?: (card: RhythmCard, name: string) => void`, `onFoldInto?: (targetId: string, ids: string[]) => void`. Task 6 relies on these names. When the new props are omitted the component renders exactly as before (all drag/naming affordances hidden) — existing consumers keep working.

- [ ] **Step 1: Update the test file**

In `src/components/routine/rhythm/DailyArc.test.tsx`, first CHANGE one existing test: `'titles auto-groups with the daypart as plain text — no rename affordance'` — the title becomes a button again (it opens the popover when naming props are present). Replace that test with:

```tsx
  it('renders auto-group titles as plain text when no naming props are given', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Bedtime').closest('button')).toBeNull()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
```

Then append these tests (inside the same `describe`), plus the `mkDT` factory from Global Constraints at module scope:

```tsx
  const dragProps = { onDropIntent: vi.fn(), foldTargets: [], onNameGroup: vi.fn(), onFoldInto: vi.fn() }

  it('sets a routine payload when dragging a cluster pill', () => {
    const dt = mkDT()
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '06:30:00', endTime: '07:00:00',
      suggestedName: 'Morning', routines: [mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ id: 'feed', name: 'Feed Jax' })],
    }
    render(<DailyArc {...base} {...dragProps} cards={[card]} anytime={[]} />)
    fireEvent.dragStart(screen.getByText('Walk Jax').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'routine', id: 'walk' })
  })

  it('sets a step payload when dragging a collection step pill', () => {
    const dt = mkDT()
    const parent = mk({ id: 'camp', name: 'Camp Mornings' })
    const card: RhythmCard = {
      kind: 'collection', id: 'camp', name: 'Camp Mornings', startTime: '07:00:00', endTime: '07:00:00',
      routines: [mk({ id: 'pack', name: 'Pack bags', parent_routine_id: 'camp' })], routine: parent,
    }
    render(<DailyArc {...base} {...dragProps} cards={[card]} anytime={[]} />)
    fireEvent.dragStart(screen.getByText('Pack bags').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'step', id: 'pack' })
  })

  it('dropping a pill on a collection block emits add-steps', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'hamper' }))
    dt.setData('text/rhythm-kind-routine', '1')
    const parent = mk({ id: 'bed', name: 'Kids Bedtime' })
    const card: RhythmCard = {
      kind: 'collection', id: 'bed', name: 'Kids Bedtime', startTime: '19:15:00', endTime: '19:15:00',
      routines: [mk({ id: 'read', name: 'Read', parent_routine_id: 'bed' })], routine: parent,
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByTestId('arc-card-bed'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'add-steps', collectionId: 'bed', ids: ['hamper'] })
  })

  it('dropping a step on the axis emits stand-alone-at (jsdom time guard → 06:00)', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'step', id: 'pack' }))
    dt.setData('text/rhythm-kind-step', '1')
    const card: RhythmCard = {
      kind: 'single', id: 'walk', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' })],
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByTestId('arc-axis'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'stand-alone-at', id: 'pack', time: '06:00' })
  })

  it('tapping an auto-group title opens the naming popover and names through', () => {
    const onNameGroup = vi.fn()
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '19:00:00', endTime: '19:06:00',
      suggestedName: 'Bedtime', routines: [mk({ id: 'a' }), mk({ id: 'b' })],
    }
    render(<DailyArc {...base} {...dragProps} onNameGroup={onNameGroup} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /bedtime/i }))
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameGroup).toHaveBeenCalledWith(card, 'Evening reset')
  })

  it('anytime pills are draggable with a routine payload', () => {
    const dt = mkDT()
    const pt = mk({ id: 'pt', name: 'PT Exercises' })
    render(<DailyArc {...base} {...dragProps} cards={[]} anytime={[pt]} />)
    fireEvent.dragStart(screen.getByText('PT Exercises').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'routine', id: 'pt' })
  })
```

Note: the axis needs `data-testid="arc-axis"` (added in Step 3). The axis renders only when `cards.length > 0` — the axis-drop test includes one card for that reason.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/DailyArc.test.tsx`
Expected: FAIL — new tests can't find draggable elements / arc-axis.

- [ ] **Step 3: Rewrite DailyArc**

Replace the entire contents of `src/components/routine/rhythm/DailyArc.tsx` with:

```tsx
import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { GripVertical } from 'lucide-react'
import { minutesOf, resolveMembers, type RhythmCard } from './rhythmModel'
import { formatRange, formatClock } from './format'
import { ARC_START, ARC_END, setDragPayload, readDragPayload, acceptsDrag, timeFromAxisX, type DragPayload } from './dragTypes'
import { resolveDrop, type DropIntent } from './dropRules'
import { GroupNamePopover } from './GroupNamePopover'

export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  nowMinutes: number
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  /** Drag-and-drop: when present, pills/headers become draggable and the
   *  axis + collection blocks become drop targets. */
  onDropIntent?: (intent: DropIntent) => void
  /** On-canvas group naming (popover under auto-group titles). */
  foldTargets?: { id: string; name: string }[]
  onNameGroup?: (card: RhythmCard, name: string) => void
  onFoldInto?: (targetId: string, ids: string[]) => void
}

function pct(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, ARC_START), ARC_END)
  return ((clamped - ARC_START) / (ARC_END - ARC_START)) * 100
}

const RULER_MARKS: { label: string; minutes: number }[] = [
  { label: '6 am', minutes: 6 * 60 },
  { label: '9 am', minutes: 9 * 60 },
  { label: 'noon', minutes: 12 * 60 },
  { label: '4 pm', minutes: 16 * 60 },
  { label: '7 pm', minutes: 19 * 60 },
  { label: '9 pm', minutes: 21 * 60 },
]

/** Payload for a pill inside a card: collection steps travel as steps,
 *  cluster members and singles travel as loose routines. */
function pillPayload(card: RhythmCard, r: Routine): DragPayload {
  return card.kind === 'collection' ? { kind: 'step', id: r.id } : { kind: 'routine', id: r.id }
}

function headerPayload(card: RhythmCard): DragPayload {
  if (card.kind === 'collection') return { kind: 'collection', id: card.id }
  if (card.kind === 'cluster') return { kind: 'group', ids: card.routines.map(r => r.id) }
  return { kind: 'routine', id: card.routines[0].id }
}

function ArcCard({ card, familyMembers, matches, onOpenCollection, onOpenRoutine, onDropIntent, foldTargets, onNameGroup, onFoldInto }: {
  card: RhythmCard
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  onDropIntent?: (intent: DropIntent) => void
  foldTargets?: { id: string; name: string }[]
  onNameGroup?: (card: RhythmCard, name: string) => void
  onFoldInto?: (targetId: string, ids: string[]) => void
}) {
  const [dropHover, setDropHover] = useState(false)
  const [naming, setNaming] = useState(false)
  const draggable = !!onDropIntent
  const canName = card.kind === 'cluster' && !!onNameGroup && !!onFoldInto

  const membersOf = (r: Routine): FamilyMember[] => resolveMembers(r, familyMembers)
  const cardMatches =
    card.routines.some(matches) || (card.name != null && matches({ name: card.name } as Routine))

  const isDropTarget = card.kind === 'collection' && !!onDropIntent
  const dropHandlers = isDropTarget ? {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(e, ['step', 'routine', 'group'])) return
      e.preventDefault()
      setDropHover(true)
    },
    onDragLeave: () => setDropHover(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDropHover(false)
      const payload = readDragPayload(e)
      if (!payload) return
      const intent = resolveDrop(payload, { kind: 'collection-block', collectionId: card.id })
      if (intent) onDropIntent!(intent)
    },
  } : {}

  return (
    <div
      data-testid={`arc-card-${card.id}`}
      {...dropHandlers}
      className={`relative min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition-all
                  ${dropHover ? 'border-amber-400 ring-2 ring-amber-300' : 'border-neutral-100'}
                  ${cardMatches ? '' : 'opacity-30'}`}
    >
      <div
        className="relative flex items-baseline justify-between gap-2 mb-2"
        draggable={draggable}
        onDragStart={draggable ? (e => setDragPayload(e, headerPayload(card))) : undefined}
        style={draggable ? { cursor: 'grab' } : undefined}
      >
        <span className="flex items-baseline gap-1 min-w-0">
          {draggable && <GripVertical className="w-3 h-3 self-center flex-shrink-0 text-neutral-300" />}
          {card.kind === 'collection' ? (
            <button
              onClick={() => onOpenCollection(card.id)}
              className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
            >
              {card.name}
            </button>
          ) : canName ? (
            <button
              onClick={() => setNaming(v => !v)}
              title="Name this rhythm"
              className="font-display font-semibold text-neutral-600 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
            >
              {card.name ?? card.suggestedName ?? formatRange(card.startTime, card.endTime)}
            </button>
          ) : (
            <span className="font-display font-semibold text-neutral-600 min-w-0 break-words">
              {card.name ?? card.suggestedName ?? formatRange(card.startTime, card.endTime)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {card.routine && (
            <span className="flex -space-x-1.5">
              {membersOf(card.routine).map(m => (
                <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
              ))}
            </span>
          )}
          <span className="text-[11px] text-neutral-400">{formatRange(card.startTime, card.endTime)}</span>
        </span>
        {naming && canName && (
          <GroupNamePopover
            card={card}
            foldTargets={foldTargets ?? []}
            onName={onNameGroup!}
            onFoldInto={onFoldInto!}
            onClose={() => setNaming(false)}
          />
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {card.routines.map(r => (
          <li key={r.id}>
            <button
              onClick={() => onOpenRoutine(r)}
              draggable={draggable}
              onDragStart={draggable ? (e => setDragPayload(e, pillPayload(card, r))) : undefined}
              className={`w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1
                          hover:bg-neutral-50 transition-colors ${matches(r) ? 'text-neutral-700' : 'opacity-30'}
                          ${draggable ? 'cursor-grab' : ''}`}
            >
              <span className="flex items-center gap-1 flex-1 min-w-0">
                {draggable && <GripVertical className="w-3 h-3 flex-shrink-0 text-neutral-300" />}
                <span className="min-w-0 break-words">{r.name}</span>
              </span>
              <span className="flex items-center gap-1 flex-shrink-0">
                {r.time_of_day && card.kind !== 'single' && (
                  <span className="text-[10px] text-neutral-400">{formatClock(r.time_of_day)}</span>
                )}
                <span className="flex -space-x-1.5">
                  {membersOf(r).map(m => (
                    <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
                  ))}
                </span>
              </span>
            </button>
          </li>
        ))}
        {dropHover && (
          <li className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            drop to add as step
          </li>
        )}
      </ul>
    </div>
  )
}

export function DailyArc({ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine, onDropIntent, foldTargets, onNameGroup, onFoldInto }: DailyArcProps) {
  const [caret, setCaret] = useState<{ leftPct: number; time: string } | null>(null)
  if (cards.length === 0 && anytime.length === 0) return null

  const axisHandlers = onDropIntent ? {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(e, ['step', 'routine', 'collection', 'group'])) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const time = timeFromAxisX(e.clientX, rect)
      const leftPct = rect.width > 0 ? Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100 : 0
      setCaret({ leftPct, time })
    },
    onDragLeave: () => setCaret(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setCaret(null)
      const payload = readDragPayload(e)
      if (!payload) return
      const rect = e.currentTarget.getBoundingClientRect()
      const intent = resolveDrop(payload, { kind: 'axis', time: timeFromAxisX(e.clientX, rect) })
      if (intent) onDropIntent(intent)
    },
  } : {}

  const cardExtras = { onDropIntent, foldTargets, onNameGroup, onFoldInto }

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Center timeline with staggered cards: the thick dawn→dusk ruler runs
          through the middle; cards alternate above/below and each card starts
          at the horizontal midpoint of the one before it (2-col spans on an
          N+1 column grid). Stems/dots anchor at each card's true start time.
          With drag enabled, the ruler doubles as a drop target: hover shows a
          caret + time; dropping retimes/promotes at that time. */}
      {cards.length > 0 && (
        <div className="overflow-x-auto pt-6 pb-2">
          <div
            className="grid gap-x-3 grid-rows-[auto_4rem_auto]"
            style={{ gridTemplateColumns: `repeat(${cards.length + 1}, 165px)` }}
          >
            {/* The day ruler, spanning all columns */}
            <div
              data-testid="arc-axis"
              {...axisHandlers}
              className="col-span-full row-start-2 self-center relative h-8 rounded-full border border-[var(--color-border,#eadfcc)]
                         bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60"
            >
              {RULER_MARKS.map(m => (
                <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2"
                      style={{ left: `${pct(m.minutes)}%` }}>
                  {m.label}
                </span>
              ))}
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600" style={{ left: `${pct(nowMinutes)}%` }} />
              <span className="absolute -top-6 text-[10px] font-bold text-orange-600 -translate-x-1/2"
                    style={{ left: `${pct(nowMinutes)}%` }}>
                NOW
              </span>
              {caret && (
                <>
                  <div className="absolute -top-2 -bottom-2 w-0.5 bg-amber-500 pointer-events-none" style={{ left: `${caret.leftPct}%` }} />
                  <span className="absolute -top-6 rounded bg-amber-500 px-1 text-[10px] font-bold text-white -translate-x-1/2 pointer-events-none"
                        style={{ left: `${caret.leftPct}%` }}>
                    {caret.time}
                  </span>
                </>
              )}
              {/* Stems + dots anchored at each card's true start time */}
              {cards.map((card, i) => {
                const start = minutesOf(card.startTime)
                if (start == null) return null
                const above = i % 2 === 0
                return (
                  <div
                    key={card.id}
                    className={`absolute flex flex-col items-center pointer-events-none -translate-x-1/2
                                ${above ? '-top-4' : '-bottom-4'}`}
                    style={{ left: `${pct(start)}%` }}
                  >
                    {above ? (
                      <>
                        <span className="w-px h-4 bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                      </>
                    ) : (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                        <span className="w-px h-4 bg-amber-400" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Card cells — each spans 2 columns starting at column i+1, so a
                card's left edge sits at the midpoint of the previous one */}
            {cards.map((card, i) => (
              <div
                key={card.id}
                className={i % 2 === 0 ? 'self-end row-start-1 min-w-0' : 'self-start row-start-3 min-w-0'}
                style={{ gridColumn: `${i + 1} / span 2` }}
              >
                <ArcCard
                  card={card}
                  familyMembers={familyMembers}
                  matches={matches}
                  onOpenCollection={onOpenCollection}
                  onOpenRoutine={onOpenRoutine}
                  {...cardExtras}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anytime row — pills drag onto the ruler to receive a time */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-xs italic text-neutral-400">anytime today —</span>
          {anytime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              draggable={!!onDropIntent}
              onDragStart={onDropIntent ? (e => setDragPayload(e, { kind: 'routine', id: r.id })) : undefined}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}
                          ${onDropIntent ? 'cursor-grab' : ''}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/DailyArc.test.tsx`
Expected: PASS (12 tests). RhythmPage tests stay green (new props optional) — verify: `npx vitest run src/components/routine/RhythmPage.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/DailyArc.tsx src/components/routine/rhythm/DailyArc.test.tsx
git commit -m "feat(rhythm): draggable arc — pills, headers, axis drop, on-canvas naming"
```

---

### Task 5: WeekStrip — draggable chips + day drops

**Files:**
- Modify: `src/components/routine/rhythm/WeekStrip.tsx`
- Test: `src/components/routine/rhythm/WeekStrip.test.tsx` (append tests)

**Interfaces:**
- Consumes: Task 1 (`setDragPayload`, `acceptsDrag`, `readDragPayload`), Task 2 (`resolveDrop`, `DropIntent`).
- Produces: `WeekStripProps` gains OPTIONAL `onDropIntent?: (intent: DropIntent) => void`. When present: chips are draggable (routine payload + `fromDay`), day columns are drop targets, and the strip renders even when empty. Task 6 relies on the prop name.

- [ ] **Step 1: Append the failing tests**

Append to `src/components/routine/rhythm/WeekStrip.test.tsx` (add the `mkDT` factory from Global Constraints at module scope):

```tsx
  it('sets a routine payload with fromDay when dragging a chip', () => {
    const dt = mkDT()
    const lib = mk({ id: 'lib', name: 'Library trip', recurrence_pattern: { type: 'weekly', days: ['thu'] } })
    render(<WeekStrip {...base} onDropIntent={vi.fn()} days={{ ...empty, thu: [lib] }} />)
    fireEvent.dragStart(screen.getByText('Library trip').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'routine', id: 'lib', fromDay: 'thu' })
  })

  it('dropping a chip on another day emits move-day', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'lib', fromDay: 'thu' }))
    dt.setData('text/rhythm-kind-routine', '1')
    render(<WeekStrip {...base} onDropIntent={onDropIntent} days={empty} />)
    fireEvent.drop(screen.getByTestId('day-mon'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'move-day', id: 'lib', fromDay: 'thu', toDay: 'mon' })
  })

  it('dropping a dayless payload on a day emits weekly-on', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'step', id: 's1' }))
    dt.setData('text/rhythm-kind-step', '1')
    render(<WeekStrip {...base} onDropIntent={onDropIntent} days={empty} />)
    fireEvent.drop(screen.getByTestId('day-sat'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'weekly-on', ids: ['s1'], day: 'sat' })
  })

  it('renders the empty band when drops are enabled', () => {
    render(<WeekStrip {...base} onDropIntent={vi.fn()} days={empty} />)
    expect(screen.getByTestId('day-wed')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/WeekStrip.test.tsx`
Expected: FAIL — no draggable chips / empty strip returns null.

- [ ] **Step 3: Implement**

In `src/components/routine/rhythm/WeekStrip.tsx`:

a. Add imports:

```typescript
import { setDragPayload, acceptsDrag, readDragPayload } from './dragTypes'
import { resolveDrop, type DropIntent } from './dropRules'
```

b. Add to `WeekStripProps`:

```typescript
  /** Drag-and-drop: chips become draggable and day columns accept drops. */
  onDropIntent?: (intent: DropIntent) => void
```

c. Destructure `onDropIntent` in the component signature. Change the early return to:

```typescript
  const total = DAY_ORDER.reduce((n, d) => n + days[d].length, 0)
  if (total === 0 && sometime.length === 0 && !onDropIntent) return null
```

d. `Chip` gets two new optional props threaded from the column render: `day: DayKey` and `onDropIntent`. Wrap the chip's OUTER `<div>` with drag attributes:

```tsx
    <div
      draggable={!!onDropIntent}
      onDragStart={onDropIntent ? (e => setDragPayload(e, { kind: 'routine', id: r.id, fromDay: day })) : undefined}
      className={`w-full rounded-lg bg-emerald-50/60 px-2 py-1.5 text-xs text-neutral-700
                  transition-colors ${matches(r) ? '' : 'opacity-30'} ${onDropIntent ? 'cursor-grab' : ''}`}
    >
```

(pass `day={day}` and `onDropIntent={onDropIntent}` at the call site).

e. Day columns become drop targets — add state `const [dropDay, setDropDay] = useState<DayKey | null>(null)` in `WeekStrip`, and on each day column div:

```tsx
              onDragOver={onDropIntent ? (e => {
                if (!acceptsDrag(e, ['step', 'routine', 'collection', 'group'])) return
                e.preventDefault()
                setDropDay(day)
              }) : undefined}
              onDragLeave={onDropIntent ? (() => setDropDay(null)) : undefined}
              onDrop={onDropIntent ? (e => {
                e.preventDefault()
                setDropDay(null)
                const payload = readDragPayload(e)
                if (!payload) return
                const intent = resolveDrop(payload, { kind: 'week-day', day })
                if (intent) onDropIntent(intent)
              }) : undefined}
```

and extend the column className ternary with a drop-hover state:

```tsx
              className={`rounded-xl p-2 ${
                dropDay === day
                  ? 'border-2 border-dashed border-amber-400 bg-amber-50/40'
                  : isToday
                    ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                    : 'border border-neutral-100 bg-white'
              }`}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/WeekStrip.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/WeekStrip.tsx src/components/routine/rhythm/WeekStrip.test.tsx
git commit -m "feat(rhythm): draggable week chips + day-column drops"
```

---

### Task 6: RhythmPage executor, Tend shrink, full suite

**Files:**
- Modify: `src/components/routine/RhythmPage.tsx`
- Modify: `src/components/routine/rhythm/TendDrawer.tsx`
- Modify: `src/components/routine/rhythm/tendHeuristics.ts` (delete `groupSuggestionKey`)
- Test: `src/components/routine/RhythmPage.test.tsx`, `src/components/routine/rhythm/TendDrawer.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (`DropIntent`, `minutesOf`, DailyArc/WeekStrip new props, TendDrawer).
- Produces: no new external interfaces; `RhythmPageProps` unchanged.

- [ ] **Step 1: RhythmPage — intent executor + wiring**

In `src/components/routine/RhythmPage.tsx`:

a. Imports: add `minutesOf` to the rhythmModel import; add `import type { DropIntent } from './rhythm/dropRules'`; REMOVE the `groupSuggestionKey` import (keep `TendDrawer`).

b. Replace the `activeClusters`/`tendCount`/`looseItems` block with:

```tsx
  const tendCount = findings.length
```

(delete `activeClusters` and `looseItems` — the drawer no longer takes them).

c. Add the executor after `handleNameCluster` (which stays — it now serves the popover):

```tsx
  const routineById = useMemo(() => new Map(routines.map(r => [r.id, r])), [routines])
  const isDailyZone = (r: Routine) => {
    const p = r.recurrence_pattern
    return p.type === 'daily' || (p.type === 'weekly' && (p.days?.length ?? 0) >= 5)
  }
  const fmtMinutes = (n: number) => {
    const clamped = Math.min(Math.max(n, 0), 24 * 60 - 5)
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
  }
  const executeDropIntent = (intent: DropIntent) => {
    switch (intent.type) {
      case 'add-steps': {
        const ids = intent.ids.filter(id => routineById.get(id)?.parent_routine_id !== intent.collectionId)
        if (ids.length > 0) onAddToCollection?.(intent.collectionId, ids)
        return
      }
      case 'stand-alone-at':
        props.onPromoteStep(intent.id)
        onUpdateRoutine(intent.id, { time_of_day: intent.time, recurrence_pattern: { type: 'daily' } })
        return
      case 'retime': {
        const r = routineById.get(intent.id)
        if (!r) return
        onUpdateRoutine(intent.id, isDailyZone(r)
          ? { time_of_day: intent.time }
          : { time_of_day: intent.time, recurrence_pattern: { type: 'daily' } })
        return
      }
      case 'shift-group': {
        const members = intent.ids
          .map(id => routineById.get(id))
          .filter((r): r is Routine => !!r && minutesOf(r.time_of_day) != null)
        if (members.length === 0) return
        const earliest = Math.min(...members.map(m => minutesOf(m.time_of_day)!))
        const delta = (minutesOf(intent.time) ?? earliest) - earliest
        for (const m of members) {
          onUpdateRoutine(m.id, { time_of_day: fmtMinutes(minutesOf(m.time_of_day)! + delta) })
        }
        return
      }
      case 'weekly-on': {
        for (const id of intent.ids) {
          if (routineById.get(id)?.parent_routine_id) props.onPromoteStep(id)
          onUpdateRoutine(id, { recurrence_pattern: { type: 'weekly', days: [intent.day] } })
        }
        return
      }
      case 'move-day': {
        const r = routineById.get(intent.id)
        if (!r) return
        const p = r.recurrence_pattern
        if (!p.days || p.days.length === 0) {
          onUpdateRoutine(intent.id, { recurrence_pattern: { type: 'weekly', days: [intent.toDay] } })
          return
        }
        const set = new Set(p.days.filter(d => d !== intent.fromDay))
        set.add(intent.toDay)
        onUpdateRoutine(intent.id, { recurrence_pattern: { ...p, days: DAY_ORDER.filter(d => set.has(d)) } })
        return
      }
    }
  }
```

d. DailyArc render — add the new props:

```tsx
            onDropIntent={executeDropIntent}
            foldTargets={foldTargets}
            onNameGroup={handleNameCluster}
            onFoldInto={(targetId, ids) => onAddToCollection?.(targetId, ids)}
```

e. WeekStrip render — add `onDropIntent={executeDropIntent}`.

f. TendDrawer render — remove the props `clusters`, `looseItems`, `foldTargets`, `onNameGroup`, `onFoldInto`, AND `familyMembers` (it only served the removed LooseRow avatars; drawer's new signature per Step 2 drops it).

- [ ] **Step 2: Shrink TendDrawer**

In `src/components/routine/rhythm/TendDrawer.tsx`: delete the `GroupRow` and `LooseRow` components, the `scheduleSummary` helper, and the "Name your rhythms" + "On their own" sections. Remove props `clusters`, `looseItems`, `foldTargets`, `onNameGroup`, `onFoldInto` (and now-unused imports: `formatRange`, `RhythmCard`, `resolveMembers`, `AssigneeAvatar` — whichever become unused; keep `familyMembers` only if still used, otherwise remove it and its prop). The empty check becomes `findings.length === 0 && sleepers.length === 0`. Keep the header, TendCard, SeasonalShelf, and the empty-state line exactly as they are.

In `src/components/routine/rhythm/tendHeuristics.ts`: delete the `groupSuggestionKey` function and its `RhythmCard` type import.

Verify: `grep -rn "groupSuggestionKey" src` → only TendDrawer.test.tsx references remain (fixed in Step 3).

- [ ] **Step 3: Update tests**

`src/components/routine/rhythm/TendDrawer.test.tsx`: remove the `groupSuggestionKey` describe block and the group/loose tests ('names a group…', 'folds into…', 'folds via a suggestion…', 'dismisses a group…', 'moves a loose item…', avatar test if it targets LooseRow); update `base` to the new prop set. Keep/adjust: renders-nothing-when-closed, empty state (now: no findings + no sleepers), sleeping section + wake-all.

`src/components/routine/RhythmPage.test.tsx`:
- The naming test opens the popover from the CANVAS now: replace the drawer-driven naming test with:

```tsx
  it('naming a group via the canvas popover calls onGroupIntoCollection with time opts', () => {
    const onGroupIntoCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onGroupIntoCollection={onGroupIntoCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime' }))
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Wind-down' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Wind-down', ['a', 'b', 'c'],
      { time_of_day: '19:01', recurrence_pattern: { type: 'daily' } })
  })
```

- Replace the drawer-driven fold test with a canvas-popover version (same fixture plus `mk('Kids Bedtime Routine', { id: 'bed', recurrence_pattern: { type: 'weekly', days: ['sun'] } })` and `onAddToCollection`; click the 'Bedtime' title button, type 'Kids Bedtime', click the suggestion button named 'Kids Bedtime Routine' inside the popover, expect `onAddToCollection` with `('bed', ['a','b','c'])`).
- Badge test: the old fixture (two clustered routines, no findings) now shows NO badge — rewrite to use a findings fixture: `mk('Water plants', { id: 'x', context: null })` (missing-domain finding) → badge text exactly '1'; and assert no badge renders for the two-cluster fixture.
- Add an executor test:

```tsx
  it('executes an add-steps drop end to end', () => {
    const onAddToCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddToCollection={onAddToCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Kids Bedtime', { id: 'bed', time_of_day: '19:15:00' }),
          mk('Read', { id: 'read', time_of_day: null, parent_routine_id: 'bed' }),
        ]} />
    )
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'a' }))
    dt.setData('text/rhythm-kind-routine', '1')
    fireEvent.drop(screen.getByTestId('arc-card-bed'), { dataTransfer: dt })
    expect(onAddToCollection).toHaveBeenCalledWith('bed', ['a'])
  })
```

(add the `mkDT` factory to this test file too; the dismiss-persistence test keeps working — findings dismissal is unchanged).

- [ ] **Step 4: Typecheck + affected tests**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/components/routine src/apps` → PASS.

- [ ] **Step 5: Full suite**

Run: `npx vitest run` → all pass (~390 files). Fix any straggler referencing removed TendDrawer props or `groupSuggestionKey`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(routines): drag-intent executor + Tend drawer shrink"
```

---

## Final verification (controller, after all tasks)

- `npm run build` succeeds; eslint clean on touched files.
- Rebase on origin/main; `git push origin HEAD:main` (pre-push runs tsc + suite).
