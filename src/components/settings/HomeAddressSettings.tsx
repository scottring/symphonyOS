import { useState, useEffect, useRef } from 'react'

// Local storage key for home location (shared with DirectionsBuilder)
const HOME_LOCATION_KEY = 'symphony_home_location'

interface SavedLocation {
  name: string
  address: string
  placeId?: string
}

interface PlaceAutocompleteResult {
  placeId: string
  mainText: string
  secondaryText: string
  description: string
}

function getSavedHomeLocation(): SavedLocation | null {
  try {
    const saved = localStorage.getItem(HOME_LOCATION_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveHomeLocation(location: SavedLocation) {
  try {
    localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify(location))
  } catch {
    // Ignore storage errors
  }
}

function clearHomeLocation() {
  try {
    localStorage.removeItem(HOME_LOCATION_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function HomeAddressSettings() {
  const [homeLocation, setHomeLocation] = useState<SavedLocation | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceAutocompleteResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load saved home location on mount
  useEffect(() => {
    setHomeLocation(getSavedHomeLocation())
  }, [])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(searchQuery)}&types=address&key=${apiKey}`
        )
        const data = await response.json()

        if (data.predictions) {
          const results: PlaceAutocompleteResult[] = data.predictions.map((p: {
            place_id: string
            structured_formatting: { main_text: string; secondary_text: string }
            description: string
          }) => ({
            placeId: p.place_id,
            mainText: p.structured_formatting.main_text,
            secondaryText: p.structured_formatting.secondary_text,
            description: p.description,
          }))
          setSearchResults(results)
        }
      } catch {
        // Silently fail
      }
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery])

  const handleSelectPlace = async (result: PlaceAutocompleteResult) => {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${result.placeId}&fields=formatted_address&key=${apiKey}`
      )
      const data = await response.json()

      const newLocation: SavedLocation = {
        name: 'Home',
        address: data.result?.formatted_address || result.description,
        placeId: result.placeId,
      }

      saveHomeLocation(newLocation)
      setHomeLocation(newLocation)
      setIsEditing(false)
      setSearchQuery('')
      setSearchResults([])
    } catch {
      // Fallback if details fail
      const newLocation: SavedLocation = {
        name: 'Home',
        address: result.description,
        placeId: result.placeId,
      }

      saveHomeLocation(newLocation)
      setHomeLocation(newLocation)
      setIsEditing(false)
      setSearchQuery('')
      setSearchResults([])
    }
  }

  const handleClear = () => {
    clearHomeLocation()
    setHomeLocation(null)
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Home Address</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Set your default home address for directions. This will be used as the default starting point when getting directions.
      </p>

      {isEditing ? (
        <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for your home address..."
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          {isSearching && (
            <p className="text-xs text-neutral-400 mt-2 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
              Searching...
            </p>
          )}

          {searchResults.length > 0 && (
            <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden max-h-48 overflow-auto">
              {searchResults.map((result) => (
                <li key={result.placeId}>
                  <button
                    onClick={() => handleSelectPlace(result)}
                    className="w-full px-3 py-2 text-left hover:bg-neutral-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-neutral-800">{result.mainText}</p>
                    <p className="text-xs text-neutral-500">{result.secondaryText}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setIsEditing(false)
                setSearchQuery('')
                setSearchResults([])
              }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : homeLocation ? (
        <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-neutral-100">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-800">Home</p>
            <p className="text-xs text-neutral-500 truncate">{homeLocation.address}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setIsEditing(true)}
              className="text-neutral-400 hover:text-neutral-600 p-1"
              title="Edit"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button
              onClick={handleClear}
              className="text-neutral-400 hover:text-red-500 p-1"
              title="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full p-3 border-2 border-dashed border-neutral-200 rounded-lg text-neutral-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          Set home address
        </button>
      )}
    </section>
  )
}
