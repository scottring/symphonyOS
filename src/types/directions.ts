/**
 * Types for the Directions Builder feature
 */

export interface RouteStop {
  id: string
  name: string           // User-provided label ("Dry Cleaner")
  address: string        // Full address
  placeId?: string       // Google Place ID
  order: number
}

export interface DirectionsContext {
  eventId?: string
  taskId?: string
  origin: RouteStop
  destination: RouteStop
  stops: RouteStop[]
  travelMode: TravelMode
  cachedDuration?: number  // Duration in seconds
  cachedDistance?: number  // Distance in meters
}

export type TravelMode = 'driving' | 'walking' | 'transit'

export interface DirectionsResult {
  duration: number  // Total duration in seconds
  distance: number  // Total distance in meters
  legs: DirectionsLeg[]
}

export interface DirectionsLeg {
  startAddress: string
  endAddress: string
  duration: number  // Seconds
  distance: number  // Meters
}

export interface PlaceAutocompleteResult {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

/**
 * Persisted directions for a task — the user's chosen starting point, any
 * intermediate stops, and the travel mode. Stored as JSONB on the task so the
 * route survives reopening the detail panel and syncs across desktop/mobile.
 * The destination is derived from the task's `location`, so it is NOT stored here.
 */
export interface TaskDirections {
  origin?: RouteStop
  stops?: RouteStop[]
  travelMode?: TravelMode
}
