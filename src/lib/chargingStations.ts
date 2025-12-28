/**
 * Charging Station Integration
 * Integration with Google Places API for finding EV charging stations
 */

import type { ChargingStation, ChargingNetwork } from '@/types/trip'
import { loadGoogleMapsSDK } from './googleMaps'

// ============================================================================
// API Functions
// ============================================================================

export interface FindChargersParams {
  latitude: number
  longitude: number
  radiusMiles?: number // Default 25 miles
  maxResults?: number // Default 20
  minPowerKW?: number // Minimum charging power (e.g., 50kW for fast charging)
  networks?: ChargingNetwork[] // Filter by preferred networks
  operationalOnly?: boolean // Only show operational chargers (default true)
}

/**
 * Find charging stations near a location using Google Places API
 */
export async function findChargingStations(params: FindChargersParams): Promise<ChargingStation[]> {
  const {
    latitude,
    longitude,
    radiusMiles = 25,
    maxResults = 20,
    minPowerKW,
    networks,
    operationalOnly = true,
  } = params

  try {
    // Ensure Google Maps is loaded
    await loadGoogleMapsSDK()

    if (!window.google?.maps?.places?.PlacesService) {
      return []
    }

    // Create a temporary map element for PlacesService (required by Google)
    const mapDiv = document.createElement('div')
    const map = new google.maps.Map(mapDiv)
    const service = new google.maps.places.PlacesService(map)

    // Search for EV charging stations using keyword search
    // Note: 'type' parameter doesn't reliably filter charging stations, so we use 'keyword'
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(latitude, longitude),
      radius: radiusMiles * 1609.34, // Convert miles to meters
      keyword: 'EV charging station electric vehicle',
    }

    const results = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
      service.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          resolve(results)
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([])
        } else {
          reject(new Error(`Places API error: ${status}`))
        }
      })
    })

    // Get detailed information for each place to find network data
    // We'll fetch details for up to maxResults stations
    const detailedResults: google.maps.places.PlaceResult[] = []

    for (const place of results.slice(0, maxResults)) {
      if (!place.place_id) continue

      try {
        const details = await new Promise<google.maps.places.PlaceResult>((resolve) => {
          service.getDetails(
            {
              placeId: place.place_id!,
              fields: [
                'name',
                'formatted_address',
                'geometry',
                'place_id',
                'business_status',
                'types',
                'website',
                'opening_hours',
              ],
            },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                resolve(result)
              } else {
                resolve(place) // Fall back to basic place data
              }
            }
          )
        })

        detailedResults.push(details)
      } catch (error) {
        detailedResults.push(place) // Fall back to basic data
      }
    }

    // Transform Google Places results to our ChargingStation format
    const stations: ChargingStation[] = detailedResults
      .map((place) => transformPlaceToStation(place, { lat: latitude, lng: longitude }))
      .filter((station): station is ChargingStation => station !== null)

    // Apply client-side filters
    const filtered = stations.filter((station) => {
      // Filter operational status
      if (operationalOnly && !station.available) {
        return false
      }

      // Filter by minimum power
      if (minPowerKW && station.powerKW < minPowerKW) {
        return false
      }

      // Filter by network if specified
      if (networks && networks.length > 0) {
        if (!networks.includes(station.network)) {
          return false
        }
      }

      return true
    })

    // If network filter returned 0 results, fall back to showing all stations
    if (networks && networks.length > 0 && filtered.length === 0 && stations.length > 0) {
      // First try operational stations from all networks
      const allOperational = stations.filter((station) => station.available)
      if (allOperational.length > 0) {
        return allOperational
      }

      // Show all stations including non-operational
      return stations
    }

    return filtered
  } catch (error) {
    return []
  }
}

/**
 * Find charging stations along a route
 * Takes route segments and searches for chargers near the path
 */
export async function findChargersAlongRoute(params: {
  routePoints: { lat: number; lng: number }[]
  searchRadiusMiles?: number
  minPowerKW?: number
  networks?: ChargingNetwork[]
}): Promise<ChargingStation[]> {
  const { routePoints, searchRadiusMiles = 10, minPowerKW, networks } = params

  // Search at key points along the route (every N points to avoid too many API calls)
  const searchInterval = Math.max(1, Math.floor(routePoints.length / 5)) // Max 5 searches
  const searchPoints = routePoints.filter((_, index) => index % searchInterval === 0)

  const allStations: ChargingStation[] = []
  const seenStationIds = new Set<string>()

  for (const point of searchPoints) {
    const stations = await findChargingStations({
      latitude: point.lat,
      longitude: point.lng,
      radiusMiles: searchRadiusMiles,
      maxResults: 10,
      minPowerKW,
      networks,
    })

    // Deduplicate stations
    for (const station of stations) {
      if (!seenStationIds.has(station.id)) {
        seenStationIds.add(station.id)
        allStations.push(station)
      }
    }
  }

  // Sort by distance if available
  return allStations.sort((a, b) => (a.distance || 0) - (b.distance || 0))
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform Google Places result to ChargingStation format
 */
function transformPlaceToStation(
  place: google.maps.places.PlaceResult,
  searchOrigin: { lat: number; lng: number }
): ChargingStation | null {
  if (!place.place_id || !place.geometry?.location) {
    return null
  }

  const lat = place.geometry.location.lat()
  const lng = place.geometry.location.lng()
  const name = place.name || 'Unknown Station'
  const address = place.vicinity || place.formatted_address || ''

  // Detect network from station name, address, and website
  const network = detectChargingNetwork(name, address, place.website)

  // Estimate power based on network
  const powerKW = estimatePowerByNetwork(network)

  // Calculate distance from search origin
  const distance = calculateDistance(searchOrigin, { lat, lng })

  // Determine availability (assume open if business_status is OPERATIONAL)
  const available = place.business_status === 'OPERATIONAL' || !place.business_status

  return {
    id: `google-${place.place_id}`,
    name,
    location: {
      name,
      address,
      placeId: place.place_id,
      lat,
      lng,
    },
    network,
    powerKW,
    connectorTypes: [], // Google Places doesn't provide this directly
    available,
    distance,
  }
}

/**
 * Detect charging network from station name, address, and website
 */
function detectChargingNetwork(
  name: string,
  address?: string,
  website?: string
): ChargingNetwork {
  // Combine all available text for searching
  const searchText = [name, address, website].filter(Boolean).join(' ').toLowerCase()

  if (
    searchText.includes('electrify america') ||
    searchText.includes('electrify-america') ||
    searchText.includes('electrifyamerica.com')
  ) {
    return 'Electrify America'
  }
  if (
    searchText.includes('tesla') ||
    searchText.includes('supercharger') ||
    searchText.includes('tesla.com')
  ) {
    return 'Tesla Supercharger'
  }
  if (
    searchText.includes('chargepoint') ||
    searchText.includes('charge point') ||
    searchText.includes('chargepoint.com')
  ) {
    return 'ChargePoint'
  }
  if (searchText.includes('evgo') || searchText.includes('ev go') || searchText.includes('evgo.com')) {
    return 'EVgo'
  }
  if (searchText.includes('blink') || searchText.includes('blinkcharging.com')) {
    return 'Blink'
  }

  return 'Other'
}

/**
 * Estimate charging power based on network
 * These are typical values - actual stations may vary
 */
function estimatePowerByNetwork(network: ChargingNetwork): number {
  switch (network) {
    case 'Electrify America':
      return 350 // EA typically has 150-350kW chargers
    case 'Tesla Supercharger':
      return 250 // V3 Superchargers are 250kW
    case 'EVgo':
      return 100 // EVgo typically 50-100kW
    case 'ChargePoint':
      return 62.5 // ChargePoint Express is typically 62.5kW
    case 'Blink':
      return 50 // Blink DC fast chargers are typically 50kW
    case 'Other':
      return 50 // Conservative default for unknown networks
    default:
      return 50
  }
}

/**
 * Calculate distance between two lat/lng points in miles
 * Uses Haversine formula
 */
export function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const R = 3959 // Earth's radius in miles
  const dLat = toRadians(point2.lat - point1.lat)
  const dLng = toRadians(point2.lng - point1.lng)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.lat)) *
      Math.cos(toRadians(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Find the closest charging station to a point
 */
export function findClosestStation(
  point: { lat: number; lng: number },
  stations: ChargingStation[]
): ChargingStation | null {
  if (stations.length === 0) return null

  // Find first station with valid coordinates
  let closest: ChargingStation | null = null
  let minDistance = Infinity

  for (const station of stations) {
    if (!station.location.lat || !station.location.lng) continue

    const distance = calculateDistance(point, {
      lat: station.location.lat,
      lng: station.location.lng,
    })

    if (distance < minDistance) {
      minDistance = distance
      closest = station
    }
  }

  return closest
}
