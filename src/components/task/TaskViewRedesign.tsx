import { useState, useRef, useEffect } from 'react'
import type { Task, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import { PushDropdown } from '@/components/triage'

interface TaskViewProps {
  task: Task
  onBack: () => void
  onUpdate: (id: string, updates: Partial<Task>) => void
  onDelete: (id: string) => void
  onToggleComplete: (id: string) => void
  onPush?: (id: string, date: Date) => void
  contact?: Contact | null
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onUpdateContact?: (id: string, updates: Partial<Contact>) => Promise<void>
  onAddContact?: (contact: { name: string; phone?: string; email?: string }) => Promise<Contact | null>
  onOpenContact?: (contactId: string) => void
  project?: Project | null
  projects?: Project[]
  onSearchProjects?: (query: string) => Project[]
  onOpenProject?: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  onAddSubtask?: (parentId: string, title: string) => Promise<string | undefined>
}

export function TaskViewRedesign({
  task,
  onBack,
  onUpdate,
  onDelete,
  onToggleComplete,
  onPush,
  contact,
  contacts = [],
  onSearchContacts,
  onAddContact,
  onOpenContact,
  project,
  projects = [],
  onSearchProjects,
  onOpenProject,
  onAddProject,
  onAddSubtask,
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

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearchQuery, setContactSearchQuery] = useState('')
  const [isCreatingContact, setIsCreatingContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [isCreatingContactLoading, setIsCreatingContactLoading] = useState(false)

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
  const [showAddLink, setShowAddLink] = useState(false)

  // Subtask state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)

  // Sync state when task changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEditedTitle(task.title)
    setLocalNotes(task.notes || '')
    setIsEditingTitle(false)
    setShowDeleteConfirm(false)
    setShowTimePicker(false)
  }, [task.id, task.title, task.notes])
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

  const filteredContacts = onSearchContacts && contactSearchQuery
    ? onSearchContacts(contactSearchQuery)
    : contacts.slice(0, 5)

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
    if (e.key === 'Enter') handleTitleSave()
    else if (e.key === 'Escape') {
      setEditedTitle(task.title)
      setIsEditingTitle(false)
    }
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setLocalNotes(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
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

  const handleCreateAndLinkContact = async () => {
    if (!onAddContact || !newContactName.trim()) return
    setIsCreatingContactLoading(true)
    const createdContact = await onAddContact({
      name: newContactName.trim(),
      phone: newContactPhone.trim() || undefined,
      email: newContactEmail.trim() || undefined,
    })
    setIsCreatingContactLoading(false)
    if (createdContact) {
      onUpdate(task.id, { contactId: createdContact.id })
      setIsCreatingContact(false)
      setNewContactName('')
      setNewContactPhone('')
      setNewContactEmail('')
      setShowContactPicker(false)
      setContactSearchQuery('')
    }
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
    if (currentLinks.some((link) => link.url === trimmedUrl)) {
      setNewLink('')
      setNewLinkTitle('')
      return
    }
    const newLinkObj: TaskLink = { url: trimmedUrl }
    if (trimmedTitle) newLinkObj.title = trimmedTitle
    onUpdate(task.id, { links: [...currentLinks, newLinkObj] })
    setNewLink('')
    setNewLinkTitle('')
    setShowAddLink(false)
  }

  const handleRemoveLink = (linkToRemove: TaskLink) => {
    const currentLinks = task.links || []
    const newLinks = currentLinks.filter((link) => link.url !== linkToRemove.url)
    onUpdate(task.id, { links: newLinks.length > 0 ? newLinks : undefined })
  }

  const formatDate = (date: Date | undefined) => {
    if (!date) return null
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatTime = (date: Date | undefined) => {
    if (!date) return null
    const h = date.getHours()
    const m = date.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  const phoneNumber = contact?.phone
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Subtle top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-primary-50/40 to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Minimal breadcrumb */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-600
                     transition-colors mb-8 group"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 transition-transform group-hover:-translate-x-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Back to tasks
        </button>

        {/* Two-column layout */}
        <div className="flex gap-12 lg:gap-16">
          {/* ========== MAIN COLUMN - Task & Subtasks ========== */}
          <div className="flex-1 min-w-0">
            {/* Task Header */}
            <div className="mb-10">
              <div className="flex items-start gap-5">
                {/* Completion checkbox - prominent */}
                <button
                  onClick={() => onToggleComplete(task.id)}
                  className="mt-2 flex-shrink-0 group"
                  aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  <span
                    className={`
                      w-8 h-8 rounded-xl border-2 flex items-center justify-center
                      transition-all duration-300 ease-out
                      ${task.completed
                        ? 'bg-primary-500 border-primary-500 text-white shadow-[0_4px_12px_-2px_hsl(152_50%_32%/0.3)]'
                        : 'border-neutral-300 group-hover:border-primary-400 group-hover:scale-105'
                      }
                    `}
                  >
                    {task.completed && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </button>

                {/* Title - Large editorial typography */}
                <div className="flex-1 min-w-0">
                  {isEditingTitle ? (
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      onBlur={handleTitleSave}
                      onKeyDown={handleTitleKeyDown}
                      className="w-full font-display text-3xl lg:text-4xl font-semibold text-neutral-900
                                 leading-tight bg-transparent border-b-2 border-primary-500
                                 focus:outline-none py-1 -my-1 tracking-tight"
                    />
                  ) : (
                    <h1
                      className={`font-display text-3xl lg:text-4xl font-semibold leading-tight cursor-pointer
                                 transition-colors tracking-tight
                                 ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-900 hover:text-neutral-700'}`}
                      onClick={() => setIsEditingTitle(true)}
                    >
                      {task.title}
                    </h1>
                  )}
                </div>
              </div>

              {/* Quick actions - subtle, top right */}
              <div className="flex items-center gap-2 mt-4 ml-13">
                {onPush && (
                  <span title="Reschedule">
                    <PushDropdown onPush={(date) => onPush(task.id, date)} />
                  </span>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-neutral-300 hover:text-red-500 rounded-lg transition-colors"
                  aria-label="Delete task"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Delete confirmation - inline */}
              {showDeleteConfirm && (
                <div className="mt-6 p-5 bg-red-50/80 border border-red-200/60 rounded-2xl backdrop-blur-sm">
                  <p className="text-sm text-red-800 mb-4 font-medium">
                    Delete this task permanently?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2.5 px-4 text-sm font-medium text-neutral-600 bg-white
                                 rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-red-500
                                 rounded-xl hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ========== SUBTASKS - The Centerpiece ========== */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display text-lg font-medium text-neutral-800 flex items-center gap-3">
                  Subtasks
                  {totalSubtasks > 0 && (
                    <span className="text-sm font-normal text-neutral-400">
                      {completedSubtasks} of {totalSubtasks}
                    </span>
                  )}
                </h2>
                {totalSubtasks > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-400 font-medium">
                      {Math.round((completedSubtasks / totalSubtasks) * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Subtask list - spacious, no card */}
              <div className="space-y-1">
                {task.subtasks && task.subtasks.length > 0 && (
                  task.subtasks.map((subtask, index) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl
                                 hover:bg-white/60 transition-colors group"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <button
                        onClick={() => onToggleComplete(subtask.id)}
                        className="flex-shrink-0"
                        aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        <span
                          className={`
                            w-6 h-6 rounded-lg border-2 flex items-center justify-center
                            transition-all duration-200
                            ${subtask.completed
                              ? 'bg-primary-500 border-primary-500 text-white'
                              : 'border-neutral-300 group-hover:border-primary-400'
                            }
                          `}
                        >
                          {subtask.completed && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                      </button>
                      <span className={`flex-1 text-base ${subtask.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                        {subtask.title}
                      </span>
                    </div>
                  ))
                )}

                {/* Add subtask - always visible, spacious */}
                {onAddSubtask && (
                  isAddingSubtask ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        if (!newSubtaskTitle.trim()) return
                        await onAddSubtask(task.id, newSubtaskTitle.trim())
                        setNewSubtaskTitle('')
                      }}
                      className="flex items-center gap-4 py-3 px-4 -mx-4"
                    >
                      <span className="w-6 h-6 rounded-lg border-2 border-dashed border-neutral-300 flex-shrink-0" />
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
                        placeholder="What needs to be done?"
                        className="flex-1 bg-transparent text-base text-neutral-700 placeholder:text-neutral-400
                                   focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={!newSubtaskTitle.trim()}
                          className="px-4 py-2 text-sm font-medium bg-primary-500 text-white
                                     rounded-lg hover:bg-primary-600 transition-colors
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingSubtask(false)
                            setNewSubtaskTitle('')
                          }}
                          className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700"
                        >
                          Done
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsAddingSubtask(true)}
                      className="flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl w-full
                                 text-neutral-400 hover:text-neutral-600 hover:bg-white/60 transition-colors"
                    >
                      <span className="w-6 h-6 rounded-lg border-2 border-dashed border-current flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                      </span>
                      <span className="text-base">Add a subtask</span>
                    </button>
                  )
                )}
              </div>

              {/* Empty state for subtasks */}
              {(!task.subtasks || task.subtasks.length === 0) && !isAddingSubtask && (
                <div className="py-8 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neutral-100 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-400">Break this task into smaller steps</p>
                </div>
              )}
            </div>

            {/* ========== NOTES - Inline, not a card ========== */}
            <div className="pt-8 border-t border-neutral-200/60">
              <h2 className="font-display text-lg font-medium text-neutral-800 mb-4">Notes</h2>
              <textarea
                value={localNotes}
                onChange={handleNotesChange}
                placeholder="Add notes, thoughts, or context..."
                rows={5}
                className="w-full bg-white/50 text-neutral-700 placeholder:text-neutral-400
                           rounded-xl border border-neutral-200/60 px-4 py-3
                           focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                           resize-none transition-all"
              />
            </div>
          </div>

          {/* ========== SIDEBAR - Metadata ========== */}
          <aside className="w-72 lg:w-80 flex-shrink-0 hidden md:block">
            <div className="sticky top-8 space-y-6">
              {/* When */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  When
                </h3>
                {!showTimePicker ? (
                  <button
                    onClick={() => setShowTimePicker(true)}
                    className="flex items-center gap-3 w-full text-left group"
                  >
                    <span className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600
                                     group-hover:bg-amber-100 transition-colors">
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <span className={task.scheduledFor ? 'text-neutral-800 font-medium' : 'text-neutral-400'}>
                      {task.scheduledFor ? (
                        <>
                          {formatDate(task.scheduledFor)}
                          {!task.isAllDay && <span className="text-neutral-500 font-normal"> · {formatTime(task.scheduledFor)}</span>}
                        </>
                      ) : (
                        'Set date'
                      )}
                    </span>
                  </button>
                ) : (
                  <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-4">
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
                          const shouldBeAllDay = !task.scheduledFor ? true : task.isAllDay
                          onUpdate(task.id, { scheduledFor: newDate, isAllDay: shouldBeAllDay })
                        } else {
                          onUpdate(task.id, { scheduledFor: undefined, isAllDay: undefined })
                        }
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                                 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {task.scheduledFor && (
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.isAllDay || false}
                          onChange={(e) => onUpdate(task.id, { isAllDay: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${task.isAllDay ? 'bg-primary-500' : 'bg-neutral-200'}`}>
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${task.isAllDay ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-sm text-neutral-600">All day</span>
                      </label>
                    )}
                    <div className="flex justify-between text-sm">
                      {task.scheduledFor && (
                        <button
                          onClick={() => onUpdate(task.id, { scheduledFor: undefined, isAllDay: undefined })}
                          className="text-neutral-500 hover:text-red-600"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => setShowTimePicker(false)}
                        className="text-primary-600 hover:text-primary-700 font-medium ml-auto"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Project */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Project
                </h3>
                {project ? (
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    </span>
                    <button
                      onClick={() => onOpenProject?.(project.id)}
                      className="flex-1 text-left font-medium text-neutral-800 hover:text-blue-600 transition-colors"
                    >
                      {project.name}
                    </button>
                    <button
                      onClick={handleUnlinkProject}
                      className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ) : showProjectPicker ? (
                  <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                    {!isCreatingProject ? (
                      <>
                        <div className="p-2 border-b border-neutral-100">
                          <input
                            type="text"
                            value={projectSearchQuery}
                            onChange={(e) => setProjectSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-50
                                       focus:outline-none focus:ring-2 focus:ring-primary-500"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-40 overflow-auto">
                          {filteredProjects.length > 0 ? (
                            filteredProjects.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleLinkProject(p)}
                                className="w-full px-3 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors"
                              >
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-sm text-neutral-400">No projects</div>
                          )}
                        </div>
                        <div className="p-2 border-t border-neutral-100 flex gap-2">
                          <button
                            onClick={() => { setShowProjectPicker(false); setProjectSearchQuery('') }}
                            className="flex-1 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg"
                          >
                            Cancel
                          </button>
                          {onAddProject && (
                            <button
                              onClick={() => { setIsCreatingProject(true); setNewProjectName(projectSearchQuery) }}
                              className="flex-1 px-3 py-1.5 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg"
                            >
                              + New
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-3">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newProjectName.trim()) handleCreateAndLinkProject()
                            else if (e.key === 'Escape') { setIsCreatingProject(false); setNewProjectName('') }
                          }}
                          placeholder="Project name..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                                     focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
                          autoFocus
                          disabled={isCreatingProjectLoading}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setIsCreatingProject(false); setNewProjectName('') }}
                            className="flex-1 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg"
                            disabled={isCreatingProjectLoading}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateAndLinkProject}
                            disabled={!newProjectName.trim() || isCreatingProjectLoading}
                            className="flex-1 px-3 py-1.5 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50"
                          >
                            {isCreatingProjectLoading ? '...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowProjectPicker(true)}
                    className="flex items-center gap-3 w-full text-left text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    </span>
                    <span>Add to project</span>
                  </button>
                )}
              </div>

              {/* Contact */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Related Contact
                </h3>
                {contact ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onOpenContact?.(contact.id)}
                      className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600
                                 hover:bg-primary-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onOpenContact?.(contact.id)}
                        className="block font-medium text-neutral-800 hover:text-primary-600 transition-colors truncate"
                      >
                        {contact.name}
                      </button>
                      {phoneNumber && (
                        <div className="flex gap-2 mt-1">
                          <a href={`tel:${phoneNumber}`} className="text-xs text-primary-600 hover:underline">Call</a>
                          <a href={`sms:${phoneNumber}`} className="text-xs text-primary-600 hover:underline">Text</a>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleUnlinkContact}
                      className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ) : showContactPicker ? (
                  <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                    {!isCreatingContact ? (
                      <>
                        <div className="p-2 border-b border-neutral-100">
                          <input
                            type="text"
                            value={contactSearchQuery}
                            onChange={(e) => setContactSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-50
                                       focus:outline-none focus:ring-2 focus:ring-primary-500"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-40 overflow-auto">
                          {filteredContacts.length > 0 ? (
                            filteredContacts.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => handleLinkContact(c)}
                                className="w-full px-3 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors"
                              >
                                {c.name}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-sm text-neutral-400">No contacts</div>
                          )}
                        </div>
                        <div className="p-2 border-t border-neutral-100 flex gap-2">
                          <button
                            onClick={() => { setShowContactPicker(false); setContactSearchQuery('') }}
                            className="flex-1 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg"
                          >
                            Cancel
                          </button>
                          {onAddContact && (
                            <button
                              onClick={() => { setIsCreatingContact(true); setNewContactName(contactSearchQuery) }}
                              className="flex-1 px-3 py-1.5 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg"
                            >
                              + New
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-3 space-y-2">
                        <input
                          type="text"
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setIsCreatingContact(false); setNewContactName(''); setNewContactPhone(''); setNewContactEmail('') } }}
                          placeholder="Name *"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          autoFocus
                          disabled={isCreatingContactLoading}
                        />
                        <input
                          type="tel"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          placeholder="Phone"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          disabled={isCreatingContactLoading}
                        />
                        <input
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newContactName.trim()) handleCreateAndLinkContact() }}
                          placeholder="Email"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          disabled={isCreatingContactLoading}
                        />
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { setIsCreatingContact(false); setNewContactName(''); setNewContactPhone(''); setNewContactEmail('') }}
                            className="flex-1 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg"
                            disabled={isCreatingContactLoading}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateAndLinkContact}
                            disabled={!newContactName.trim() || isCreatingContactLoading}
                            className="flex-1 px-3 py-1.5 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50"
                          >
                            {isCreatingContactLoading ? '...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowContactPicker(true)}
                    className="flex items-center gap-3 w-full text-left text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <span>Add contact</span>
                  </button>
                )}
              </div>

              {/* Links */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Links {task.links && task.links.length > 0 && `(${task.links.length})`}
                </h3>

                {task.links && task.links.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {task.links.map((link) => {
                      const url = link.url.startsWith('http') ? link.url : `https://${link.url}`
                      const displayText = link.title || link.url.replace(/^https?:\/\//, '').split('/')[0]
                      return (
                        <li key={link.url} className="flex items-center gap-2 group">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                          </svg>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-sm text-primary-600 hover:underline truncate"
                          >
                            {displayText}
                          </a>
                          <button
                            onClick={() => handleRemoveLink(link)}
                            className="p-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {showAddLink ? (
                  <form onSubmit={handleAddLink} className="space-y-2">
                    <input
                      type="text"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder="URL"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                                 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50
                                 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowAddLink(false); setNewLink(''); setNewLinkTitle('') }}
                        className="flex-1 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newLink.trim()}
                        className="flex-1 px-3 py-1.5 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowAddLink(true)}
                    className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add link
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
