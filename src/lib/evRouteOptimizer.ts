/**
 * EV Route Optimizer
 * Calculates optimal charging stops for electric vehicle trips
 */

import type {
  EVRouteParams,
  EVRouteResult,
  ChargingStop,
  RouteLeg,
  Location,
  ChargingStation,
} from '@/types/trip'
import { findChargersAlongRoute, findClosestStation, calculateDistance } from './chargingStations'

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MIN_BATTERY = 20 // Don't let battery drop below 20%
const DEFAULT_MAX_BATTERY = 80 // Charge to 80% for optimal speed
const SAFETY_BUFFER = 5 // Extra buffer percentage
// const AVERAGE_SPEED_MPH = 65 // Average highway speed (unused for now, but may be useful for future time calculations)
const CITY_EFFICIENCY_FACTOR = 1.1 // City driving uses ~10% more battery

// ============================================================================
// Main Route Calculation
// ============================================================================

/**
 * Calculate optimal EV route with charging stops
 */
export async function calculateEVRoute(params: EVRouteParams): Promise<EVRouteResult> {
  const {
    origin,
    destination,
    waypoints = [],
    vehicleRange,
    currentBattery,
    minBattery = DEFAULT_MIN_BATTERY,
    maxBattery = DEFAULT_MAX_BATTERY,
    preferredNetworks,
  } = params

  // Get route from Google Maps
  const route = await getGoogleMapsRoute(origin, destination, waypoints)

  if (!route) {
    throw new Error('Unable to calculate route')
  }

  // Extract route points for charging station search
  const routePoints = extractRoutePoints(route.legs)

  // Find all charging stations along the route
  const availableStations = await findChargersAlongRoute({
    routePoints,
    searchRadiusMiles: 25, // Increased radius to find more fast chargers
    minPowerKW: 50, // Fast chargers only for road trips
    networks: preferredNetworks,
  })

  // Simulate the drive and determine charging stops
  const { chargingStops, legs } = simulateDrive({
    routeLegs: route.legs,
    vehicleRange,
    currentBattery,
    minBattery,
    maxBattery,
    availableStations,
  })

  // Calculate total durations
  const drivingDuration = legs
    .filter((leg) => leg.type === 'driving')
    .reduce((sum, leg) => sum + leg.duration, 0)

  const chargingDuration = chargingStops.reduce((sum, stop) => sum + stop.chargeTime, 0)

  return {
    totalDistance: route.distance,
    totalDuration: drivingDuration + chargingDuration,
    drivingDuration,
    chargingDuration,
    chargingStops,
    availableStations, // Include all available stations along route
    legs,
  }
}

// ============================================================================
// Google Maps Integration
// ============================================================================

interface GoogleMapsRoute {
  distance: number // miles
  duration: number // minutes
  legs: Array<{
    startAddress: string
    endAddress: string
    distance: number // meters
    duration: number // seconds
    startLocation: { lat: number; lng: number }
    endLocation: { lat: number; lng: number }
    steps: Array<{
      distance: number
      duration: number
      startLocation: { lat: number; lng: number }
      endLocation: { lat: number; lng: number }
    }>
  }>
}

async function getGoogleMapsRoute(
  origin: Location,
  destination: Location,
  waypoints: Location[]
): Promise<GoogleMapsRoute | null> {
  try {
    if (!window.google?.maps?.DirectionsService) {
      console.error('Google Maps not loaded')
      return null
    }

    const directionsService = new google.maps.DirectionsService()

    const waypointLocations: google.maps.DirectionsWaypoint[] = waypoints.map((wp) => ({
      location: wp.address,
      stopover: false, // We'll add charging stops ourselves
    }))

    const response = await directionsService.route({
      origin: origin.address,
      destination: destination.address,
      waypoints: waypointLocations,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    })

    if (!response.routes?.[0]) {
      return null
    }

    const route = response.routes[0]
    const totalDistance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1609.344 // Convert meters to miles
    const totalDuration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 60 // Convert seconds to minutes

    return {
      distance: totalDistance,
      duration: totalDuration,
      legs: route.legs.map((leg) => ({
        startAddress: leg.start_address || '',
        endAddress: leg.end_address || '',
        distance: leg.distance?.value || 0,
        duration: leg.duration?.value || 0,
        startLocation: {
          lat: leg.start_location?.lat() || 0,
          lng: leg.start_location?.lng() || 0,
        },
        endLocation: {
          lat: leg.end_location?.lat() || 0,
          lng: leg.end_location?.lng() || 0,
        },
        steps: leg.steps?.map((step) => ({
          distance: step.distance?.value || 0,
          duration: step.duration?.value || 0,
          startLocation: {
            lat: step.start_location?.lat() || 0,
            lng: step.start_location?.lng() || 0,
          },
          endLocation: {
            lat: step.end_location?.lat() || 0,
            lng: step.end_location?.lng() || 0,
          },
        })) || [],
      })),
    }
  } catch (error) {
    console.error('Error getting Google Maps route:', error)
    return null
  }
}

// ============================================================================
// Route Simulation
// ============================================================================

function extractRoutePoints(legs: GoogleMapsRoute['legs']): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = []

  for (const leg of legs) {
    // Add start point
    points.push(leg.startLocation)

    // Add points from steps (sample every few steps to avoid too many points)
    const sampleInterval = Math.max(1, Math.floor(leg.steps.length / 10))
    for (let i = 0; i < leg.steps.length; i += sampleInterval) {
      points.push(leg.steps[i].endLocation)
    }
  }

  return points
}

interface SimulationResult {
  chargingStops: ChargingStop[]
  legs: RouteLeg[]
}

function simulateDrive(params: {
  routeLegs: GoogleMapsRoute['legs']
  vehicleRange: number
  currentBattery: number
  minBattery: number
  maxBattery: number
  availableStations: ChargingStation[]
}): SimulationResult {
  const { routeLegs, vehicleRange, currentBattery, minBattery, maxBattery, availableStations } = params

  const chargingStops: ChargingStop[] = []
  const legs: RouteLeg[] = []

  let battery = currentBattery
  let currentLocation = routeLegs[0].startLocation

  for (const googleLeg of routeLegs) {
    const legMiles = googleLeg.distance / 1609.344 // Convert meters to miles
    const legMinutes = googleLeg.duration / 60 // Convert seconds to minutes

    // Calculate battery usage for this leg
    const batteryPerMile = 100 / vehicleRange
    const batteryNeeded = legMiles * batteryPerMile * CITY_EFFICIENCY_FACTOR

    // Check if we need to charge before this leg
    if (battery - batteryNeeded < minBattery + SAFETY_BUFFER) {
      // Find charging station near current location
      const station = findClosestStation(currentLocation, availableStations)

      if (station && station.location.lat && station.location.lng) {
        // Calculate charging time (simplified model)
        const chargeNeeded = maxBattery - battery
        const chargeTime = calculateChargeTime(chargeNeeded, station.powerKW)

        const chargingStop: ChargingStop = {
          stationId: station.id,
          station,
          arrivalBattery: Math.round(battery),
          departureBattery: maxBattery,
          chargeTime,
        }

        chargingStops.push(chargingStop)

        // Add charging leg
        legs.push({
          from: {
            name: 'Current location',
            address: '',
            lat: currentLocation.lat,
            lng: currentLocation.lng,
          },
          to: station.location,
          distance: calculateDistance(currentLocation, {
            lat: station.location.lat,
            lng: station.location.lng,
          }),
          duration: chargeTime,
          batteryUsed: 0,
          type: 'charging',
        })

        battery = maxBattery
        currentLocation = { lat: station.location.lat, lng: station.location.lng }
      }
    }

    // Add driving leg
    legs.push({
      from: {
        name: googleLeg.startAddress,
        address: googleLeg.startAddress,
        lat: googleLeg.startLocation.lat,
        lng: googleLeg.startLocation.lng,
      },
      to: {
        name: googleLeg.endAddress,
        address: googleLeg.endAddress,
        lat: googleLeg.endLocation.lat,
        lng: googleLeg.endLocation.lng,
      },
      distance: legMiles,
      duration: legMinutes,
      batteryUsed: Math.round(batteryNeeded),
      type: 'driving',
    })

    battery -= batteryNeeded
    currentLocation = googleLeg.endLocation
  }

  return { chargingStops, legs }
}

/**
 * Calculate charging time based on battery needed and charger power
 * Simplified model: assumes constant charging rate
 */
function calculateChargeTime(batteryPercentNeeded: number, chargerPowerKW: number): number {
  // Typical EV battery is 75 kWh average
  const averageBatteryKWh = 75
  const kWhNeeded = (batteryPercentNeeded / 100) * averageBatteryKWh

  // Time = energy / power
  const hours = kWhNeeded / chargerPowerKW

  // Convert to minutes and add 5min buffer for setup
  return Math.ceil(hours * 60) + 5
}
