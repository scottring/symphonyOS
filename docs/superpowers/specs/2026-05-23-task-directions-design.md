# Directions on tasks with locations

**Date:** 2026-05-23
**Status:** Approved, ready for implementation plan

## Problem

A task can carry a `location` (and `locationPlaceId`), but the live task detail
panel (`TapContextPanel`) never shows it. There's no way to see directions to a
task's location, choose a travel mode, add/rename stops, or even set/change the
location after inbox triage. Calendar events already have all of this via
`DirectionsBuilder` in `TapEventPanel`; tasks should too.

## Goal

Bring the existing directions experience to tasks that have a location, and let
the user set/change/clear a task's location directly from the detail panel.

## What already exists (no new infrastructure)

- **Persistence:** `updateTask(id, Partial<Task>)` in `src/hooks/useSupabaseTasks.ts`
  already maps `location` → `location` and `locationPlaceId` → `location_place_id`
  (lines ~729–730). No schema or migration work.
- **Directions UI:** `src/components/directions/DirectionsBuilder.tsx` already
  supports travel modes (driving/walking/transit via `TravelModeSelector`),
  add-stop (`AddStopInput`), rename/edit stop (`StopItem` `onEdit`), origin
  picker + current-location + saved Home, route calc, and "Open in Maps".
- **Place picker:** `src/components/location/PlacesAutocomplete.tsx` handles
  display / search / select / clear of a place, using `searchPlaces` /
  `getPlaceDetails` from `useDirections()`.
- **Reference integration:** `src/components/surface/TapEventPanel.tsx` (lines
  ~72–101) shows the exact actions-row toggle + inline `DirectionsBuilder`
  pattern to mirror.
- **API key:** `VITE_GOOGLE_MAPS_API_KEY` already configured.

## Design

### New component: `PanelLocation`

File: `src/components/surface/sections/PanelLocation.tsx`

A single cohesive "Location" section rendered in the task panel.

Props:

```ts
interface PanelLocationProps {
  location?: string
  locationPlaceId?: string
  taskTitle: string
  showDirections: boolean
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
}
```

Behavior:

- Calls `useDirections()` internally to obtain `searchPlaces` / `getPlaceDetails`;
  passes them to `PlacesAutocomplete`. No new props from App for search.
- Always renders `PlacesAutocomplete` so the user can set a location when none
  exists, or change/clear an existing one.
  - `value` = `{ address: location, placeId: locationPlaceId }` when `location`
    is set, else `null`.
  - `onSelect(place)` → `onUpdateLocation(place.address, place.placeId)`.
  - `onClear()` → `onClearLocation()`.
- When `location` is set **and** `showDirections` is true, renders the directions
  builder inline:

  ```tsx
  <DirectionsBuilder
    destination={{ name: taskTitle, address: location, placeId: locationPlaceId }}
    eventTitle={taskTitle}
  />
  ```

  (Prop name `eventTitle` is reused as-is to avoid touching the event panel; it
  only feeds the "Directions to {title}" header.)

### Actions-row toggle

`src/components/surface/sections/PanelActions.tsx`:

- New optional props `location?: string` and `onShowDirections?: () => void`.
- Render a `Directions ▸` button (using `ConceptIcon name="location"`, matching
  the event panel) **only when `location` is truthy**. Clicking it calls
  `onShowDirections`.

### `TapContextPanel` wiring

`src/components/surface/TapContextPanel.tsx`:

- New props on `TapContextPanelProps`:
  - `onUpdateLocation: (location: string, placeId?: string) => void`
  - `onClearLocation: () => void`
- Hold local state `const [showDirections, setShowDirections] = useState(false)`.
- Pass `location={task.location}` + `onShowDirections={() => setShowDirections(v => !v)}`
  to `PanelActions`.
- Render `<PanelLocation>` immediately after `<PanelActions>`, passing
  `task.location`, `task.locationPlaceId`, `task.title`, `showDirections`,
  `onUpdateLocation`, `onClearLocation`.

### `App.tsx` wiring

At the `<TapContextPanel … />` render (around line 1617–1670), mirror the
existing `onAddLink` pattern:

```tsx
onUpdateLocation={(location, placeId) =>
  updateTask(selectedItem.originalTask!.id, { location, locationPlaceId: placeId })
}
onClearLocation={() =>
  updateTask(selectedItem.originalTask!.id, { location: undefined, locationPlaceId: undefined })
}
```

## Out of scope

- No changes to `TapEventPanel` or `DirectionsBuilder` internals.
- No persistence of route/stops/travel-mode on the task (the builder is a live,
  session-local tool, same as for events).
- No schema/migration changes.

## Testing

- **Unit (`PanelLocation.test.tsx`):**
  - Renders the place editor when no location is set.
  - Shows the selected location and (when `showDirections`) the directions
    builder when a location is set.
  - Calls `onUpdateLocation` with address + placeId on place select.
  - Calls `onClearLocation` on clear.
- **Manual verification:** open a task with a location → toggle Directions →
  confirm travel modes, add/rename a stop, "Open in Maps"; set/clear a location
  on a task that had none and confirm it persists across reload.
