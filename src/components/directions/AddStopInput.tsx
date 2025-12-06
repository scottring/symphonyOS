import { useState, useRef, useEffect } from 'react'
import type { PlaceAutocompleteResult, RouteStop } from '@/types/directions'

interface AddStopInputProps {
  onAddStop: (stop: Omit<RouteStop, 'id' | 'order'>) => void
  onSearch: (query: string) => Promise<PlaceAutocompleteResult[]>
  onGetDetails: (placeId: string) => Promise<{ address: string; name: string } | null>
}

export function AddStopInput({ onAddStop, onSearch, onGetDetails }: AddStopInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceAutocompleteResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Debounced search
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!query.trim()) {
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
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSelectPlace = async (result: PlaceAutocompleteResult) => {
    const details = await onGetDetails(result.placeId)
    if (details) {
      onAddStop({
        name: result.mainText,
        address: details.address,
        placeId: result.placeId,
      })
    } else {
      // Fallback if details fail
      onAddStop({
        name: result.mainText,
        address: result.description,
        placeId: result.placeId,
      })
    }

    // Reset state
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 py-2 text-sm text-neutral-500 hover:text-primary-600 transition-colors"
      >
        <div className="w-6 h-6 rounded-full border-2 border-dashed border-neutral-300 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </div>
        Add Stop
      </button>
    )
  }

  return (
    <div className="relative py-2">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-primary-300 flex items-center justify-center bg-primary-50">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </div>

        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a place..."
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />

          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setIsOpen(false)
            setQuery('')
            setResults([])
          }}
          className="p-2 text-neutral-400 hover:text-neutral-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="absolute left-9 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
          {results.map((result) => (
            <button
              key={result.placeId}
              onClick={() => handleSelectPlace(result)}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <p className="text-sm font-medium text-neutral-800 truncate">
                {result.mainText}
              </p>
              <p className="text-xs text-neutral-500 truncate">
                {result.secondaryText}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
