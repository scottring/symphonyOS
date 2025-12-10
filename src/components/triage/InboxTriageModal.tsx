import { useState, useRef, useEffect } from 'react'
import type { Task, TaskContext, TaskCategory } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { PlacesAutocomplete, type PlaceSelection } from '@/components/location/PlacesAutocomplete'
import { useDirections } from '@/hooks/useDirections'

interface InboxTriageModalProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onProcessAsTask: (updates: Partial<Task>) => void
  onConvertToProject: (name: string, domain?: TaskContext) => void
  onConvertToNote?: (title: string, content?: string) => void
  onDelete: () => void
  projects: Project[]
  familyMembers: FamilyMember[]
  currentUserId?: string
}

// Date options for "When" picker
type WhenOption = 'today' | 'tomorrow' | 'next-week' | 'pick-date' | 'someday' | null

// Category configuration with icons and descriptions
const CATEGORIES: { value: TaskCategory; label: string; icon: string; description: string; color: string }[] = [
  { value: 'event', label: 'Event', icon: '📅', description: 'Calendar-blocked time', color: 'blue' },
  { value: 'activity', label: 'Activity', icon: '⚽', description: 'Kid commitment', color: 'green' },
  { value: 'chore', label: 'Chore', icon: '🧹', description: 'Recurring household', color: 'amber' },
  { value: 'errand', label: 'Errand', icon: '🚗', description: 'Location-based', color: 'purple' },
  { value: 'task', label: 'Task', icon: '✅', description: 'One-off action', color: 'neutral' },
]

export function InboxTriageModal({
  task,
  isOpen,
  onClose,
  onProcessAsTask,
  onConvertToProject,
  onConvertToNote,
  onDelete,
  projects,
  familyMembers,
  currentUserId,
}: InboxTriageModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { searchPlaces, getPlaceDetails } = useDirections()

  // Form state
  const [category, setCategory] = useState<TaskCategory>('task')
  const [whenOption, setWhenOption] = useState<WhenOption>(null)
  const [customDate, setCustomDate] = useState<string>('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(currentUserId ?? null)
  const [domain, setDomain] = useState<TaskContext | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [locationData, setLocationData] = useState<PlaceSelection | null>(null)
  // Event-specific
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  // Activity-specific (which kid)
  const [forChildId, setForChildId] = useState<string | null>(null)

  // Reset form when modal opens/closes or task changes
  useEffect(() => {
    if (isOpen) {
      setCategory(task.category ?? 'task')
      setWhenOption(null)
      setCustomDate('')
      setSelectedMemberId(task.assignedTo ?? currentUserId ?? null)
      setDomain(task.context ?? 'family') // Default to family context
      setProjectId(task.projectId ?? null)
      // Convert existing location string to PlaceSelection format
      setLocationData(task.location ? { name: task.location, address: task.location, placeId: '' } : null)
      setStartTime('')
      setEndTime('')
      setForChildId(null)
    }
  }, [isOpen, task.id, task.category, task.assignedTo, task.context, task.projectId, task.location, currentUserId])

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
      case 'today': return today
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
    const updates: Partial<Task> = {
      category,
    }

    const scheduledDate = getScheduledDate()
    if (scheduledDate) {
      updates.scheduledFor = scheduledDate
      // Events have specific times, others are all-day
      updates.isAllDay = category !== 'event' || !startTime
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

    if (locationData && (category === 'errand' || category === 'event' || category === 'activity')) {
      updates.location = locationData.address || locationData.name
    }

    onProcessAsTask(updates)
    onClose()
  }

  const handleConvertToProject = () => {
    onConvertToProject(task.title, domain ?? undefined)
    onClose()
  }

  const handleConvertToNote = () => {
    if (onConvertToNote) {
      onConvertToNote(task.title, task.notes)
    }
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  // Get kids from family members (those who aren't the current user)
  const kids = familyMembers.filter(m => m.id !== currentUserId)

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
          {/* Category Selection - Primary Action */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              What kind of thing is this?
            </label>
            <div className="grid grid-cols-1 gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat.value
                const colorClasses = {
                  blue: isSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : '',
                  green: isSelected ? 'bg-green-50 border-green-300 text-green-700' : '',
                  amber: isSelected ? 'bg-amber-50 border-amber-300 text-amber-700' : '',
                  purple: isSelected ? 'bg-purple-50 border-purple-300 text-purple-700' : '',
                  neutral: isSelected ? 'bg-neutral-100 border-neutral-400 text-neutral-700' : '',
                }
                return (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border-2 ${
                      isSelected
                        ? colorClasses[cat.color as keyof typeof colorClasses]
                        : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{cat.label}</div>
                      <div className="text-xs text-neutral-500">{cat.description}</div>
                    </div>
                    {isSelected && (
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs text-neutral-400 mb-3">Add details (optional)</p>
          </div>

          {/* Activity: Which child */}
          {category === 'activity' && kids.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Which Child?
              </label>
              <div className="flex flex-wrap gap-2">
                {kids.map((member) => {
                  const colorKey = member.color as FamilyMemberColor
                  const colors = FAMILY_COLORS[colorKey] || FAMILY_COLORS.blue
                  const isSelected = forChildId === member.id
                  return (
                    <button
                      key={member.id}
                      onClick={() => setForChildId(isSelected ? null : member.id)}
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

          {/* Location (Errand, Event, Activity) */}
          {(category === 'errand' || category === 'event' || category === 'activity') && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Location
              </label>
              <PlacesAutocomplete
                value={locationData ? { name: locationData.name, address: locationData.address, placeId: locationData.placeId } : null}
                onSelect={(place) => setLocationData(place)}
                onClear={() => setLocationData(null)}
                onSearch={searchPlaces}
                onGetDetails={getPlaceDetails}
                placeholder={category === 'errand' ? 'Store, address, etc.' : 'Where is this?'}
              />
            </div>
          )}

          {/* When - Schedule */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              When
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setWhenOption('today')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  whenOption === 'today' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setWhenOption('tomorrow')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  whenOption === 'tomorrow' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Tomorrow
              </button>
              <button
                onClick={() => setWhenOption('next-week')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  whenOption === 'next-week' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Next Week
              </button>
              <button
                onClick={() => setWhenOption('pick-date')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  whenOption === 'pick-date' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Pick date
              </button>
              {category !== 'event' && (
                <button
                  onClick={() => setWhenOption('someday')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors col-span-2 ${
                    whenOption === 'someday' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Someday/Maybe
                </button>
              )}
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

          {/* Time (Event only) */}
          {category === 'event' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}

          {/* Assign To */}
          {familyMembers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                {category === 'chore' ? 'Assigned To' : 'Who'}
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

          {/* Project Link (not for events) */}
          {category !== 'event' && projects.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Link to Project
              </label>
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 bg-white
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-5 py-4">
          {/* Secondary Actions Row */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-100">
            <button
              onClick={handleConvertToProject}
              className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Create Project
            </button>
            {onConvertToNote && (
              <button
                onClick={handleConvertToNote}
                className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Save as Note
              </button>
            )}
          </div>
          {/* Primary Actions Row */}
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
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
