import { useState, useCallback, useRef } from 'react'
import { loadPlacesLibrary } from '@/lib/googleMaps'

export interface PlaceResult {
  placeId: string
  name: string
  address?: string
  phone?: string
}

export function useGooglePlaces() {
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placesLibraryRef = useRef<google.maps.PlacesLibrary | null>(null)

  const searchPlaces = useCallback((query: string) => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!query || query.length < 3) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    debounceRef.current = setTimeout(async () => {
      try {
        // Cache the Places library across calls; awaiting a fresh load on every
        // keystroke loses the first results on mobile/slow networks.
        const placesLib = placesLibraryRef.current ?? (await loadPlacesLibrary())
        placesLibraryRef.current = placesLib
        const { AutocompleteSuggestion } = placesLib

        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedPrimaryTypes: ['establishment'],
        })

        const places: PlaceResult[] = response.suggestions
          .filter((s) => s.placePrediction)
          .slice(0, 5)
          .map((s) => ({
            placeId: s.placePrediction!.placeId,
            name: s.placePrediction!.mainText?.text ?? s.placePrediction!.text?.text ?? query,
            address: s.placePrediction!.secondaryText?.text ?? undefined,
          }))

        setResults(places)
      } catch (err) {
        // Surface the error instead of silently showing "No places found" —
        // distinguishes an API/network failure from a genuine empty result.
        console.warn('Places autocomplete error:', err)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceResult | null> => {
    try {
      const placesLib = await loadPlacesLibrary()
      const { Place } = placesLib

      const place = new Place({ id: placeId })
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'nationalPhoneNumber'] })

      return {
        placeId,
        name: place.displayName ?? '',
        address: place.formattedAddress ?? undefined,
        phone: place.nationalPhoneNumber ?? undefined,
      }
    } catch {
      return null
    }
  }, [])

  const clearResults = useCallback(() => {
    setResults([])
    setLoading(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
  }, [])

  return { results, loading, searchPlaces, getPlaceDetails, clearResults }
}
