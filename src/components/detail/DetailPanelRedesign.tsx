import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { ActionableInstance } from '@/types/actionable'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { detectActions, type DetectedAction } from '@/lib/actionDetection'
import { ActionableActions } from './ActionableActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { RecipeSection } from '@/components/recipe/RecipeSection'
import { DirectionsBuilder } from '@/components/directions'

// Component to render text with clickable links (handles HTML links and plain URLs)
function RichText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const htmlLinkRegex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    const segments: Array<{ type: 'text' | 'link'; content: string; url?: string }> = []
    let match
    let lastIndex = 0
    const tempText = text.replace(htmlLinkRegex, (_fullMatch, url, linkText) => {
      return `__LINK__${url}__TEXT__${linkText || url}__ENDLINK__`
    })
    const combinedRegex = /(__LINK__([^_]+)__TEXT__([^_]+)__ENDLINK__)|(https?:\/\/[^\s<]+)/g
    lastIndex = 0
    while ((match = combinedRegex.exec(tempText)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = tempText.slice(lastIndex, match.index)
        if (textBefore) {
          segments.push({ type: 'text', content: textBefore })
        }
      }
      if (match[1]) {
        segments.push({ type: 'link', content: match[3], url: match[2] })
      } else if (match[4]) {
        segments.push({ type: 'link', content: match[4], url: match[4] })
      }
      lastIndex = match.index + match[0].length
    }
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

interface DetailPanelRedesignProps {
  item: TimelineItem | null
  onClose: () => void
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  onDelete?: (taskId: string) => void
  onToggleComplete?: (taskId: string) => void
  onUpdateEventNote?: (googleEventId: string, notes: string | null) => void
  // Recipe support
  eventRecipeUrl?: string | null
  onUpdateRecipeUrl?: (googleEventId: string, recipeUrl: string | null) => void
  onOpenRecipe?: (url: string) => void
  contact?: Contact | null
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onUpdateContact?: (contactId: string, updates: Partial<Contact>) => void
  onOpenContact?: (contactId: string) => void
  project?: Project | null
  projects?: Project[]
  onSearchProjects?: (query: string) => Project[]
  onUpdateProject?: (projectId: string, updates: Partial<Project>) => void
  onOpenProject?: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  onAddSubtask?: (parentId: string, title: string) => Promise<string | undefined>
  onActionComplete?: () => void
  // Prep task support (for meal events)
  prepTasks?: Task[]
  onAddPrepTask?: (title: string, linkedEventId: string, scheduledFor: Date) => Promise<string | undefined>
  onTogglePrepTask?: (taskId: string) => void
}

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

function ActionButton({ action, onOpenRecipe }: { action: DetectedAction; onOpenRecipe?: (url: string) => void }) {
  const handleClick = () => {
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

  const isPrimary = action.type === 'video-call' || action.type === 'recipe' || action.type === 'directions'

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all
        ${isPrimary
          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
        }
      `}
    >
      <ActionIcon type={action.icon} />
      <span>{action.label}</span>
    </button>
  )
}

export function DetailPanelRedesign({
  item,
  onClose,
  onUpdate,
  onDelete,
  onToggleComplete,
  onUpdateEventNote,
  eventRecipeUrl,
  onUpdateRecipeUrl,
  onOpenRecipe,
  contact,
  contacts = [],
  onSearchContacts,
  onOpenContact,
  project,
  projects = [],
  onSearchProjects,
  onOpenProject,
  onAddProject,
  onAddSubtask,
  onActionComplete,
  prepTasks,
  onAddPrepTask,
  onTogglePrepTask,
}: DetailPanelRedesignProps) {
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

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')

  // Project picker state
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProjectLoading, setIsCreatingProjectLoading] = useState(false)

  // Links state
  const [showLinks, setShowLinks] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Subtask state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)

  // Actionable instances (for events)
  const [actionableInstance, setActionableInstance] = useState<ActionableInstance | null>(null)
  const actionable = useActionableInstances()

  // Sync local state when item changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocalNotes(item?.notes || '')
    setIsEditingNotes(false)
    setShowDeleteConfirm(false)
    setShowTimePicker(false)
    setShowLinks(false)
  }, [item?.id, item?.notes])

  useEffect(() => {
    setEditedTitle(item?.title || '')
    setIsEditingTitle(false)
  }, [item?.id, item?.title])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Load actionable instance for events and routines
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
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
        const date = item.startTime || new Date()
        const instance = await actionable.getInstance('routine', item.originalRoutine.id, date)
        setActionableInstance(instance)
      } else {
        setActionableInstance(null)
      }
    }

    loadInstance()
  }, [item?.id, item?.type, item?.startTime, actionable.getInstance])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Detect contextual actions
  const detectedActions = useMemo(() => {
    if (!item) return []
    const descriptionForActions = item.type === 'event' ? item.googleDescription : item.notes
    const actions = detectActions(item.title, descriptionForActions, item.location, item.phoneNumber)
    // Filter out 'directions' action when location exists, since DirectionsBuilder handles it
    if (item.location) {
      return actions.filter(action => action.type !== 'directions')
    }
    return actions
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

  // Filter prep tasks for current event
  const eventPrepTasks = useMemo(() => {
    if (!item || item.type !== 'event' || !item.originalEvent || !prepTasks) return []
    const eventId = item.originalEvent.google_event_id || item.originalEvent.id
    return prepTasks.filter(t => t.linkedEventId === eventId)
  }, [item, prepTasks])

  // Actionable callbacks
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

  const handleEventMarkDone = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.markDone('calendar_event', entityId, getEventDate())
    if (success) {
      const instance = await actionable.getInstance('calendar_event', entityId, getEventDate())
      setActionableInstance(instance)
      onActionComplete?.()
    }
    return success
  }, [actionable, getEventEntityId, getEventDate, onActionComplete])

  const handleEventUndoDone = useCallback(async () => {
    const entityId = getEventEntityId()
    if (!entityId) return false
    const success = await actionable.undoDone('calendar_event', entityId, getEventDate())
    if (success) {
      setActionableInstance(null)
      onActionComplete?.()
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
      onActionComplete?.()
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
      onActionComplete?.()
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

  const handleRoutineMarkDone = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.markDone('routine', entityId, getRoutineDate())
    if (success) {
      const instance = await actionable.getInstance('routine', entityId, getRoutineDate())
      setActionableInstance(instance)
      onActionComplete?.()
    }
    return success
  }, [actionable, getRoutineEntityId, getRoutineDate, onActionComplete])

  const handleRoutineUndoDone = useCallback(async () => {
    const entityId = getRoutineEntityId()
    if (!entityId) return false
    const success = await actionable.undoDone('routine', entityId, getRoutineDate())
    if (success) {
      setActionableInstance(null)
      onActionComplete?.()
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
      onActionComplete?.()
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
      onActionComplete?.()
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

  if (!item) return null

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const isRoutine = item.type === 'routine'

  // Calculate subtask progress
  const subtasks = isTask && item.originalTask?.subtasks ? item.originalTask.subtasks : []
  const completedSubtasks = subtasks.filter(s => s.completed).length
  const subtaskProgress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0

  const handleLinkContact = (selectedContact: Contact) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { contactId: selectedContact.id })
    }
    setShowContactPicker(false)
    setContactSearchQuery('')
  }

  const handleLinkProject = (selectedProject: Project) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { projectId: selectedProject.id })
    }
    setShowProjectPicker(false)
    setProjectSearchQuery('')
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
    if (e.key === 'Enter') handleTitleSave()
    else if (e.key === 'Escape') {
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
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (isTask && item.originalTask && onUpdate) {
        onUpdate(item.originalTask.id, { notes: value || undefined })
      } else if (isEvent && item.originalEvent && onUpdateEventNote) {
        const googleEventId = item.originalEvent.google_event_id || item.originalEvent.id
        onUpdateEventNote(googleEventId, value || null)
      }
    }, 500)
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = newLink.trim()
    const trimmedTitle = newLinkTitle.trim()
    if (!trimmedUrl || !isTask || !item.originalTask || !onUpdate) return
    const currentLinks = item.links || []
    if (currentLinks.some((link) => link.url === trimmedUrl)) {
      setNewLink('')
      setNewLinkTitle('')
      return
    }
    const newLinkObj: TaskLink = { url: trimmedUrl }
    if (trimmedTitle) newLinkObj.title = trimmedTitle
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

  const phoneNumber = contact?.phone || item.phoneNumber

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Header - Enhanced with better hierarchy */}
      <div className="bg-white border-b border-neutral-100 safe-area-top">
        {/* Drag handle for bottom sheet feel */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-200" />
        </div>

        <div className="px-5 pb-4 pt-2">
          <div className="flex items-start gap-4">
            {/* Checkbox/indicator */}
            {isTask ? (
              <button
                onClick={handleToggle}
                className={`mt-1.5 w-7 h-7 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                  item.completed
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-neutral-300 hover:border-primary-400'
                }`}
                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.completed && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ) : isRoutine ? (
              <div className={`mt-1.5 w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                item.completed ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-400'
              }`}>
                {item.completed && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            ) : (
              <div className="mt-2.5 w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex-shrink-0 shadow-sm" />
            )}

            {/* Title */}
            <div className="flex-1 min-w-0">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  className="w-full font-display text-2xl font-semibold text-neutral-800 leading-tight
                             bg-transparent border-b-2 border-primary-500 focus:outline-none"
                />
              ) : (
                <h2
                  className={`font-display text-2xl font-semibold leading-tight ${
                    item.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'
                  } ${isTask ? 'cursor-pointer active:text-primary-600' : ''}`}
                  onClick={() => isTask && setIsEditingTitle(true)}
                >
                  {item.title}
                </h2>
              )}

              {/* Time display */}
              <button
                onClick={() => isTask && setShowTimePicker(!showTimePicker)}
                className={`mt-1 text-sm flex items-center gap-1.5 ${
                  isTask ? 'text-neutral-500 active:text-primary-600' : 'text-neutral-500'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {timeDisplay}
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-xl text-neutral-400 active:bg-neutral-100"
              aria-label="Close"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* SUBTASKS - The Centerpiece for Tasks */}
        {isTask && item.originalTask && (
          <div className="bg-white mx-4 mt-4 rounded-2xl shadow-sm border border-neutral-100">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold text-neutral-800">
                  Subtasks
                </h3>
                {subtasks.length > 0 && (
                  <span className="text-sm font-medium text-neutral-500">
                    {completedSubtasks}/{subtasks.length}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {subtasks.length > 0 && (
                <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-300"
                    style={{ width: `${subtaskProgress}%` }}
                  />
                </div>
              )}

              {/* Subtask list */}
              {subtasks.length > 0 && (
                <ul className="space-y-1 mb-3">
                  {subtasks.map((subtask) => (
                    <li
                      key={subtask.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 active:bg-neutral-100 transition-colors"
                    >
                      <button
                        onClick={() => onToggleComplete?.(subtask.id)}
                        className="flex-shrink-0"
                        aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                          subtask.completed
                            ? 'bg-primary-500 border-primary-500 text-white'
                            : 'border-neutral-300'
                        }`}>
                          {subtask.completed && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                      </button>
                      <span className={`flex-1 text-base ${subtask.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                        {subtask.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add subtask */}
              {onAddSubtask && (
                isAddingSubtask ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!newSubtaskTitle.trim() || !item.originalTask) return
                      await onAddSubtask(item.originalTask.id, newSubtaskTitle.trim())
                      setNewSubtaskTitle('')
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsAddingSubtask(false)
                          setNewSubtaskTitle('')
                        }
                      }}
                      placeholder="Subtask title..."
                      className="flex-1 px-4 py-3 text-base rounded-xl border border-neutral-200
                                 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newSubtaskTitle.trim()}
                      className="px-4 py-3 text-sm font-semibold bg-primary-600 text-white
                                 rounded-xl disabled:opacity-50"
                    >
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setIsAddingSubtask(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl
                               border-2 border-dashed border-neutral-200 text-neutral-500
                               active:bg-neutral-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Add subtask</span>
                  </button>
                )
              )}

              {subtasks.length === 0 && !isAddingSubtask && !onAddSubtask && (
                <p className="text-center text-neutral-400 py-4 text-sm">
                  No subtasks yet
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actionable Actions (events and routines) */}
        {isEvent && item.originalEvent && item.startTime && (
          <div className="mx-4 mt-4">
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
          </div>
        )}
        {isRoutine && item.originalRoutine && (
          <div className="mx-4 mt-4">
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
          </div>
        )}

        {/* Quick Actions - Detected actions prominently displayed */}
        {detectedActions.length > 0 && (
          <div className="mx-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {detectedActions.map((action, index) => (
                <ActionButton key={`${action.type}-${index}`} action={action} onOpenRecipe={onOpenRecipe} />
              ))}
            </div>
          </div>
        )}

        {/* Metadata Section - Project, Contact, When */}
        {isTask && (
          <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-neutral-100 divide-y divide-neutral-100">
            {/* Project */}
            <button
              onClick={() => project ? (onOpenProject && onOpenProject(project.id)) : setShowProjectPicker(true)}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-neutral-50"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Project</div>
                <div className={`text-base ${project ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                  {project ? project.name : 'None'}
                </div>
              </div>
              <svg className="w-5 h-5 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Contact */}
            <button
              onClick={() => contact ? (onOpenContact && onOpenContact(contact.id)) : setShowContactPicker(true)}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-neutral-50"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Contact</div>
                <div className={`text-base ${contact ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                  {contact ? contact.name : 'None'}
                </div>
              </div>
              {contact && phoneNumber && (
                <div className="flex gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`tel:${phoneNumber}`}
                    className="p-2 rounded-lg bg-primary-50 text-primary-600 active:bg-primary-100"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                  </a>
                  <a
                    href={`sms:${phoneNumber}`}
                    className="p-2 rounded-lg bg-primary-50 text-primary-600 active:bg-primary-100"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                  </a>
                </div>
              )}
              <svg className="w-5 h-5 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Links */}
            <button
              onClick={() => setShowLinks(!showLinks)}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-neutral-50"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Links</div>
                <div className={`text-base ${item.links && item.links.length > 0 ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                  {item.links && item.links.length > 0 ? `${item.links.length} link${item.links.length > 1 ? 's' : ''}` : 'None'}
                </div>
              </div>
              <svg className={`w-5 h-5 text-neutral-300 transition-transform ${showLinks ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Expanded links */}
            {showLinks && (
              <div className="p-4 space-y-3">
                {item.links && item.links.length > 0 && (
                  <ul className="space-y-2">
                    {item.links.map((link) => {
                      const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                      const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                      return (
                        <li key={link.url} className="flex items-center gap-2 text-sm bg-neutral-50 rounded-xl px-4 py-3">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 truncate text-primary-600"
                          >
                            {displayText}
                          </a>
                          <button
                            onClick={() => handleRemoveLink(link)}
                            className="text-neutral-400 active:text-red-500 p-1"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
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
                    placeholder="URL"
                    className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="flex-1 px-4 py-3 text-base rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="submit"
                      disabled={!newLink.trim()}
                      className="px-5 py-3 font-semibold bg-neutral-100 text-neutral-700 rounded-xl disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Directions Builder (when location exists) - includes destination display */}
        {item.location && (
          <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <DirectionsBuilder
              destination={{
                name: item.title,
                address: item.location,
              }}
              eventTitle={item.title}
            />
          </div>
        )}

        {/* Recipe Section (events only) */}
        {isEvent && item.originalEvent && (
          <RecipeSection
            recipeUrl={eventRecipeUrl}
            eventTitle={item.title}
            eventTime={item.startTime ?? undefined}
            prepTasks={eventPrepTasks}
            onOpenRecipe={(url) => onOpenRecipe?.(url)}
            onUpdateRecipeUrl={(url) => {
              const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
              if (eventId && onUpdateRecipeUrl) {
                onUpdateRecipeUrl(eventId, url)
              }
            }}
            onAddPrepTask={onAddPrepTask ? async (title, scheduledFor) => {
              const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
              if (eventId) {
                return onAddPrepTask(title, eventId, scheduledFor)
              }
            } : undefined}
            onTogglePrepTask={onTogglePrepTask}
          />
        )}

        {/* Notes Section */}
        <div className="mx-4 mt-4 mb-4 bg-white rounded-2xl shadow-sm border border-neutral-100">
          <div className="p-4">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">Notes</h3>

            {/* Google Calendar description (read-only, events only) */}
            {isEvent && item.googleDescription && (
              <div className="mb-3">
                <div className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  From Calendar
                </div>
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <RichText text={item.googleDescription} />
                </div>
              </div>
            )}

            {isEditingNotes ? (
              <textarea
                ref={notesInputRef}
                value={localNotes}
                onChange={handleNotesChange}
                onBlur={() => setIsEditingNotes(false)}
                placeholder="Add notes..."
                rows={4}
                autoFocus
                className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            ) : (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="w-full text-left"
              >
                {localNotes ? (
                  <div className="text-base text-neutral-600 whitespace-pre-wrap">
                    <RichText text={localNotes} />
                  </div>
                ) : (
                  <div className="text-base text-neutral-400 italic py-2">
                    Tap to add notes...
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Empty state for events with no content */}
        {!isTask && !item.notes && !item.googleDescription && !item.location && detectedActions.length === 0 && (
          <p className="text-base text-neutral-400 text-center py-8">
            No additional details
          </p>
        )}
      </div>

      {/* Footer - Delete button (tasks only) */}
      {isTask && (
        <div className="p-4 border-t border-neutral-100 bg-white safe-area-bottom">
          {showDeleteConfirm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3.5 text-base font-semibold text-neutral-600 bg-neutral-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3.5 text-base font-semibold text-white bg-red-500 rounded-xl"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3.5 text-base font-medium text-neutral-500 active:text-red-600 active:bg-red-50 rounded-xl transition-colors"
            >
              Delete task
            </button>
          )}
        </div>
      )}

      {/* Contact Picker Modal */}
      {showContactPicker && !contact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[70vh] flex flex-col safe-area-bottom">
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold">Select Contact</h3>
                <button
                  onClick={() => { setShowContactPicker(false); setContactSearchQuery('') }}
                  className="p-2 text-neutral-400"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <input
                type="text"
                value={contactSearchQuery}
                onChange={(e) => setContactSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-auto">
              {filteredContacts.length > 0 ? (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleLinkContact(c)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-neutral-50 border-b border-neutral-100"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
                      <svg className="w-5 h-5 text-neutral-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-neutral-800">{c.name}</div>
                      {c.phone && <div className="text-sm text-neutral-500">{c.phone}</div>}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-neutral-400">
                  No contacts found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project Picker Modal */}
      {showProjectPicker && !project && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[70vh] flex flex-col safe-area-bottom">
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold">Select Project</h3>
                <button
                  onClick={() => { setShowProjectPicker(false); setProjectSearchQuery(''); setIsCreatingProject(false) }}
                  className="p-2 text-neutral-400"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {!isCreatingProject ? (
                <input
                  type="text"
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="New project name..."
                    className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    disabled={isCreatingProjectLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setIsCreatingProject(false); setNewProjectName('') }}
                      className="flex-1 py-3 text-base font-medium text-neutral-600 bg-neutral-100 rounded-xl"
                      disabled={isCreatingProjectLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAndLinkProject}
                      disabled={!newProjectName.trim() || isCreatingProjectLoading}
                      className="flex-1 py-3 text-base font-semibold text-white bg-primary-600 rounded-xl disabled:opacity-50"
                    >
                      {isCreatingProjectLoading ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!isCreatingProject && (
              <>
                <div className="flex-1 overflow-auto">
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleLinkProject(p)}
                        className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-neutral-50 border-b border-neutral-100"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          </svg>
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-neutral-800">{p.name}</div>
                          {p.notes && <div className="text-sm text-neutral-500 truncate">{p.notes}</div>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-neutral-400">
                      No projects found
                    </div>
                  )}
                </div>
                {onAddProject && (
                  <div className="p-4 border-t border-neutral-100">
                    <button
                      onClick={() => { setIsCreatingProject(true); setNewProjectName(projectSearchQuery) }}
                      className="w-full py-3.5 text-base font-semibold text-white bg-primary-600 rounded-xl flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Create New Project
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Time Picker Modal */}
      {showTimePicker && isTask && item.originalTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl safe-area-bottom">
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Schedule</h3>
                <button
                  onClick={() => setShowTimePicker(false)}
                  className="p-2 text-neutral-400"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-500 mb-2 block">Date</label>
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
                  className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-500 mb-2 block">Time</label>
                <input
                  type="time"
                  value={item.originalTask?.scheduledFor
                    ? `${item.originalTask.scheduledFor.getHours().toString().padStart(2, '0')}:${item.originalTask.scheduledFor.getMinutes().toString().padStart(2, '0')}`
                    : ''}
                  onChange={(e) => {
                    if (!item.originalTask || !onUpdate) return
                    const timeValue = e.target.value
                    if (timeValue) {
                      const existing = item.originalTask.scheduledFor || new Date()
                      const [hours, minutes] = timeValue.split(':').map(Number)
                      const newDate = new Date(existing)
                      newDate.setHours(hours, minutes, 0)
                      onUpdate(item.originalTask.id, { scheduledFor: newDate })
                    }
                  }}
                  className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={() => {
                  if (item.originalTask && onUpdate) {
                    onUpdate(item.originalTask.id, { scheduledFor: undefined })
                  }
                  setShowTimePicker(false)
                }}
                className="w-full py-3.5 text-base font-medium text-neutral-500 bg-neutral-100 rounded-xl"
              >
                Clear Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
