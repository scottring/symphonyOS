import { useState, useCallback, useRef } from 'react'
import { placesAutocomplete, placeDetails } from '@/lib/placesRest'

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
        // REST (fetch) rather than the Maps JS SDK's AutocompleteSuggestion:
        // the SDK's gRPC-web transport fails on some devices/networks
        // ("Rpc failed due to xhr error"). Restrict to businesses for the
        // contact picker.
        const predictions = await placesAutocomplete(query, ['establishment'])
        const places: PlaceResult[] = predictions.slice(0, 5).map((p) => ({
          placeId: p.placeId,
          name: p.mainText || p.description || query,
          address: p.secondaryText || undefined,
        }))
        setResults(places)
      } catch (err) {
        console.warn('Places autocomplete error:', err)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceResult | null> => {
    try {
      const details = await placeDetails(placeId)
      if (!details) return null
      return {
        placeId,
        name: details.name,
        address: details.address || undefined,
        phone: details.phone,
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
