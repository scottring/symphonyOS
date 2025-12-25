# EV Route Planner - Feature Documentation

## Overview

The EV Route Planner is a sophisticated, map-centric interface for planning electric vehicle charging stops during trip planning. It replaces the basic list-based charging station selector with a premium, cartographic experience.

## Design Philosophy: "Warm Cartographic Luxury"

**Inspiration:** Premium automotive GPS interfaces meets hand-crafted maps
**Aesthetic:** Warm, inviting, tactile — not cold/technical
**Color Palette:**
- Base: Warm cream backgrounds (#FFFBF5)
- Primary: Forest green from Nordic Journal design system
- Route: Deep charcoal (#374151)
- Electric Blue: For charging elements (#3B82F6)
- Amber/Orange: For active states (#F59E0B)

## Key Features

### 1. **Interactive Map with Custom Styling**
- Google Maps integration with warm, muted cartographic styling
- Vintage map aesthetic with cream backgrounds and subtle colors
- Custom markers for charging stations (color-coded by network)
- Origin/destination markers (green → red)
- Elegant route visualization

### 2. **Route Alternatives**
- Automatically requests multiple route options from Google Maps
- Side-by-side route comparison with distance and duration
- Click to switch between route alternatives
- Alternative routes shown in lighter gray on map
- Active route highlighted in deep charcoal

### 3. **Advanced Filtering**
**Network Filter:**
- Tesla Supercharger
- Electrify America
- ChargePoint
- EVgo
- Blink
- Other

**Power Filter:**
- Slider from 50kW to 350kW
- Shows minimum charging power

**Max Diversion Filter:**
- Slider from 5 to 50 miles
- Filters stations by how far off-route they are

### 4. **Distance-Based Search**
- Manual distance input: "Find stations X miles along the route"
- Helps plan specific charging stops at desired distances
- Uses monospaced font for precision

### 5. **Station Selection**
- Checkboxes for each station
- Click on map markers to select/deselect
- Visual feedback: selected stations have larger, bolder markers
- Network-specific color coding
- Shows power rating, distance from route, and connector types

### 6. **Responsive Layout**
**Desktop (primary):**
- 60-70% map on left
- 30-40% controls/filters/list on right
- Overlay cards on map for route info and alternatives

**Mobile (future enhancement):**
- Collapsible bottom sheet over full-screen map
- Touch-friendly controls

## Component Architecture

```
EVRoutePlanner/
├── State Management
│   ├── Route data (alternatives, selected route)
│   ├── Stations (all, filtered, selected)
│   ├── Filters (networks, power, diversion)
│   └── UI state (filters shown, distance search shown)
├── Map Integration
│   ├── Google Maps with custom styling
│   ├── Route polylines (primary + alternatives)
│   ├── Custom markers (origin, destination, stations)
│   └── Bounds fitting
├── Filter Panel
│   ├── Network chips (multi-select)
│   ├── Power slider
│   ├── Diversion slider
│   └── Distance search input
└── Station List
    ├── Scrollable list with search results
    ├── Network-coded cards
    └── Click/checkbox selection
```

## Usage Flow

1. **User clicks "Plan Charging" on a driving_ev event**
   - EVRoutePlanner modal opens full-screen
   - Map loads with warm cartographic styling
   - Route is calculated (with alternatives)
   - Charging stations are loaded along route

2. **User explores route options**
   - Reviews alternative routes in overlay card
   - Clicks route option to switch
   - Map updates to show selected route

3. **User applies filters**
   - Selects preferred charging networks
   - Adjusts minimum power requirement
   - Sets max acceptable diversion from route
   - OR uses distance search to find stations at specific mile markers

4. **User selects stations**
   - Clicks stations on map or in list
   - Selected stations highlighted
   - Counter shows selection count

5. **User confirms**
   - Clicks "Add to Itinerary"
   - Selected stations added as charging stop events
   - Modal closes

## Technical Details

### Google Maps Styling
```javascript
// Warm, muted map colors
{ elementType: 'geometry', stylers: [{ color: '#F5F1E8' }] }
{ elementType: 'labels.text.fill', stylers: [{ color: '#6B5B4A' }] }
{ featureType: 'water', stylers: [{ color: '#B8D4E0' }] }
{ featureType: 'road.highway', stylers: [{ color: '#FFE7C7' }] }
```

### Route Polylines
- Primary route: Deep charcoal (#374151), 4px weight, 80% opacity
- Alternative routes: Light gray (#D1D5DB), 3px weight, 50% opacity

### Charging Station Markers
- Color-coded by network (Tesla: red, EA: blue, etc.)
- Selected: Larger scale (7 vs 5)
- Icon: Forward closed arrow rotated 180°
- White stroke for contrast

### Filter Logic
```typescript
// Filters are applied cumulatively
filtered = allStations
  .filter(station => networks.size === 0 || networks.has(station.network))
  .filter(station => station.powerKW >= minPowerKW)
  .filter(station => !station.distance || station.distance <= maxDiversion)
```

## Integration Points

**TripItineraryView:**
- Replaces `EVChargingWaypointSelector`
- Same props interface maintained
- Opens when user clicks "Plan Charging" on EV driving event

**Trip Types:**
- Uses existing `DrivingEVEvent` type
- Uses existing `ChargingStation` type
- Uses existing `ChargingNetwork` enum

**EV Route Optimizer:**
- Leverages `calculateEVRoute()` function
- Gets required charging stops + all available stations
- Pre-selects required stops

## Future Enhancements

### Near-term:
- [ ] Distance-along-route calculation for stations
- [ ] Elevation profile showing charging stops
- [ ] Estimated arrival battery percentage at each stop
- [ ] Charging time estimates
- [ ] Route save/share functionality

### Medium-term:
- [ ] Real-time station availability (via OCPI or network APIs)
- [ ] Price comparison between networks
- [ ] Amenities filter (restrooms, food, shopping)
- [ ] User reviews/ratings for stations
- [ ] Multi-day trip support with hotel charging

### Long-term:
- [ ] Weather-adjusted range calculations
- [ ] Traffic-aware charging suggestions
- [ ] Alternative vehicle comparison
- [ ] Carbon offset tracking
- [ ] Integration with vehicle APIs (Tesla, etc.)

## Design Decisions

### Why map-centric?
- Users planning road trips think spatially
- Visual confirmation of route + charging stops
- Easier to understand alternatives vs. text descriptions

### Why warm cartography aesthetic?
- Differentiates from generic blue/purple gradients
- Feels premium, crafted, intentional
- Aligns with Nordic Journal design system
- Less clinical/technical, more inviting

### Why separate filters from map?
- Desktop has space for dedicated sidebar
- Filters don't occlude map view
- Easy to adjust multiple filters simultaneously
- Clear visual hierarchy

### Why route alternatives?
- Some routes may have better charging infrastructure
- Scenic routes vs. fast routes
- User empowerment and choice
- Common pattern in navigation apps

## Accessibility

- Keyboard navigation supported (tab through stations)
- High contrast markers for visibility
- Clear focus states on interactive elements
- Semantic HTML for screen readers
- ARIA labels on map controls

## Performance

- Lazy loads Google Maps library
- Marker clustering for dense areas (future)
- Virtual scrolling for long station lists (future)
- Debounced filter updates
- Memoized distance calculations

## Testing

### Unit Tests (future):
- Filter logic
- Station distance calculations
- Route alternative selection

### Integration Tests (future):
- Google Maps loading
- Route calculation
- Station selection flow

### E2E Tests (future):
- Full trip planning flow with EV charging
- Route alternative switching
- Filter application
- Station selection and confirmation

## Credits

**Design System:** Nordic Journal
**Maps:** Google Maps Platform
**Icons:** Lucide React
**Inspiration:** Premium automotive GPS interfaces, vintage cartography
