import { useState, useRef, useEffect } from 'react'
import type { Task, TaskContext, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import { PushDropdown } from '@/components/triage'

const CONTEXTS: { value: TaskContext; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: 'bg-blue-500' },
  { value: 'family', label: 'Family', color: 'bg-amber-500' },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500' },
]

interface TaskViewProps {
  task: Task
  onBack: () => void
  onUpdate: (id: string, updates: Partial<Task>) => void
  onDelete: (id: string) => void
  onToggleComplete: (id: string) => void
  onPush?: (id: string, date: Date) => void
  // Contact support
  contact?: Contact | null
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onUpdateContact?: (id: string, updates: Partial<Contact>) => Promise<void>
  // Project support
  project?: Project | null
  projects?: Project[]
  onSearchProjects?: (query: string) => Project[]
  onOpenProject?: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
}

export function TaskView({
  task,
  onBack,
  onUpdate,
  onDelete,
  onToggleComplete,
  onPush,
  contact,
  contacts = [],
  onSearchContacts,
  project,
  projects = [],
  onSearchProjects,
  onOpenProject,
  onAddProject,
}: TaskViewProps) {
  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Notes editing
  const [localNotes, setLocalNotes] = useState(task.notes || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showHourPicker, setShowHourPicker] = useState(false)
  const [showMinutePicker, setShowMinutePicker] = useState(false)

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')

  // Project picker state
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProjectLoading, setIsCreatingProjectLoading] = useState(false)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Links editing
  const [newLink, setNewLink] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')

  // Sync state when task changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state on task change is valid
    setEditedTitle(task.title)
    setLocalNotes(task.notes || '')
    setIsEditingTitle(false)
    setShowDeleteConfirm(false)
    setShowTimePicker(false)
  }, [task.id, task.title, task.notes])

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

  // Filter contacts for picker
  const filteredContacts = onSearchContacts && contactSearchQuery
    ? onSearchContacts(contactSearchQuery)
    : contacts.slice(0, 5)

  // Filter projects for picker
  const filteredProjects = onSearchProjects && projectSearchQuery
    ? onSearchProjects(projectSearchQuery)
    : projects.slice(0, 5)

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed })
    }
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave()
    } else if (e.key === 'Escape') {
      setEditedTitle(task.title)
      setIsEditingTitle(false)
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
      onUpdate(task.id, { notes: value || undefined })
    }, 500)
  }

  const handleDelete = () => {
    onDelete(task.id)
    onBack()
  }

  const handleLinkContact = (selectedContact: Contact) => {
    onUpdate(task.id, { contactId: selectedContact.id })
    setShowContactPicker(false)
    setContactSearchQuery('')
  }

  const handleUnlinkContact = () => {
    onUpdate(task.id, { contactId: undefined })
  }

  const handleLinkProject = (selectedProject: Project) => {
    onUpdate(task.id, { projectId: selectedProject.id })
    setShowProjectPicker(false)
    setProjectSearchQuery('')
  }

  const handleUnlinkProject = () => {
    onUpdate(task.id, { projectId: undefined })
  }

  const handleCreateAndLinkProject = async () => {
    if (!onAddProject || !newProjectName.trim()) return

    setIsCreatingProjectLoading(true)
    const createdProject = await onAddProject({ name: newProjectName.trim() })
    setIsCreatingProjectLoading(false)

    if (createdProject) {
      onUpdate(task.id, { projectId: createdProject.id })
      setIsCreatingProject(false)
      setNewProjectName('')
      setShowProjectPicker(false)
      setProjectSearchQuery('')
    }
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = newLink.trim()
    const trimmedTitle = newLinkTitle.trim()
    if (!trimmedUrl) return

    const currentLinks = task.links || []
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
    onUpdate(task.id, { links: [...currentLinks, newLinkObj] })
    setNewLink('')
    setNewLinkTitle('')
  }

  const handleRemoveLink = (linkToRemove: TaskLink) => {
    const currentLinks = task.links || []
    const newLinks = currentLinks.filter((link) => link.url !== linkToRemove.url)
    onUpdate(task.id, { links: newLinks.length > 0 ? newLinks : undefined })
  }

  const formatDate = (date: Date | undefined) => {
    if (!date) return null
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (date: Date | undefined) => {
    if (!date) return null
    const h = date.getHours()
    const m = date.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  // Get phone number from contact
  const phoneNumber = contact?.phone

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <span className="text-neutral-300">/</span>
            <span className="text-sm font-medium text-neutral-600">Task</span>
          </div>

          <div className="flex items-start gap-4">
            {/* Large checkbox */}
            <button
              onClick={() => onToggleComplete(task.id)}
              className="mt-1 flex-shrink-0"
              aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              <span
                className={`
                  w-7 h-7 rounded-lg border-2
                  flex items-center justify-center
                  transition-colors
                  ${task.completed
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-neutral-300 hover:border-primary-400'
                  }
                `}
              >
                {task.completed && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
            </button>

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
                             bg-transparent border-b-2 border-primary-500
                             focus:outline-none py-0.5 -my-0.5"
                />
              ) : (
                <h1
                  className={`font-display text-2xl font-semibold leading-tight cursor-pointer
                             hover:text-primary-600 transition-colors
                             ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}
                  onClick={() => setIsEditingTitle(true)}
                >
                  {task.title}
                </h1>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {/* Push button */}
              {onPush && (
                <span title="Push task">
                  <PushDropdown onPush={(date) => onPush(task.id, date)} />
                </span>
              )}

              {/* Delete button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Delete task"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 mb-3">
                Are you sure you want to delete this task?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 px-3 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete Task
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {/* Date & Time Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">When</h2>

            {!showTimePicker ? (
              <button
                onClick={() => setShowTimePicker(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
              >
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="flex-1">
                  {task.scheduledFor ? (
                    <span className="text-neutral-800">
                      {formatDate(task.scheduledFor)}{task.isAllDay ? ' (All Day)' : ` at ${formatTime(task.scheduledFor)}`}
                    </span>
                  ) : (
                    <span className="text-neutral-400">Add date & time</span>
                  )}
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                {/* Date picker row */}
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={task.scheduledFor ? task.scheduledFor.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const dateValue = e.target.value
                      if (dateValue) {
                        const existing = task.scheduledFor || new Date()
                        const [year, month, day] = dateValue.split('-').map(Number)
                        const newDate = new Date(existing)
                        newDate.setFullYear(year, month - 1, day)
                        // If no existing time and not already all-day, default to all-day
                        const shouldBeAllDay = !task.scheduledFor ? true : task.isAllDay
                        onUpdate(task.id, { scheduledFor: newDate, isAllDay: shouldBeAllDay })
                      } else {
                        onUpdate(task.id, { scheduledFor: undefined, isAllDay: undefined })
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {/* Time pickers - only show if not all day */}
                  {task.scheduledFor && !task.isAllDay && (
                    <>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowHourPicker(!showHourPicker)}
                          className="w-16 px-2 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                                     flex items-center justify-between"
                        >
                          <span>
                            {task.scheduledFor
                              ? (() => {
                                  const h = task.scheduledFor.getHours()
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
                                  const existing = task.scheduledFor || new Date()
                                  const newDate = new Date(existing)
                                  newDate.setHours(i)
                                  newDate.setSeconds(0)
                                  onUpdate(task.id, { scheduledFor: newDate })
                                  setShowHourPicker(false)
                                }}
                                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-neutral-100
                                  ${task.scheduledFor?.getHours() === i ? 'bg-primary-50 text-primary-700 font-medium' : ''}`}
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
                          className="w-14 px-2 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                                     flex items-center justify-between"
                        >
                          <span>
                            {task.scheduledFor
                              ? `:${(Math.round(task.scheduledFor.getMinutes() / 5) * 5).toString().padStart(2, '0')}`
                              : '--'}
                          </span>
                          <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {showMinutePicker && (
                          <div className="absolute top-full left-0 mt-1 w-16 max-h-48 overflow-auto bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                            {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                              const currentMinute = task.scheduledFor
                                ? Math.round(task.scheduledFor.getMinutes() / 5) * 5
                                : null
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => {
                                    const existing = task.scheduledFor || new Date()
                                    const newDate = new Date(existing)
                                    newDate.setMinutes(m)
                                    newDate.setSeconds(0)
                                    onUpdate(task.id, { scheduledFor: newDate })
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
                    </>
                  )}
                </div>

                {/* All Day toggle - only show when date is set */}
                {task.scheduledFor && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={task.isAllDay || false}
                        onChange={(e) => {
                          onUpdate(task.id, { isAllDay: e.target.checked })
                          // Close time pickers when toggling
                          setShowHourPicker(false)
                          setShowMinutePicker(false)
                        }}
                        className="sr-only"
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${task.isAllDay ? 'bg-primary-500' : 'bg-neutral-200'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-1 ${task.isAllDay ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                    </div>
                    <span className="text-sm text-neutral-600">All Day</span>
                  </label>
                )}

                <div className="flex gap-2">
                  {task.scheduledFor && (
                    <button
                      onClick={() => onUpdate(task.id, { scheduledFor: undefined, isAllDay: undefined })}
                      className="text-sm text-neutral-500 hover:text-red-600 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => setShowTimePicker(false)}
                    className="ml-auto text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Context Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Context</h2>
            <div className="flex items-center gap-2">
              {CONTEXTS.map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => onUpdate(task.id, { context: task.context === value ? undefined : value })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    task.context === value
                      ? `${color} text-white`
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Contact</h2>

            {contact ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-800">{contact.name}</div>
                  {phoneNumber && <div className="text-sm text-neutral-500">{phoneNumber}</div>}
                </div>
                {phoneNumber && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => window.location.href = `tel:${phoneNumber}`}
                      className="p-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => window.location.href = `sms:${phoneNumber}`}
                      className="p-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
                <button
                  onClick={handleUnlinkContact}
                  className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : showContactPicker ? (
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
            ) : (
              <button
                onClick={() => setShowContactPicker(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span className="text-neutral-400">Add contact</span>
              </button>
            )}
          </div>

          {/* Project Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Project</h2>

            {project ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-800">{project.name}</div>
                </div>
                {onOpenProject && (
                  <button
                    onClick={() => onOpenProject(project.id)}
                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleUnlinkProject}
                  className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : showProjectPicker ? (
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
            ) : (
              <button
                onClick={() => setShowProjectPicker(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-neutral-400">Add project</span>
              </button>
            )}
          </div>

          {/* Links Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              Links {task.links && task.links.length > 0 && `(${task.links.length})`}
            </h2>

            {/* Existing links */}
            {task.links && task.links.length > 0 && (
              <ul className="space-y-2 mb-3">
                {task.links.map((link) => {
                  const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                  const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                  return (
                    <li key={link.url} className="flex items-center gap-2 text-sm bg-neutral-50 rounded-lg px-3 py-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                      </svg>
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
                        className="text-neutral-400 hover:text-red-500 transition-colors flex-shrink-0"
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

            {/* Add new link form */}
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
                             rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          {/* Notes Section */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Notes</h2>
            <textarea
              value={localNotes}
              onChange={handleNotesChange}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
