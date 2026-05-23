# Directions on Tasks with Locations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing directions experience (travel modes, add/rename stops, Open in Maps) to tasks that have a location, and let the user set/change/clear a task's location from the detail panel.

**Architecture:** A new cohesive `PanelLocation` section in the task detail panel (`TapContextPanel`) wraps the existing `PlacesAutocomplete` (set/change/clear the place) and the existing `DirectionsBuilder` (the route UI). A `Directions ▸` toggle is added to the panel's actions row (mirroring `TapEventPanel`); it flips a `showDirections` state in `TapContextPanel` that expands the builder inside `PanelLocation`. Location persistence reuses the existing `updateTask` path (already maps `location` / `locationPlaceId` to DB columns).

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, existing `useDirections` hook, `PlacesAutocomplete`, `DirectionsBuilder`.

**Spec:** `docs/superpowers/specs/2026-05-23-task-directions-design.md`

---

## File Structure

- **Create:** `src/components/surface/sections/PanelLocation.tsx` — the Location section (editor + directions toggle target).
- **Create:** `src/components/surface/sections/PanelLocation.test.tsx` — unit tests.
- **Modify:** `src/components/surface/sections/PanelActions.tsx` — add `location?` + `onShowDirections?` and render a Directions button.
- **Modify:** `src/components/surface/sections/PanelActions.test.tsx` — cover the new button.
- **Modify:** `src/components/surface/TapContextPanel.tsx` — new props, `showDirections` state, render `PanelLocation`, pass toggle to `PanelActions`.
- **Modify:** `src/App.tsx` — wire `onUpdateLocation` / `onClearLocation` to `updateTask`.

---

## Task 1: `PanelLocation` component

**Files:**
- Create: `src/components/surface/sections/PanelLocation.tsx`
- Test: `src/components/surface/sections/PanelLocation.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/surface/sections/PanelLocation.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLocation } from './PanelLocation'

// Mock the directions hook so neither PlacesAutocomplete nor DirectionsBuilder
// touch the Google Maps SDK during unit tests.
const searchPlaces = vi.fn().mockResolvedValue([
  { placeId: 'p1', description: '1 Main St, Townsville', mainText: '1 Main St', secondaryText: 'Townsville' },
])
const getPlaceDetails = vi.fn().mockResolvedValue({ address: '1 Main St, Townsville', name: '1 Main St' })

vi.mock('@/hooks/useDirections', () => ({
  useDirections: () => ({
    isCalculating: false,
    error: null,
    result: null,
    calculateRoute: vi.fn(),
    searchPlaces,
    getPlaceDetails,
    openInMaps: vi.fn(),
  }),
  formatDuration: (s: number) => `${s}s`,
  formatDistance: (m: number) => `${m}m`,
}))

describe('PanelLocation', () => {
  const baseProps = {
    taskTitle: 'Pick up dry cleaning',
    showDirections: false,
    onUpdateLocation: vi.fn(),
    onClearLocation: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a place search input when no location is set', () => {
    render(<PanelLocation {...baseProps} />)
    expect(screen.getByPlaceholderText(/add a location/i)).toBeInTheDocument()
  })

  it('shows the location address when set, without the directions builder', () => {
    render(<PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" />)
    expect(screen.getByText('500 Market St')).toBeInTheDocument()
    expect(screen.queryByText(/Directions to/i)).not.toBeInTheDocument()
  })

  it('shows the directions builder when a location is set and showDirections is true', () => {
    render(<PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" showDirections />)
    expect(screen.getByText(/Directions to Pick up dry cleaning/i)).toBeInTheDocument()
  })

  it('calls onClearLocation when the location is removed', async () => {
    const onClearLocation = vi.fn()
    const { user } = render(
      <PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" onClearLocation={onClearLocation} />
    )
    await user.click(screen.getByLabelText(/remove location/i))
    expect(onClearLocation).toHaveBeenCalledOnce()
  })

  it('calls onUpdateLocation with address and placeId when a place is selected', async () => {
    const onUpdateLocation = vi.fn()
    const { user } = render(<PanelLocation {...baseProps} onUpdateLocation={onUpdateLocation} />)
    await user.type(screen.getByPlaceholderText(/add a location/i), 'Main St')
    const result = await screen.findByText('1 Main St')
    await user.click(result)
    expect(onUpdateLocation).toHaveBeenCalledWith('1 Main St, Townsville', 'p1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/surface/sections/PanelLocation.test.tsx`
Expected: FAIL — cannot find module `./PanelLocation`.

- [ ] **Step 3: Write the component**

Create `src/components/surface/sections/PanelLocation.tsx`:

```tsx
import { useDirections } from '@/hooks/useDirections'
import { PlacesAutocomplete } from '@/components/location/PlacesAutocomplete'
import { DirectionsBuilder } from '@/components/directions'

interface PanelLocationProps {
  location?: string
  locationPlaceId?: string
  taskTitle: string
  /** When true and a location is set, the directions builder is expanded. */
  showDirections: boolean
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
}

export function PanelLocation({
  location,
  locationPlaceId,
  taskTitle,
  showDirections,
  onUpdateLocation,
  onClearLocation,
}: PanelLocationProps) {
  const { searchPlaces, getPlaceDetails } = useDirections()

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Location</div>
      <PlacesAutocomplete
        value={location ? { address: location, placeId: locationPlaceId } : null}
        onSelect={(place) => onUpdateLocation(place.address, place.placeId)}
        onClear={onClearLocation}
        onSearch={searchPlaces}
        onGetDetails={getPlaceDetails}
        placeholder="Add a location…"
      />
      {location && showDirections && (
        <div className="mt-3 -mx-1 bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <DirectionsBuilder
            destination={{ name: taskTitle, address: location, placeId: locationPlaceId }}
            eventTitle={taskTitle}
          />
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/surface/sections/PanelLocation.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelLocation.tsx src/components/surface/sections/PanelLocation.test.tsx
git commit -m "feat(directions): PanelLocation section for task detail panel"
```

---

## Task 2: Directions toggle in `PanelActions`

**Files:**
- Modify: `src/components/surface/sections/PanelActions.tsx`
- Test: `src/components/surface/sections/PanelActions.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('PanelActions', …)` block in `src/components/surface/sections/PanelActions.test.tsx`:

```tsx
  it('renders Directions button when location present', () => {
    render(<PanelActions {...baseProps} location="500 Market St" onShowDirections={vi.fn()} />)
    expect(screen.getByRole('button', { name: /directions/i })).toBeInTheDocument()
  })

  it('does not render Directions button when location missing', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.queryByRole('button', { name: /directions/i })).not.toBeInTheDocument()
  })

  it('calls onShowDirections when Directions clicked', async () => {
    const onShowDirections = vi.fn()
    const { user } = render(
      <PanelActions {...baseProps} location="500 Market St" onShowDirections={onShowDirections} />
    )
    await user.click(screen.getByRole('button', { name: /directions/i }))
    expect(onShowDirections).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/surface/sections/PanelActions.test.tsx`
Expected: FAIL — the Directions button does not exist yet.

- [ ] **Step 3: Add the props and button**

In `src/components/surface/sections/PanelActions.tsx`, add `location` and `onShowDirections` to the props interface (after `phoneNumber`):

```tsx
interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  location?: string
  scheduledFor?: Date
  isAllDay?: boolean
  isPinned: boolean
  onToggleComplete: () => void
  onShowDirections?: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClearSchedule?: () => void
  onTogglePin: () => void
  onDelete: () => void
}
```

Destructure the two new props in the function signature (after `phoneNumber,`):

```tsx
export function PanelActions({
  completed,
  phoneNumber,
  location,
  scheduledFor,
  isAllDay,
  isPinned,
  onToggleComplete,
  onShowDirections,
  onSchedule,
  onClearSchedule,
  onTogglePin,
  onDelete,
}: PanelActionsProps) {
```

Add the Directions button immediately after the `phoneNumber` `<a>` block (before `<SchedulePopover …>`):

```tsx
      {location && onShowDirections && (
        <button
          onClick={onShowDirections}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <ConceptIcon name="location" decorative /> Directions
        </button>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/surface/sections/PanelActions.test.tsx`
Expected: PASS (all existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelActions.tsx src/components/surface/sections/PanelActions.test.tsx
git commit -m "feat(directions): Directions toggle button in PanelActions"
```

---

## Task 3: Wire `PanelLocation` into `TapContextPanel`

**Files:**
- Modify: `src/components/surface/TapContextPanel.tsx`

This task has no unit test of its own (the panel is verified via its sections and manual run); correctness is checked by the typecheck/build in Task 5.

- [ ] **Step 1: Add the imports**

In `src/components/surface/TapContextPanel.tsx`, add after the existing section imports (the `PanelActions` import is on line ~8):

```tsx
import { PanelLocation } from './sections/PanelLocation'
```

Add `useEffect` and `useState` to the React import at the top of the file. There is currently no React import (the file uses only types). Add this as the first import line:

```tsx
import { useEffect, useState } from 'react'
```

- [ ] **Step 2: Add the two new handler props**

In the `TapContextPanelProps` interface, add after `onAddLink: (url: string) => void`:

```tsx
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
```

- [ ] **Step 3: Add directions toggle state that resets per task**

Inside `export function TapContextPanel(props: TapContextPanelProps) {`, after the existing `const { task, allTasks, createdByName } = props` line, add:

```tsx
  const [showDirections, setShowDirections] = useState(false)

  // Collapse the directions builder when switching to a different task.
  useEffect(() => {
    setShowDirections(false)
  }, [task.id])
```

- [ ] **Step 4: Pass the toggle to `PanelActions`**

In the `<PanelActions … />` element, add these two props (e.g. after `phoneNumber={…}`):

```tsx
        location={task.location}
        onShowDirections={() => setShowDirections((v) => !v)}
```

- [ ] **Step 5: Render `PanelLocation` after `PanelActions`**

Immediately after the closing `/>` of `<PanelActions … />` and before `<PanelWhy …>`, add:

```tsx
      <PanelLocation
        location={task.location}
        locationPlaceId={task.locationPlaceId}
        taskTitle={task.title}
        showDirections={showDirections}
        onUpdateLocation={props.onUpdateLocation}
        onClearLocation={props.onClearLocation}
      />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `TapContextPanel.tsx` (note: `App.tsx` will still error until Task 4, because the two new required props are not yet supplied — that is expected and fixed next).

- [ ] **Step 7: Commit**

```bash
git add src/components/surface/TapContextPanel.tsx
git commit -m "feat(directions): render PanelLocation + Directions toggle in TapContextPanel"
```

---

## Task 4: Wire handlers in `App.tsx`

**Files:**
- Modify: `src/App.tsx` (the `<TapContextPanel … />` render, around lines 1617–1670)

- [ ] **Step 1: Add the two handler props**

In the `<TapContextPanel … />` JSX, add after the existing `onAddLink={…}` prop block:

```tsx
                  onUpdateLocation={(location, placeId) =>
                    updateTask(selectedItem.originalTask!.id, { location, locationPlaceId: placeId })
                  }
                  onClearLocation={() =>
                    updateTask(selectedItem.originalTask!.id, { location: undefined, locationPlaceId: undefined })
                  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(directions): wire task location update/clear handlers"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS (no regressions; new PanelLocation + PanelActions tests included).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: TypeScript check + Vite build succeed.

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev`, then in the browser:
1. Open a task that already has a location → confirm a `Directions` button appears in the actions row and the address shows in the new Location section.
2. Click `Directions` → the builder expands: change travel mode (driving/walking/transit), add a stop, rename a stop, and click **Open in Maps**.
3. Open a task with **no** location → use the Location search to set one; confirm the `Directions` button then appears.
4. Clear the location (the × on the location chip) and reload → confirm it stays cleared (persisted).
5. Switch between two tasks → confirm the directions builder collapses when the task changes.

- [ ] **Step 5: Final commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(directions): verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** travel modes / add stop / rename stop / Open in Maps → all provided by the reused `DirectionsBuilder` (Task 1, Task 3). Set/change/clear location → `PlacesAutocomplete` in `PanelLocation` (Task 1) + persistence wiring (Task 4). Actions-row toggle matching events → Task 2 + Task 3.
- **Type consistency:** new handler names `onUpdateLocation(location, placeId?)` and `onClearLocation()` are identical across `TapContextPanel` props (Task 3), `PanelLocation` props (Task 1), and the `App.tsx` wiring (Task 4). `PanelActions` gains `location?: string` + `onShowDirections?: () => void`, used consistently in Task 2 and Task 3.
- **No new dependencies, schema, or env changes.**
