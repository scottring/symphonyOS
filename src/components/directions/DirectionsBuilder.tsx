import { useState, useEffect } from 'react'
import type { RouteStop, TravelMode, DirectionsContext, PlaceAutocompleteResult } from '@/types/directions'
import { useDirections, formatDuration, formatDistance } from '@/hooks/useDirections'
import { StopItem } from './StopItem'
import { AddStopInput } from './AddStopInput'
import { TravelModeSelector } from './TravelModeSelector'

// Local storage key for home location
const HOME_LOCATION_KEY = 'symphony_home_location'

interface SavedLocation {
  name: string
  address: string
  placeId?: string
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

interface DirectionsBuilderProps {
  destination: {
    name: string
    address: string
    placeId?: string
  }
  eventTitle: string
  defaultOrigin?: {
    name: string
    address: string
    placeId?: string
  }
}

/**
 * Directions builder component for the detail panel
 * Allows building multi-stop routes and opening in Google Maps
 */
export function DirectionsBuilder({
  destination,
  eventTitle,
  defaultOrigin,
}: DirectionsBuilderProps) {
  const { isCalculating, error, result, calculateRoute, searchPlaces, getPlaceDetails, openInMaps } = useDirections()

  // State - Origin can be changed via location picker
  const [origin, setOrigin] = useState<RouteStop>(() => {
    const savedHome = getSavedHomeLocation()
    return {
      id: 'origin',
      name: defaultOrigin?.name || savedHome?.name || 'Home',
      address: defaultOrigin?.address || savedHome?.address || 'Tap to set your starting address',
      placeId: defaultOrigin?.placeId || savedHome?.placeId,
      order: 0,
    }
  })

  // Origin location picker state
  const [showOriginPicker, setShowOriginPicker] = useState(false)
  const [originSearchQuery, setOriginSearchQuery] = useState('')
  const [originSearchResults, setOriginSearchResults] = useState<PlaceAutocompleteResult[]>([])
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false)

  const [destinationStop] = useState<RouteStop>(() => ({
    id: 'destination',
    name: destination.name,
    address: destination.address,
    placeId: destination.placeId,
    order: 999,
  }))

  const [stops, setStops] = useState<RouteStop[]>([])
  const [travelMode, setTravelMode] = useState<TravelMode>('driving')

  // Calculate route when parameters change
  useEffect(() => {
    const context: DirectionsContext = {
      origin,
      destination: destinationStop,
      stops,
      travelMode,
    }
    calculateRoute(context)
  }, [origin, destinationStop, stops, travelMode, calculateRoute])

  const handleAddStop = (newStop: Omit<RouteStop, 'id' | 'order'>) => {
    const stop: RouteStop = {
      ...newStop,
      id: crypto.randomUUID(),
      order: stops.length + 1,
    }
    setStops([...stops, stop])
  }

  const handleEditStop = (updatedStop: RouteStop) => {
    setStops(stops.map((s) => (s.id === updatedStop.id ? updatedStop : s)))
  }

  const handleRemoveStop = (stopId: string) => {
    setStops(stops.filter((s) => s.id !== stopId).map((s, i) => ({ ...s, order: i + 1 })))
  }

  // Handle origin search
  const handleOriginSearch = async (query: string) => {
    setOriginSearchQuery(query)
    if (!query.trim()) {
      setOriginSearchResults([])
      return
    }
    setIsSearchingOrigin(true)
    const results = await searchPlaces(query)
    setOriginSearchResults(results)
    setIsSearchingOrigin(false)
  }

  // Handle selecting a new origin location
  const handleSelectOrigin = async (result: PlaceAutocompleteResult) => {
    const details = await getPlaceDetails(result.placeId)
    const newOrigin: RouteStop = {
      id: 'origin',
      name: 'Home',
      address: details?.address || result.description,
      placeId: result.placeId,
      order: 0,
    }
    setOrigin(newOrigin)
    // Save to localStorage
    saveHomeLocation({
      name: 'Home',
      address: details?.address || result.description,
      placeId: result.placeId,
    })
    setShowOriginPicker(false)
    setOriginSearchQuery('')
    setOriginSearchResults([])
  }

  const handleOpenInMaps = () => {
    const context: DirectionsContext = {
      origin,
      destination: destinationStop,
      stops,
      travelMode,
    }
    openInMaps(context)
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-neutral-100">
        <h3 className="text-sm font-semibold text-neutral-800">
          Directions to {eventTitle}
        </h3>
      </div>

      {/* Origin location picker */}
      {showOriginPicker && (
        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Set Home Address</span>
            <button
              onClick={() => {
                setShowOriginPicker(false)
                setOriginSearchQuery('')
                setOriginSearchResults([])
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Cancel
            </button>
          </div>
          <input
            type="text"
            value={originSearchQuery}
            onChange={(e) => handleOriginSearch(e.target.value)}
            placeholder="Search for your home address..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          {isSearchingOrigin && (
            <p className="text-xs text-neutral-400 mt-2">Searching...</p>
          )}
          {originSearchResults.length > 0 && (
            <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden">
              {originSearchResults.map((result) => (
                <li key={result.placeId}>
                  <button
                    onClick={() => handleSelectOrigin(result)}
                    className="w-full px-3 py-2 text-left hover:bg-neutral-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-neutral-800">{result.mainText}</p>
                    <p className="text-xs text-neutral-500">{result.secondaryText}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Route stops */}
      <div className="px-4 py-3">
        {/* Origin - leg[0] goes to first stop or destination */}
        <StopItem
          stop={origin}
          type="origin"
          onChangeLocation={() => setShowOriginPicker(true)}
          legToNext={result?.legs?.[0]}
        />

        {/* Intermediate stops */}
        {stops.map((stop, index) => (
          <div key={stop.id}>
            <StopItem
              stop={stop}
              type="stop"
              onEdit={handleEditStop}
              onRemove={() => handleRemoveStop(stop.id)}
              legToNext={result?.legs?.[index + 1]}
            />
          </div>
        ))}

        {/* Add stop */}
        <AddStopInput
          onAddStop={handleAddStop}
          onSearch={searchPlaces}
          onGetDetails={getPlaceDetails}
        />

        {/* Connecting line before destination */}
        <div className="ml-3 border-l-2 border-dashed border-neutral-200 h-2" />

        {/* Destination */}
        <StopItem
          stop={destinationStop}
          type="destination"
        />
      </div>

      {/* Travel mode selector */}
      <div className="px-4 py-3 border-t border-neutral-100">
        <TravelModeSelector mode={travelMode} onChange={setTravelMode} />
      </div>

      {/* Duration/distance display */}
      <div className="px-4 py-3 border-t border-neutral-100">
        {isCalculating ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <div className="w-4 h-4 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
            Calculating route...
          </div>
        ) : error ? (
          error.includes('home address') ? (
            <button
              onClick={() => setShowOriginPicker(true)}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              <span className="underline">Set your starting address</span>
              <span className="text-neutral-500 no-underline">to see travel time</span>
            </button>
          ) : (
            <div className="text-sm">
              <p className="text-amber-600 mb-1">Unable to calculate exact route</p>
              <p className="text-neutral-500 text-xs">Time estimates will be shown in Maps</p>
            </div>
          )
        ) : result ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-neutral-800">
              {formatDuration(result.duration)}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-600">
              {formatDistance(result.distance)}
            </span>
            {result.legs && result.legs.length > 1 && (
              <>
                <span className="text-neutral-400">·</span>
                <span className="text-neutral-500">{result.legs.length} stops</span>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Open in Maps button */}
      <div className="px-4 py-4">
        <button
          onClick={handleOpenInMaps}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          Open in Maps
        </button>
      </div>
    </div>
  )
}
