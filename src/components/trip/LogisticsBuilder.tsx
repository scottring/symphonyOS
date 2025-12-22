/**
 * Logistics Builder Component
 * UI for tracking transportation logistics like airport parking, rental car pickups, etc.
 */

import React, { useState, useCallback } from 'react'
import type { TransportationLogistic, TransportationLogisticType, Location } from '@/types/trip'
import type { PlaceAutocompleteResult } from '@/hooks/usePlaceAutocomplete'
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete'

interface LogisticsBuilderProps {
  logistics: TransportationLogistic[]
  onChange: (logistics: TransportationLogistic[]) => void
}

export function LogisticsBuilder({ logistics, onChange }: LogisticsBuilderProps) {
  const handleAddLogistic = useCallback(() => {
    const newLogistic: TransportationLogistic = {
      id: `logistic-${Date.now()}`,
      type: 'airport_parking',
      description: '',
      location: { name: '', address: '' },
      date: new Date().toISOString().split('T')[0],
    }
    onChange([...logistics, newLogistic])
  }, [logistics, onChange])

  const handleRemoveLogistic = useCallback(
    (index: number) => {
      onChange(logistics.filter((_, i) => i !== index))
    },
    [logistics, onChange]
  )

  const handleUpdateLogistic = useCallback(
    (index: number, updates: Partial<TransportationLogistic>) => {
      const updated = logistics.map((log, i) => (i === index ? { ...log, ...updates } : log))
      onChange(updated)
    },
    [logistics, onChange]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-semibold">Transportation Logistics</h3>
        <button
          type="button"
          onClick={handleAddLogistic}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {logistics.length === 0 ? (
        <div className="text-center py-8 text-secondary-600">
          <p>No logistics items yet. Click "Add Item" to add parking, rental pickups, etc.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logistics.map((logistic, index) => (
            <LogisticCard
              key={logistic.id}
              logistic={logistic}
              onUpdate={(updates) => handleUpdateLogistic(index, updates)}
              onRemove={() => handleRemoveLogistic(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Logistic Card Component
// ============================================================================

interface LogisticCardProps {
  logistic: TransportationLogistic
  onUpdate: (updates: Partial<TransportationLogistic>) => void
  onRemove: () => void
}

function LogisticCard({ logistic, onUpdate, onRemove }: LogisticCardProps) {
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
      onUpdate({ location })
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
            {logistic.description ? (
              <div>
                <div className="font-medium">{logistic.description}</div>
                <div className="text-sm text-secondary-600">
                  {LOGISTIC_TYPES.find((t) => t.value === logistic.type)?.label} •{' '}
                  {new Date(logistic.date).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="text-secondary-500 italic">Untitled logistic item</div>
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
          {/* Logistic Type */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-2">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LOGISTIC_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => onUpdate({ type: type.value })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    logistic.type === type.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                >
                  {type.icon}
                  <span className="text-xs font-medium text-center">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">Description</label>
            <input
              type="text"
              value={logistic.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="e.g., Drop off car at long-term parking..."
              className="input-base w-full"
            />
          </div>

          {/* Location */}
          <div className="relative">
            <label className="block text-sm font-medium text-secondary-900 mb-1">Location</label>
            <input
              type="text"
              value={logistic.location.address || query}
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

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">Date</label>
              <input
                type="date"
                value={logistic.date}
                onChange={(e) => onUpdate({ date: e.target.value })}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-900 mb-1">
                Time (optional)
              </label>
              <input
                type="time"
                value={logistic.time || ''}
                onChange={(e) => onUpdate({ time: e.target.value })}
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
              value={logistic.confirmationNumber || ''}
              onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
              placeholder="Confirmation number"
              className="input-base w-full"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-secondary-900 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={logistic.notes || ''}
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

const LOGISTIC_TYPES: Array<{
  value: TransportationLogisticType
  label: string
  icon: React.ReactNode
}> = [
  {
    value: 'airport_parking',
    label: 'Airport Parking',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        />
      </svg>
    ),
  },
  {
    value: 'rental_pickup',
    label: 'Rental Pickup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    value: 'rental_dropoff',
    label: 'Rental Dropoff',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
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
