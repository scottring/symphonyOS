/**
 * Google Maps SDK Loader
 * Loads the Google Maps JavaScript SDK dynamically with the Places library
 *
 * Updated to support Places API (New) - December 2024
 */

// Extend window type to include google namespace
declare global {
  interface Window {
    google?: typeof google
  }
}

// Track loading state
let loadPromise: Promise<void> | null = null

/**
 * Load the Google Maps SDK with Places library (New API)
 * Returns a promise that resolves when the SDK is ready
 */
export async function loadGoogleMapsSDK(): Promise<void> {
  // Already loaded - check for new Places API marker
  if (window.google?.maps?.places?.Place) {
    return
  }

  // Already loading
  if (loadPromise) {
    return loadPromise
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    throw new Error('VITE_GOOGLE_MAPS_API_KEY is not configured')
  }

  loadPromise = new Promise((resolve, reject) => {
    // Create callback for when SDK loads
    const callbackName = '__googleMapsCallback__' + Date.now()
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, () => void>)[callbackName]
      resolve()
    }

    // Create script element
    // Using 'places' library for autocomplete and 'routes' for DirectionsService
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,routes&callback=${callbackName}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Failed to load Google Maps SDK'))
    }

    document.head.appendChild(script)
  })

  return loadPromise
}

/**
 * Check if the Google Maps SDK is loaded (with new Places API)
 */
export function isGoogleMapsLoaded(): boolean {
  return Boolean(window.google?.maps?.places?.Place)
}

// =============================================================================
// LEGACY IMPLEMENTATION (kept for reference)
// =============================================================================
// The old Places API used:
// - google.maps.places.AutocompleteService for predictions
// - google.maps.places.PlacesService for place details
//
// Old check was: Boolean(window.google?.maps?.places)
//
// The new Places API uses:
// - google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions()
// - google.maps.places.Place class with fetchFields()
// =============================================================================
