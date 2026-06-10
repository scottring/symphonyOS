# Share work/personal events to the family timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When one of Scott's work/personal calendar events falls during family hours, show an inline nudge in Today offering to add it to the shared family timeline; accepting surfaces it on the family view while keeping it in the work/personal view.

**Architecture:** Self-contained, client-side. Two boolean flags on `event_notes` (`shared_with_family`, `share_nudge_dismissed`), a pure `workingHours` lib, a pure visibility predicate, a pure nudge-detection function wrapped in a hook, a small presentational component, and wiring into the live Today render path (`TodayView`, rendered by `HomeView`) plus the family-domain event filter (`HomeView.filteredEvents`). No `proactive-engine` / `proactive_suggestions` changes. Wall integration is explicitly out of scope (the wall fetches only family-mapped calendars, so work events never reach it — a separate effort).

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library, Supabase (event_notes table), Tailwind v4.

**Working directory:** This worktree — `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/share-to-family-nudge` (branch `share-to-family-nudge`). Run all commands from here. `tsc`/test PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.

**Key facts about the existing code:**
- `resolveEventContext(event, eventContextOverrides?, getDomainForCalendar?)` in `src/lib/today/eventContext.ts` returns `'work' | 'family' | 'personal' | null`. Reuse it — do not re-derive context.
- `CalendarEvent` (`src/hooks/useGoogleCalendar.tsx`) has both snake_case and camelCase fields: id, `google_event_id?`, title, `start_time?`/`startTime?`, `all_day?`/`allDay?`. Event id used for notes = `event.google_event_id || event.id`.
- `useEventNotes` (`src/hooks/useEventNotes.ts`) holds notes in a `Map<string, EventNote>` keyed by google event id; every mutator is an optimistic upsert with `onConflict: 'user_id,google_event_id'`. `updateEventContext` is the closest template for the new mutators.
- `ScheduleActionsContext` (`src/contexts/ScheduleActionsContext.tsx`) exposes `eventNotesMap?: Map<string, EventNote>`, `eventContextOverrides?`, `getDomainForCalendar?`. `HomeViewContainer` (`src/apps/tasks/HomeViewContainer.tsx`) builds the provider value from `useEventNotes`.
- Live Today render path: `HomeViewContainer` → `HomeView` → `TodayView` (when `currentView === 'today'`). `HomeView.filteredEvents` (around line 135) computes the events passed to `TodayView`. `TodayView` maps items and renders `<ScheduleItem>` (standard item branch around line 707–828).

---

### Task 1: Working-hours / family-hours library

**Files:**
- Create: `src/lib/workingHours.ts`
- Test: `src/lib/workingHours.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workingHours.test.ts
import { describe, it, expect } from 'vitest'
import { isWorkingHours, isFamilyHours } from './workingHours'

// 2026-06-10 is a Wednesday; 2026-06-13 is a Saturday.
const wed = (h: number, m = 0) => new Date(2026, 5, 10, h, m)
const sat = (h: number, m = 0) => new Date(2026, 5, 13, h, m)

describe('isWorkingHours', () => {
  it('weekday inside 9:00–17:30 is working hours', () => {
    expect(isWorkingHours(wed(9, 0))).toBe(true)
    expect(isWorkingHours(wed(12, 0))).toBe(true)
    expect(isWorkingHours(wed(17, 29))).toBe(true)
  })
  it('weekday before 9:00 or at/after 17:30 is not working hours', () => {
    expect(isWorkingHours(wed(8, 59))).toBe(false)
    expect(isWorkingHours(wed(17, 30))).toBe(false)
    expect(isWorkingHours(wed(19, 0))).toBe(false)
  })
  it('weekend is never working hours', () => {
    expect(isWorkingHours(sat(12, 0))).toBe(false)
  })
})

describe('isFamilyHours', () => {
  it('is the complement of working hours', () => {
    expect(isFamilyHours(wed(19, 0))).toBe(true)
    expect(isFamilyHours(sat(12, 0))).toBe(true)
    expect(isFamilyHours(wed(10, 0))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/workingHours.test.ts`
Expected: FAIL — "Failed to resolve import './workingHours'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/workingHours.ts
//
// Single source of truth for the "working hours" window. Family hours are
// defined as its complement, so a future settings editor only has to expose
// one concept. v1 ships with this constant; no settings UI yet.

export interface WorkingHours {
  /** Days counted as working days. 0 = Sunday … 6 = Saturday. */
  days: number[]
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

export const WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 30, // 5:30pm
}

/** True when `date` (local wall-clock) falls inside the working window. */
export function isWorkingHours(date: Date, config: WorkingHours = WORKING_HOURS): boolean {
  if (!config.days.includes(date.getDay())) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  const start = config.startHour * 60 + config.startMinute
  const end = config.endHour * 60 + config.endMinute
  return minutes >= start && minutes < end
}

/** Family hours = everything outside the working window. */
export function isFamilyHours(date: Date, config: WorkingHours = WORKING_HOURS): boolean {
  return !isWorkingHours(date, config)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/workingHours.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workingHours.ts src/lib/workingHours.test.ts
git commit -m "feat(today): workingHours lib — working/family hours predicate"
```

---

### Task 2: Family-visibility predicate

**Files:**
- Create: `src/lib/today/eventVisibility.ts`
- Test: `src/lib/today/eventVisibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/eventVisibility.test.ts
import { describe, it, expect } from 'vitest'
import { isEventVisibleToFamily } from './eventVisibility'

describe('isEventVisibleToFamily', () => {
  it('includes family-tagged events', () => {
    expect(isEventVisibleToFamily('family', false)).toBe(true)
  })
  it('includes untagged (null) events', () => {
    expect(isEventVisibleToFamily(null, false)).toBe(true)
  })
  it('excludes private work/personal events that are not shared', () => {
    expect(isEventVisibleToFamily('work', false)).toBe(false)
    expect(isEventVisibleToFamily('personal', false)).toBe(false)
  })
  it('includes work/personal events explicitly shared with family', () => {
    expect(isEventVisibleToFamily('work', true)).toBe(true)
    expect(isEventVisibleToFamily('personal', true)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/today/eventVisibility.test.ts`
Expected: FAIL — cannot resolve `./eventVisibility`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/today/eventVisibility.ts
import type { TaskContext } from '@/types/task'

/**
 * Whether a calendar event should appear on the family/shared timeline.
 * Family-tagged and untagged events always show; private work/personal events
 * show only when explicitly shared via the "add to family timeline" flow.
 */
export function isEventVisibleToFamily(
  resolvedContext: TaskContext | null,
  sharedWithFamily: boolean,
): boolean {
  return resolvedContext === 'family' || resolvedContext == null || sharedWithFamily
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/today/eventVisibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/eventVisibility.ts src/lib/today/eventVisibility.test.ts
git commit -m "feat(today): isEventVisibleToFamily predicate"
```

---

### Task 3: Migration — add flags to `event_notes`

**Files:**
- Create: `supabase/migrations/2026-06-10_event_share_with_family.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-06-10_event_share_with_family.sql
-- Flags for surfacing a work/personal event on the shared family timeline.
ALTER TABLE event_notes
  ADD COLUMN IF NOT EXISTS shared_with_family boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_nudge_dismissed boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply to prod via the Management API**

Migration history is out of sync, so apply with the Management API (token from keychain). Run:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"ALTER TABLE event_notes ADD COLUMN IF NOT EXISTS shared_with_family boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS share_nudge_dismissed boolean NOT NULL DEFAULT false;"}'
```

- [ ] **Step 3: Verify the columns exist**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'event_notes'"'"' AND column_name IN ('"'"'shared_with_family'"'"','"'"'share_nudge_dismissed'"'"');"}'
```
Expected: both `shared_with_family` and `share_nudge_dismissed` returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-06-10_event_share_with_family.sql
git commit -m "feat(db): event_notes shared_with_family + share_nudge_dismissed flags"
```

---

### Task 4: `useEventNotes` — new fields + mutators

**Files:**
- Modify: `src/hooks/useEventNotes.ts`
- Test: `src/hooks/useEventNotes.test.ts`

- [ ] **Step 1: Add the fields to the types and mapper**

In `src/hooks/useEventNotes.ts`, add to the `EventNote` interface (after the `context?` line):

```ts
  sharedWithFamily?: boolean // Surfaced on the shared family timeline
  shareNudgeDismissed?: boolean // "Share to family" nudge dismissed for this event
```

Add to the `DbEventNote` interface (after `context: string | null`):

```ts
  shared_with_family: boolean
  share_nudge_dismissed: boolean
```

Add to `dbNoteToEventNote` (after the `context:` line):

```ts
    sharedWithFamily: dbNote.shared_with_family ?? false,
    shareNudgeDismissed: dbNote.share_nudge_dismissed ?? false,
```

- [ ] **Step 2: Add the two mutators**

In `src/hooks/useEventNotes.ts`, add these after `updateEventContext` (mirror its optimistic-upsert shape):

```ts
  // Set/clear whether an event is shared on the family timeline
  const updateEventSharedWithFamily = useCallback(async (googleEventId: string, shared: boolean) => {
    if (!user) return
    const existingNote = notes.get(googleEventId)
    const optimistic: EventNote = existingNote
      ? { ...existingNote, sharedWithFamily: shared, updatedAt: new Date() }
      : {
          id: '', googleEventId, notes: null, assignedToAll: [],
          sharedWithFamily: shared, createdAt: new Date(), updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimistic))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        { user_id: user.id, google_event_id: googleEventId, shared_with_family: shared },
        { onConflict: 'user_id,google_event_id' },
      )
      .select()
      .single()

    if (upsertError) {
      if (existingNote) setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      setError(upsertError.message)
      return
    }
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Mark the "share to family" nudge dismissed for an event (so it won't re-nag)
  const dismissShareNudge = useCallback(async (googleEventId: string) => {
    if (!user) return
    const existingNote = notes.get(googleEventId)
    const optimistic: EventNote = existingNote
      ? { ...existingNote, shareNudgeDismissed: true, updatedAt: new Date() }
      : {
          id: '', googleEventId, notes: null, assignedToAll: [],
          shareNudgeDismissed: true, createdAt: new Date(), updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimistic))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        { user_id: user.id, google_event_id: googleEventId, share_nudge_dismissed: true },
        { onConflict: 'user_id,google_event_id' },
      )
      .select()
      .single()

    if (upsertError) {
      if (existingNote) setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      setError(upsertError.message)
      return
    }
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])
```

Add both to the hook's return object (next to `updateEventContext`):

```ts
    updateEventSharedWithFamily,
    dismissShareNudge,
```

- [ ] **Step 3: Write the failing test**

Append to `src/hooks/useEventNotes.test.ts` (inside the top-level `describe`, after existing tests). It reuses the file's existing `mockUpsertResult` / `act` / `renderHook` harness:

```ts
  it('updateEventSharedWithFamily upserts and reflects the flag', async () => {
    mockUpsertResult = {
      id: 'n1', user_id: mockUser.id, google_event_id: 'evt-1', notes: null,
      assigned_to: null, assigned_to_all: null, recipe_url: null, project_id: null,
      event_title: null, event_start_time: null, context: 'work',
      shared_with_family: true, share_nudge_dismissed: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const { result } = renderHook(() => useEventNotes())
    await act(async () => { await result.current.updateEventSharedWithFamily('evt-1', true) })
    expect(result.current.getNote('evt-1')?.sharedWithFamily).toBe(true)
  })

  it('dismissShareNudge upserts and reflects the flag', async () => {
    mockUpsertResult = {
      id: 'n2', user_id: mockUser.id, google_event_id: 'evt-2', notes: null,
      assigned_to: null, assigned_to_all: null, recipe_url: null, project_id: null,
      event_title: null, event_start_time: null, context: 'work',
      shared_with_family: false, share_nudge_dismissed: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const { result } = renderHook(() => useEventNotes())
    await act(async () => { await result.current.dismissShareNudge('evt-2') })
    expect(result.current.getNote('evt-2')?.shareNudgeDismissed).toBe(true)
  })
```

- [ ] **Step 4: Run the test**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/hooks/useEventNotes.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEventNotes.ts src/hooks/useEventNotes.test.ts
git commit -m "feat(events): useEventNotes shared_with_family + dismiss nudge mutators"
```

---

### Task 5: Nudge detection — pure function + hook

**Files:**
- Create: `src/lib/today/shareNudges.ts`
- Test: `src/lib/today/shareNudges.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/shareNudges.test.ts
import { describe, it, expect } from 'vitest'
import { computeShareNudges } from './shareNudges'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'

// Wednesday 2026-06-10. 19:00 = family hours; 10:00 = working hours.
const at = (h: number) => new Date(2026, 5, 10, h, 0).toISOString()
const ev = (id: string, start: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: `Event ${id}`, start_time: start, ...extra })

// All events resolve to 'work' via this stub (calendar mapping).
const work = () => 'work' as const
const noOverrides = undefined
const noNotes = undefined

describe('computeShareNudges', () => {
  it('nudges a work event during family hours', () => {
    const out = computeShareNudges([ev('1', at(19))], noNotes, noOverrides, work)
    expect(out).toEqual([{ eventId: '1', title: 'Event 1', context: 'work' }])
  })
  it('does not nudge a work event during working hours', () => {
    expect(computeShareNudges([ev('1', at(10))], noNotes, noOverrides, work)).toEqual([])
  })
  it('does not nudge family-tagged events', () => {
    expect(computeShareNudges([ev('1', at(19))], noNotes, noOverrides, () => 'family')).toEqual([])
  })
  it('skips all-day events', () => {
    expect(computeShareNudges([ev('1', at(19), { all_day: true })], noNotes, noOverrides, work)).toEqual([])
  })
  it('skips events already shared', () => {
    const notes = new Map<string, EventNote>([['1', { id: 'n', googleEventId: '1', notes: null, sharedWithFamily: true, createdAt: new Date(), updatedAt: new Date() }]])
    expect(computeShareNudges([ev('1', at(19))], notes, noOverrides, work)).toEqual([])
  })
  it('skips events whose nudge was dismissed', () => {
    const notes = new Map<string, EventNote>([['1', { id: 'n', googleEventId: '1', notes: null, shareNudgeDismissed: true, createdAt: new Date(), updatedAt: new Date() }]])
    expect(computeShareNudges([ev('1', at(19))], notes, noOverrides, work)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/today/shareNudges.test.ts`
Expected: FAIL — cannot resolve `./shareNudges`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/today/shareNudges.ts
import { useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { TaskContext } from '@/types/task'
import { resolveEventContext } from './eventContext'
import { isFamilyHours } from '@/lib/workingHours'

export interface ShareNudge {
  eventId: string
  title: string
  context: 'work' | 'personal'
}

type DomainResolver = (calendarId?: string, calendarName?: string) => TaskContext | null

/**
 * Pure: which of these events should prompt "add to the family timeline?".
 * A work/personal, timed event during family hours that isn't already shared
 * or dismissed.
 */
export function computeShareNudges(
  events: CalendarEvent[],
  eventNotesMap: Map<string, EventNote> | undefined,
  eventContextOverrides: Map<string, TaskContext> | undefined,
  getDomainForCalendar: DomainResolver | undefined,
): ShareNudge[] {
  const nudges: ShareNudge[] = []
  for (const event of events) {
    const allDay = event.all_day ?? event.allDay ?? false
    if (allDay) continue
    const startStr = event.start_time || event.startTime
    if (!startStr) continue

    const context = resolveEventContext(event, eventContextOverrides, getDomainForCalendar)
    if (context !== 'work' && context !== 'personal') continue
    if (!isFamilyHours(new Date(startStr))) continue

    const eventId = event.google_event_id || event.id
    const note = eventNotesMap?.get(eventId)
    if (note?.sharedWithFamily) continue
    if (note?.shareNudgeDismissed) continue

    nudges.push({ eventId, title: event.title, context })
  }
  return nudges
}

/** Memoized hook wrapper for use in components. */
export function useShareToFamilyNudges(
  events: CalendarEvent[],
  eventNotesMap: Map<string, EventNote> | undefined,
  eventContextOverrides: Map<string, TaskContext> | undefined,
  getDomainForCalendar: DomainResolver | undefined,
): ShareNudge[] {
  return useMemo(
    () => computeShareNudges(events, eventNotesMap, eventContextOverrides, getDomainForCalendar),
    [events, eventNotesMap, eventContextOverrides, getDomainForCalendar],
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/today/shareNudges.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/shareNudges.ts src/lib/today/shareNudges.test.ts
git commit -m "feat(today): computeShareNudges + useShareToFamilyNudges"
```

---

### Task 6: `ShareToFamilyNudge` component

**Files:**
- Create: `src/components/schedule/ShareToFamilyNudge.tsx`
- Test: `src/components/schedule/ShareToFamilyNudge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/ShareToFamilyNudge.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareToFamilyNudge } from './ShareToFamilyNudge'

describe('ShareToFamilyNudge', () => {
  it('renders the prompt with the context label', () => {
    render(<ShareToFamilyNudge contextLabel="work" onAdd={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/work event is during family time/i)).toBeInTheDocument()
  })
  it('fires onAdd and onDismiss', () => {
    const onAdd = vi.fn()
    const onDismiss = vi.fn()
    render(<ShareToFamilyNudge contextLabel="work" onAdd={onAdd} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /add to family timeline/i }))
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/components/schedule/ShareToFamilyNudge.test.tsx`
Expected: FAIL — cannot resolve `./ShareToFamilyNudge`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/schedule/ShareToFamilyNudge.tsx
//
// Inline nudge shown under a work/personal event in Today when it falls during
// family hours: offers to surface it on the shared family timeline.
import { Users } from 'lucide-react'

interface Props {
  /** "work" or "personal" — used in the prompt copy. */
  contextLabel: string
  onAdd: () => void
  onDismiss: () => void
}

export function ShareToFamilyNudge({ contextLabel, onAdd, onDismiss }: Props) {
  return (
    <div className="mt-1 ml-12 flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-1.5 text-[12px]">
      <Users className="w-3.5 h-3.5 shrink-0 text-primary-600" aria-hidden />
      <span className="flex-1 text-neutral-600">
        This {contextLabel} event is during family time — add it to the shared family timeline?
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add to family timeline"
        className="font-medium text-primary-700 hover:text-primary-800"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="text-neutral-400 hover:text-neutral-600"
      >
        Not now
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/components/schedule/ShareToFamilyNudge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ShareToFamilyNudge.tsx src/components/schedule/ShareToFamilyNudge.test.tsx
git commit -m "feat(today): ShareToFamilyNudge inline component"
```

---

### Task 7: Context handlers + container wiring

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx`
- Modify: `src/apps/tasks/HomeViewContainer.tsx`

- [ ] **Step 1: Add the handlers to the context type**

In `src/contexts/ScheduleActionsContext.tsx`, add inside the `ScheduleActionsValue` interface, directly after `onUpdateEventContext?: ...`:

```ts
  onShareEventWithFamily?: (googleEventId: string) => void
  onDismissShareNudge?: (googleEventId: string) => void
```

- [ ] **Step 2: Destructure the new mutators in the container**

In `src/apps/tasks/HomeViewContainer.tsx`, extend the `useEventNotes()` destructure (currently `const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes();`) to also pull the two new mutators:

```ts
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject, updateEventSharedWithFamily, dismissShareNudge } = useEventNotes();
```

- [ ] **Step 3: Add the handlers to the provider value**

In `src/apps/tasks/HomeViewContainer.tsx`, in the `scheduleActionsValue` object, after `onUpdateEventContext: updateEventContext,` add:

```ts
      onShareEventWithFamily: (id: string) => updateEventSharedWithFamily(id, true),
      onDismissShareNudge: (id: string) => dismissShareNudge(id),
```

Add `updateEventSharedWithFamily, dismissShareNudge` to that `useMemo`'s dependency array (the array currently containing `updateEventContext, hideEvent,`).

- [ ] **Step 4: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ScheduleActionsContext.tsx src/apps/tasks/HomeViewContainer.tsx
git commit -m "feat(today): wire share-to-family handlers through ScheduleActionsContext"
```

---

### Task 8: Family-domain inclusion in `HomeView.filteredEvents`

**Files:**
- Modify: `src/components/home/HomeView.tsx`

- [ ] **Step 1: Add the import**

Near the other `@/lib/today` imports in `src/components/home/HomeView.tsx`, add:

```ts
import { isEventVisibleToFamily } from '@/lib/today/eventVisibility'
```

- [ ] **Step 2: Update the family branch of `filteredEvents`**

Replace the body of the `filteredEvents` `useMemo` (the `events.filter(...)` block) with:

```ts
  const filteredEvents = useMemo(() => {
    if (currentDomain === 'universal') return events
    return events.filter(event => {
      const resolved = resolveEventContext(event, ctx.eventContextOverrides, ctx.getDomainForCalendar)
      // Family view also includes work/personal events explicitly shared with family.
      if (currentDomain === 'family') {
        const note = ctx.eventNotesMap?.get(event.google_event_id || event.id)
        return isEventVisibleToFamily(resolved, !!note?.sharedWithFamily)
      }
      return resolved === currentDomain || resolved == null
    })
  }, [events, currentDomain, ctx.eventContextOverrides, ctx.getDomainForCalendar, ctx.eventNotesMap])
```

(This adds `ctx.eventNotesMap` to the dependency array — keep any existing deps that were present.)

- [ ] **Step 3: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/HomeView.tsx
git commit -m "feat(today): family view includes events shared from work/personal"
```

---

### Task 9: Render the nudge in `TodayView`

**Files:**
- Modify: `src/components/schedule/TodayView.tsx`

- [ ] **Step 1: Add imports**

Near the other `./` component imports in `src/components/schedule/TodayView.tsx`, add:

```ts
import { ShareToFamilyNudge } from './ShareToFamilyNudge'
import { useShareToFamilyNudges } from '@/lib/today/shareNudges'
```

- [ ] **Step 2: Compute the nudges (top-level hook in the component body)**

Add near the existing `const clarityHealth = useSystemHealth(...)` line in TodayView's body:

```ts
  // Share-to-family nudges keyed by event id, for inline rendering below events.
  const shareNudges = useShareToFamilyNudges(
    events,
    ctx.eventNotesMap,
    ctx.eventContextOverrides,
    ctx.getDomainForCalendar,
  )
  const shareNudgeByEventId = useMemo(() => {
    const m = new Map<string, (typeof shareNudges)[number]>()
    for (const n of shareNudges) m.set(n.eventId, n)
    return m
  }, [shareNudges])
```

- [ ] **Step 3: Render the nudge after the event's `<ScheduleItem>`**

In the standard schedule-item branch, immediately after the `<ScheduleItem ... />` closes (right after the `onOpenGuidedChat={onOpenGuidedChat}` prop and the self-closing `/>`, before the wrapping `</div>`), insert:

```tsx
                        {item.type === 'event' && (() => {
                          const nudge = shareNudgeByEventId.get(item.id.replace('event-', ''))
                          if (!nudge) return null
                          return (
                            <ShareToFamilyNudge
                              contextLabel={nudge.context}
                              onAdd={() => ctx.onShareEventWithFamily?.(nudge.eventId)}
                              onDismiss={() => ctx.onDismissShareNudge?.(nudge.eventId)}
                            />
                          )
                        })()}
```

- [ ] **Step 4: Typecheck + run TodayView tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit && npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: no type errors; TodayView tests PASS (the `useScheduleActionsContext` mock in that test file omits the new handlers, which are optional `?.` calls — no failure).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): inline share-to-family nudge on work/personal events"
```

---

### Task 10: Full verification

- [ ] **Step 1: Full typecheck + test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc clean; all tests pass (note: a known-flaky `useNotes` test may need a rerun); lint clean.

- [ ] **Step 2: Manual smoke (dev server)**

Run `npm run dev`, open `/today`, switch to a day with a work/personal event scheduled in the evening or on a weekend. Confirm: the inline nudge appears under it; **Add** makes it appear in the Family domain view (toggle the domain switcher) and removes the nudge; **Not now** removes the nudge and it does not return on reload.

- [ ] **Step 3: Push (deploys to prod)**

```bash
git push origin HEAD:main
```
(The pre-push hook runs `tsc` + tests. If rejected as non-fast-forward: `git fetch && git rebase origin/main`, then push again.)

---

## Self-Review

**Spec coverage:** event_notes flags (Task 3/4) ✓; workingHours/family-hours (Task 1) ✓; isEventVisibleToFamily predicate + HomeView + (wall deferred) (Task 2/8) ✓; detection hook (Task 5) ✓; inline surface + Add/Not now (Task 6/9) ✓; handlers persisted (Task 7) ✓; testing (each task) ✓. Wall is explicitly out of scope per the discovered constraint (edge function returns only family-mapped calendars) — noted in the plan goal.

**Placeholder scan:** none — every code step has full code; every command has expected output.

**Type consistency:** `shared_with_family`/`share_nudge_dismissed` (DB) ↔ `sharedWithFamily`/`shareNudgeDismissed` (EventNote) consistent across Tasks 3/4/5/8/9. Mutators `updateEventSharedWithFamily(id, shared)` and `dismissShareNudge(id)` named identically in Tasks 4 and 7. Context handlers `onShareEventWithFamily`/`onDismissShareNudge` consistent in Tasks 7 and 9. `ShareNudge` shape `{eventId, title, context}` consistent in Tasks 5, 6, 9.
