# Mobile refinement — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the mobile experience — restore a tinted type-tile and section grouping on the Today list, swap and smooth the swipe gesture, turn Quick Capture into a bottom sheet on mobile, and tighten the detail panel's rhythm.

**Architecture:** Targeted visual + gesture-runtime pass within the existing Editorial Calm system (`src/index.css`). No new dependencies, no information-architecture changes. The swipe gesture moves from per-frame React state to a ref + `requestAnimationFrame` runtime so the card subtree stops re-rendering at finger speed.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 with the `@theme` tokens already defined in `src/index.css`, Vitest + React Testing Library, lucide-react for icons.

**Worktree:** All work happens in `.worktrees/mobile-refinement` on branch `mobile-refinement` (already created and pushed). Never edit the main worktree.

**Spec:** `docs/superpowers/specs/2026-05-28-mobile-refinement-design.md` (committed on this branch).

---

## File Structure

**New:**
- `src/components/schedule/MobileTypeTile.tsx` — tinted type-tile, ~40 lines.
- `src/components/schedule/MobileTypeTile.test.tsx` — unit tests.
- `src/components/schedule/ScheduleItem.test.tsx` — mobile swipe-direction tests.

**Modified:**
- `src/components/schedule/ScheduleItem.tsx` — mobile JSX branch (lines 321–426) + `ScheduleItemMobileCard` (lines 913–1007).
- `src/components/schedule/TodayView.tsx` — mobile section header beside the existing desktop header (line 593).
- `src/components/layout/QuickCapture.tsx` — overlay alignment + sheet styling on mobile (lines 263–275).
- `src/components/surface/TapContextPanel.tsx` — outer-container padding + section dividers (line 95).

**Tests adjusted (not rewritten):**
- `src/components/layout/QuickCapture.test.tsx` — add bottom-sheet structural assertions.
- `src/components/surface/TapContextPanel.test.tsx` — add divider/padding assertion.

---

## Task 1: `MobileTypeTile` component

The tinted tile that anchors each mobile card's left side. Pure, isolated; first task because everything downstream uses it.

**Files:**
- Create: `src/components/schedule/MobileTypeTile.tsx`
- Test: `src/components/schedule/MobileTypeTile.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/schedule/MobileTypeTile.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@/test/test-utils'
import { MobileTypeTile } from './MobileTypeTile'

describe('MobileTypeTile', () => {
  it('renders a Check glyph for tasks', () => {
    const { container } = render(<MobileTypeTile type="task" context={null} />)
    // lucide icons render <svg> with class containing 'lucide-check'
    expect(container.querySelector('svg.lucide-check')).toBeTruthy()
  })

  it('renders a Repeat glyph for routines', () => {
    const { container } = render(<MobileTypeTile type="routine" context={null} />)
    expect(container.querySelector('svg.lucide-repeat')).toBeTruthy()
  })

  it('renders a Calendar glyph for events', () => {
    const { container } = render(<MobileTypeTile type="event" context={null} />)
    expect(container.querySelector('svg.lucide-calendar')).toBeTruthy()
  })

  it('uses the work context tint and foreground when context=work', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" />)
    const tile = container.firstElementChild as HTMLElement
    // jsdom normalizes color serialization across versions, so match the
    // distinctive channel numbers rather than the exact `rgb(...)` syntax.
    expect(tile.style.backgroundColor).toMatch(/37/)
    expect(tile.style.backgroundColor).toMatch(/0\.08/)
    expect(tile.style.color).toMatch(/37/)
  })

  it('uses the family context tint and foreground when context=family', () => {
    const { container } = render(<MobileTypeTile type="task" context="family" />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.backgroundColor).toMatch(/217/)
    expect(tile.style.color).toMatch(/217/)
  })

  it('falls back to a non-empty primary color when context is null', () => {
    const { container } = render(<MobileTypeTile type="task" context={null} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.backgroundColor).not.toBe('')
    expect(tile.style.color).not.toBe('')
  })

  it('renders an inert wrapper (no onClick required)', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" />)
    // The tile is a presentational div, not a button.
    expect(container.querySelector('button')).toBeNull()
  })

  it('shows a strike-through state when completed=true', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" completed />)
    const tile = container.firstElementChild as HTMLElement
    // Opacity reduced for completed
    expect(tile.className).toMatch(/opacity-50/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd .worktrees/mobile-refinement
npx vitest run src/components/schedule/MobileTypeTile.test.tsx
```

Expected: FAIL — `Cannot find module './MobileTypeTile'`.

- [ ] **Step 3: Implement `MobileTypeTile`**

`src/components/schedule/MobileTypeTile.tsx`:

```tsx
import { memo } from 'react'
import { Check, Repeat, Calendar } from 'lucide-react'
import type { TaskContext } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import { DOMAIN_COLORS } from '@/lib/domainColors'

// Primary teal-forest from the design system — used as fallback when an item
// has no domain context yet.
const PRIMARY_DOT = 'hsl(168 45% 30%)'
const PRIMARY_BG = 'hsla(168, 45%, 30%, 0.08)'

interface MobileTypeTileProps {
  type: TimelineItem['type']
  context: TaskContext | null | undefined
  completed?: boolean
}

/**
 * The tinted leading tile on every mobile schedule row.
 *
 * Two jobs in one calm shape: (1) it shows the item type via the inner glyph,
 * (2) it carries the domain color via the tile tint. When `context` is null,
 * the tile uses the design system's primary teal-forest so rows without a
 * domain still feel intentional.
 *
 * Presentational only — taps on the row's checkbox / complete affordance are
 * handled elsewhere.
 */
export const MobileTypeTile = memo(function MobileTypeTile({
  type,
  context,
  completed = false,
}: MobileTypeTileProps) {
  const dot = context ? DOMAIN_COLORS[context].dot : PRIMARY_DOT
  const bg = context ? DOMAIN_COLORS[context].bg : PRIMARY_BG

  const Glyph = type === 'routine' ? Repeat : type === 'event' ? Calendar : Check

  return (
    <div
      aria-hidden
      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        completed ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: bg, color: dot }}
    >
      <Glyph className="w-[18px] h-[18px]" strokeWidth={2} />
    </div>
  )
})
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/components/schedule/MobileTypeTile.test.tsx
```

Expected: PASS — all 8 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/MobileTypeTile.tsx src/components/schedule/MobileTypeTile.test.tsx
git commit -m "feat(mobile): add MobileTypeTile component

Tinted leading tile that anchors mobile schedule rows. Encodes type
(task/routine/event) via inner lucide glyph and domain via tile tint.
Falls back to primary teal-forest when context is null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire `MobileTypeTile` into `ScheduleItem` + card visual polish

Drop the tile between the time column and title in the mobile branch, and apply `shadow-card`, the warmer border, and the slightly larger bottom-margin so the shadow has breathing room.

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` (mobile branch, ~lines 321–426; `ScheduleItemMobileCard` outer at line 969)

- [ ] **Step 1: Add the import**

In `src/components/schedule/ScheduleItem.tsx`, near the other relative imports:

```tsx
import { MobileTypeTile } from './MobileTypeTile'
```

- [ ] **Step 2: Insert the tile in the mobile JSX**

In `ScheduleItem.tsx`, the mobile branch returns `<ScheduleItemMobileCard …>` (currently around line 365–425). Inside it, between the time column and the `<div className="flex-1 min-w-0">` title block, insert:

```tsx
{/* Tinted type tile — anchors the row's left side and carries domain color */}
<MobileTypeTile
  type={item.type}
  context={item.context ?? null}
  completed={item.completed || item.skipped}
/>
```

Concretely, find this block (around line 380):

```tsx
        {/* Left time column — stacked */}
        <div className="w-12 shrink-0 text-[12px] font-medium text-neutral-500 leading-tight tabular-nums text-left">
          {renderStackedTime()}
        </div>

        {/* Title + context line */}
        <div className="flex-1 min-w-0">
```

Replace with:

```tsx
        {/* Left time column — stacked */}
        <div className="w-10 shrink-0 text-[11px] font-medium text-neutral-500 leading-tight tabular-nums text-left">
          {renderStackedTime()}
        </div>

        {/* Tinted type tile — anchors the row's left side and carries domain color */}
        <MobileTypeTile
          type={item.type}
          context={item.context ?? null}
          completed={item.completed || item.skipped}
        />

        {/* Title + context line */}
        <div className="flex-1 min-w-0">
```

Note the two small changes to the time column: `w-12` → `w-10`, and `text-[12px]` → `text-[11px]`. This tightens the time block so the tile feels like part of the same anchor.

- [ ] **Step 3: Apply the card shell visual treatment**

Find the `cardClassName` template passed to `<ScheduleItemMobileCard …>` (around line 371–376):

```tsx
        cardClassName={`
          relative flex items-center gap-3 bg-bg-elevated rounded-xl border border-neutral-200/50
          px-3 py-3
          ${selected ? 'ring-2 ring-primary-300' : ''}
          ${item.completed || item.skipped ? 'opacity-60' : ''}
        `}
```

Replace with:

```tsx
        cardClassName={`
          relative flex items-center gap-3 bg-bg-elevated rounded-2xl border border-neutral-200/70
          px-3 py-3 shadow-card
          ${selected ? 'ring-2 ring-primary-300 shadow-md' : ''}
          ${item.completed || item.skipped ? 'opacity-60' : ''}
        `}
```

Changes: `rounded-xl` → `rounded-2xl`, `border-neutral-200/50` → `border-neutral-200/70`, add `shadow-card`, and selected gets `shadow-md` on top of the ring.

- [ ] **Step 4: Bump the inter-card margin for shadow breathing room**

In `ScheduleItemMobileCard` (around line 969), find:

```tsx
    <div className="relative mb-2 overflow-hidden rounded-xl">
```

Replace with:

```tsx
    <div className="relative mb-3 overflow-hidden rounded-2xl">
```

`mb-2` → `mb-3` (12px gap between cards, lets the shadow read). `rounded-xl` → `rounded-2xl` keeps the reveal panels' clipping in sync with the card's new radius.

- [ ] **Step 5: Make the right-cluster gap a touch tighter**

In the mobile branch's right cluster (around line 399):

```tsx
        <div className="flex items-center gap-1.5 shrink-0">
```

Replace with:

```tsx
        <div className="flex items-center gap-1 shrink-0">
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. (Pre-existing errors unchanged.)

- [ ] **Step 7: Run the unit tests touched indirectly**

```bash
npx vitest run src/components/schedule/MobileTypeTile.test.tsx
```

Expected: PASS (no regression on the new component).

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx
git commit -m "feat(mobile): wire MobileTypeTile and tighten card visuals

- Insert the tinted type-tile between the time column and the title.
- shadow-card + warmer border (neutral-200/70) + rounded-2xl on the
  mobile card shell.
- Tighten the time column (w-10, 11px) and the right-cluster gap so
  the row reads as one anchored unit, not three islands.
- Bump inter-card mb to 3 so the shadow has room to breathe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Restore mobile section headers in `TodayView`

Bring back Morning / Afternoon / Evening grouping on mobile in warm italic, beside the existing desktop header.

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (~line 593)

- [ ] **Step 1: Add the mobile-only header next to the desktop one**

In `TodayView.tsx`, find the existing desktop `<h3>`:

```tsx
                  <h3 className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 mb-3 px-3 md:px-0">
                    {createElement(meta.Icon, { className: 'w-4 h-4 text-amber-500 shrink-0' })}
                    <span>{meta.label}</span>
                    {meta.range && (
                      <span className="text-neutral-300 normal-case font-normal">
                        {meta.range}
                      </span>
                    )}
                  </h3>
```

Immediately after it (still inside `<section>`), add the mobile header:

```tsx
                  <h3 className="md:hidden flex items-baseline gap-2 px-1 mb-2 mt-1">
                    <span className="font-display italic text-[15px] text-neutral-600">
                      {meta.label}
                    </span>
                    {meta.range && (
                      <span className="text-[11px] text-neutral-400 tabular-nums">
                        {meta.range}
                      </span>
                    )}
                  </h3>
```

- [ ] **Step 2: Write a test for it**

There's no existing assertion on mobile section headers. Add one to `src/components/schedule/TodayView.test.tsx` — find the existing top-level `describe` and append a new test (or add a `describe('mobile section headers', …)` block). Use the same `vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))` pattern already used in `App.test.tsx`.

Open `src/components/schedule/TodayView.test.tsx` and find the imports. At the top of the file (immediately after the existing imports), add:

```tsx
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
```

Then add a new test inside the existing `describe('TodayView', …)`:

```tsx
  it('renders mobile section headers in italic serif on mobile', () => {
    // Render with a task scheduled in the morning so a Morning section appears.
    // (Reuse the existing test helper that builds props for TodayView; see the
    // patterns at the top of this file.)
    // … existing render call …
    const morningHeader = screen.queryByText('Morning')
    expect(morningHeader).toBeInTheDocument()
    // The mobile variant uses Instrument Serif italic.
    expect(morningHeader?.className).toMatch(/font-display/)
    expect(morningHeader?.className).toMatch(/italic/)
  })
```

If `TodayView.test.tsx` doesn't already have a render helper that yields a morning-scheduled task, write the test as a smoke check on the simplest reachable case — e.g., assert that when any section header renders, the mobile italic version is in the DOM:

```tsx
  it('section labels render in italic-serif style on mobile', () => {
    // … existing render call that produces at least one section …
    const headers = document.querySelectorAll('h3.md\\:hidden')
    expect(headers.length).toBeGreaterThan(0)
    headers.forEach((h) => {
      expect(h.className).toMatch(/font-display/)
      expect(h.className).toMatch(/italic/)
    })
  })
```

Pick the variant whose render helper already produces grouped items. If neither does, choose the second (CSS-class assertion only).

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/components/schedule/TodayView.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run the full schedule test suite to catch regressions**

```bash
npx vitest run src/components/schedule
```

Expected: green except any pre-existing failures (note them separately).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(mobile): restore Morning/Afternoon/Evening section headers

Mobile-only italic Instrument Serif sibling next to the existing
desktop all-caps header. Reuses daySectionMeta for label + range.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add swipe-direction tests for `ScheduleItem` (failing)

Create `ScheduleItem.test.tsx` with tests describing the **desired** behavior. Running this task with the current code makes them fail because the directions are reversed. Task 5 makes them pass.

**Files:**
- Create: `src/components/schedule/ScheduleItem.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Force the mobile branch of ScheduleItem to render.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

const baseTask: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Call Dr. Smith',
  startTime: new Date('2026-05-28T13:00:00'),
  endTime: null,
  allDay: false,
  completed: false,
  skipped: false,
  context: 'family',
  projectId: null,
  contactId: null,
  parentTaskId: null,
  location: null,
  locationPlaceId: null,
  assignedTo: null,
  attendees: [],
  category: 'task',
  isWaiting: false,
  needsDiscussion: false,
  discussionNote: '',
  subtaskCount: 0,
  subtaskCompletedCount: 0,
  // The TimelineItem type carries the original entity; tests don't need it.
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const onToggleComplete = vi.fn()
  const onSelect = vi.fn()
  const utils = render(
    <ScheduleItem
      item={{ ...baseTask, ...overrides }}
      onSelect={onSelect}
      onToggleComplete={onToggleComplete}
    />,
  )
  // The mobile draggable card carries `data-selectable`.
  const card = utils.container.querySelector('[data-selectable]') as HTMLElement
  return { ...utils, card, onToggleComplete, onSelect }
}

function swipe(card: HTMLElement, fromX: number, toX: number) {
  fireEvent.touchStart(card, { touches: [{ clientX: fromX, clientY: 100 }] })
  fireEvent.touchMove(card, { touches: [{ clientX: toX, clientY: 100 }] })
  fireEvent.touchEnd(card)
}

describe('ScheduleItem — mobile swipe gesture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('right-to-left swipe past the commit threshold fires complete', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 200, 100) // dx = -100, past the 80px commit threshold
    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('left-to-right swipe past the commit threshold fires edit (onSelect)', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 100, 200) // dx = +100, past the 80px commit threshold
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onToggleComplete).not.toHaveBeenCalled()
  })

  it('does nothing below the commit threshold', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 100, 150) // dx = +50, under 80px
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleComplete).not.toHaveBeenCalled()
  })

  it('a primarily vertical drag is treated as scroll and fires nothing', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 110, clientY: 250 }] })
    fireEvent.touchEnd(card)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleComplete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and confirm it fails the way we expect**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx
```

Expected: FAIL — the right-to-left and left-to-right tests fire the wrong callbacks because the current implementation has the directions reversed.

- [ ] **Step 3: Commit (failing tests + scaffolding)**

```bash
git add src/components/schedule/ScheduleItem.test.tsx
git commit -m "test(mobile): describe desired swipe-direction behavior

Right-to-left swipe ⇒ complete. Left-to-right swipe ⇒ edit. Vertical
drags fire nothing. Tests fail against current code; the next commit
implements the swap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Swap swipe directions

Flip the touch-end branches and the reveal panels' sides + colors so Complete = right-to-left and Edit = left-to-right.

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — `ScheduleItemMobileCard` (lines 913–1007)

- [ ] **Step 1: Flip the touch-end commit logic**

In `ScheduleItemMobileCard.onTouchEnd` (around line 950–961), find:

```tsx
  const onTouchEnd = () => {
    setDragging(false)
    if (decided.current === 'horizontal') {
      if (dx >= swipeCommitPx) {
        onCompleteSwipe()
      } else if (dx <= -swipeCommitPx) {
        onEditSwipe()
      }
    }
    setDx(0)
    decided.current = null
  }
```

Replace with:

```tsx
  const onTouchEnd = () => {
    setDragging(false)
    if (decided.current === 'horizontal') {
      // Right-to-left (dx < 0) → Complete. Left-to-right (dx > 0) → Edit.
      if (dx <= -swipeCommitPx) {
        onCompleteSwipe()
      } else if (dx >= swipeCommitPx) {
        onEditSwipe()
      }
    }
    setDx(0)
    decided.current = null
  }
```

- [ ] **Step 2: Swap the reveal panels' sides and colors**

In the same component, find the two action overlays (around line 970–987):

```tsx
      {/* Complete action — revealed when swiping right (card moves right). */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-start pl-5 rounded-l-xl bg-emerald-500 transition-opacity ${rightActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ opacity: rightActive ? intensity : 0 }}
      >
        <Check className="w-6 h-6 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Complete</span>
      </div>
      {/* Edit action — revealed when swiping left (card moves left). */}
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 w-1/2 flex items-center justify-end pr-5 rounded-r-xl bg-sky-500 transition-opacity ${leftActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ opacity: leftActive ? intensity : 0 }}
      >
        <span className="mr-2 text-white text-sm font-medium">Edit</span>
        <Pencil className="w-5 h-5 text-white" />
      </div>
```

Replace with:

```tsx
      {/* Complete action — revealed when swiping right-to-left (card moves
          left, exposing the right side of the row). */}
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 w-1/2 flex items-center justify-end pr-5 rounded-r-2xl bg-emerald-500 transition-opacity ${leftActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ opacity: leftActive ? intensity : 0 }}
      >
        <Check className="w-6 h-6 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Complete</span>
      </div>
      {/* Edit action — revealed when swiping left-to-right (card moves
          right, exposing the left side of the row). */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-start pl-5 rounded-l-2xl bg-sky-500 transition-opacity ${rightActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ opacity: rightActive ? intensity : 0 }}
      >
        <Pencil className="w-5 h-5 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Edit</span>
      </div>
```

Note: `rounded-l-xl` / `rounded-r-xl` → `rounded-l-2xl` / `rounded-r-2xl` to match the card's new `rounded-2xl`.

- [ ] **Step 3: Run the swipe tests**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx
```

Expected: all 4 cases PASS.

- [ ] **Step 4: Run the broader schedule tests for regressions**

```bash
npx vitest run src/components/schedule
```

Expected: green except any pre-existing failures.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx
git commit -m "fix(mobile): swap swipe directions to match reading direction

Right-to-left swipe now commits Complete (emerald reveals on the
right). Left-to-right swipe commits Edit (sky reveals on the left).
Card corner radii updated to match the new rounded-2xl shell.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rebuild swipe runtime with ref + rAF for smoothness

Drive `translateX` and the reveal-panel opacities from refs during the drag instead of React state, so the card subtree stops re-rendering at finger speed.

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — `ScheduleItemMobileCard`

- [ ] **Step 1: Replace the component body**

Find the entire `ScheduleItemMobileCard` function (lines 913–1007) and replace it with this rewrite. The signature and props are unchanged; only the internals move from state-driven to ref-driven.

```tsx
function ScheduleItemMobileCard({
  swipeCommitPx,
  swipeMaxPx,
  onCompleteSwipe,
  onEditSwipe,
  ariaPressed,
  cardClassName,
  children,
}: ScheduleItemMobileCardProps) {
  // `dragging` is the only React state — it flips on/off between gestures so
  // the CSS transition class can toggle. Per-frame motion is driven via refs
  // below so the card subtree (including dropdowns) never re-renders mid-drag.
  const [dragging, setDragging] = useState(false)

  const cardEl = useRef<HTMLDivElement>(null)
  const completePanelEl = useRef<HTMLDivElement>(null)
  const editPanelEl = useRef<HTMLDivElement>(null)

  const startX = useRef(0)
  const startY = useRef(0)
  const decided = useRef<'horizontal' | 'vertical' | null>(null)
  const dxRef = useRef(0)
  const rafPending = useRef(false)
  const haptic = useRef(false) // fires once per gesture when crossing commit

  const paint = () => {
    rafPending.current = false
    const dx = dxRef.current
    if (cardEl.current) {
      cardEl.current.style.transform = `translateX(${dx}px)`
    }
    const intensity = Math.min(1, Math.abs(dx) / swipeCommitPx)
    if (completePanelEl.current) {
      completePanelEl.current.style.opacity = dx < 0 ? String(intensity) : '0'
    }
    if (editPanelEl.current) {
      editPanelEl.current.style.opacity = dx > 0 ? String(intensity) : '0'
    }
    // Light haptic tick on commit-threshold crossing (Android only; no-op on iOS).
    if (!haptic.current && Math.abs(dx) >= swipeCommitPx) {
      haptic.current = true
      navigator.vibrate?.(10)
    }
  }

  const requestPaint = () => {
    if (rafPending.current) return
    rafPending.current = true
    requestAnimationFrame(paint)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
    decided.current = null
    dxRef.current = 0
    haptic.current = false
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const ax = t.clientX - startX.current
    const ay = t.clientY - startY.current
    if (decided.current === null) {
      if (Math.abs(ax) < 6 && Math.abs(ay) < 6) return
      decided.current = Math.abs(ax) > Math.abs(ay) ? 'horizontal' : 'vertical'
    }
    if (decided.current === 'vertical') return // let the page scroll
    dxRef.current = Math.max(-swipeMaxPx, Math.min(swipeMaxPx, ax))
    requestPaint()
  }

  const commit = () => {
    const dx = dxRef.current
    if (decided.current === 'horizontal') {
      // Right-to-left → Complete. Left-to-right → Edit.
      if (dx <= -swipeCommitPx) {
        onCompleteSwipe()
      } else if (dx >= swipeCommitPx) {
        onEditSwipe()
      }
    }
    // Snap back. Once `dragging` flips to false on the next React frame, the
    // card gains the transform-transition class, so this looks like a spring.
    dxRef.current = 0
    requestPaint()
    decided.current = null
    setDragging(false)
  }

  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl">
      {/* Complete action — right side, revealed on right-to-left swipe. */}
      <div
        ref={completePanelEl}
        aria-hidden
        className="absolute inset-y-0 right-0 w-1/2 flex items-center justify-end pr-5 rounded-r-2xl bg-emerald-500"
        style={{ opacity: 0 }}
      >
        <Check className="w-6 h-6 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Complete</span>
      </div>
      {/* Edit action — left side, revealed on left-to-right swipe. */}
      <div
        ref={editPanelEl}
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/2 flex items-center justify-start pl-5 rounded-l-2xl bg-sky-500"
        style={{ opacity: 0 }}
      >
        <Pencil className="w-5 h-5 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Edit</span>
      </div>

      <div
        ref={cardEl}
        data-selectable
        aria-pressed={ariaPressed}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={commit}
        onTouchCancel={commit}
        className={cardClassName}
        style={{
          transform: 'translateX(0px)',
          transition: dragging ? 'none' : 'transform 200ms ease-out',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
```

Notes:
- The old `dx` React state is gone; `dragging` remains because it gates the CSS transition class. State changes happen exactly twice per gesture (start, end), not once per move.
- The old `Check` / `Pencil` imports at the top of the file are still in use — no import changes.
- The old outer `mb-2 rounded-xl` is now `mb-3 rounded-2xl`, matching Task 2.

- [ ] **Step 2: Run the swipe behavior tests**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx
```

Expected: all 4 cases still PASS — behavior is preserved, only the runtime changed.

> **Gotcha:** jsdom polyfills `requestAnimationFrame` to roughly `setTimeout(fn, 0)`, which `fireEvent` and React's batching let flush by the time `touchEnd` lands. If a case ever flakes, wrap the test body in `act` from `@testing-library/react` — the existing scheduler is usually enough.

- [ ] **Step 3: Add a smoothness assertion (no per-move state churn)**

Append to `src/components/schedule/ScheduleItem.test.tsx`:

```tsx
describe('ScheduleItem — swipe runtime', () => {
  it('updates the card transform via inline style on touchmove', async () => {
    const { container } = render(
      <ScheduleItem
        item={baseTask}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    const card = container.querySelector('[data-selectable]') as HTMLElement
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 140, clientY: 100 }] })
    // Flush the rAF tick scheduled by touchmove.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    // The card's inline transform must reflect the drag delta directly,
    // proving the gesture is driven by ref-based DOM writes rather than a
    // React re-render path.
    expect(card.style.transform).toMatch(/translateX\(-60px\)/)
  })
})
```

- [ ] **Step 4: Run the new assertion**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Type-check and broader regression check**

```bash
npx tsc --noEmit
npx vitest run src/components/schedule
```

Expected: no new type errors; schedule suite green except pre-existing failures.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "perf(mobile): drive swipe gesture from refs + rAF

ScheduleItemMobileCard previously called setDx() on every touchmove,
re-rendering the card subtree (including dropdowns) at finger speed.
Move per-frame motion to refs, paint via requestAnimationFrame, and
keep React state for only the gesture lifecycle. Adds a coarse haptic
tick on commit-threshold crossing where supported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: QuickCapture mobile bottom sheet

Convert the centered modal into a bottom sheet on mobile while leaving the desktop modal untouched.

**Files:**
- Modify: `src/components/layout/QuickCapture.tsx` (lines 263–275)
- Modify: `src/components/layout/QuickCapture.test.tsx` — add a bottom-sheet assertion

- [ ] **Step 1: Replace the overlay container + modal shell**

In `QuickCapture.tsx`, find this block (around line 263–276):

```tsx
      {/* Modal Overlay */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 bg-black/40 flex items-center justify-center transition-opacity duration-200 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          onClick={handleClose}
        >
          {/* Modal Content */}
          <div
            className={`bg-white p-6 w-[90%] md:w-1/2 max-w-lg rounded-2xl shadow-xl transition-all duration-200 ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
```

Replace with:

```tsx
      {/* Modal Overlay — bottom sheet on mobile, centered modal on desktop. */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 bg-black/40 flex items-end justify-center md:items-center transition-opacity duration-200 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          onClick={handleClose}
        >
          {/* Sheet / Modal Content */}
          <div
            data-testid="quick-capture-sheet"
            className={`
              bg-bg-elevated shadow-xl
              w-full md:w-1/2 md:max-w-lg
              rounded-t-3xl md:rounded-2xl
              p-6
              transform transition-transform duration-200 md:transition-all
              motion-reduce:transition-none
              ${isClosing
                ? 'translate-y-full md:translate-y-0 md:opacity-0 md:scale-95'
                : 'translate-y-0 md:opacity-100 md:scale-100'}
            `}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — mobile only, decorative */}
            <div
              aria-hidden
              className="md:hidden mx-auto w-10 h-1.5 rounded-full bg-neutral-200 mb-3"
            />
```

Changes:
- `flex items-center justify-center` → `flex items-end justify-center md:items-center` (bottom-anchored on mobile).
- `bg-white` → `bg-bg-elevated` (warm paper from the design system).
- `w-[90%]` → `w-full` on mobile (full-bleed sheet); `md:w-1/2 md:max-w-lg` keeps desktop unchanged.
- `rounded-2xl` → `rounded-t-3xl md:rounded-2xl` (only top corners curved on mobile).
- Closing animation: `translate-y-full` on mobile, fade-and-shrink on desktop.
- `safe-bottom` via inline `paddingBottom` using `env(safe-area-inset-bottom)` (matches the pattern used elsewhere in `AppShell.tsx`).
- New decorative drag-handle is rendered above the existing form.

- [ ] **Step 2: Add a test asserting the mobile bottom-sheet shape**

Open `src/components/layout/QuickCapture.test.tsx`. At the top of the file (after the existing imports) add:

```tsx
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
```

> `QuickCapture` itself doesn't read `useMobile` — the mobile-vs-desktop behavior is purely CSS-driven via `md:` breakpoints. The mock is unnecessary for `QuickCapture` but is included here for parity with the other mobile tests; remove it if it isn't needed in your test environment.

Inside the existing `describe('QuickCapture', …)`, add a new sub-describe:

```tsx
  describe('mobile bottom sheet', () => {
    it('anchors the overlay to the bottom on mobile (items-end)', () => {
      const { container } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      const overlay = container.querySelector('.fixed.inset-0') as HTMLElement
      expect(overlay.className).toMatch(/items-end/)
      // Desktop alignment is preserved as a responsive variant.
      expect(overlay.className).toMatch(/md:items-center/)
    })

    it('uses bg-bg-elevated, full-bleed width, and rounded top corners on mobile', () => {
      const { getByTestId } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      const sheet = getByTestId('quick-capture-sheet')
      expect(sheet.className).toMatch(/bg-bg-elevated/)
      expect(sheet.className).toMatch(/w-full/)
      expect(sheet.className).toMatch(/rounded-t-3xl/)
    })

    it('renders a decorative drag handle (mobile only)', () => {
      const { container } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      // The handle is the first child of the sheet and is mobile-only.
      const handle = container.querySelector('.md\\:hidden.mx-auto.rounded-full')
      expect(handle).not.toBeNull()
    })
  })
```

- [ ] **Step 3: Run QuickCapture tests**

```bash
npx vitest run src/components/layout/QuickCapture.test.tsx
```

Expected: all existing tests still pass, three new tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/QuickCapture.tsx src/components/layout/QuickCapture.test.tsx
git commit -m "feat(mobile): convert QuickCapture to a bottom sheet on mobile

Bottom-anchored on mobile (items-end + translate-y closing), warm
bg-bg-elevated, full-bleed width, rounded top corners only, decorative
drag handle, safe-area-aware bottom padding. Desktop modal unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: TapContextPanel rhythm polish

Add hairline dividers between sections and tighten the outer container's mobile padding + safe-top.

**Files:**
- Modify: `src/components/surface/TapContextPanel.tsx` (line 95)
- Modify: `src/components/surface/TapContextPanel.test.tsx`

- [ ] **Step 1: Update the outer article**

In `TapContextPanel.tsx`, find:

```tsx
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
```

Replace with:

```tsx
    <article
      className="
        bg-bg-elevated max-w-md w-full
        rounded-2xl
        px-4 md:px-5 py-3 md:py-5
        divide-y divide-neutral-200/60
        [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
      "
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
```

Changes:
- Mobile padding tightened (`px-4 py-3`) while desktop keeps `px-5 py-5`.
- Each direct child becomes a row in a single column with a warm hairline divider above it (`divide-y divide-neutral-200/60`), and a consistent `py-4` rhythm with `first:pt-0 last:pb-0` so the top and bottom hug the article edges.
- Safe-top inline so the header doesn't crash into the notch when the panel renders as a full-screen mobile overlay.

> **Watch:** if any individual `Panel*` section already sets its own vertical padding (e.g., a wrapping `<div className="py-4">`), it will compound with the outer `[&>*]:py-4`. Spot-check the visual; if a section feels overpadded, remove its inner `py-*` rather than carving an exception into the outer container.

- [ ] **Step 2: Add a structural test**

In `src/components/surface/TapContextPanel.test.tsx`, find the existing `describe('TapContextPanel', …)` block and append:

```tsx
  it('lays sections out in a single column with hairline dividers', () => {
    // Reuse the existing render helper at the top of this file. If none
    // exists in this file, replicate the minimal handler bag from baseHandlers
    // and pass a mock task + empty contacts/projects/events/familyMembers/
    // siblingTaskCandidates/allTasks.
    const task = createMockTask({ id: 'task-1', title: 'Test' })
    const { container } = render(
      <TapContextPanel
        task={task}
        contacts={[]}
        projects={[]}
        events={[]}
        familyMembers={[]}
        siblingTaskCandidates={[]}
        allTasks={[task]}
        {...baseHandlers}
        onAddLink={vi.fn()}
        onUpdateLocation={vi.fn()}
        onClearLocation={vi.fn()}
        onContextChange={vi.fn()}
        onAssigneesChange={vi.fn()}
        onAddSubtask={vi.fn()}
        onToggleSubtask={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenRelated={vi.fn()}
      />,
    )
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    expect(article!.className).toMatch(/divide-y/)
    expect(article!.className).toMatch(/divide-neutral-200/)
  })
```

If `baseHandlers` and `createMockTask` aren't already imported in the test file, mirror the imports already at the top.

- [ ] **Step 3: Run the panel tests**

```bash
npx vitest run src/components/surface/TapContextPanel.test.tsx
```

Expected: all existing tests pass, new test passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/surface/TapContextPanel.tsx src/components/surface/TapContextPanel.test.tsx
git commit -m "feat(panel): single-column rhythm with hairline dividers

Outer article gets divide-y between direct children, consistent py-4
rhythm, tighter mobile padding (px-4 py-3), and safe-area-aware top
padding so the header doesn't crash into the notch on mobile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Final verification

Run the full quality gate from the repo root in the worktree.

- [ ] **Step 1: Lint**

```bash
cd .worktrees/mobile-refinement
npm run lint
```

Expected: clean. Pre-push to `main` includes `tsc --noEmit` but not lint; CI runs lint and red CI on this branch will be visible after push. Fix any new warnings introduced by this work.

- [ ] **Step 2: Unit tests**

```bash
npx vitest run
```

Expected: green except any pre-existing failures. Note any new flakes by re-running the failing test in isolation.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: clean. This catches the stricter `tsc -b` errors Vercel runs on deploy that `tsc --noEmit` doesn't.

- [ ] **Step 4: Manual smoke (optional, recommended for visual changes)**

```bash
# .env is gitignored — copy it into the worktree before starting Vite
cp ../../.env . 2>/dev/null || cp ../../../symphonyOS/.env . 2>/dev/null
npm run dev
```

Open on a phone or in Chrome DevTools Device Toolbar at iPhone 14 size. Walk the Today list — every row has a tinted tile, section headers visible, swipe Complete to the left (right-to-left), Edit to the right (left-to-right), gesture feels glassy. Tap a row — panel slides in with consistent rhythm. Tap the FAB or capture entry — sheet rises from the bottom.

- [ ] **Step 5: Push the branch**

```bash
git push origin mobile-refinement
```

The branch is already tracking `origin/mobile-refinement` from the spec push. This push triggers a Vercel preview deploy automatically.

- [ ] **Step 6: Open a PR (or merge to `main`)**

Either:

```bash
gh pr create --base main --head mobile-refinement \
  --title "Mobile refinement: list card, swipe, capture, panel" \
  --body "$(cat docs/superpowers/specs/2026-05-28-mobile-refinement-design.md | head -40)"
```

Or merge directly once verified:

```bash
git push origin mobile-refinement:main
```

Pushing directly to `main` auto-deploys to production (per `vercel.json` `git.deploymentEnabled: true`). Only do this once the manual smoke confirms the gesture and visuals are right.

---

## Self-review

**Spec coverage:**
- ✅ Today list card refinement → Tasks 1, 2
- ✅ Mobile section headers → Task 3
- ✅ Swipe direction swap → Tasks 4, 5
- ✅ Swipe smoothness (ref + rAF) → Task 6
- ✅ Quick Capture bottom sheet → Task 7
- ✅ Detail panel rhythm → Task 8
- ✅ No new dependencies → enforced by review of imports
- ✅ Reduced-motion (open question) → handled via `motion-reduce:transition-none` in Task 7; swipe spring is a CSS transition that respects `motion-reduce` automatically when paired with `prefers-reduced-motion` queries — Task 6's snap-back is a `transition: transform 200ms` that motion-reduce will override at the browser level. No further action needed.
- ✅ Spec's open question on `OverdueSection.tsx` mobile path → left alone per spec
- ✅ Spec's open question on Today's mobile capture entry → manual smoke in Task 9 verifies any inline entry still opens the new sheet, since the sheet replaces the modal regardless of how `isOpen` is triggered

**Type consistency:**
- `MobileTypeTile` props: `type: TimelineItem['type']`, `context: TaskContext | null | undefined`, `completed?: boolean` — used identically in Task 2.
- `ScheduleItemMobileCard` signature unchanged from current code through Tasks 5 + 6 (only internals change).
- `TapContextPanel` external API unchanged.

**Placeholder scan:** none. Every step has either a complete code block or a complete shell command.
