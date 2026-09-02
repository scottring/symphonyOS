import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { geocodePlace } from '@/lib/geocode'
import { setHomeCoords } from '@/hooks/useWeather'

// Local storage key for home location (shared with DirectionsBuilder)
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

function clearHomeLocation() {
  try {
    localStorage.removeItem(HOME_LOCATION_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function HomeAddressSettings() {
  const { user } = useAuth()
  const [homeLocation, setHomeLocation] = useState<SavedLocation | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [addressInput, setAddressInput] = useState('')

  // Load saved home location on mount
  useEffect(() => {
    setHomeLocation(getSavedHomeLocation())
  }, [])

  const saveToSupabase = async (address: string) => {
    if (!user) return
    // Coordinates feed the weather chip; best effort, the address saves regardless.
    let coords: { home_lat: number; home_lng: number } | null = null
    try {
      const hit = await geocodePlace(address)
      if (hit) {
        coords = { home_lat: hit.lat, home_lng: hit.lng }
        setHomeCoords(hit.lat, hit.lng)
      }
    } catch { /* offline or provider down */ }
    await supabase.from('user_profiles').upsert({
      user_id: user.id,
      home_location: address,
      ...(coords ?? {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  const clearFromSupabase = async () => {
    if (!user) return
    await supabase.from('user_profiles').update({
      home_location: null,
      home_lat: null,
      home_lng: null,
      home_place_id: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)
  }

  const handleSave = () => {
    const address = addressInput.trim()
    if (!address) return

    const newLocation: SavedLocation = {
      name: 'Home',
      address,
    }

    saveHomeLocation(newLocation)
    setHomeLocation(newLocation)
    saveToSupabase(address)
    setIsEditing(false)
    setAddressInput('')
  }

  const handleClear = () => {
    clearHomeLocation()
    setHomeLocation(null)
    clearFromSupabase()
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Home Address</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Set your default home address for directions. This will be used as the default starting point when getting directions.
      </p>

      {isEditing ? (
        <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="Enter your home address..."
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={!addressInput.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setAddressInput('')
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
