# Smart Meal Features V1

## Overview

When Symphony detects a meal event in the calendar, it contextually surfaces:
1. **Prep Timeline** - Time-anchored tasks leading up to the meal (including cross-day)
2. **Recipe Card** - Immersive Alice Waters-style full-screen viewer

This builds on existing infrastructure: RecipeViewer, RecipeSection, PrepTasksList.

---

## Implementation Tasks

### Phase 1: Wire Prep Tasks (30 min)

Complete the wiring documented in `prep-tasks-wiring.md`.

**Files to modify:**

1. `src/components/detail/DetailPanel.tsx`
   - Add props: `prepTasks`, `onAddPrepTask`, `onTogglePrepTask`
   - Filter prep tasks for current event
   - Pass through to RecipeSection

2. `src/components/home/HomeView.tsx` (or parent component)
   - Pass prep task props to DetailPanel

**Test:** Open a meal event → see prep tasks section → add a task → verify it appears

---

### Phase 2: Full-Screen Recipe Overlay (30 min)

RecipeViewer already has the Alice Waters style. Add full-screen presentation.

**Files to modify:**

1. `src/components/home/HomeView.tsx`
   - Add state: `recipeOverlay: { url: string } | null`
   - Add overlay render at root level
   - Pass `onOpenRecipe` callback to DetailPanel

```tsx
// State
const [recipeOverlay, setRecipeOverlay] = useState<{ url: string } | null>(null)

// Handler passed to DetailPanel
const handleOpenRecipe = (url: string) => {
  setRecipeOverlay({ url })
}

// Render (at component root, outside other content)
{recipeOverlay && (
  <div className="fixed inset-0 z-50 bg-bg-elevated animate-slide-up">
    <RecipeViewer 
      url={recipeOverlay.url} 
      onClose={() => setRecipeOverlay(null)} 
    />
  </div>
)}
```

2. `src/index.css` - Add slide-up animation if not present
```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

**Test:** Tap "View Recipe" → full-screen immersive view → close returns to detail panel

---

### Phase 3: Cross-Day Prep Tasks (1-2 hrs)

Current PrepTasksList only supports same-day prep. Add day offset selection.

**Files to modify:**

1. `src/components/recipe/PrepTasksList.tsx`

Replace time-only picker with day + time selection:

```tsx
interface PrepDayOption {
  label: string
  offsetDays: number
}

const prepDayOptions: PrepDayOption[] = [
  { label: 'Day of meal', offsetDays: 0 },
  { label: '1 day before', offsetDays: -1 },
  { label: '2 days before', offsetDays: -2 },
]

// State
const [selectedDayOffset, setSelectedDayOffset] = useState(0)
const [selectedTime, setSelectedTime] = useState('11:00')

// Compute scheduled date
const getScheduledDate = (): Date => {
  const date = new Date(eventTime)
  date.setDate(date.getDate() + selectedDayOffset)
  const [hours, minutes] = selectedTime.split(':').map(Number)
  date.setHours(hours, minutes, 0, 0)
  return date
}
```

**UI Structure:**
```
┌─────────────────────────────────────────┐
│  Task: [________________________]       │
│                                         │
│  When:                                  │
│  ┌─────────────────────────────────┐   │
│  │ ○ Day of meal                   │   │
│  │ ○ 1 day before                  │   │
│  │ ● 2 days before                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Time: [ 11:00 AM ▾ ]                   │
│                                         │
│  [ Cancel ]        [ Add Prep Task ]    │
└─────────────────────────────────────────┘
```

**Display enhancement:** Show the actual date for clarity
```tsx
<span className="text-xs text-neutral-400">
  {format(getScheduledDate(), 'EEE, MMM d')} at {selectedTime}
</span>
```

**Test:** Add prep task for "2 days before" → verify correct date stored → appears in timeline on that day

---

### Phase 4: Timeline Meal Link (1 hr)

Prep tasks should show their linked meal in the main timeline.

**Files to modify:**

1. `src/types/timeline.ts` - Already has task → timeline conversion

2. `src/components/schedule/TaskCard.tsx` (or equivalent timeline item)

Add meal link display when `linkedEventId` is present:

```tsx
// In TaskCard or timeline item renderer
{task.linkedEventId && linkedMealTitle && (
  <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
    <svg className="w-3 h-3" /* cake/meal icon */ />
    <span>for {linkedMealTitle}</span>
    {linkedMealTime && (
      <span className="text-neutral-400">
        ({format(linkedMealTime, 'h:mm a')})
      </span>
    )}
  </div>
)}
```

**Data flow:** 
- Need to look up event title from `linkedEventId`
- Could pass events list to timeline, or denormalize meal title onto prep task

**Simpler approach:** Store `linkedEventTitle` on the task when creating prep task:
```typescript
// In addPrepTask
const newTask = {
  title,
  scheduledFor,
  linkedEventId,
  linkedEventTitle: eventTitle, // denormalized for display
}
```

**Test:** Add prep task → view in main timeline → see meal link chip

---

## Data Model Updates

### Task type extension

```typescript
// src/types/task.ts
interface Task {
  // ... existing fields
  linkedEventId?: string      // Google Calendar event ID
  linkedEventTitle?: string   // Denormalized for display
}
```

### Database migration (if using Supabase)

```sql
ALTER TABLE tasks 
ADD COLUMN linked_event_id TEXT,
ADD COLUMN linked_event_title TEXT;
```

---

## Out of Scope (V2+)

- Push notification reminders for prep tasks
- Auto-parsing prep steps from recipe URLs
- AI-suggested prep times based on recipe complexity
- Grocery list generation
- Cross-meal prep optimization ("you're cooking chicken twice this week")

---

## Testing Checklist

- [ ] Open meal event with recipe URL → see recipe section
- [ ] Tap "View Recipe" → full-screen immersive viewer opens
- [ ] Close recipe → returns to detail panel
- [ ] Add same-day prep task → appears in prep list
- [ ] Add cross-day prep task (1 day before) → appears with correct date
- [ ] Prep task appears in main timeline at scheduled time
- [ ] Timeline shows meal link chip on prep task
- [ ] Toggle prep task complete → updates in both locations
- [ ] Non-meal events don't show recipe section

---

## Files Summary

| File | Changes |
|------|---------|
| `DetailPanel.tsx` | Add prep task props, filter, pass through |
| `HomeView.tsx` | Wire prep tasks, add recipe overlay state |
| `PrepTasksList.tsx` | Cross-day picker UI |
| `TaskCard.tsx` | Meal link chip display |
| `task.ts` | Add linkedEventId/Title fields |
| `index.css` | Slide-up animation |
| Migration | Add columns to tasks table |
