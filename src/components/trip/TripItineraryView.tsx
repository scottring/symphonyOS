/**
 * Trip Itinerary View - Reversed Two-Column Layout
 * Left: Packing list and notes (main content)
 * Right: Trip timeline (sidebar)
 */

import { useMemo, useState } from 'react'
import type { TripMetadata, TripEvent, DrivingEVEvent, ChargingStation, OtherEvent, PackingNode, HotelEvent, AirbnbEvent, FamilyStayEvent, FlightEvent, TrainEvent, DrivingRentalEvent } from '@/types/trip'
import type { Task } from '@/types/task'
import { EVRoutePlanner } from './EVRoutePlanner'
import { PackingListDisplay } from '@/components/packing/PackingListDisplay'
import { usePacking } from '@/hooks/usePacking'
import { buildPackingContext } from '@/lib/packingContext'
import { generatePackingList } from '@/services/claudeService'
import { supabase } from '@/lib/supabase'
import { Save, Plane, Car, Hotel, Zap, Train, Home, Users, MapPin, Check, AlertCircle, Sparkles, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TripItineraryViewProps {
  tripMetadata: TripMetadata
  tasks: Task[]
  onToggleTask: (taskId: string) => void
  onUpdateTripMetadata?: (projectId: string, name: string, tripMetadata: TripMetadata) => Promise<void>
  projectId?: string
  projectName?: string
  onEditEvent?: (eventId: string, insertAtIndex?: number) => void
  onDeleteEvent?: (eventId: string) => void
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
  onDeleteEvent,
  onAddTask,
  onDeleteTask
}: TripItineraryViewProps) {
  const [selectedEventForCharging, setSelectedEventForCharging] = useState<string | null>(null)
  const [aiRequest, setAiRequest] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [newItemText, setNewItemText] = useState('')
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const { createTemplate, templates } = usePacking()

  // Handler to manually add a single packing item
  const handleAddPackingItem = async () => {
    if (!newItemText.trim() || !onAddTask || !projectId) return

    await onAddTask({
      title: `Pack: ${newItemText.trim()}`,
      projectId
    })
    setNewItemText('')
  }

  // Handler to generate packing items from AI conversation
  const handleAIGenerate = async () => {
    if (!aiRequest.trim() || !onAddTask || !projectId) return

    setIsGenerating(true)
    setAiError(null)

    try {
      // Fetch family members for context
      const { data: membersData } = await supabase
        .from('family_members')
        .select('*')
        .order('display_order')

      const members = membersData || []

      // Fetch user profile for home location
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = user ? await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
        : { data: null }

      // Build context with trip details
      const context = await buildPackingContext(
        tripMetadata,
        members,
        profileData,
        aiRequest  // User's request becomes the special_needs/instructions
      )

      // Generate nodes via AI
      const nodes = await generatePackingList(context)

      // Add generated items to packing list (skip headings, only add items)
      for (const node of nodes) {
        if (node.type === 'item') {
          await onAddTask({
            title: `Pack: ${node.text}`,
            projectId
          })
        }
      }

      setAiRequest('')  // Clear input on success
    } catch (error) {
      console.error('AI generation failed:', error)
      setAiError(error instanceof Error ? error.message : 'Failed to generate items')
    } finally {
      setIsGenerating(false)
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

  // Handler to load items from user-saved template
  const handleLoadTemplate = async (templateId: string) => {
    if (!projectId) return

    const template = templates.find(t => t.id === templateId)
    if (!template || !template.nodes) return

    // Store the template structure in trip metadata to preserve headings
    if (onUpdateTripMetadata && projectName) {
      const updatedMetadata = {
        ...tripMetadata,
        packingList: template.nodes
      }
      await onUpdateTripMetadata(projectId, projectName, updatedMetadata)
    }
  }

  // Convert packing tasks to PackingNode format for saving as template
  const convertTasksToPackingNodes = (): PackingNode[] => {
    const nodes: PackingNode[] = []

    // Group tasks by category
    const tasksByCategory = new Map<string, Task[]>()

    for (const task of packingTasks) {
      const title = task.title?.toLowerCase() || ''
      let category = 'Other'

      // Infer category from task title
      if (title.includes('toothbrush') || title.includes('soap') || title.includes('shampoo') ||
          title.includes('deodorant') || title.includes('razor') || title.includes('toiletries')) {
        category = 'Toiletries'
      } else if (title.includes('underwear') || title.includes('socks') || title.includes('shirt') ||
                 title.includes('pants') || title.includes('jacket') || title.includes('clothes') || title.includes('outfit')) {
        category = 'Clothing'
      } else if (title.includes('charger') || title.includes('phone') || title.includes('laptop') ||
                 title.includes('cable') || title.includes('electronics') || title.includes('headphone')) {
        category = 'Electronics'
      } else if (title.includes('passport') || title.includes('license') || title.includes('ticket') ||
                 title.includes('documents') || title.includes('id')) {
        category = 'Documents'
      } else if (title.includes('snack') || title.includes('water') || title.includes('food') || title.includes('drink')) {
        category = 'Food & Drinks'
      } else if (title.includes('medicine') || title.includes('medication') || title.includes('first aid') || title.includes('health')) {
        category = 'Health'
      }

      if (!tasksByCategory.has(category)) {
        tasksByCategory.set(category, [])
      }
      tasksByCategory.get(category)!.push(task)
    }

    // Convert to nodes with headings
    for (const [category, tasks] of tasksByCategory.entries()) {
      // Add category heading
      nodes.push({
        type: 'heading',
        level: 2,
        text: category
      })

      // Add items for this category
      for (const task of tasks) {
        nodes.push({
          type: 'item',
          text: task.title?.replace(/^Pack:\s*/i, '') || '',
          checked: false
        })
      }
    }

    return nodes
  }

  // Handler to save current packing list as template
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return

    try {
      // Use structured packing list if it exists, otherwise convert tasks
      const nodes = tripMetadata.packingList && tripMetadata.packingList.length > 0
        ? tripMetadata.packingList
        : convertTasksToPackingNodes()

      await createTemplate(templateName, nodes)
      setShowSaveTemplateModal(false)
      setTemplateName('')
      alert('Packing template saved successfully!')
    } catch (err) {
      console.error('Failed to save template:', err)
      alert('Failed to save template')
    }
  }

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

  // Use events as-is (user can drag to reorder)
  const events = tripMetadata.events || []

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end to reorder events
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !onUpdateTripMetadata || !projectId || !projectName) {
      return
    }

    const oldIndex = events.findIndex(e => e.id === active.id)
    const newIndex = events.findIndex(e => e.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reorderedEvents = arrayMove(events, oldIndex, newIndex)

    const updatedTripMetadata: TripMetadata = {
      ...tripMetadata,
      events: reorderedEvents
    }

    await onUpdateTripMetadata(projectId, projectName, updatedTripMetadata)
  }

  // Calculate packing progress from structured list OR tasks
  const completedPackingCount = tripMetadata.packingList
    ? tripMetadata.packingList.filter(n => n.type === 'item' && n.checked).length
    : packingTasks.filter(t => t.completed).length
  const totalPackingCount = tripMetadata.packingList
    ? tripMetadata.packingList.filter(n => n.type === 'item').length
    : packingTasks.length

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

  return (
    <div className="w-full">
      {/* Refined Header */}
      <div className="mb-8 bg-bg-elevated border border-neutral-200 rounded-2xl p-6 shadow-card">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 mb-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Trip</span>
            </div>

            <h2 className="font-display text-2xl text-neutral-900 leading-tight mb-1">
              {tripTitle}
            </h2>
          </div>

          <div className="text-right flex-shrink-0 ml-4">
            <div className="text-xs text-neutral-500 mb-0.5">Dates</div>
            <div className="text-sm font-medium text-neutral-800 whitespace-nowrap">
              {formatDateRange(tripDates.start, tripDates.end)}
            </div>
          </div>
        </div>

        {/* Trip Stats - Refined */}
        <div className="flex items-center gap-5 text-xs flex-wrap pt-3 border-t border-neutral-200/60">
          {tripStats.flights > 0 && (
            <div className="flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-neutral-600">{tripStats.flights} flight{tripStats.flights !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.drives > 0 && (
            <div className="flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-neutral-600">{tripStats.drives} drive{tripStats.drives !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.accommodations > 0 && (
            <div className="flex items-center gap-1.5">
              <Hotel className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-neutral-600">{tripStats.accommodations} stay{tripStats.accommodations !== 1 ? 's' : ''}</span>
            </div>
          )}
          {tripStats.chargingStops > 0 && (
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-neutral-600">{tripStats.chargingStops} charge{tripStats.chargingStops !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-Column Layout: Itinerary (Left) + Packing (Right) */}
      <div className="flex gap-12 lg:gap-16">
        {/* LEFT SIDEBAR: Trip Itinerary */}
        <aside className="w-80 flex-shrink-0 hidden md:block">
          <div className="sticky top-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-neutral-900">Itinerary</h2>
              {onEditEvent && (
                <button
                  onClick={() => onEditEvent('')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {tripMetadata.useUnifiedTimeline && events.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={events.map(e => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {events.map((event, index) => (
                      <div key={event.id} className="relative group">
                        <SortableEventCard
                          event={event}
                          onRequestCharging={
                            event.eventType === 'driving_ev'
                              ? () => setSelectedEventForCharging(event.id)
                              : undefined
                          }
                          onClick={onEditEvent ? () => onEditEvent(event.id) : undefined}
                          onDelete={onDeleteEvent ? () => onDeleteEvent(event.id) : undefined}
                        />

                        {/* Hover zone below - shows on hover, inserts after this card */}
                        {onEditEvent && (
                          <div className="absolute -bottom-2 left-0 right-0 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              onClick={() => onEditEvent('', index + 1)}
                              className="px-3 py-1 text-xs bg-white border border-neutral-300 text-neutral-600 hover:text-primary-600 hover:border-primary-400 rounded-full shadow-sm flex items-center gap-1 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add Event
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
          <div className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h2 className="font-display text-xl text-neutral-900">Packing List</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Load from My Templates */}
                {templates.length > 0 && onAddTask && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleLoadTemplate(e.target.value)
                        e.target.value = '' // Reset selection
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-bg-elevated hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg transition-colors"
                  >
                    <option value="">Load Template...</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Save as Template */}
                {(tripMetadata.packingList && tripMetadata.packingList.length > 0) || packingTasks.length > 0 ? (
                  <button
                    onClick={() => setShowSaveTemplateModal(true)}
                    className="px-3 py-1.5 bg-bg-elevated hover:bg-neutral-100 text-neutral-700 text-xs border border-neutral-200 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Save size={14} />
                    Save Template
                  </button>
                ) : null}

                {/* Clear All Packing Items */}
                {onDeleteTask && packingTasks.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm(`Clear all ${packingTasks.length} packing items?`)) {
                        for (const task of packingTasks) {
                          await onDeleteTask(task.id)
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-danger-50 hover:bg-danger-100 text-danger-600 text-xs border border-danger-200 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* AI Conversational Input */}
            {onAddTask && (
              <div className="mb-5">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={aiRequest}
                      onChange={(e) => setAiRequest(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isGenerating) {
                          handleAIGenerate()
                        }
                      }}
                      placeholder="Describe what you need to pack..."
                      className="w-full px-3 py-2.5 text-sm bg-bg-elevated border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                      disabled={isGenerating}
                    />
                  </div>
                  <button
                    onClick={handleAIGenerate}
                    disabled={!aiRequest.trim() || isGenerating}
                    className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isGenerating ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
                {aiError && (
                  <p className="text-danger-600 text-sm mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {aiError}
                  </p>
                )}
              </div>
            )}

            {/* Packing Progress */}
            {totalPackingCount > 0 && (
              <div className="mb-6 p-4 bg-bg-elevated rounded-xl border border-neutral-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${(completedPackingCount / totalPackingCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-neutral-700 tabular-nums">
                    {completedPackingCount}/{totalPackingCount}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                  {completedPackingCount === totalPackingCount ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success-500" />
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
              <div className="mb-6">
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
                    placeholder="Add item manually..."
                    className="flex-1 px-3 py-2 text-sm bg-bg-elevated border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
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

            {tripMetadata.packingList && tripMetadata.packingList.length > 0 ? (
              // Use PackingListDisplay when structured packing list exists
              <PackingListDisplay
                nodes={tripMetadata.packingList}
                onToggleCheck={async (index) => {
                  if (!onUpdateTripMetadata || !projectId || !projectName) return

                  const updatedNodes = tripMetadata.packingList!.map((node, i) => {
                    if (i === index && node.type === 'item') {
                      return { ...node, checked: !node.checked }
                    }
                    return node
                  })

                  const updatedMetadata = {
                    ...tripMetadata,
                    packingList: updatedNodes
                  }
                  await onUpdateTripMetadata(projectId, projectName, updatedMetadata)
                }}
              />
            ) : packingTasks.length > 0 ? (
              // Fall back to auto-categorized task display
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 lg:gap-x-10 gap-y-8">
                {Array.from(packingByCategory.entries()).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3 border-b border-neutral-200 pb-1.5">
                      {category}
                    </h3>
                    <div className="space-y-0.5">
                      {items.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2.5 py-1.5 px-1 group hover:bg-neutral-50 rounded-md transition-colors"
                        >
                          <label className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => onToggleTask(task.id)}
                              className="w-4 h-4 rounded border-neutral-300 text-primary-600
                                       focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer flex-shrink-0"
                            />
                            <span className={`text-sm leading-relaxed transition-all truncate ${
                              task.completed
                                ? 'text-neutral-400 line-through'
                                : 'text-neutral-700 group-hover:text-neutral-900'
                            }`}>
                              {task.title?.replace(/^Pack:?\s*/i, '')}
                            </span>
                          </label>
                          {onDeleteTask && (
                            <button
                              onClick={() => onDeleteTask(task.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-danger-50 rounded transition-all text-neutral-400 hover:text-danger-600 flex-shrink-0"
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
              <div className="py-16 text-center text-neutral-500 text-sm bg-neutral-50/50 rounded-xl border border-neutral-200 border-dashed">
                {onAddTask ? 'Add items above to start your packing list' : 'No packing items yet'}
              </div>
            )}
          </div>

          {/* Notes Section - Placeholder for now */}
          <div className="pt-10 border-t border-neutral-200">
            <h2 className="font-display text-xl text-neutral-900 mb-3">Trip Notes</h2>
            <div className="text-sm text-neutral-500 italic">
              Notes will appear here
            </div>
          </div>
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-display text-xl font-medium text-neutral-800 mb-4">
              Save as Template
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Give your packing list a name to save it as a reusable template.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && templateName.trim()) {
                  handleSaveAsTemplate()
                }
              }}
              placeholder="e.g., Beach Vacation, Ski Trip, Business Travel"
              className="input-base w-full mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveTemplateModal(false)
                  setTemplateName('')
                }}
                className="btn bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={!templateName.trim()}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EV Route Planner Modal */}
      {selectedEventForCharging && tripMetadata.events && (
        <EVRoutePlanner
          event={tripMetadata.events.find(e => e.id === selectedEventForCharging) as DrivingEVEvent}
          onClose={() => setSelectedEventForCharging(null)}
          onSelectWaypoints={(waypoints) => handleSelectWaypoints(waypoints, selectedEventForCharging)}
        />
      )}


    </div>
  )
}

// Sortable Event Card Wrapper
function SortableEventCard({ event, onRequestCharging, onClick, onDelete }: CompactEventCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -ml-6 cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <CompactEventCard
        event={event}
        onRequestCharging={onRequestCharging}
        onClick={onClick}
        onDelete={onDelete}
      />
    </div>
  )
}

// Compact Event Card Component
interface CompactEventCardProps {
  event: TripEvent
  onRequestCharging?: () => void
  onClick?: () => void
  onDelete?: () => void
}

function CompactEventCard({ event, onRequestCharging, onClick, onDelete }: CompactEventCardProps) {
  const formatDateTime = (dateStr: string, time?: string) => {
    if (!time) {
      const date = new Date(`${dateStr}T08:00`)
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        time: null
      }
    }

    // If time is already a full ISO timestamp, use it directly
    let dateTime: Date
    if (time.includes('T') || time.includes('Z') || time.match(/\d{4}-\d{2}-\d{2}/)) {
      dateTime = new Date(time)
    } else {
      // Time is in HH:MM format, combine with date
      dateTime = new Date(`${dateStr}T${time}`)
    }

    return {
      date: dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: dateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }
  }

  // Get the appropriate time field based on event type
  const getEventTime = () => {
    if (event.eventType === 'flight' || event.eventType === 'train') {
      const transportEvent = event as FlightEvent | TrainEvent
      return transportEvent.departureTime
    }
    return event.time
  }

  const { date, time } = formatDateTime(event.date, getEventTime())

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
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-primary-600'
        }
      }
      case 'train': {
        const e = event as any
        return {
          icon: <Train className="w-5 h-5" />,
          title: e.line || 'Train',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.trainNumber ? `#${e.trainNumber}` : null,
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-primary-600'
        }
      }
      case 'driving_ev': {
        const e = event as any
        return {
          icon: <Zap className="w-5 h-5" />,
          title: 'Drive (EV)',
          subtitle: `${e.origin?.name || e.origin?.address} → ${e.destination?.name || e.destination?.address}`,
          detail: e.evVehicle ? `${e.evVehicle.currentBattery}% battery` : null,
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-primary-600',
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
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-primary-600'
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
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-accent-500'
        }
      }
      default: {
        const e = event as any
        return {
          icon: <MapPin className="w-5 h-5" />,
          title: e.description || event.eventType.replace(/_/g, ' '),
          subtitle: e.location?.name || e.location?.address,
          detail: e.confirmationNumber || null,
          bg: 'bg-bg-elevated',
          border: 'border-neutral-200',
          accent: 'text-neutral-800',
          iconColor: 'text-neutral-500'
        }
      }
    }
  }

  const details = getEventDetails()

  return (
    <div
      className={`${details.bg} border ${details.border} rounded-xl p-3.5 shadow-sm ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-neutral-300' : ''
      } transition-all duration-200 group`}
      onClick={onClick}
    >
      {/* Header: Icon + Date/Time + Delete Button */}
      <div className="flex items-start justify-between mb-2.5">
        <div className={`${details.iconColor}`}>{details.icon}</div>
        <div className="flex items-center gap-2">
          {/* Delete button - shows on hover */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Delete this event from the itinerary?')) {
                  onDelete()
                }
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded"
              title="Delete event"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
          <div className="text-right">
            <div className="text-xs font-semibold text-neutral-900">{date}</div>
            {time && <div className="text-xs text-neutral-500">{time}</div>}
          </div>
        </div>
      </div>

      {/* Title */}
      <h4 className={`font-medium ${details.accent} text-sm leading-tight mb-1`}>
        {details.title}
      </h4>

      {/* Subtitle */}
      {details.subtitle && (
        <p className="text-xs text-neutral-600 leading-relaxed mb-1 line-clamp-2">
          {details.subtitle}
        </p>
      )}

      {/* Detail */}
      {details.detail && (
        <div className="text-xs text-neutral-500">
          {details.detail}
        </div>
      )}

      {/* Notes */}
      {event.notes && (
        <div className="text-xs text-neutral-600 mt-2.5 p-2 bg-neutral-50/50 rounded border border-neutral-200/50 line-clamp-2">
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
          className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg border border-primary-200 transition-colors"
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
