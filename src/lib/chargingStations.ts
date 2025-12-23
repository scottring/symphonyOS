/**
 * Charging Station Integration
 * Integration with Open Charge Map API for finding EV charging stations
 * API Docs: https://openchargemap.org/site/develop/api
 */

import type { ChargingStation, ChargingNetwork } from '@/types/trip'
import { supabase } from './supabase'

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
    // Call our Supabase Edge Function to fetch stations from NREL API
    const { data, error } = await supabase.functions.invoke('find-charging-stations-nrel', {
      body: {
        latitude,
        longitude,
        radiusMiles,
        maxResults,
        minPowerKW,
        networks, // Pass network filter to NREL
      },
    })

    if (error) {
      console.error('Error calling find-charging-stations-nrel function:', error)
      return []
    }

    const stations: ChargingStation[] = data.stations || []

    // Log networks for debugging
    if (stations.length > 0) {
      const uniqueNetworks = [...new Set(stations.map(s => s.network))]
      const operationalCount = stations.filter(s => s.available).length
      console.log(`Received ${stations.length} stations (${operationalCount} operational) with networks:`, uniqueNetworks)
      console.log(`Filtering by networks:`, networks)
    }

    // Apply client-side filters
    const filtered = stations.filter((station) => {
      // Filter operational status
      if (operationalOnly && !station.available) {
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
    // (user's preferred networks may not be available in this area)
    if (networks && networks.length > 0 && filtered.length === 0 && stations.length > 0) {
      console.log(`No stations match preferred networks. Trying all networks...`)

      // First try operational stations from all networks
      const allOperational = stations.filter(station => station.available)
      if (allOperational.length > 0) {
        console.log(`Showing ${allOperational.length} operational stations from all networks.`)
        return allOperational
      }

      // If no operational stations, show all stations including non-operational
      console.log(`No operational stations found. Showing all ${stations.length} stations (including non-operational).`)
      return stations
    }

    return filtered
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

  console.log('findChargersAlongRoute called:', {
    routePointsCount: routePoints.length,
    searchRadiusMiles,
    minPowerKW,
    networks,
  })

  // Search at key points along the route (every N points to avoid too many API calls)
  const searchInterval = Math.max(1, Math.floor(routePoints.length / 5)) // Max 5 searches
  const searchPoints = routePoints.filter((_, index) => index % searchInterval === 0)

  console.log(`Searching at ${searchPoints.length} points along route`)

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

    console.log(`Found ${stations.length} stations at point (${point.lat}, ${point.lng})`)

    // Deduplicate stations
    for (const station of stations) {
      if (!seenStationIds.has(station.id)) {
        seenStationIds.add(station.id)
        allStations.push(station)
      }
    }
  }

  console.log(`Total unique stations found: ${allStations.length}`)

  // Sort by distance if available
  return allStations.sort((a, b) => (a.distance || 0) - (b.distance || 0))
}

// ============================================================================
// Helper Functions
// ============================================================================

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
