import { useState, useRef, useEffect } from 'react'
import type { CreateRoutineInput } from '@/hooks/useRoutines'
import type { RecurrencePattern } from '@/types/actionable'

interface BrainDumpRoutinesProps {
  onAddRoutine: (input: CreateRoutineInput) => Promise<string | null>
  onContinue: () => void
  onSkip: () => void
  routineCount?: number
}

type RecurrenceOption = 'daily' | 'weekdays' | 'weekly'

interface RoutineEntry {
  name: string
  recurrence: RecurrenceOption
}

const RECURRENCE_LABELS: Record<RecurrenceOption, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
}

function recurrenceToPattern(recurrence: RecurrenceOption): RecurrencePattern {
  switch (recurrence) {
    case 'daily':
      return { type: 'daily' }
    case 'weekdays':
      return { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
    case 'weekly':
      return { type: 'weekly', days: ['mon'] } // Default to Monday
    default:
      return { type: 'daily' }
  }
}

export function BrainDumpRoutines({ onAddRoutine, onContinue, onSkip }: BrainDumpRoutinesProps) {
  const [input, setInput] = useState('')
  const [recurrence, setRecurrence] = useState<RecurrenceOption>('daily')
  const [routines, setRoutines] = useState<RoutineEntry[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name || isAdding) return

    setIsAdding(true)
    const id = await onAddRoutine({
      name,
      recurrence_pattern: recurrenceToPattern(recurrence),
      visibility: 'active',
    })
    if (id) {
      setRoutines(prev => [...prev, { name, recurrence }])
      setInput('')
      setRecurrence('daily')
    }
    setIsAdding(false)
    // Focus after React re-renders
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
          These are the things that need to happen over and over again.
        </p>

        {/* Input row */}
        <div className="flex gap-2 mb-6">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a routine..."
            className="input-base flex-1 min-w-0 text-lg"
            disabled={isAdding}
          />

          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as RecurrenceOption)}
            className="input-base w-32 text-sm"
            disabled={isAdding}
          >
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
          </select>

          <button
            onClick={handleAdd}
            disabled={!input.trim() || isAdding}
            className="btn-primary px-4 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Routine list */}
        {routines.length > 0 && (
          <ul className="space-y-2 mb-8">
            {routines.map((routine, i) => (
              <li
                key={i}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-neutral-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔄</span>
                  <span className="text-neutral-700">{routine.name}</span>
                </div>
                <span className="text-sm text-neutral-400">
                  {RECURRENCE_LABELS[routine.recurrence]}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Hint */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800">
            💡 <span className="font-medium">Examples:</span> exercise, meal prep, laundry,
            check email, water plants, walk the dog
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
