/**
 * Segment Builder Component
 * UI for building multi-segment trips with different travel modes
 */

import React, { useState, useCallback } from 'react'
import type { TripSegment, SegmentType, Location, ChargingNetwork } from '@/types/trip'
import type { PlaceAutocompleteResult } from '@/hooks/usePlaceAutocomplete'
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete'
import { EV_VEHICLES } from '@/types/trip'

interface SegmentBuilderProps {
  segments: TripSegment[]
  onChange: (segments: TripSegment[]) => void
}

export function SegmentBuilder({ segments, onChange }: SegmentBuilderProps) {
  const handleAddSegment = useCallback(() => {
    const newSegment: TripSegment = {
      id: `segment-${Date.now()}`,
      type: 'driving_ev',
      origin: { name: '', address: '' },
      destination: { name: '', address: '' },
      date: new Date().toISOString().split('T')[0],
    }
    onChange([...segments, newSegment])
  }, [segments, onChange])

  const handleRemoveSegment = useCallback(
    (index: number) => {
      onChange(segments.filter((_, i) => i !== index))
    },
    [segments, onChange]
  )

  const handleUpdateSegment = useCallback(
    (index: number, updates: Partial<TripSegment>) => {
      const updated = segments.map((seg, i) => (i === index ? { ...seg, ...updates } : seg))
      onChange(updated)
    },
    [segments, onChange]
  )

  const handleMoveSegment = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return
      if (direction === 'down' && index === segments.length - 1) return

      const newSegments = [...segments]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      ;[newSegments[index], newSegments[targetIndex]] = [newSegments[targetIndex], newSegments[index]]
      onChange(newSegments)
    },
    [segments, onChange]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-semibold">Trip Segments</h3>
        <button
          type="button"
          onClick={handleAddSegment}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Segment
        </button>
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-8 text-secondary-600">
          <p>No segments yet. Click "Add Segment" to start building your trip.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((segment, index) => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              index={index}
              totalSegments={segments.length}
              onUpdate={(updates) => handleUpdateSegment(index, updates)}
              onRemove={() => handleRemoveSegment(index)}
              onMove={(direction) => handleMoveSegment(index, direction)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Segment Card Component
// ============================================================================

interface SegmentCardProps {
  segment: TripSegment
  index: number
  totalSegments: number
  onUpdate: (updates: Partial<TripSegment>) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
}

function SegmentCard({ segment, index, totalSegments, onUpdate, onRemove, onMove }: SegmentCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Location autocomplete for origin
  const {
    query: originQuery,
    setQuery: setOriginQuery,
    results: originResults,
    selectPlace: selectOriginPlace,
  } = usePlaceAutocomplete()

  // Location autocomplete for destination
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
    <div className="card bg-bg-elevated p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onMove('up')}
              disabled={index === 0}
              className="p-0.5 text-secondary-600 hover:text-secondary-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMove('down')}
              disabled={index === totalSegments - 1}
              className="p-0.5 text-secondary-600 hover:text-secondary-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <span className="text-sm font-medium text-secondary-600">Segment {index + 1}</span>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-secondary-600 hover:text-secondary-900"
          >
            <svg
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="text-red-600 hover:text-red-700 p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Segment Type Selector */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-2">Travel Mode</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SEGMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => onUpdate({ type: type.value })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    segment.type === type.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                >
                  {type.icon}
                  <span className="text-xs font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Origin & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Origin */}
            <div className="relative">
              <label className="block text-sm font-medium text-secondary-900 mb-1">From</label>
              <input
                type="text"
                value={segment.origin.address || originQuery}
                onChange={(e) => {
                  setOriginQuery(e.target.value)
                  onUpdate({ origin: { name: '', address: e.target.value } })
                }}
                placeholder="Origin"
                className="input-base w-full"
              />
              {originResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-secondary-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {originResults.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      onClick={() => handleOriginSelect(place)}
                      className="w-full px-4 py-2 text-left hover:bg-secondary-50 text-sm"
                    >
                      <div className="font-medium">{place.mainText}</div>
                      <div className="text-secondary-600 text-xs">
                        {place.secondaryText}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Destination */}
            <div className="relative">
              <label className="block text-sm font-medium text-secondary-900 mb-1">To</label>
              <input
                type="text"
                value={segment.destination.address || destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value)
                  onUpdate({ destination: { name: '', address: e.target.value } })
                }}
                placeholder="Destination"
                className="input-base w-full"
              />
              {destResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-secondary-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {destResults.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      onClick={() => handleDestSelect(place)}
                      className="w-full px-4 py-2 text-left hover:bg-secondary-50 text-sm"
                    >
                      <div className="font-medium">{place.mainText}</div>
                      <div className="text-secondary-600 text-xs">
                        {place.secondaryText}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">Date</label>
              <input
                type="date"
                value={segment.date}
                onChange={(e) => onUpdate({ date: e.target.value })}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">Time (optional)</label>
              <input
                type="time"
                value={segment.time || ''}
                onChange={(e) => onUpdate({ time: e.target.value })}
                className="input-base w-full"
              />
            </div>
          </div>

          {/* Mode-specific fields */}
          {segment.type === 'driving_ev' && (
            <EVSegmentFields segment={segment} onUpdate={onUpdate} />
          )}
          {segment.type === 'driving_rental' && (
            <RentalCarFields segment={segment} onUpdate={onUpdate} />
          )}
          {segment.type === 'flying' && <FlightFields segment={segment} onUpdate={onUpdate} />}
          {segment.type === 'train' && <TrainFields segment={segment} onUpdate={onUpdate} />}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">Notes (optional)</label>
            <textarea
              value={segment.notes || ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="Add any additional notes for this segment..."
              className="input-base w-full h-20 resize-none"
            />
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Mode-Specific Field Components
// ============================================================================

function EVSegmentFields({
  segment,
  onUpdate,
}: {
  segment: TripSegment
  onUpdate: (updates: Partial<TripSegment>) => void
}) {
  const handleEVUpdate = useCallback(
    (field: string, value: string | number | ChargingNetwork[]) => {
      onUpdate({
        evVehicle: {
          model: segment.evVehicle?.model || '',
          batteryCapacity: segment.evVehicle?.batteryCapacity || 0,
          rangePerCharge: segment.evVehicle?.rangePerCharge || 0,
          currentBattery: segment.evVehicle?.currentBattery || 80,
          preferredNetworks: segment.evVehicle?.preferredNetworks,
          [field]: value,
        },
      })
    },
    [segment.evVehicle, onUpdate]
  )

  return (
    <div className="space-y-3 p-3 bg-primary-50 rounded-lg border border-primary-200">
      <h4 className="text-sm font-semibold text-primary-900">EV Details</h4>

      <div>
        <label className="block text-sm font-medium text-secondary-900 mb-1">Vehicle</label>
        <select
          value={segment.evVehicle?.model || ''}
          onChange={(e) => {
            const vehicle = EV_VEHICLES.find((v) => v.model === e.target.value)
            if (vehicle) {
              // Batch all updates into a single state update
              onUpdate({
                evVehicle: {
                  model: vehicle.model,
                  batteryCapacity: vehicle.batteryCapacity,
                  rangePerCharge: vehicle.rangeEPA,
                  currentBattery: segment.evVehicle?.currentBattery || 80,
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

      {segment.evVehicle?.model && (
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">
            Current Battery (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={segment.evVehicle.currentBattery}
            onChange={(e) => handleEVUpdate('currentBattery', parseInt(e.target.value))}
            className="input-base w-full"
          />
        </div>
      )}
    </div>
  )
}

function RentalCarFields({
  segment,
  onUpdate,
}: {
  segment: TripSegment
  onUpdate: (updates: Partial<TripSegment>) => void
}) {
  const handleRentalUpdate = useCallback(
    (field: string, value: string) => {
      onUpdate({
        rentalCar: {
          company: segment.rentalCar?.company,
          confirmationNumber: segment.rentalCar?.confirmationNumber,
          [field]: value,
        },
      })
    },
    [segment.rentalCar, onUpdate]
  )

  return (
    <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <h4 className="text-sm font-semibold text-blue-900">Rental Car Details</h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Company</label>
          <input
            type="text"
            value={segment.rentalCar?.company || ''}
            onChange={(e) => handleRentalUpdate('company', e.target.value)}
            placeholder="e.g., Enterprise, Hertz..."
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Confirmation #</label>
          <input
            type="text"
            value={segment.rentalCar?.confirmationNumber || ''}
            onChange={(e) => handleRentalUpdate('confirmationNumber', e.target.value)}
            placeholder="Confirmation number"
            className="input-base w-full"
          />
        </div>
      </div>
    </div>
  )
}

function FlightFields({
  segment,
  onUpdate,
}: {
  segment: TripSegment
  onUpdate: (updates: Partial<TripSegment>) => void
}) {
  const handleFlightUpdate = useCallback(
    (field: string, value: string) => {
      onUpdate({
        flight: {
          airline: segment.flight?.airline,
          flightNumber: segment.flight?.flightNumber,
          confirmationNumber: segment.flight?.confirmationNumber,
          departureTime: segment.flight?.departureTime,
          arrivalTime: segment.flight?.arrivalTime,
          [field]: value,
        },
      })
    },
    [segment.flight, onUpdate]
  )

  return (
    <div className="space-y-3 p-3 bg-sky-50 rounded-lg border border-sky-200">
      <h4 className="text-sm font-semibold text-sky-900">Flight Details</h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Airline</label>
          <input
            type="text"
            value={segment.flight?.airline || ''}
            onChange={(e) => handleFlightUpdate('airline', e.target.value)}
            placeholder="e.g., United, Delta..."
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Flight Number</label>
          <input
            type="text"
            value={segment.flight?.flightNumber || ''}
            onChange={(e) => handleFlightUpdate('flightNumber', e.target.value)}
            placeholder="e.g., UA1234"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Confirmation #</label>
          <input
            type="text"
            value={segment.flight?.confirmationNumber || ''}
            onChange={(e) => handleFlightUpdate('confirmationNumber', e.target.value)}
            placeholder="Confirmation"
            className="input-base w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Departure Time</label>
          <input
            type="time"
            value={segment.flight?.departureTime || ''}
            onChange={(e) => handleFlightUpdate('departureTime', e.target.value)}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Arrival Time</label>
          <input
            type="time"
            value={segment.flight?.arrivalTime || ''}
            onChange={(e) => handleFlightUpdate('arrivalTime', e.target.value)}
            className="input-base w-full"
          />
        </div>
      </div>
    </div>
  )
}

function TrainFields({
  segment,
  onUpdate,
}: {
  segment: TripSegment
  onUpdate: (updates: Partial<TripSegment>) => void
}) {
  const handleTrainUpdate = useCallback(
    (field: string, value: string) => {
      onUpdate({
        train: {
          line: segment.train?.line,
          trainNumber: segment.train?.trainNumber,
          confirmationNumber: segment.train?.confirmationNumber,
          departureTime: segment.train?.departureTime,
          arrivalTime: segment.train?.arrivalTime,
          [field]: value,
        },
      })
    },
    [segment.train, onUpdate]
  )

  return (
    <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
      <h4 className="text-sm font-semibold text-purple-900">Train Details</h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Line</label>
          <input
            type="text"
            value={segment.train?.line || ''}
            onChange={(e) => handleTrainUpdate('line', e.target.value)}
            placeholder="e.g., Amtrak, Via Rail..."
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Train Number</label>
          <input
            type="text"
            value={segment.train?.trainNumber || ''}
            onChange={(e) => handleTrainUpdate('trainNumber', e.target.value)}
            placeholder="e.g., Train 69"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Confirmation #</label>
          <input
            type="text"
            value={segment.train?.confirmationNumber || ''}
            onChange={(e) => handleTrainUpdate('confirmationNumber', e.target.value)}
            placeholder="Confirmation"
            className="input-base w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Departure Time</label>
          <input
            type="time"
            value={segment.train?.departureTime || ''}
            onChange={(e) => handleTrainUpdate('departureTime', e.target.value)}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-900 mb-1">Arrival Time</label>
          <input
            type="time"
            value={segment.train?.arrivalTime || ''}
            onChange={(e) => handleTrainUpdate('arrivalTime', e.target.value)}
            className="input-base w-full"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Constants
// ============================================================================

const SEGMENT_TYPES: Array<{ value: SegmentType; label: string; icon: React.ReactNode }> = [
  {
    value: 'driving_ev',
    label: 'EV',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    value: 'driving_rental',
    label: 'Rental',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
  },
  {
    value: 'flying',
    label: 'Flight',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
        />
      </svg>
    ),
  },
  {
    value: 'train',
    label: 'Train',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
      </svg>
    ),
  },
  {
    value: 'other',
    label: 'Other',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
]
