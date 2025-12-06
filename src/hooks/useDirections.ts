import { useState, useCallback, useEffect } from 'react'
import type {
  DirectionsContext,
  DirectionsResult,
  TravelMode,
  PlaceAutocompleteResult,
} from '@/types/directions'
import { loadGoogleMapsSDK, isGoogleMapsLoaded } from '@/lib/googleMaps'

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
 * Note: Requires VITE_GOOGLE_MAPS_API_KEY environment variable
 */
export function useDirections(): UseDirectionsResult {
  const [isCalculating, setIsCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DirectionsResult | null>(null)
  const [sdkReady, setSdkReady] = useState(isGoogleMapsLoaded())

  // Load Google Maps SDK on mount
  useEffect(() => {
    if (sdkReady) return

    loadGoogleMapsSDK()
      .then(() => {
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

  // Calculate route using Google Directions API
  // Note: Direct browser calls to Google Directions API are blocked by CORS.
  // For now, we use mock data. The "Open in Maps" button works regardless.
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

      // Generate estimated duration based on typical commute patterns
      // This is a rough estimate - actual time will be shown in Maps
      // Build ordered list of all waypoints
      const sortedStops = [...context.stops].sort((a, b) => a.order - b.order)
      const allWaypoints = [
        context.origin,
        ...sortedStops,
        context.destination,
      ]

      // Generate legs between each consecutive waypoint
      const legs: DirectionsResult['legs'] = []
      for (let i = 0; i < allWaypoints.length - 1; i++) {
        // Random duration 10-20 mins per leg
        const legDuration = 600 + Math.floor(Math.random() * 600)
        const legDistance = legDuration * 13.4 // ~30mph average
        legs.push({
          startAddress: allWaypoints[i].address,
          endAddress: allWaypoints[i + 1].address,
          duration: legDuration,
          distance: legDistance,
        })
      }

      // Calculate totals from legs
      const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0)
      const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0)

      const mockResult: DirectionsResult = {
        duration: totalDuration,
        distance: totalDistance,
        legs,
      }

      setResult(mockResult)
      return mockResult
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to calculate route'
      setError(message)
      return null
    } finally {
      setIsCalculating(false)
    }
  }, [])

  // =============================================================================
  // NEW PLACES API - searchPlaces using AutocompleteSuggestion
  // =============================================================================
  const searchPlaces = useCallback(async (query: string): Promise<PlaceAutocompleteResult[]> => {
    if (!query.trim()) return []

    // If SDK not ready yet, return empty
    if (!sdkReady || !window.google?.maps?.places?.AutocompleteSuggestion) {
      console.warn('Google Maps SDK not ready for autocomplete')
      return []
    }

    try {
      // Use the new Places API AutocompleteSuggestion
      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query.trim(),
        // includedPrimaryTypes can filter results - omitting for broad results
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
    if (!sdkReady || !window.google?.maps?.places?.Place) {
      console.warn('Google Maps SDK not ready for place details')
      return null
    }

    try {
      // Use the new Places API Place class
      const place = new google.maps.places.Place({ id: placeId })
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
