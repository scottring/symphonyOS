# Today Redesign — Layer 1 (Chrome & Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the sidebar, the Today (Day) header/stats area, and the task card to match the approved mockup — pure visual + presentational changes over existing data, no new routes, no network.

**Architecture:** Extract small pure helpers (greeting, category-icon map, day-section time range, initials) with unit tests, then add focused presentational sub-components (`StatsRow`, `TodaysFocusCard`) and evolve the three existing components (`Sidebar`, `ScheduleItem`, `TimeGroup`) in place. No data-model, hook, or routing changes in this layer.

**Tech Stack:** React 19 + TypeScript (strict), Vite 7, Tailwind v4 (Nordic Journal tokens), Vitest + React Testing Library. Icons: `lucide-react` (NO emoji — project standing rule).

**Spec:** `docs/superpowers/specs/2026-05-19-today-redesign-design.md` (Layer 1, §5).

---

## Pre-flight (not a code task)

- Per repo `CLAUDE.md`, the main worktree must stay on `main`. Implementation happens in an isolated worktree created via the `superpowers:using-git-worktrees` skill at execution time. Branch suggestion: `today-redesign-layer1`.
- After the worktree is created, copy the gitignored env file or the app renders a blank screen:
  `cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env <worktree>/.env`
- Verify baseline before changing anything:
  - Run: `npm test -- --run` → Expected: existing suite passes (note any pre-existing failures; do not fix them here).
  - Run: `npm run build` → Expected: clean TypeScript + Vite build.

## Scope decision — sidebar nav (READ THIS)

The spec (§5.1) assumed every nav label maps to an existing route. Verified false:
- `Today, Inbox, Projects, Routines, Goals, Notes, Lists, Contacts, History, Home (home-app), Meals, Settings` → **exist** as `ViewType` keys / routes.
- `Family` → **no `family` key**; the closest existing destination is the Home/Spaces app (`home-app`). Layer 1 maps the "Family" label to `home-app`. (Revisit if a dedicated family view is built.)
- `This Week` → **no view exists** (bucket data exists, no page). Explicitly deferred to its own spec (the deferred "Image 2" work). **Not added as a nav item in Layer 1.**
- `Calendar` → **no `calendar` view/route exists** anywhere in the app. **Not added as a nav item in Layer 1**; needs its own view first.

Therefore Layer 1 reorders/relabels only nav items with real destinations and adds the greeting/illustration/tagline chrome. Adding `This Week`/`Calendar` entries is out of scope until their views exist. This is called out again at handoff.

---

## Task 1: `greetingForHour` pure helper

Extracts the time-of-day greeting logic currently inlined in `Sidebar.tsx:656-662` so it is testable and reusable by the new top greeting block.

**Files:**
- Create: `src/lib/greeting.ts`
- Test: `src/lib/greeting.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/greeting.test.ts
import { describe, it, expect } from 'vitest'
import { greetingForHour } from './greeting'

describe('greetingForHour', () => {
  it('returns morning before noon', () => {
    expect(greetingForHour(0, 'Scott')).toBe('Good morning, Scott')
    expect(greetingForHour(11, 'Scott')).toBe('Good morning, Scott')
  })
  it('returns afternoon from noon to 17:59', () => {
    expect(greetingForHour(12, 'Scott')).toBe('Good afternoon, Scott')
    expect(greetingForHour(17, 'Scott')).toBe('Good afternoon, Scott')
  })
  it('returns evening from 18:00', () => {
    expect(greetingForHour(18, 'Scott')).toBe('Good evening, Scott')
    expect(greetingForHour(23, 'Scott')).toBe('Good evening, Scott')
  })
  it('uses only the first name token', () => {
    expect(greetingForHour(9, 'Scott Kaufman')).toBe('Good morning, Scott')
  })
  it('trims to a clean greeting when name is empty', () => {
    expect(greetingForHour(9, '')).toBe('Good morning')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/greeting.test.ts --run`
Expected: FAIL — cannot find module `./greeting`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/greeting.ts

/** Time-of-day greeting. `name` may be a full name; only the first token is used. */
export function greetingForHour(hour: number, name: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (name || '').trim().split(' ')[0]
  return firstName ? `${part}, ${firstName}` : part
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/greeting.test.ts --run`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/greeting.ts src/lib/greeting.test.ts
git commit -m "feat(sidebar): add greetingForHour pure helper"
```

---

## Task 2: Sidebar greeting block + house illustration + tagline

Move the greeting to the **top** of the sidebar (under the logo, per mockup), add the avatar there, add the house illustration + tagline pinned above the user/settings section. Reuse `greetingForHour`. No emoji — the mockup's ☀️ becomes a `lucide-react` `<Sun/>`.

**Files:**
- Create: `src/components/layout/HouseIllustration.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (header block ~143-161; user section greeting ~649-666)
- Test: `src/components/layout/Sidebar.greeting.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/Sidebar.greeting.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { Sidebar } from './Sidebar'

const baseProps = {
  collapsed: false,
  onToggle: () => {},
  activeView: 'today' as const,
  onViewChange: () => {},
  userName: 'Scott Kaufman',
  userEmail: 'scott@example.com',
  onSignOut: () => {},
}

describe('Sidebar greeting + tagline', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows the time-of-day greeting with first name at the top', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} />)
    expect(screen.getByText('Good morning, Scott')).toBeInTheDocument()
  })

  it('renders the tagline', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} />)
    expect(
      screen.getByText('Everything in one place, so life flows better.')
    ).toBeInTheDocument()
  })

  it('hides greeting + tagline when collapsed', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} collapsed />)
    expect(screen.queryByText('Good morning, Scott')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Everything in one place, so life flows better.')
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/layout/Sidebar.greeting.test.tsx --run`
Expected: FAIL — tagline not found; greeting not at top (current greeting is in the bottom user section and reads identically, so the tagline assertion fails first).

- [ ] **Step 3: Create the house illustration component**

```tsx
// src/components/layout/HouseIllustration.tsx

/** Calm Nordic-Journal house + landscape mark for the sidebar foot. Decorative. */
export function HouseIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      role="img"
      aria-label="A small house among trees"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="60" cy="70" rx="52" ry="7" fill="hsl(140 20% 88%)" />
      <circle cx="30" cy="48" r="14" fill="hsl(150 25% 72%)" />
      <circle cx="92" cy="50" r="11" fill="hsl(150 25% 76%)" />
      <rect x="48" y="40" width="30" height="26" rx="2" fill="hsl(28 40% 86%)" />
      <path d="M45 41 L63 26 L81 41 Z" fill="hsl(14 45% 55%)" />
      <rect x="58" y="52" width="9" height="14" rx="1" fill="hsl(168 45% 30%)" />
      <rect x="51" y="45" width="7" height="7" rx="1" fill="hsl(45 60% 92%)" />
    </svg>
  )
}
```

- [ ] **Step 4: Add the top greeting block in `Sidebar.tsx`**

In `src/components/layout/Sidebar.tsx`, add the import near the other component imports (with `import { HouseIllustration } from './HouseIllustration'` and `import { greetingForHour } from '@/lib/greeting'` and `import { Sun } from 'lucide-react'`).

Immediately after the closing `</div>` of the Header block that ends at line 161 (the `{/* Header */}` block), insert the greeting block:

```tsx
{/* Greeting */}
{!collapsed && (userName || userEmail) && (
  <div className="px-4 pb-2 flex items-center gap-2.5">
    <div className="w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center text-white text-[11px] font-medium shrink-0">
      {(userName || userEmail || 'U').charAt(0).toUpperCase()}
    </div>
    <div className="min-w-0">
      <p className="text-[13px] text-neutral-500 leading-tight flex items-center gap-1">
        {greetingForHour(new Date().getHours(), userName || userEmail || '')}
        <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add the illustration + tagline above the user section**

In `Sidebar.tsx`, immediately BEFORE the `{/* User section */}` block (the conditional starting at line 614 `{(userEmail || userName || onSignOut) && (`), insert:

```tsx
{/* Brand foot */}
{!collapsed && (
  <div className="px-6 pb-4 pt-2 flex flex-col items-center text-center">
    <HouseIllustration className="w-28 h-auto opacity-90" />
    <p className="mt-2 text-[12px] leading-snug text-neutral-400">
      Everything in one place, so life flows better.
    </p>
  </div>
)}
```

- [ ] **Step 6: Remove the now-duplicated bottom greeting**

In `Sidebar.tsx`, delete the bottom greeting block — the entire `{!collapsed && (userName || userEmail) && ( ... )}` element currently at lines 649-666 (the `<div className="mt-3 px-3 pt-3 border-t border-neutral-100">` containing the avatar + `Good morning` IIFE). The Settings and Sign out buttons in that section stay.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest src/components/layout/Sidebar.greeting.test.tsx --run`
Expected: PASS (3 tests).

- [ ] **Step 8: Regression-check the existing sidebar suite**

Run: `npx vitest src/components/layout/ --run`
Expected: PASS (existing `SidebarGroup.test.tsx`, `QuickCapture.test.tsx` unaffected).

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/HouseIllustration.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.greeting.test.tsx
git commit -m "feat(sidebar): top greeting block + house illustration + tagline"
```

---

## Task 3: Sidebar nav reorder + relabel

Reorder the always-visible nav to match the mockup's intent using only existing destinations (see Scope decision). Final Layer-1 order: **Today, Meals, Family, Projects, Home, Inbox** as flat items, with the existing `Plan`/`Library`/`Spaces`/`Apps` groups retained below. "Family" is a flat item routing to `home-app`. (`This Week`/`Calendar` deferred — not added.)

> Rationale: a full flat nav rewrite risks the grouped/inline-children behavior (rooms, lists). Layer 1 makes the **top, always-visible** items match the mockup ordering and adds the "Meals"/"Family" flat entries; the collapsible groups remain so no existing navigation is lost.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (nav block 270-314)
- Test: `src/components/layout/Sidebar.nav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/Sidebar.nav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { Sidebar } from './Sidebar'

function setup(onViewChange = vi.fn()) {
  render(
    <Sidebar
      collapsed={false}
      onToggle={() => {}}
      activeView="today"
      onViewChange={onViewChange}
      userName="Scott"
      onSignOut={() => {}}
    />
  )
  return { onViewChange }
}

describe('Sidebar primary nav', () => {
  it('shows Today, Meals, Family, Home as always-visible items', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meals' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Family' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('Family routes to the home-app view', async () => {
    const { onViewChange } = setup()
    const user = (await import('@testing-library/user-event')).default.setup()
    await user.click(screen.getByRole('button', { name: 'Family' }))
    expect(onViewChange).toHaveBeenCalledWith('home-app')
  })

  it('does not render This Week or Calendar nav items in Layer 1', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'This Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/layout/Sidebar.nav.test.tsx --run`
Expected: FAIL — "Meals" and "Family" are not always-visible buttons (Meals is nested in the `Spaces` group; no flat "Family" exists).

- [ ] **Step 3: Add flat Meals + Family items after Inbox**

In `Sidebar.tsx`, immediately AFTER the Inbox `<button>` block that ends at line 313 (`</button>` before `{/* Plan group */}`), insert two flat nav buttons. Reuse the exact class pattern used by the Today button (lines 274-282):

```tsx
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
>
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
  {!collapsed && <span className="text-[15px]">Family</span>}
</button>
```

> Note: The `Spaces` group still contains the existing `Home`/`Meals` entries with their inline children (rooms, Shelf/Habits). Those are intentionally retained — the flat items are quick top-level access matching the mockup; the grouped versions keep the inline drill-down. No behavior is removed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/layout/Sidebar.nav.test.tsx --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Manual smoke (note for executor)**

Run: `npm run dev` and confirm: Today, Meals, Family, Home flat items appear under Inbox; clicking Family lands on the Home app; the Spaces group still expands with rooms. Stop the dev server when done (per memory: long-running Vite across worktrees corrupts HMR).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.nav.test.tsx
git commit -m "feat(sidebar): flat Meals + Family quick-nav items"
```

---

## Task 4: `categoryIcon` map helper

Maps a task category / life-domain context to a `lucide-react` icon + a soft tint class for the card icon tile. Replaces the emoji category chip. No emoji.

**Files:**
- Create: `src/lib/categoryIcon.tsx`
- Test: `src/lib/categoryIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/lib/categoryIcon.test.tsx
import { describe, it, expect } from 'vitest'
import { Car, Home, Calendar, Activity, CheckSquare } from 'lucide-react'
import { categoryIcon } from './categoryIcon'

describe('categoryIcon', () => {
  it('maps known categories to icon + tint', () => {
    expect(categoryIcon('errand').Icon).toBe(Car)
    expect(categoryIcon('chore').Icon).toBe(Home)
    expect(categoryIcon('event').Icon).toBe(Calendar)
    expect(categoryIcon('activity').Icon).toBe(Activity)
  })
  it('falls back to CheckSquare for plain task / unknown / undefined', () => {
    expect(categoryIcon('task').Icon).toBe(CheckSquare)
    expect(categoryIcon(undefined).Icon).toBe(CheckSquare)
    expect(categoryIcon('nonsense' as never).Icon).toBe(CheckSquare)
  })
  it('always returns a non-empty tailwind tint class', () => {
    for (const c of ['errand', 'chore', 'event', 'activity', 'task', undefined] as const) {
      expect(categoryIcon(c).tint).toMatch(/\bbg-/)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/categoryIcon.test.tsx --run`
Expected: FAIL — cannot find module `./categoryIcon`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/lib/categoryIcon.tsx
import { Car, Home, Calendar, Activity, CheckSquare, type LucideIcon } from 'lucide-react'

export interface CategoryIcon {
  Icon: LucideIcon
  /** Tailwind tint applied to the rounded icon tile (bg + text). */
  tint: string
}

const MAP: Record<string, CategoryIcon> = {
  errand:   { Icon: Car,      tint: 'bg-orange-50 text-orange-500' },
  chore:    { Icon: Home,     tint: 'bg-sage-50 text-sage-600' },
  event:    { Icon: Calendar, tint: 'bg-blue-50 text-blue-500' },
  activity: { Icon: Activity, tint: 'bg-purple-50 text-purple-500' },
  task:     { Icon: CheckSquare, tint: 'bg-primary-50 text-primary-600' },
}

const FALLBACK: CategoryIcon = { Icon: CheckSquare, tint: 'bg-primary-50 text-primary-600' }

/** Resolve a task category to a lucide icon + tile tint. Never throws. */
export function categoryIcon(category: string | undefined): CategoryIcon {
  if (!category) return FALLBACK
  return MAP[category] ?? FALLBACK
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/categoryIcon.test.tsx --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/categoryIcon.tsx src/lib/categoryIcon.test.tsx
git commit -m "feat(card): add categoryIcon lucide map helper"
```

---

## Task 5: `initialsFor` helper

Produces the assignee initials badge text ("SK").

**Files:**
- Create: `src/lib/initials.ts`
- Test: `src/lib/initials.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/initials.test.ts
import { describe, it, expect } from 'vitest'
import { initialsFor } from './initials'

describe('initialsFor', () => {
  it('first + last initial, uppercased', () => {
    expect(initialsFor('Scott Kaufman')).toBe('SK')
  })
  it('single name → single initial', () => {
    expect(initialsFor('Scott')).toBe('S')
  })
  it('ignores extra middle tokens, uses first + last', () => {
    expect(initialsFor('Mary Jane Watson')).toBe('MW')
  })
  it('empty / whitespace → empty string', () => {
    expect(initialsFor('')).toBe('')
    expect(initialsFor('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/initials.test.ts --run`
Expected: FAIL — cannot find module `./initials`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/initials.ts

/** First + last initial, uppercased (e.g. "Scott Kaufman" -> "SK"). */
export function initialsFor(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/initials.test.ts --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/initials.ts src/lib/initials.test.ts
git commit -m "feat(card): add initialsFor helper"
```

---

## Task 6: ScheduleItem — category icon tile, Today pill, note glyph, assignee initials badge

Evolve the existing card in place. Replace the emoji category chip (`ScheduleItem.tsx:478-486`) with a lucide tile, and add a right-side cluster: a "Today" pill when the item is scheduled for today, a note glyph when `item.notes` is non-empty, and an assignee initials badge derived from the resolved assignee name.

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`
- Test: `src/components/schedule/ScheduleItem.layer1.test.tsx`

> The card resolves the assignee name from `familyMembers` + `assignedTo` (both already props, lines 203-205). Pass a precomputed `assigneeName` is NOT available — derive inline from `familyMembers.find(m => m.id === assignedTo)?.name`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/ScheduleItem.layer1.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

const today = new Date()
today.setHours(9, 0, 0, 0)

function baseItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Hang up hooks',
    startTime: today,
    completed: false,
    ...overrides,
  } as TimelineItem
}

function renderItem(item: TimelineItem, props: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={{}}>
      <ScheduleItem
        item={item}
        onSelect={() => {}}
        onToggleComplete={() => {}}
        {...props}
      />
    </ScheduleActionsProvider>
  )
}

describe('ScheduleItem Layer 1 chrome', () => {
  it('shows a "Today" pill when the item is scheduled for today', () => {
    renderItem(baseItem())
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('does NOT show "Today" pill for a future-dated item', () => {
    const future = new Date(today)
    future.setDate(future.getDate() + 3)
    renderItem(baseItem({ startTime: future }))
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('shows a note indicator when notes are present', () => {
    renderItem(baseItem({ notes: 'Use the 3M strips' }))
    expect(screen.getByLabelText('Has notes')).toBeInTheDocument()
  })

  it('hides the note indicator when notes are empty', () => {
    renderItem(baseItem({ notes: '' }))
    expect(screen.queryByLabelText('Has notes')).not.toBeInTheDocument()
  })

  it('renders assignee initials badge from family member name', () => {
    renderItem(baseItem({ assignedTo: 'fm-1' }), {
      familyMembers: [{ id: 'fm-1', name: 'Scott Kaufman' }],
      onAssign: vi.fn(),
    })
    expect(screen.getByText('SK')).toBeInTheDocument()
  })
})
```

> If `ScheduleActionsProvider`'s prop name is not `value`, adjust to the actual provider API in `src/contexts/ScheduleActionsContext.tsx`. Check before writing the test; use the real provider signature.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/ScheduleItem.layer1.test.tsx --run`
Expected: FAIL — no "Today" pill, no "Has notes" element, assignee renders as an avatar dropdown (no plain "SK" text node).

- [ ] **Step 3: Add the imports + helpers usage**

In `ScheduleItem.tsx`, add to the existing `lucide-react` import (line 10, currently `import { Redo2, Video } from 'lucide-react'`):

```tsx
import { Redo2, Video, FileText } from 'lucide-react'
```

Add new imports near the other `@/lib` imports:

```tsx
import { categoryIcon } from '@/lib/categoryIcon'
import { initialsFor } from '@/lib/initials'
```

Inside the component body, after `const projectColor = ...` (line 302), add:

```tsx
const isScheduledToday = (() => {
  if (!item.startTime) return false
  const d = new Date(item.startTime)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
})()
const hasNotes = typeof item.notes === 'string' && item.notes.trim().length > 0
const assigneeName = assignedTo ? familyMembers.find(m => m.id === assignedTo)?.name ?? '' : ''
const { Icon: CategoryGlyph, tint: categoryTint } = categoryIcon(item.category)
```

- [ ] **Step 4: Replace the emoji category chip with a lucide tile**

In `ScheduleItem.tsx`, replace the entire category-chip block at lines 478-486:

```tsx
{/* Category chip - only show for non-task categories */}
{item.category && item.category !== 'task' && (
  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs font-medium">
    {item.category === 'errand' && '🚗'}
    {item.category === 'chore' && '🧹'}
    {item.category === 'event' && '📅'}
    {item.category === 'activity' && '⚽'}
    <span className="hidden sm:inline">{item.category}</span>
  </span>
)}
```

with a lucide tile (no emoji), shown for any category including plain tasks:

```tsx
{/* Category icon tile (lucide, no emoji) */}
<span
  className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg ${categoryTint}`}
  title={item.category ?? 'task'}
  aria-hidden="true"
>
  <CategoryGlyph className="w-3.5 h-3.5" />
</span>
```

- [ ] **Step 5: Add the right-side cluster (Today pill + note glyph) in the title row**

In `ScheduleItem.tsx`, the title row's flex container is the `<div className="flex items-center gap-2">` opened at line 452. Just before its closing `</div>` (line 504, after the subtask-indicator block ending line 503), add:

```tsx
{isScheduledToday && (
  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 text-[11px] font-medium">
    Today
  </span>
)}
{hasNotes && (
  <span className="shrink-0 text-neutral-400" aria-label="Has notes" title="Has notes">
    <FileText className="w-3.5 h-3.5" />
  </span>
)}
```

- [ ] **Step 6: Add the assignee initials badge**

In `ScheduleItem.tsx`, inside the "Right indicators" group `<div className="shrink-0 flex items-center gap-0.5">` (opened line 549), add as the LAST child, immediately before that div's closing `</div>` (line 633):

```tsx
{assigneeName && (
  <span
    className="shrink-0 ml-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-semibold"
    title={assigneeName}
  >
    {initialsFor(assigneeName)}
  </span>
)}
```

> The existing `AssigneeDropdown`/`MultiAssigneeDropdown` (lines 599-632) stays — it is the interactive control. The badge is an at-a-glance label matching the mockup's "SK". Both can coexist; the badge is purely presentational.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest src/components/schedule/ScheduleItem.layer1.test.tsx --run`
Expected: PASS (5 tests).

- [ ] **Step 8: Regression-check schedule suite**

Run: `npx vitest src/components/schedule/ --run`
Expected: PASS — existing schedule tests unaffected (the emoji chip had no test asserting emoji content; confirm `TodaySchedule.test.tsx` still green).

- [ ] **Step 9: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.layer1.test.tsx
git commit -m "feat(card): lucide category tile + Today pill + note glyph + assignee initials"
```

---

## Task 7: TimeGroup — section icon + time range header

The mockup section headers read "MORNING  6:00 AM – 12:00 PM" with a leading icon. Add a pure `daySectionMeta` helper (icon + time-range string) and render it in `TimeGroup`.

**Files:**
- Create: `src/lib/daySectionMeta.tsx`
- Modify: `src/components/schedule/TimeGroup.tsx`
- Test: `src/lib/daySectionMeta.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/lib/daySectionMeta.test.tsx
import { describe, it, expect } from 'vitest'
import { Sunrise, Sun, Moon, Clock, Inbox } from 'lucide-react'
import { daySectionMeta } from './daySectionMeta'

describe('daySectionMeta', () => {
  it('morning', () => {
    const m = daySectionMeta('morning')
    expect(m.label).toBe('Morning')
    expect(m.range).toBe('6:00 AM – 12:00 PM')
    expect(m.Icon).toBe(Sunrise)
  })
  it('afternoon', () => {
    const m = daySectionMeta('afternoon')
    expect(m.range).toBe('12:00 PM – 5:00 PM')
    expect(m.Icon).toBe(Sun)
  })
  it('evening', () => {
    const m = daySectionMeta('evening')
    expect(m.range).toBe('5:00 PM – 10:00 PM')
    expect(m.Icon).toBe(Moon)
  })
  it('allday has no range', () => {
    const m = daySectionMeta('allday')
    expect(m.label).toBe('All Day')
    expect(m.range).toBe('')
    expect(m.Icon).toBe(Clock)
  })
  it('unscheduled has no range', () => {
    const m = daySectionMeta('unscheduled')
    expect(m.label).toBe('Unscheduled')
    expect(m.range).toBe('')
    expect(m.Icon).toBe(Inbox)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/daySectionMeta.test.tsx --run`
Expected: FAIL — cannot find module `./daySectionMeta`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/lib/daySectionMeta.tsx
import { Sunrise, Sun, Moon, Clock, Inbox, type LucideIcon } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel } from '@/lib/timeUtils'

export interface DaySectionMeta {
  label: string
  /** Human time window, '' for sections without one. */
  range: string
  Icon: LucideIcon
}

const RANGE: Record<DaySection, string> = {
  morning: '6:00 AM – 12:00 PM',
  afternoon: '12:00 PM – 5:00 PM',
  evening: '5:00 PM – 10:00 PM',
  allday: '',
  unscheduled: '',
}

const ICON: Record<DaySection, LucideIcon> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
  allday: Clock,
  unscheduled: Inbox,
}

export function daySectionMeta(section: DaySection): DaySectionMeta {
  return { label: getDaySectionLabel(section), range: RANGE[section], Icon: ICON[section] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/daySectionMeta.test.tsx --run`
Expected: PASS (5 tests).

- [ ] **Step 5: Render the icon + range in TimeGroup**

Replace the body of `src/components/schedule/TimeGroup.tsx` with:

```tsx
import type { ReactNode } from 'react'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'

interface TimeGroupProps {
  section: DaySection
  children: ReactNode
  isEmpty?: boolean
}

export function TimeGroup({ section, children, isEmpty }: TimeGroupProps) {
  const { label, range, Icon } = daySectionMeta(section)

  if (isEmpty) {
    return null // Don't show empty sections
  }

  return (
    <div className="mb-10">
      <h3 className="time-group-header mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-amber-500 shrink-0" />
        <span>{label}</span>
        {range && (
          <span className="text-[11px] font-normal tracking-normal text-neutral-400 normal-case">
            {range}
          </span>
        )}
      </h3>
      <div className="timeline-group stagger-in">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest src/components/schedule/ --run`
Expected: PASS (TimeGroup has no dedicated test; `TodaySchedule.test.tsx` still green).
Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/daySectionMeta.tsx src/lib/daySectionMeta.test.tsx src/components/schedule/TimeGroup.tsx
git commit -m "feat(today): section headers get lucide icon + time range"
```

---

## Task 8: `StatsRow` component

The mockup's stats line: *N due today · N this week · N total · Clarity ‹state› · AI ‹state›*. Build a presentational component fed by counts the page already computes (`actionableCount`, `weekTasks`, total tasks), plus the existing `ClarityIndicator` (kept) and an AI-availability flag from the already-present `proactive` hook result.

**Files:**
- Create: `src/components/schedule/StatsRow.tsx`
- Modify: `src/components/schedule/TodaySchedule.tsx` (desktop stats row 1127-1229)
- Test: `src/components/schedule/StatsRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/StatsRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatsRow } from './StatsRow'

describe('StatsRow', () => {
  it('renders the three counts with singular/plural words', () => {
    render(<StatsRow dueToday={2} thisWeek={17} total={47} clarityLabel="Needs attention" aiAvailable />)
    expect(screen.getByText('2 tasks due today')).toBeInTheDocument()
    expect(screen.getByText('17 tasks this week')).toBeInTheDocument()
    expect(screen.getByText('47 tasks total')).toBeInTheDocument()
  })
  it('uses singular "task" for a count of 1', () => {
    render(<StatsRow dueToday={1} thisWeek={1} total={1} clarityLabel="Good" aiAvailable={false} />)
    expect(screen.getByText('1 task due today')).toBeInTheDocument()
    expect(screen.getByText('1 task this week')).toBeInTheDocument()
  })
  it('shows clarity label and AI state', () => {
    render(<StatsRow dueToday={0} thisWeek={0} total={0} clarityLabel="Needs attention" aiAvailable />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Suggestions available')).toBeInTheDocument()
  })
  it('shows the idle AI state when none available', () => {
    render(<StatsRow dueToday={0} thisWeek={0} total={0} clarityLabel="Good" aiAvailable={false} />)
    expect(screen.getByText('No suggestions')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/schedule/StatsRow.test.tsx --run`
Expected: FAIL — cannot find module `./StatsRow`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/schedule/StatsRow.tsx
import { CheckCircle2, CalendarRange, Circle, Sparkles } from 'lucide-react'

interface StatsRowProps {
  dueToday: number
  thisWeek: number
  total: number
  clarityLabel: string
  aiAvailable: boolean
}

function plural(n: number) {
  return n === 1 ? 'task' : 'tasks'
}

export function StatsRow({ dueToday, thisWeek, total, clarityLabel, aiAvailable }: StatsRowProps) {
  return (
    <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-[13px] text-neutral-500">
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-primary-500" />
        {dueToday} {plural(dueToday)} due today
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarRange className="w-4 h-4 text-neutral-400" />
        {thisWeek} {plural(thisWeek)} this week
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Circle className="w-4 h-4 text-neutral-300" />
        {total} {plural(total)} total
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-neutral-600 font-medium">Clarity</span>
        <span className="text-neutral-400">{clarityLabel}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${aiAvailable ? 'bg-primary-500' : 'bg-neutral-300'}`} />
        <span className="text-neutral-600 font-medium">AI</span>
        <span className="text-neutral-400">{aiAvailable ? 'Suggestions available' : 'No suggestions'}</span>
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/components/schedule/StatsRow.test.tsx --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire StatsRow into the desktop header**

In `TodaySchedule.tsx`:

a. Add import with the other `./` schedule imports:
```tsx
import { StatsRow } from './StatsRow'
```

b. Compute the clarity label + AI flag. The existing `useSystemHealth` is used inside `ClarityIndicator`; for the stats row, derive a label from the same hook at the page level. Just before the `return (` of the component (line 1043), add:
```tsx
const health = useSystemHealth({ tasks, projects, projectsWithLinkedEvents })
const clarityLabel = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needsAttention: 'Needs attention',
}[health.healthColor]
const totalOpenTasks = tasks.filter(t => !t.completed).length
const aiAvailable = (proactive.suggestionsForEntity?.size ?? 0) > 0
```

> `useSystemHealth` is already imported (line 29). `proactive` is already defined (line 469). If `proactive.suggestionsForEntity` is not a `Map`, adjust `aiAvailable` to the truthy availability signal exposed by `useProactiveSuggestions` — inspect `src/hooks/useProactiveSuggestions.ts` and use its real "has any active suggestion" value. Default to `false` if none exists yet (Layer 2 makes this live).

c. Insert `<StatsRow>` at the TOP of the desktop stats row container. The container `<div className="flex items-center gap-4 pt-5 border-t border-neutral-200/60">` opens at line 1127. Replace that opening with a stacked wrapper so the new row sits above the existing controls:

Change line 1127 from:
```tsx
<div className="flex items-center gap-4 pt-5 border-t border-neutral-200/60">
```
to:
```tsx
<div className="pt-5 border-t border-neutral-200/60 space-y-4">
  <StatsRow
    dueToday={actionableCount}
    thisWeek={weekTasks.length}
    total={totalOpenTasks}
    clarityLabel={clarityLabel}
    aiAvailable={aiAvailable}
  />
  <div className="flex items-center gap-4">
```
and add one extra closing `</div>` for the new inner wrapper: the existing block currently closes at line 1229 with `</div>` then `</>`. Add a second `</div>` immediately before that `</div>` so both the inner flex row and the outer stacked wrapper close. (Net: one `<div>` opened in the change above is matched by one added `</div>`.)

> `actionableCount` (line 970) is the today-actionable count; `weekTasks` (line 670) is the week bucket; `totalOpenTasks` computed above. These reuse existing computations — no new data fetching.

- [ ] **Step 6: Run TodaySchedule tests + typecheck**

Run: `npx vitest src/components/schedule/TodaySchedule.test.tsx --run`
Expected: PASS (existing assertions unaffected; if a test asserts header DOM structure that moved, update that test minimally to match the new wrapper — do not weaken assertions).
Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/StatsRow.test.tsx src/components/schedule/TodaySchedule.tsx
git commit -m "feat(today): editorial StatsRow above desktop header controls"
```

---

## Task 9: `TodaysFocusCard` component

The mockup's left card: a leaf icon, headline ("Keep today simple and connected."), and a sub-line of counts ("2 priorities • 1 meal • 3 events"). Headline is chosen from a small templated set keyed to the clarity state — NOT LLM.

**Files:**
- Create: `src/components/schedule/TodaysFocusCard.tsx`
- Create: `src/lib/focusHeadline.ts`
- Modify: `src/components/schedule/TodaySchedule.tsx` (insert below header, above the add-input ~1237)
- Test: `src/lib/focusHeadline.test.ts`, `src/components/schedule/TodaysFocusCard.test.tsx`

- [ ] **Step 1: Write the failing helper test**

```ts
// src/lib/focusHeadline.test.ts
import { describe, it, expect } from 'vitest'
import { focusHeadline } from './focusHeadline'

describe('focusHeadline', () => {
  it('returns a calm headline for healthy states', () => {
    expect(focusHeadline('excellent')).toBe('Keep today simple and connected.')
    expect(focusHeadline('good')).toBe('Keep today simple and connected.')
  })
  it('returns a focusing headline when clarity needs attention', () => {
    expect(focusHeadline('needsAttention')).toBe('A few things need your attention today.')
    expect(focusHeadline('fair')).toBe('A few things need your attention today.')
  })
  it('falls back to the calm headline for unknown state', () => {
    expect(focusHeadline('whatever' as never)).toBe('Keep today simple and connected.')
  })
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest src/lib/focusHeadline.test.ts --run`
Expected: FAIL — cannot find module `./focusHeadline`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/focusHeadline.ts

export type ClarityState = 'excellent' | 'good' | 'fair' | 'needsAttention'

const CALM = 'Keep today simple and connected.'
const FOCUS = 'A few things need your attention today.'

/** Templated focus headline keyed to clarity state. Deterministic, not LLM. */
export function focusHeadline(state: ClarityState): string {
  if (state === 'fair' || state === 'needsAttention') return FOCUS
  return CALM
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest src/lib/focusHeadline.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing card test**

```tsx
// src/components/schedule/TodaysFocusCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TodaysFocusCard } from './TodaysFocusCard'

describe('TodaysFocusCard', () => {
  it('renders the headline and a counts sub-line', () => {
    render(<TodaysFocusCard headline="Keep today simple and connected." priorities={2} meals={1} events={3} />)
    expect(screen.getByText('Keep today simple and connected.')).toBeInTheDocument()
    expect(screen.getByText('2 priorities • 1 meal • 3 events')).toBeInTheDocument()
  })
  it('uses singular nouns for counts of 1 and omits zero segments', () => {
    render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={1} />)
    expect(screen.getByText('1 priority • 1 event')).toBeInTheDocument()
  })
  it('shows a gentle fallback when everything is zero', () => {
    render(<TodaysFocusCard headline="x" priorities={0} meals={0} events={0} />)
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run it; verify it fails**

Run: `npx vitest src/components/schedule/TodaysFocusCard.test.tsx --run`
Expected: FAIL — cannot find module `./TodaysFocusCard`.

- [ ] **Step 7: Implement the card**

```tsx
// src/components/schedule/TodaysFocusCard.tsx
import { Leaf } from 'lucide-react'

interface TodaysFocusCardProps {
  headline: string
  priorities: number
  meals: number
  events: number
}

function segment(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

export function TodaysFocusCard({ headline, priorities, meals, events }: TodaysFocusCardProps) {
  const parts = [
    segment(priorities, 'priority', 'priorities'),
    segment(meals, 'meal', 'meals'),
    segment(events, 'event', 'events'),
  ].filter(Boolean) as string[]
  const subline = parts.length > 0 ? parts.join(' • ') : 'Nothing scheduled yet'

  return (
    <div className="card flex items-start gap-3 px-5 py-4">
      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary-50 text-primary-600">
        <Leaf className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Today's Focus
        </p>
        <p className="font-display text-lg text-neutral-800 leading-snug">{headline}</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">{subline}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run it; verify it passes**

Run: `npx vitest src/components/schedule/TodaysFocusCard.test.tsx --run`
Expected: PASS (3 tests).

- [ ] **Step 9: Wire the card into TodaySchedule (desktop only)**

In `TodaySchedule.tsx`:

a. Imports:
```tsx
import { TodaysFocusCard } from './TodaysFocusCard'
import { focusHeadline } from '@/lib/focusHeadline'
```

b. Near the clarity computation added in Task 8 Step 5b, add focus counts (reuse existing grouped data — `grouped` is built from `groupByDaySection`, see line ~907; `allFilteredTasks`, `filteredEvents` exist):
```tsx
const focusEventsCount = filteredEvents.length
const focusMealsCount = filteredEvents.filter(e => /breakfast|brunch|lunch|dinner|supper/i.test(e.title)).length
const focusPrioritiesCount = allFilteredTasks.filter(t => !t.completed).length
```
> `filteredEvents` and `allFilteredTasks` are existing memo values in the component (see deps at line 951). If the exact names differ in the file, use the existing arrays the section grouping is built from — do not introduce new data sources.

c. Render the card. Immediately after the `</header>` (line 1232) and before the `{/* This week float */}` comment (line 1234), insert (desktop only, mirroring the existing `!isMobile && isToday` guard pattern):
```tsx
{!isMobile && isToday && (
  <div className="mb-6">
    <TodaysFocusCard
      headline={focusHeadline(health.healthColor)}
      priorities={focusPrioritiesCount}
      meals={focusMealsCount}
      events={focusEventsCount}
    />
  </div>
)}
```
> `health` was added in Task 8 Step 5b. `health.healthColor` is one of `excellent|good|fair|needsAttention`, matching `ClarityState`.

- [ ] **Step 10: Run schedule suite + typecheck + build**

Run: `npx vitest src/components/schedule/ --run`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/schedule/TodaysFocusCard.tsx src/components/schedule/TodaysFocusCard.test.tsx src/lib/focusHeadline.ts src/lib/focusHeadline.test.ts src/components/schedule/TodaySchedule.tsx
git commit -m "feat(today): Today's Focus card with clarity-keyed headline + counts"
```

---

## Task 10: Layer 1 verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm test -- --run`
Expected: PASS — all new Layer 1 suites green; no regression vs. the baseline captured in Pre-flight. If a pre-existing failure was present at baseline, it may remain (note it); no NEW failures.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in changed files.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean TypeScript + Vite build.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`, open the app at `localhost:5173`, log in, land on Today (desktop width ≥ 768px). Confirm against the mockup:
- Sidebar: top greeting with `<Sun/>`, flat Today/Meals/Family/Home, house illustration + tagline at foot.
- Header: editorial date + `StatsRow` (counts · Clarity · AI) above the existing controls.
- Today's Focus card below the header.
- Task cards: lucide category tile, "Today" pill on today's items, note glyph when notes exist, "SK"-style assignee badge.
- Section headers: icon + "Morning 6:00 AM – 12:00 PM" etc.
- Mobile (< 768px): unchanged — verify no regression on the compact header.
Stop the dev server when done.

- [ ] **Step 5: Final commit (if any smoke fixes)**

```bash
git add -A
git commit -m "fix(today): Layer 1 smoke adjustments"
```

---

## Self-review notes (author)

- **Spec coverage (§5):** §5.1 sidebar greeting/illustration/tagline → Tasks 1–2; nav order → Task 3 (with documented route-gap decision: This Week/Calendar deferred, Family→home-app); §5.2 stats row + Today's Focus → Tasks 8–9; D/W/M toggle and weather card are **Layer 2/own concerns** and intentionally not in Layer 1; §5.3 task-card category tile/Today pill/note glyph/assignee badge → Tasks 4–6; section headers → Task 7. Two-up Weather card is a Layer 2 dependency (placeholder not added in Layer 1 to avoid an empty box — it arrives with real data in Layer 2).
- **Route gap:** surfaced explicitly (Scope decision + Task 3). Not silently invented.
- **Type consistency:** `ClarityState` (focusHeadline) matches `health.healthColor` union from `useSystemHealth`. `categoryIcon`/`daySectionMeta` return `LucideIcon`. `initialsFor` consumed by Task 6.
- **Placeholders:** none — every code step has complete code; provider/hook-shape caveats (ScheduleActionsContext value prop, `proactive` availability field) are explicit "inspect the real signature" instructions, not vague TODOs.
- **Open assumption to verify during execution:** the exact prop name of `ScheduleActionsProvider` and the "has suggestions" field on `useProactiveSuggestions` — both flagged inline with a concrete fallback.
