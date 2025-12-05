import { useState, useEffect } from 'react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { parseRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'

// Sort and group options
type SortOption = 'time' | 'assignee' | 'frequency' | 'alphabetical'
type GroupOption = 'none' | 'assignee' | 'time' | 'frequency'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'time', label: 'Time of Day' },
  { value: 'assignee', label: 'By Assignee' },
  { value: 'frequency', label: 'By Frequency' },
  { value: 'alphabetical', label: 'Alphabetical' },
]

const GROUP_OPTIONS: { value: GroupOption; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'assignee', label: 'By Assignee' },
  { value: 'time', label: 'By Time of Day' },
  { value: 'frequency', label: 'By Frequency' },
]

// Sorting order maps
const TIME_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 }
const FREQUENCY_ORDER: Record<string, number> = {
  daily: 0,
  weekdays: 1,
  weekends: 2,
  weekly: 3,
  biweekly: 4,
  monthly: 5,
  quarterly: 6,
  yearly: 7,
  specific_days: 8,
}

interface RoutinesListProps {
  routines: Routine[]
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onSelectRoutine: (routine: Routine) => void
  onCreateRoutine: () => void
}

function formatRecurrence(routine: Routine): string {
  const { recurrence_pattern } = routine
  switch (recurrence_pattern.type) {
    case 'daily':
      return 'Every day'
    case 'weekly': {
      const days = recurrence_pattern.days || []
      if (days.length === 7) return 'Every day'
      if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
        return 'Weekdays'
      }
      if (days.length === 2 && days.includes('sat') && days.includes('sun')) {
        return 'Weekends'
      }
      const dayMap: Record<string, string> = {
        sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat'
      }
      return days.map(d => dayMap[d] || d).join(', ')
    }
    case 'monthly':
      return `Monthly on day ${recurrence_pattern.day_of_month}`
    case 'specific_days':
      return `${recurrence_pattern.dates?.length || 0} specific dates`
    default:
      return 'Custom'
  }
}

function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

// Get time of day category from time string
function getTimeOfDay(timeStr: string | null): 'morning' | 'afternoon' | 'evening' | null {
  if (!timeStr) return null
  const [hours] = timeStr.split(':').map(Number)
  if (hours < 12) return 'morning'
  if (hours < 17) return 'afternoon'
  return 'evening'
}

// Get frequency type from recurrence pattern
function getFrequencyType(pattern: RecurrencePattern): string {
  const { type, days, interval } = pattern

  if (type === 'weekly' && days) {
    if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
      return 'weekdays'
    }
    if (days.length === 2 && days.includes('sat') && days.includes('sun')) {
      return 'weekends'
    }
  }

  // Check for biweekly (interval of 2)
  if (type === 'weekly' && interval === 2) {
    return 'biweekly'
  }

  return type
}

// Get routine name for sorting/grouping (handles NL routines)
function getRoutineName(routine: Routine, contacts: Contact[]): string {
  if (routine.raw_input) {
    const parsed = parseRoutine(routine.raw_input, contacts)
    return parsed.action || routine.name
  }
  return routine.name
}

export function RoutinesList({ routines, contacts = [], familyMembers = [], onSelectRoutine, onCreateRoutine }: RoutinesListProps) {
  // Load sort/group preferences from localStorage
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem('routines-sort')
    return (saved as SortOption) || 'time'
  })
  const [groupBy, setGroupBy] = useState<GroupOption>(() => {
    const saved = localStorage.getItem('routines-group')
    return (saved as GroupOption) || 'none'
  })

  // Persist preferences to localStorage
  useEffect(() => {
    localStorage.setItem('routines-sort', sortBy)
  }, [sortBy])

  useEffect(() => {
    localStorage.setItem('routines-group', groupBy)
  }, [groupBy])

  // Helper to get family member by ID
  const getMember = (id: string | null): FamilyMember | undefined => {
    if (!id) return undefined
    return familyMembers.find(m => m.id === id)
  }

  // Sort function
  const sortRoutines = (routinesToSort: Routine[]): Routine[] => {
    return [...routinesToSort].sort((a, b) => {
      switch (sortBy) {
        case 'time': {
          const aTime = getTimeOfDay(a.time_of_day)
          const bTime = getTimeOfDay(b.time_of_day)
          const aOrder = aTime ? TIME_ORDER[aTime] : 999
          const bOrder = bTime ? TIME_ORDER[bTime] : 999
          if (aOrder !== bOrder) return aOrder - bOrder
          // Secondary sort by actual time
          const aTimeStr = a.time_of_day || 'ZZ:ZZ'
          const bTimeStr = b.time_of_day || 'ZZ:ZZ'
          return aTimeStr.localeCompare(bTimeStr)
        }
        case 'assignee': {
          const aMember = getMember(a.assigned_to)
          const bMember = getMember(b.assigned_to)
          const aName = aMember?.name || 'zzz' // Unassigned last
          const bName = bMember?.name || 'zzz'
          return aName.localeCompare(bName)
        }
        case 'frequency': {
          const aFreq = getFrequencyType(a.recurrence_pattern)
          const bFreq = getFrequencyType(b.recurrence_pattern)
          const aOrder = FREQUENCY_ORDER[aFreq] ?? 999
          const bOrder = FREQUENCY_ORDER[bFreq] ?? 999
          return aOrder - bOrder
        }
        case 'alphabetical': {
          const aName = getRoutineName(a, contacts)
          const bName = getRoutineName(b, contacts)
          return aName.localeCompare(bName)
        }
        default:
          return 0
      }
    })
  }

  // Group routines
  const groupRoutines = (routinesToGroup: Routine[]): Map<string, Routine[]> => {
    const groups = new Map<string, Routine[]>()

    routinesToGroup.forEach(routine => {
      let groupKey: string

      switch (groupBy) {
        case 'assignee': {
          const member = getMember(routine.assigned_to)
          groupKey = member?.name || 'Unassigned'
          break
        }
        case 'time': {
          const timeOfDay = getTimeOfDay(routine.time_of_day)
          groupKey = timeOfDay
            ? timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)
            : 'Anytime'
          break
        }
        case 'frequency': {
          const freq = getFrequencyType(routine.recurrence_pattern)
          const freqLabels: Record<string, string> = {
            daily: 'Daily',
            weekdays: 'Weekdays',
            weekends: 'Weekends',
            weekly: 'Weekly',
            biweekly: 'Biweekly',
            monthly: 'Monthly',
            quarterly: 'Quarterly',
            yearly: 'Yearly',
            specific_days: 'Specific Dates',
          }
          groupKey = freqLabels[freq] || 'Other'
          break
        }
        default:
          groupKey = 'all'
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(routine)
    })

    // Sort routines within each group
    groups.forEach((groupRoutines, key) => {
      groups.set(key, sortRoutines(groupRoutines))
    })

    return groups
  }

  // Get sorted group keys in proper order
  const getSortedGroupKeys = (groups: Map<string, Routine[]>): string[] => {
    const keys = Array.from(groups.keys())

    switch (groupBy) {
      case 'assignee':
        // Sort by family member display_order, unassigned last
        return keys.sort((a, b) => {
          if (a === 'Unassigned') return 1
          if (b === 'Unassigned') return -1
          const aMember = familyMembers.find(m => m.name === a)
          const bMember = familyMembers.find(m => m.name === b)
          return (aMember?.display_order ?? 999) - (bMember?.display_order ?? 999)
        })
      case 'time':
        return keys.sort((a, b) => {
          const order: Record<string, number> = { Morning: 0, Afternoon: 1, Evening: 2, Anytime: 3 }
          return (order[a] ?? 999) - (order[b] ?? 999)
        })
      case 'frequency':
        return keys.sort((a, b) => {
          const order: Record<string, number> = {
            Daily: 0, Weekdays: 1, Weekends: 2, Weekly: 3,
            Biweekly: 4, Monthly: 5, Quarterly: 6, Yearly: 7, 'Specific Dates': 8
          }
          return (order[a] ?? 999) - (order[b] ?? 999)
        })
      default:
        return keys
    }
  }

  const activeRoutines = routines.filter(r => r.visibility === 'active')
  const referenceRoutines = routines.filter(r => r.visibility === 'reference')

  // Apply sorting and grouping to active routines
  const processedActiveRoutines = (() => {
    if (groupBy === 'none') {
      return { grouped: false, routines: sortRoutines(activeRoutines) } as const
    }
    const groups = groupRoutines(activeRoutines)
    const sortedKeys = getSortedGroupKeys(groups)
    return { grouped: true, groups, sortedKeys } as const
  })()

  // Helper to render routine content
  const renderRoutineContent = (routine: Routine) => {
    if (routine.raw_input) {
      // New NL routine - show semantic tokens
      const parsed = parseRoutine(routine.raw_input, contacts)
      return <SemanticRoutine tokens={parsed.tokens} size="sm" />
    } else {
      // Legacy routine - show traditional format
      return (
        <>
          <div className="font-medium text-neutral-800 truncate">{routine.name}</div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>{formatRecurrence(routine)}</span>
            {routine.time_of_day && (
              <>
                <span className="text-neutral-300">•</span>
                <span>{formatTime(routine.time_of_day)}</span>
              </>
            )}
          </div>
        </>
      )
    }
  }

  // Render a single routine card
  const renderRoutineCard = (routine: Routine, isPaused = false) => {
    const member = getMember(routine.assigned_to)

    return (
      <button
        key={routine.id}
        onClick={() => onSelectRoutine(routine)}
        className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
          isPaused
            ? 'bg-neutral-50 border-neutral-100 hover:border-neutral-200 hover:shadow-sm opacity-60'
            : 'bg-white border-neutral-100 hover:border-amber-200 hover:shadow-sm'
        }`}
      >
        {/* Circular indicator */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isPaused ? 'bg-neutral-200' : 'bg-amber-100'
        }`}>
          {isPaused ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderRoutineContent(routine)}
        </div>

        {/* Assignee Avatar */}
        {member && (
          <AssigneeAvatar member={member} size="sm" className="flex-shrink-0" />
        )}

        {/* Chevron */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-neutral-800">Routines</h1>
          <button
            onClick={onCreateRoutine}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-medium
                       hover:bg-amber-600 active:bg-amber-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Routine
          </button>
        </div>

        {/* Sort and Group Controls */}
        {routines.length > 0 && (
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="text-sm text-neutral-500">Sort:</label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-sm bg-white border border-neutral-200 rounded-lg px-3 py-1.5
                           text-neutral-700 hover:border-neutral-300 focus:outline-none focus:ring-2
                           focus:ring-amber-500 focus:border-transparent cursor-pointer"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="group-select" className="text-sm text-neutral-500">Group:</label>
              <select
                id="group-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupOption)}
                className="text-sm bg-white border border-neutral-200 rounded-lg px-3 py-1.5
                           text-neutral-700 hover:border-neutral-300 focus:outline-none focus:ring-2
                           focus:ring-amber-500 focus:border-transparent cursor-pointer"
              >
                {GROUP_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Empty state */}
        {routines.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-neutral-800 mb-2">No routines yet</h2>
            <p className="text-neutral-500 mb-6">
              Routines are recurring tasks that repeat on a schedule.
            </p>
            <button
              onClick={onCreateRoutine}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium
                         hover:bg-amber-600 transition-colors"
            >
              Create your first routine
            </button>
          </div>
        )}

        {/* Active Routines */}
        {activeRoutines.length > 0 && (
          <div className="mb-8">
            {/* When not grouped, show simple list */}
            {!processedActiveRoutines.grouped && (
              <>
                <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
                  Active ({activeRoutines.length})
                </h2>
                <div className="space-y-2">
                  {processedActiveRoutines.routines.map(routine => renderRoutineCard(routine))}
                </div>
              </>
            )}

            {/* When grouped, show sections */}
            {processedActiveRoutines.grouped && (
              <>
                <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
                  Active ({activeRoutines.length})
                </h2>
                <div className="space-y-6">
                  {processedActiveRoutines.sortedKeys.map(groupKey => {
                    const groupRoutines = processedActiveRoutines.groups.get(groupKey) || []
                    return (
                      <div key={groupKey}>
                        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          {groupBy === 'assignee' && groupKey !== 'Unassigned' && (
                            <AssigneeAvatar
                              member={familyMembers.find(m => m.name === groupKey)}
                              size="sm"
                            />
                          )}
                          {groupKey}
                          <span className="text-neutral-300">({groupRoutines.length})</span>
                        </h3>
                        <div className="space-y-2">
                          {groupRoutines.map(routine => renderRoutineCard(routine))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Reference Routines (paused) */}
        {referenceRoutines.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              Paused ({referenceRoutines.length})
            </h2>
            <div className="space-y-2">
              {referenceRoutines.map(routine => renderRoutineCard(routine, true))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
