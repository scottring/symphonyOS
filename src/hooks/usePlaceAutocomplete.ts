/**
 * Place Autocomplete Hook
 * Wrapper around useDirections for location search and selection
 */

import { useState, useCallback } from 'react'
import { useDirections } from './useDirections'
import type { PlaceAutocompleteResult } from '@/types/directions'

export type { PlaceAutocompleteResult }

export function usePlaceAutocomplete() {
  const { searchPlaces, getPlaceDetails } = useDirections()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceAutocompleteResult[]>([])

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery)
      if (!searchQuery.trim()) {
        setResults([])
        return
      }
      const searchResults = await searchPlaces(searchQuery)
      setResults(searchResults)
    },
    [searchPlaces]
  )

  const selectPlace = useCallback(
    (place: PlaceAutocompleteResult) => {
      setQuery(place.mainText)
      setResults([])
    },
    []
  )

  const clearResults = useCallback(() => {
    setResults([])
  }, [])

  return {
    query,
    setQuery: handleSearch,
    results,
    selectPlace,
    clearResults,
    getPlaceDetails,
  }
}
