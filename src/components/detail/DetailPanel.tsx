import { useState, useMemo, useEffect, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { detectActions, type DetectedAction } from '@/lib/actionDetection'
import { ContactCard } from './ContactCard'

// Component to render text with clickable links (handles HTML links and plain URLs)
function RichText({ text }: { text: string }) {
  const parts = useMemo(() => {
    // First, handle HTML anchor tags
    // Then handle plain URLs
    const htmlLinkRegex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi

    // Replace HTML links with placeholders, then split on URLs
    const segments: Array<{ type: 'text' | 'link'; content: string; url?: string }> = []

    // Process HTML links first
    let match
    let lastIndex = 0
    const tempText = text.replace(htmlLinkRegex, (_fullMatch, url, linkText) => {
      return `__LINK__${url}__TEXT__${linkText || url}__ENDLINK__`
    })

    // Now process the result for plain URLs and our placeholders
    const combinedRegex = /(__LINK__([^_]+)__TEXT__([^_]+)__ENDLINK__)|(https?:\/\/[^\s<]+)/g

    lastIndex = 0
    while ((match = combinedRegex.exec(tempText)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        const textBefore = tempText.slice(lastIndex, match.index)
        if (textBefore) {
          segments.push({ type: 'text', content: textBefore })
        }
      }

      if (match[1]) {
        // It's an HTML link placeholder
        segments.push({ type: 'link', content: match[3], url: match[2] })
      } else if (match[4]) {
        // It's a plain URL
        segments.push({ type: 'link', content: match[4], url: match[4] })
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < tempText.length) {
      segments.push({ type: 'text', content: tempText.slice(lastIndex) })
    }

    return segments
  }, [text])

  return (
    <>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            {part.content}
          </a>
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </>
  )
}

interface DetailPanelProps {
  item: TimelineItem | null
  onClose: () => void
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  onDelete?: (taskId: string) => void
  onToggleComplete?: (taskId: string) => void
  // Event notes
  onUpdateEventNote?: (googleEventId: string, notes: string | null) => void
  // Recipe viewer
  onOpenRecipe?: (url: string) => void
  // Contact support
  contact?: Contact | null
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onUpdateContact?: (contactId: string, updates: Partial<Contact>) => void
}

// Icon components for actions
function ActionIcon({ type }: { type: DetectedAction['icon'] }) {
  switch (type) {
    case 'recipe':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      )
    case 'video':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      )
    case 'map':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
      )
    case 'phone':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
      )
    case 'message':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      )
    case 'link':
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
        </svg>
      )
  }
}

// Action button component
function ActionButton({ action, onOpenRecipe }: { action: DetectedAction; onOpenRecipe?: (url: string) => void }) {
  const handleClick = () => {
    // For recipes, use the in-app viewer if available
    if (action.type === 'recipe' && action.url && onOpenRecipe) {
      onOpenRecipe(action.url)
      return
    }

    if (action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer')
    } else if (action.phoneNumber) {
      if (action.type === 'call') {
        window.location.href = `tel:${action.phoneNumber}`
      } else if (action.type === 'text') {
        window.location.href = `sms:${action.phoneNumber}`
      }
    }
  }

  // Primary actions get more prominent styling
  const isPrimary = action.type === 'video-call' || action.type === 'recipe' || action.type === 'directions'

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors
        ${isPrimary
          ? 'bg-primary-500 text-white hover:bg-primary-600'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
        }
      `}
    >
      <ActionIcon type={action.icon} />
      <span>{action.label}</span>
    </button>
  )
}

export function DetailPanel({ item, onClose, onUpdate, onDelete, onToggleComplete, onUpdateEventNote, onOpenRecipe, contact, contacts = [], onSearchContacts, onUpdateContact }: DetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(item?.title || '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')

  // Local state for event notes (to allow fluid typing)
  const [localEventNotes, setLocalEventNotes] = useState(item?.notes || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state when item changes
  useEffect(() => {
    setLocalEventNotes(item?.notes || '')
  }, [item?.id, item?.notes])

  // Sync title when item changes
  useEffect(() => {
    setEditedTitle(item?.title || '')
    setIsEditingTitle(false)
  }, [item?.id, item?.title])

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Detect contextual actions
  const detectedActions = useMemo(() => {
    if (!item) return []
    // For events, use googleDescription for action detection (links, video calls, etc.)
    // For tasks, use notes
    const descriptionForActions = item.type === 'event' ? item.googleDescription : item.notes
    return detectActions(
      item.title,
      descriptionForActions,
      item.location,
      item.phoneNumber
    )
  }, [item])

  // Filter contacts for picker
  const filteredContacts = useMemo(() => {
    if (onSearchContacts && contactSearchQuery) {
      return onSearchContacts(contactSearchQuery)
    }
    return contacts.slice(0, 5)
  }, [contacts, contactSearchQuery, onSearchContacts])

  if (!item) return null

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const hasContext = item.notes || item.phoneNumber || item.links?.length || item.location || item.googleDescription || contact

  const handleLinkContact = (selectedContact: Contact) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { contactId: selectedContact.id })
    }
    setShowContactPicker(false)
    setContactSearchQuery('')
  }

  const handleUnlinkContact = () => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { contactId: undefined })
    }
  }

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim()
    if (trimmed && isTask && item.originalTask && onUpdate && trimmed !== item.title) {
      onUpdate(item.originalTask.id, { title: trimmed })
    }
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave()
    } else if (e.key === 'Escape') {
      setEditedTitle(item.title)
      setIsEditingTitle(false)
    }
  }

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

  const handleEventNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    // Update local state immediately for fluid typing
    setLocalEventNotes(value)

    // Debounce the actual save
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      if (isEvent && item.originalEvent && onUpdateEventNote) {
        const googleEventId = item.originalEvent.google_event_id || item.originalEvent.id
        onUpdateEventNote(googleEventId, value || null)
      }
    }, 500) // Save 500ms after user stops typing
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { phoneNumber: e.target.value || undefined })
    }
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = newLink.trim()
    const trimmedTitle = newLinkTitle.trim()
    if (!trimmedUrl || !isTask || !item.originalTask || !onUpdate) return

    const currentLinks = item.links || []
    // Check if URL already exists
    if (currentLinks.some((link) => link.url === trimmedUrl)) {
      setNewLink('')
      setNewLinkTitle('')
      return
    }

    // Add link with URL and optional title
    const newLinkObj: TaskLink = { url: trimmedUrl }
    if (trimmedTitle) {
      newLinkObj.title = trimmedTitle
    }
    onUpdate(item.originalTask.id, { links: [...currentLinks, newLinkObj] })
    setNewLink('')
    setNewLinkTitle('')
  }

  const handleRemoveLink = (linkToRemove: TaskLink) => {
    if (!isTask || !item.originalTask || !onUpdate) return
    const currentLinks = item.links || []
    const newLinks = currentLinks.filter((link) => link.url !== linkToRemove.url)
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
          {isTask && isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="w-full text-lg font-semibold text-neutral-800 leading-tight
                         bg-transparent border-b-2 border-primary-500
                         focus:outline-none py-0.5 -my-0.5"
            />
          ) : (
            <h2
              className={`text-lg font-semibold text-neutral-800 leading-tight ${
                isTask ? 'cursor-pointer hover:text-primary-600 transition-colors' : ''
              }`}
              onClick={() => isTask && setIsEditingTitle(true)}
            >
              {item.title}
            </h2>
          )}
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
        {/* Detected Contextual Actions */}
        {detectedActions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {detectedActions.map((action, index) => (
                <ActionButton key={`${action.type}-${index}`} action={action} onOpenRecipe={onOpenRecipe} />
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            {isTask && (
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
            )}
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
              <span className="text-xs font-medium">{isEvent ? 'Add Notes' : 'Edit'}</span>
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
            {isTask && (
              <button
                onClick={handleDelete}
                className="flex flex-col items-center gap-1.5 p-4 rounded-lg border border-neutral-200 hover:bg-danger-50 hover:border-danger-200 text-neutral-600 hover:text-danger-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium">Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Linked Contact Card (tasks only) */}
        {isTask && contact && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Linked Contact</h3>
            <ContactCard
              contact={contact}
              onUnlink={handleUnlinkContact}
              onUpdate={onUpdateContact}
            />
          </div>
        )}

        {/* Link Contact (tasks only, when no contact linked) */}
        {isTask && !contact && !isEditing && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Contact</h3>
            {!showContactPicker ? (
              <button
                onClick={() => setShowContactPicker(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-neutral-300 text-neutral-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
                <span className="text-sm font-medium">Link a contact</span>
              </button>
            ) : (
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <div className="p-2 border-b border-neutral-100">
                  <input
                    type="text"
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-auto">
                  {filteredContacts.length > 0 ? (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleLinkContact(c)}
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-neutral-800 truncate">{c.name}</div>
                          {c.phone && <div className="text-sm text-neutral-500 truncate">{c.phone}</div>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-neutral-400">
                      No contacts found
                    </div>
                  )}
                </div>
                <div className="p-2 border-t border-neutral-100">
                  <button
                    onClick={() => {
                      setShowContactPicker(false)
                      setContactSearchQuery('')
                    }}
                    className="w-full px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Context display (read mode) */}
        {hasContext && !isEditing && (
          <div className="space-y-4">
            {/* Google Calendar description (read-only, events only) */}
            {isEvent && item.googleDescription && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  From Google Calendar
                </h3>
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <RichText text={item.googleDescription} />
                </div>
              </div>
            )}

            {/* Symphony notes (editable) */}
            {item.notes && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">
                  {isEvent ? 'My Notes' : 'Notes'}
                </h3>
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3">
                  <RichText text={item.notes} />
                </div>
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
                  {item.links.map((link) => {
                    const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                    const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                    return (
                      <a
                        key={link.url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate">{displayText}</span>
                      </a>
                    )
                  })}
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
                step="300"
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
                  {item.links.map((link) => {
                    const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                    const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                    return (
                      <li key={link.url} className="flex items-center gap-2 text-sm bg-neutral-50 rounded-lg px-3 py-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 truncate text-primary-600 hover:underline"
                        >
                          {displayText}
                        </a>
                        <button
                          onClick={() => handleRemoveLink(link)}
                          className="text-neutral-400 hover:text-danger-500 transition-colors flex-shrink-0"
                          aria-label="Remove link"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <form onSubmit={handleAddLink} className="space-y-2">
                <input
                  type="text"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="URL (e.g., https://example.com)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Title (optional)"
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
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit mode for events - just notes */}
        {isEditing && isEvent && (
          <div className="space-y-5">
            {/* Show GCal description as read-only context */}
            {item.googleDescription && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  From Google Calendar
                </h3>
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <RichText text={item.googleDescription} />
                </div>
              </div>
            )}

            {/* Editable Symphony notes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">My Notes</label>
              <textarea
                value={localEventNotes}
                onChange={handleEventNotesChange}
                placeholder="Add your notes about this event..."
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           resize-none"
              />
            </div>
          </div>
        )}

        {/* Empty state for events */}
        {!isTask && !hasContext && !isEditing && (
          <p className="text-sm text-neutral-400 text-center py-8">
            No additional details for this event
          </p>
        )}
      </div>
    </div>
  )
}
