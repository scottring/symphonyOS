/**
 * Event Builder Component
 * Unified chronological timeline for all trip events
 */

import { useState, useCallback } from 'react'
import type { TripEvent, TripEventType, Location } from '@/types/trip'
import type { PlaceAutocompleteResult } from '@/hooks/usePlaceAutocomplete'
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete'
import { EV_VEHICLES } from '@/types/trip'

interface EventBuilderProps {
  events: TripEvent[]
  onChange: (events: TripEvent[]) => void
}

export function EventBuilder({ events, onChange }: EventBuilderProps) {
  const handleAddEvent = useCallback(() => {
    const newEvent: TripEvent = {
      id: crypto.randomUUID(),
      eventType: 'flight',
      date: '',
      time: '',
      origin: { name: '', address: '' },
      destination: { name: '', address: '' },
    }
    onChange([...events, newEvent])
  }, [events, onChange])

  const handleRemoveEvent = useCallback(
    (id: string) => {
      onChange(events.filter((e) => e.id !== id))
    },
    [events, onChange]
  )

  const handleUpdateEvent = useCallback(
    (id: string, updates: Partial<TripEvent>) => {
      onChange(events.map((e) => (e.id === id ? { ...e, ...updates } as TripEvent : e)))
    },
    [events, onChange]
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const newEvents = [...events]
      ;[newEvents[index - 1], newEvents[index]] = [newEvents[index], newEvents[index - 1]]
      onChange(newEvents)
    },
    [events, onChange]
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === events.length - 1) return
      const newEvents = [...events]
      ;[newEvents[index], newEvents[index + 1]] = [newEvents[index + 1], newEvents[index]]
      onChange(newEvents)
    },
    [events, onChange]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800">Trip Timeline</h3>
        <div className="text-sm text-neutral-500">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </div>
      </div>

      {events.length === 0 && (
        <div className="text-center py-8 text-neutral-500">
          No events yet. Click "Add Event" below to start building your trip timeline.
        </div>
      )}

      <div className="space-y-3">
        {events.map((event, index) => (
          <EventCard
            key={event.id}
            event={event}
            index={index}
            totalEvents={events.length}
            onUpdate={(updates) => handleUpdateEvent(event.id, updates)}
            onRemove={() => handleRemoveEvent(event.id)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
          />
        ))}
      </div>

      {/* Add Event button at bottom */}
      <button
        type="button"
        onClick={handleAddEvent}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Event
      </button>
    </div>
  )
}

// ============================================================================
// Event Card Component
// ============================================================================

interface EventCardProps {
  event: TripEvent
  index: number
  totalEvents: number
  onUpdate: (updates: Partial<TripEvent>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function EventCard({ event, index, totalEvents, onUpdate, onRemove, onMoveUp, onMoveDown }: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const eventTypeConfig = EVENT_TYPE_CONFIG[event.eventType]
  const icon = eventTypeConfig?.icon || '📍'
  const label = eventTypeConfig?.label || event.eventType

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-neutral-50 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-neutral-400 hover:text-neutral-600"
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="font-medium text-neutral-800">{label}</div>
            <div className="text-xs text-neutral-500">
              {event.date && event.time ? `${event.date} at ${event.time}` : event.date || 'No date set'}
            </div>
          </div>
        </div>

        {/* Move buttons */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalEvents - 1}
            className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-red-400 hover:text-red-600"
          title="Remove event"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Expanded form */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Event Type Selector */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Event Type</label>
            <select
              value={event.eventType}
              onChange={(e) => {
                const newType = e.target.value as TripEventType
                // Reset event to defaults for new type
                onUpdate(createDefaultEvent(newType, event.id, event.date, event.time))
              }}
              className="input-base w-full"
            >
              <optgroup label="Travel">
                <option value="flight">✈️ Flight</option>
                <option value="train">🚂 Train</option>
                <option value="driving_ev">⚡ Drive (EV)</option>
                <option value="driving_rental">🚗 Drive (Rental)</option>
              </optgroup>
              <optgroup label="Accommodations">
                <option value="hotel">🏨 Hotel</option>
                <option value="airbnb">🏠 Airbnb</option>
                <option value="family_stay">👨‍👩‍👧 Family/Friends</option>
              </optgroup>
              <optgroup label="Logistics">
                <option value="airport_parking">🅿️ Airport Parking</option>
                <option value="rental_pickup">🔑 Car Rental Pickup</option>
                <option value="rental_dropoff">📍 Car Rental Dropoff</option>
                <option value="other">📝 Other</option>
              </optgroup>
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
              <input
                type="date"
                value={event.date}
                onChange={(e) => onUpdate({ date: e.target.value })}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Time</label>
              <input
                type="time"
                value={event.time || ''}
                onChange={(e) => onUpdate({ time: e.target.value })}
                className="input-base w-full"
              />
            </div>
          </div>

          {/* Event-specific fields */}
          <EventSpecificFields event={event} onUpdate={onUpdate} />

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Notes</label>
            <textarea
              value={event.notes || ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="Add any additional notes..."
              rows={2}
              className="input-base w-full resize-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Event-Specific Form Fields
// ============================================================================

interface EventSpecificFieldsProps {
  event: TripEvent
  onUpdate: (updates: Partial<TripEvent>) => void
}

function EventSpecificFields({ event, onUpdate }: EventSpecificFieldsProps) {
  switch (event.eventType) {
    case 'flight':
      return <FlightFields event={event as any} onUpdate={onUpdate} />
    case 'train':
      return <TrainFields event={event as any} onUpdate={onUpdate} />
    case 'driving_ev':
      return <DrivingEVFields event={event as any} onUpdate={onUpdate} />
    case 'driving_rental':
      return <DrivingRentalFields event={event as any} onUpdate={onUpdate} />
    case 'hotel':
    case 'airbnb':
    case 'family_stay':
      return <AccommodationFields event={event as any} onUpdate={onUpdate} />
    case 'airport_parking':
    case 'rental_pickup':
    case 'rental_dropoff':
    case 'other':
      return <LogisticFields event={event as any} onUpdate={onUpdate} />
    default:
      return null
  }
}

// Flight-specific fields
function FlightFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const {
    query: originQuery,
    setQuery: setOriginQuery,
    results: originResults,
    selectPlace: selectOriginPlace,
  } = usePlaceAutocomplete()

  const {
    query: destQuery,
    setQuery: setDestQuery,
    results: destResults,
    selectPlace: selectDestPlace,
  } = usePlaceAutocomplete()

  const handleOriginSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ origin: location })
      selectOriginPlace(place)
    },
    [onUpdate, selectOriginPlace]
  )

  const handleDestSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ destination: location })
      selectDestPlace(place)
    },
    [onUpdate, selectDestPlace]
  )

  return (
    <>
      {/* Origin & Destination */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">From</label>
          <input
            type="text"
            value={originQuery || event.origin?.address || ''}
            onChange={(e) => setOriginQuery(e.target.value)}
            placeholder="Origin airport"
            className="input-base w-full"
          />
          {originResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {originResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleOriginSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">To</label>
          <input
            type="text"
            value={destQuery || event.destination?.address || ''}
            onChange={(e) => setDestQuery(e.target.value)}
            placeholder="Destination airport"
            className="input-base w-full"
          />
          {destResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {destResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleDestSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Flight details */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Airline</label>
          <input
            type="text"
            value={event.airline || ''}
            onChange={(e) => onUpdate({ airline: e.target.value })}
            placeholder="e.g. United"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Flight #</label>
          <input
            type="text"
            value={event.flightNumber || ''}
            onChange={(e) => onUpdate({ flightNumber: e.target.value })}
            placeholder="e.g. UA123"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirmation</label>
          <input
            type="text"
            value={event.confirmationNumber || ''}
            onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
            placeholder="ABC123"
            className="input-base w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Departure Time</label>
          <input
            type="time"
            value={event.departureTime || ''}
            onChange={(e) => onUpdate({ departureTime: e.target.value })}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Arrival Time</label>
          <input
            type="time"
            value={event.arrivalTime || ''}
            onChange={(e) => onUpdate({ arrivalTime: e.target.value })}
            className="input-base w-full"
          />
        </div>
      </div>
    </>
  )
}

// Train-specific fields (similar to flight)
function TrainFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const {
    query: originQuery,
    setQuery: setOriginQuery,
    results: originResults,
    selectPlace: selectOriginPlace,
  } = usePlaceAutocomplete()

  const {
    query: destQuery,
    setQuery: setDestQuery,
    results: destResults,
    selectPlace: selectDestPlace,
  } = usePlaceAutocomplete()

  const handleOriginSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ origin: location })
      selectOriginPlace(place)
    },
    [onUpdate, selectOriginPlace]
  )

  const handleDestSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ destination: location })
      selectDestPlace(place)
    },
    [onUpdate, selectDestPlace]
  )

  return (
    <>
      {/* Origin & Destination */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">From</label>
          <input
            type="text"
            value={originQuery || event.origin?.address || ''}
            onChange={(e) => setOriginQuery(e.target.value)}
            placeholder="Origin station"
            className="input-base w-full"
          />
          {originResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {originResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleOriginSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">To</label>
          <input
            type="text"
            value={destQuery || event.destination?.address || ''}
            onChange={(e) => setDestQuery(e.target.value)}
            placeholder="Destination station"
            className="input-base w-full"
          />
          {destResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {destResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleDestSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Train details */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Line</label>
          <input
            type="text"
            value={event.line || ''}
            onChange={(e) => onUpdate({ line: e.target.value })}
            placeholder="e.g. Amtrak"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Train #</label>
          <input
            type="text"
            value={event.trainNumber || ''}
            onChange={(e) => onUpdate({ trainNumber: e.target.value })}
            placeholder="e.g. 123"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirmation</label>
          <input
            type="text"
            value={event.confirmationNumber || ''}
            onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
            placeholder="ABC123"
            className="input-base w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Departure Time</label>
          <input
            type="time"
            value={event.departureTime || ''}
            onChange={(e) => onUpdate({ departureTime: e.target.value })}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Arrival Time</label>
          <input
            type="time"
            value={event.arrivalTime || ''}
            onChange={(e) => onUpdate({ arrivalTime: e.target.value })}
            className="input-base w-full"
          />
        </div>
      </div>
    </>
  )
}

// Driving EV fields
function DrivingEVFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const {
    query: originQuery,
    setQuery: setOriginQuery,
    results: originResults,
    selectPlace: selectOriginPlace,
  } = usePlaceAutocomplete()

  const {
    query: destQuery,
    setQuery: setDestQuery,
    results: destResults,
    selectPlace: selectDestPlace,
  } = usePlaceAutocomplete()

  const handleOriginSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ origin: location })
      selectOriginPlace(place)
    },
    [onUpdate, selectOriginPlace]
  )

  const handleDestSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ destination: location })
      selectDestPlace(place)
    },
    [onUpdate, selectDestPlace]
  )

  return (
    <>
      {/* Origin & Destination */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">From</label>
          <input
            type="text"
            value={originQuery || event.origin?.address || ''}
            onChange={(e) => setOriginQuery(e.target.value)}
            placeholder="Starting location"
            className="input-base w-full"
          />
          {originResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {originResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleOriginSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">To</label>
          <input
            type="text"
            value={destQuery || event.destination?.address || ''}
            onChange={(e) => setDestQuery(e.target.value)}
            placeholder="Destination"
            className="input-base w-full"
          />
          {destResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {destResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleDestSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EV Vehicle */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Vehicle</label>
        <select
          value={event.evVehicle?.model || ''}
          onChange={(e) => {
            const vehicle = EV_VEHICLES.find((v) => v.model === e.target.value)
            if (vehicle) {
              onUpdate({
                evVehicle: {
                  model: vehicle.model,
                  batteryCapacity: vehicle.batteryCapacity,
                  rangePerCharge: vehicle.rangeEPA,
                  currentBattery: event.evVehicle?.currentBattery || 80,
                  preferredNetworks: vehicle.chargingNetworks,
                },
              })
            }
          }}
          className="input-base w-full"
        >
          <option value="">Select vehicle...</option>
          {EV_VEHICLES.map((vehicle) => (
            <option key={vehicle.model} value={vehicle.model}>
              {vehicle.manufacturer} {vehicle.model} ({vehicle.rangeEPA} mi range)
            </option>
          ))}
        </select>
      </div>

      {event.evVehicle && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Starting Battery: {event.evVehicle.currentBattery}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={event.evVehicle.currentBattery}
            onChange={(e) =>
              onUpdate({
                evVehicle: {
                  ...event.evVehicle,
                  currentBattery: parseInt(e.target.value),
                },
              })
            }
            className="w-full"
          />
        </div>
      )}
    </>
  )
}

// Driving Rental fields
function DrivingRentalFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const {
    query: originQuery,
    setQuery: setOriginQuery,
    results: originResults,
    selectPlace: selectOriginPlace,
  } = usePlaceAutocomplete()

  const {
    query: destQuery,
    setQuery: setDestQuery,
    results: destResults,
    selectPlace: selectDestPlace,
  } = usePlaceAutocomplete()

  const handleOriginSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ origin: location })
      selectOriginPlace(place)
    },
    [onUpdate, selectOriginPlace]
  )

  const handleDestSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ destination: location })
      selectDestPlace(place)
    },
    [onUpdate, selectDestPlace]
  )

  return (
    <>
      {/* Origin & Destination */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">From</label>
          <input
            type="text"
            value={originQuery || event.origin?.address || ''}
            onChange={(e) => setOriginQuery(e.target.value)}
            placeholder="Starting location"
            className="input-base w-full"
          />
          {originResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {originResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleOriginSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-neutral-700 mb-1">To</label>
          <input
            type="text"
            value={destQuery || event.destination?.address || ''}
            onChange={(e) => setDestQuery(e.target.value)}
            placeholder="Destination"
            className="input-base w-full"
          />
          {destResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {destResults.map((place) => (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => handleDestSelect(place)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                >
                  <div className="font-medium">{place.mainText}</div>
                  <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rental details */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Company</label>
          <input
            type="text"
            value={event.rentalCar?.company || ''}
            onChange={(e) =>
              onUpdate({
                rentalCar: { ...event.rentalCar, company: e.target.value },
              })
            }
            placeholder="e.g. Hertz"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirmation</label>
          <input
            type="text"
            value={event.rentalCar?.confirmationNumber || ''}
            onChange={(e) =>
              onUpdate({
                rentalCar: { ...event.rentalCar, confirmationNumber: e.target.value },
              })
            }
            placeholder="ABC123"
            className="input-base w-full"
          />
        </div>
      </div>
    </>
  )
}

// Accommodation fields (hotel, airbnb, family)
function AccommodationFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const { query, setQuery, results, selectPlace } = usePlaceAutocomplete()

  const handleLocationSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ location, address: place.description })
      selectPlace(place)
    },
    [onUpdate, selectPlace]
  )

  return (
    <>
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
        <input
          type="text"
          value={event.name || ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Hotel/Airbnb name or person's name"
          className="input-base w-full"
        />
      </div>

      {/* Location */}
      <div className="relative">
        <label className="block text-sm font-medium text-neutral-700 mb-1">Location</label>
        <input
          type="text"
          value={query || event.location?.address || ''}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for location..."
          className="input-base w-full"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((place) => (
              <button
                key={place.placeId}
                type="button"
                onClick={() => handleLocationSelect(place)}
                className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
              >
                <div className="font-medium">{place.mainText}</div>
                <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Check-in / Check-out */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Check-in</label>
          <input
            type="date"
            value={event.checkIn || ''}
            onChange={(e) => onUpdate({ checkIn: e.target.value, date: e.target.value })}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Check-out</label>
          <input
            type="date"
            value={event.checkOut || ''}
            onChange={(e) => onUpdate({ checkOut: e.target.value })}
            className="input-base w-full"
          />
        </div>
      </div>

      {/* Confirmation, Address, Phone */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirmation</label>
          <input
            type="text"
            value={event.confirmationNumber || ''}
            onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
            placeholder="ABC123"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Address</label>
          <input
            type="text"
            value={event.address || ''}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Street address"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
          <input
            type="tel"
            value={event.phone || ''}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            placeholder="(555) 123-4567"
            className="input-base w-full"
          />
        </div>
      </div>
    </>
  )
}

// Logistics fields (parking, rental pickup/dropoff, other)
function LogisticFields({ event, onUpdate }: { event: any; onUpdate: (updates: any) => void }) {
  const { query, setQuery, results, selectPlace } = usePlaceAutocomplete()

  const handleLocationSelect = useCallback(
    (place: PlaceAutocompleteResult) => {
      const location: Location = {
        name: place.mainText || place.description,
        address: place.description,
        placeId: place.placeId,
      }
      onUpdate({ location })
      selectPlace(place)
    },
    [onUpdate, selectPlace]
  )

  return (
    <>
      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
        <input
          type="text"
          value={event.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="What is this logistics item?"
          className="input-base w-full"
        />
      </div>

      {/* Location */}
      <div className="relative">
        <label className="block text-sm font-medium text-neutral-700 mb-1">Location</label>
        <input
          type="text"
          value={query || event.location?.address || ''}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for location..."
          className="input-base w-full"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((place) => (
              <button
                key={place.placeId}
                type="button"
                onClick={() => handleLocationSelect(place)}
                className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
              >
                <div className="font-medium">{place.mainText}</div>
                <div className="text-neutral-600 text-xs">{place.secondaryText}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Confirmation Number</label>
        <input
          type="text"
          value={event.confirmationNumber || ''}
          onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
          placeholder="ABC123"
          className="input-base w-full"
        />
      </div>
    </>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultEvent(type: TripEventType, id: string, date: string, time?: string): Partial<TripEvent> {
  const base = { id, eventType: type, date, time, notes: '' }

  switch (type) {
    case 'flight':
    case 'train':
    case 'driving_ev':
    case 'driving_rental':
      return {
        ...base,
        origin: { name: '', address: '' },
        destination: { name: '', address: '' },
      }
    case 'hotel':
    case 'airbnb':
    case 'family_stay':
      return {
        ...base,
        name: '',
        location: { name: '', address: '' },
        checkIn: date,
        checkOut: '',
      }
    case 'airport_parking':
    case 'rental_pickup':
    case 'rental_dropoff':
    case 'other':
      return {
        ...base,
        description: '',
        location: { name: '', address: '' },
      }
    default:
      return base
  }
}

// ============================================================================
// Constants
// ============================================================================

const EVENT_TYPE_CONFIG: Record<
  TripEventType,
  {
    label: string
    icon: string
  }
> = {
  flight: { label: 'Flight', icon: '✈️' },
  train: { label: 'Train', icon: '🚂' },
  driving_ev: { label: 'Drive (EV)', icon: '⚡' },
  driving_rental: { label: 'Drive (Rental)', icon: '🚗' },
  hotel: { label: 'Hotel', icon: '🏨' },
  airbnb: { label: 'Airbnb', icon: '🏠' },
  family_stay: { label: 'Family/Friends', icon: '👨‍👩‍👧' },
  airport_parking: { label: 'Airport Parking', icon: '🅿️' },
  rental_pickup: { label: 'Car Rental Pickup', icon: '🔑' },
  rental_dropoff: { label: 'Car Rental Dropoff', icon: '📍' },
  other: { label: 'Other', icon: '📝' },
}
