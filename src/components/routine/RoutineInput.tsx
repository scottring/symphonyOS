import { useState, useRef, useEffect } from 'react'
import { parseRoutine, parsedRoutineToDb, isValidParsedRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'
import type { Contact } from '@/types/contact'
import type { CreateRoutineInput } from '@/hooks/useRoutines'

interface RoutineInputProps {
  contacts: Contact[]
  onSave: (input: CreateRoutineInput) => Promise<void>
  onCancel: () => void
  initialValue?: string
}

/**
 * Natural language routine input with live preview
 */
export function RoutineInput({ contacts, onSave, onCancel, initialValue = '' }: RoutineInputProps) {
  const [input, setInput] = useState(initialValue)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse input for live preview
  const parsed = parseRoutine(input, contacts)
  const isValid = isValidParsedRoutine(parsed)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isSaving) return

    setIsSaving(true)
    try {
      const dbData = parsedRoutineToDb(parsed)
      await onSave({
        name: dbData.name,
        recurrence_pattern: dbData.recurrence_pattern as CreateRoutineInput['recurrence_pattern'],
        time_of_day: dbData.time_of_day ?? undefined,
        default_assignee: dbData.default_assignee ?? undefined,
        raw_input: dbData.raw_input,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Input */}
        <div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Walk jax every weekday at 7am"
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                       text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
                       focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        {/* Live Preview */}
        {input.trim() && (
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Preview
            </div>
            {isValid ? (
              <div className="space-y-3">
                <SemanticRoutine tokens={parsed.tokens} size="md" />

                {/* Parsed details */}
                <div className="flex flex-wrap gap-3 text-sm text-neutral-600">
                  {parsed.recurrence.type === 'weekly' && parsed.recurrence.days && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {getRecurrenceText(parsed.recurrence)}
                    </span>
                  )}
                  {parsed.recurrence.type !== 'weekly' && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {getRecurrenceText(parsed.recurrence)}
                    </span>
                  )}
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
                  {parsed.assigneeName && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {parsed.assigneeName}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-neutral-500 text-sm">
                Type a routine like "walk the dog every morning at 7am"
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                       hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || isSaving}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-medium
                       hover:bg-amber-600 active:bg-amber-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
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
      return `Every ${days.map(d => dayNames[d]).join(', ')}`
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
