interface DateNavigatorProps {
  date: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function formatDate(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(date, today)) {
    return 'Today'
  }
  if (isSameDay(date, tomorrow)) {
    return 'Tomorrow'
  }
  if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function DateNavigator({ date, onPrev, onNext, onToday }: DateNavigatorProps) {
  const today = new Date()
  const isToday = isSameDay(date, today)

  return (
    <div className="flex items-center justify-between mb-6">
      <button
        onClick={onPrev}
        className="w-10 h-10 flex items-center justify-center text-xl text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
        aria-label="Previous day"
      >
        ‹
      </button>

      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-neutral-800">{formatDate(date)}</h2>
        {!isToday && (
          <button
            onClick={onToday}
            className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
          >
            Back to today
          </button>
        )}
      </div>

      <button
        onClick={onNext}
        className="w-10 h-10 flex items-center justify-center text-xl text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  )
}

export { isSameDay }
