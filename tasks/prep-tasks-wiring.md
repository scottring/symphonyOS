# Prep Tasks Wiring - DetailPanel Integration

## Context
The PrepTasksList component and backend (addPrepTask, getPrepTasks in useSupabaseTasks) are complete, but the props aren't being passed through DetailPanel to RecipeSection.

## Current State
In `src/components/detail/DetailPanel.tsx` around line 1073, RecipeSection is rendered like this:

```tsx
<RecipeSection
  recipeUrl={eventRecipeUrl}
  eventTitle={item.title}
  onOpenRecipe={(url) => onOpenRecipe?.(url)}
  onUpdateRecipeUrl={(url) => {
    const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
    if (eventId && onUpdateRecipeUrl) {
      onUpdateRecipeUrl(eventId, url)
    }
  }}
/>
```

Missing props:
- `eventTime` - the event's start time
- `prepTasks` - tasks linked to this event
- `onAddPrepTask` - create a new prep task
- `onTogglePrepTask` - toggle completion
- `onOpenTask` - open task in detail view (optional, can skip for now)

## Task

### 1. Add props to DetailPanelProps interface
Add these new props:
```tsx
// Prep task support
prepTasks?: Task[]
onAddPrepTask?: (linkedEventId: string, title: string, scheduledFor: Date) => Promise<string | undefined>
onTogglePrepTask?: (taskId: string) => void
```

### 2. Filter prep tasks for current event
Inside DetailPanel, filter the prepTasks to only those linked to the current event:

```tsx
const eventPrepTasks = useMemo(() => {
  if (!isEvent || !item.originalEvent || !prepTasks) return []
  const eventId = item.originalEvent.google_event_id || item.originalEvent.id
  return prepTasks.filter(t => t.linkedEventId === eventId)
}, [isEvent, item, prepTasks])
```

### 3. Pass props to RecipeSection
Update the RecipeSection render to include:

```tsx
<RecipeSection
  recipeUrl={eventRecipeUrl}
  eventTitle={item.title}
  eventTime={item.startTime}
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
      return onAddPrepTask(eventId, title, scheduledFor)
    }
  } : undefined}
  onTogglePrepTask={onTogglePrepTask}
/>
```

### 4. Wire up in HomeView.tsx (or wherever DetailPanel is used)
The parent component needs to pass these props. Check where DetailPanel is rendered and add:

```tsx
prepTasks={tasks} // from useSupabaseTasks
onAddPrepTask={async (linkedEventId, title, scheduledFor) => {
  return addPrepTask(linkedEventId, title, scheduledFor)
}}
onTogglePrepTask={toggleTask}
```

## Files to modify
1. `src/components/detail/DetailPanel.tsx` - add props, filter, pass through
2. `src/components/home/HomeView.tsx` (or parent) - wire up the new props

## Testing
1. Open an event that has a recipe URL attached
2. Should see "Prep Tasks" section below the recipe
3. Add a prep task with a time before the meal
4. Task should appear in the list
5. Toggle completion should work
6. The prep task should also appear in the main timeline at its scheduled time
