import { useState } from 'react'

interface PlanningHeaderProps {
  dateRange: Date[]
  onClose: () => void
  onAddDay: () => void
  onRemoveDay: () => void
  onDateChange: (startDate: Date) => void
}

export function PlanningHeader({
  dateRange,
  onClose,
  onAddDay,
  onRemoveDay,
  onDateChange,
}: PlanningHeaderProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Format the date range for display
  const formatDateRange = () => {
    const start = dateRange[0]
    const end = dateRange[dateRange.length - 1]

    const formatOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }

    if (dateRange.length === 1) {
      return start.toLocaleDateString('en-US', formatOptions)
    }

    // If same month, show: Mon Dec 7 - Sun Dec 13
    // If different months, show full dates
    return `${start.toLocaleDateString('en-US', formatOptions)} – ${end.toLocaleDateString('en-US', formatOptions)}`
  }

  // Handle date input change
  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value) {
      const date = new Date(value + 'T00:00:00')
      onDateChange(date)
      setShowDatePicker(false)
    }
  }

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-bg-elevated">
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Left side: Close button and title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="Close planning session"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div>
            <h1 className="font-display text-xl font-semibold text-neutral-900">
              Plan Your Time
            </h1>
            <p className="text-sm text-neutral-500">
              Drag tasks to schedule them
            </p>
          </div>
        </div>

        {/* Center: Date range display and navigation */}
        <div className="flex items-center gap-2">
          {/* Remove day button */}
          {dateRange.length > 1 && (
            <button
              onClick={onRemoveDay}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Remove day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Date range button */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span>{formatDateRange()}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Date picker dropdown */}
            {showDatePicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
                  <label className="block text-sm font-medium text-neutral-600 mb-2">
                    Start date
                  </label>
                  <input
                    type="date"
                    defaultValue={formatInputDate(dateRange[0])}
                    onChange={handleDateInputChange}
                    className="input-base w-full"
                    autoFocus
                  />
                </div>
              </>
            )}
          </div>

          {/* Add day button */}
          {dateRange.length < 7 && (
            <button
              onClick={onAddDay}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Add day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Right side: Done button */}
        <button
          onClick={onClose}
          className="btn-primary px-6 py-2"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// Helper to format date for input[type="date"]
function formatInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
