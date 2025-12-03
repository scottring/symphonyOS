import type { Routine } from '@/types/actionable'
import { parseRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'
import type { Contact } from '@/types/contact'

interface RoutinesListProps {
  routines: Routine[]
  contacts?: Contact[]
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

export function RoutinesList({ routines, contacts = [], onSelectRoutine, onCreateRoutine }: RoutinesListProps) {
  const activeRoutines = routines.filter(r => r.visibility === 'active')
  const referenceRoutines = routines.filter(r => r.visibility === 'reference')

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

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              Active ({activeRoutines.length})
            </h2>
            <div className="space-y-2">
              {activeRoutines.map(routine => (
                <button
                  key={routine.id}
                  onClick={() => onSelectRoutine(routine)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-neutral-100
                             hover:border-amber-200 hover:shadow-sm transition-all text-left"
                >
                  {/* Circular indicator */}
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {renderRoutineContent(routine)}
                  </div>

                  {/* Chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reference Routines (paused) */}
        {referenceRoutines.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              Paused ({referenceRoutines.length})
            </h2>
            <div className="space-y-2">
              {referenceRoutines.map(routine => (
                <button
                  key={routine.id}
                  onClick={() => onSelectRoutine(routine)}
                  className="w-full flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100
                             hover:border-neutral-200 hover:shadow-sm transition-all text-left opacity-60"
                >
                  {/* Circular indicator */}
                  <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {renderRoutineContent(routine)}
                  </div>

                  {/* Chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
