# Contextual Surfacing Features: Directions + Recipes

## Overview

This task adds two key contextual surfacing features to Symphony OS, aligned with the core differentiator: **"surfaces what you need when you need it."**

These are NOT new views or widgets. They are **detail panel enhancements** that appear when a task/event has location or recipe context.

**IMPORTANT:** Before implementing any UI, read `/mnt/skills/public/frontend-design/SKILL.md` and apply its principles throughout.

---

## Part 1: Simplify Home Views

### Remove Today + Context View

The middle view ("Today + Context" with sidebar widgets) adds complexity without enough value. Remove it.

**Files to modify:**
- `src/components/home/HomeView.tsx` — Remove `today-context` case
- `src/components/home/HomeViewSwitcher.tsx` — Remove middle button
- `src/components/home/ContextSidebar.tsx` — DELETE this file entirely
- `src/hooks/useHomeView.ts` — Remove `today-context` from view type
- `src/types/homeView.ts` — Update type definition

**Result:** Only two views remain: `today` and `week`

---

## Part 2: Directions Builder

When a task or event has a location, the detail panel shows a directions interface.

### User Flow

1. User taps a task/event with a location field
2. Detail panel shows location with "Get Directions" button
3. Tap expands to directions builder:
   - **Start:** Auto-fills "Home" or current location (with 📍 icon to change)
   - **Destination:** Pre-filled from event/task location
   - **Add Stop:** Search using Google Places autocomplete, name the stop
   - **Transport mode:** Car / Walk / Transit toggle
   - **Duration/distance:** Calculated via Google Directions API
   - **Open in Maps:** Passes full multi-stop route to Google Maps app

### UI Mockup

```
┌─────────────────────────────────────────┐
│  Directions to Soccer Practice          │
│                                         │
│  ○ Home                          📍     │
│    123 Your Street                      │
│                                         │
│  ○ Dry Cleaner ✏️                  ✕    │
│    456 Main St                          │
│                                         │
│  ○ + Add Stop                           │
│                                         │
│  ◉ Baltimore Soccer Club         📍     │
│    1234 Stadium Dr                      │
│                                         │
│  ─────────────────────────────────────  │
│  🚗 Car  🚶 Walk  🚌 Transit            │
│  ─────────────────────────────────────  │
│                                         │
│  25 min · 12.4 mi                       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Open in Maps                    │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Technical Requirements

**New dependencies:**
- Google Places API (autocomplete for adding stops)
- Google Directions API (route calculation)

**Data model:**
```typescript
interface RouteStop {
  id: string
  name: string           // User-provided label ("Dry Cleaner")
  address: string        // Full address
  placeId?: string       // Google Place ID
  order: number
}

interface DirectionsContext {
  eventId?: string
  taskId?: string
  origin: RouteStop
  destination: RouteStop
  stops: RouteStop[]
  travelMode: 'driving' | 'walking' | 'transit'
  cachedDuration?: number
  cachedDistance?: number
}
```

**Storage:** Store in `event_notes` table (for events) or new `task_context` table (for tasks). The stops array is JSONB.

**Files to create:**
- `src/components/directions/DirectionsBuilder.tsx` — Main component
- `src/components/directions/StopItem.tsx` — Individual stop with edit/delete
- `src/components/directions/AddStopInput.tsx` — Google Places autocomplete
- `src/components/directions/TravelModeSelector.tsx` — Car/Walk/Transit toggle
- `src/hooks/useDirections.ts` — Google APIs integration

**Files to modify:**
- `src/components/detail/DetailPanel.tsx` — Add directions section when location exists
- `src/components/task/TaskView.tsx` — Same for desktop view

---

## Part 3: Recipe Attachment

Meals come from Google Calendar (Iris creates them there). Symphony detects recipe URLs and surfaces them.

### Automatic Detection

When syncing Google Calendar events:
1. Parse event description for recipe URLs
2. If found, store association in `event_notes`
3. Recipe is automatically available in detail panel

```typescript
function detectRecipeUrl(description: string): string | null {
  const recipePatterns = [
    /https?:\/\/(www\.)?(allrecipes|epicurious|bonappetit|seriouseats|food52|nytimes\.com\/cooking|budgetbytes|minimalistbaker|skinnytaste|delish|foodnetwork|tasty|simplyrecipes|cooking\.nytimes)\.com\/[^\s]+/gi
  ]
  
  for (const pattern of recipePatterns) {
    const match = description.match(pattern)
    if (match) return match[0]
  }
  
  // Fallback: any URL in description
  const anyUrl = description.match(/https?:\/\/[^\s]+/i)
  return anyUrl ? anyUrl[0] : null
}
```

### Manual Attachment

If no recipe detected, user can manually attach:

```
│  🍳 No recipe attached                  │
│  ┌─────────────────────────────────┐   │
│  │  + Attach Recipe URL             │   │
│  └─────────────────────────────────┘   │
```

### Recipe View

When recipe is attached:

```
│  🍳 Recipe: Chicken Stir Fry            │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  View Recipe                     │   │  ← Opens RecipeViewer
│  └─────────────────────────────────┘   │
│                                         │
│  Prep Tasks                             │
│  ○ Defrost chicken           3:00 PM   │
│  ┌─────────────────────────────────┐   │
│  │  + Add prep task                 │   │
│  └─────────────────────────────────┘   │
```

### Prep Tasks

Prep tasks are regular tasks that:
- Are linked to the meal event (via `linked_event_id` or similar)
- Have a scheduled time earlier in the day
- Appear in the main schedule at their scheduled time
- Show a small link indicator back to the meal

**Data model addition:**
```typescript
// Add to Task type
interface Task {
  // ... existing fields
  linkedEventId?: string  // Links prep task to meal event
}
```

### Technical Requirements

**Files to modify:**
- `src/hooks/useGoogleCalendar.ts` — Add recipe URL detection during sync
- `src/hooks/useEventNotes.ts` — Store/retrieve recipe URL
- `src/components/detail/DetailPanel.tsx` — Add recipe section
- `src/components/recipe/RecipeViewer.tsx` — Already exists, may need minor updates

**Files to create:**
- `src/components/recipe/RecipeSection.tsx` — Detail panel section for recipe
- `src/components/recipe/PrepTasksList.tsx` — List of prep tasks linked to meal

---

## Implementation Order

1. **Remove Today+Context view** (simplification first)
2. **Recipe detection on calendar sync** (quick win, Iris's workflow)
3. **Recipe section in detail panel** (uses existing RecipeViewer)
4. **Prep tasks linking** (extends existing task system)
5. **Directions builder** (new component, API integration)

---

## Design Principles

From the frontend-design skill, apply:
- **Minimal, focused UI** — These are contextual expansions, not new pages
- **Progressive disclosure** — Show "Get Directions" button first, expand on tap
- **Consistent with existing patterns** — Match DetailPanel styling
- **Mobile-first** — These will be used primarily on phone while cooking/driving

---

## Testing

- Unit tests for recipe URL detection
- Unit tests for directions data model
- E2E test: Create event with location → tap → see directions builder
- E2E test: Sync event with recipe URL → tap → see recipe

---

## Out of Scope

- Full meal planning UI (meals come from Google Calendar)
- Weather widget
- Family Today widget  
- Saving favorite routes
- Grocery list generation from recipes

---

## Reference Files

- `src/components/recipe/RecipeViewer.tsx` — Existing Alice Waters-style recipe display
- `src/components/detail/DetailPanel.tsx` — Where these features integrate
- `src/hooks/useGoogleCalendar.ts` — Calendar sync logic
- `src/hooks/useEventNotes.ts` — Event enrichment storage
