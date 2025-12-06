# Directions Panel Bug Report

**Date:** December 6, 2025  
**Priority:** High  
**Status:** Ready for Development

---

## Overview

The directions feature in the event detail panel has three issues that need to be addressed:

1. **Redundant UI Element** - Extra "Get Directions" button that should be removed
2. **Broken Autocomplete** - Google Places search returns mock data instead of real results
3. **Missing Time Info** - No duration shown between stops or for total trip

---

## Bug #1: Redundant "Get Directions" Button

### Problem
There's a "Get Directions" pill button in the UI that's unnecessary since the directions builder already handles this functionality.

### Solution
Remove the redundant button from the UI. The "Open in Maps" button (line 308 in DirectionsBuilder.tsx) should be the only action button.

### Files to Check
- `src/components/directions/DirectionsBuilder.tsx`
- `src/components/detail/DetailPanel.tsx` (line ~1066)

---

## Bug #2: Google Places Autocomplete Not Working

### Problem
When typing an address in the origin or stop input fields, the autocomplete shows fake/mock results (New York, Los Angeles, Chicago) instead of actual Google Places suggestions.

### Root Cause
In `src/hooks/useDirections.ts`, the `searchPlaces` function (lines 84-110) returns **hardcoded mock data**:

```typescript
// Current mock implementation - lines 86-87:
// "Direct browser calls blocked by CORS. Using mock data for now."
// "In production, this would need a backend proxy or Google Maps JavaScript SDK."
```

### Solution: Google Maps JavaScript SDK

Use the Google Maps Places Autocomplete service directly in the browser. This avoids CORS issues because Google's SDK handles the API calls internally.

#### Implementation Steps:

1. **Load Google Maps SDK** in `index.html` or dynamically:
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
```

2. **Create Places Autocomplete Service**:
```typescript
// In useDirections.ts or a new usePlacesAutocomplete hook
const autocompleteService = new google.maps.places.AutocompleteService();

const searchPlaces = async (query: string): Promise<PlaceResult[]> => {
  if (!query || query.length < 3) return [];
  
  return new Promise((resolve) => {
    autocompleteService.getPlacePredictions(
      {
        input: query,
        types: ['address', 'establishment'],
        componentRestrictions: { country: 'us' }, // optional
      },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          resolve(predictions.map(p => ({
            placeId: p.place_id,
            name: p.structured_formatting.main_text,
            address: p.description,
          })));
        } else {
          resolve([]);
        }
      }
    );
  });
};
```

3. **Get Place Details for Coordinates** (needed for routing):
```typescript
const getPlaceDetails = (placeId: string): Promise<{lat: number, lng: number}> => {
  const service = new google.maps.places.PlacesService(document.createElement('div'));
  
  return new Promise((resolve, reject) => {
    service.getDetails(
      { placeId, fields: ['geometry'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          resolve({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        } else {
          reject(new Error('Failed to get place details'));
        }
      }
    );
  });
};
```

### Files to Modify
- `src/hooks/useDirections.ts` - Replace mock `searchPlaces` with real implementation
- `index.html` - Add Google Maps script tag (or load dynamically)
- Add TypeScript types for `google.maps` namespace

### Environment Variable
Ensure `VITE_GOOGLE_MAPS_API_KEY` is set and the key has Places API enabled.

---

## Bug #3: Missing Time/Distance Between Stops

### Problem
The directions UI doesn't show:
- How long it takes to get between each stop
- The total trip duration

### Current State
- `calculateRoute` returns a `DirectionsResult` with total duration/distance
- The Google Directions API actually returns per-leg timing in `result.routes[0].legs`
- This data exists but isn't being displayed in the UI

### Solution

#### 1. Update DirectionsResult Type
```typescript
// In useDirections.ts
interface DirectionsLeg {
  duration: string;      // "15 mins"
  distance: string;      // "5.2 mi"
  startAddress: string;
  endAddress: string;
}

interface DirectionsResult {
  // existing fields...
  legs: DirectionsLeg[];
  totalDuration: string;
  totalDistance: string;
}
```

#### 2. Parse Legs from API Response
In `calculateRoute`, extract leg information:
```typescript
const legs = result.routes[0].legs.map(leg => ({
  duration: leg.duration.text,
  distance: leg.distance.text,
  startAddress: leg.start_address,
  endAddress: leg.end_address,
}));

const totalDuration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);
const totalDistance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
```

#### 3. Update StopItem Component
Show duration to next stop:
```tsx
// In StopItem.tsx
{leg && (
  <div className="text-xs text-gray-500 mt-1">
    {leg.duration} • {leg.distance}
  </div>
)}
```

#### 4. Add Total Time Summary
In DirectionsBuilder, show total trip info:
```tsx
{result && (
  <div className="bg-blue-50 rounded-lg p-3 mb-4">
    <div className="text-sm font-medium text-blue-900">
      Total Trip: {result.totalDuration} • {result.totalDistance}
    </div>
  </div>
)}
```

### Files to Modify
- `src/hooks/useDirections.ts` - Update type, parse legs
- `src/components/directions/StopItem.tsx` - Display per-leg times
- `src/components/directions/DirectionsBuilder.tsx` - Display total time

---

## Testing Checklist

### Autocomplete
- [ ] Type "123 Main" and verify real address suggestions appear
- [ ] Select a suggestion and confirm it populates correctly
- [ ] Verify home address saves to localStorage
- [ ] Test with various address formats

### Time Display
- [ ] Single destination shows time from origin
- [ ] Multi-stop route shows time between each stop
- [ ] Total trip time displays accurately
- [ ] Times update when stops are reordered

### UI Cleanup
- [ ] Redundant "Get Directions" button is removed
- [ ] "Open in Maps" button still works
- [ ] UI is clean and uncluttered

---

## Related Files

| File | Purpose |
|------|---------|
| `src/hooks/useDirections.ts` | Main directions logic, searchPlaces, calculateRoute |
| `src/components/directions/DirectionsBuilder.tsx` | Main UI component |
| `src/components/directions/AddStopInput.tsx` | Address input with debounced search |
| `src/components/directions/StopItem.tsx` | Individual stop display |
| `src/components/detail/DetailPanel.tsx` | Parent component (line 1066) |

---

## Notes

- The Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) must have **Places API** and **Directions API** enabled
- Current "Open in Maps" functionality works correctly
- Multi-stop routing via waypoints is already implemented
- `formatDuration` and `formatDistance` utilities already exist in useDirections.ts
