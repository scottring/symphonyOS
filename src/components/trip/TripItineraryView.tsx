/**
 * Trip Itinerary View - Reversed Two-Column Layout
 * Left: Packing list and notes (main content)
 * Right: Trip timeline (sidebar)
 */

import { useMemo, useState } from 'react'
import type { TripMetadata, TripEvent, DrivingEVEvent, ChargingStation, OtherEvent, PackingItem, PackingCategory, HotelEvent, AirbnbEvent, FamilyStayEvent, FlightEvent, TrainEvent, DrivingRentalEvent } from '@/types/trip'
import type { Task } from '@/types/task'
import { EVRoutePlanner } from './EVRoutePlanner'
import { usePacking } from '@/hooks/usePacking'
import { Save, Plane, Car, Hotel, Zap, Train, Home, Users, MapPin, Check } from 'lucide-react'

interface TripItineraryViewProps {
  tripMetadata: TripMetadata
  tasks: Task[]
  onToggleTask: (taskId: string) => void
  onUpdateTripMetadata?: (projectId: string, name: string, tripMetadata: TripMetadata) => Promise<void>
  projectId?: string
  projectName?: string
  onEditEvent?: (eventId: string) => void
  onAddTask?: (task: { title: string; projectId?: string }) => Promise<Task | null>
  onDeleteTask?: (taskId: string) => void
}

export function TripItineraryView({
  tripMetadata,
  tasks,
  onToggleTask,
  onUpdateTripMetadata,
  projectId,
  projectName,
  onEditEvent,
  onAddTask,
  onDeleteTask
}: TripItineraryViewProps) {
  const [selectedEventForCharging, setSelectedEventForCharging] = useState<string | null>(null)
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [showAIPackingModal, setShowAIPackingModal] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const { createTemplate, templates } = usePacking()

  // Handler to add new packing item
  const handleAddPackingItem = async () => {
    if (!newItemText.trim() || !onAddTask || !projectId) return

    // Prefix with "Pack" so it gets categorized as packing
    const title = `Pack ${newItemText.trim()}`
    await onAddTask({ title, projectId })
    setNewItemText('')
  }

  // Handler to load items from template
  const handleLoadTemplate = async (templateId: string) => {
    if (!onAddTask || !projectId) return

    const template = templates.find(t => t.id === templateId)
    if (!template || !template.items) return

    // Add all items from template
    for (const item of template.items) {
      await onAddTask({
        title: `Pack ${item.name}`,
        projectId
      })
    }
  }

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

  // Calculate actual trip date range from events
  const calculateTripDates = () => {
    if (!tripMetadata.events || tripMetadata.events.length === 0) {
      // Fallback to metadata dates - add time to avoid timezone issues
      const start = new Date(tripMetadata.startDate + 'T12:00:00')
      const end = new Date(tripMetadata.endDate + 'T12:00:00')
      return { start, end }
    }

    // Collect all date strings
    const dateStrings: string[] = []

    for (const event of tripMetadata.events) {
      dateStrings.push(event.date)

      // For accommodations, also consider checkout date as it may be the actual end date
      if (event.eventType === 'hotel' || event.eventType === 'airbnb' || event.eventType === 'family_stay') {
        const accommodationEvent = event as HotelEvent | AirbnbEvent | FamilyStayEvent
        dateStrings.push(accommodationEvent.checkOut)
      }
    }

    // Also include metadata end date in case it's later than all events
    dateStrings.push(tripMetadata.endDate)

    // Sort date strings lexicographically (works for ISO dates)
    dateStrings.sort()
    const startDateStr = dateStrings[0]
    const endDateStr = dateStrings[dateStrings.length - 1]

    // Add time component to avoid timezone shifting
    const start = new Date(startDateStr + 'T12:00:00')
    const end = new Date(endDateStr + 'T12:00:00')

    return { start, end }
  }

  // Format date range compactly
  const formatDateRange = (start: Date, end: Date) => {
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

  // Helper to extract city name from location (parsing address for city)
  const extractCityFromLocation = (location: { name: string; address: string }): string => {
    // Street keywords that indicate this is a street address, not a city name
    const streetKeywords = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr',
                           'boulevard', 'blvd', 'lane', 'ln', 'way', 'court', 'ct',
                           'place', 'pl', 'parkway', 'pkwy', 'circle', 'cir']

    const lowerName = (location.name || '').toLowerCase()
    const hasStreetKeyword = streetKeywords.some(kw => lowerName.includes(kw))

    // Parse from address - most reliable
    const address = location.address || location.name

    if (address && address.includes(',')) {
      const parts = address.split(',').map(p => p.trim())

      // Find the city part (skip street addresses, zips, state codes)
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const partLower = part.toLowerCase()

        // Skip if contains street keywords
        if (streetKeywords.some(kw => partLower.includes(kw))) continue

        // Skip if has numbers
        if (/\d/.test(part)) continue

        // Skip if is state code (2 capital letters)
        if (/^[A-Z]{2}$/.test(part)) continue

        // This should be the city
        if (part.length > 2) {
          return part
        }
      }
    }

    // If name doesn't have street keywords and no numbers, might be city
    if (location.name && !hasStreetKeyword && !/\d/.test(location.name)) {
      const isHotel = lowerName.includes('hotel') || lowerName.includes('inn') ||
                      lowerName.includes('resort') || lowerName.includes('motel')

      if (!isHotel && location.name.length < 40) {
        return location.name
      }
    }

    // Last resort
    return location.name || 'Unknown'
  }

  // Generate meaningful trip title from key destinations
  const generateTripTitle = () => {
    if (!tripMetadata.events || tripMetadata.events.length === 0) {
      // Fallback to origin → destination
      return `${tripMetadata.origin.name || tripMetadata.origin.address} → ${tripMetadata.destination.name || tripMetadata.destination.address}`
    }

    // Extract unique overnight stay locations (accommodations)
    const accommodationEvents = tripMetadata.events.filter(e =>
      e.eventType === 'hotel' || e.eventType === 'airbnb' || e.eventType === 'family_stay'
    ) as (HotelEvent | AirbnbEvent | FamilyStayEvent)[]

    if (accommodationEvents.length === 0) {
      // No accommodations - try to extract destinations from transportation events
      const transportEvents = tripMetadata.events.filter(e =>
        e.eventType === 'flight' || e.eventType === 'train' ||
        e.eventType === 'driving_ev' || e.eventType === 'driving_rental'
      ) as (FlightEvent | TrainEvent | DrivingEVEvent | DrivingRentalEvent)[]

      if (transportEvents.length > 0) {
        // Get origin from first event and destination from last event
        const firstEvent = transportEvents[0]
        const lastEvent = transportEvents[transportEvents.length - 1]
        const origin = extractCityFromLocation(firstEvent.origin)
        const destination = extractCityFromLocation(lastEvent.destination)

        if (origin !== destination) {
          return `${origin} → ${destination}`
        }
      }

      // Final fallback
      return `${tripMetadata.origin.name || tripMetadata.origin.address} → ${tripMetadata.destination.name || tripMetadata.destination.address}`
    }

    // Build title from accommodation city names
    const uniqueLocations: string[] = []
    const seenLocations = new Set<string>()

    // Add origin city
    const origin = extractCityFromLocation(tripMetadata.origin)
    uniqueLocations.push(origin)
    seenLocations.add(origin.toLowerCase())

    // Add each unique accommodation city
    for (const event of accommodationEvents) {
      const city = extractCityFromLocation(event.location)
      const cityKey = city.toLowerCase()

      if (!seenLocations.has(cityKey) && cityKey !== origin.toLowerCase()) {
        uniqueLocations.push(city)
        seenLocations.add(cityKey)
      }
    }

    // If we have multiple stops, show the route
    if (uniqueLocations.length > 1) {
      return uniqueLocations.join(' → ')
    }

    // Single location - just show it
    return uniqueLocations[0]
  }

  const tripDates = calculateTripDates()
  const tripTitle = generateTripTitle()

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
      e.eventType === 'other' && ((e as any).description?.includes('EV Charge') || (e as any).description?.includes('⚡'))
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
      description: `EV Charge at ${station.name}`,
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
              {tripTitle}
            </h2>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-xs text-neutral-500 mb-1">Dates</div>
            <div className="text-sm font-semibold text-neutral-900 whitespace-nowrap">
              {formatDateRange(tripDates.start, tripDates.end)}
            </div>
          </div>
        </div>

        {/* Trip Stats - Inline */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          {tripStats.flights > 0 && (
            <div className="flex items-center gap-1.5">
              <Plane className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-neutral-700">{tripStats.flights} flight{tripStats.flights !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.drives > 0 && (
            <div className="flex items-center gap-1.5">
              <Car className="w-4 h-4 text-green-600" />
              <span className="font-medium text-neutral-700">{tripStats.drives} drive{tripStats.drives !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.accommodations > 0 && (
            <div className="flex items-center gap-1.5">
              <Hotel className="w-4 h-4 text-rose-600" />
              <span className="font-medium text-neutral-700">{tripStats.accommodations} stay{tripStats.accommodations !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.chargingStops > 0 && (
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-yellow-600" />
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-medium text-neutral-800">Itinerary</h2>
              {onEditEvent && (
                <button
                  onClick={() => onEditEvent('')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

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
              <div className="flex items-center gap-2">
                {/* Load from Template */}
                {templates.length > 0 && onAddTask && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleLoadTemplate(e.target.value)
                        e.target.value = '' // Reset selection
                      }
                    }}
                    className="btn bg-white hover:bg-gray-100 text-gray-700 text-sm shadow-sm pr-8"
                  >
                    <option value="">Load Template...</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* AI Generation */}
                {onAddTask && (
                  <button
                    onClick={() => setShowAIPackingModal(true)}
                    className="btn bg-primary-600 hover:bg-primary-700 text-white text-sm flex items-center gap-1.5 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Generate
                  </button>
                )}

                {/* Save as Template */}
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
                <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  {completedPackingCount === totalPackingCount ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>All packed!</span>
                    </>
                  ) : (
                    <span>{totalPackingCount - completedPackingCount} items remaining</span>
                  )}
                </div>
              </div>
            )}

            {/* Add Item Input */}
            {onAddTask && (
              <div className="mb-6 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddPackingItem()
                      }
                    }}
                    placeholder="Add packing item..."
                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddPackingItem}
                    disabled={!newItemText.trim()}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Add
                  </button>
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
                        <div
                          key={task.id}
                          className="flex items-center gap-2 py-1 group hover:bg-neutral-50 rounded transition-colors"
                        >
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => onToggleTask(task.id)}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-emerald-600
                                       focus:ring-1 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <span className={`text-sm transition-all ${
                              task.completed
                                ? 'text-neutral-400 line-through'
                                : 'text-neutral-700 group-hover:text-neutral-900'
                            }`}>
                              {task.title?.replace(/^Pack\s+/i, '')}
                            </span>
                          </label>
                          {onDeleteTask && (
                            <button
                              onClick={() => onDeleteTask(task.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all text-red-600"
                              title="Delete item"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-neutral-400 text-sm bg-neutral-50 rounded-xl border border-neutral-200">
                {onAddTask ? 'Add items above to start your packing list' : 'No packing items yet'}
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

      {/* EV Route Planner Modal */}
      {selectedEventForCharging && tripMetadata.events && (
        <EVRoutePlanner
          event={tripMetadata.events.find(e => e.id === selectedEventForCharging) as DrivingEVEvent}
          onClose={() => setSelectedEventForCharging(null)}
          onSelectWaypoints={(waypoints) => handleSelectWaypoints(waypoints, selectedEventForCharging)}
        />
      )}

      {/* AI Packing Generation Modal */}
      {showAIPackingModal && onAddTask && projectId && (
        <AIPackingModal
          tripMetadata={tripMetadata}
          onGenerate={async (items) => {
            for (const item of items) {
              await onAddTask({ title: `Pack ${item}`, projectId })
            }
            setShowAIPackingModal(false)
          }}
          onClose={() => setShowAIPackingModal(false)}
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

// AI Packing Modal Component
interface AIPackingModalProps {
  tripMetadata: TripMetadata
  onGenerate: (items: string[]) => Promise<void>
  onClose: () => void
}

function AIPackingModal({ tripMetadata, onGenerate, onClose }: AIPackingModalProps) {
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [childAges, setChildAges] = useState('')
  const [specialNeeds, setSpecialNeeds] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // Calculate trip duration
  const duration = useMemo(() => {
    const start = new Date(tripMetadata.startDate)
    const end = new Date(tripMetadata.endDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }, [tripMetadata])

  const handleGenerate = async () => {
    setIsGenerating(true)

    try {
      // TODO: Replace with actual AI API call
      // Build prompt for future AI integration:
      // const destination = tripMetadata.destination?.name || 'destination'
      // const prompt = `Generate a comprehensive packing list for a ${duration}-day trip to ${destination}...`

      // For now, generate a basic list based on the inputs
      const items = generateBasicPackingList(adults, children, duration, specialNeeds)
      await onGenerate(items)
    } catch (error) {
      console.error('Error generating packing list:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  // Temporary fallback generator (replace with AI API call)
  const generateBasicPackingList = (adults: number, children: number, duration: number, specialNeeds: string): string[] => {
    const items: string[] = []

    // Clothing (per person, per day)
    const clothingDays = Math.min(duration + 1, 7) // Max 7 days of clothes
    items.push(`Underwear (${clothingDays * (adults + children)} sets)`)
    items.push(`Socks (${clothingDays * (adults + children)} pairs)`)
    items.push(`Shirts (${clothingDays * (adults + children)})`)
    items.push(`Pants/Shorts (${Math.ceil(clothingDays / 2) * (adults + children)})`)
    items.push('Jacket or Sweater')
    items.push('Pajamas')

    // Toiletries
    items.push('Toothbrush & Toothpaste')
    items.push('Shampoo & Conditioner')
    items.push('Soap/Body Wash')
    items.push('Deodorant')
    items.push('Sunscreen')
    items.push('Medications')
    items.push('First Aid Kit')

    // Electronics
    items.push('Phone Charger')
    items.push('Camera')
    items.push('Power Bank')
    items.push('Headphones')

    // Documents
    items.push('ID/Passport')
    items.push('Travel Insurance')
    items.push('Tickets/Confirmations')

    // Kids items
    if (children > 0) {
      items.push('Diapers/Pull-ups')
      items.push('Wipes')
      items.push('Snacks')
      items.push('Toys/Entertainment')
      items.push('Kids Books')
    }

    // Parse special needs
    if (specialNeeds.toLowerCase().includes('beach')) {
      items.push('Swimsuit')
      items.push('Beach Towel')
      items.push('Flip Flops')
    }
    if (specialNeeds.toLowerCase().includes('ski') || specialNeeds.toLowerCase().includes('snow')) {
      items.push('Ski Jacket')
      items.push('Gloves')
      items.push('Ski Goggles')
      items.push('Thermal Underwear')
    }

    return items
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        <h3 className="text-2xl font-display mb-2">AI Packing List Generator</h3>
        <p className="text-sm text-neutral-500 mb-6">
          Tell us about your trip and we'll generate a comprehensive packing list
        </p>

        <div className="space-y-4 mb-6">
          {/* Trip Info Summary */}
          <div className="p-3 bg-primary-50 rounded-lg border border-primary-100">
            <div className="text-sm text-primary-800">
              <strong>{duration} days</strong> • {tripMetadata.destination?.name || 'Your destination'}
            </div>
          </div>

          {/* Adults */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Number of Adults
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={adults}
              onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
              className="input-base w-full"
            />
          </div>

          {/* Children */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Number of Children
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={children}
              onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
              className="input-base w-full"
            />
          </div>

          {/* Child Ages */}
          {children > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Child Ages (e.g., "3, 7")
              </label>
              <input
                type="text"
                value={childAges}
                onChange={(e) => setChildAges(e.target.value)}
                placeholder="3, 7"
                className="input-base w-full"
              />
            </div>
          )}

          {/* Special Needs */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Special Activities or Needs
            </label>
            <textarea
              value={specialNeeds}
              onChange={(e) => setSpecialNeeds(e.target.value)}
              placeholder="Beach, hiking, formal dinner, medical needs..."
              rows={3}
              className="input-base w-full resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 btn bg-neutral-100 hover:bg-neutral-200 text-neutral-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1 btn bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate List
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-neutral-400 mt-4 text-center">
          You can edit and refine the generated items after creation
        </p>
      </div>
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
          icon: <Plane className="w-5 h-5" />,
          title: e.airline && e.flightNumber ? `${e.airline} ${e.flightNumber}` : 'Flight',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.confirmationNumber || null,
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          accent: 'text-blue-700',
          iconColor: 'text-blue-600'
        }
      }
      case 'train': {
        const e = event as any
        return {
          icon: <Train className="w-5 h-5" />,
          title: e.line || 'Train',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.trainNumber ? `#${e.trainNumber}` : null,
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          accent: 'text-purple-700',
          iconColor: 'text-purple-600'
        }
      }
      case 'driving_ev': {
        const e = event as any
        return {
          icon: <Zap className="w-5 h-5" />,
          title: 'Drive (EV)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.evVehicle ? `${e.evVehicle.currentBattery}% battery` : null,
          bg: 'bg-green-50',
          border: 'border-green-200',
          accent: 'text-green-700',
          iconColor: 'text-green-600',
          hasCharging: true
        }
      }
      case 'driving_rental': {
        const e = event as any
        return {
          icon: <Car className="w-5 h-5" />,
          title: 'Drive (Rental)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.rentalCar?.company || null,
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          accent: 'text-orange-700',
          iconColor: 'text-orange-600'
        }
      }
      case 'hotel':
      case 'airbnb':
      case 'family_stay': {
        const e = event as any
        const icon = event.eventType === 'hotel' ? <Hotel className="w-5 h-5" /> : event.eventType === 'airbnb' ? <Home className="w-5 h-5" /> : <Users className="w-5 h-5" />
        return {
          icon,
          title: e.name,
          subtitle: e.location?.name || e.location?.address || e.address,
          detail: `Check-in ${e.checkIn}`,
          bg: 'bg-rose-50',
          border: 'border-rose-200',
          accent: 'text-rose-700',
          iconColor: 'text-rose-600'
        }
      }
      default: {
        const e = event as any
        return {
          icon: <MapPin className="w-5 h-5" />,
          title: e.description || event.eventType.replace(/_/g, ' '),
          subtitle: e.location?.name || e.location?.address,
          detail: e.confirmationNumber || null,
          bg: 'bg-neutral-50',
          border: 'border-neutral-200',
          accent: 'text-neutral-700',
          iconColor: 'text-neutral-600'
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
        <div className={`${details.iconColor}`}>{details.icon}</div>
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
