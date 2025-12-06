# Port Contextual Features to DetailPanelRedesign

## Problem
The app imports `DetailPanelRedesign.tsx` (aliased as `DetailPanel`):
```tsx
import { DetailPanelRedesign as DetailPanel } from '@/components/detail/DetailPanelRedesign'
```

But all the contextual surfacing features were added to the original `DetailPanel.tsx`:
- RecipeSection (recipe URL display, attach/remove)
- DirectionsBuilder (location-based directions with stops)
- Prep tasks wiring (eventPrepTasks filter, props to RecipeSection)

**Result:** None of these features work in the actual app.

## Solution
Port the missing features from `DetailPanel.tsx` to `DetailPanelRedesign.tsx`.

## What to Port

### 1. Imports
Add to the top of DetailPanelRedesign.tsx:
```tsx
import { RecipeSection } from '@/components/recipe/RecipeSection'
import { DirectionsBuilder } from '@/components/directions'
```

### 2. Props Interface
Add these props to the interface (check DetailPanel.tsx lines ~85-120 for reference):
```tsx
// Recipe support
eventRecipeUrl?: string | null
onUpdateRecipeUrl?: (googleEventId: string, recipeUrl: string | null) => void
onOpenRecipe?: (url: string) => void
// Prep task support
prepTasks?: Task[]
onAddPrepTask?: (title: string, linkedEventId: string, scheduledFor: Date) => Promise<string | undefined>
onTogglePrepTask?: (taskId: string) => void
```

### 3. Prep Tasks Filter
Add useMemo to filter prep tasks for current event (see DetailPanel.tsx ~line 340):
```tsx
const eventPrepTasks = useMemo(() => {
  if (!item || item.type !== 'event' || !item.originalEvent || !prepTasks) return []
  const eventId = item.originalEvent.google_event_id || item.originalEvent.id
  return prepTasks.filter(t => t.linkedEventId === eventId)
}, [item, prepTasks])
```

### 4. DirectionsBuilder Component
Render when item has a location. Find where location is displayed and add nearby:
```tsx
{item.location && (
  <DirectionsBuilder
    destination={{
      name: item.title,
      address: item.location,
    }}
    eventTitle={item.title}
  />
)}
```

### 5. RecipeSection Component
Render for events. Add in the content area for events:
```tsx
{isEvent && item.originalEvent && (
  <RecipeSection
    recipeUrl={eventRecipeUrl}
    eventTitle={item.title}
    eventTime={item.startTime ?? undefined}
    prepTasks={eventPrepTasks}
    onOpenRecipe={(url) => onOpenRecipe?.(url)}
    onUpdateRecipeUrl={(url) => {
      const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
      if (eventId && onUpdateRecipeUrl) {
        onUpdateRecipeUrl(eventId, url)
      }
    }}
    onAddPrepTask={onAddPrepTask ? async (title, scheduledFor) => {
      const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
      if (eventId) {
        return onAddPrepTask(title, eventId, scheduledFor)
      }
    } : undefined}
    onTogglePrepTask={onTogglePrepTask}
  />
)}
```

## Reference Files
- Source (has all features): `src/components/detail/DetailPanel.tsx`
- Target (needs features): `src/components/detail/DetailPanelRedesign.tsx`

Look at DetailPanel.tsx for exact placement within the component structure.

## Already Wired in App.tsx
These props are already being passed from App.tsx:
- `eventRecipeUrl` - from eventNotesMap
- `onUpdateRecipeUrl` - updates recipe URL
- `onOpenRecipe` - opens RecipeViewer
- `prepTasks={tasks}` - all tasks
- `onAddPrepTask={addPrepTask}` - from useSupabaseTasks
- `onTogglePrepTask={toggleTask}` - from useSupabaseTasks

So no changes needed to App.tsx - just need DetailPanelRedesign to accept and use these props.

## Testing
1. Open a calendar event with a location → should see "Get Directions" button
2. Expand directions → should show route builder with origin/destination
3. Open a meal event → should see recipe section (or "No recipe attached" prompt)
4. Attach a recipe URL → should display with "View Recipe" button
5. Add prep task → should appear in list and in main timeline
