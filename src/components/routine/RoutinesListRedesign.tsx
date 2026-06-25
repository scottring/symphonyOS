import { useState, useEffect } from 'react'
import { List, ChevronRight, Plus } from 'lucide-react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { parseRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'
import { PauseRoutineModal } from './PauseRoutineModal'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapCollectionPanel } from '@/components/surface/TapCollectionPanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'

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
  onUpdateRoutine: (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void
  onAddStep: (collectionId: string, name: string) => void
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  onPromoteStep: (stepId: string) => void
  onCreateCollection?: (name: string) => Promise<import('@/types/actionable').Routine | null> | void
  onGroupIntoCollection?: (name: string, routineIds: string[]) => void
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

interface SectionHeaderProps {
  title: string
  count: number
  collapsed?: boolean
  onToggle?: () => void
}

function SectionHeader({ title, count, collapsed, onToggle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {onToggle ? (
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider
                     hover:text-neutral-600 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {title}
          <span className="text-neutral-300">({count})</span>
        </button>
      ) : (
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          {title} <span className="text-neutral-300">({count})</span>
        </span>
      )}
    </div>
  )
}

export function RoutinesListRedesign({ routines, contacts = [], familyMembers = [], onSelectRoutine, onCreateRoutine, onUpdateRoutine, onAddStep, onReorderSteps, onPromoteStep, onCreateCollection, onGroupIntoCollection }: RoutinesListProps) {
  // Pause modal state
  const [pauseModalRoutine, setPauseModalRoutine] = useState<Routine | null>(null)

  // Multi-select state
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Collection/step panel state
  const [open, setOpen] = useState<{ kind: 'collection' | 'step'; id: string } | null>(null)

  // Derive open panel data fresh each render so edits reflect immediately
  const { collections, standalone } = groupRoutineSteps(routines)
  const openCollection =
    open?.kind === 'collection'
      ? (collections.find(c => c.id === open.id)
         ?? (() => {
              const r = routines.find(x => x.id === open.id && !x.parent_routine_id)
              return r ? { ...r, steps: [] as import('@/types/actionable').Routine[] } : undefined
            })())
      : undefined
  const openStep = open?.kind === 'step'
    ? collections.flatMap(c => c.steps).find(s => s.id === open.id)
    : undefined
  const parentOfOpenStep = openStep ? collections.find(c => c.steps.some(s => s.id === openStep.id)) : undefined
  // Load sort/group preferences from localStorage
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem('routines-sort')
    return (saved as SortOption) || 'time'
  })
  const [groupBy, setGroupBy] = useState<GroupOption>(() => {
    const saved = localStorage.getItem('routines-group')
    return (saved as GroupOption) || 'time'
  })
  const [pausedExpanded, setPausedExpanded] = useState(false)

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

  // Helper: resolve all assignees for a routine. Reads new `assigned_to_all`
  // (multi) with a fallback to legacy single `assigned_to`.
  const getRoutineMembers = (routine: Routine): FamilyMember[] => {
    const ids = routine.assigned_to_all && routine.assigned_to_all.length > 0
      ? routine.assigned_to_all
      : (routine.assigned_to ? [routine.assigned_to] : [])
    return ids
      .map((id) => familyMembers.find((m) => m.id === id))
      .filter((m): m is FamilyMember => Boolean(m))
  }

  // Pause handlers
  const handlePauseRoutines = async (routineIds: string[], pausedUntil: string | null) => {
    for (const id of routineIds) {
      await onUpdateRoutine(id, { visibility: 'reference', paused_until: pausedUntil })
    }
  }

  const handleQuickToggle = async (routine: Routine, e: React.MouseEvent) => {
    e.stopPropagation()
    if (routine.visibility === 'active') {
      setPauseModalRoutine(routine)  // Show modal for duration
    } else {
      await onUpdateRoutine(routine.id, { visibility: 'active', paused_until: null })
    }
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

  // standalone routines only (collections handled separately above)
  const activeRoutines = standalone.filter(r => r.visibility === 'active')
  const referenceRoutines = standalone.filter(r => r.visibility === 'reference')

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
          <div className="font-medium text-neutral-800 truncate group-hover:text-amber-700 transition-colors">
            {routine.name}
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>{formatRecurrence(routine)}</span>
            {routine.time_of_day && (
              <>
                <span className="text-neutral-300">·</span>
                <span>{formatTime(routine.time_of_day)}</span>
              </>
            )}
          </div>
        </>
      )
    }
  }

  // Render a single routine card
  const renderRoutineCard = (routine: Routine, index: number, isPaused = false, isStandalone = false) => {
    const members = getRoutineMembers(routine)

    const card = (
      <button
        key={routine.id}
        onClick={() => !selecting && onSelectRoutine(routine)}
        className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all duration-200 text-left group ${
          isPaused
            ? 'bg-neutral-50 border-neutral-100 hover:border-neutral-200 hover:shadow-sm opacity-60'
            : 'bg-white border-neutral-100 hover:border-amber-200 hover:shadow-md'
        }`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Toggle Switch */}
        <button
          onClick={(e) => handleQuickToggle(routine, e)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
            isPaused ? 'bg-neutral-300' : 'bg-amber-500'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isPaused ? 'translate-x-1' : 'translate-x-6'
            }`}
          />
        </button>

        {/* Cycle icon in circle */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          isPaused ? 'bg-neutral-200' : 'bg-amber-100 group-hover:bg-amber-200'
        }`}>
          {isPaused ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderRoutineContent(routine)}
        </div>

        {/* Assignee avatars — stacked when a routine is shared by multiple members */}
        {members.length > 0 && (
          <div className="flex -space-x-2 flex-shrink-0">
            {members.map((m) => (
              <AssigneeAvatar
                key={m.id}
                member={m}
                size="sm"
                className="ring-2 ring-white"
              />
            ))}
          </div>
        )}

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-neutral-300 group-hover:text-amber-400 group-hover:translate-x-1 transition-all flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    )

    // When in select mode and this is a standalone row, wrap with a checkbox
    if (selecting && isStandalone) {
      return (
        <div key={routine.id} className="flex items-center gap-3">
          <input
            type="checkbox"
            aria-label={`Select ${routine.name}`}
            checked={selected.has(routine.id)}
            onChange={() => toggleSelected(routine.id)}
            className="w-5 h-5 rounded border-neutral-300 text-amber-500 focus:ring-amber-500 flex-shrink-0 cursor-pointer"
          />
          <div className="flex-1">{card}</div>
        </div>
      )
    }

    return card
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Subtle amber gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-amber-50/40 to-transparent pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-800 tracking-tight">
              Routines
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {(() => { const n = collections.length + standalone.length; return `${n} routine${n !== 1 ? 's' : ''}` })()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Select"
              onClick={() => { setSelecting(v => !v); setSelected(new Set()) }}
              className={`px-4 py-2.5 rounded-xl font-medium border transition-colors shadow-sm ${
                selecting
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              Select
            </button>
            <button
              onClick={async () => {
                if (onCreateCollection) {
                  const name = window.prompt('Name the new routine')?.trim()
                  if (!name) return
                  const created = await onCreateCollection(name)
                  if (created) setOpen({ kind: 'collection', id: created.id })
                } else {
                  onCreateRoutine()
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium
                         hover:bg-amber-600 active:bg-amber-700 transition-colors shadow-sm
                         hover:shadow-md"
            >
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
        </div>

        {/* Sort and Group Controls */}
        {routines.length > 0 && (
          <div className="flex items-center gap-4 mb-8 p-3 bg-white/60 rounded-xl border border-neutral-200/60">
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Sort
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2
                           text-neutral-700 hover:border-neutral-300 focus:outline-none focus:ring-2
                           focus:ring-amber-500 focus:border-transparent cursor-pointer"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="w-px h-6 bg-neutral-200" />

            <div className="flex items-center gap-2">
              <label htmlFor="group-select" className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Group
              </label>
              <select
                id="group-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupOption)}
                className="text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2
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
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold text-neutral-700 mb-2">No routines yet</h2>
            <p className="text-neutral-500 mb-6 max-w-sm mx-auto">
              Routines are recurring tasks that repeat on a schedule. Create your first routine to get started.
            </p>
            <button
              onClick={async () => {
                if (onCreateCollection) {
                  const name = window.prompt('Name the new routine')?.trim()
                  if (!name) return
                  const created = await onCreateCollection(name)
                  if (created) setOpen({ kind: 'collection', id: created.id })
                } else {
                  onCreateRoutine()
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium
                         hover:bg-amber-600 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Create your first routine
            </button>
          </div>
        )}

        {/* Collections — two-level rendering */}
        {collections.length > 0 && (
          <div className="mb-10">
            <SectionHeader title="Multi-step" count={collections.length} />
            <div className="space-y-3 stagger-in">
              {collections.map((collection, index) => (
                <button
                  key={collection.id}
                  onClick={() => setOpen({ kind: 'collection', id: collection.id })}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl border bg-white border-neutral-100
                             hover:border-amber-200 hover:shadow-md transition-all duration-200 text-left group"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Collection icon */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100 group-hover:bg-amber-200 transition-colors">
                    <List className="w-6 h-6 text-amber-600" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-800 truncate group-hover:text-amber-700 transition-colors">
                      {collection.name}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {collection.steps.length} steps
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-amber-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Routines (standalone only) */}
        {activeRoutines.length > 0 && (
          <div className="mb-10">
            {/* When not grouped, show simple list */}
            {!processedActiveRoutines.grouped && (
              <>
                <SectionHeader title="Active" count={activeRoutines.length} />
                <div className="space-y-3 stagger-in">
                  {processedActiveRoutines.routines.map((routine, index) => renderRoutineCard(routine, index, false, true))}
                </div>
              </>
            )}

            {/* When grouped, show sections */}
            {processedActiveRoutines.grouped && (
              <div className="space-y-8">
                {processedActiveRoutines.sortedKeys.map(groupKey => {
                  const groupRoutines = processedActiveRoutines.groups.get(groupKey) || []
                  return (
                    <section key={groupKey}>
                      <div className="flex items-center gap-3 mb-4">
                        {groupBy === 'assignee' && groupKey !== 'Unassigned' && (
                          <AssigneeAvatar
                            member={familyMembers.find(m => m.name === groupKey)}
                            size="sm"
                          />
                        )}
                        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                          {groupKey} <span className="text-neutral-300">({groupRoutines.length})</span>
                        </span>
                      </div>
                      <div className="space-y-3 stagger-in">
                        {groupRoutines.map((routine, index) => renderRoutineCard(routine, index, false, true))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Reference Routines (paused) - collapsible */}
        {referenceRoutines.length > 0 && (
          <section className="pt-8 border-t border-neutral-200/60">
            <SectionHeader
              title="Paused"
              count={referenceRoutines.length}
              collapsed={!pausedExpanded}
              onToggle={() => setPausedExpanded(!pausedExpanded)}
            />
            {pausedExpanded && (
              <div className="space-y-3 stagger-in">
                {referenceRoutines.map((routine, index) => renderRoutineCard(routine, index, true, true))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Group into routine action bar */}
      {selecting && selected.size >= 2 && onGroupIntoCollection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => {
              const name = window.prompt('Name this routine')?.trim()
              if (!name) return
              onGroupIntoCollection(name, Array.from(selected))
              setSelecting(false)
              setSelected(new Set())
            }}
            className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-2xl font-medium
                       shadow-lg hover:bg-amber-600 active:bg-amber-700 transition-colors"
          >
            Combine into a routine
          </button>
        </div>
      )}

      {/* Pause Routine Modal */}
      {pauseModalRoutine && (
        <PauseRoutineModal
          routine={pauseModalRoutine}
          allRoutines={routines}
          isOpen={!!pauseModalRoutine}
          onClose={() => setPauseModalRoutine(null)}
          onPause={handlePauseRoutines}
        />
      )}

      {/* Collection / Step panel overlay */}
      {(openCollection || openStep) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(null)}
        >
          <div onClick={e => e.stopPropagation()}>
            {openCollection && (
              <TapCollectionPanel
                collection={openCollection}
                onClose={() => setOpen(null)}
                onRename={name => onUpdateRoutine(openCollection.id, { name })}
                onContextChange={context => onUpdateRoutine(openCollection.id, { context: context ?? null })}
                onScheduleChange={(recurrence_pattern, timeOfDay) =>
                  onUpdateRoutine(openCollection.id, { recurrence_pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => onUpdateRoutine(openCollection.id, { description })}
                onSelectStep={s => setOpen({ kind: 'step', id: s.id })}
                onAddStep={name => onAddStep(openCollection.id, name)}
                onReorderSteps={onReorderSteps}
              />
            )}
            {openStep && parentOfOpenStep && (
              <TapStepPanel
                key={openStep.id}
                step={openStep}
                parentName={parentOfOpenStep.name}
                onClose={() => setOpen({ kind: 'collection', id: parentOfOpenStep.id })}
                onRename={name => onUpdateRoutine(openStep.id, { name })}
                onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
                onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
                onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}
                onPromote={() => { onPromoteStep(openStep.id); setOpen({ kind: 'collection', id: parentOfOpenStep.id }) }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
