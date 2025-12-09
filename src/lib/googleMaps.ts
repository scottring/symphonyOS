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
    throw new Error('VITE_GOOGLE_MAPS_API_KEY is not configured')
  }

  coreLoadPromise = new Promise((resolve, reject) => {
    // Create callback for when SDK loads
    const callbackName = '__googleMapsCallback__' + Date.now()
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, () => void>)[callbackName]
      resolve()
    }

    // Create script element - load core only, we'll import libraries dynamically
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      coreLoadPromise = null
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
