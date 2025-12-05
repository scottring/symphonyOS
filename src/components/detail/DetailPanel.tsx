import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { ActionableInstance } from '@/types/actionable'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { detectActions, type DetectedAction } from '@/lib/actionDetection'
import { ContactCard } from './ContactCard'
import { ProjectCard } from './ProjectCard'
import { ActionableActions } from './ActionableActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'

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
  onOpenContact?: (contactId: string) => void
  // Project support
  project?: Project | null
  projects?: Project[]
  onSearchProjects?: (query: string) => Project[]
  onUpdateProject?: (projectId: string, updates: Partial<Project>) => void
  onOpenProject?: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  // Actionable callback - called after skip/defer/done to refresh timeline
  onActionComplete?: () => void
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
        flex items-center gap-2.5 px-4 py-3 rounded-xl font-medium text-sm transition-all
        ${isPrimary
          ? 'btn-primary'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:shadow-sm'
        }
      `}
    >
      <ActionIcon type={action.icon} />
      <span>{action.label}</span>
    </button>
  )
}

export function DetailPanel({ item, onClose, onUpdate, onDelete, onToggleComplete, onUpdateEventNote, onOpenRecipe, contact, contacts = [], onSearchContacts, onUpdateContact, onOpenContact, project, projects = [], onSearchProjects, onUpdateProject, onOpenProject, onAddProject, onActionComplete }: DetailPanelProps) {
  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(item?.title || '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Notes editing
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [localNotes, setLocalNotes] = useState(item?.notes || '')
  const notesInputRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showHourPicker, setShowHourPicker] = useState(false)
  const [showMinutePicker, setShowMinutePicker] = useState(false)

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')

  // Project picker state
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProjectLoading, setIsCreatingProjectLoading] = useState(false)

  // Links editing
  const [newLink, setNewLink] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Actionable instances (for events)
  const [actionableInstance, setActionableInstance] = useState<ActionableInstance | null>(null)
  const actionable = useActionableInstances()

  // Sync local state when item changes (only on item ID change, not notes changes)
  useEffect(() => {
    setLocalNotes(item?.notes || '')
    setIsEditingNotes(false)
    setExpandedSections({})
    setShowDeleteConfirm(false)
    setShowTimePicker(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only run on item ID change
  }, [item?.id])

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

  // Load actionable instance for events and routines
  useEffect(() => {
    if (!item) {
      setActionableInstance(null)
      return
    }

    const loadInstance = async () => {
      if (item.type === 'event' && item.originalEvent) {
        const eventId = item.originalEvent.google_event_id || item.originalEvent.id
        if (!eventId || !item.startTime) return
        const instance = await actionable.getInstance('calendar_event', eventId, item.startTime)
        setActionableInstance(instance)
      } else if (item.type === 'routine' && item.originalRoutine) {
        // For routines, use startTime or today's date
        const date = item.startTime || new Date()
        const instance = await actionable.getInstance('routine', item.originalRoutine.id, date)
        setActionableInstance(instance)
      } else {
        setActionableInstance(null)
      }
    }

    loadInstance()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally using specific properties
  }, [item?.id, item?.type, item?.startTime, actionable.getInstance])

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

  // Filter projects for picker
  const filteredProjects = useMemo(() => {
    if (onSearchProjects && projectSearchQuery) {
      return onSearchProjects(projectSearchQuery)
    }
    return projects.slice(0, 5)
  }, [projects, projectSearchQuery, onSearchProjects])

  // Get entity ID and date for actionable instance operations
  // These must be defined before the early return to maintain hook order
  const getEventEntityId = useCallback(() => {
    if (!item?.originalEvent) return null
    return item.originalEvent.google_event_id || item.originalEvent.id
  }, [item])

  const getEventDate = useCallback(() => {
    return item?.startTime || new Date()
  }, [item?.startTime])

  const getRoutineEntityId = useCallback(() => {
    if (!item?.originalRoutine) return null
    return item.originalRoutine.id
  }, [item])

  const getRoutineDate = useCallback(() => {
    return item?.startTime || new Date()
  }, [item?.startTime])

  // Actionable action handlers for events
  const handleEventMarkDone = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.markDone('calendar_event', entityId, getEventDate())
    if (success) {
      const instance = await actionable.getInstance('calendar_event', entityId, getEventDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to show completed state
    }
    return success
  }, [actionable, getEventEntityId, getEventDate, onActionComplete])

  const handleEventUndoDone = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.undoDone('calendar_event', entityId, getEventDate())
    if (success) {
      setActionableInstance(null)
      onActionComplete?.() // Refresh timeline to show uncompleted state
    }
    return success
  }, [actionable, getEventEntityId, getEventDate, onActionComplete])

  const handleEventSkip = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.skip('calendar_event', entityId, getEventDate())
    if (success) {
      const instance = await actionable.getInstance('calendar_event', entityId, getEventDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to remove skipped item
    }
    return success
  }, [actionable, getEventEntityId, getEventDate, onActionComplete])

  const handleEventDefer = useCallback(async (toDateTime: Date) => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.defer('calendar_event', entityId, getEventDate(), toDateTime)
    if (success) {
      const instance = await actionable.getInstance('calendar_event', entityId, getEventDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to remove deferred item
    }
    return success
  }, [actionable, getEventEntityId, getEventDate, onActionComplete])

  const handleEventRequestCoverage = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const result = await actionable.requestCoverage('calendar_event', entityId, getEventDate())
    return !!result
  }, [actionable, getEventEntityId, getEventDate])

  const handleEventAddNote = useCallback(async (note: string) => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const result = await actionable.addNote('calendar_event', entityId, getEventDate(), note)
    return !!result
  }, [actionable, getEventEntityId, getEventDate])

  // Actionable action handlers for routines
  const handleRoutineMarkDone = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.markDone('routine', entityId, getRoutineDate())
    if (success) {
      const instance = await actionable.getInstance('routine', entityId, getRoutineDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to show completed state
    }
    return success
  }, [actionable, getRoutineEntityId, getRoutineDate, onActionComplete])

  const handleRoutineUndoDone = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.undoDone('routine', entityId, getRoutineDate())
    if (success) {
      setActionableInstance(null)
      onActionComplete?.() // Refresh timeline to show uncompleted state
    }
    return success
  }, [actionable, getRoutineEntityId, getRoutineDate, onActionComplete])

  const handleRoutineSkip = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.skip('routine', entityId, getRoutineDate())
    if (success) {
      const instance = await actionable.getInstance('routine', entityId, getRoutineDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to remove skipped item
    }
    return success
  }, [actionable, getRoutineEntityId, getRoutineDate, onActionComplete])

  const handleRoutineDefer = useCallback(async (toDateTime: Date) => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.defer('routine', entityId, getRoutineDate(), toDateTime)
    if (success) {
      const instance = await actionable.getInstance('routine', entityId, getRoutineDate())
      setActionableInstance(instance)
      onActionComplete?.() // Refresh timeline to remove deferred item
    }
    return success
  }, [actionable, getRoutineEntityId, getRoutineDate, onActionComplete])

  const handleRoutineRequestCoverage = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const result = await actionable.requestCoverage('routine', entityId, getRoutineDate())
    return !!result
  }, [actionable, getRoutineEntityId, getRoutineDate])

  const handleRoutineAddNote = useCallback(async (note: string) => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const result = await actionable.addNote('routine', entityId, getRoutineDate(), note)
    return !!result
  }, [actionable, getRoutineEntityId, getRoutineDate])

  // Early return AFTER all hooks
  if (!item) return null

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const isRoutine = item.type === 'routine'

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

  const handleLinkProject = (selectedProject: Project) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { projectId: selectedProject.id })
    }
    setShowProjectPicker(false)
    setProjectSearchQuery('')
  }

  const handleUnlinkProject = () => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { projectId: undefined })
    }
  }

  const handleCreateAndLinkProject = async () => {
    if (!onAddProject || !newProjectName.trim() || !isTask || !item.originalTask || !onUpdate) return

    setIsCreatingProjectLoading(true)
    const createdProject = await onAddProject({ name: newProjectName.trim() })
    setIsCreatingProjectLoading(false)

    if (createdProject) {
      onUpdate(item.originalTask.id, { projectId: createdProject.id })
      setIsCreatingProject(false)
      setNewProjectName('')
      setShowProjectPicker(false)
      setProjectSearchQuery('')
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
    const value = e.target.value
    setLocalNotes(value)

    // Debounce the actual save
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      if (isTask && item.originalTask && onUpdate) {
        onUpdate(item.originalTask.id, { notes: value || undefined })
      } else if (isEvent && item.originalEvent && onUpdateEventNote) {
        const googleEventId = item.originalEvent.google_event_id || item.originalEvent.id
        onUpdateEventNote(googleEventId, value || null)
      }
    }, 500)
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
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

  const timeDisplay = item.startTime
    ? item.endTime
      ? formatTimeRange(item.startTime, item.endTime, item.allDay)
      : formatTime(item.startTime)
    : 'Unscheduled'

  // Get phone number from contact if available, otherwise from item
  const phoneNumber = contact?.phone || item.phoneNumber

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      {/* Header - Checkbox + Title + Time */}
      <div className="p-5 border-b border-neutral-100">
        <div className="flex items-start gap-4">
          {/* Checkbox for tasks, circular for routines, dot for events */}
          {isTask ? (
            <button
              onClick={handleToggle}
              className={`mt-1 checkbox-custom flex-shrink-0 ${item.completed ? 'checked' : ''}`}
              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {item.completed && (
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ) : isRoutine ? (
            <div
              className={`mt-1 checkbox-custom routine flex-shrink-0 ${item.completed ? 'checked' : ''}`}
            >
              {item.completed && (
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          ) : (
            <div className="mt-2 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-primary-400 to-primary-500 flex-shrink-0 shadow-sm" />
          )}

          {/* Title + Time */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="w-full font-display text-xl font-semibold text-neutral-800 leading-tight
                           bg-transparent border-b-2 border-primary-500
                           focus:outline-none py-0.5 -my-0.5"
              />
            ) : (
              <h2
                className={`font-display text-xl font-semibold leading-tight ${
                  item.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'
                } ${isTask ? 'cursor-pointer hover:text-primary-600 transition-colors' : ''}`}
                onClick={() => isTask && setIsEditingTitle(true)}
              >
                {item.title}
              </h2>
            )}

            {/* Time display - tappable for tasks */}
            {isTask && !showTimePicker ? (
              <button
                onClick={() => setShowTimePicker(true)}
                className="text-sm text-neutral-500 mt-1 hover:text-primary-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {timeDisplay}
              </button>
            ) : isTask && showTimePicker ? (
              <div className="mt-2 flex gap-2 items-center">
                <input
                  type="date"
                  value={item.originalTask?.scheduledFor
                    ? item.originalTask.scheduledFor.toISOString().split('T')[0]
                    : ''}
                  onChange={(e) => {
                    if (!item.originalTask || !onUpdate) return
                    const dateValue = e.target.value
                    if (dateValue) {
                      const existing = item.originalTask.scheduledFor || new Date()
                      const [year, month, day] = dateValue.split('-').map(Number)
                      const newDate = new Date(existing)
                      newDate.setFullYear(year, month - 1, day)
                      onUpdate(item.originalTask.id, { scheduledFor: newDate })
                    } else {
                      onUpdate(item.originalTask.id, { scheduledFor: undefined })
                    }
                  }}
                  className="flex-1 px-2 py-1 text-sm rounded border border-neutral-200
                             focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowHourPicker(!showHourPicker)}
                    className="w-16 px-2 py-1 text-sm rounded border border-neutral-200 bg-white
                               flex items-center justify-between"
                  >
                    <span>
                      {item.originalTask?.scheduledFor
                        ? (() => {
                            const h = item.originalTask.scheduledFor.getHours()
                            return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`
                          })()
                        : '--'}
                    </span>
                    <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showHourPicker && (
                    <div className="absolute top-full left-0 mt-1 w-20 max-h-48 overflow-auto bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                      {Array.from({ length: 24 }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (!item.originalTask || !onUpdate) return
                            const existing = item.originalTask.scheduledFor || new Date()
                            const newDate = new Date(existing)
                            newDate.setHours(i)
                            newDate.setSeconds(0)
                            onUpdate(item.originalTask.id, { scheduledFor: newDate })
                            setShowHourPicker(false)
                          }}
                          className={`w-full px-3 py-1.5 text-sm text-left hover:bg-neutral-100
                            ${item.originalTask?.scheduledFor?.getHours() === i ? 'bg-primary-50 text-primary-700 font-medium' : ''}`}
                        >
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMinutePicker(!showMinutePicker)}
                    className="w-14 px-2 py-1 text-sm rounded border border-neutral-200 bg-white
                               flex items-center justify-between"
                  >
                    <span>
                      {item.originalTask?.scheduledFor
                        ? `:${(Math.round(item.originalTask.scheduledFor.getMinutes() / 5) * 5).toString().padStart(2, '0')}`
                        : '--'}
                    </span>
                    <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showMinutePicker && (
                    <div className="absolute top-full left-0 mt-1 w-16 max-h-48 overflow-auto bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                        const currentMinute = item.originalTask?.scheduledFor
                          ? Math.round(item.originalTask.scheduledFor.getMinutes() / 5) * 5
                          : null
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              if (!item.originalTask || !onUpdate) return
                              const existing = item.originalTask.scheduledFor || new Date()
                              const newDate = new Date(existing)
                              newDate.setMinutes(m)
                              newDate.setSeconds(0)
                              onUpdate(item.originalTask.id, { scheduledFor: newDate })
                              setShowMinutePicker(false)
                            }}
                            className={`w-full px-3 py-1.5 text-sm text-left hover:bg-neutral-100
                              ${currentMinute === m ? 'bg-primary-50 text-primary-700 font-medium' : ''}`}
                          >
                            :{m.toString().padStart(2, '0')}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowTimePicker(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 mt-1">{timeDisplay}</p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
            aria-label="Close panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Actionable Actions (events and routines) */}
        {isEvent && item.originalEvent && item.startTime && (
          <ActionableActions
            entityType="calendar_event"
            entityId={item.originalEvent.google_event_id || item.originalEvent.id}
            date={item.startTime}
            instance={actionableInstance}
            onMarkDone={handleEventMarkDone}
            onUndoDone={handleEventUndoDone}
            onSkip={handleEventSkip}
            onDefer={handleEventDefer}
            onRequestCoverage={handleEventRequestCoverage}
            onAddNote={handleEventAddNote}
            isLoading={actionable.isLoading}
          />
        )}
        {isRoutine && item.originalRoutine && (
          <ActionableActions
            entityType="routine"
            entityId={item.originalRoutine.id}
            date={item.startTime || new Date()}
            instance={actionableInstance}
            recurrence={item.recurrencePattern}
            onMarkDone={handleRoutineMarkDone}
            onUndoDone={handleRoutineUndoDone}
            onSkip={handleRoutineSkip}
            onDefer={handleRoutineDefer}
            onRequestCoverage={handleRoutineRequestCoverage}
            onAddNote={handleRoutineAddNote}
            isLoading={actionable.isLoading}
          />
        )}

        {/* Notes Section - Always visible */}
        <div className="p-5 border-b border-neutral-100">
          {isEditingNotes ? (
            <div>
              {/* Google Calendar description (read-only, events only) */}
              {isEvent && item.googleDescription && (
                <div className="mb-3">
                  <div className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    From Calendar
                  </div>
                  <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-lg p-2 border border-blue-100">
                    <RichText text={item.googleDescription} />
                  </div>
                </div>
              )}
              <textarea
                ref={notesInputRef}
                value={localNotes}
                onChange={handleNotesChange}
                onBlur={() => setIsEditingNotes(false)}
                placeholder={isEvent ? "Add your notes..." : "Add notes..."}
                rows={4}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           resize-none"
              />
            </div>
          ) : (
            <div>
              {/* Google Calendar description (read-only, events only) */}
              {isEvent && item.googleDescription && (
                <div className="mb-3">
                  <div className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    From Calendar
                  </div>
                  <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-lg p-2 border border-blue-100">
                    <RichText text={item.googleDescription} />
                  </div>
                </div>
              )}
              <button
                onClick={() => setIsEditingNotes(true)}
                className="w-full text-left"
              >
                {localNotes ? (
                  <div className="text-sm text-neutral-600 whitespace-pre-wrap">
                    <RichText text={localNotes} />
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400 italic">
                    {isEvent ? "Add your notes..." : "Add notes..."}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Location (events only) */}
        {item.location && (
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-neutral-600 flex-1">{item.location}</span>
          </div>
        )}

        {/* Detected Contextual Actions */}
        {detectedActions.length > 0 && (
          <div className="p-4 border-b border-neutral-100">
            <div className="flex flex-wrap gap-2">
              {detectedActions.map((action, index) => (
                <ActionButton key={`${action.type}-${index}`} action={action} onOpenRecipe={onOpenRecipe} />
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Sections */}
        <div className="divide-y divide-neutral-100">
          {/* Contact Section */}
          {isTask && (
            <div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => contact ? toggleSection('contact') : setShowContactPicker(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contact ? toggleSection('contact') : setShowContactPicker(true) } }}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span className="flex-1 text-sm text-left">
                  {contact ? (
                    <span className="text-neutral-800 font-medium">{contact.name}</span>
                  ) : (
                    <span className="text-neutral-400">Add contact</span>
                  )}
                </span>
                {contact && phoneNumber && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${phoneNumber}` }}
                      className="p-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); window.location.href = `sms:${phoneNumber}` }}
                      className="p-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
                {contact && (
                  <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSections.contact ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>

              {/* Expanded contact card */}
              {contact && expandedSections.contact && (
                <div className="px-4 pb-3">
                  <ContactCard
                    contact={contact}
                    onUnlink={handleUnlinkContact}
                    onUpdate={onUpdateContact}
                    onOpenContact={onOpenContact}
                  />
                </div>
              )}

              {/* Contact picker */}
              {showContactPicker && !contact && (
                <div className="px-4 pb-3">
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
                </div>
              )}
            </div>
          )}

          {/* Project Section */}
          {isTask && (
            <div>
              <button
                onClick={() => project ? toggleSection('project') : setShowProjectPicker(true)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="flex-1 text-sm text-left">
                  {project ? (
                    <span className="text-neutral-800 font-medium">{project.name}</span>
                  ) : (
                    <span className="text-neutral-400">Add project</span>
                  )}
                </span>
                {project && onOpenProject && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenProject(project.id) }}
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                {project && (
                  <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSections.project ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Expanded project card */}
              {project && expandedSections.project && (
                <div className="px-4 pb-3">
                  <ProjectCard
                    project={project}
                    onUnlink={handleUnlinkProject}
                    onUpdate={onUpdateProject}
                    onOpen={onOpenProject ? () => onOpenProject(project.id) : undefined}
                  />
                </div>
              )}

              {/* Project picker */}
              {showProjectPicker && !project && (
                <div className="px-4 pb-3">
                  <div className="rounded-xl border border-neutral-200 overflow-hidden">
                    {!isCreatingProject ? (
                      <>
                        <div className="p-2 border-b border-neutral-100">
                          <input
                            type="text"
                            value={projectSearchQuery}
                            onChange={(e) => setProjectSearchQuery(e.target.value)}
                            placeholder="Search projects..."
                            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-48 overflow-auto">
                          {filteredProjects.length > 0 ? (
                            filteredProjects.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleLinkProject(p)}
                                className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-neutral-800 truncate">{p.name}</div>
                                  {p.notes && <div className="text-sm text-neutral-500 truncate">{p.notes}</div>}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-6 text-center text-sm text-neutral-400">
                              No projects found
                            </div>
                          )}
                        </div>
                        <div className="p-2 border-t border-neutral-100 flex gap-2">
                          <button
                            onClick={() => {
                              setShowProjectPicker(false)
                              setProjectSearchQuery('')
                            }}
                            className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          {onAddProject && (
                            <button
                              onClick={() => {
                                setIsCreatingProject(true)
                                setNewProjectName(projectSearchQuery)
                              }}
                              className="flex-1 px-3 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                              New
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-3">
                        <div className="text-sm font-medium text-neutral-700 mb-2">Create new project</div>
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newProjectName.trim()) {
                              handleCreateAndLinkProject()
                            } else if (e.key === 'Escape') {
                              setIsCreatingProject(false)
                              setNewProjectName('')
                            }
                          }}
                          placeholder="Project name..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                          autoFocus
                          disabled={isCreatingProjectLoading}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setIsCreatingProject(false)
                              setNewProjectName('')
                            }}
                            className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                            disabled={isCreatingProjectLoading}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateAndLinkProject}
                            disabled={!newProjectName.trim() || isCreatingProjectLoading}
                            className="flex-1 px-3 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isCreatingProjectLoading ? 'Creating...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Links Section */}
          {isTask && (
            <div>
              <button
                onClick={() => toggleSection('links')}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
                <span className="flex-1 text-sm text-left">
                  {item.links && item.links.length > 0 ? (
                    <span className="text-neutral-800 font-medium">Links ({item.links.length})</span>
                  ) : (
                    <span className="text-neutral-400">Add links</span>
                  )}
                </span>
                <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSections.links ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded links */}
              {expandedSections.links && (
                <div className="px-4 pb-3 space-y-2">
                  {item.links && item.links.length > 0 && (
                    <ul className="space-y-2">
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
                        disabled={!newLink.trim()}
                        className="px-4 py-2 text-sm font-medium bg-neutral-100 text-neutral-700
                                   rounded-lg hover:bg-neutral-200 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty state for events */}
        {!isTask && !item.notes && !item.googleDescription && !item.location && detectedActions.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-8">
            No additional details
          </p>
        )}
      </div>

      {/* Footer - Delete button (tasks only) */}
      {isTask && (
        <div className="p-5 border-t border-neutral-100">
          {showDeleteConfirm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-3 text-sm font-medium text-white bg-danger-500 rounded-xl hover:bg-danger-600 transition-all shadow-sm"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-4 py-3 text-sm font-medium text-neutral-500 hover:text-danger-600 hover:bg-danger-50 rounded-xl transition-all"
            >
              Delete task
            </button>
          )}
        </div>
      )}
    </div>
  )
}
