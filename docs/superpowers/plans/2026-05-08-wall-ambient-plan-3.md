# Wall Ambient — Plan 3 (B layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **B-layer (ambient wall)** from the surface design spec — a "Now" view on the kiosk that surfaces what's imminent, alongside a small standing rail of family context (meal, lists, discussions). Adds a third tab next to the existing **Calendar | Rooms** toggle without disrupting either.

**Architecture:** Three small components plus one hook. The hook (`useImminentEntity`) computes "what's next within ~30 min" from existing event + task state. `WallNowFocusCard` renders that imminent entity as a glance-able large card. `WallNowRail` shows a compact row of meal + open-list-count + discussion-count. `WallNowView` composes them into the new tab layout.

**Out of scope (deferred to a Plan 3.5):** peek expansion (tap-to-see-more), send-to-phone handoff, time-of-day rotation. The spec explicitly chose imminence-based focus over time-of-day rotation, so that decision is locked.

**Tech Stack:** Same as Plan 1/1.5/2.

**Related:**
- Design spec: `docs/superpowers/specs/2026-05-08-surface-design.md`
- Existing wall: `src/components/wall/` (44 components — Calendar, Rooms, widgets, voice capture, etc.)

---

## File Structure

**New files:**
```
src/components/wall/
├── now/
│   ├── WallNowView.tsx + .test.tsx
│   ├── WallNowFocusCard.tsx + .test.tsx
│   ├── WallNowRail.tsx + .test.tsx
│   └── useImminentEntity.ts + .test.ts
```

**Modified files:**
- The wall's existing tab toggle (Calendar | Rooms) — add a third "Now" option that renders `<WallNowView />`. Find the existing toggle by `grep -rn "Calendar.*Rooms\|tab.*calendar.*rooms" src/`.

---

## Task 1: useImminentEntity hook

Returns the single most-imminent task or event from now within a configurable window (default 30 min). Returns null if nothing's imminent.

**Files:**
- Create: `src/components/wall/now/useImminentEntity.ts`
- Test: `src/components/wall/now/useImminentEntity.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/components/wall/now/useImminentEntity.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useImminentEntity } from './useImminentEntity'
import { createMockTask } from '@/test/mocks/factories'

describe('useImminentEntity', () => {
  it('returns the next event within the window', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const soonEvent = { id: 'e1', title: 'Pickup', start_time: '2026-05-08T15:15:00Z' } as any
    const laterEvent = { id: 'e2', title: 'Dinner', start_time: '2026-05-08T18:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [soonEvent, laterEvent],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('event')
    expect((result.current?.entity as { id: string })?.id).toBe('e1')
  })

  it('returns the next scheduled task within the window if nothing else closer', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const task = createMockTask({
      id: 't1',
      title: 'Take out trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
      bucket: 'timed',
    })
    const { result } = renderHook(() => useImminentEntity({
      events: [],
      tasks: [task],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('task')
  })

  it('prefers the closer of an event and a task', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const task = createMockTask({
      id: 't1',
      scheduledFor: new Date('2026-05-08T15:05:00Z'),
      bucket: 'timed',
    })
    const event = { id: 'e1', start_time: '2026-05-08T15:20:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [event],
      tasks: [task],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('task')
  })

  it('returns null when nothing falls within the window', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const farEvent = { id: 'e1', start_time: '2026-05-08T22:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [farEvent],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current).toBeNull()
  })

  it('skips past entities (start time before now)', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const past = { id: 'e1', start_time: '2026-05-08T14:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [past],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current).toBeNull()
  })
})
```

Run: `npx vitest src/components/wall/now/useImminentEntity.test.ts --run` (with PATH export). Expect FAIL.

- [ ] **Step 2: Implement**

```ts
// src/components/wall/now/useImminentEntity.ts
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export type ImminentEntity =
  | { kind: 'event'; entity: CalendarEvent; startTime: Date }
  | { kind: 'task'; entity: Task; startTime: Date }

export interface UseImminentEntityInput {
  events: CalendarEvent[]
  tasks: Task[]
  now: Date
  /** Window in minutes; only entities starting within [now, now+window] are considered. */
  windowMinutes: number
}

function eventStartTime(event: CalendarEvent): Date | null {
  const iso = (event as { start_time?: string; startTime?: string }).start_time
    || (event as { start_time?: string; startTime?: string }).startTime
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function useImminentEntity(input: UseImminentEntityInput): ImminentEntity | null {
  const { events, tasks, now, windowMinutes } = input
  return useMemo(() => {
    const windowEnd = new Date(now.getTime() + windowMinutes * 60_000)
    const candidates: ImminentEntity[] = []

    for (const event of events) {
      const start = eventStartTime(event)
      if (!start) continue
      if (start <= now) continue
      if (start > windowEnd) continue
      candidates.push({ kind: 'event', entity: event, startTime: start })
    }

    for (const task of tasks) {
      if (task.bucket !== 'timed') continue
      if (!task.scheduledFor) continue
      const start = task.scheduledFor instanceof Date ? task.scheduledFor : new Date(task.scheduledFor)
      if (isNaN(start.getTime())) continue
      if (start <= now) continue
      if (start > windowEnd) continue
      candidates.push({ kind: 'task', entity: task, startTime: start })
    }

    if (candidates.length === 0) return null
    candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return candidates[0]
  }, [events, tasks, now, windowMinutes])
}
```

Run tests, expect 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall/now/useImminentEntity.ts src/components/wall/now/useImminentEntity.test.ts
git commit -m "feat(wall): useImminentEntity hook for ambient focus"
```

---

## Task 2: WallNowFocusCard

Renders the imminent entity as a large, glance-able card. Reads from the contracts the panel section components define. Renders a friendly empty state when there's nothing imminent.

**Files:**
- Create: `src/components/wall/now/WallNowFocusCard.tsx`
- Test: `src/components/wall/now/WallNowFocusCard.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/wall/now/WallNowFocusCard.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowFocusCard } from './WallNowFocusCard'
import { createMockTask } from '@/test/mocks/factories'

describe('WallNowFocusCard', () => {
  it('renders empty state when no imminent entity', () => {
    render(<WallNowFocusCard imminent={null} now={new Date('2026-05-08T15:00:00Z')} />)
    expect(screen.getByText(/nothing right now/i)).toBeInTheDocument()
  })

  it('renders event title with countdown', () => {
    const event = { id: 'e1', title: 'Pickup' } as any
    const startTime = new Date('2026-05-08T15:15:00Z')
    render(<WallNowFocusCard
      imminent={{ kind: 'event', entity: event, startTime }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Pickup')).toBeInTheDocument()
    expect(screen.getByText(/in 15 min/i)).toBeInTheDocument()
  })

  it('renders task title with countdown', () => {
    const task = createMockTask({
      id: 't1',
      title: 'Take out trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
    })
    render(<WallNowFocusCard
      imminent={{ kind: 'task', entity: task, startTime: task.scheduledFor as Date }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Take out trash')).toBeInTheDocument()
    expect(screen.getByText(/in 10 min/i)).toBeInTheDocument()
  })

  it('renders location for events with location', () => {
    const event = { id: 'e1', title: 'Doctor', location: 'Park Ave' } as any
    render(<WallNowFocusCard
      imminent={{ kind: 'event', entity: event, startTime: new Date('2026-05-08T16:00:00Z') }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText(/park ave/i)).toBeInTheDocument()
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/components/wall/now/WallNowFocusCard.tsx
import type { ImminentEntity } from './useImminentEntity'

interface WallNowFocusCardProps {
  imminent: ImminentEntity | null
  now: Date
}

function minutesUntil(target: Date, now: Date): number {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000))
}

export function WallNowFocusCard({ imminent, now }: WallNowFocusCardProps) {
  if (!imminent) {
    return (
      <div className="rounded-2xl bg-neutral-900/60 p-8 text-center">
        <p className="text-neutral-400 text-base">Nothing right now.</p>
        <p className="text-neutral-600 text-sm mt-2">Take a breath.</p>
      </div>
    )
  }

  const minutes = minutesUntil(imminent.startTime, now)
  const isEvent = imminent.kind === 'event'
  const title = isEvent
    ? (imminent.entity as { title: string }).title
    : (imminent.entity as { title: string }).title
  const location = isEvent
    ? (imminent.entity as { location?: string }).location
    : undefined

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-8 text-white">
      <div className="text-sm uppercase tracking-wider text-white/60 mb-2">In {minutes} min</div>
      <div className="font-display text-3xl font-semibold leading-tight">{title}</div>
      {location && (
        <div className="mt-3 text-base text-white/80">📍 {location}</div>
      )}
    </div>
  )
}
```

Run tests, expect 4 PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall/now/WallNowFocusCard.tsx src/components/wall/now/WallNowFocusCard.test.tsx
git commit -m "feat(wall): WallNowFocusCard for imminent entity"
```

---

## Task 3: WallNowRail

Compact row showing today's dinner, open list count, and discussion-needed count. Read-only ambient, no interactions in this version.

**Files:**
- Create: `src/components/wall/now/WallNowRail.tsx`
- Test: `src/components/wall/now/WallNowRail.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/wall/now/WallNowRail.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowRail } from './WallNowRail'

describe('WallNowRail', () => {
  it('renders dinner when provided', () => {
    render(<WallNowRail
      dinner="Lemony pasta"
      openListCount={4}
      discussionCount={2}
    />)
    expect(screen.getByText(/lemony pasta/i)).toBeInTheDocument()
  })

  it('renders list count', () => {
    render(<WallNowRail dinner={null} openListCount={4} discussionCount={0} />)
    expect(screen.getByText(/4/)).toBeInTheDocument()
  })

  it('renders discussion count when nonzero', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={3} />)
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('omits discussion section when count is 0', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={0} />)
    expect(screen.queryByText(/discuss/i)).not.toBeInTheDocument()
  })

  it('renders dinner placeholder when dinner is null', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={0} />)
    expect(screen.getByText(/no dinner planned/i)).toBeInTheDocument()
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/components/wall/now/WallNowRail.tsx
interface WallNowRailProps {
  dinner: string | null
  openListCount: number
  discussionCount: number
}

export function WallNowRail({ dinner, openListCount, discussionCount }: WallNowRailProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl bg-neutral-900/40 p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Dinner</div>
        <div className="text-base text-neutral-100 truncate">
          {dinner ?? <span className="text-neutral-500">No dinner planned</span>}
        </div>
      </div>
      <div className="rounded-xl bg-neutral-900/40 p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Lists</div>
        <div className="text-base text-neutral-100">
          🛒 {openListCount}
        </div>
      </div>
      {discussionCount > 0 ? (
        <div className="rounded-xl bg-amber-900/40 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-300 mb-1">To discuss</div>
          <div className="text-base text-amber-100">💬 {discussionCount}</div>
        </div>
      ) : (
        <div />
      )}
    </div>
  )
}
```

Run tests, expect 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall/now/WallNowRail.tsx src/components/wall/now/WallNowRail.test.tsx
git commit -m "feat(wall): WallNowRail with dinner/lists/discussion counts"
```

---

## Task 4: WallNowView

Composes the focus card + rail with a header line (date/time). Read-only.

**Files:**
- Create: `src/components/wall/now/WallNowView.tsx`
- Test: `src/components/wall/now/WallNowView.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/wall/now/WallNowView.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowView } from './WallNowView'
import { createMockTask } from '@/test/mocks/factories'

describe('WallNowView', () => {
  const baseProps = {
    events: [],
    tasks: [],
    dinner: null as string | null,
    openListCount: 0,
    discussionCount: 0,
  }

  it('renders the focus card and rail', () => {
    render(<WallNowView {...baseProps} now={new Date('2026-05-08T15:00:00Z')} />)
    expect(screen.getByText(/nothing right now/i)).toBeInTheDocument()
    expect(screen.getByText(/lists/i)).toBeInTheDocument()
  })

  it('shows date/time header', () => {
    render(<WallNowView {...baseProps} now={new Date('2026-05-08T15:00:00Z')} />)
    // The toLocaleString may render differently per env; just check that some date-like text appears
    expect(screen.getByText(/may 8|may.* 8|2026/i)).toBeInTheDocument()
  })

  it('focus card surfaces the most imminent task', () => {
    const task = createMockTask({
      id: 't1',
      title: 'Trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
      bucket: 'timed',
    })
    render(<WallNowView
      {...baseProps}
      tasks={[task]}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Trash')).toBeInTheDocument()
  })
})
```

Run, expect FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/components/wall/now/WallNowView.tsx
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useImminentEntity } from './useImminentEntity'
import { WallNowFocusCard } from './WallNowFocusCard'
import { WallNowRail } from './WallNowRail'

interface WallNowViewProps {
  events: CalendarEvent[]
  tasks: Task[]
  dinner: string | null
  openListCount: number
  discussionCount: number
  now: Date
}

export function WallNowView({
  events,
  tasks,
  dinner,
  openListCount,
  discussionCount,
  now,
}: WallNowViewProps) {
  const imminent = useImminentEntity({
    events,
    tasks,
    now,
    windowMinutes: 30,
  })

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-6 p-8 min-h-full bg-neutral-950 text-white">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl">{dateStr}</h2>
        <span className="text-base text-neutral-400">{timeStr}</span>
      </header>

      <WallNowFocusCard imminent={imminent} now={now} />

      <WallNowRail
        dinner={dinner}
        openListCount={openListCount}
        discussionCount={discussionCount}
      />
    </div>
  )
}
```

Run tests, expect 3 PASS.

- [ ] **Step 3: Type-check + run all wall/now tests**

```bash
npx tsc --noEmit
npx vitest src/components/wall/now --run
```

Expect: no errors, 17 PASS (5 hook + 4 focus + 5 rail + 3 view).

- [ ] **Step 4: Commit**

```bash
git add src/components/wall/now/WallNowView.tsx src/components/wall/now/WallNowView.test.tsx
git commit -m "feat(wall): WallNowView composing focus and rail"
```

---

## Task 5: Wire Now tab into existing wall

Find the Calendar | Rooms toggle in the wall and add a Now option.

**Files:**
- Modify: the file containing the Calendar | Rooms toggle (locate via `grep -rn "Calendar.*Rooms\|wall-tab\|setActiveView\|view === 'calendar'" src/components/wall/ --include="*.tsx"`)
- Possibly: parent wall layout that passes data into the view

- [ ] **Step 1: Locate the toggle and parent layout**

Run: `grep -rn "view === 'calendar'\|view === 'rooms'\|tabs.*calendar\|setView.*calendar" src/components/wall/ --include="*.tsx" | head -10`

Identify which file(s) contain the active-view state and the toggle UI. Pick the highest-level one (the parent that passes data down to WallCalendar / RoomsKioskView).

If you can't find a single clear toggle, **escalate (BLOCKED)** with what you found and what's ambiguous.

- [ ] **Step 2: Add a 'now' value to the view state**

Wherever the view union is defined (e.g., `'calendar' | 'rooms'`), add `'now'` as a third option. Example:

```tsx
type WallView = 'calendar' | 'rooms' | 'now'
```

- [ ] **Step 3: Add the Now tab button**

Wherever the toggle UI is, add a third button:

```tsx
<button
  onClick={() => setView('now')}
  className={view === 'now' ? activeClasses : inactiveClasses}
>
  Now
</button>
```

Match the styling pattern of the existing two tabs.

- [ ] **Step 4: Render WallNowView when view is 'now'**

Where the conditional renders `<WallCalendar />` or `<RoomsKioskView />`, add a branch for `<WallNowView />`. The parent likely already has access to `events`, `tasks`. For `dinner`, `openListCount`, `discussionCount`, the parent may need to source them — pass `null` and `0` for now if the data isn't readily available, with a comment noting the connection is deferred.

```tsx
{view === 'now' && (
  <WallNowView
    events={events}
    tasks={tasks}
    dinner={null /* TODO: connect to meal plan */}
    openListCount={0 /* TODO: connect to lists */}
    discussionCount={0 /* TODO: connect to discussion flags */}
    now={new Date()}
  />
)}
```

- [ ] **Step 5: Type-check + run full suite**

```bash
npx tsc --noEmit
npx vitest --run --reporter=dot 2>&1 | tail -8
```

Expect no type errors and full suite still passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall/
git commit -m "feat(wall): add Now tab rendering WallNowView"
```

---

## Self-review

- **Spec coverage:** Tasks 1–4 cover the spec's "imminence-based focus" + "standing rail" parts of the hybrid wall layout. Task 5 wires it as a third tab — non-disruptive to existing Calendar/Rooms behavior.
- **Out of scope (deferred):**
  - Peek expansion (tap-to-see-more) — spec calls for this; defer to Plan 3.5.
  - Send-to-phone handoff — platform integration; defer to Plan 3.5.
  - Connecting `dinner`/`openListCount`/`discussionCount` to real data — Task 5 leaves these as TODO comments with `null`/`0` defaults so the view ships, just bare.
- **Ambiguity:** Task 5's toggle location is not pre-known; the implementer must locate it via grep and may need to escalate if it's not obvious.
- **Type consistency:** `ImminentEntity` from Task 1 is consumed by Tasks 2 and 4. Same shape throughout.
