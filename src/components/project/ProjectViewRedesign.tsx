import { useMemo, useState, useRef, useEffect } from 'react'
import type { Project, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { List } from '@/types/list'
import { getCategoryIcon } from '@/types/list'
import type { EventNote } from '@/hooks/useEventNotes'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { formatTimeWithDate } from '@/lib/timeUtils'
import { TaskQuickActions, type ScheduleContextItem } from '@/components/triage'
import { calculateProjectStatus } from '@/hooks/useProjects'

// Organic blob shape for decorative background
const BlobShape = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      fill="currentColor"
      d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.3,88.5,-0.9C87,14.5,81.4,29,72.2,40.6C63,52.2,50.2,60.9,36.6,67.5C23,74.1,8.6,78.6,-5.8,77.3C-20.2,76,-34.6,68.9,-46.6,59.3C-58.6,49.7,-68.2,37.6,-74.3,23.4C-80.4,9.2,-83,-7.1,-79.3,-21.4C-75.6,-35.7,-65.6,-48,-53.1,-56.1C-40.6,-64.2,-25.6,-68.1,-10.3,-73.8C5,-79.5,20.1,-87,34.8,-85.4C49.5,-83.8,63.8,-73.1,44.7,-76.4Z"
      transform="translate(100 100)"
    />
  </svg>
)

interface ProjectViewProps {
  project: Project
  tasks: Task[]
  contactsMap: Map<string, Contact>
  onBack: () => void
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void
  onDeleteProject?: (projectId: string) => void
  onAddTask?: (title: string, projectId: string) => void
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  selectedTaskId?: string | null
  // Task quick-action props
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  familyMembers?: FamilyMember[]
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Linked calendar events (stored as event notes with event metadata)
  linkedEvents?: EventNote[]
  // Available calendar events for linking
  availableEvents?: CalendarEvent[]
  onLinkEvent?: (googleEventId: string, title: string, startTime: Date) => void
  onUnlinkEvent?: (googleEventId: string) => void
  // Pin props (available but not used in redesign yet)
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
  // Lists props
  linkedLists?: List[]
  allLists?: List[]
  onLinkList?: (listId: string) => void
  onUnlinkList?: (listId: string) => void
  onCreateList?: (title: string, projectId: string) => void
  onSelectList?: (listId: string) => void
}

export function ProjectViewRedesign({
  project,
  tasks,
  contactsMap,
  onBack,
  onUpdateProject,
  onDeleteProject,
  onAddTask,
  onSelectTask,
  onToggleTask,
  selectedTaskId,
  onUpdateTask,
  familyMembers = [],
  getScheduleItemsForDate,
  linkedEvents = [],
  availableEvents = [],
  onLinkEvent,
  onUnlinkEvent,
  // Pinning functionality (not yet implemented in redesign)
  // isPinned, canPin, onPin, onUnpin
  linkedLists = [],
  allLists = [],
  onLinkList,
  onUnlinkList,
  onCreateList,
  onSelectList,
}: ProjectViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('not_started')
  const [editNotes, setEditNotes] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showEventSelector, setShowEventSelector] = useState(false)
  const [eventSearchQuery, setEventSearchQuery] = useState('')
  const eventSelectorRef = useRef<HTMLDivElement>(null)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [showListPicker, setShowListPicker] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const listPickerRef = useRef<HTMLDivElement>(null)

  const projectTasks = useMemo(() => {
    return tasks.filter((t) => t.projectId === project.id)
  }, [tasks, project.id])

  const sortedTasks = useMemo(() => {
    const incomplete = projectTasks.filter((t) => !t.completed)
    const completed = projectTasks.filter((t) => t.completed)
    const sortByDate = (a: Task, b: Task) => {
      const aDate = a.scheduledFor?.getTime() ?? Infinity
      const bDate = b.scheduledFor?.getTime() ?? Infinity
      return aDate - bDate
    }
    return [...incomplete.sort(sortByDate), ...completed.sort(sortByDate)]
  }, [projectTasks])

  const completedCount = projectTasks.filter((t) => t.completed).length
  const totalCount = projectTasks.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // Calculate what the status should be based on task completion
  const calculatedStatus = useMemo(() => {
    return calculateProjectStatus(projectTasks)
  }, [projectTasks])

  // Lists that are not linked to any project (available to link)
  const availableLists = useMemo(() => {
    return allLists.filter((l) => !l.projectId)
  }, [allLists])

  // Auto-update disabled - user has full manual control over project status
  // The calculatedStatus is still available for display purposes if needed

  // Filter available events: exclude already linked ones, filter by search, sort by date
  const linkedEventIds = useMemo(() => new Set(linkedEvents.map(e => e.googleEventId)), [linkedEvents])

  const filteredAvailableEvents = useMemo(() => {
    const query = eventSearchQuery.toLowerCase().trim()
    return availableEvents
      .filter(event => {
        // Exclude already linked events
        const eventId = event.google_event_id || event.id
        if (linkedEventIds.has(eventId)) return false
        // Filter by search query
        if (query && !event.title.toLowerCase().includes(query)) return false
        return true
      })
      .sort((a, b) => {
        // Sort by start time
        const aTime = a.start_time || a.startTime || ''
        const bTime = b.start_time || b.startTime || ''
        return new Date(aTime).getTime() - new Date(bTime).getTime()
      })
      .slice(0, 20) // Limit to 20 events
  }, [availableEvents, linkedEventIds, eventSearchQuery])

  // Click outside handler for event selector
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (eventSelectorRef.current && !eventSelectorRef.current.contains(event.target as Node)) {
        setShowEventSelector(false)
        setEventSearchQuery('')
      }
    }

    if (showEventSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEventSelector])

  // Click outside handler for list picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (listPickerRef.current && !listPickerRef.current.contains(event.target as Node)) {
        setShowListPicker(false)
        setNewListTitle('')
      }
    }

    if (showListPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showListPicker])

  // Handle linking an event
  const handleLinkEvent = (event: CalendarEvent) => {
    if (!onLinkEvent) return
    const eventId = event.google_event_id || event.id
    const startTimeStr = event.start_time || event.startTime || ''
    const startTime = startTimeStr ? new Date(startTimeStr) : new Date()
    onLinkEvent(eventId, event.title, startTime)
    setShowEventSelector(false)
    setEventSearchQuery('')
  }

  // Handle creating a new list
  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newListTitle.trim()
    if (trimmed && onCreateList) {
      onCreateList(trimmed, project.id)
      setNewListTitle('')
      setShowListPicker(false)
    }
  }

  const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string; accent: string; glow: string }> = {
    not_started: {
      label: 'Not Started',
      color: 'text-neutral-600',
      bg: 'bg-neutral-100',
      accent: 'hsl(38 14% 75%)',
      glow: 'shadow-[0_0_20px_-5px_hsl(38_14%_75%_/_0.3)]'
    },
    in_progress: {
      label: 'In Progress',
      color: 'text-primary-700',
      bg: 'bg-primary-50',
      accent: 'hsl(168 45% 30%)',
      glow: 'shadow-[0_0_24px_-4px_hsl(168_45%_30%_/_0.35)]'
    },
    on_hold: {
      label: 'On Hold',
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      accent: 'hsl(38 85% 50%)',
      glow: 'shadow-[0_0_20px_-5px_hsl(38_85%_50%_/_0.3)]'
    },
    completed: {
      label: 'Completed',
      color: 'text-sage-600',
      bg: 'bg-sage-50',
      accent: 'hsl(145 28% 36%)',
      glow: 'shadow-[0_0_20px_-5px_hsl(145_28%_36%_/_0.3)]'
    },
  }

  const handleEdit = () => {
    setEditName(project.name)
    setEditStatus(project.status)
    setEditNotes(project.notes || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmedName = editName.trim()
    if (trimmedName) {
      onUpdateProject(project.id, {
        name: trimmedName,
        status: editStatus,
        notes: editNotes.trim() || undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditName('')
    setEditStatus('not_started')
    setEditNotes('')
  }

  // Direct status change (manual override)
  const handleStatusChange = (newStatus: ProjectStatus) => {
    onUpdateProject(project.id, { status: newStatus })
    setShowStatusDropdown(false)
  }

  const handleDelete = () => {
    if (onDeleteProject) {
      onDeleteProject(project.id)
      onBack()
    }
  }

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTaskTitle.trim()
    if (trimmed && onAddTask) {
      onAddTask(trimmed, project.id)
      setNewTaskTitle('')
    }
  }

  const formatTaskDate = (date: Date | undefined, isAllDay?: boolean) => {
    if (!date) return null
    if (isAllDay) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return formatTimeWithDate(date)
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)] relative">
      {/* Atmospheric background with organic shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Primary gradient wash */}
        <div
          className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] opacity-[0.04] blur-3xl transition-opacity duration-1000"
          style={{ background: `radial-gradient(circle, ${statusConfig[project.status].accent} 0%, transparent 70%)` }}
        />
        {/* Secondary accent blob */}
        <BlobShape
          className="absolute -bottom-32 -left-32 w-[500px] h-[500px] opacity-[0.03] animate-float text-primary-500"
        />
        {/* Subtle grain overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-8 lg:px-8 lg:py-10">
        {/* Back button - refined with animation */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2.5 text-sm text-neutral-400 hover:text-neutral-700
                     transition-all duration-200 mb-10 group"
        >
          <span className="w-8 h-8 rounded-xl bg-white/60 backdrop-blur-sm border border-neutral-200/60 flex items-center justify-center
                          group-hover:bg-white group-hover:border-neutral-300 group-hover:shadow-sm transition-all duration-200">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </span>
          <span className="font-medium">Projects</span>
        </button>

        {/* Two-column layout */}
        <div className="flex gap-12 lg:gap-20">
          {/* ========== MAIN COLUMN - Tasks ========== */}
          <div className="flex-1 min-w-0">
            {/* Project Header - Dramatic, editorial style */}
            <div className="mb-12">
              {/* Status badge - floating above title */}
              <div className="mb-4">
                <span className={`
                  inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase
                  rounded-full ${statusConfig[project.status].bg} ${statusConfig[project.status].color}
                  ${statusConfig[project.status].glow} transition-all duration-300
                `}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {statusConfig[project.status].label}
                </span>
              </div>

              {/* Title - Large, confident typography */}
              <h1 className="font-display text-4xl lg:text-5xl xl:text-6xl text-neutral-900 leading-[1.1] tracking-[-0.02em] mb-4">
                {project.name}
              </h1>

              {/* Progress summary with visual indicator */}
              {totalCount > 0 && (
                <div className="flex items-center gap-4">
                  {/* Mini progress ring */}
                  <div className="relative w-10 h-10">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        className="text-neutral-200"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="none"
                        r="15"
                        cx="18"
                        cy="18"
                      />
                      <circle
                        className="text-primary-500 transition-all duration-700 ease-out"
                        strokeWidth="3"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        r="15"
                        cx="18"
                        cy="18"
                        strokeDasharray={`${progressPercent * 0.94} 100`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-neutral-700">
                      {Math.round(progressPercent)}
                    </span>
                  </div>
                  <span className="text-neutral-500 text-base">
                    <span className="font-semibold text-neutral-700">{completedCount}</span> of {totalCount} tasks complete
                  </span>
                </div>
              )}

              {/* Actions - subtle, contextual */}
              <div className="flex items-center gap-1 mt-6">
                <button
                  onClick={handleEdit}
                  className="p-2.5 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
                  aria-label="Edit project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                {onDeleteProject && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
                    aria-label="Delete project"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Delete confirmation - refined modal style */}
              {showDeleteConfirm && (
                <div className="mt-8 p-6 bg-white/90 backdrop-blur-md border border-red-200/40 rounded-2xl shadow-lg animate-fade-in-scale">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-lg text-neutral-900 mb-1">Delete this project?</h3>
                      <p className="text-sm text-neutral-500 mb-5">
                        Tasks will remain but be unlinked from this project.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-2.5 px-4 text-sm font-medium text-neutral-600 bg-neutral-100
                                     rounded-xl hover:bg-neutral-200 transition-all duration-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDelete}
                          className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-red-500
                                     rounded-xl hover:bg-red-600 transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          Delete Project
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit mode - refined card style */}
              {isEditing && (
                <div className="mt-8 p-6 bg-white/90 backdrop-blur-md border border-primary-200/40 rounded-2xl shadow-lg animate-fade-in-scale">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Project Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-4 py-3 text-lg font-display rounded-xl border border-neutral-200 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Status</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['not_started', 'in_progress', 'on_hold', 'completed'] as ProjectStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setEditStatus(status)}
                            className={`py-2.5 px-3 text-xs font-semibold rounded-xl transition-all duration-200
                              ${editStatus === status
                                ? `${statusConfig[status].bg} ${statusConfig[status].color} ring-2 ring-offset-1 ring-current/20`
                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                              }`}
                          >
                            {statusConfig[status].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Notes</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Add project notes..."
                        rows={3}
                        className="w-full px-4 py-3 text-base rounded-xl border border-neutral-200 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 resize-none transition-all duration-200"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleCancel}
                        className="flex-1 py-3 px-4 text-sm font-semibold text-neutral-600 bg-neutral-100
                                   rounded-xl hover:bg-neutral-200 transition-all duration-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={!editName.trim()}
                        className="flex-1 py-3 px-4 text-sm font-semibold text-white bg-primary-500
                                   rounded-xl hover:bg-primary-600 transition-all duration-200 disabled:opacity-50
                                   shadow-sm hover:shadow-md"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ========== TASKS - The Centerpiece ========== */}
            <div className="mb-10">
              {/* Section header with decorative line */}
              <div className="flex items-center gap-4 mb-6">
                <h2 className="font-display text-xl text-neutral-800">Tasks</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent" />
              </div>

              {/* Add task - refined floating input */}
              {onAddTask && (
                <form onSubmit={handleAddTask} className="mb-8">
                  <div className="group flex items-center gap-4 py-4 px-5 rounded-2xl bg-white/70 backdrop-blur-sm border border-neutral-200/60
                                  hover:border-neutral-300 hover:bg-white hover:shadow-sm
                                  focus-within:border-primary-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-4 focus-within:ring-primary-500/5
                                  transition-all duration-200">
                    <span className="w-7 h-7 rounded-lg border-2 border-dashed border-neutral-300 group-focus-within:border-primary-400 flex items-center justify-center flex-shrink-0 transition-colors duration-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 group-focus-within:text-primary-500 transition-colors duration-200" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Add a new task..."
                      className="flex-1 bg-transparent text-base text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
                    />
                    {newTaskTitle.trim() && (
                      <button
                        type="submit"
                        className="px-5 py-2 text-sm font-semibold bg-primary-500 text-white rounded-xl hover:bg-primary-600
                                   shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        Add Task
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* Task list */}
              {sortedTasks.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-100/80 mb-5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="font-display text-lg text-neutral-600 mb-2">No tasks yet</p>
                  <p className="text-sm text-neutral-400">Add your first task to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedTasks.map((task, index) => {
                    const contactName = task.contactId ? contactsMap.get(task.contactId)?.name : undefined
                    const isSelected = selectedTaskId === `task-${task.id}`

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(`task-${task.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSelectTask(`task-${task.id}`)
                          }
                        }}
                        style={{ animationDelay: `${index * 30}ms` }}
                        className={`
                          group flex items-center gap-4 py-4 px-5 rounded-2xl cursor-pointer
                          transition-all duration-200 animate-fade-in-up
                          ${isSelected
                            ? 'bg-white shadow-md ring-1 ring-primary-200'
                            : 'bg-white/50 hover:bg-white hover:shadow-sm'
                          }
                          ${task.completed ? 'opacity-70' : ''}
                        `}
                      >
                        {/* Checkbox - refined with animation */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleTask(task.id)
                          }}
                          className="flex-shrink-0 transition-transform duration-200 hover:scale-110"
                          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                        >
                          <span
                            className={`
                              w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                              ${task.completed
                                ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                                : 'border-neutral-300 hover:border-primary-400 hover:bg-primary-50'
                              }
                            `}
                          >
                            {task.completed && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </span>
                        </button>

                        {/* Title and metadata */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-base truncate ${task.completed ? 'line-through text-neutral-400' : 'text-neutral-800 font-medium'}`}>
                              {task.title}
                            </span>
                          </div>
                          {/* Contact badge below title */}
                          {contactName && (
                            <span className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              {contactName}
                            </span>
                          )}
                        </div>

                        {/* Status badges - refined pill style */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Date badge */}
                          {task.scheduledFor && (
                            <span className="text-xs text-neutral-500 font-medium px-2.5 py-1 bg-neutral-100 rounded-lg">
                              {formatTaskDate(task.scheduledFor, task.isAllDay)}
                            </span>
                          )}

                          {/* Deferred badge */}
                          {!task.scheduledFor && task.deferredUntil && (
                            <span className="text-xs text-amber-700 font-medium px-2.5 py-1 bg-amber-50 rounded-lg flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                              </svg>
                              Deferred
                            </span>
                          )}

                          {/* Someday badge */}
                          {!task.scheduledFor && !task.deferredUntil && task.isSomeday && (
                            <span className="text-xs text-purple-700 font-medium px-2.5 py-1 bg-purple-50 rounded-lg flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                              </svg>
                              Someday
                            </span>
                          )}
                        </div>

                        {/* Quick Actions */}
                        {onUpdateTask && (
                          <TaskQuickActions
                            task={task}
                            onSchedule={(date, isAllDay) => {
                              onUpdateTask(task.id, {
                                scheduledFor: date,
                                isAllDay,
                              })
                            }}
                            getScheduleItemsForDate={getScheduleItemsForDate}
                            onContextChange={(context) => {
                              onUpdateTask(task.id, { context })
                            }}
                            familyMembers={familyMembers}
                            onAssign={(memberId) => {
                              onUpdateTask(task.id, { assignedTo: memberId ?? undefined })
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          />
                        )}

                        {/* Arrow - refined with hover animation */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5 text-neutral-300 shrink-0 transition-all duration-200 group-hover:text-neutral-500 group-hover:translate-x-0.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ========== SIDEBAR - Project Info ========== */}
          <aside className="w-72 lg:w-80 flex-shrink-0 hidden md:block">
            <div className="sticky top-10 space-y-8">
              {/* Sidebar card container */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-neutral-200/50 p-6 shadow-sm">
                {/* Status - Clickable dropdown */}
                <div className="pb-6 border-b border-neutral-100">
                  <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em] mb-4">Project Status</h3>
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`flex items-center gap-3 w-full p-3 rounded-xl ${statusConfig[project.status].bg} hover:opacity-90 transition-all duration-200 ${statusConfig[project.status].glow}`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center">
                        {project.status === 'completed' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : project.status === 'in_progress' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        ) : project.status === 'on_hold' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className={`w-2.5 h-2.5 rounded-full ${statusConfig[project.status].color.replace('text-', 'bg-')}`} />
                        )}
                      </span>
                      <span className={`font-semibold text-sm ${statusConfig[project.status].color}`}>
                        {statusConfig[project.status].label}
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${statusConfig[project.status].color} ml-auto transition-transform duration-200 ${showStatusDropdown ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {/* Status Dropdown */}
                    {showStatusDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-xl border border-neutral-200/80 py-2 z-10 animate-fade-in-scale">
                        {(['not_started', 'in_progress', 'on_hold', 'completed'] as ProjectStatus[]).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-50 transition-all duration-150 ${
                              project.status === status ? 'bg-neutral-50' : ''
                            }`}
                          >
                            <span className={`w-7 h-7 rounded-lg ${statusConfig[status].bg} flex items-center justify-center`}>
                              {status === 'completed' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${statusConfig[status].color}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : status === 'in_progress' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${statusConfig[status].color}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                              ) : status === 'on_hold' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${statusConfig[status].color}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <div className={`w-2 h-2 rounded-full ${statusConfig[status].color.replace('text-', 'bg-')}`} />
                              )}
                            </span>
                            <span className={`text-sm font-medium ${statusConfig[status].color}`}>
                              {statusConfig[status].label}
                            </span>
                            {project.status === status && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-600 ml-auto" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                        {/* Info text about auto-calculation */}
                        {project.status !== 'on_hold' && calculatedStatus !== project.status && (
                          <div className="px-4 py-2.5 text-xs text-neutral-500 border-t border-neutral-100 mt-2">
                            Based on tasks: <span className={`font-semibold ${statusConfig[calculatedStatus].color}`}>{statusConfig[calculatedStatus].label}</span>
                          </div>
                        )}
                        {project.status === 'on_hold' && (
                          <div className="px-4 py-2.5 text-xs text-amber-600 border-t border-neutral-100 mt-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            Paused — won't auto-update
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress - enhanced visual */}
                {totalCount > 0 && (
                  <div className="pt-6">
                    <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em] mb-4">Progress</h3>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-4xl font-display font-semibold text-neutral-800">
                        {Math.round(progressPercent)}
                      </span>
                      <span className="text-lg text-neutral-400">%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-sm text-neutral-500">
                      {completedCount} of {totalCount} tasks complete
                    </p>
                  </div>
                )}
              </div>

              {/* Linked Events - separate card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-neutral-200/50 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em]">Linked Events</h3>
                  {onLinkEvent && availableEvents.length > 0 && (
                    <div className="relative" ref={eventSelectorRef}>
                      <button
                        onClick={() => setShowEventSelector(!showEventSelector)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Link
                      </button>

                      {/* Event Selector Dropdown */}
                      {showEventSelector && (
                        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-neutral-200/80 z-20 overflow-hidden animate-fade-in-scale">
                          {/* Search Input */}
                          <div className="p-3 border-b border-neutral-100">
                            <input
                              type="text"
                              value={eventSearchQuery}
                              onChange={(e) => setEventSearchQuery(e.target.value)}
                              placeholder="Search events..."
                              className="w-full px-4 py-2.5 text-sm rounded-xl border border-neutral-200 bg-neutral-50
                                         focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white transition-all duration-200"
                              autoFocus
                            />
                          </div>

                          {/* Events List */}
                          <div className="max-h-72 overflow-y-auto">
                            {filteredAvailableEvents.length === 0 ? (
                              <div className="p-6 text-center">
                                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                                <p className="text-sm text-neutral-500">
                                  {eventSearchQuery ? 'No matching events' : 'No upcoming events'}
                                </p>
                              </div>
                            ) : (
                              <div className="p-2">
                                {filteredAvailableEvents.map((event) => {
                                  const eventId = event.google_event_id || event.id
                                  const startTimeStr = event.start_time || event.startTime || ''
                                  const eventDate = startTimeStr ? new Date(startTimeStr) : null

                                  return (
                                    <button
                                      key={eventId}
                                      onClick={() => handleLinkEvent(event)}
                                      className="w-full p-3 flex items-start gap-3 hover:bg-neutral-50 rounded-xl transition-all duration-150 text-left"
                                    >
                                      <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-neutral-800 truncate">{event.title}</p>
                                        {eventDate && (
                                          <p className="text-xs text-neutral-500 mt-0.5">
                                            {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {linkedEvents.length > 0 ? (
                  <div className="space-y-2">
                    {linkedEvents
                      .filter(note => note.eventTitle)
                      .map((note) => {
                      const eventDate = note.eventStartTime

                      return (
                        <div
                          key={note.id}
                          className="group flex items-start gap-3 p-3 -mx-3 rounded-xl hover:bg-neutral-50 transition-all duration-150"
                        >
                          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-800 truncate">{note.eventTitle}</p>
                            {eventDate && (
                              <p className="text-xs text-neutral-500 mt-0.5">
                                {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          {onUnlinkEvent && (
                            <button
                              onClick={() => onUnlinkEvent(note.googleEventId)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150"
                              aria-label="Unlink event"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-2 text-neutral-400">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-sm">No linked events</span>
                  </div>
                )}
              </div>

              {/* Notes - separate card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-neutral-200/50 p-6 shadow-sm">
                <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em] mb-4">Notes</h3>
                {project.notes ? (
                  <p className="text-sm text-neutral-600 leading-relaxed">{project.notes}</p>
                ) : (
                  <div className="flex items-center gap-3 py-2 text-neutral-400">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <span className="text-sm">No notes added</span>
                  </div>
                )}
              </div>

              {/* Linked Lists - separate card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-neutral-200/50 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em]">Lists</h3>
                  {(onLinkList || onCreateList) && (
                    <div className="relative" ref={listPickerRef}>
                      <button
                        onClick={() => setShowListPicker(!showListPicker)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Add
                      </button>

                      {/* List Picker Dropdown */}
                      {showListPicker && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-200/80 z-20 overflow-hidden animate-fade-in-scale">
                          {/* Create new list */}
                          {onCreateList && (
                            <form onSubmit={handleCreateList} className="p-3 border-b border-neutral-100">
                              <input
                                type="text"
                                value={newListTitle}
                                onChange={(e) => setNewListTitle(e.target.value)}
                                placeholder="Create new list..."
                                className="w-full px-4 py-2.5 text-sm rounded-xl border border-neutral-200 bg-neutral-50
                                           focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white transition-all duration-200"
                                autoFocus
                              />
                            </form>
                          )}

                          {/* Link existing list */}
                          {onLinkList && availableLists.length > 0 && (
                            <div className="max-h-48 overflow-y-auto">
                              <div className="px-3 py-2 text-xs font-bold text-neutral-400 uppercase tracking-wide">
                                Link existing
                              </div>
                              {availableLists.map((list) => (
                                <button
                                  key={list.id}
                                  onClick={() => {
                                    onLinkList(list.id)
                                    setShowListPicker(false)
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 flex items-center gap-3"
                                >
                                  <span className="text-base">{list.icon || getCategoryIcon(list.category)}</span>
                                  <span className="truncate font-medium text-neutral-700">{list.title}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {onLinkList && availableLists.length === 0 && !onCreateList && (
                            <div className="px-4 py-6 text-sm text-neutral-400 text-center">
                              No lists available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {linkedLists.length > 0 ? (
                  <div className="space-y-2">
                    {linkedLists.map((list) => (
                      <div
                        key={list.id}
                        className="group flex items-center gap-3 p-3 -mx-3 rounded-xl hover:bg-neutral-50 transition-all duration-150"
                      >
                        <button
                          onClick={() => onSelectList?.(list.id)}
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                        >
                          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
                            <span className="text-base">{list.icon || getCategoryIcon(list.category)}</span>
                          </div>
                          <span className="text-sm font-medium text-neutral-800 truncate">{list.title}</span>
                        </button>
                        {onUnlinkList && (
                          <button
                            onClick={() => onUnlinkList(list.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150"
                            aria-label="Unlink list"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-2 text-neutral-400">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-sm">No linked lists</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
