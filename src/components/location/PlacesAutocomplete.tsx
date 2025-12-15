import { useState, useRef, useEffect } from 'react'
import type { PlaceAutocompleteResult } from '@/types/directions'

export interface PlaceSelection {
  name: string
  address: string
  placeId: string
}

interface PlacesAutocompleteProps {
  /** Current location value to display */
  value?: { name?: string; address: string; placeId?: string } | null
  /** Called when a place is selected */
  onSelect: (place: PlaceSelection) => void
  /** Called when location is cleared */
  onClear: () => void
  /** Search function from useDirections */
  onSearch: (query: string) => Promise<PlaceAutocompleteResult[]>
  /** Get place details from useDirections */
  onGetDetails: (placeId: string) => Promise<{ address: string; name: string } | null>
  /** Optional initial search query (for smart detection pre-fill) */
  initialQuery?: string
  /** Placeholder text */
  placeholder?: string
}

/**
 * Google Places autocomplete input for selecting locations.
 * Used for task locations and anywhere place selection is needed.
 */
export function PlacesAutocomplete({
  value,
  onSelect,
  onClear,
  onSearch,
  onGetDetails,
  initialQuery = '',
  placeholder = 'Search for a place...',
}: PlacesAutocompleteProps) {
  const [isEditing, setIsEditing] = useState(!value)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceAutocompleteResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  // Handle initial query for smart detection
  useEffect(() => {
    if (initialQuery && !value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state from prop
      setQuery(initialQuery)
      setIsEditing(true)
    }
  }, [initialQuery, value])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results on empty query
      setResults([])
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      const searchResults = await onSearch(query)
      setResults(searchResults)
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, onSearch])

  const handleSelectPlace = async (result: PlaceAutocompleteResult) => {
    const details = await onGetDetails(result.placeId)
    const place: PlaceSelection = {
      name: result.mainText,
      address: details?.address || result.description,
      placeId: result.placeId,
    }
    onSelect(place)
    setQuery('')
    setResults([])
    setIsEditing(false)
  }

  const handleClear = () => {
    onClear()
    setQuery('')
    setResults([])
    setIsEditing(true)
  }

  // Display selected location
  if (value && !isEditing) {
    return (
      <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl">
        <div className="flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {value.name && (
            <p className="font-medium text-neutral-800 truncate">{value.name}</p>
          )}
          <p className={`text-sm ${value.name ? 'text-neutral-500' : 'text-neutral-800'} truncate`}>
            {value.address}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="flex-shrink-0 p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
          aria-label="Remove location"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    )
  }

  // Search input
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-10 py-3 text-base border border-neutral-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg z-20 max-h-64 overflow-auto">
          {results.map((result) => (
            <button
              key={result.placeId}
              onClick={() => handleSelectPlace(result)}
              className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors first:rounded-t-xl last:rounded-b-xl border-b border-neutral-100 last:border-b-0"
            >
              <p className="font-medium text-neutral-800 truncate">
                {result.mainText}
              </p>
              <p className="text-sm text-neutral-500 truncate">
                {result.secondaryText}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {query.trim() && !isSearching && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg z-20 p-4 text-center text-neutral-500 text-sm">
          No places found
        </div>
      )}
    </div>
  )
}
