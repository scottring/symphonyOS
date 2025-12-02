interface DateNavigatorProps {
  date: Date
  onDateChange: (date: Date) => void
}

export function DateNavigator({ date, onDateChange }: DateNavigatorProps) {
  const goToPrevDay = () => {
    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    onDateChange(prev)
  }

  const goToNextDay = () => {
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    onDateChange(next)
  }

  const goToToday = () => {
    onDateChange(new Date())
  }

  return (
    <div className="flex items-center gap-2">
      {/* Previous day button */}
      <button
        onClick={goToPrevDay}
        className="touch-target flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label="Previous day"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Today button - always shows "Today", clicking jumps to today */}
      <button
        onClick={goToToday}
        className="text-sm font-medium text-neutral-700 hover:text-primary-600 transition-colors px-2"
      >
        Today
      </button>

      {/* Next day button */}
      <button
        onClick={goToNextDay}
        className="touch-target flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label="Next day"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
