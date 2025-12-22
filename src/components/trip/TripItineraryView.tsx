/**
 * Trip Itinerary View - Reversed Two-Column Layout
 * Left: Packing list and notes (main content)
 * Right: Trip timeline (sidebar)
 */

import { useMemo, useState } from 'react'
import type { TripMetadata, TripEvent, DrivingEVEvent, ChargingStation, OtherEvent, PackingItem, PackingCategory } from '@/types/trip'
import type { Task } from '@/types/task'
import { EVChargingWaypointSelector } from './EVChargingWaypointSelector'
import { usePacking } from '@/hooks/usePacking'
import { Save } from 'lucide-react'

interface TripItineraryViewProps {
  tripMetadata: TripMetadata
  tasks: Task[]
  onToggleTask: (taskId: string) => void
  onUpdateTripMetadata?: (projectId: string, name: string, tripMetadata: TripMetadata) => Promise<void>
  projectId?: string
  projectName?: string
  onEditEvent?: (eventId: string) => void
}

export function TripItineraryView({
  tripMetadata,
  tasks,
  onToggleTask,
  onUpdateTripMetadata,
  projectId,
  projectName,
  onEditEvent
}: TripItineraryViewProps) {
  const [selectedEventForCharging, setSelectedEventForCharging] = useState<string | null>(null)
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const { createTemplate } = usePacking()

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

  // Format date range compactly
  const formatDateRange = (startStr: string, endStr: string) => {
    const start = new Date(startStr)
    const end = new Date(endStr)

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const year = start.getFullYear()

    // Same month: "Jan 1-3, 2025"
    if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
      return `${startMonth} ${start.getDate()}-${end.getDate()}, ${year}`
    }

    // Different months: "Dec 30 - Jan 2, 2025"
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${year}`
  }

  const completedPackingCount = packingTasks.filter(t => t.completed).length
  const totalPackingCount = packingTasks.length

  // Calculate trip stats for dashboard
  const tripStats = useMemo(() => {
    const events = tripMetadata.events || []
    const flights = events.filter(e => e.eventType === 'flight').length
    const drives = events.filter(e => e.eventType === 'driving_ev' || e.eventType === 'driving_rental').length
    const accommodations = events.filter(e =>
      e.eventType === 'hotel' || e.eventType === 'airbnb' || e.eventType === 'family_stay'
    ).length
    const chargingStops = events.filter(e =>
      e.eventType === 'other' && (e as any).description?.includes('⚡')
    ).length

    return { flights, drives, accommodations, chargingStops, total: events.length }
  }, [tripMetadata.events])

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
    const chargingEvents: OtherEvent[] = waypoints.map((station) => ({
      id: crypto.randomUUID(),
      eventType: 'other' as const,
      description: `⚡ Charge at ${station.name}`,
      location: station.location,
      date: drivingEvent.date,
      time: drivingEvent.time || '08:00',
      notes: `${station.network} • ${station.powerKW}kW\n${station.connectorTypes.join(', ')}`
    }))

    // Insert charging events into timeline after the driving event
    const updatedEvents: TripEvent[] = []
    for (const event of tripMetadata.events) {
      updatedEvents.push(event)
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

  // Convert packing tasks to PackingItem format
  const convertTasksToPackingItems = (): PackingItem[] => {
    return packingTasks.map(task => {
      const title = task.title?.toLowerCase() || ''
      let category: PackingCategory = 'other'

      // Infer category from task title
      if (title.includes('toothbrush') || title.includes('soap') || title.includes('shampoo') ||
          title.includes('deodorant') || title.includes('razor') || title.includes('toiletries')) {
        category = 'toiletries'
      } else if (title.includes('underwear') || title.includes('socks') || title.includes('shirt') ||
                 title.includes('pants') || title.includes('jacket') || title.includes('clothes') || title.includes('outfit')) {
        category = 'clothing'
      } else if (title.includes('charger') || title.includes('phone') || title.includes('laptop') ||
                 title.includes('cable') || title.includes('electronics') || title.includes('headphone')) {
        category = 'electronics'
      } else if (title.includes('passport') || title.includes('license') || title.includes('ticket') ||
                 title.includes('documents') || title.includes('id')) {
        category = 'documents'
      } else if (title.includes('snack') || title.includes('water') || title.includes('food') || title.includes('drink')) {
        category = 'food_drinks'
      }

      // Check if essential based on task notes
      const isEssential = task.notes?.toLowerCase().includes('essential') || false

      return {
        name: task.title?.replace(/^Pack\s+/i, '') || '',
        category,
        essential: isEssential,
      }
    })
  }

  // Handle saving packing list as template
  const handleSaveAsTemplate = async (templateName: string) => {
    try {
      const items = convertTasksToPackingItems()
      await createTemplate(templateName, items)
      setShowSaveTemplateModal(false)
      alert('Packing template saved successfully!')
    } catch (err) {
      console.error('Failed to save template:', err)
      alert('Failed to save template')
    }
  }

  return (
    <div className="w-full">
      {/* Compact Header */}
      <div className="mb-6 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border border-amber-100/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/60 backdrop-blur-sm rounded-full mb-2">
              <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Trip</span>
            </div>

            <h2 className="font-display text-xl font-bold text-neutral-900 leading-tight mb-1">
              {tripMetadata.origin.name || tripMetadata.origin.address}
              <span className="text-amber-600 mx-2">→</span>
              {tripMetadata.destination.name || tripMetadata.destination.address}
            </h2>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-xs text-neutral-500 mb-1">Dates</div>
            <div className="text-sm font-semibold text-neutral-900 whitespace-nowrap">
              {formatDateRange(tripMetadata.startDate, tripMetadata.endDate)}
            </div>
          </div>
        </div>

        {/* Trip Stats - Inline */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          {tripStats.flights > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-blue-600">✈️</span>
              <span className="font-medium text-neutral-700">{tripStats.flights} flight{tripStats.flights !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.drives > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-green-600">🚗</span>
              <span className="font-medium text-neutral-700">{tripStats.drives} drive{tripStats.drives !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.accommodations > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-rose-600">🏨</span>
              <span className="font-medium text-neutral-700">{tripStats.accommodations} stay{tripStats.accommodations !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.chargingStops > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-600">⚡</span>
              <span className="font-medium text-neutral-700">{tripStats.chargingStops} charge{tripStats.chargingStops !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-Column Layout: Itinerary (Left) + Packing (Right) */}
      <div className="flex gap-12 lg:gap-16">
        {/* LEFT SIDEBAR: Trip Itinerary */}
        <aside className="w-80 flex-shrink-0 hidden md:block">
          <div className="sticky top-8">
            <h2 className="font-display text-lg font-medium text-neutral-800 mb-4">Itinerary</h2>

            {tripMetadata.useUnifiedTimeline && tripMetadata.events && tripMetadata.events.length > 0 ? (
              <div className="space-y-3">
                {tripMetadata.events.map((event) => (
                  <CompactEventCard
                    key={event.id}
                    event={event}
                    onRequestCharging={
                      event.eventType === 'driving_ev'
                        ? () => setSelectedEventForCharging(event.id)
                        : undefined
                    }
                    onClick={onEditEvent ? () => onEditEvent(event.id) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 mb-3">
                  <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <p className="text-neutral-500 text-sm font-medium">No events yet</p>
                <p className="text-xs text-neutral-400 mt-1">Add events to build your trip timeline</p>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Packing List + Notes (Main Content) */}
        <div className="flex-1 min-w-0">
          {/* Packing List */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-medium text-neutral-800">Packing List</h2>
              {packingTasks.length > 0 && (
                <button
                  onClick={() => setShowSaveTemplateModal(true)}
                  className="btn bg-white hover:bg-gray-100 text-gray-700 text-sm flex items-center gap-1.5 shadow-sm"
                >
                  <Save size={16} />
                  Save as Template
                </button>
              )}
            </div>

            {totalPackingCount > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                      style={{ width: `${(completedPackingCount / totalPackingCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">
                    {completedPackingCount}/{totalPackingCount}
                  </span>
                </div>
                <div className="text-xs text-emerald-600 font-medium">
                  {completedPackingCount === totalPackingCount
                    ? '✓ All packed!'
                    : `${totalPackingCount - completedPackingCount} items remaining`}
                </div>
              </div>
            )}

            {packingTasks.length > 0 ? (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                {Array.from(packingByCategory.entries()).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                      {category}
                    </h3>
                    <div className="space-y-0">
                      {items.map((task) => (
                        <label
                          key={task.id}
                          className="flex items-center gap-2 py-1 cursor-pointer group hover:bg-neutral-50 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => onToggleTask(task.id)}
                            className="w-3.5 h-3.5 rounded border-neutral-300 text-emerald-600
                                     focus:ring-1 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
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
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-neutral-400 text-sm bg-neutral-50 rounded-xl border border-neutral-200">
                No packing items yet
              </div>
            )}
          </div>

          {/* Notes Section - Placeholder for now */}
          <div className="pt-8 border-t border-neutral-200/60">
            <h2 className="font-display text-lg font-medium text-neutral-800 mb-3">Trip Notes</h2>
            <div className="text-sm text-neutral-500 italic">
              Notes will appear here
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

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <SaveTemplateModal
          onSave={handleSaveAsTemplate}
          onClose={() => setShowSaveTemplateModal(false)}
        />
      )}
    </div>
  )
}

// Save Template Modal Component
interface SaveTemplateModalProps {
  onSave: (name: string) => void
  onClose: () => void
}

function SaveTemplateModal({ onSave, onClose }: SaveTemplateModalProps) {
  const [templateName, setTemplateName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (templateName.trim()) {
      onSave(templateName.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-xl font-display mb-4">Save as Packing Template</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="input-base w-full text-lg"
              placeholder="e.g., Weekend Beach Trip"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!templateName.trim()}
              className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Compact Event Card Component
interface CompactEventCardProps {
  event: TripEvent
  onRequestCharging?: () => void
  onClick?: () => void
}

function CompactEventCard({ event, onRequestCharging, onClick }: CompactEventCardProps) {
  const formatDateTime = (dateStr: string, time?: string) => {
    const date = new Date(`${dateStr}T${time || '08:00'}`)
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: time ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null
    }
  }

  const { date, time } = formatDateTime(event.date, event.time)

  // Get event-specific details
  const getEventDetails = () => {
    switch (event.eventType) {
      case 'flight': {
        const e = event as any
        return {
          icon: '✈️',
          title: e.airline && e.flightNumber ? `${e.airline} ${e.flightNumber}` : 'Flight',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.confirmationNumber || null,
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          accent: 'text-blue-700'
        }
      }
      case 'train': {
        const e = event as any
        return {
          icon: '🚂',
          title: e.line || 'Train',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.trainNumber ? `#${e.trainNumber}` : null,
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          accent: 'text-purple-700'
        }
      }
      case 'driving_ev': {
        const e = event as any
        return {
          icon: '⚡',
          title: 'Drive (EV)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.evVehicle ? `${e.evVehicle.currentBattery}% battery` : null,
          bg: 'bg-green-50',
          border: 'border-green-200',
          accent: 'text-green-700',
          hasCharging: true
        }
      }
      case 'driving_rental': {
        const e = event as any
        return {
          icon: '🚗',
          title: 'Drive (Rental)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.rentalCar?.company || null,
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          accent: 'text-orange-700'
        }
      }
      case 'hotel':
      case 'airbnb':
      case 'family_stay': {
        const e = event as any
        const icon = event.eventType === 'hotel' ? '🏨' : event.eventType === 'airbnb' ? '🏠' : '👨‍👩‍👧'
        return {
          icon,
          title: e.name,
          subtitle: e.location?.name || e.location?.address || e.address,
          detail: `Check-in ${e.checkIn}`,
          bg: 'bg-rose-50',
          border: 'border-rose-200',
          accent: 'text-rose-700'
        }
      }
      default: {
        const e = event as any
        return {
          icon: '📍',
          title: e.description || event.eventType.replace(/_/g, ' '),
          subtitle: e.location?.name || e.location?.address,
          detail: e.confirmationNumber || null,
          bg: 'bg-neutral-50',
          border: 'border-neutral-200',
          accent: 'text-neutral-700'
        }
      }
    }
  }

  const details = getEventDetails()

  return (
    <div
      className={`${details.bg} border ${details.border} rounded-xl p-3 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''
      } transition-all duration-200 group`}
      onClick={onClick}
    >
      {/* Header: Icon + Date/Time */}
      <div className="flex items-start justify-between mb-2">
        <div className="text-2xl leading-none">{details.icon}</div>
        <div className="text-right">
          <div className="text-xs font-bold text-neutral-900">{date}</div>
          {time && <div className="text-xs text-neutral-500">{time}</div>}
        </div>
      </div>

      {/* Title */}
      <h4 className={`font-semibold ${details.accent} text-sm leading-tight mb-1`}>
        {details.title}
      </h4>

      {/* Subtitle */}
      {details.subtitle && (
        <p className="text-xs text-neutral-600 leading-snug mb-1 line-clamp-2">
          {details.subtitle}
        </p>
      )}

      {/* Detail */}
      {details.detail && (
        <div className="text-xs text-neutral-500 font-medium">
          {details.detail}
        </div>
      )}

      {/* Notes */}
      {event.notes && (
        <div className="text-xs text-neutral-600 mt-2 p-2 bg-white/60 rounded border border-neutral-200/50 line-clamp-2">
          {event.notes}
        </div>
      )}

      {/* EV Charging Button */}
      {details.hasCharging && onRequestCharging && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRequestCharging()
          }}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Plan Charging
        </button>
      )}
    </div>
  )
}
