/**
 * Charging Station Integration
 * Integration with Open Charge Map API for finding EV charging stations
 * API Docs: https://openchargemap.org/site/develop/api
 */

import type { ChargingStation, ChargingNetwork } from '@/types/trip'

// Open Charge Map API base URL
const API_BASE_URL = 'https://api.openchargemap.io/v3/poi/'

// ============================================================================
// API Types (Open Charge Map response format)
// ============================================================================

interface OCMLocation {
  ID: number
  Title: string
  AddressInfo: {
    Title: string
    AddressLine1: string
    Town: string
    StateOrProvince: string
    Postcode: string
    Country: {
      Title: string
    }
    Latitude: number
    Longitude: number
    Distance: number // Distance from search origin in miles/km
  }
  Connections: Array<{
    ID: number
    ConnectionTypeID: number
    StatusTypeID: number
    LevelID: number
    PowerKW: number
    CurrentTypeID: number
    Quantity: number
  }>
  OperatorInfo: {
    ID: number
    Title: string
    WebsiteURL: string
  }
  StatusType: {
    IsOperational: boolean
    Title: string
  }
  NumberOfPoints: number
}

// ============================================================================
// Network Mapping
// ============================================================================

// Map Open Charge Map operator IDs to our ChargingNetwork type
const NETWORK_MAP: Record<number, ChargingNetwork> = {
  1: 'Other', // Unknown
  2: 'ChargePoint',
  3: 'Blink',
  23: 'Tesla Supercharger',
  25: 'Electrify America',
  35: 'EVgo',
  // Add more as needed
}

function mapToChargingNetwork(operatorId: number, operatorTitle: string): ChargingNetwork {
  // Check if we have a mapped network
  if (NETWORK_MAP[operatorId]) {
    return NETWORK_MAP[operatorId]
  }

  // Try to match by title
  const title = operatorTitle.toLowerCase()
  if (title.includes('tesla')) return 'Tesla Supercharger'
  if (title.includes('electrify america')) return 'Electrify America'
  if (title.includes('chargepoint')) return 'ChargePoint'
  if (title.includes('evgo')) return 'EVgo'
  if (title.includes('blink')) return 'Blink'

  return 'Other'
}

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
 * Find charging stations near a location
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
    // Build query parameters
    const queryParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      distance: radiusMiles.toString(),
      distanceunit: 'Miles',
      maxresults: maxResults.toString(),
      compact: 'true',
      verbose: 'false',
    })

    // Add minimum power filter if specified
    if (minPowerKW) {
      queryParams.append('minpowerkw', minPowerKW.toString())
    }

    const url = `${API_BASE_URL}?${queryParams.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      console.error('Open Charge Map API error:', response.status, response.statusText)
      return []
    }

    const data: OCMLocation[] = await response.json()

    // Convert to our ChargingStation format and filter
    const stations: ChargingStation[] = data
      .filter((location) => {
        // Filter operational status
        if (operationalOnly && !location.StatusType?.IsOperational) {
          return false
        }

        // Filter by network if specified
        if (networks && networks.length > 0) {
          const network = mapToChargingNetwork(
            location.OperatorInfo?.ID || 0,
            location.OperatorInfo?.Title || ''
          )
          if (!networks.includes(network)) {
            return false
          }
        }

        return true
      })
      .map((location) => {
        // Find the fastest charger at this location
        const maxPower = Math.max(...(location.Connections?.map((c) => c.PowerKW || 0) || [0]))

        // Get connector types
        const connectorTypes = location.Connections?.map((c) => `Type ${c.ConnectionTypeID}`) || []

        return {
          id: `ocm-${location.ID}`,
          name: location.AddressInfo?.Title || location.Title || 'Unnamed Station',
          location: {
            name: location.AddressInfo?.Title || location.Title,
            address: formatAddress(location.AddressInfo),
            lat: location.AddressInfo?.Latitude,
            lng: location.AddressInfo?.Longitude,
          },
          network: mapToChargingNetwork(
            location.OperatorInfo?.ID || 0,
            location.OperatorInfo?.Title || ''
          ),
          powerKW: maxPower,
          connectorTypes,
          available: location.StatusType?.IsOperational || false,
          distance: location.AddressInfo?.Distance,
        }
      })

    return stations
  } catch (error) {
    console.error('Error fetching charging stations:', error)
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

function formatAddress(addressInfo: OCMLocation['AddressInfo']): string {
  if (!addressInfo) return ''

  const parts = [
    addressInfo.AddressLine1,
    addressInfo.Town,
    addressInfo.StateOrProvince,
    addressInfo.Postcode,
  ].filter(Boolean)

  return parts.join(', ')
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

  let closest = stations[0]
  let minDistance = calculateDistance(point, {
    lat: closest.location.lat!,
    lng: closest.location.lng!,
  })

  for (const station of stations.slice(1)) {
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
