/**
 * Accommodation Builder Component
 * UI for tracking hotels, Airbnbs, and other accommodations during trips
 */

import React, { useState, useCallback } from 'react'
import type { Accommodation, AccommodationType, Location } from '@/types/trip'
import type { PlaceAutocompleteResult } from '@/hooks/usePlaceAutocomplete'
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete'

interface AccommodationBuilderProps {
  accommodations: Accommodation[]
  onChange: (accommodations: Accommodation[]) => void
}

export function AccommodationBuilder({ accommodations, onChange }: AccommodationBuilderProps) {
  const handleAddAccommodation = useCallback(() => {
    const newAccommodation: Accommodation = {
      id: `accommodation-${Date.now()}`,
      type: 'hotel',
      name: '',
      location: { name: '', address: '' },
      checkIn: new Date().toISOString().split('T')[0],
      checkOut: new Date().toISOString().split('T')[0],
    }
    onChange([...accommodations, newAccommodation])
  }, [accommodations, onChange])

  const handleRemoveAccommodation = useCallback(
    (index: number) => {
      onChange(accommodations.filter((_, i) => i !== index))
    },
    [accommodations, onChange]
  )

  const handleUpdateAccommodation = useCallback(
    (index: number, updates: Partial<Accommodation>) => {
      const updated = accommodations.map((acc, i) => (i === index ? { ...acc, ...updates } : acc))
      onChange(updated)
    },
    [accommodations, onChange]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-semibold">Accommodations</h3>
        <button
          type="button"
          onClick={handleAddAccommodation}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Stay
        </button>
      </div>

      {accommodations.length === 0 ? (
        <div className="text-center py-8 text-secondary-600">
          <p>No accommodations yet. Click "Add Stay" to add hotels, Airbnbs, or other stays.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accommodations.map((accommodation, index) => (
            <AccommodationCard
              key={accommodation.id}
              accommodation={accommodation}
              onUpdate={(updates) => handleUpdateAccommodation(index, updates)}
              onRemove={() => handleRemoveAccommodation(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Accommodation Card Component
// ============================================================================

interface AccommodationCardProps {
  accommodation: Accommodation
  onUpdate: (updates: Partial<Accommodation>) => void
  onRemove: () => void
}

function AccommodationCard({ accommodation, onUpdate, onRemove }: AccommodationCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Location autocomplete
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
    <div className="card bg-bg-elevated p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
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

          <div className="flex-1">
            {accommodation.name ? (
              <div>
                <div className="font-medium">{accommodation.name}</div>
                <div className="text-sm text-secondary-600">
                  {new Date(accommodation.checkIn).toLocaleDateString()} -{' '}
                  {new Date(accommodation.checkOut).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="text-secondary-500 italic">Untitled stay</div>
            )}
          </div>
        </div>

        <button type="button" onClick={onRemove} className="text-red-600 hover:text-red-700 p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Accommodation Type */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-2">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACCOMMODATION_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => onUpdate({ type: type.value })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    accommodation.type === type.value
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

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">Name</label>
            <input
              type="text"
              value={accommodation.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Hotel name or description..."
              className="input-base w-full"
            />
          </div>

          {/* Location */}
          <div className="relative">
            <label className="block text-sm font-medium text-secondary-900 mb-1">Location</label>
            <input
              type="text"
              value={accommodation.location.address || query}
              onChange={(e) => {
                setQuery(e.target.value)
                onUpdate({ location: { name: '', address: e.target.value } })
              }}
              placeholder="Search for location..."
              className="input-base w-full"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-secondary-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {results.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onClick={() => handleLocationSelect(place)}
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

          {/* Check-in / Check-out */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">Check-in</label>
              <input
                type="date"
                value={accommodation.checkIn}
                onChange={(e) => onUpdate({ checkIn: e.target.value })}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">Check-out</label>
              <input
                type="date"
                value={accommodation.checkOut}
                onChange={(e) => onUpdate({ checkOut: e.target.value })}
                className="input-base w-full"
              />
            </div>
          </div>

          {/* Confirmation Number */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">
              Confirmation # (optional)
            </label>
            <input
              type="text"
              value={accommodation.confirmationNumber || ''}
              onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
              placeholder="Confirmation number"
              className="input-base w-full"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">
              Street Address (optional)
            </label>
            <input
              type="text"
              value={accommodation.address || ''}
              onChange={(e) => onUpdate({ address: e.target.value })}
              placeholder="Full street address"
              className="input-base w-full"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">
              Phone (optional)
            </label>
            <input
              type="tel"
              value={accommodation.phone || ''}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              placeholder="Phone number"
              className="input-base w-full"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={accommodation.notes || ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="Add any additional notes..."
              className="input-base w-full h-20 resize-none"
            />
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Constants
// ============================================================================

const ACCOMMODATION_TYPES: Array<{ value: AccommodationType; label: string; icon: React.ReactNode }> = [
  {
    value: 'hotel',
    label: 'Hotel',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
  },
  {
    value: 'airbnb',
    label: 'Airbnb',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    value: 'family',
    label: 'Family',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
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
          d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
        />
      </svg>
    ),
  },
]
