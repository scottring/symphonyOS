import { useState, useCallback, useEffect } from 'react'
import type { TripMetadata, TravelMode, Location, PackingTemplate, TripSegment, Accommodation, TransportationLogistic, TripEvent, PackingItem } from '@/types/trip'
import { EV_VEHICLES } from '@/types/trip'
import type { PlaceAutocompleteResult } from '@/types/directions'
import type { Project } from '@/types/project'
import { usePacking } from '@/hooks/usePacking'
import { useDirections } from '@/hooks/useDirections'
import { SegmentBuilder } from './SegmentBuilder'
import { AccommodationBuilder } from './AccommodationBuilder'
import { LogisticsBuilder } from './LogisticsBuilder'
import { EventBuilder } from './EventBuilder'

interface TripCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateTrip: (name: string, tripMetadata: TripMetadata, packingTemplate?: PackingTemplate, customPackingItems?: PackingItem[]) => Promise<Project | null>
  onUpdateTrip?: (projectId: string, name: string, tripMetadata: TripMetadata, packingTemplate?: PackingTemplate, customPackingItems?: PackingItem[]) => Promise<void>
  existingProject?: Project // For edit mode
}

type TripType = 'simple' | 'multi-segment' | 'timeline'

export function TripCreationModal({ isOpen, onClose, onCreateTrip, onUpdateTrip, existingProject }: TripCreationModalProps) {
  const { searchPlaces, getPlaceDetails } = useDirections()
  const { templates: customTemplates } = usePacking()

  // Trip type - default to timeline for new trips
  const [tripType, setTripType] = useState<TripType>('timeline')

  // Form state
  const [tripName, setTripName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [packingTemplate, setPackingTemplate] = useState<PackingTemplate | string>('weekend')
  const [customPackingItems, setCustomPackingItems] = useState<PackingItem[] | undefined>(undefined)

  // === SIMPLE TRIP STATE ===
  const [travelMode, setTravelMode] = useState<TravelMode>('driving_ev')

  // Origin state
  const [origin, setOrigin] = useState<Location>({ name: '', address: '' })
  const [originQuery, setOriginQuery] = useState('')
  const [originResults, setOriginResults] = useState<PlaceAutocompleteResult[]>([])

  // Destination state
  const [destination, setDestination] = useState<Location>({ name: '', address: '' })
  const [destQuery, setDestQuery] = useState('')
  const [destResults, setDestResults] = useState<PlaceAutocompleteResult[]>([])

  // Waypoints state (stops between origin and destination)
  const [waypoints, setWaypoints] = useState<Location[]>([])
  const [waypointQueries, setWaypointQueries] = useState<string[]>([])
  const [waypointResults, setWaypointResults] = useState<PlaceAutocompleteResult[][]>([])

  // EV-specific state
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [currentBattery, setCurrentBattery] = useState(80)

  // === MULTI-SEGMENT TRIP STATE ===
  const [segments, setSegments] = useState<TripSegment[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [logistics, setLogistics] = useState<TransportationLogistic[]>([])

  // === UNIFIED TIMELINE STATE ===
  const [events, setEvents] = useState<TripEvent[]>([])

  const [isCreating, setIsCreating] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const isEditMode = !!existingProject

  // Auto-save to localStorage
  useEffect(() => {
    if (!isOpen) return

    const autoSaveData = {
      tripName,
      startDate,
      endDate,
      tripType,
      origin,
      destination,
      waypoints,
      travelMode,
      selectedVehicle,
      currentBattery,
      segments,
      accommodations,
      logistics,
      events,
      timestamp: Date.now(),
    }

    localStorage.setItem('trip-draft', JSON.stringify(autoSaveData))
  }, [isOpen, tripName, startDate, endDate, tripType, origin, destination, waypoints, travelMode, selectedVehicle, currentBattery, segments, accommodations, logistics, events])

  // Track unsaved changes
  useEffect(() => {
    const hasData = !!(tripName || segments.length > 0 || accommodations.length > 0 || logistics.length > 0 || events.length > 0 || origin.address || destination.address)
    setHasUnsavedChanges(hasData)
  }, [tripName, segments, accommodations, logistics, events, origin, destination])

  // Populate form when editing existing project
  useEffect(() => {
    if (existingProject?.tripMetadata) {
      const metadata = existingProject.tripMetadata
      setTripName(existingProject.name)
      setStartDate(metadata.startDate)
      setEndDate(metadata.endDate)

      if (metadata.useUnifiedTimeline) {
        setTripType('timeline')
        setEvents(metadata.events || [])
      } else if (metadata.isMultiSegment) {
        setTripType('multi-segment')
        setSegments(metadata.segments || [])
        setAccommodations(metadata.accommodations || [])
        setLogistics(metadata.logistics || [])
      } else {
        setTripType('simple')
        setOrigin(metadata.origin)
        setDestination(metadata.destination)
        setWaypoints(metadata.waypoints || [])
        setTravelMode(metadata.travelMode)

        if (metadata.vehicleModel) {
          setSelectedVehicle(metadata.vehicleModel)
          setCurrentBattery(metadata.currentBattery || 80)
        }
      }
      setHasUnsavedChanges(false)
    } else if (isOpen) {
      // Try to restore from localStorage when opening for new trip
      const saved = localStorage.getItem('trip-draft')
      if (saved) {
        try {
          const data = JSON.parse(saved)
          const ageMinutes = (Date.now() - data.timestamp) / 1000 / 60

          // Only restore if draft is less than 24 hours old
          if (ageMinutes < 1440) {
            const shouldRestore = window.confirm('Found unsaved trip draft. Would you like to restore it?')
            if (shouldRestore) {
              setTripName(data.tripName || '')
              setStartDate(data.startDate || '')
              setEndDate(data.endDate || '')
              setTripType(data.tripType || 'timeline')
              setOrigin(data.origin || { name: '', address: '' })
              setDestination(data.destination || { name: '', address: '' })
              setWaypoints(data.waypoints || [])
              setTravelMode(data.travelMode || 'driving')
              setSelectedVehicle(data.selectedVehicle || '')
              setCurrentBattery(data.currentBattery || 80)
              setSegments(data.segments || [])
              setAccommodations(data.accommodations || [])
              setLogistics(data.logistics || [])
              setEvents(data.events || [])
            }
          }
        } catch (e) {
          console.error('Failed to restore draft:', e)
        }
      }
    }
  }, [existingProject, isOpen])

  // Search handlers
  const handleOriginSearch = useCallback(
    async (query: string) => {
      setOriginQuery(query)
      if (!query.trim()) {
        setOriginResults([])
        return
      }
      const results = await searchPlaces(query)
      setOriginResults(results)
    },
    [searchPlaces]
  )

  const handleSelectOrigin = useCallback(
    async (result: PlaceAutocompleteResult) => {
      const details = await getPlaceDetails(result.placeId)
      setOrigin({
        name: result.mainText,
        address: details?.address || result.description,
        placeId: result.placeId,
      })
      setOriginQuery(result.mainText)
      setOriginResults([])
    },
    [getPlaceDetails]
  )

  const handleDestSearch = useCallback(
    async (query: string) => {
      setDestQuery(query)
      if (!query.trim()) {
        setDestResults([])
        return
      }
      const results = await searchPlaces(query)
      setDestResults(results)
    },
    [searchPlaces]
  )

  const handleSelectDest = useCallback(
    async (result: PlaceAutocompleteResult) => {
      const details = await getPlaceDetails(result.placeId)
      setDestination({
        name: result.mainText,
        address: details?.address || result.description,
        placeId: result.placeId,
      })
      setDestQuery(result.mainText)
      setDestResults([])
    },
    [getPlaceDetails]
  )

  // Waypoint handlers
  const handleAddWaypoint = useCallback(() => {
    setWaypoints([...waypoints, { name: '', address: '' }])
    setWaypointQueries([...waypointQueries, ''])
    setWaypointResults([...waypointResults, []])
  }, [waypoints, waypointQueries, waypointResults])

  const handleRemoveWaypoint = useCallback((index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index))
    setWaypointQueries(waypointQueries.filter((_, i) => i !== index))
    setWaypointResults(waypointResults.filter((_, i) => i !== index))
  }, [waypoints, waypointQueries, waypointResults])

  const handleWaypointSearch = useCallback(
    async (index: number, query: string) => {
      const newQueries = [...waypointQueries]
      newQueries[index] = query
      setWaypointQueries(newQueries)

      if (!query.trim()) {
        const newResults = [...waypointResults]
        newResults[index] = []
        setWaypointResults(newResults)
        return
      }

      const results = await searchPlaces(query)
      const newResults = [...waypointResults]
      newResults[index] = results
      setWaypointResults(newResults)
    },
    [waypointQueries, waypointResults, searchPlaces]
  )

  const handleSelectWaypoint = useCallback(
    async (index: number, result: PlaceAutocompleteResult) => {
      const details = await getPlaceDetails(result.placeId)
      const newWaypoints = [...waypoints]
      newWaypoints[index] = {
        name: result.mainText,
        address: details?.address || result.description,
        placeId: result.placeId,
      }
      setWaypoints(newWaypoints)

      const newQueries = [...waypointQueries]
      newQueries[index] = result.mainText
      setWaypointQueries(newQueries)

      const newResults = [...waypointResults]
      newResults[index] = []
      setWaypointResults(newResults)
    },
    [waypoints, waypointQueries, waypointResults, getPlaceDetails]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!tripName || !startDate || !endDate) {
        return
      }

      // Validation based on trip type
      if (tripType === 'simple') {
        if (!origin.address || !destination.address) {
          return
        }
      } else if (tripType === 'timeline') {
        // Timeline trips must have at least one event
        if (events.length === 0) {
          alert('Please add at least one event to your trip timeline')
          return
        }
      } else {
        // Multi-segment trips must have at least one segment
        if (segments.length === 0) {
          alert('Please add at least one trip segment')
          return
        }
      }

      setIsCreating(true)

      try {
        let tripMetadata: TripMetadata

        if (tripType === 'timeline') {
          // Unified timeline trip metadata
          // Derive overall origin/destination from first and last travel events
          const travelEvents = events.filter(
            (e) => e.eventType === 'flight' || e.eventType === 'train' || e.eventType === 'driving_ev' || e.eventType === 'driving_rental'
          )
          const firstTravel = travelEvents[0] as any
          const lastTravel = travelEvents[travelEvents.length - 1] as any

          tripMetadata = {
            startDate,
            endDate,
            origin: firstTravel?.origin || { name: '', address: '' },
            destination: lastTravel?.destination || { name: '', address: '' },
            travelMode: 'driving', // Default, not really used for timeline
            useUnifiedTimeline: true,
            events,
          }
        } else if (tripType === 'multi-segment') {
          // Multi-segment trip metadata
          // Use first segment origin and last segment destination as overall origin/destination
          const firstSegment = segments[0]
          const lastSegment = segments[segments.length - 1]

          tripMetadata = {
            startDate,
            endDate,
            origin: firstSegment.origin,
            destination: lastSegment.destination,
            travelMode: 'driving', // Default, not really used for multi-segment
            isMultiSegment: true,
            segments,
            accommodations: accommodations.length > 0 ? accommodations : undefined,
            logistics: logistics.length > 0 ? logistics : undefined,
          }
        } else {
          // Simple trip metadata
          const vehicle = travelMode === 'driving_ev' && selectedVehicle
            ? EV_VEHICLES.find((v) => `${v.manufacturer} ${v.model}` === selectedVehicle)
            : undefined

          tripMetadata = {
            startDate,
            endDate,
            origin,
            destination,
            waypoints: waypoints.filter(wp => wp.address), // Only include waypoints with addresses
            travelMode,
            ...(vehicle && {
              vehicleModel: `${vehicle.manufacturer} ${vehicle.model}`,
              batteryCapacity: vehicle.batteryCapacity,
              rangePerCharge: vehicle.rangeEPA,
              currentBattery,
              preferredNetworks: vehicle.chargingNetworks,
            }),
          }
        }

        if (isEditMode && existingProject && onUpdateTrip) {
          // Update existing trip
          await onUpdateTrip(existingProject.id, tripName, tripMetadata, packingTemplate as PackingTemplate, customPackingItems)
        } else {
          // Create new trip
          await onCreateTrip(tripName, tripMetadata, packingTemplate as PackingTemplate, customPackingItems)
        }

        // Reset form
        resetForm()
        onClose()
      } catch (error) {
        console.error(`Error ${isEditMode ? 'updating' : 'creating'} trip:`, error)
      } finally {
        setIsCreating(false)
      }
    },
    [
      tripName,
      startDate,
      endDate,
      tripType,
      origin,
      destination,
      waypoints,
      travelMode,
      selectedVehicle,
      currentBattery,
      segments,
      accommodations,
      logistics,
      events,
      packingTemplate,
      onCreateTrip,
      onUpdateTrip,
      existingProject,
      isEditMode,
      onClose,
    ]
  )

  const resetForm = useCallback(() => {
    setTripName('')
    setStartDate('')
    setEndDate('')
    setTripType('timeline')
    setOrigin({ name: '', address: '' })
    setDestination({ name: '', address: '' })
    setWaypoints([])
    setOriginQuery('')
    setDestQuery('')
    setWaypointQueries([])
    setWaypointResults([])
    setTravelMode('driving_ev')
    setSelectedVehicle('')
    setCurrentBattery(80)
    setSegments([])
    setAccommodations([])
    setLogistics([])
    setEvents([])
    setHasUnsavedChanges(false)
    localStorage.removeItem('trip-draft')
  }, [])

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !isEditMode) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close? Your work has been auto-saved and you can restore it next time.')
      if (!shouldClose) return
    }
    onClose()
  }, [hasUnsavedChanges, isEditMode, onClose])

  if (!isOpen) return null

  const isEV = travelMode === 'driving_ev'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-display text-neutral-800">
            {isEditMode ? 'Edit Trip' : 'Plan a Trip'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Trip Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Trip Name</label>
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="e.g., Weekend in Portland"
              className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          {/* Trip Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Trip Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTripType('simple')}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  tripType === 'simple'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <div className="font-medium">Simple Trip</div>
                <div className="text-xs mt-0.5">One mode of travel</div>
              </button>
              <button
                type="button"
                onClick={() => setTripType('timeline')}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  tripType === 'timeline'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <div className="font-medium">Timeline</div>
                <div className="text-xs mt-0.5">Chronological events</div>
              </button>
              <button
                type="button"
                onClick={() => setTripType('multi-segment')}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  tripType === 'multi-segment'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <div className="font-medium">Multi-Segment</div>
                <div className="text-xs mt-0.5">Grouped by type</div>
              </button>
            </div>
          </div>

          {/* === SIMPLE TRIP UI === */}
          {tripType === 'simple' && (
            <>
              {/* Origin */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Starting From</label>
                <div className="relative">
                  <input
                    type="text"
                    value={originQuery}
                    onChange={(e) => handleOriginSearch(e.target.value)}
                    placeholder="Enter starting location..."
                    className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required={!origin.address}
                  />
                  {originResults.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {originResults.map((result) => (
                        <li key={result.placeId}>
                          <button
                            type="button"
                            onClick={() => handleSelectOrigin(result)}
                            className="w-full px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-neutral-800">{result.mainText}</p>
                            <p className="text-xs text-neutral-500">{result.secondaryText}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Going To</label>
                <div className="relative">
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => handleDestSearch(e.target.value)}
                    placeholder="Enter destination..."
                    className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required={!destination.address}
                  />
                  {destResults.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {destResults.map((result) => (
                        <li key={result.placeId}>
                          <button
                            type="button"
                            onClick={() => handleSelectDest(result)}
                            className="w-full px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-neutral-800">{result.mainText}</p>
                            <p className="text-xs text-neutral-500">{result.secondaryText}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Waypoints */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-neutral-700">Stops Along the Way</label>
                  <button
                    type="button"
                    onClick={handleAddWaypoint}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Stop
                  </button>
                </div>

                {waypoints.map((_, index) => (
                  <div key={index} className="mb-3">
                    <div className="relative flex gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={waypointQueries[index] || ''}
                          onChange={(e) => handleWaypointSearch(index, e.target.value)}
                          placeholder={`Stop ${index + 1}`}
                          className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        {waypointResults[index]?.length > 0 && (
                          <ul className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {waypointResults[index].map((result) => (
                              <li key={result.placeId}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectWaypoint(index, result)}
                                  className="w-full px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                                >
                                  <p className="text-sm font-medium text-neutral-800">{result.mainText}</p>
                                  <p className="text-xs text-neutral-500">{result.secondaryText}</p>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveWaypoint(index)}
                        className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Travel Mode */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Travel Mode</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['driving_ev', 'driving', 'flying', 'train'] as TravelMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTravelMode(mode)}
                      className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center justify-center gap-1.5 ${
                        travelMode === mode
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {mode === 'driving_ev' && (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>EV</span>
                        </>
                      )}
                      {mode === 'driving' && (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span>Drive</span>
                        </>
                      )}
                      {mode === 'flying' && (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Fly</span>
                        </>
                      )}
                      {mode === 'train' && (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1m8-1a1 1 0 001-1V14a1 1 0 011-1h5.5M15 20v-5" />
                          </svg>
                          <span>Train</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* EV-specific fields */}
              {isEV && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Vehicle</label>
                    <select
                      value={selectedVehicle}
                      onChange={(e) => setSelectedVehicle(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select your vehicle...</option>
                      {EV_VEHICLES.map((vehicle) => (
                        <option key={`${vehicle.manufacturer}-${vehicle.model}`} value={`${vehicle.manufacturer} ${vehicle.model}`}>
                          {vehicle.manufacturer} {vehicle.model} ({vehicle.rangeEPA} mi range)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedVehicle && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Current Battery: {currentBattery}%
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={currentBattery}
                        onChange={(e) => setCurrentBattery(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* === UNIFIED TIMELINE UI === */}
          {tripType === 'timeline' && (
            <div className="space-y-6">
              <EventBuilder events={events} onChange={setEvents} />
            </div>
          )}

          {/* === MULTI-SEGMENT TRIP UI === */}
          {tripType === 'multi-segment' && (
            <div className="space-y-6">
              <SegmentBuilder segments={segments} onChange={setSegments} />
              <AccommodationBuilder accommodations={accommodations} onChange={setAccommodations} />
              <LogisticsBuilder logistics={logistics} onChange={setLogistics} />
            </div>
          )}

          {/* Packing Template (always shown) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Packing List</label>
            <select
              value={packingTemplate}
              onChange={(e) => {
                const value = e.target.value
                setPackingTemplate(value)

                // If it's a custom template ID, set the custom items
                const customTemplate = customTemplates.find(t => t.id === value)
                if (customTemplate) {
                  setCustomPackingItems(customTemplate.items)
                } else {
                  setCustomPackingItems(undefined)
                }
              }}
              className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <optgroup label="Built-in Templates">
                <option value="weekend">Weekend Trip</option>
                <option value="week">Week-Long Trip</option>
                <option value="ev_road_trip">EV Road Trip</option>
                <option value="beach">Beach Vacation</option>
                <option value="ski">Ski Trip</option>
                <option value="business">Business Trip</option>
                <option value="camping">Camping</option>
              </optgroup>
              {customTemplates.length > 0 && (
                <optgroup label="Your Templates">
                  {customTemplates.filter(t => !t.isDefault).map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-neutral-600 hover:text-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !tripName || (tripType === 'simple' && (!origin.address || !destination.address)) || (tripType === 'timeline' && events.length === 0) || (tripType === 'multi-segment' && segments.length === 0)}
              className="flex-1 px-4 py-3 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating
                ? (isEditMode ? 'Updating Trip...' : 'Creating Trip...')
                : (isEditMode ? 'Update Trip' : 'Create Trip')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
