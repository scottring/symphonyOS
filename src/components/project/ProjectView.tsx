import { useMemo, useState } from 'react'
import type { Project, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { TripMetadata } from '@/types/trip'
import { PinButton } from '@/components/pins'
import { formatTimeWithDate } from '@/lib/timeUtils'
import { TripCreationModal } from '../trip/TripCreationModal'

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
  // Pin props
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
}

export function ProjectView({
  project,
  tasks,
  contactsMap,
  onBack,
  onUpdateProject,
  onUpdateTripProject,
  onDeleteProject,
  onAddTask,
  onDeleteTask: _onDeleteTask,
  onSelectTask,
  onToggleTask,
  selectedTaskId,
  isPinned,
  canPin,
  onPin,
  onUnpin,
}: ProjectViewProps) {
  void _onDeleteTask // Available for future use
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('not_started')
  const [editNotes, setEditNotes] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditTripModal, setShowEditTripModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // Filter tasks for this project
  const projectTasks = useMemo(() => {
    return tasks.filter((t) => t.projectId === project.id)
  }, [tasks, project.id])

  // Sort: incomplete first (by scheduledFor date), then completed (by scheduledFor date)
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

  const statusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'Not Started'
      case 'in_progress':
        return 'In Progress'
      case 'on_hold':
        return 'On Hold'
      case 'completed':
        return 'Completed'
    }
  }

  const statusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'bg-neutral-100 text-neutral-600'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'on_hold':
        return 'bg-amber-100 text-amber-700'
      case 'completed':
        return 'bg-green-100 text-green-700'
    }
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
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }
    return formatTimeWithDate(date)
  }

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
            <span className="text-sm font-medium text-neutral-600">Project</span>
          </div>

          {isEditing ? (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
                  <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditStatus('not_started')}
                      className={`flex-1 py-2 px-3 text-sm font-medium transition-colors
                        ${editStatus === 'not_started'
                          ? 'bg-neutral-100 text-neutral-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      Not Started
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatus('in_progress')}
                      className={`flex-1 py-2 px-3 text-sm font-medium border-l border-neutral-200 transition-colors
                        ${editStatus === 'in_progress'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      In Progress
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatus('on_hold')}
                      className={`flex-1 py-2 px-3 text-sm font-medium border-l border-neutral-200 transition-colors
                        ${editStatus === 'on_hold'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      On Hold
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatus('completed')}
                      className={`flex-1 py-2 px-3 text-sm font-medium border-l border-neutral-200 transition-colors
                        ${editStatus === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      Completed
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Notes (optional)</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes about this project..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!editName.trim()}
                    className="flex-1 py-2 px-3 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-neutral-800">{project.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(project.status)}`}>
                      {statusLabel(project.status)}
                    </span>
                    {totalCount > 0 && (
                      <span className="text-sm text-neutral-500">
                        {completedCount} of {totalCount} tasks
                      </span>
                    )}
                  </div>
                  {project.notes && (
                    <p className="text-sm text-neutral-600 mt-2">{project.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {onPin && onUnpin && (
                  <PinButton
                    entityType="project"
                    entityId={project.id}
                    isPinned={isPinned ?? false}
                    canPin={canPin ?? true}
                    onPin={onPin}
                    onUnpin={onUnpin}
                    size="md"
                  />
                )}
                {project.type === 'trip' && project.tripMetadata && onUpdateTripProject && (
                  <button
                    onClick={() => setShowEditTripModal(true)}
                    className="p-2 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
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
                  className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  aria-label="Edit project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                {onDeleteProject && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Delete project"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 mb-3">
                Are you sure you want to delete this project? Tasks linked to this project will not be deleted.
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
                  Delete Project
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && !isEditing && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm text-neutral-500 tabular-nums">
              {Math.round(progressPercent)}%
            </span>
          </div>
        )}

        {/* Tasks list */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Tasks</h2>

          {/* Add task input */}
          {onAddTask && (
            <form onSubmit={handleAddTask} className="mb-4">
              <div className="flex items-center gap-2 pl-2 pr-4 py-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 focus-within:border-primary-300 focus-within:bg-white transition-colors">
                <div className="w-5 h-5 rounded-md border-2 border-neutral-200 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Add a task..."
                  className="flex-1 bg-transparent text-xl text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                />
                {newTaskTitle.trim() && (
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    Add
                  </button>
                )}
              </div>
            </form>
          )}

          {sortedTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-neutral-500 mb-2">No tasks yet</p>
              <p className="text-sm text-neutral-400">Add a task above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
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
                      flex items-center gap-3 pl-2 pr-4 py-3 rounded-xl cursor-pointer
                      transition-all duration-150 border
                      ${isSelected
                        ? 'bg-blue-50/50 border-blue-200 shadow-sm'
                        : 'bg-white border-neutral-100 hover:border-neutral-200 hover:shadow-sm'
                      }
                      ${task.completed ? 'opacity-50' : ''}
                    `}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleTask(task.id)
                      }}
                      className="touch-target flex items-center justify-center"
                      aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      <span
                        className={`
                          w-5 h-5 rounded-md border-2
                          flex items-center justify-center
                          transition-colors
                          ${task.completed
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-neutral-300 hover:border-blue-400'
                          }
                        `}
                      >
                        {task.completed && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                    </button>

                    {/* Date */}
                    <div className="w-20 shrink-0">
                      {task.scheduledFor ? (
                        <span className="text-xs text-neutral-400 font-medium">
                          {formatTaskDate(task.scheduledFor, task.isAllDay)}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </div>

                    {/* Title and contact chip */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className={`
                          text-base font-medium truncate
                          ${task.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
                        `}
                      >
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

                    {/* Context indicator */}
                    {(task.notes || task.links?.length || task.phoneNumber) && (
                      <div className="shrink-0 w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3.5 h-3.5 text-neutral-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trip Edit Modal */}
      {onUpdateTripProject && project.type === 'trip' && project.tripMetadata && (
        <TripCreationModal
          isOpen={showEditTripModal}
          onClose={() => setShowEditTripModal(false)}
          onCreateTrip={async () => null} // Not used in edit mode
          onUpdateTrip={onUpdateTripProject}
          existingProject={project}
        />
      )}
    </div>
  )
}
