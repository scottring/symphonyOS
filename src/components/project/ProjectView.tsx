import { useMemo, useState } from 'react'
import type { Project, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'

interface ProjectViewProps {
  project: Project
  tasks: Task[]
  contactsMap: Map<string, Contact>
  onBack: () => void
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  selectedTaskId?: string | null
}

export function ProjectView({
  project,
  tasks,
  contactsMap,
  onBack,
  onUpdateProject,
  onSelectTask,
  onToggleTask,
  selectedTaskId,
}: ProjectViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('not_started')
  const [editNotes, setEditNotes] = useState('')

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
      case 'active':
        return 'Active'
      case 'completed':
        return 'Completed'
    }
  }

  const statusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'bg-neutral-100 text-neutral-600'
      case 'active':
        return 'bg-blue-100 text-blue-700'
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

  const formatDate = (date: Date | undefined) => {
    if (!date) return null
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Back
          </button>

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
                      onClick={() => setEditStatus('active')}
                      className={`flex-1 py-2 px-3 text-sm font-medium border-l border-neutral-200 transition-colors
                        ${editStatus === 'active'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      Active
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
              <button
                onClick={handleEdit}
                className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                aria-label="Edit project"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
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

          {sortedTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-neutral-500 mb-2">No tasks linked to this project</p>
              <p className="text-sm text-neutral-400">Create a task and link it using #</p>
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
                    <div className="w-12 shrink-0">
                      {task.scheduledFor ? (
                        <span className="text-xs text-neutral-400 font-medium">
                          {formatDate(task.scheduledFor)}
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
    </div>
  )
}
