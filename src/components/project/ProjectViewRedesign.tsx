import { useMemo, useState, useEffect, useCallback } from 'react'
import type { Project, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { EventNote } from '@/hooks/useEventNotes'
import type { TripMetadata, TripEvent } from '@/types/trip'
import { formatTimeWithDate } from '@/lib/timeUtils'
import { TaskQuickActions, type ScheduleContextItem } from '@/components/triage'
import { calculateProjectStatus } from '@/hooks/useProjects'
import { UnifiedNotesEditor } from '@/components/notes/UnifiedNotesEditor'
import { TripCreationModal } from '../trip/TripCreationModal'
import { TripItineraryView } from '../trip/TripItineraryView'
import { analyzeLanguage, getCoachingMessage, getExamples } from '@/lib/outcomeLanguage'
import { CoachingTip } from '@/components/coaching/CoachingTip'

interface ProjectViewProps {
  project: Project
  tasks: Task[]
  contactsMap: Map<string, Contact>
  onBack: () => void
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void
  onUpdateTripProject?: (projectId: string, name: string, tripMetadata: TripMetadata) => Promise<void>
  onDeleteProject?: (projectId: string) => void
  onAddTask?: (title: string, projectId: string) => void | Promise<any>
  onDeleteTask?: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  selectedTaskId?: string | null
  // Task quick-action props
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  familyMembers?: FamilyMember[]
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Linked calendar events (stored as event notes with event metadata)
  linkedEvents?: EventNote[]
  // Pin props (available but not used in redesign yet)
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
}

export function ProjectViewRedesign({
  project,
  tasks,
  contactsMap,
  onBack,
  onUpdateProject,
  onUpdateTripProject,
  onDeleteProject,
  onAddTask,
  onDeleteTask,
  onSelectTask,
  onToggleTask,
  selectedTaskId,
  onUpdateTask,
  familyMembers = [],
  getScheduleItemsForDate,
  linkedEvents = [],
  isPinned: _isPinned,
  canPin: _canPin,
  onPin: _onPin,
  onUnpin: _onUnpin,
}: ProjectViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('not_started')
  const [editPhoneNumber, setEditPhoneNumber] = useState('')
  const [editLinks, setEditLinks] = useState<string>('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditTripModal, setShowEditTripModal] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null)
  const [coachingExamples, setCoachingExamples] = useState<string[]>([])

  // Analyze project name for vague language patterns
  useEffect(() => {
    if (!isEditing || !editName.trim()) {
      setCoachingMessage(null)
      setCoachingExamples([])
      return
    }

    const analysis = analyzeLanguage(editName)
    const message = getCoachingMessage(analysis)
    const examples = getExamples(analysis)

    setCoachingMessage(message)
    setCoachingExamples(examples)
  }, [editName, isEditing])

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

  // Auto-update disabled - user has full manual control over project status
  // The calculatedStatus is still available for display purposes if needed

  const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
    not_started: { label: 'Not Started', color: 'text-neutral-600', bg: 'bg-neutral-100' },
    in_progress: { label: 'In Progress', color: 'text-primary-700', bg: 'bg-primary-100' },
    on_hold: { label: 'On Hold', color: 'text-amber-700', bg: 'bg-amber-100' },
    completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-100' },
  }

  const handleEdit = () => {
    setEditName(project.name)
    setEditStatus(project.status)
    setEditPhoneNumber(project.phoneNumber || '')
    setEditLinks(project.links?.map(l => l.url).join('\n') || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmedName = editName.trim()
    if (trimmedName) {
      // Parse links from newline-separated URLs
      const linksArray = editLinks
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0)
        .map(url => ({ url }))

      onUpdateProject(project.id, {
        name: trimmedName,
        status: editStatus,
        phoneNumber: editPhoneNumber.trim() || undefined,
        links: linksArray.length > 0 ? linksArray : undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditName('')
    setEditStatus('not_started')
    setEditPhoneNumber('')
    setEditLinks('')
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

  const handleNotesChange = useCallback((value: string | null) => {
    onUpdateProject(project.id, { notes: value || undefined })
  }, [project.id, onUpdateProject])

  // Trip projects get a completely different, full-width layout
  const isTripProject = project.type === 'trip' && project.tripMetadata

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />

      <div className={`relative ${isTripProject ? 'max-w-full' : 'max-w-6xl'} mx-auto px-6 py-8`}>
        {/* Back button */}
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
          Back to projects
        </button>

        {/* Conditional layout: Full-width for trips, Two-column for regular projects */}
        {isTripProject ? (
          /* Full-width Trip Layout */
          <div>
            {/* Condensed trip header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-display text-3xl font-semibold text-neutral-900 leading-tight">
                  {project.name}
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig[project.status].bg} ${statusConfig[project.status].color}`}>
                    {statusConfig[project.status].label}
                  </span>
                  {totalCount > 0 && (
                    <span className="text-sm text-neutral-500">
                      {completedCount} of {totalCount} tasks complete
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onUpdateTripProject && (
                  <button
                    onClick={() => setShowEditTripModal(true)}
                    className="p-2 text-neutral-500 hover:text-primary-600 rounded-lg transition-colors hover:bg-neutral-100"
                    aria-label="Edit trip details"
                    title="Edit trip details"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleEdit}
                  className="p-2 text-neutral-300 hover:text-primary-600 rounded-lg transition-colors"
                  aria-label="Edit project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                {onDeleteProject && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-neutral-300 hover:text-red-500 rounded-lg transition-colors"
                    aria-label="Delete project"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Full-width Trip Itinerary */}
            {project.tripMetadata && (
              <TripItineraryView
                tripMetadata={project.tripMetadata}
                tasks={projectTasks}
                onToggleTask={onToggleTask}
                onUpdateTripMetadata={onUpdateTripProject}
                projectId={project.id}
                projectName={project.name}
                onEditEvent={(eventId, insertIdx) => {
                  setEditingEventId(eventId || null)
                  setInsertAtIndex(insertIdx)
                  setShowEditTripModal(true)
                }}
                onDeleteEvent={(eventId) => {
                  // Delete event from trip metadata
                  if (project?.tripMetadata) {
                    const updatedMetadata = {
                      ...project.tripMetadata,
                      events: project.tripMetadata.events?.filter((e: TripEvent) => e.id !== eventId) || []
                    }
                    onUpdateProject(project.id, {
                      ...project,
                      tripMetadata: updatedMetadata
                    })
                  }
                }}
                onAddTask={onAddTask ? async (task: { title: string; projectId?: string }) => {
                  const result = onAddTask(task.title, task.projectId || project.id)
                  return result instanceof Promise ? result : Promise.resolve(null)
                } : undefined}
                onDeleteTask={onDeleteTask}
              />
            )}
          </div>
        ) : (
          /* Two-column layout for regular projects */
          <div className="flex gap-12 lg:gap-16">
          {/* ========== MAIN COLUMN - Tasks ========== */}
          <div className="flex-1 min-w-0">
            {/* Project Header */}
            <div className="mb-10">
              <div className="flex items-start gap-5">
                {/* Project icon */}
                <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-3xl lg:text-4xl font-semibold text-neutral-900 leading-tight tracking-tight">
                    {project.name}
                  </h1>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig[project.status].bg} ${statusConfig[project.status].color}`}>
                      {statusConfig[project.status].label}
                    </span>
                    {totalCount > 0 && (
                      <span className="text-sm text-neutral-500">
                        {completedCount} of {totalCount} tasks complete
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 ml-19">
                {project.type === 'trip' && project.tripMetadata && onUpdateTripProject && (
                  <button
                    onClick={() => setShowEditTripModal(true)}
                    className="p-2 text-neutral-300 hover:text-primary-600 rounded-lg transition-colors"
                    aria-label="Edit trip details"
                    title="Edit trip details"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleEdit}
                  className="p-2 text-neutral-300 hover:text-primary-600 rounded-lg transition-colors"
                  aria-label="Edit project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                {onDeleteProject && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-neutral-300 hover:text-red-500 rounded-lg transition-colors"
                    aria-label="Delete project"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="mt-6 p-5 bg-red-50/80 border border-red-200/60 rounded-2xl backdrop-blur-sm">
                  <p className="text-sm text-red-800 mb-4 font-medium">
                    Delete this project? Tasks will remain but be unlinked.
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

              {/* Edit mode */}
              {isEditing && (
                <div className="mt-6 p-5 bg-primary-50/80 border border-primary-200/60 rounded-2xl backdrop-blur-sm">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-neutral-200 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                      />
                      {/* Coaching Tip - appears when vague language detected */}
                      {coachingMessage && (
                        <div className="mt-3">
                          <CoachingTip
                            message={coachingMessage}
                            examples={coachingExamples}
                            onDismiss={() => {
                              setCoachingMessage(null)
                              setCoachingExamples([])
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Status</label>
                      <div className="flex rounded-xl border border-neutral-200 overflow-hidden">
                        {(['not_started', 'in_progress', 'on_hold', 'completed'] as ProjectStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setEditStatus(status)}
                            className={`flex-1 py-2.5 px-3 text-sm font-medium transition-colors
                              ${editStatus === status
                                ? `${statusConfig[status].bg} ${statusConfig[status].color}`
                                : 'bg-white text-neutral-500 hover:bg-neutral-50'
                              } ${status !== 'not_started' ? 'border-l border-neutral-200' : ''}`}
                          >
                            {statusConfig[status].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Phone Number</label>
                      <input
                        type="tel"
                        value={editPhoneNumber}
                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-neutral-200 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">Links (one per line)</label>
                      <textarea
                        value={editLinks}
                        onChange={(e) => setEditLinks(e.target.value)}
                        placeholder="https://example.com&#10;https://docs.example.com"
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-neutral-200 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleCancel}
                        className="flex-1 py-2.5 px-4 text-sm font-medium text-neutral-600 bg-white
                                   rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={!editName.trim()}
                        className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-primary-500
                                   rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {totalCount > 0 && !isEditing && (
              <div className="flex items-center gap-4 mb-8">
                <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-neutral-500 tabular-nums w-12 text-right">
                  {Math.round(progressPercent)}%
                </span>
              </div>
            )}

            {/* ========== TASKS ========== */}
            <div className="mb-10">
                <h2 className="font-display text-lg font-medium text-neutral-800 mb-5">Tasks</h2>

                {/* Add task */}
                {onAddTask && (
                  <form onSubmit={handleAddTask} className="mb-6">
                    <div className="flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl border-2 border-dashed border-neutral-200
                                    hover:border-neutral-300 focus-within:border-primary-400 focus-within:bg-white transition-all">
                      <span className="w-6 h-6 rounded-lg border-2 border-dashed border-neutral-300 flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Add a task..."
                        className="flex-1 bg-transparent text-base text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
                      />
                      {newTaskTitle.trim() && (
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* Task list */}
                {sortedTasks.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-neutral-500 mb-1">No tasks yet</p>
                    <p className="text-sm text-neutral-400">Add a task above to get started</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sortedTasks.map((task) => {
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
                          className={`
                            flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl cursor-pointer
                            transition-all duration-150
                            ${isSelected
                              ? 'bg-primary-50/70 ring-1 ring-primary-200'
                              : 'hover:bg-white/60'
                            }
                            ${task.completed ? 'opacity-60' : ''}
                          `}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleTask(task.id)
                            }}
                            className="flex-shrink-0"
                            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                          >
                            <span
                              className={`
                                w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                                ${task.completed
                                  ? 'bg-primary-500 border-primary-500 text-white'
                                  : 'border-neutral-300 hover:border-primary-400'
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

                          {/* Title */}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className={`text-base truncate ${task.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                              {task.title}
                            </span>
                            {contactName && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                                {contactName}
                              </span>
                            )}
                          </div>

                          {/* Date badge */}
                          {task.scheduledFor && (
                            <span className="text-xs text-neutral-400 font-medium shrink-0">
                              {formatTaskDate(task.scheduledFor, task.isAllDay)}
                            </span>
                          )}

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
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          )}

                          {/* Arrow */}
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            {/* Notes - Inline */}
            <div className="pt-8 border-t border-neutral-200/60">
              <h2 className="font-display text-lg font-medium text-neutral-800 mb-4">Notes</h2>
              <UnifiedNotesEditor
                value={project.notes}
                onChange={handleNotesChange}
                placeholder="Add notes about this project..."
                minHeight={150}
              />
            </div>
          </div>

          {/* ========== SIDEBAR - Project Info ========== */}
          <aside className="w-72 lg:w-80 flex-shrink-0 hidden md:block">
            <div className="sticky top-8 space-y-6">
              {/* Status - Clickable dropdown */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Status</h3>
                <div className="relative">
                  <button
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className="flex items-center gap-3 w-full p-2 -ml-2 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    <span className={`w-9 h-9 rounded-xl ${statusConfig[project.status].bg} flex items-center justify-center`}>
                      {project.status === 'completed' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4.5 h-4.5 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : project.status === 'in_progress' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4.5 h-4.5 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      ) : project.status === 'on_hold' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4.5 h-4.5 ${statusConfig[project.status].color}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full ${statusConfig[project.status].color.replace('text-', 'bg-')}`} />
                      )}
                    </span>
                    <span className={`font-medium ${statusConfig[project.status].color}`}>
                      {statusConfig[project.status].label}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 ml-auto" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Status Dropdown */}
                  {showStatusDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl shadow-lg border border-neutral-200 py-1 z-10">
                      {(['not_started', 'in_progress', 'on_hold', 'completed'] as ProjectStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors ${
                            project.status === status ? 'bg-neutral-50' : ''
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-lg ${statusConfig[status].bg} flex items-center justify-center`}>
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
                        <div className="px-3 py-2 text-xs text-neutral-500 border-t border-neutral-100 mt-1">
                          Based on tasks, status would be: <span className={`font-medium ${statusConfig[calculatedStatus].color}`}>{statusConfig[calculatedStatus].label}</span>
                        </div>
                      )}
                      {project.status === 'on_hold' && (
                        <div className="px-3 py-2 text-xs text-amber-600 border-t border-neutral-100 mt-1">
                          "On Hold" won't auto-update based on tasks
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress */}
              {totalCount > 0 && (
                <div className="pb-6 border-b border-neutral-200/60">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Progress</h3>
                  <div className="text-2xl font-display font-semibold text-neutral-800 mb-2">
                    {Math.round(progressPercent)}%
                  </div>
                  <div className="text-sm text-neutral-500">
                    {completedCount} of {totalCount} tasks complete
                  </div>
                </div>
              )}

              {/* Project Context (Links & Phone) */}
              {(project.links?.length || project.phoneNumber) && (
                <div className="pb-6 border-b border-neutral-200/60">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Project Context</h3>
                  <div className="space-y-3">
                    {/* Phone Number */}
                    {project.phoneNumber && (
                      <div>
                        <div className="text-xs text-neutral-500 mb-1.5">Phone</div>
                        <a
                          href={`tel:${project.phoneNumber}`}
                          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium p-2 -mx-2 rounded-lg hover:bg-primary-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {project.phoneNumber}
                        </a>
                      </div>
                    )}

                    {/* Links */}
                    {project.links && project.links.length > 0 && (
                      <div>
                        <div className="text-xs text-neutral-500 mb-1.5">Links</div>
                        <div className="space-y-1">
                          {project.links.map((link, index) => (
                            <a
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 p-2 -mx-2 rounded-lg hover:bg-primary-50 transition-colors group"
                            >
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span className="truncate">{link.title || link.url}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Linked Events */}
              {linkedEvents.length > 0 && (
                <div className="pb-6 border-b border-neutral-200/60">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Linked Events</h3>
                  <div className="space-y-2">
                    {linkedEvents
                      .filter(note => note.eventTitle) // Only show events that have title stored
                      .map((note) => {
                      const eventDate = note.eventStartTime

                      return (
                        <div
                          key={note.id}
                          className="flex items-start gap-2 p-2 -mx-2 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 flex-shrink-0 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-800 truncate">{note.eventTitle}</p>
                            {eventDate && (
                              <p className="text-xs text-neutral-500">
                                {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
        )}
      </div>

      {/* Trip Edit Modal */}
      {onUpdateTripProject && project.type === 'trip' && project.tripMetadata && (
        <TripCreationModal
          isOpen={showEditTripModal}
          onClose={() => {
            setShowEditTripModal(false)
            setEditingEventId(null)
            setInsertAtIndex(undefined)
          }}
          onCreateTrip={async () => null} // Not used in edit mode
          onUpdateTrip={onUpdateTripProject}
          existingProject={project}
          editingEventId={editingEventId}
          insertAtIndex={insertAtIndex}
        />
      )}
    </div>
  )
}
