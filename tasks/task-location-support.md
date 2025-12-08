# Task Location Support

## Problem

Tasks don't support locations. When user creates "Go to Home Depot" or "Buy paint at Lowe's", there's no way to:
1. Attach a location to the task
2. Trigger the DirectionsBuilder functionality
3. Smart-detect that it's a location-based errand

## Solution

### Phase 1: Add Location Field with Google Places (1.5 hrs)

**Data model:**

```typescript
// src/types/task.ts
export interface Task {
  // ... existing fields
  location?: string           // Formatted address from Google Places
  locationPlaceId?: string    // Google Place ID for accurate routing
}
```

**Database migration:**
```sql
ALTER TABLE tasks 
ADD COLUMN location TEXT,
ADD COLUMN location_place_id TEXT;
```

**UI: Google Places Autocomplete in DetailPanel**

Use the same Google Places autocomplete pattern from DirectionsBuilder:

```
┌─────────────────────────────────────────┐
│ 📍 Location                             │
│ ┌─────────────────────────────────┐    │
│ │ 🔍 Search for a place...        │    │
│ └─────────────────────────────────┘    │
│                                         │
│   Home Depot                            │
│   6315 Eastern Ave, Baltimore, MD       │
│                                         │
│   Home Depot                            │
│   2400 Boston St, Baltimore, MD         │
│                                         │
│   Home Depot                            │
│   ...                                   │
└─────────────────────────────────────────┘
```

After selection:

```
┌─────────────────────────────────────────┐
│ 📍 Location                             │
│ ┌─────────────────────────────────┐    │
│ │ Home Depot                   ✕  │    │
│ │ 6315 Eastern Ave, Baltimore     │    │
│ └─────────────────────────────────┘    │
│                                         │
│ [ Get Directions ]                      │
└─────────────────────────────────────────┘
```

**Reuse existing component:** 
The `AddStopInput.tsx` from DirectionsBuilder already does Google Places autocomplete. Extract/adapt it for task location.

**Files to create/modify:**
- `src/components/location/PlacesAutocomplete.tsx` - Reusable Google Places input (extract from AddStopInput or create shared)
- `src/types/task.ts` - Add location fields
- `src/components/detail/DetailPanel.tsx` - Add location section for tasks
- `src/hooks/useSupabaseTasks.ts` - Include location in CRUD
- Database migration

### Phase 2: DirectionsBuilder for Tasks (30 min)

When task has location, show DirectionsBuilder - same as events.

```tsx
// In DetailPanel, for tasks with location
{task.location && (
  <DirectionsSection
    destination={{
      name: task.title,
      address: task.location,
      placeId: task.locationPlaceId,
    }}
  />
)}
```

### Phase 3: Smart Location Detection (30 min)

When task title matches known patterns, pre-populate the Places search.

**Detection patterns:**

```typescript
const locationPatterns = [
  // Store names - pre-fill search with store name
  { pattern: /\b(home depot|lowe's|lowes|costco|target|walmart|trader joe's|whole foods|safeway|cvs|walgreens|ikea|best buy|staples|ace hardware)\b/i, extract: 1 },
  
  // "Go to X" pattern
  { pattern: /\bgo to\s+(.+)/i, extract: 1 },
  
  // "at X" pattern  
  { pattern: /\bat\s+(the\s+)?(.+?)\s*$/i, extract: 2 },
  
  // "Pick up from X"
  { pattern: /\b(?:pick\s*up|grab)\s+(?:from\s+)?(.+)/i, extract: 1 },
]
```

**UX:** When detection fires, auto-open Places search with detected term pre-filled.

```
User types: "Go to Home Depot"
→ System detects "Home Depot"
→ Location field auto-opens with "Home Depot" in search
→ Shows nearest Home Depot locations
→ User taps to confirm
```

---

## Implementation Priority

| Order | Item | Effort |
|-------|------|--------|
| 1 | Location fields on Task type + DB | 15 min |
| 2 | PlacesAutocomplete component | 45 min |
| 3 | Location section in DetailPanel | 30 min |
| 4 | DirectionsBuilder for tasks | 15 min |
| 5 | Smart detection + auto-open | 30 min |

**Total: ~2.5 hours**

---

## Google Places API

Already using for DirectionsBuilder. Same API key, same setup.

```typescript
// Initialize Places
const placesService = new google.maps.places.AutocompleteService()

// Search
placesService.getPlacePredictions({
  input: searchQuery,
  location: userLocation, // Bias to user's area
  radius: 50000, // 50km
}, (predictions) => {
  // Show results
})
```

---

## Files Summary

| File | Changes |
|------|---------|
| `src/types/task.ts` | Add `location`, `locationPlaceId` |
| `src/components/location/PlacesAutocomplete.tsx` | New shared component |
| `src/components/detail/DetailPanel.tsx` | Location section + DirectionsBuilder |
| `src/hooks/useSupabaseTasks.ts` | Include location in CRUD |
| Migration | Add columns |

---

## Testing

- [ ] Create task → search "Home Depot" → select from autocomplete → location saved
- [ ] Task with location shows address and "Get Directions" button
- [ ] Directions flow works (same as events)
- [ ] Clear location (✕) → removes location → directions hides
- [ ] Type "Go to Costco" → location field pre-populates search with "Costco"
- [ ] Place ID is stored and used for accurate routing
