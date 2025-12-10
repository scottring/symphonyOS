import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  DirectionsContext,
  DirectionsResult,
  TravelMode,
  PlaceAutocompleteResult,
} from '@/types/directions'
import { loadPlacesLibrary, isGoogleMapsLoaded, getPlacesLibrary } from '@/lib/googleMaps'

interface UseDirectionsResult {
  // State
  isCalculating: boolean
  error: string | null
  result: DirectionsResult | null

  // Actions
  calculateRoute: (context: DirectionsContext) => Promise<DirectionsResult | null>
  searchPlaces: (query: string) => Promise<PlaceAutocompleteResult[]>
  getPlaceDetails: (placeId: string) => Promise<{ address: string; name: string } | null>
  openInMaps: (context: DirectionsContext) => void
}

/**
 * Hook for Google Maps/Directions integration
 * Updated to use Places API (New) - December 2024
 * Uses google.maps.importLibrary() for proper Places API loading
 * Note: Requires VITE_GOOGLE_MAPS_API_KEY environment variable
 */
export function useDirections(): UseDirectionsResult {
  const [isCalculating, setIsCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DirectionsResult | null>(null)
  const [sdkReady, setSdkReady] = useState(isGoogleMapsLoaded())
  const placesLibraryRef = useRef<google.maps.PlacesLibrary | null>(getPlacesLibrary())

  // Load Google Maps SDK and Places library on mount
  useEffect(() => {
    if (sdkReady && placesLibraryRef.current) return

    loadPlacesLibrary()
      .then((lib) => {
        placesLibraryRef.current = lib
        setSdkReady(true)
      })
      .catch((err) => {
        console.error('Failed to load Google Maps SDK:', err)
      })
  }, [sdkReady])

  // =============================================================================
  // LEGACY SERVICE INITIALIZATION (commented out - kept for reference)
  // =============================================================================
  // import { useRef } from 'react' // Add to imports if reverting
  //
  // const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  // const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  // const placesServiceDivRef = useRef<HTMLDivElement | null>(null)
  //
  // useEffect(() => {
  //   if (!sdkReady) return
  //
  //   if (!autocompleteServiceRef.current) {
  //     autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
  //   }
  //
  //   if (!placesServiceRef.current) {
  //     if (!placesServiceDivRef.current) {
  //       placesServiceDivRef.current = document.createElement('div')
  //     }
  //     placesServiceRef.current = new google.maps.places.PlacesService(placesServiceDivRef.current)
  //   }
  // }, [sdkReady])
  // =============================================================================

  // Calculate route using Google Directions Service (client-side API)
  const calculateRoute = useCallback(async (context: DirectionsContext): Promise<DirectionsResult | null> => {
    setIsCalculating(true)
    setError(null)

    try {
      // Check if origin has a valid address (not the default placeholder)
      const hasValidOrigin = context.origin.address &&
        context.origin.address !== 'Tap to set your home address' &&
        context.origin.address !== 'Your current location'

      if (!hasValidOrigin) {
        // No valid origin set - show helpful message
        setError('Set your starting address to see estimated travel time')
        setResult(null)
        return null
      }

      // Check if SDK is ready
      if (!sdkReady || !window.google?.maps?.DirectionsService) {
        setError('Maps service not ready')
        setResult(null)
        return null
      }

      // Map travel mode to Google API format
      const travelModeMap: Record<TravelMode, google.maps.TravelMode> = {
        driving: google.maps.TravelMode.DRIVING,
        walking: google.maps.TravelMode.WALKING,
        transit: google.maps.TravelMode.TRANSIT,
      }

      // Build waypoints for intermediate stops
      const sortedStops = [...context.stops].sort((a, b) => a.order - b.order)
      const waypoints: google.maps.DirectionsWaypoint[] = sortedStops.map(stop => ({
        location: stop.address,
        stopover: true,
      }))

      // Create directions service and make request
      const directionsService = new google.maps.DirectionsService()

      const response = await directionsService.route({
        origin: context.origin.address,
        destination: context.destination.address,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
        travelMode: travelModeMap[context.travelMode],
        optimizeWaypoints: false, // Keep order as specified
      })

      // Promise-based API throws on error, so if we get here status is OK
      if (!response.routes?.[0]) {
        setError('Could not calculate route')
        setResult(null)
        return null
      }

      const route = response.routes[0]

      // Extract leg information
      const legs: DirectionsResult['legs'] = route.legs.map(leg => ({
        startAddress: leg.start_address || '',
        endAddress: leg.end_address || '',
        duration: leg.duration?.value || 0, // seconds
        distance: leg.distance?.value || 0, // meters
      }))

      // Calculate totals
      const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0)
      const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0)

      const directionsResult: DirectionsResult = {
        duration: totalDuration,
        distance: totalDistance,
        legs,
      }

      setResult(directionsResult)
      return directionsResult
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to calculate route'
      setError(message)
      return null
    } finally {
      setIsCalculating(false)
    }
  }, [sdkReady])

  // =============================================================================
  // NEW PLACES API - searchPlaces using AutocompleteSuggestion
  // =============================================================================
  const searchPlaces = useCallback(async (query: string): Promise<PlaceAutocompleteResult[]> => {
    if (!query.trim()) return []

    // If SDK not ready yet, return empty
    if (!sdkReady || !placesLibraryRef.current) {
      console.warn('Google Maps SDK not ready for autocomplete')
      return []
    }

    try {
      const { AutocompleteSuggestion } = placesLibraryRef.current

      // Use the new Places API AutocompleteSuggestion
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query.trim(),
      })

      // Map to our PlaceAutocompleteResult format
      return suggestions.map((suggestion) => {
        const placePrediction = suggestion.placePrediction
        return {
          placeId: placePrediction?.placeId || '',
          description: placePrediction?.text?.text || '',
          mainText: placePrediction?.mainText?.text || '',
          secondaryText: placePrediction?.secondaryText?.text || '',
        }
      }).filter(result => result.placeId) // Filter out any without placeId
    } catch (err) {
      console.warn('Places autocomplete error:', err)
      return []
    }
  }, [sdkReady])

  // =============================================================================
  // LEGACY searchPlaces (commented out - kept for reference)
  // =============================================================================
  // const searchPlaces = useCallback(async (query: string): Promise<PlaceAutocompleteResult[]> => {
  //   if (!query.trim()) return []
  //
  //   if (!autocompleteServiceRef.current) {
  //     console.warn('Google Maps SDK not ready for autocomplete')
  //     return []
  //   }
  //
  //   return new Promise((resolve) => {
  //     autocompleteServiceRef.current!.getPlacePredictions(
  //       {
  //         input: query.trim(),
  //         types: ['address', 'establishment'],
  //       },
  //       (predictions, status) => {
  //         if (
  //           status === google.maps.places.PlacesServiceStatus.OK &&
  //           predictions
  //         ) {
  //           resolve(
  //             predictions.map((p) => ({
  //               placeId: p.place_id,
  //               description: p.description,
  //               mainText: p.structured_formatting.main_text,
  //               secondaryText: p.structured_formatting.secondary_text || '',
  //             }))
  //           )
  //         } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
  //           resolve([])
  //         } else {
  //           console.warn('Places autocomplete error:', status)
  //           resolve([])
  //         }
  //       }
  //     )
  //   })
  // }, [])
  // =============================================================================

  // =============================================================================
  // NEW PLACES API - getPlaceDetails using Place.fetchFields
  // =============================================================================
  const getPlaceDetails = useCallback(async (placeId: string): Promise<{ address: string; name: string } | null> => {
    // If SDK not ready yet, return null
    if (!sdkReady || !placesLibraryRef.current) {
      console.warn('Google Maps SDK not ready for place details')
      return null
    }

    try {
      const { Place } = placesLibraryRef.current

      // Use the new Places API Place class
      const place = new Place({ id: placeId })
      await place.fetchFields({ fields: ['formattedAddress', 'displayName'] })

      return {
        address: place.formattedAddress || '',
        name: place.displayName || '',
      }
    } catch (err) {
      console.warn('Place details error:', err)
      return null
    }
  }, [sdkReady])

  // =============================================================================
  // LEGACY getPlaceDetails (commented out - kept for reference)
  // =============================================================================
  // const getPlaceDetails = useCallback(async (placeId: string): Promise<{ address: string; name: string } | null> => {
  //   if (!placesServiceRef.current) {
  //     console.warn('Google Maps SDK not ready for place details')
  //     return null
  //   }
  //
  //   return new Promise((resolve) => {
  //     placesServiceRef.current!.getDetails(
  //       {
  //         placeId,
  //         fields: ['formatted_address', 'name'],
  //       },
  //       (place, status) => {
  //         if (
  //           status === google.maps.places.PlacesServiceStatus.OK &&
  //           place
  //         ) {
  //           resolve({
  //             address: place.formatted_address || '',
  //             name: place.name || '',
  //           })
  //         } else {
  //           console.warn('Place details error:', status)
  //           resolve(null)
  //         }
  //       }
  //     )
  //   })
  // }, [])
  // =============================================================================

  // Open route in Google Maps app/web
  const openInMaps = useCallback((context: DirectionsContext) => {
    const origin = encodeURIComponent(context.origin.address)
    const destination = encodeURIComponent(context.destination.address)

    // Build waypoints for multi-stop routes
    const waypoints = context.stops
      .sort((a, b) => a.order - b.order)
      .map(stop => encodeURIComponent(stop.address))
      .join('|')

    // Build Google Maps URL
    let url = `https://www.google.com/maps/dir/?api=1`
    url += `&origin=${origin}`
    url += `&destination=${destination}`

    if (waypoints) {
      url += `&waypoints=${waypoints}`
    }

    // Map travel mode to Google Maps format
    const travelModeMap: Record<TravelMode, string> = {
      driving: 'driving',
      walking: 'walking',
      transit: 'transit',
    }
    url += `&travelmode=${travelModeMap[context.travelMode]}`

    // Open in new tab/app
    window.open(url, '_blank')
  }, [])

  return {
    isCalculating,
    error,
    result,
    calculateRoute,
    searchPlaces,
    getPlaceDetails,
    openInMaps,
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes} min`
}

/**
 * Format distance in meters to human-readable string
 */
export function formatDistance(meters: number): string {
  const miles = meters / 1609.344
  if (miles >= 10) {
    return `${Math.round(miles)} mi`
  }
  return `${miles.toFixed(1)} mi`
}
