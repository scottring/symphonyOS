/**
 * Google Maps SDK Loader
 * Loads the Google Maps JavaScript SDK dynamically with the Places library
 *
 * Updated to support Places API (New) - December 2024
 * Uses google.maps.importLibrary() for proper async loading
 */

// Extend window type to include google namespace
declare global {
  interface Window {
    google?: typeof google
  }
}

// Track loading state
let coreLoadPromise: Promise<void> | null = null
let placesLibrary: google.maps.PlacesLibrary | null = null
let placesLoadPromise: Promise<google.maps.PlacesLibrary> | null = null

// Capture WHY Maps failed so the UI can show it instead of a blank "No places
// found". The two common silent failures are (a) Google rejecting the API key
// for this domain/device (fires window.gm_authFailure, never throws) and
// (b) the script being blocked from loading (ad/content blocker, offline).
let mapsLoadError: string | null = null
export function getMapsLoadError(): string | null {
  return mapsLoadError
}
function recordMapsLoadError(message: string) {
  mapsLoadError = message
  try {
    window.dispatchEvent(new CustomEvent('symphony:maps-error', { detail: message }))
  } catch {
    // CustomEvent unavailable (non-browser) — the getter still works.
  }
}

/**
 * Load the Google Maps core SDK
 * Returns a promise that resolves when the core SDK is ready
 */
export async function loadGoogleMapsSDK(): Promise<void> {
  // Already loaded
  if (window.google?.maps) {
    return
  }

  // Already loading
  if (coreLoadPromise) {
    return coreLoadPromise
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    recordMapsLoadError('Maps API key is missing from this build (VITE_GOOGLE_MAPS_API_KEY).')
    throw new Error('VITE_GOOGLE_MAPS_API_KEY is not configured')
  }

  // Google calls this when it rejects the key (e.g. RefererNotAllowedMapError,
  // ApiNotActivatedMapError) — it does NOT throw in our promise, so without
  // this hook the failure is invisible.
  ;(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    recordMapsLoadError(
      'Google rejected the Maps API key for this site/device. Usually an API-key HTTP-referrer or API restriction, or a content/ad blocker.'
    )
  }

  coreLoadPromise = new Promise((resolve, reject) => {
    // Create callback for when SDK loads
    const callbackName = '__googleMapsCallback__' + Date.now()
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, () => void>)[callbackName]
      resolve()
    }

    // Create script element - load core only, we'll import libraries dynamically
    // Use loading=async to suppress console warning about async loading
    // Use v=weekly to get latest features including importLibrary support
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async&callback=${callbackName}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      coreLoadPromise = null
      recordMapsLoadError('The Google Maps script failed to load — network offline or blocked by a content/ad blocker.')
      reject(new Error('Failed to load Google Maps SDK'))
    }

    document.head.appendChild(script)
  })

  return coreLoadPromise
}

/**
 * Load the Places library using importLibrary (required for new Places API)
 * Returns the Places library with AutocompleteSuggestion, Place, etc.
 */
export async function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  // Already loaded
  if (placesLibrary) {
    return placesLibrary
  }

  // Already loading
  if (placesLoadPromise) {
    return placesLoadPromise
  }

  // Ensure core SDK is loaded first
  await loadGoogleMapsSDK()

  placesLoadPromise = google.maps.importLibrary('places').then((lib) => {
    placesLibrary = lib as google.maps.PlacesLibrary
    return placesLibrary
  })

  return placesLoadPromise
}

/**
 * Check if the Google Maps core SDK is loaded
 */
export function isGoogleMapsLoaded(): boolean {
  return Boolean(window.google?.maps)
}

/**
 * Check if the Places library is loaded
 */
export function isPlacesLibraryLoaded(): boolean {
  return Boolean(placesLibrary)
}

/**
 * Get the loaded Places library (returns null if not loaded)
 */
export function getPlacesLibrary(): google.maps.PlacesLibrary | null {
  return placesLibrary
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
