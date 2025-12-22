/**
 * Trip Task Generator
 * Generates tasks for trip packing lists, charging stops, and travel legs
 * Supports both simple trips and multi-segment trips
 */

import type { PackingTemplate, PackingItem, EVRouteResult, TripMetadata, TripSegment, Accommodation, TransportationLogistic, TripEvent } from '@/types/trip'
import type { Task } from '@/types/task'
import { getPackingList } from './packingTemplates'

export interface GeneratedTripTasks {
  packingTasks: Partial<Task>[]
  travelTasks: Partial<Task>[]
  chargingTasks: Partial<Task>[]
  accommodationTasks: Partial<Task>[]
  logisticsTasks: Partial<Task>[]
}

// ============================================================================
// Packing List Tasks
// ============================================================================

/**
 * Generate packing list tasks from template or custom items
 */
export function generatePackingTasks(
  projectId: string,
  packingTemplate: PackingTemplate,
  tripStartDate: string,
  customItems?: PackingItem[]
): Partial<Task>[] {
  const packingItems = customItems || getPackingList(packingTemplate)

  // Schedule packing tasks for 2 days before trip
  const packByDate = new Date(tripStartDate)
  packByDate.setDate(packByDate.getDate() - 2)

  return packingItems.map((item) => ({
    title: `Pack: ${item.name}`,
    projectId: projectId,
    scheduledFor: packByDate,
    completed: false,
    context: 'personal',
    notes: item.essential ? 'Essential item' : 'Optional item',
    // Use category field or notes to track packing category
    // Could add custom field in future: packing_category: item.category
  }))
}

// ============================================================================
// Travel Leg Tasks
// ============================================================================

/**
 * Generate travel leg tasks from route
 */
export function generateTravelTasks(
  projectId: string,
  routeResult: EVRouteResult,
  tripStartDate: string
): Partial<Task>[] {
  const tasks: Partial<Task>[] = []
  const tripStart = new Date(tripStartDate)

  // Calculate departure time based on total trip duration
  // Assume leaving at 8 AM on trip start date
  const departureTime = new Date(tripStart)
  departureTime.setHours(8, 0, 0, 0)

  let currentTime = departureTime

  // Create tasks for each driving leg
  for (const leg of routeResult.legs.filter((l) => l.type === 'driving')) {
    const scheduledTime = new Date(currentTime)

    tasks.push({
      title: `Drive: ${leg.from.name} → ${leg.to.name}`,
      projectId: projectId,
      scheduledFor: scheduledTime,
      completed: false,
      context: 'personal',
      notes: `Distance: ${Math.round(leg.distance)} mi\nEstimated duration: ${Math.round(leg.duration)} minutes\nBattery used: ${leg.batteryUsed}%`,
      estimatedDuration: leg.duration,
    })

    // Add duration to current time for next leg
    currentTime = new Date(currentTime.getTime() + leg.duration * 60 * 1000)
  }

  return tasks
}

// ============================================================================
// Charging Stop Tasks
// ============================================================================

/**
 * Generate charging stop tasks from route
 */
export function generateChargingTasks(
  projectId: string,
  routeResult: EVRouteResult,
  tripStartDate: string
): Partial<Task>[] {
  const tasks: Partial<Task>[] = []
  const tripStart = new Date(tripStartDate)

  // Calculate times based on travel legs
  const departureTime = new Date(tripStart)
  departureTime.setHours(8, 0, 0, 0)

  let currentTime = departureTime

  // Track time through the route
  for (const leg of routeResult.legs) {
    if (leg.type === 'charging') {
      // Find the corresponding charging stop
      const chargingStop = routeResult.chargingStops.find(
        (stop) => stop.station.location.address === leg.to.address
      )

      if (chargingStop) {
        tasks.push({
          title: `Charge at ${chargingStop.station.name}`,
          projectId: projectId,
          scheduledFor: new Date(currentTime),
          completed: false,
          context: 'personal',
          notes: `Charging station: ${chargingStop.station.name}\nNetwork: ${chargingStop.station.network}\nPower: ${chargingStop.station.powerKW} kW\nCharge from ${chargingStop.arrivalBattery}% to ${chargingStop.departureBattery}%\nEstimated time: ${chargingStop.chargeTime} minutes\n\nAddress: ${chargingStop.station.location.address}`,
          estimatedDuration: chargingStop.chargeTime,
        })
      }
    }

    // Add leg duration to current time
    currentTime = new Date(currentTime.getTime() + leg.duration * 60 * 1000)
  }

  return tasks
}

// ============================================================================
// Multi-Segment Trip Tasks
// ============================================================================

/**
 * Generate tasks for each trip segment
 */
export function generateSegmentTasks(
  projectId: string,
  segments: TripSegment[]
): Partial<Task>[] {
  const tasks: Partial<Task>[] = []

  for (const segment of segments) {
    const scheduledTime = new Date(`${segment.date}T${segment.time || '08:00'}`)

    let taskTitle = ''
    let taskNotes = ''

    switch (segment.type) {
      case 'driving_ev':
        taskTitle = `Drive (EV): ${segment.origin.name} → ${segment.destination.name}`
        taskNotes = segment.evVehicle
          ? `Vehicle: ${segment.evVehicle.model}\nCurrent Battery: ${segment.evVehicle.currentBattery}%\n\n${segment.notes || ''}`
          : segment.notes || ''
        break

      case 'driving_rental':
        taskTitle = `Drive (Rental): ${segment.origin.name} → ${segment.destination.name}`
        taskNotes = segment.rentalCar
          ? `Company: ${segment.rentalCar.company || 'N/A'}\nConfirmation: ${segment.rentalCar.confirmationNumber || 'N/A'}\n\n${segment.notes || ''}`
          : segment.notes || ''
        break

      case 'flying':
        taskTitle = `Flight: ${segment.origin.name} → ${segment.destination.name}`
        taskNotes = segment.flight
          ? `Airline: ${segment.flight.airline || 'N/A'}\nFlight: ${segment.flight.flightNumber || 'N/A'}\nConfirmation: ${segment.flight.confirmationNumber || 'N/A'}\nDeparture: ${segment.flight.departureTime || 'N/A'}\nArrival: ${segment.flight.arrivalTime || 'N/A'}\n\n${segment.notes || ''}`
          : segment.notes || ''
        break

      case 'train':
        taskTitle = `Train: ${segment.origin.name} → ${segment.destination.name}`
        taskNotes = segment.train
          ? `Line: ${segment.train.line || 'N/A'}\nTrain: ${segment.train.trainNumber || 'N/A'}\nConfirmation: ${segment.train.confirmationNumber || 'N/A'}\nDeparture: ${segment.train.departureTime || 'N/A'}\nArrival: ${segment.train.arrivalTime || 'N/A'}\n\n${segment.notes || ''}`
          : segment.notes || ''
        break

      case 'other':
        taskTitle = `Travel: ${segment.origin.name} → ${segment.destination.name}`
        taskNotes = segment.notes || ''
        break
    }

    tasks.push({
      title: taskTitle,
      projectId: projectId,
      scheduledFor: scheduledTime,
      completed: false,
      context: 'personal',
      notes: taskNotes.trim(),
    })
  }

  return tasks
}

/**
 * Generate tasks for accommodations
 */
export function generateAccommodationTasks(
  projectId: string,
  accommodations: Accommodation[]
): Partial<Task>[] {
  const tasks: Partial<Task>[] = []

  for (const accommodation of accommodations) {
    // Check-in task
    const checkInTime = new Date(`${accommodation.checkIn}T15:00`) // Default 3 PM check-in
    tasks.push({
      title: `Check in: ${accommodation.name}`,
      projectId: projectId,
      scheduledFor: checkInTime,
      completed: false,
      context: 'personal',
      notes: `Type: ${accommodation.type}\nAddress: ${accommodation.address || accommodation.location.address}\nPhone: ${accommodation.phone || 'N/A'}\nConfirmation: ${accommodation.confirmationNumber || 'N/A'}\n\n${accommodation.notes || ''}`.trim(),
    })

    // Check-out task
    const checkOutTime = new Date(`${accommodation.checkOut}T11:00`) // Default 11 AM check-out
    tasks.push({
      title: `Check out: ${accommodation.name}`,
      projectId: projectId,
      scheduledFor: checkOutTime,
      completed: false,
      context: 'personal',
      notes: accommodation.notes || '',
    })
  }

  return tasks
}

/**
 * Generate tasks for transportation logistics
 */
export function generateLogisticsTasks(
  projectId: string,
  logistics: TransportationLogistic[]
): Partial<Task>[] {
  const tasks: Partial<Task>[] = []

  for (const logistic of logistics) {
    const scheduledTime = new Date(`${logistic.date}T${logistic.time || '08:00'}`)

    tasks.push({
      title: logistic.description,
      projectId: projectId,
      scheduledFor: scheduledTime,
      completed: false,
      context: 'personal',
      notes: `Type: ${logistic.type}\nLocation: ${logistic.location.address}\nConfirmation: ${logistic.confirmationNumber || 'N/A'}\n\n${logistic.notes || ''}`.trim(),
    })
  }

  return tasks
}

/**
 * Generate tasks from unified timeline events
 */
export function generateEventTasks(projectId: string, events: TripEvent[]): Partial<Task>[] {
  const tasks: Partial<Task>[] = []

  for (const event of events) {
    // Skip events without dates
    if (!event.date) continue

    const scheduledTime = new Date(`${event.date}T${event.time || '08:00'}`)

    switch (event.eventType) {
      case 'flight':
      case 'train':
      case 'driving_ev':
      case 'driving_rental': {
        const travelEvent = event as any
        const origin = travelEvent.origin?.name || travelEvent.origin?.address || 'Unknown'
        const destination = travelEvent.destination?.name || travelEvent.destination?.address || 'Unknown'

        let title = ''
        let notes = ''

        if (event.eventType === 'flight') {
          title = `Flight: ${origin} → ${destination}`
          notes = `Airline: ${travelEvent.airline || 'N/A'}\nFlight: ${travelEvent.flightNumber || 'N/A'}\nConfirmation: ${travelEvent.confirmationNumber || 'N/A'}\nDeparture: ${travelEvent.departureTime || 'N/A'}\nArrival: ${travelEvent.arrivalTime || 'N/A'}`
        } else if (event.eventType === 'train') {
          title = `Train: ${origin} → ${destination}`
          notes = `Line: ${travelEvent.line || 'N/A'}\nTrain: ${travelEvent.trainNumber || 'N/A'}\nConfirmation: ${travelEvent.confirmationNumber || 'N/A'}\nDeparture: ${travelEvent.departureTime || 'N/A'}\nArrival: ${travelEvent.arrivalTime || 'N/A'}`
        } else if (event.eventType === 'driving_ev') {
          title = `Drive (EV): ${origin} → ${destination}`
          notes = `Vehicle: ${travelEvent.evVehicle?.model || 'N/A'}\nStarting Battery: ${travelEvent.evVehicle?.currentBattery || 'N/A'}%`
        } else {
          title = `Drive (Rental): ${origin} → ${destination}`
          notes = `Company: ${travelEvent.rentalCar?.company || 'N/A'}\nConfirmation: ${travelEvent.rentalCar?.confirmationNumber || 'N/A'}`
        }

        if (event.notes) {
          notes += `\n\n${event.notes}`
        }

        tasks.push({
          title,
          projectId,
          scheduledFor: scheduledTime,
          completed: false,
          context: 'personal',
          notes: notes.trim(),
        })
        break
      }

      case 'hotel':
      case 'airbnb':
      case 'family_stay': {
        const accommodationEvent = event as any
        const checkIn = new Date(`${accommodationEvent.checkIn}T15:00`) // Default 3pm check-in

        let title = ''
        if (event.eventType === 'hotel') {
          title = `Hotel: ${accommodationEvent.name}`
        } else if (event.eventType === 'airbnb') {
          title = `Airbnb: ${accommodationEvent.name}`
        } else {
          title = `Stay with: ${accommodationEvent.name}`
        }

        const location = accommodationEvent.location?.address || accommodationEvent.address || 'N/A'
        const notes = `Location: ${location}\nCheck-in: ${accommodationEvent.checkIn}\nCheck-out: ${accommodationEvent.checkOut}\nConfirmation: ${accommodationEvent.confirmationNumber || 'N/A'}\nPhone: ${accommodationEvent.phone || 'N/A'}\n\n${event.notes || ''}`.trim()

        tasks.push({
          title,
          projectId,
          scheduledFor: checkIn,
          completed: false,
          context: 'personal',
          notes,
        })
        break
      }

      case 'airport_parking':
      case 'rental_pickup':
      case 'rental_dropoff':
      case 'other': {
        const logisticEvent = event as any
        const location = logisticEvent.location?.address || 'N/A'
        const notes = `Location: ${location}\nConfirmation: ${logisticEvent.confirmationNumber || 'N/A'}\n\n${event.notes || ''}`.trim()

        tasks.push({
          title: logisticEvent.description || `${event.eventType.replace(/_/g, ' ')}`,
          projectId,
          scheduledFor: scheduledTime,
          completed: false,
          context: 'personal',
          notes,
        })
        break
      }
    }
  }

  return tasks
}

// ============================================================================
// Complete Trip Task Generation
// ============================================================================

/**
 * Generate all trip tasks at once
 * Handles simple trips (with routeResult), multi-segment trips, and timeline trips
 */
export function generateAllTripTasks(
  projectId: string,
  packingTemplate: PackingTemplate,
  routeResult: EVRouteResult | null,
  tripStartDate: string,
  tripMetadata?: TripMetadata,
  customPackingItems?: PackingItem[]
): GeneratedTripTasks {
  const packingTasks = generatePackingTasks(projectId, packingTemplate, tripStartDate, customPackingItems)

  // Unified timeline trip (new format)
  if (tripMetadata?.useUnifiedTimeline && tripMetadata.events) {
    const eventTasks = generateEventTasks(projectId, tripMetadata.events)

    return {
      packingTasks,
      travelTasks: eventTasks, // All events go into travelTasks for now
      chargingTasks: [],
      accommodationTasks: [],
      logisticsTasks: [],
    }
  }

  // Multi-segment trip (legacy format)
  if (tripMetadata?.isMultiSegment && tripMetadata.segments) {
    const travelTasks = generateSegmentTasks(projectId, tripMetadata.segments)
    const accommodationTasks = tripMetadata.accommodations
      ? generateAccommodationTasks(projectId, tripMetadata.accommodations)
      : []
    const logisticsTasks = tripMetadata.logistics
      ? generateLogisticsTasks(projectId, tripMetadata.logistics)
      : []

    return {
      packingTasks,
      travelTasks,
      chargingTasks: [], // EV charging handled per-segment in future enhancement
      accommodationTasks,
      logisticsTasks,
    }
  }

  // Simple trip (backwards compatible)
  const travelTasks = routeResult
    ? generateTravelTasks(projectId, routeResult, tripStartDate)
    : []

  const chargingTasks = routeResult
    ? generateChargingTasks(projectId, routeResult, tripStartDate)
    : []

  return {
    packingTasks,
    travelTasks,
    chargingTasks,
    accommodationTasks: [],
    logisticsTasks: [],
  }
}
