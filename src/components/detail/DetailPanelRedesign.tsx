import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task, TaskLink, LinkedActivity, LinkType, LinkedActivityType } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { ActionableInstance, Routine, PrepFollowupTemplate } from '@/types/actionable'
import type { Attachment, AttachmentEntityType } from '@/types/attachment'
import { formatTimeWithDate, formatTimeRangeWithDate } from '@/lib/timeUtils'
import { detectActions, type DetectedAction } from '@/lib/actionDetection'
import { ActionableActions } from './ActionableActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { RecipeSection } from '@/components/recipe/RecipeSection'
import { DirectionsBuilder } from '@/components/directions'
import { FileUpload, AttachmentList } from '@/components/attachments'
import { PlacesAutocomplete, type PlaceSelection } from '@/components/location'
import { useDirections } from '@/hooks/useDirections'
import { PinButton } from '@/components/pins'
import { MultiAssigneeDropdown } from '@/components/family'
import type { PinnableEntityType } from '@/types/pin'
import type { FamilyMember } from '@/types/family'
import { TaskQuickActions, type ScheduleContextItem } from '@/components/triage'

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
  onAddContact?: (contact: { name: string; phone?: string; email?: string }) => Promise<Contact | null>
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
  // Attachments support
  attachments?: Attachment[]
  onUploadAttachment?: (entityType: AttachmentEntityType, entityId: string, file: File) => Promise<Attachment | null>
  onDeleteAttachment?: (attachment: Attachment) => Promise<boolean>
  onOpenAttachment?: (attachment: Attachment) => void
  isUploadingAttachment?: boolean
  attachmentError?: string | null
  // Pin support
  isPinned?: boolean
  canPin?: boolean
  onPin?: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  onUnpin?: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  onMaxPinsReached?: () => void
  // Linked tasks (prep/follow-up)
  linkedTasks?: {
    prep: Task[]
    followup: Task[]
  }
  onAddLinkedTask?: (
    title: string,
    linkedTo: LinkedActivity,
    linkType: LinkType,
    scheduledFor?: Date
  ) => Promise<void>
  onToggleLinkedTask?: (taskId: string) => void
  onDeleteLinkedTask?: (taskId: string) => void
  // Routine for template management
  routine?: Routine | null
  onUpdateRoutine?: (routineId: string, updates: { prep_task_templates?: PrepFollowupTemplate[], followup_task_templates?: PrepFollowupTemplate[] }) => Promise<boolean>
  // Family member assignment (for shared events)
  familyMembers?: FamilyMember[]
  eventAssignedToAll?: string[]
  onUpdateEventAssignment?: (googleEventId: string, memberIds: string[]) => void
  // Event project linking
  eventProjectId?: string | null
  onUpdateEventProject?: (googleEventId: string, projectId: string | null, eventTitle?: string | null, eventStartTime?: Date | null) => void
  // Quick action support for linked tasks
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Calendar integration - create events from tasks
  onAddToCalendar?: () => Promise<void>
  isAddingToCalendar?: boolean
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

// Component for adding linked prep/follow-up tasks
interface AddLinkedTaskInputProps {
  placeholder: string
  onAdd: (title: string, scheduledFor?: Date) => void
  showTemplateOption?: boolean
  onAddAsTemplate?: (title: string) => void
  eventDate?: Date // Event date for default scheduling
}

function AddLinkedTaskInput({
  placeholder,
  onAdd,
  showTemplateOption,
  onAddAsTemplate,
  eventDate,
}: AddLinkedTaskInputProps) {
  const [value, setValue] = useState('')
  const [addToAll, setAddToAll] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [scheduledTime, setScheduledTime] = useState<string>('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return

    if (addToAll && onAddAsTemplate) {
      onAddAsTemplate(value.trim())
    } else {
      // Build scheduledFor from date and time inputs
      let scheduledFor: Date | undefined
      if (scheduledDate) {
        scheduledFor = new Date(scheduledDate)
        if (scheduledTime) {
          const [hours, minutes] = scheduledTime.split(':').map(Number)
          scheduledFor.setHours(hours, minutes, 0, 0)
        } else {
          scheduledFor.setHours(9, 0, 0, 0) // Default to 9am
        }
      }
      onAdd(value.trim(), scheduledFor)
    }
    setValue('')
    setAddToAll(false)
    setShowSchedule(false)
    setScheduledDate('')
    setScheduledTime('')
  }

  // Calculate default date for the date input (event date or today)
  const defaultDate = eventDate
    ? eventDate.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {value.trim() && (
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className={`p-2 rounded-lg transition-colors ${showSchedule ? 'bg-primary-100 text-primary-600' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'}`}
            title="Set date/time"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {/* Date/time picker row */}
      {showSchedule && value.trim() && (
        <div className="flex gap-2 items-center pl-1">
          <input
            type="date"
            value={scheduledDate || defaultDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="px-2 py-1.5 text-xs rounded border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <input
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder="Time"
            className="px-2 py-1.5 text-xs rounded border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {(scheduledDate || scheduledTime) && (
            <button
              type="button"
              onClick={() => {
                setScheduledDate('')
                setScheduledTime('')
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {showTemplateOption && value.trim() && (
        <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
          <input
            type="checkbox"
            checked={addToAll}
            onChange={(e) => setAddToAll(e.target.checked)}
            className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
          />
          Add to all future instances
        </label>
      )}
    </form>
  )
}

// DetailRow component for consistent field styling in Details zone
interface DetailRowProps {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  onClick?: () => void
  actions?: React.ReactNode
  valueClassName?: string
}

function DetailRow({ icon, label, value, onClick, actions, valueClassName }: DetailRowProps) {
  const content = (
    <>
      <span className="text-neutral-400">{icon}</span>
      <span className="text-sm text-neutral-500 w-20">{label}</span>
      <span className={`flex-1 text-sm ${valueClassName || (value ? 'text-neutral-900' : 'text-neutral-400')}`}>
        {value || 'None'}
      </span>
      {actions}
      {onClick && (
        <svg
          className="w-4 h-4 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 p-3 -mx-3 rounded-lg
                   hover:bg-neutral-50 text-left group transition-colors"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="w-full flex items-center gap-3 p-3 -mx-3 rounded-lg">
      {content}
    </div>
  )
}

// LinkedTaskRow component for prep/follow-up tasks
interface LinkedTaskRowProps {
  task: Task
  onToggle?: (taskId: string) => void
  onDelete?: (taskId: string) => void
  // Quick action props
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  familyMembers?: FamilyMember[]
}

function LinkedTaskRow({ task, onToggle, onDelete, onUpdate, getScheduleItemsForDate, familyMembers = [] }: LinkedTaskRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 group transition-colors">
      <button
        onClick={() => onToggle?.(task.id)}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
          task.completed
            ? 'bg-primary-500 border-primary-500'
            : 'border-neutral-300 hover:border-primary-400'
        }`}
      >
        {task.completed && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      <span className={`flex-1 text-sm ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
        {task.title}
      </span>

      {/* Quick Actions */}
      {onUpdate && (
        <TaskQuickActions
          task={task}
          onSchedule={(date, isAllDay) => {
            onUpdate(task.id, { scheduledFor: date, isAllDay })
          }}
          getScheduleItemsForDate={getScheduleItemsForDate}
          onContextChange={(context) => {
            onUpdate(task.id, { context })
          }}
          familyMembers={familyMembers}
          onAssign={(memberId) => {
            onUpdate(task.id, { assignedTo: memberId ?? undefined })
          }}
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}

      {task.scheduledFor ? (
        <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
          {task.scheduledFor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      ) : (
        <button className="text-xs text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
          + Add to Today
        </button>
      )}

      {onDelete && (
        <button
          onClick={() => onDelete(task.id)}
          className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
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
  onAddContact,
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
  attachments = [],
  onUploadAttachment,
  onDeleteAttachment,
  onOpenAttachment,
  isUploadingAttachment = false,
  attachmentError,
  isPinned = false,
  canPin = true,
  onPin,
  onUnpin,
  onMaxPinsReached,
  linkedTasks,
  onAddLinkedTask,
  onToggleLinkedTask,
  onDeleteLinkedTask,
  routine,
  onUpdateRoutine,
  familyMembers = [],
  eventAssignedToAll = [],
  onUpdateEventAssignment,
  eventProjectId,
  onUpdateEventProject,
  getScheduleItemsForDate,
  onAddToCalendar,
  isAddingToCalendar,
}: DetailPanelRedesignProps) {
  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(item?.title || '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Notes editing
  const [localNotes, setLocalNotes] = useState(item?.notes || '')
  const notesInputRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false)

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')
  const [isCreatingContact, setIsCreatingContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [isCreatingContactLoading, setIsCreatingContactLoading] = useState(false)

  // Project picker state
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProjectLoading, setIsCreatingProjectLoading] = useState(false)
  // Event project picker (for calendar events)
  const [showEventProjectPicker, setShowEventProjectPicker] = useState(false)

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

  // Location picker (for tasks with Places autocomplete)
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  // Collapsible Details section
  const [detailsExpanded, setDetailsExpanded] = useState(true)
  const directions = useDirections()

  // Sync local state when item changes
  useEffect(() => {
    setLocalNotes(item?.notes || '')
    setShowDeleteConfirm(false)
    setShowTimePicker(false)
    setShowLinks(false)
    setShowLocationPicker(false)
  }, [item?.id, item?.notes])

  useEffect(() => {
    setEditedTitle(item?.title || '')
    setIsEditingTitle(false)
  }, [item?.id, item?.title])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actionable.getInstance is stable
  }, [item?.id, item?.type, item?.startTime, actionable.getInstance])

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

  // Find event's linked project
  const eventProject = useMemo(() => {
    if (!eventProjectId) return null
    return projects.find(p => p.id === eventProjectId) || null
  }, [eventProjectId, projects])

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

  // Get activity identifier for linked tasks
  const getActivityIdentifier = useCallback((): { type: LinkedActivityType; id: string } | null => {
    if (!item) return null
    if (item.type === 'task' && item.originalTask) {
      return { type: 'task', id: item.originalTask.id }
    }
    if (item.type === 'routine' && item.originalRoutine) {
      // Composite key: routineId_date
      const dateStr = item.startTime
        ? item.startTime.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
      return {
        type: 'routine_instance',
        id: `${item.originalRoutine.id}_${dateStr}`,
      }
    }
    if (item.type === 'event' && item.originalEvent) {
      const eventId = item.originalEvent.google_event_id || item.originalEvent.id
      return { type: 'calendar_event', id: eventId }
    }
    return null
  }, [item])

  // Handle adding linked prep/follow-up task
  const handleAddLinkedTask = useCallback(async (title: string, linkType: LinkType, scheduledFor?: Date) => {
    const activity = getActivityIdentifier()
    if (!activity || !onAddLinkedTask) return
    await onAddLinkedTask(title, activity, linkType, scheduledFor)
  }, [getActivityIdentifier, onAddLinkedTask])

  // Handle adding as template (routines only)
  const handleAddAsTemplate = useCallback(async (title: string, linkType: LinkType) => {
    if (!item || item.type !== 'routine' || !item.originalRoutine || !routine || !onUpdateRoutine) return

    const template: PrepFollowupTemplate = {
      id: crypto.randomUUID(),
      title,
    }

    // Update routine with new template
    if (linkType === 'prep') {
      await onUpdateRoutine(routine.id, {
        prep_task_templates: [...(routine.prep_task_templates || []), template],
      })
    } else {
      await onUpdateRoutine(routine.id, {
        followup_task_templates: [...(routine.followup_task_templates || []), template],
      })
    }

    // Also create the task for this instance
    await handleAddLinkedTask(title, linkType)
  }, [item, routine, onUpdateRoutine, handleAddLinkedTask])

  if (!item) return null

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const isRoutine = item.type === 'routine'

  // Get attachment entity info based on item type
  const getAttachmentEntityInfo = (): { entityType: AttachmentEntityType; entityId: string } | null => {
    if (isTask && item.originalTask) {
      return { entityType: 'task', entityId: item.originalTask.id }
    }
    if (isEvent && item.originalEvent) {
      const eventId = item.originalEvent.google_event_id || item.originalEvent.id
      return { entityType: 'event_note', entityId: eventId }
    }
    // Routines don't currently support attachments
    return null
  }

  const attachmentEntityInfo = getAttachmentEntityInfo()

  const handleFileUpload = async (file: File) => {
    if (!attachmentEntityInfo || !onUploadAttachment) return
    await onUploadAttachment(attachmentEntityInfo.entityType, attachmentEntityInfo.entityId, file)
  }

  const handleAttachmentDelete = async (attachment: Attachment) => {
    if (!onDeleteAttachment) return
    await onDeleteAttachment(attachment)
  }

  const handleAttachmentOpen = (attachment: Attachment) => {
    onOpenAttachment?.(attachment)
  }

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

  // Handler for linking a project to a calendar event
  const handleLinkEventProject = (selectedProject: Project) => {
    if (isEvent && item.originalEvent && onUpdateEventProject) {
      const eventId = item.originalEvent.google_event_id || item.originalEvent.id
      const eventTitle = item.originalEvent.title || item.title
      const startTimeStr = item.originalEvent.start_time || item.originalEvent.startTime
      const eventStartTime = startTimeStr ? new Date(startTimeStr) : null
      onUpdateEventProject(eventId, selectedProject.id, eventTitle, eventStartTime)
    }
    setShowEventProjectPicker(false)
    setProjectSearchQuery('')
  }

  const handleCreateAndLinkEventProject = async () => {
    if (!onAddProject || !newProjectName.trim() || !isEvent || !item.originalEvent || !onUpdateEventProject) return
    setIsCreatingProjectLoading(true)
    const createdProject = await onAddProject({ name: newProjectName.trim() })
    setIsCreatingProjectLoading(false)
    if (createdProject) {
      const eventId = item.originalEvent.google_event_id || item.originalEvent.id
      const eventTitle = item.originalEvent.title || item.title
      const startTimeStr = item.originalEvent.start_time || item.originalEvent.startTime
      const eventStartTime = startTimeStr ? new Date(startTimeStr) : null
      onUpdateEventProject(eventId, createdProject.id, eventTitle, eventStartTime)
      setIsCreatingProject(false)
      setNewProjectName('')
      setShowEventProjectPicker(false)
      setProjectSearchQuery('')
    }
  }

  const handleUnlinkEventProject = () => {
    if (isEvent && item.originalEvent && onUpdateEventProject) {
      const eventId = item.originalEvent.google_event_id || item.originalEvent.id
      onUpdateEventProject(eventId, null)
    }
  }

  const handleCreateAndLinkContact = async () => {
    if (!onAddContact || !newContactName.trim() || !isTask || !item.originalTask || !onUpdate) return
    setIsCreatingContactLoading(true)
    try {
      const createdContact = await onAddContact({
        name: newContactName.trim(),
        phone: newContactPhone.trim() || undefined,
      })
      if (createdContact) {
        // Link the contact to the task - if this fails, contact still exists but isn't linked
        // User can manually link it later, which is acceptable UX
        onUpdate(item.originalTask.id, { contactId: createdContact.id })
        setIsCreatingContact(false)
        setNewContactName('')
        setNewContactPhone('')
        setShowContactPicker(false)
        setContactSearchQuery('')
      }
      // If createdContact is null, addContact already handles error state in the hook
    } catch {
      // Error is handled by the useContacts hook which sets error state
      // Keep modal open so user can retry
    } finally {
      setIsCreatingContactLoading(false)
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

  // Show date context for both tasks and events (e.g., "Today 3pm", "Tomorrow 1p|3p")
  const timeDisplay = item.startTime
    ? item.endTime
      ? formatTimeRangeWithDate(item.startTime, item.endTime, item.allDay)
      : !item.allDay
        ? formatTimeWithDate(item.startTime)
        : 'All day'
    : 'Unscheduled'

  const phoneNumber = contact?.phone || item.phoneNumber

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* ========================================
          ZONE 1: HEADER (Hero)
          - Title is largest text, primary focus
          - Inline metadata pills only when populated
          ======================================== */}
      <div className="p-6 border-b border-neutral-100 bg-white relative safe-area-top">
        {/* Close button - top right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Checkbox + Title */}
        <div className="flex items-start gap-4 pr-8">
          {/* Checkbox/indicator */}
          {isTask ? (
            <button
              onClick={handleToggle}
              className={`mt-1 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                item.completed
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-neutral-300 hover:border-primary-500'
              }`}
              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {item.completed && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ) : isRoutine ? (
            <div className={`mt-1 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              item.completed ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-400'
            }`}>
              {item.completed && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          ) : (
            <div className="mt-1.5 w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex-shrink-0 shadow-sm" />
          )}

          <div className="flex-1 min-w-0">
            {/* Title - text-xl font-semibold, largest text in panel */}
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="w-full text-xl font-semibold text-neutral-900 leading-tight
                           bg-transparent border-b-2 border-primary-500 focus:outline-none"
              />
            ) : (
              <h2
                className={`text-xl font-semibold leading-tight ${
                  item.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'
                } ${isTask ? 'cursor-pointer hover:text-primary-600 transition-colors' : ''}`}
                onClick={() => isTask && setIsEditingTitle(true)}
              >
                {item.title}
              </h2>
            )}

            {/* Inline metadata pills - only show if populated */}
            <div className="flex flex-wrap gap-2 mt-3">
              {item.startTime && (
                <button
                  onClick={() => isTask && setShowTimePicker(!showTimePicker)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1
                            bg-neutral-100 text-neutral-600 text-sm rounded-full
                            hover:bg-neutral-200 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {timeDisplay}
                </button>
              )}
              {contact && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1
                                bg-primary-50 text-primary-700 text-sm rounded-full">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  {contact.name}
                </span>
              )}
              {item.location && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1
                                bg-neutral-100 text-neutral-600 text-sm rounded-full">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {item.location}
                </span>
              )}
              {project && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1
                                bg-amber-50 text-amber-700 text-sm rounded-full">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  {project.name}
                </span>
              )}
            </div>

            {/* Task action buttons - Pin and Add to Calendar */}
            {isTask && item.originalTask && (
              <div className="mt-3 flex items-center gap-2">
                {/* Pin button */}
                {onPin && onUnpin && (
                  <PinButton
                    entityType="task"
                    entityId={item.originalTask.id}
                    isPinned={isPinned}
                    canPin={canPin}
                    onPin={() => onPin('task', item.originalTask!.id)}
                    onUnpin={() => onUnpin('task', item.originalTask!.id)}
                    onMaxPinsReached={onMaxPinsReached}
                  />
                )}
                {/* Add to Calendar button */}
                {onAddToCalendar && (
                  <button
                    onClick={onAddToCalendar}
                    disabled={isAddingToCalendar}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isAddingToCalendar
                        ? 'bg-primary-50 text-primary-500'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-primary-50 hover:text-primary-600'
                    }`}
                  >
                    {isAddingToCalendar ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Adding...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v6m3-3H9" />
                        </svg>
                        Add to Calendar
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* ========================================
            ZONE 2: PRIMARY CONTENT (Subtasks + Notes)
            - Always visible, prominent
            - "Do the work" sections
            ======================================== */}
        <div className="p-6 space-y-6 border-b border-neutral-100">
          {/* Subtasks */}
          {isTask && item.originalTask && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
                  Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
                </h3>
                {onAddSubtask && !isAddingSubtask && (
                  <button
                    onClick={() => setIsAddingSubtask(true)}
                    className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    + Add subtask
                  </button>
                )}
              </div>

              {subtasks.length > 0 ? (
                <div className="space-y-2">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-neutral-50 group transition-colors"
                    >
                      <button
                        onClick={() => onToggleComplete?.(subtask.id)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          subtask.completed
                            ? 'bg-primary-500 border-primary-500'
                            : 'border-neutral-300 hover:border-primary-400'
                        }`}
                        aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {subtask.completed && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${subtask.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                        {subtask.title}
                      </span>
                      {/* Quick Actions */}
                      {onUpdate && (
                        <TaskQuickActions
                          task={subtask}
                          onSchedule={(date, isAllDay) => {
                            onUpdate(subtask.id, { scheduledFor: date, isAllDay })
                          }}
                          getScheduleItemsForDate={getScheduleItemsForDate}
                          onContextChange={(context) => {
                            onUpdate(subtask.id, { context })
                          }}
                          familyMembers={familyMembers}
                          onAssign={(memberId) => {
                            onUpdate(subtask.id, { assignedTo: memberId ?? undefined })
                          }}
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      )}
                      <button className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-all p-1">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* Progress bar */}
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
                      <span>{completedSubtasks} of {subtasks.length} complete</span>
                      <span>{Math.round(subtaskProgress)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-300"
                        style={{ width: `${subtaskProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Add subtask input */}
              {isAddingSubtask && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newSubtaskTitle.trim() || !item.originalTask || !onAddSubtask) return
                    await onAddSubtask(item.originalTask.id, newSubtaskTitle.trim())
                    setNewSubtaskTitle('')
                  }}
                  className="flex items-center gap-2 mt-2"
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
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingSubtask(false); setNewSubtaskTitle('') }}
                    className="px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Notes - always a textarea, invites input */}
          <div>
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              Notes
            </h3>

            {/* Google Calendar description (read-only, events only) */}
            {isEvent && item.googleDescription && (
              <div className="mb-3">
                <div className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  From Calendar
                </div>
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <RichText text={item.googleDescription} />
                </div>
              </div>
            )}

            <textarea
              ref={notesInputRef}
              value={localNotes}
              onChange={handleNotesChange}
              placeholder="Add notes..."
              className="w-full p-3 text-sm border border-neutral-200 rounded-lg
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         resize-none min-h-[80px] transition-all"
            />
          </div>
        </div>

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

        {/* Family member assignment (events only - for shared events) */}
        {isEvent && item.originalEvent && familyMembers.length > 1 && onUpdateEventAssignment && (
          <div className="mx-4 mt-4 p-3 bg-neutral-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                <span className="text-sm font-medium text-neutral-700">Who's attending?</span>
              </div>
              <MultiAssigneeDropdown
                members={familyMembers}
                selectedIds={eventAssignedToAll}
                onSelect={(memberIds) => {
                  const eventId = item.originalEvent?.google_event_id || item.originalEvent?.id
                  if (eventId) {
                    onUpdateEventAssignment(eventId, memberIds)
                  }
                }}
                size="sm"
                label="Select attendees"
              />
            </div>
            {eventAssignedToAll.length >= 2 && (
              <p className="mt-2 text-xs text-primary-600 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Shared event — subway lines will converge on timeline!
              </p>
            )}
          </div>
        )}

        {/* Event Project Link */}
        {isEvent && item.originalEvent && onUpdateEventProject && (
          <div className="mx-4 mt-4 p-3 bg-neutral-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-sm font-medium text-neutral-700">Project</span>
              </div>
              {eventProject ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenProject && onOpenProject(eventProject.id)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {eventProject.name}
                  </button>
                  <button
                    onClick={handleUnlinkEventProject}
                    className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
                    title="Remove project link"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowEventProjectPicker(true)}
                  className="text-sm text-neutral-500 hover:text-primary-600"
                >
                  Add project...
                </button>
              )}
            </div>
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

        {/* ========================================
            ZONE 3: DETAILS (Collapsible)
            - Context fields - less important, can be collapsed
            ======================================== */}
        {isTask && (
          <div className="border-b border-neutral-100">
            {/* Collapse header */}
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full p-6 flex items-center justify-between hover:bg-neutral-50 transition-colors"
            >
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
                Details
              </h3>
              <svg
                className={`w-5 h-5 text-neutral-400 transition-transform duration-200 ${detailsExpanded ? '' : '-rotate-90'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Expanded details */}
            {detailsExpanded && (
              <div className="px-6 pb-6 space-y-1">
                {/* Scheduled Row */}
                <DetailRow
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Scheduled"
                  value={item.originalTask?.scheduledFor
                    ? item.originalTask.isAllDay
                      ? item.originalTask.scheduledFor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                      : formatTimeWithDate(item.originalTask.scheduledFor)
                    : null
                  }
                  onClick={() => setShowTimePicker(true)}
                />

                {/* Deferred Row - only show if task is deferred */}
                {item.originalTask?.deferredUntil && (
                  <DetailRow
                    icon={
                      <svg className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    }
                    label="Deferred until"
                    value={item.originalTask.deferredUntil.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    valueClassName="text-amber-600"
                  />
                )}

                {/* Someday Row - only show if task is someday */}
                {item.originalTask?.isSomeday && !item.originalTask?.scheduledFor && !item.originalTask?.deferredUntil && (
                  <DetailRow
                    icon={
                      <svg className="w-4 h-4 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                      </svg>
                    }
                    label="Status"
                    value="Someday/Maybe"
                    valueClassName="text-purple-600"
                  />
                )}

                {/* Project Row */}
                <DetailRow
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  }
                  label="Project"
                  value={project?.name}
                  onClick={() => project ? (onOpenProject && onOpenProject(project.id)) : setShowProjectPicker(true)}
                />

                {/* Contact Row */}
                <DetailRow
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Contact"
                  value={contact?.name}
                  onClick={() => contact ? (onOpenContact && onOpenContact(contact.id)) : setShowContactPicker(true)}
                  actions={contact && phoneNumber && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`tel:${phoneNumber}`}
                        className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
                      >
                        <svg className="w-4 h-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                      </a>
                      <a
                        href={`sms:${phoneNumber}`}
                        className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
                      >
                        <svg className="w-4 h-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                      </a>
                    </div>
                  )}
                />

                {/* Location Row */}
                <DetailRow
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Location"
                  value={item.location}
                  onClick={() => setShowLocationPicker(!showLocationPicker)}
                />

                {/* Location picker (expanded) */}
                {showLocationPicker && (
                  <div className="mt-2 ml-7">
                    <PlacesAutocomplete
                      value={item.location ? {
                        address: item.location,
                        placeId: item.originalTask?.locationPlaceId,
                      } : null}
                      onSelect={(place: PlaceSelection) => {
                        if (item.originalTask && onUpdate) {
                          onUpdate(item.originalTask.id, {
                            location: place.address,
                            locationPlaceId: place.placeId,
                          })
                          setShowLocationPicker(false)
                        }
                      }}
                      onClear={() => {
                        if (item.originalTask && onUpdate) {
                          onUpdate(item.originalTask.id, {
                            location: undefined,
                            locationPlaceId: undefined,
                          })
                        }
                      }}
                      onSearch={directions.searchPlaces}
                      onGetDetails={directions.getPlaceDetails}
                      placeholder="Search for a place..."
                    />
                  </div>
                )}

                {/* Links Row */}
                <DetailRow
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Links"
                  value={item.links && item.links.length > 0 ? `${item.links.length} link${item.links.length > 1 ? 's' : ''}` : null}
                  onClick={() => setShowLinks(!showLinks)}
                />

                {/* Links expanded */}
                {showLinks && (
                  <div className="mt-2 ml-7 space-y-2">
                    {item.links && item.links.length > 0 && (
                      <ul className="space-y-1">
                        {item.links.map((link) => {
                          const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                          const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                          return (
                            <li key={link.url} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors">
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
                                className="text-neutral-400 hover:text-red-500 transition-colors p-1"
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
                    <form onSubmit={handleAddLink} className="flex gap-2">
                      <input
                        type="text"
                        value={newLink}
                        onChange={(e) => setNewLink(e.target.value)}
                        placeholder="Add link URL..."
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        disabled={!newLink.trim()}
                        className="px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        +
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Event Location Display (read-only) */}
        {isEvent && item.location && (
          <div className="mx-4 mt-4 p-4 bg-white rounded-2xl shadow-sm border border-neutral-100">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Location</div>
                <p className="text-neutral-800">{item.location}</p>
              </div>
            </div>
          </div>
        )}

        {/* Directions Builder (when location exists) - includes destination display */}
        {item.location && (
          <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <DirectionsBuilder
              destination={{
                name: item.title,
                address: item.location,
                placeId: item.originalTask?.locationPlaceId,
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

        {/* ========================================
            ZONE 4: LINKED TASKS (Prep & Follow-up)
            - Only prominent when populated
            - Collapsed headers when empty
            ======================================== */}
        {onAddLinkedTask && (
          <div className="p-6 border-b border-neutral-100 space-y-4">
            {/* Prep Tasks */}
            <div>
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
                Prep Tasks {linkedTasks && linkedTasks.prep.length > 0 && (
                  <span className="ml-1 text-primary-600">({linkedTasks.prep.length})</span>
                )}
              </h3>

              {linkedTasks && linkedTasks.prep.length > 0 && (
                <div className="mt-3 space-y-2">
                  {linkedTasks.prep.map((task) => (
                    <LinkedTaskRow
                      key={task.id}
                      task={task}
                      onToggle={onToggleLinkedTask}
                      onDelete={onDeleteLinkedTask}
                      onUpdate={onUpdate}
                      getScheduleItemsForDate={getScheduleItemsForDate}
                      familyMembers={familyMembers}
                    />
                  ))}
                </div>
              )}

              {/* Add prep task input */}
              <div className="mt-3">
                <AddLinkedTaskInput
                  placeholder="Add prep task..."
                  onAdd={(title, scheduledFor) => handleAddLinkedTask(title, 'prep', scheduledFor)}
                  showTemplateOption={isRoutine && !!routine && !!onUpdateRoutine}
                  onAddAsTemplate={(title) => handleAddAsTemplate(title, 'prep')}
                  eventDate={item.startTime ?? undefined}
                />
              </div>
            </div>

            {/* Follow-up Tasks */}
            <div>
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
                Follow-up Tasks {linkedTasks && linkedTasks.followup.length > 0 && (
                  <span className="ml-1 text-primary-600">({linkedTasks.followup.length})</span>
                )}
              </h3>

              {linkedTasks && linkedTasks.followup.length > 0 && (
                <div className="mt-3 space-y-2">
                  {linkedTasks.followup.map((task) => (
                    <LinkedTaskRow
                      key={task.id}
                      task={task}
                      onToggle={onToggleLinkedTask}
                      onDelete={onDeleteLinkedTask}
                      onUpdate={onUpdate}
                      getScheduleItemsForDate={getScheduleItemsForDate}
                      familyMembers={familyMembers}
                    />
                  ))}
                </div>
              )}

              {/* Add follow-up task input */}
              <div className="mt-3">
                <AddLinkedTaskInput
                  placeholder="Add follow-up task..."
                  onAdd={(title, scheduledFor) => handleAddLinkedTask(title, 'followup', scheduledFor)}
                  showTemplateOption={isRoutine && !!routine && !!onUpdateRoutine}
                  onAddAsTemplate={(title) => handleAddAsTemplate(title, 'followup')}
                  eventDate={item.startTime ?? undefined}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================
            ZONE 5: ATTACHMENTS
            - Drop zone when empty
            - Compact file rows when populated
            ======================================== */}
        {attachmentEntityInfo && (onUploadAttachment || attachments.length > 0) && (
          <div className="p-6 border-b border-neutral-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </h3>
              {attachments.length > 0 && onUploadAttachment && (
                <button className="text-sm text-primary-600 hover:text-primary-700 transition-colors">
                  + Add file
                </button>
              )}
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                <AttachmentList
                  attachments={attachments}
                  onDelete={handleAttachmentDelete}
                  onOpen={handleAttachmentOpen}
                />
              </div>
            ) : onUploadAttachment ? (
              <FileUpload
                onFileSelect={handleFileUpload}
                isUploading={isUploadingAttachment}
                error={attachmentError}
                compact={false}
              />
            ) : null}

            {/* Show compact uploader when already has attachments */}
            {attachments.length > 0 && onUploadAttachment && (
              <div className="mt-3">
                <FileUpload
                  onFileSelect={handleFileUpload}
                  isUploading={isUploadingAttachment}
                  error={attachmentError}
                  compact={true}
                />
              </div>
            )}
          </div>
        )}

      </div>

      {/* ========================================
          ZONE 6: DANGER ZONE (Delete)
          - Always at bottom
          - Red color, not alarming until hovered
          ======================================== */}
      {isTask && (
        <div className="p-6 safe-area-bottom">
          {showDeleteConfirm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 p-3 text-sm font-medium text-neutral-600 bg-neutral-100
                           hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 p-3 text-sm font-medium text-white bg-red-500
                           hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full p-3 text-sm text-red-600 hover:bg-red-50
                         rounded-lg transition-colors text-center"
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
                  onClick={() => { setShowContactPicker(false); setContactSearchQuery(''); setIsCreatingContact(false); setNewContactName(''); setNewContactPhone('') }}
                  className="p-2 text-neutral-400"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {!isCreatingContact ? (
                <input
                  type="text"
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Name..."
                    className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                    disabled={isCreatingContactLoading}
                  />
                  <input
                    type="tel"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Phone (optional)..."
                    className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-neutral-50
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isCreatingContactLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setIsCreatingContact(false); setNewContactName(''); setNewContactPhone('') }}
                      className="flex-1 py-3 text-base font-medium text-neutral-600 bg-neutral-100 rounded-xl"
                      disabled={isCreatingContactLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAndLinkContact}
                      disabled={!newContactName.trim() || isCreatingContactLoading}
                      className="flex-1 py-3 text-base font-semibold text-white bg-primary-600 rounded-xl disabled:opacity-50"
                    >
                      {isCreatingContactLoading ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!isCreatingContact && (
              <>
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
                {onAddContact && (
                  <div className="p-4 border-t border-neutral-100">
                    <button
                      onClick={() => { setIsCreatingContact(true); setNewContactName(contactSearchQuery) }}
                      className="w-full py-3.5 text-base font-semibold text-white bg-primary-600 rounded-xl flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Add New Contact
                    </button>
                  </div>
                )}
              </>
            )}
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

      {/* Event Project Picker Modal (for calendar events) */}
      {showEventProjectPicker && isEvent && !eventProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[70vh] flex flex-col safe-area-bottom">
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold">Link to Project</h3>
                <button
                  onClick={() => { setShowEventProjectPicker(false); setProjectSearchQuery(''); setIsCreatingProject(false) }}
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
                      onClick={handleCreateAndLinkEventProject}
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
                        onClick={() => handleLinkEventProject(p)}
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
                      // When a specific time is set, it's no longer an all-day task
                      onUpdate(item.originalTask.id, { scheduledFor: newDate, isAllDay: false })
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
