import { useState, useRef, useEffect } from 'react'
import { parseRoutine, parsedRoutineToDb, isValidParsedRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from '@/components/routine/SemanticRoutine'
import type { CreateRoutineInput } from '@/hooks/useRoutines'

interface BrainDumpRoutinesProps {
  onAddRoutine: (input: CreateRoutineInput) => Promise<string | null>
  onContinue: () => void
  onSkip: () => void
  routineCount?: number
}

interface SavedRoutine {
  id: string
  name: string
  recurrenceText: string
}

export function BrainDumpRoutines({ onAddRoutine, onContinue, onSkip }: BrainDumpRoutinesProps) {
  const [input, setInput] = useState('')
  const [routines, setRoutines] = useState<SavedRoutine[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse input for live preview (no contacts during onboarding)
  const parsed = parseRoutine(input, [])
  const isValid = isValidParsedRoutine(parsed)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleAdd = async () => {
    if (!isValid || isAdding) return

    setIsAdding(true)
    const dbData = parsedRoutineToDb(parsed)
    const id = await onAddRoutine({
      name: dbData.name,
      recurrence_pattern: dbData.recurrence_pattern as CreateRoutineInput['recurrence_pattern'],
      time_of_day: dbData.time_of_day ?? undefined,
      raw_input: dbData.raw_input,
      visibility: 'active',
    })

    if (id) {
      setRoutines(prev => [...prev, {
        id,
        name: dbData.name,
        recurrenceText: getRecurrenceText(parsed.recurrence),
      }])
      setInput('')
    }
    setIsAdding(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isValid) {
      e.preventDefault()
      handleAdd()
    }
  }

  const canContinue = routines.length >= 2

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          What do you do regularly?
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-2">
          Morning rituals. Weekly chores. Daily habits.
        </p>
        <p className="text-neutral-400 text-center mb-8">
          Type naturally — we'll figure out the schedule.
        </p>

        {/* Natural language input */}
        <div className="mb-4">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Walk the dog every morning at 7am"
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                       text-neutral-800 placeholder:text-neutral-400 text-xl font-display
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={isAdding}
          />
        </div>

        {/* Live Preview */}
        {input.trim() && (
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 mb-4">
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Preview
            </div>
            {isValid ? (
              <div className="space-y-3">
                <SemanticRoutine tokens={parsed.tokens} size="md" />

                {/* Parsed details */}
                <div className="flex flex-wrap gap-3 text-sm text-neutral-600">
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {getRecurrenceText(parsed.recurrence)}
                  </span>
                  {parsed.time && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatTime(parsed.time)}
                    </span>
                  )}
                  {parsed.timeOfDay && !parsed.time && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                      </svg>
                      {parsed.timeOfDay}
                    </span>
                  )}
                </div>

                {/* Add button */}
                <button
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="w-full py-2 rounded-lg bg-primary-500 text-white font-medium
                             hover:bg-primary-600 active:bg-primary-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors"
                >
                  {isAdding ? 'Adding...' : 'Add Routine'}
                </button>
              </div>
            ) : (
              <p className="text-neutral-500 text-sm">
                Keep typing... try something like "exercise every weekday"
              </p>
            )}
          </div>
        )}

        {/* Added routines list */}
        {routines.length > 0 && (
          <ul className="space-y-2 mb-6">
            {routines.map((routine, i) => (
              <li
                key={routine.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-neutral-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔄</span>
                  <span className="text-neutral-700">{routine.name}</span>
                </div>
                <span className="text-sm text-neutral-400">
                  {routine.recurrenceText}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Hint */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            💡 <span className="font-medium">Try:</span> "exercise every weekday at 6am",
            "laundry on sundays", "water plants every other day"
          </p>
        </div>

        {/* Progress indicator */}
        <div className="text-center mb-6">
          <span className={`text-sm ${canContinue ? 'text-primary-600' : 'text-neutral-400'}`}>
            {routines.length} of 2 routines minimum
          </span>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="btn-primary px-8 py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>

          <button
            onClick={onSkip}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            Skip — I'll add routines later
          </button>
        </div>
      </div>
    </div>
  )
}

function getRecurrenceText(recurrence: { type: string; days?: number[]; interval?: number }): string {
  switch (recurrence.type) {
    case 'daily':
      if (recurrence.interval === 2) return 'Every other day'
      if (recurrence.interval && recurrence.interval > 2) return `Every ${recurrence.interval} days`
      return 'Every day'
    case 'weekdays':
      return 'Weekdays'
    case 'weekends':
      return 'Weekends'
    case 'biweekly': {
      const days = recurrence.days || []
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      if (days.length === 1) {
        return `Every other ${dayNames[days[0]]}`
      }
      return 'Every two weeks'
    }
    case 'weekly': {
      const days = recurrence.days || []
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      if (days.length === 1) {
        return `Every ${dayNames[days[0]]}`
      }
      return days.map(d => dayNames[d]).join(', ')
    }
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'yearly':
      return 'Yearly'
    default:
      return 'Custom'
  }
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const h12 = hours % 12 || 12
  const meridiem = hours >= 12 ? 'PM' : 'AM'
  if (minutes === 0) {
    return `${h12} ${meridiem}`
  }
  return `${h12}:${minutes.toString().padStart(2, '0')} ${meridiem}`
}
