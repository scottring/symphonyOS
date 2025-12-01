import { useState } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'

interface DetailPanelProps {
  item: TimelineItem | null
  onClose: () => void
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  onDelete?: (taskId: string) => void
  onToggleComplete?: (taskId: string) => void
}

export function DetailPanel({ item, onClose, onUpdate, onDelete, onToggleComplete }: DetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [newLink, setNewLink] = useState('')

  if (!item) return null

  const isTask = item.type === 'task'
  const hasContext = item.notes || item.phoneNumber || item.links?.length || item.location

  const handleCall = () => {
    if (item.phoneNumber) {
      window.location.href = `tel:${item.phoneNumber}`
    }
  }

  const handleText = () => {
    if (item.phoneNumber) {
      window.location.href = `sms:${item.phoneNumber}`
    }
  }

  const handleToggle = () => {
    if (isTask && item.originalTask && onToggleComplete) {
      onToggleComplete(item.originalTask.id)
    }
  }

  const handleDelete = () => {
    if (isTask && item.originalTask && onDelete) {
      onDelete(item.originalTask.id)
      onClose()
    }
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { notes: e.target.value || undefined })
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { phoneNumber: e.target.value || undefined })
    }
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newLink.trim()
    if (!trimmed || !isTask || !item.originalTask || !onUpdate) return

    const currentLinks = item.links || []
    if (!currentLinks.includes(trimmed)) {
      onUpdate(item.originalTask.id, { links: [...currentLinks, trimmed] })
    }
    setNewLink('')
  }

  const handleRemoveLink = (linkToRemove: string) => {
    if (!isTask || !item.originalTask || !onUpdate) return
    const currentLinks = item.links || []
    const newLinks = currentLinks.filter((link) => link !== linkToRemove)
    onUpdate(item.originalTask.id, { links: newLinks.length > 0 ? newLinks : undefined })
  }

  const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isTask || !item.originalTask || !onUpdate) return
    const value = e.target.value
    if (value) {
      onUpdate(item.originalTask.id, { scheduledFor: new Date(value) })
    } else {
      onUpdate(item.originalTask.id, { scheduledFor: undefined })
    }
  }

  const getScheduledForInputValue = (): string => {
    if (!item.originalTask?.scheduledFor) return ''
    const date = item.originalTask.scheduledFor
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const timeDisplay = item.startTime
    ? item.endTime
      ? formatTimeRange(item.startTime, item.endTime, item.allDay)
      : formatTime(item.startTime)
    : 'Unscheduled'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-100 flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isTask ? 'bg-primary-500' : 'bg-blue-500'
              }`}
            />
            <span className="text-xs text-neutral-400 uppercase">
              {isTask ? 'Task' : 'Event'}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-neutral-800 leading-tight">
            {item.title}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">{timeDisplay}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Close panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Quick Actions */}
        {isTask && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleToggle}
                className={`
                  flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors
                  ${item.completed
                    ? 'border-primary-200 bg-primary-50 text-primary-600'
                    : 'border-neutral-200 hover:bg-neutral-50 text-neutral-600'
                  }
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium">
                  {item.completed ? 'Completed' : 'Complete'}
                </span>
              </button>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`
                  flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors
                  ${isEditing
                    ? 'border-primary-200 bg-primary-50 text-primary-600'
                    : 'border-neutral-200 hover:bg-neutral-50 text-neutral-600'
                  }
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                <span className="text-xs font-medium">Edit</span>
              </button>
              {item.phoneNumber && (
                <>
                  <button
                    onClick={handleCall}
                    className="flex flex-col items-center gap-1.5 p-4 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <span className="text-xs font-medium">Call</span>
                  </button>
                  <button
                    onClick={handleText}
                    className="flex flex-col items-center gap-1.5 p-4 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs font-medium">Text</span>
                  </button>
                </>
              )}
              <button
                onClick={handleDelete}
                className="flex flex-col items-center gap-1.5 p-4 rounded-lg border border-neutral-200 hover:bg-danger-50 hover:border-danger-200 text-neutral-600 hover:text-danger-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium">Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* Context display (read mode) */}
        {hasContext && !isEditing && (
          <div className="space-y-4">
            {item.notes && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">Notes</h3>
                <p className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3">
                  {item.notes}
                </p>
              </div>
            )}

            {item.location && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">Location</h3>
                <p className="text-sm text-neutral-600 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {item.location}
                </p>
              </div>
            )}

            {item.phoneNumber && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">Phone</h3>
                <p className="text-sm text-neutral-600">{item.phoneNumber}</p>
              </div>
            )}

            {item.links && item.links.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">Links</h3>
                <div className="space-y-2">
                  {item.links.map((link) => (
                    <a
                      key={link}
                      href={link.startsWith('http') ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                      </svg>
                      <span className="truncate">{link.replace(/^https?:\/\//, '').split('/')[0]}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit mode */}
        {isEditing && isTask && (
          <div className="space-y-5">
            {/* Schedule */}
            <div>
              <label htmlFor="scheduledFor" className="block text-sm font-medium text-neutral-700 mb-2">
                Scheduled For
              </label>
              <input
                id="scheduledFor"
                type="datetime-local"
                step="900"
                value={getScheduledForInputValue()}
                onChange={handleScheduleChange}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Notes</label>
              <textarea
                value={item.notes || ''}
                onChange={handleNotesChange}
                placeholder="Add notes..."
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           resize-none"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Phone Number</label>
              <input
                type="tel"
                value={item.phoneNumber || ''}
                onChange={handlePhoneChange}
                placeholder="Add phone number..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Links */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Links</label>
              {item.links && item.links.length > 0 && (
                <ul className="mb-3 space-y-2">
                  {item.links.map((link) => (
                    <li key={link} className="flex items-center gap-2 text-sm bg-neutral-50 rounded-lg px-3 py-2">
                      <span className="flex-1 truncate text-neutral-600">{link}</span>
                      <button
                        onClick={() => handleRemoveLink(link)}
                        className="text-neutral-400 hover:text-danger-500 transition-colors"
                        aria-label="Remove link"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleAddLink} className="flex gap-2">
                <input
                  type="text"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="Add a link..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-neutral-100 text-neutral-700
                             rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Empty state for events */}
        {!isTask && !hasContext && (
          <p className="text-sm text-neutral-400 text-center py-8">
            No additional details for this event
          </p>
        )}
      </div>
    </div>
  )
}
