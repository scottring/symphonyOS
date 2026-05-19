# Interactive Timeline — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add insert-between affordances with a radial quarter-wheel to the state-view timeline (`TodaySchedule`) so any of Note / Task / Event / Routine can be created at a precise moment between items.

**Architecture:** All hard logic lives in small testable units — `useTimelineInsert` (anchor-time math + create routing) and `TimelineInsertPoint` (the `+` + radial wheel, presentational). `TodaySchedule` only renders insert points between items. Notes gain a nullable `timeline_at` column and render via a new `TimelineNoteCard`. `PlanningSession` is untouched. Phase 2 (drag) is a separate plan.

**Tech Stack:** React 19 + TypeScript strict, Vite, Tailwind v4, Supabase, Vitest + React Testing Library. Spec: `docs/superpowers/specs/2026-05-18-interactive-timeline-design.md`.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/lib/timelineAnchor.ts` | Pure `computeAnchorTime()` — midpoint+snap, section head/tail, all-day | Create |
| `src/lib/timelineAnchor.test.ts` | Unit tests for anchor math | Create |
| `src/components/schedule/TimelineInsertPoint.tsx` | `+` affordance + radial quarter-wheel; emits `onPick(kind)` | Create |
| `src/components/schedule/TimelineInsertPoint.test.tsx` | Render/gesture tests | Create |
| `src/hooks/useTimelineInsert.ts` | Owns insert state; routes `kind` → create flow with anchor | Create |
| `src/components/schedule/TimelineNoteCard.tsx` | Renders a `timeline_at`-anchored note as a timeline row | Create |
| `src/components/schedule/TimelineNoteComposer.tsx` | New-note / link-existing sheet opened by 📝 | Create |
| `src/types/note.ts` | Add `timeline_at` to `Note`, `DbNote`, `CreateNoteInput` | Modify |
| `src/hooks/useNotes.ts` | Persist/read `timeline_at`; `appendToNote(id, block, anchor)` | Modify |
| `src/hooks/useSupabaseTasks.ts` | (no change — `addTask` already supports timed) | — |
| `src/App.tsx` | Add `onCreateTaskAt`, `onCreateEventAt`, `onCreateRoutineAt`, note handlers; pass to `TodaySchedule` | Modify |
| `src/components/schedule/TodaySchedule.tsx` | Render `<TimelineInsertPoint>` between items + section edges; render `TimelineNoteCard` | Modify |
| DB: `notes` table | Add nullable `timeline_at timestamptz` | Migration |

---

## Task 0: DB migration — add `timeline_at` to `notes`

**Files:** none (Supabase Management API per repo MEMORY build notes — migration history is out of sync, use the API).

- [ ] **Step 1: Pull live Management API token**

Run:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
echo "${TOKEN:0:6}…"
```
Expected: prints a non-empty token prefix.

- [ ] **Step 2: Add the column (idempotent)**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"ALTER TABLE notes ADD COLUMN IF NOT EXISTS timeline_at timestamptz;"}'
```
Expected: `[]` (success, no rows).

- [ ] **Step 3: Verify**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='\''notes'\'' AND column_name='\''timeline_at'\'';"}'
```
Expected: `[{"column_name":"timeline_at"}]`

- [ ] **Step 4: Commit a migration record file** (keeps repo history readable even though API applied it)

Create `supabase/migrations/2026-05-18_notes_timeline_at.sql`:
```sql
-- Applied via Management API 2026-05-18 (migration history out of sync).
ALTER TABLE notes ADD COLUMN IF NOT EXISTS timeline_at timestamptz;
```
```bash
git add supabase/migrations/2026-05-18_notes_timeline_at.sql
git commit -m "feat(notes): add nullable timeline_at column for timeline-anchored notes"
```

---

## Task 1: `computeAnchorTime` — anchor-time math (pure)

**Files:**
- Create: `src/lib/timelineAnchor.ts`
- Test: `src/lib/timelineAnchor.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/timelineAnchor.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeAnchorTime } from './timelineAnchor'

const d = (h: number, m: number) => { const x = new Date(2026, 4, 18); x.setHours(h, m, 0, 0); return x }

describe('computeAnchorTime', () => {
  it('returns 5-min-snapped midpoint between two timed items', () => {
    const r = computeAnchorTime({ before: d(18, 0), after: d(18, 30), section: 'evening', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(18)
    expect(r?.getMinutes()).toBe(15)
  })
  it('snaps a non-round midpoint to nearest 5 min', () => {
    const r = computeAnchorTime({ before: d(9, 0), after: d(9, 7), section: 'morning', date: new Date(2026, 4, 18) })
    expect(r?.getMinutes()).toBe(5) // midpoint 9:03:30 → snap 9:05
  })
  it('section head with a following item → one minute before it', () => {
    const r = computeAnchorTime({ before: null, after: d(9, 0), section: 'morning', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(8); expect(r?.getMinutes()).toBe(59)
  })
  it('section tail with a preceding item → one minute after it', () => {
    const r = computeAnchorTime({ before: d(21, 0), after: null, section: 'evening', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(21); expect(r?.getMinutes()).toBe(1)
  })
  it('allday section → null (no time, date only)', () => {
    expect(computeAnchorTime({ before: null, after: null, section: 'allday', date: new Date(2026, 4, 18) })).toBeNull()
  })
  it('unscheduled section → null', () => {
    expect(computeAnchorTime({ before: null, after: null, section: 'unscheduled', date: new Date(2026, 4, 18) })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timelineAnchor.test.ts`
Expected: FAIL — "computeAnchorTime is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

`src/lib/timelineAnchor.ts`:
```typescript
import type { DaySection } from './timeUtils'

export interface AnchorInput {
  before: Date | null   // start time of item above the insert point
  after: Date | null    // start time of item below the insert point
  section: DaySection
  date: Date            // the day being viewed
}

const SECTION_FALLBACK_HOUR: Record<string, number> = { morning: 8, afternoon: 13, evening: 18 }

function snap5(ms: number): Date {
  const date = new Date(ms)
  const m = date.getMinutes()
  date.setMinutes(Math.round(m / 5) * 5, 0, 0)
  return date
}

/** Returns the prefill time for an entity inserted at this gap, or null for date-only (allday/unscheduled). */
export function computeAnchorTime({ before, after, section, date }: AnchorInput): Date | null {
  if (section === 'allday' || section === 'unscheduled') return null

  if (before && after) return snap5((before.getTime() + after.getTime()) / 2)
  if (!before && after) return new Date(after.getTime() - 60_000)      // 1 min before first
  if (before && !after) return new Date(before.getTime() + 60_000)     // 1 min after last

  // empty section: fall back to the section's nominal start hour on this date
  const r = new Date(date)
  r.setHours(SECTION_FALLBACK_HOUR[section] ?? 9, 0, 0, 0)
  return r
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timelineAnchor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timelineAnchor.ts src/lib/timelineAnchor.test.ts
git commit -m "feat(timeline): computeAnchorTime — anchor-time math for insert points"
```

---

## Task 2: `TimelineInsertPoint` — `+` affordance + radial wheel

**Files:**
- Create: `src/components/schedule/TimelineInsertPoint.tsx`
- Test: `src/components/schedule/TimelineInsertPoint.test.tsx`

`InsertKind` is the discriminator used everywhere: `'note' | 'task' | 'event' | 'routine'`.

- [ ] **Step 1: Write the failing test**

`src/components/schedule/TimelineInsertPoint.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineInsertPoint } from './TimelineInsertPoint'

describe('TimelineInsertPoint', () => {
  it('renders a + trigger and no segments until opened', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add between items/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
  })
  it('opens the radial wheel on click, showing 4 segments', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    for (const label of ['Note', 'Task', 'Event', 'Routine'])
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeInTheDocument()
  })
  it('fires onPick with the kind and closes the wheel', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.click(screen.getByRole('button', { name: /^event$/i }))
    expect(onPick).toHaveBeenCalledWith('event')
    expect(screen.queryByRole('button', { name: /^event$/i })).not.toBeInTheDocument()
  })
  it('closes on Escape without firing onPick', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/TimelineInsertPoint.test.tsx`
Expected: FAIL — cannot find module `./TimelineInsertPoint`.

- [ ] **Step 3: Write minimal implementation**

`src/components/schedule/TimelineInsertPoint.tsx`:
```tsx
import { useState, useEffect, useCallback, useRef } from 'react'

export type InsertKind = 'note' | 'task' | 'event' | 'routine'

const SEGMENTS: { kind: InsertKind; label: string; icon: string }[] = [
  { kind: 'note', label: 'Note', icon: '📝' },
  { kind: 'task', label: 'Task', icon: '✅' },
  { kind: 'event', label: 'Event', icon: '📅' },
  { kind: 'routine', label: 'Routine', icon: '🔁' },
]

interface Props {
  onPick: (kind: InsertKind) => void
}

export function TimelineInsertPoint({ onPick }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDocClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDocClick) }
  }, [open])

  const pick = useCallback((k: InsertKind) => { setOpen(false); onPick(k) }, [onPick])

  return (
    <div ref={rootRef} className="relative flex items-center justify-center h-6 group">
      {/* quiet hairline; lifts on hover (desktop) — always tappable on touch */}
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200 opacity-40 group-hover:opacity-100 transition-opacity" />
      <button
        type="button"
        aria-label="Add between items"
        onClick={() => setOpen(v => !v)}
        className="relative z-10 w-7 h-7 min-w-[28px] rounded-full bg-primary-500 text-white text-base leading-none flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0 max-md:opacity-100 transition-opacity"
      >+</button>

      {open && (
        <div role="menu" className="absolute z-20 bottom-8 flex gap-2 bg-white border border-neutral-200 rounded-2xl shadow-lg px-3 py-2">
          {SEGMENTS.map(s => (
            <button
              key={s.kind}
              type="button"
              aria-label={s.label}
              onClick={() => pick(s.kind)}
              className="w-16 h-16 min-w-[64px] rounded-xl border border-neutral-200 bg-white flex flex-col items-center justify-center gap-1 text-xs hover:bg-primary-50 active:scale-95 transition"
            >
              <span className="text-xl">{s.icon}</span>{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

> Note: the visual fan-out arc is CSS polish layered later; the structural requirement (4 reachable 64px targets, keyboard/tap-away dismissal) is what tests lock. Wall-kiosk targets are 64px; `max-md:opacity-100` keeps the `+` always visible on touch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/TimelineInsertPoint.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TimelineInsertPoint.tsx src/components/schedule/TimelineInsertPoint.test.tsx
git commit -m "feat(timeline): TimelineInsertPoint + radial wheel (presentational)"
```

---

## Task 3: `useTimelineInsert` — routes a pick to the right create flow

**Files:**
- Create: `src/hooks/useTimelineInsert.ts`
- Test: `src/hooks/useTimelineInsert.test.ts`

This hook holds the create callbacks (passed down from App) and exposes `handlePick(ctx, kind)` that computes the anchor and dispatches. The Note kind opens a composer (state), the others call create directly.

- [ ] **Step 1: Write the failing test**

`src/hooks/useTimelineInsert.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineInsert } from './useTimelineInsert'

const ctx = { before: new Date(2026,4,18,18,0), after: new Date(2026,4,18,18,30), section: 'evening' as const, date: new Date(2026,4,18) }

describe('useTimelineInsert', () => {
  it('task pick calls onCreateTaskAt with the snapped anchor', () => {
    const onCreateTaskAt = vi.fn()
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt, onCreateEventAt: vi.fn(), onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'task'))
    const when = onCreateTaskAt.mock.calls[0][0] as Date
    expect(when.getHours()).toBe(18); expect(when.getMinutes()).toBe(15)
  })
  it('event pick calls onCreateEventAt with the anchor', () => {
    const onCreateEventAt = vi.fn()
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt: vi.fn(), onCreateEventAt, onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'event'))
    expect((onCreateEventAt.mock.calls[0][0] as Date).getMinutes()).toBe(15)
  })
  it('note pick opens the composer with the anchor instead of calling a create fn', () => {
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt: vi.fn(), onCreateEventAt: vi.fn(), onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'note'))
    expect(result.current.noteComposer?.anchor?.getMinutes()).toBe(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useTimelineInsert.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/hooks/useTimelineInsert.ts`:
```typescript
import { useState, useCallback } from 'react'
import { computeAnchorTime, type AnchorInput } from '@/lib/timelineAnchor'
import type { InsertKind } from '@/components/schedule/TimelineInsertPoint'

interface Callbacks {
  onCreateTaskAt: (when: Date | null) => void
  onCreateEventAt: (when: Date | null) => void
  onCreateRoutineAt: (when: Date | null) => void
}
interface NoteComposerState { anchor: Date | null }

export function useTimelineInsert(cb: Callbacks) {
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null)

  const handlePick = useCallback((ctx: AnchorInput, kind: InsertKind) => {
    const anchor = computeAnchorTime(ctx)
    switch (kind) {
      case 'task': return cb.onCreateTaskAt(anchor)
      case 'event': return cb.onCreateEventAt(anchor)
      case 'routine': return cb.onCreateRoutineAt(anchor)
      case 'note': return setNoteComposer({ anchor })
    }
  }, [cb])

  const closeNoteComposer = useCallback(() => setNoteComposer(null), [])
  return { handlePick, noteComposer, closeNoteComposer }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useTimelineInsert.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTimelineInsert.ts src/hooks/useTimelineInsert.test.ts
git commit -m "feat(timeline): useTimelineInsert — routes radial pick to create flow"
```

---

## Task 4: App create handlers for Task / Event / Routine at a time

**Files:**
- Modify: `src/App.tsx` (the props object around `onCreateTask:` ~line 1219)

`addTask(title, contactId?, projectId?, scheduledFor?, options)` and `addRoutine(input)` / `createEvent(params)` signatures are confirmed in the hooks.

- [ ] **Step 1: Add the three handlers next to `onCreateTask`**

In `src/App.tsx`, immediately after the existing `onCreateTask: async (title) => {…},` add:
```tsx
onCreateTaskAt: async (when: Date | null) => {
  const title = window.prompt('New task')?.trim()
  if (!title) return
  await addTask(title, undefined, undefined, when ?? undefined, {
    isAllDay: !when,
    context: currentDomain !== 'universal' ? currentDomain : undefined,
    assignedTo: getCurrentUserMember()?.id,
  })
},
onCreateEventAt: async (when: Date | null) => {
  const title = window.prompt('New event')?.trim()
  if (!title || !when) return
  await createEvent({ title, startTime: when, endTime: new Date(when.getTime() + 30 * 60_000) })
},
onCreateRoutineAt: async (when: Date | null) => {
  const name = window.prompt('New routine')?.trim()
  if (!name) return
  const hhmm = when ? `${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}` : undefined
  await addRoutine({ name, time_of_day: hhmm, recurrence_pattern: { type: 'daily' } })
},
```

> `window.prompt` is the intentional minimal capture for Phase 1 (zero-friction title-only, matching QuickCapture philosophy). Rich create surfaces (RoutineForm/event sheet) are explicitly deferred — keeps Phase 1 small and shippable.

- [ ] **Step 2: Confirm `createEvent` and `addRoutine` are in scope in App.tsx**

Run: `grep -n "createEvent\|addRoutine\|addTask," src/App.tsx | head`
Expected: all three are already destructured/available in `App.tsx` (verified: `addRoutine` at App.tsx:230, `addTask` powers existing `onCreateTask`, `createEvent` from `useGoogleCalendar`). If `createEvent` is not yet destructured in App, add it from the existing `useGoogleCalendar()` call.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: TypeScript passes (no errors). If `onCreateTaskAt` etc. error as unknown props, that's expected until Task 6 wires the prop types — proceed.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(timeline): App handlers to create Task/Event/Routine at a time"
```

---

## Task 5: Note data layer — persist & read `timeline_at`, add `appendToNote`

**Files:**
- Modify: `src/types/note.ts`
- Modify: `src/hooks/useNotes.ts`
- Test: `src/hooks/useNotes.test.ts` (add cases)

- [ ] **Step 1: Write the failing test** (add to `src/hooks/useNotes.test.ts`)

```typescript
import { mapDbNote } from './useNotes'

it('mapDbNote surfaces timeline_at as a Date', () => {
  const note = mapDbNote({
    id: 'n1', user_id: 'u', title: null, content: 'x', type: 'general', source: 'manual',
    topic_id: null, audio_url: null, external_id: null, external_url: null,
    vault_path: null, vault_domain: null, vault_frontmatter: null, vault_last_commit_sha: null,
    context: null, created_at: '2026-05-18T00:00:00Z', updated_at: '2026-05-18T00:00:00Z',
    timeline_at: '2026-05-18T18:15:00Z',
  } as any)
  expect(note.timelineAt?.getUTCHours()).toBe(18)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useNotes.test.ts -t timeline_at`
Expected: FAIL — `mapDbNote` not exported / `timelineAt` undefined.

- [ ] **Step 3: Extend the types** in `src/types/note.ts`

- Add to `interface Note`: `timelineAt?: Date`
- Add to `interface DbNote`: `timeline_at: string | null`
- Add to `interface CreateNoteInput`: `timelineAt?: Date`

- [ ] **Step 4: Implement in `src/hooks/useNotes.ts`**

- Export the existing db→Note mapper as `mapDbNote` (if it is currently an inline/anon function, extract and name it). Add: `timelineAt: dbNote.timeline_at ? new Date(dbNote.timeline_at) : undefined`.
- In `addNote`'s `.insert({…})` object add: `timeline_at: input.timelineAt?.toISOString() ?? null`.
- Add `appendToNote`:
```typescript
const appendToNote = useCallback(async (id: string, block: string, anchor: Date | null) => {
  const existing = notes.find(n => n.id === id)
  if (!existing) return null
  const stamp = new Date().toLocaleString()
  const content = `${existing.content}\n\n— ${stamp} —\n${block}`
  const patch: Record<string, unknown> = { content }
  if (anchor) patch.timeline_at = anchor.toISOString()  // append-also-anchors
  const { error } = await supabase.from('notes').update(patch).eq('id', id)
  if (error) return null
  setNotes(prev => prev.map(n => n.id === id
    ? { ...n, content, timelineAt: anchor ?? n.timelineAt } : n))
  return id
}, [notes])
```
- Add `appendToNote` to the hook's `return {…}`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/useNotes.test.ts -t timeline_at`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/note.ts src/hooks/useNotes.ts src/hooks/useNotes.test.ts
git commit -m "feat(notes): persist/read timeline_at + appendToNote (append-also-anchors)"
```

---

## Task 6: `TimelineNoteComposer` — new-note / link-existing sheet

**Files:**
- Create: `src/components/schedule/TimelineNoteComposer.tsx`
- Test: `src/components/schedule/TimelineNoteComposer.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/schedule/TimelineNoteComposer.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineNoteComposer } from './TimelineNoteComposer'

const anchor = new Date(2026,4,18,18,15)

describe('TimelineNoteComposer', () => {
  it('new-note mode creates a note with the anchor', () => {
    const onCreate = vi.fn()
    render(<TimelineNoteComposer anchor={anchor} existingNotes={[]} onCreateNew={onCreate} onAppendExisting={vi.fn()} onLinkExisting={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/write a note/i), { target: { value: 'check sprinklers' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))
    expect(onCreate).toHaveBeenCalledWith('check sprinklers', anchor)
  })
  it('link-existing → append calls onAppendExisting with note id + anchor', () => {
    const onAppend = vi.fn()
    render(<TimelineNoteComposer anchor={anchor}
      existingNotes={[{ id: 'n1', title: 'Garden', content: '' } as any]}
      onCreateNew={vi.fn()} onAppendExisting={onAppend} onLinkExisting={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /link existing/i }))
    fireEvent.click(screen.getByRole('button', { name: /garden/i }))
    fireEvent.change(screen.getByPlaceholderText(/append/i), { target: { value: 'water tonight' } })
    fireEvent.click(screen.getByRole('button', { name: /^append$/i }))
    expect(onAppend).toHaveBeenCalledWith('n1', 'water tonight', anchor)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/TimelineNoteComposer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/components/schedule/TimelineNoteComposer.tsx`:
```tsx
import { useState } from 'react'
import type { Note } from '@/types/note'

interface Props {
  anchor: Date | null
  existingNotes: Pick<Note, 'id' | 'title' | 'content'>[]
  onCreateNew: (content: string, anchor: Date | null) => void
  onAppendExisting: (id: string, block: string, anchor: Date | null) => void
  onLinkExisting: (id: string) => void
  onClose: () => void
}

export function TimelineNoteComposer({ anchor, existingNotes, onCreateNew, onAppendExisting, onLinkExisting, onClose }: Props) {
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [text, setText] = useState('')
  const [selId, setSelId] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div className="card w-full md:max-w-md p-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode('new')} className={mode==='new' ? 'btn-primary' : ''}>New note</button>
          <button onClick={() => setMode('link')} className={mode==='link' ? 'btn-primary' : ''}>Link existing</button>
        </div>

        {mode === 'new' && (
          <>
            <textarea autoFocus placeholder="Write a note…" value={text}
              onChange={e => setText(e.target.value)} className="input-base w-full h-32" />
            <button className="btn-primary mt-3" onClick={() => { if (text.trim()) { onCreateNew(text.trim(), anchor); onClose() } }}>
              Save note
            </button>
          </>
        )}

        {mode === 'link' && (
          <div className="space-y-2">
            {existingNotes.map(n => (
              <button key={n.id} onClick={() => setSelId(n.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg border ${selId===n.id?'border-primary-400':'border-neutral-200'}`}>
                {n.title || n.content.slice(0, 40) || '(untitled)'}
              </button>
            ))}
            {selId && (
              <>
                <textarea placeholder="Append a block…" value={text}
                  onChange={e => setText(e.target.value)} className="input-base w-full h-24" />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => { if (text.trim()) { onAppendExisting(selId, text.trim(), anchor); onClose() } }}>Append</button>
                  <button onClick={() => { onLinkExisting(selId); onClose() }}>Link only</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/TimelineNoteComposer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TimelineNoteComposer.tsx src/components/schedule/TimelineNoteComposer.test.tsx
git commit -m "feat(timeline): TimelineNoteComposer (new / link-existing append / link-only)"
```

---

## Task 7: `TimelineNoteCard` — render an anchored note as a timeline row

**Files:**
- Create: `src/components/schedule/TimelineNoteCard.tsx`
- Test: `src/components/schedule/TimelineNoteCard.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/schedule/TimelineNoteCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineNoteCard } from './TimelineNoteCard'

it('renders note title, no checkbox, opens on click', () => {
  const onOpen = vi.fn()
  render(<TimelineNoteCard title="Sprinklers" timeLabel="6:15" onOpen={onOpen} />)
  expect(screen.getByText('Sprinklers')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Sprinklers'))
  expect(onOpen).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/TimelineNoteCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/components/schedule/TimelineNoteCard.tsx`:
```tsx
interface Props { title: string; timeLabel?: string; onOpen: () => void }

export function TimelineNoteCard({ title, timeLabel, onOpen }: Props) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/60 text-left">
      <span className="text-xs text-neutral-400 w-12 tabular-nums">{timeLabel ?? ''}</span>
      <span className="text-base">📝</span>
      <span className="font-medium text-neutral-800">{title}</span>
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/TimelineNoteCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TimelineNoteCard.tsx src/components/schedule/TimelineNoteCard.test.tsx
git commit -m "feat(timeline): TimelineNoteCard — anchored note row (no checkbox)"
```

---

## Task 8: Wire everything into `TodaySchedule`

**Files:**
- Modify: `src/components/schedule/TodaySchedule.tsx` (section/item map ~lines 1311–1521)
- Test: `src/components/schedule/TodaySchedule.test.tsx` (add one integration case)

- [ ] **Step 1: Add props + hook to `TodaySchedule`**

In the props interface add:
```tsx
onCreateTaskAt?: (when: Date | null) => void
onCreateEventAt?: (when: Date | null) => void
onCreateRoutineAt?: (when: Date | null) => void
onCreateNoteAt?: (content: string, anchor: Date | null) => void
onAppendNoteAt?: (id: string, block: string, anchor: Date | null) => void
onLinkNote?: (id: string) => void
timelineNotes?: { id: string; title?: string; content: string; timelineAt?: Date }[]
```
Near the top of the component body:
```tsx
const insert = useTimelineInsert({
  onCreateTaskAt: onCreateTaskAt ?? (() => {}),
  onCreateEventAt: onCreateEventAt ?? (() => {}),
  onCreateRoutineAt: onCreateRoutineAt ?? (() => {}),
})
```
(import `useTimelineInsert`, `TimelineInsertPoint`, `TimelineNoteComposer`, `TimelineNoteCard`, `computeAnchorTime`.)

- [ ] **Step 2: Render an insert point between items + at section head/tail**

Inside `items.map((item, itemIndex) => …)`, wrap each rendered row so an insert point precedes it, and add a trailing one after the last item. Build the `AnchorInput` from neighbors:
```tsx
const prev = itemIndex > 0 ? items[itemIndex - 1] : null
const insertCtx = {
  before: prev?.startTime ?? null,
  after: item.startTime ?? null,
  section, date: selectedDate,
}
```
Render `<TimelineInsertPoint onPick={(k) => insert.handlePick(insertCtx, k)} />` before the row `<div key={item.id}>`, and after the loop render a tail insert point with `{ before: lastItem?.startTime ?? null, after: null, section, date: selectedDate }`. For an **empty** section that still shows (e.g., kid summary) render one `TimelineInsertPoint` with `{ before: null, after: null, section, date: selectedDate }`.

- [ ] **Step 3: Render timeline-anchored notes inline**

Before the `sections.map`, merge notes whose `timelineAt` falls on `selectedDate` into the per-section items by time (reuse `groupByDaySection` semantics: a note at 18:15 → `evening`). Render each as `<TimelineNoteCard title={n.title || n.content.slice(0,40)} timeLabel={fmt(n.timelineAt)} onOpen={() => handleOpenNote(n.id)} />` sorted by `timelineAt` alongside items.

- [ ] **Step 4: Mount the composer**

At the end of the component JSX:
```tsx
{insert.noteComposer && (
  <TimelineNoteComposer
    anchor={insert.noteComposer.anchor}
    existingNotes={(timelineNotes ?? []).map(n => ({ id: n.id, title: n.title, content: n.content }))}
    onCreateNew={(c, a) => onCreateNoteAt?.(c, a)}
    onAppendExisting={(id, b, a) => onAppendNoteAt?.(id, b, a)}
    onLinkExisting={(id) => onLinkNote?.(id)}
    onClose={insert.closeNoteComposer}
  />
)}
```

- [ ] **Step 5: Pass the new props from `App.tsx`**

Add to the `TodaySchedule`/scheduleActions props object: `onCreateTaskAt`, `onCreateEventAt`, `onCreateRoutineAt` (from Task 4), plus `onCreateNoteAt: (c,a) => addNote({ content: c, type: 'general', timelineAt: a ?? undefined, context: currentDomain !== 'universal' ? currentDomain : undefined })`, `onAppendNoteAt: appendToNote`, `onLinkNote: (id) => addEntityLink? /* existing note→entity link util */`, and `timelineNotes: notes.filter(n => n.timelineAt)`.

> If a generic note→entity link helper does not already exist, `onLinkNote` may no-op for Phase 1 (link-only is the lighter path; append covers the primary use). Note this explicitly in the commit message.

- [ ] **Step 6: Write the integration test** (add to `src/components/schedule/TodaySchedule.test.tsx`)

```tsx
it('shows an insert point that opens the radial wheel between items', () => {
  // render TodaySchedule with two timed items via existing test harness/fixtures
  // (follow the existing describe setup in this file for props)
  // fireEvent.click first "Add between items" → expect Note/Task/Event/Routine buttons
})
```
Fill the body using the existing fixture/prop setup already present at the top of `TodaySchedule.test.tsx` (mirror an existing test's render call; add two timed items to the tasks fixture).

- [ ] **Step 7: Run the full schedule test suite + typecheck**

Run: `npx vitest run src/components/schedule/TodaySchedule.test.tsx && npm run build`
Expected: all pass; TypeScript clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/TodaySchedule.tsx src/components/schedule/TodaySchedule.test.tsx src/App.tsx
git commit -m "feat(timeline): wire insert points + radial + note composer into TodaySchedule"
```

---

## Task 9: E2E + manual verification

**Files:**
- Modify: `e2e/app.spec.ts` (add a skipped spec, consistent with the known auth-fixture gap)

- [ ] **Step 1: Add a gated E2E spec**

```typescript
test.skip('insert a task between two timeline items via the radial wheel', async ({ page }) => {
  // Unskip when the Playwright auth fixture lands (see MEMORY: followup_e2e_auth_fixture).
  // 1. log in (fixture) 2. open Today 3. hover gap between two items
  // 4. click "Add between items" 5. click "Task" 6. type title + enter
  // 7. assert the task row appears at the midpoint time
})
```

- [ ] **Step 2: Run unit suite green overall**

Run: `npm test`
Expected: all unit tests pass.

- [ ] **Step 3: Manual matrix (record results in the PR description)**

- Desktop: hover a gap → `+` lifts → click → wheel → create a Task; lands at midpoint.
- Mobile (<768px / devtools): `+` always visible; wheel opens upward; thumb-reachable.
- Wall kiosk (TV, 8 ft): 64px targets tappable; no hover needed.

- [ ] **Step 4: Commit**

```bash
git add e2e/app.spec.ts
git commit -m "test(timeline): gated E2E for radial insert (pending auth fixture)"
```

---

## Self-Review

**Spec coverage:**
- Insert placement (between / head / tail / empty) → Task 8 Step 2. ✓
- `+`→radial, Esc/tap-away, no press-hold in P1 → Task 2. ✓
- Anchor: midpoint+5-snap, head/tail ±1min, all-day null → Task 1. ✓
- Segment→flow (Task/Event/Routine/Note) → Tasks 3–6, 8. ✓
- `timeline_at` migration, backward-compatible → Task 0, 5. ✓
- Note: new / link-existing append / link-only, append-also-anchors → Tasks 5, 6. ✓
- `TimelineNoteCard` distinct, no checkbox, sorts by `timeline_at` → Tasks 7, 8 Step 3. ✓
- Surfaces (desktop/mobile/kiosk) → Task 2 (targets/opacity) + Task 9 manual. ✓
- Unit + gated E2E → all tasks + Task 9. ✓
- PlanningSession untouched → no task modifies it. ✓

**Placeholder scan:** `onLinkNote` is the one deliberately-bounded item — explicitly allowed to no-op for Phase 1 with a stated rationale (link-only is the lighter path; append is primary), not a hidden TODO.

**Type consistency:** `InsertKind` (`'note'|'task'|'event'|'routine'`) defined in Task 2, consumed in Tasks 3/8. `computeAnchorTime`/`AnchorInput` defined Task 1, consumed Tasks 3/8. `timelineAt` (camel, on `Note`) vs `timeline_at` (snake, DB) used consistently. `addTask`/`addRoutine`/`createEvent`/`addNote`/`appendToNote` signatures match the verified hook sources.

**Out of scope (Phase 2, separate plan):** all drag-to-reschedule, date-strip drop, push-bar, per-entity drag rules, Google-write confirm, routine this-day-vs-all prompt.
