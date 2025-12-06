import { useState, useRef, useEffect } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'

type ItemType = 'task' | 'project'

interface InboxTriageModalProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onProcessAsTask: (updates: Partial<Task>) => void
  onConvertToProject: (name: string, domain?: TaskContext) => void
  onDelete: () => void
  projects: Project[]
  familyMembers: FamilyMember[]
  currentUserId?: string
}

// Date options for "When" picker
type WhenOption = 'today' | 'tomorrow' | 'next-week' | 'pick-date' | 'someday' | null

export function InboxTriageModal({
  task,
  isOpen,
  onClose,
  onProcessAsTask,
  onConvertToProject,
  onDelete,
  projects,
  familyMembers,
  currentUserId,
}: InboxTriageModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Form state
  const [itemType, setItemType] = useState<ItemType>('task')
  const [whenOption, setWhenOption] = useState<WhenOption>(null)
  const [customDate, setCustomDate] = useState<string>('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(currentUserId ?? null)
  const [domain, setDomain] = useState<TaskContext | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // Reset form when modal opens/closes or task changes
  useEffect(() => {
    if (isOpen) {
      setItemType('task')
      setWhenOption(null)
      setCustomDate('')
      setSelectedMemberId(currentUserId ?? null)
      setDomain(null)
      setProjectId(null)
      setIsCreatingProject(false)
      setNewProjectName('')
    }
  }, [isOpen, task.id, currentUserId])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const getScheduledDate = (): Date | undefined => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    switch (whenOption) {
      case 'today':
        return today
      case 'tomorrow': {
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return tomorrow
      }
      case 'next-week': {
        const nextWeek = new Date(today)
        nextWeek.setDate(nextWeek.getDate() + 7)
        return nextWeek
      }
      case 'pick-date':
        if (customDate) {
          const [year, month, day] = customDate.split('-').map(Number)
          return new Date(year, month - 1, day)
        }
        return undefined
      case 'someday':
      default:
        return undefined
    }
  }

  const handleDone = () => {
    if (itemType === 'project') {
      // Convert to project
      onConvertToProject(task.title, domain ?? undefined)
    } else {
      // Process as task with selected options
      const updates: Partial<Task> = {}

      const scheduledDate = getScheduledDate()
      if (scheduledDate) {
        updates.scheduledFor = scheduledDate
        updates.isAllDay = true
      }

      if (selectedMemberId) {
        updates.assignedTo = selectedMemberId
      }

      if (domain) {
        updates.context = domain
      }

      if (projectId) {
        updates.projectId = projectId
      }

      onProcessAsTask(updates)
    }
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  // Filter projects by domain if selected
  const filteredProjects = domain
    ? projects // We don't have domain on projects, so show all for now
    : projects

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        ref={modalRef}
        className="bg-white w-full sm:w-[90%] sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-auto animate-slide-in-up"
        role="dialog"
        aria-modal="true"
        aria-label="Triage inbox item"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-neutral-800 truncate pr-4">
              {task.title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Item Type Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setItemType('task')}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  itemType === 'task'
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                    : 'bg-neutral-50 text-neutral-600 border-2 border-transparent hover:bg-neutral-100'
                }`}
              >
                Task
              </button>
              <button
                onClick={() => setItemType('project')}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  itemType === 'project'
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                    : 'bg-neutral-50 text-neutral-600 border-2 border-transparent hover:bg-neutral-100'
                }`}
              >
                Project
              </button>
            </div>
          </div>

          {/* When (Task only) */}
          {itemType === 'task' && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                When
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setWhenOption('today')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    whenOption === 'today'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setWhenOption('tomorrow')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    whenOption === 'tomorrow'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Tomorrow
                </button>
                <button
                  onClick={() => setWhenOption('next-week')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    whenOption === 'next-week'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Next Week
                </button>
                <button
                  onClick={() => setWhenOption('pick-date')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    whenOption === 'pick-date'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Pick date
                </button>
                <button
                  onClick={() => setWhenOption('someday')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors col-span-2 ${
                    whenOption === 'someday'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Someday/Maybe
                </button>
              </div>
              {whenOption === 'pick-date' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              )}
            </div>
          )}

          {/* Who (Task only) */}
          {itemType === 'task' && familyMembers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Who
              </label>
              <div className="flex flex-wrap gap-2">
                {familyMembers.map((member) => {
                  const colorKey = member.color as FamilyMemberColor
                  const colors = FAMILY_COLORS[colorKey] || FAMILY_COLORS.blue
                  const isSelected = selectedMemberId === member.id

                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMemberId(isSelected ? null : member.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        isSelected
                          ? `${colors.bg} ${colors.text} ring-2 ${colors.ring}`
                          : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${colors.bg} ${colors.text}`}>
                        {member.initials}
                      </span>
                      {member.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Domain */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Domain
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDomain(domain === 'work' ? null : 'work')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  domain === 'work'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Work
              </button>
              <button
                onClick={() => setDomain(domain === 'personal' ? null : 'personal')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  domain === 'personal'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Personal
              </button>
              <button
                onClick={() => setDomain(domain === 'family' ? null : 'family')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  domain === 'family'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Family
              </button>
            </div>
          </div>

          {/* Project (Task only) */}
          {itemType === 'task' && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Project
              </label>
              {!isCreatingProject ? (
                <div className="space-y-2">
                  <select
                    value={projectId ?? ''}
                    onChange={(e) => setProjectId(e.target.value || null)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 bg-white
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">No project</option>
                    {filteredProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setIsCreatingProject(true)}
                    className="w-full px-3 py-2 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create New Project
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name..."
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsCreatingProject(false)
                        setNewProjectName('')
                      }}
                      className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        // Create project and convert this item
                        if (newProjectName.trim()) {
                          onConvertToProject(newProjectName.trim(), domain ?? undefined)
                          onClose()
                        }
                      }}
                      disabled={!newProjectName.trim()}
                      className="flex-1 px-3 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                    >
                      Create & Add Task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-5 py-4">
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              className="px-4 py-3 rounded-xl text-neutral-500 hover:text-danger-600 hover:bg-danger-50 transition-colors"
              aria-label="Delete"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={handleDone}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {itemType === 'project' ? 'Create Project' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
