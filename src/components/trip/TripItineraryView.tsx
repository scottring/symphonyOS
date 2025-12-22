/**
 * Trip Itinerary View - Editorial Travel Magazine Aesthetic
 * Wide, spacious layout with EV charging waypoint selection
 */

import { useMemo, useState } from 'react'
import type { TripMetadata, TripEvent, DrivingEVEvent, ChargingStation, OtherEvent } from '@/types/trip'
import type { Task } from '@/types/task'
import { EVChargingWaypointSelector } from './EVChargingWaypointSelector'

interface TripItineraryViewProps {
  tripMetadata: TripMetadata
  tasks: Task[]
  onToggleTask: (taskId: string) => void
  onUpdateTripMetadata?: (projectId: string, name: string, tripMetadata: TripMetadata) => Promise<void>
  projectId?: string
  projectName?: string
}

export function TripItineraryView({
  tripMetadata,
  tasks,
  onToggleTask,
  onUpdateTripMetadata,
  projectId,
  projectName
}: TripItineraryViewProps) {
  const [selectedEventForCharging, setSelectedEventForCharging] = useState<string | null>(null)

  // Separate packing tasks from event tasks
  const packingTasks = useMemo(() => {
    const packing: Task[] = []

    for (const task of tasks) {
      if (task.title?.toLowerCase().includes('pack')) {
        packing.push(task)
      }
    }

    return packing
  }, [tasks])

  // Group packing tasks by category
  const packingByCategory = useMemo(() => {
    const categories = new Map<string, Task[]>()

    for (const task of packingTasks) {
      const title = task.title?.toLowerCase() || ''

      let category = 'Other'
      if (title.includes('toothbrush') || title.includes('soap') || title.includes('shampoo') ||
          title.includes('deodorant') || title.includes('razor') || title.includes('toiletries')) {
        category = 'Toiletries'
      } else if (title.includes('underwear') || title.includes('socks') || title.includes('shirt') ||
                 title.includes('pants') || title.includes('jacket') || title.includes('clothes')) {
        category = 'Clothing'
      } else if (title.includes('charger') || title.includes('phone') || title.includes('laptop') ||
                 title.includes('cable') || title.includes('electronics')) {
        category = 'Electronics'
      } else if (title.includes('passport') || title.includes('license') || title.includes('ticket') ||
                 title.includes('documents')) {
        category = 'Documents'
      } else if (title.includes('snack') || title.includes('water') || title.includes('food')) {
        category = 'Food & Drinks'
      }

      if (!categories.has(category)) {
        categories.set(category, [])
      }
      categories.get(category)!.push(task)
    }

    return categories
  }, [packingTasks])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const completedPackingCount = packingTasks.filter(t => t.completed).length
  const totalPackingCount = packingTasks.length

  // Handle adding charging waypoints to timeline
  const handleSelectWaypoints = async (waypoints: ChargingStation[], drivingEventId: string) => {
    if (!onUpdateTripMetadata || !projectId || !projectName || !tripMetadata.events) {
      console.warn('Missing required props to update trip metadata')
      return
    }

    // Find the driving_ev event
    const drivingEvent = tripMetadata.events.find(e => e.id === drivingEventId) as DrivingEVEvent | undefined
    if (!drivingEvent) {
      console.error('Could not find driving event')
      return
    }

    // Convert charging stations to OtherEvent trip events
    const chargingEvents: OtherEvent[] = waypoints.map((station, index) => ({
      id: crypto.randomUUID(),
      eventType: 'other' as const,
      description: `⚡ Charge at ${station.name}`,
      location: station.location,
      date: drivingEvent.date, // Same day as the drive
      // Estimate time: space charging stops throughout the day
      time: drivingEvent.time || '08:00',
      notes: `${station.network} • ${station.powerKW}kW\n${station.connectorTypes.join(', ')}`
    }))

    // Insert charging events into timeline after the driving event
    const updatedEvents: TripEvent[] = []
    for (const event of tripMetadata.events) {
      updatedEvents.push(event)
      // After the driving_ev event, add all charging events
      if (event.id === drivingEventId) {
        updatedEvents.push(...chargingEvents)
      }
    }

    // Update trip metadata
    const updatedTripMetadata: TripMetadata = {
      ...tripMetadata,
      events: updatedEvents
    }

    // Call the update handler
    await onUpdateTripMetadata(projectId, projectName, updatedTripMetadata)

    // Close the modal
    setSelectedEventForCharging(null)
  }

  return (
    <div className="w-full max-w-none">
      {/* Hero Header - Full Width */}
      <div className="mb-12 relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border border-amber-100/50">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        <div className="relative p-10">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full mb-4">
                <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Trip Itinerary</span>
              </div>

              <h1 className="font-display text-5xl font-bold text-neutral-900 mb-3 leading-tight">
                {tripMetadata.origin.name || tripMetadata.origin.address}
                <span className="text-amber-600 mx-4">→</span>
                {tripMetadata.destination.name || tripMetadata.destination.address}
              </h1>

              <div className="flex items-center gap-6 text-neutral-600">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">{formatDate(tripMetadata.startDate)} – {formatDate(tripMetadata.endDate)}</span>
                </div>
                {tripMetadata.events && (
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="font-medium">{tripMetadata.events.length} events</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-12">
        {/* LEFT: Timeline */}
        <div>
          <h2 className="font-display text-3xl font-bold text-neutral-900 mb-6 flex items-center gap-3">
            <div className="w-1 h-8 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
            Your Journey
          </h2>

          {tripMetadata.useUnifiedTimeline && tripMetadata.events && tripMetadata.events.length > 0 ? (
            <div className="space-y-4">
              {tripMetadata.events.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isLast={index === tripMetadata.events!.length - 1}
                  onRequestCharging={
                    event.eventType === 'driving_ev'
                      ? () => setSelectedEventForCharging(event.id)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-neutral-100 mb-4">
                <svg className="w-10 h-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <p className="text-neutral-500 text-lg">No events yet</p>
              <p className="text-sm text-neutral-400 mt-2">Add events to build your trip timeline</p>
            </div>
          )}
        </div>

        {/* RIGHT: Packing List */}
        <div>
          <div className="sticky top-8">
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 border-b border-emerald-100">
                <h2 className="font-display text-2xl font-bold text-neutral-900 mb-2">Packing List</h2>
                {totalPackingCount > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-emerald-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${(completedPackingCount / totalPackingCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                      {completedPackingCount}/{totalPackingCount}
                    </span>
                  </div>
                )}
              </div>

              <div className="max-h-[600px] overflow-y-auto p-6 space-y-5">
                {packingTasks.length > 0 ? (
                  Array.from(packingByCategory.entries()).map(([category, items]) => (
                    <div key={category}>
                      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 px-1">
                        {category}
                      </h3>
                      <div className="space-y-0.5">
                        {items.map((task) => (
                          <label
                            key={task.id}
                            className="flex items-center gap-2.5 py-1 px-1 cursor-pointer group hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => onToggleTask(task.id)}
                              className="w-4 h-4 rounded border-neutral-300 text-emerald-600
                                       focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <span className={`text-sm flex-1 transition-all ${
                              task.completed
                                ? 'text-neutral-400 line-through'
                                : 'text-neutral-700 group-hover:text-neutral-900'
                            }`}>
                              {task.title?.replace(/^Pack\s+/i, '')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-neutral-400 text-sm">
                    No packing items yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EV Charging Waypoint Selector Modal */}
      {selectedEventForCharging && tripMetadata.events && (
        <EVChargingWaypointSelector
          event={tripMetadata.events.find(e => e.id === selectedEventForCharging) as DrivingEVEvent}
          onClose={() => setSelectedEventForCharging(null)}
          onSelectWaypoints={(waypoints) => handleSelectWaypoints(waypoints, selectedEventForCharging)}
        />
      )}
    </div>
  )
}

// Event Card Component
interface EventCardProps {
  event: TripEvent
  isLast: boolean
  onRequestCharging?: () => void
}

function EventCard({ event, isLast, onRequestCharging }: EventCardProps) {
  const formatDateTime = (dateStr: string, time?: string) => {
    const date = new Date(`${dateStr}T${time || '08:00'}`)
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: time ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
    }
  }

  const { date, time } = formatDateTime(event.date, event.time)

  // Get event-specific details
  const getEventDetails = () => {
    switch (event.eventType) {
      case 'flight': {
        const e = event as any
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ),
          title: e.airline && e.flightNumber ? `${e.airline} ${e.flightNumber}` : 'Flight',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          details: e.confirmationNumber ? `Confirmation: ${e.confirmationNumber}` : null,
          gradient: 'from-blue-500 to-cyan-500',
          bgLight: 'bg-blue-50',
          textDark: 'text-blue-900'
        }
      }
      case 'train': {
        const e = event as any
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
          title: e.line || 'Train',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          details: e.trainNumber ? `Train ${e.trainNumber}` : null,
          gradient: 'from-purple-500 to-pink-500',
          bgLight: 'bg-purple-50',
          textDark: 'text-purple-900'
        }
      }
      case 'driving_ev': {
        const e = event as any
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          ),
          title: 'Drive (EV)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          details: e.evVehicle ? `${e.evVehicle.model} • ${e.evVehicle.currentBattery}% battery` : null,
          gradient: 'from-green-500 to-emerald-500',
          bgLight: 'bg-green-50',
          textDark: 'text-green-900',
          hasCharging: true
        }
      }
      case 'driving_rental': {
        const e = event as any
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          ),
          title: 'Drive (Rental)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          details: e.rentalCar?.company || null,
          gradient: 'from-orange-500 to-amber-500',
          bgLight: 'bg-orange-50',
          textDark: 'text-orange-900'
        }
      }
      case 'hotel':
      case 'airbnb':
      case 'family_stay': {
        const e = event as any
        const typeLabel = event.eventType === 'hotel' ? 'Hotel' : event.eventType === 'airbnb' ? 'Airbnb' : 'Family Stay'
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
          title: e.name,
          subtitle: e.location?.name || e.location?.address || e.address,
          details: `${typeLabel} • Check-in ${e.checkIn}`,
          gradient: 'from-rose-500 to-pink-500',
          bgLight: 'bg-rose-50',
          textDark: 'text-rose-900'
        }
      }
      default: {
        const e = event as any
        return {
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          ),
          title: e.description || event.eventType.replace(/_/g, ' '),
          subtitle: e.location?.name || e.location?.address,
          details: e.confirmationNumber ? `Confirmation: ${e.confirmationNumber}` : null,
          gradient: 'from-neutral-500 to-neutral-600',
          bgLight: 'bg-neutral-50',
          textDark: 'text-neutral-900'
        }
      }
    }
  }

  const details = getEventDetails()

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-7 top-16 bottom-0 w-px bg-gradient-to-b from-neutral-200 to-transparent" />
      )}

      <div className={`relative ${details.bgLight} rounded-2xl p-5 border border-neutral-200/50 hover:shadow-lg transition-all duration-300 group`}>
        <div className="flex gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${details.gradient} text-white flex items-center justify-center shadow-lg`}>
            {details.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-1">
              <h3 className={`font-semibold ${details.textDark} text-lg leading-tight`}>
                {details.title}
              </h3>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-neutral-900">{date}</div>
                {time && <div className="text-xs text-neutral-500 mt-0.5">{time}</div>}
              </div>
            </div>

            {details.subtitle && (
              <p className="text-sm text-neutral-600 mb-2 leading-relaxed">
                {details.subtitle}
              </p>
            )}

            {details.details && (
              <div className="text-xs text-neutral-500 mt-2 font-medium">
                {details.details}
              </div>
            )}

            {event.notes && (
              <div className="text-xs text-neutral-600 mt-3 p-3 bg-white/60 rounded-lg border border-neutral-200/50">
                {event.notes}
              </div>
            )}

            {/* EV Charging Button */}
            {details.hasCharging && onRequestCharging && (
              <button
                onClick={onRequestCharging}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Plan Charging Stops
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
