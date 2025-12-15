import { useState } from 'react'
import { X } from 'lucide-react'

interface BulkRescheduleDialogProps {
  isOpen: boolean
  selectedCount: number
  onConfirm: (date: Date, isAllDay: boolean) => void
  onCancel: () => void
}

export function BulkRescheduleDialog({
  isOpen,
  selectedCount,
  onConfirm,
  onCancel,
}: BulkRescheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0]

  // Auto-set date to today when time is entered
  const handleTimeChange = (time: string) => {
    setSelectedTime(time)
    // If time is entered but no date is set, default to today
    setSelectedDate((currentDate) => {
      if (time && !currentDate) {
        return today
      }
      return currentDate
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Use selected date or default to today if time is provided
    const dateToUse = selectedDate || (selectedTime ? today : '')
    
    if (dateToUse) {
      const date = new Date(dateToUse)
      
      // If time is provided, set it; otherwise default to all-day (midnight)
      if (selectedTime) {
        const [hours, minutes] = selectedTime.split(':').map(Number)
        date.setHours(hours, minutes, 0, 0)
        onConfirm(date, false) // Not all-day when time is set
      } else {
        date.setHours(0, 0, 0, 0)
        onConfirm(date, true) // All-day when no time is set
      }
      
      setSelectedDate('')
      setSelectedTime('')
    }
  }

  const handleCancel = () => {
    setSelectedDate('')
    setSelectedTime('')
    onCancel()
  }

  // Form is valid if date is set OR time is set (which will default date to today)
  const isValid = selectedDate || selectedTime

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          handleCancel()
        }
      }}
    >
      <div 
        className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mx-4 animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            Reschedule {selectedCount} task{selectedCount !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={handleCancel}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reschedule-date" className="block text-sm font-medium text-neutral-700 mb-2">
              Date
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={today}
              autoFocus
              className="w-full px-4 py-3 text-base rounded-lg border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="reschedule-time" className="block text-sm font-medium text-neutral-700 mb-2">
              Time <span className="text-neutral-400 font-normal">(optional)</span>
            </label>
            <input
              id="reschedule-time"
              type="time"
              step="300"
              value={selectedTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="w-full px-4 py-3 text-base rounded-lg border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {selectedTime && (
              <p className="mt-1 text-xs text-neutral-500">
                Leave empty for all-day tasks
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2 rounded-lg border border-neutral-200 text-neutral-700
                         hover:bg-neutral-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="flex-1 px-4 py-2 rounded-lg bg-primary-500 text-white
                         hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors font-medium"
            >
              Reschedule
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

