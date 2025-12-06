import { useState } from 'react'
import type { RouteStop, DirectionsLeg } from '@/types/directions'
import { formatDuration, formatDistance } from '@/hooks/useDirections'

interface StopItemProps {
  stop: RouteStop
  type: 'origin' | 'stop' | 'destination'
  onEdit?: (stop: RouteStop) => void
  onRemove?: () => void
  onChangeLocation?: () => void
  /** Leg info for travel to the next stop (shown below this stop) */
  legToNext?: DirectionsLeg
}

export function StopItem({ stop, type, onEdit, onRemove, onChangeLocation, legToNext }: StopItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(stop.name)

  const handleSave = () => {
    if (editedName.trim() && onEdit) {
      onEdit({ ...stop, name: editedName.trim() })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditedName(stop.name)
      setIsEditing(false)
    }
  }

  // Icon based on type
  const icon = type === 'origin' ? (
    <div className="w-6 h-6 rounded-full border-2 border-primary-500 flex items-center justify-center bg-white" />
  ) : type === 'destination' ? (
    <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-white" />
    </div>
  ) : (
    <div className="w-6 h-6 rounded-full border-2 border-neutral-300 flex items-center justify-center bg-white" />
  )

  return (
    <div>
      <div className="flex items-start gap-3 py-2">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-sm border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-800 truncate">
                {stop.name}
              </span>
              {type === 'stop' && onEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-neutral-400 hover:text-neutral-600 flex-shrink-0"
                  title="Edit name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {stop.address}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {(type === 'origin' || type === 'destination') && onChangeLocation && (
            <button
              onClick={onChangeLocation}
              className="p-1.5 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
              title="Change location"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {type === 'stop' && onRemove && (
            <button
              onClick={onRemove}
              className="p-1.5 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors"
              title="Remove stop"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Travel time to next stop */}
      {legToNext && (
        <div className="ml-3 flex items-center gap-2 py-1.5">
          <div className="border-l-2 border-dashed border-neutral-200 h-4" />
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-50 rounded text-xs text-neutral-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            <span>{formatDuration(legToNext.duration)}</span>
            <span className="text-neutral-300">·</span>
            <span>{formatDistance(legToNext.distance)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
