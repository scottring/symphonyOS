import { useState } from 'react'

interface AddLinkedTaskInputProps {
  placeholder: string
  onAdd: (title: string, scheduledFor?: Date) => void
  showTemplateOption?: boolean
  onAddAsTemplate?: (title: string) => void
  eventDate?: Date // Event date for default scheduling
}

/**
 * Component for adding linked prep/follow-up tasks
 */
export function AddLinkedTaskInput({
  placeholder,
  onAdd,
  showTemplateOption,
  onAddAsTemplate,
  eventDate,
}: AddLinkedTaskInputProps) {
  const [value, setValue] = useState('')
  const [addToAll, setAddToAll] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [scheduledTime, setScheduledTime] = useState<string>('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return

    if (addToAll && onAddAsTemplate) {
      onAddAsTemplate(value.trim())
    } else {
      // Build scheduledFor from date and time inputs
      let scheduledFor: Date | undefined
      if (scheduledDate) {
        scheduledFor = new Date(scheduledDate)
        if (scheduledTime) {
          const [hours, minutes] = scheduledTime.split(':').map(Number)
          scheduledFor.setHours(hours, minutes, 0, 0)
        } else {
          scheduledFor.setHours(9, 0, 0, 0) // Default to 9am
        }
      }
      onAdd(value.trim(), scheduledFor)
    }
    setValue('')
    setAddToAll(false)
    setShowSchedule(false)
    setScheduledDate('')
    setScheduledTime('')
  }

  // Calculate default date for the date input (event date or today)
  const defaultDate = eventDate
    ? eventDate.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {value.trim() && (
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className={`p-2 rounded-lg transition-colors ${showSchedule ? 'bg-primary-100 text-primary-600' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'}`}
            title="Set date/time"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {/* Date/time picker row */}
      {showSchedule && value.trim() && (
        <div className="flex gap-2 items-center pl-1">
          <input
            type="date"
            value={scheduledDate || defaultDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="px-2 py-1.5 text-xs rounded border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <input
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder="Time"
            className="px-2 py-1.5 text-xs rounded border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {(scheduledDate || scheduledTime) && (
            <button
              type="button"
              onClick={() => {
                setScheduledDate('')
                setScheduledTime('')
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {showTemplateOption && value.trim() && (
        <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
          <input
            type="checkbox"
            checked={addToAll}
            onChange={(e) => setAddToAll(e.target.checked)}
            className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
          />
          Add to all future instances
        </label>
      )}
    </form>
  )
}
