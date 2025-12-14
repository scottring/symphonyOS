import { useMemo, useState } from 'react'
import type { Project, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { List } from '@/types/list'
import { getCategoryIcon } from '@/types/list'
import { PinButton } from '@/components/pins'
import { formatTimeWithDate } from '@/lib/timeUtils'

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
  // Pin props
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

export function ProjectView({
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
  isPinned,
  canPin,
  onPin,
  onUnpin,
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
  const [newListTitle, setNewListTitle] = useState('')
  const [showListPicker, setShowListPicker] = useState(false)

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

  // Lists that are not linked to any project (available to link)
  const availableLists = useMemo(() => {
    return allLists.filter((l) => !l.projectId)
  }, [allLists])

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

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newListTitle.trim()
    if (trimmed && onCreateList) {
      onCreateList(trimmed, project.id)
      setNewListTitle('')
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

        {/* Linked Lists section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Lists</h2>
            {(onLinkList || onCreateList) && (
              <div className="relative">
                <button
                  onClick={() => setShowListPicker(!showListPicker)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add List
                </button>

                {/* List picker popover */}
                {showListPicker && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-neutral-200 z-20 overflow-hidden">
                    {/* Create new list */}
                    {onCreateList && (
                      <form onSubmit={handleCreateList} className="p-2 border-b border-neutral-100">
                        <input
                          type="text"
                          value={newListTitle}
                          onChange={(e) => setNewListTitle(e.target.value)}
                          placeholder="Create new list..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      </form>
                    )}

                    {/* Link existing list */}
                    {onLinkList && availableLists.length > 0 && (
                      <div className="max-h-48 overflow-y-auto">
                        <div className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                          Link existing list
                        </div>
                        {availableLists.map((list) => (
                          <button
                            key={list.id}
                            onClick={() => {
                              onLinkList(list.id)
                              setShowListPicker(false)
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2"
                          >
                            <span>{list.icon || getCategoryIcon(list.category)}</span>
                            <span className="truncate">{list.title}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {onLinkList && availableLists.length === 0 && !onCreateList && (
                      <div className="px-3 py-4 text-sm text-neutral-400 text-center">
                        No lists available to link
                      </div>
                    )}

                    {/* Close button */}
                    <button
                      onClick={() => setShowListPicker(false)}
                      className="w-full px-3 py-2 text-xs text-neutral-400 hover:text-neutral-600 border-t border-neutral-100"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {linkedLists.length === 0 ? (
            <div className="text-center py-8 bg-neutral-50/50 rounded-xl border border-dashed border-neutral-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto text-neutral-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
              <p className="text-sm text-neutral-400">No lists linked yet</p>
              <p className="text-xs text-neutral-400 mt-1">Add lists to organize restaurants, activities, packing, etc.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {linkedLists.map((list) => (
                <div
                  key={list.id}
                  className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 hover:border-neutral-200 hover:shadow-sm transition-all group"
                >
                  <button
                    onClick={() => onSelectList?.(list.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <span className="text-xl">{list.icon || getCategoryIcon(list.category)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-base font-medium text-neutral-800 truncate block">{list.title}</span>
                    </div>
                  </button>
                  {onUnlinkList && (
                    <button
                      onClick={() => onUnlinkList(list.id)}
                      className="p-1.5 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Unlink from project"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
