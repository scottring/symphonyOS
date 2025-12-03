import { useState, useRef, useEffect } from 'react'

interface DeferDropdownProps {
  onDefer: (date: Date) => void
  size?: 'sm' | 'md'
}

export function DeferDropdown({ onDefer, size = 'md' }: DeferDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowDatePicker(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getTomorrow = () => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const getNextWeek = () => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const handleDefer = (date: Date) => {
    onDefer(date)
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 0, 0, 0)
      handleDefer(newDate)
    }
  }

  const buttonClasses = size === 'sm'
    ? 'p-1 rounded transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
    : 'p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="Defer task"
      >
        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]">
          {!showDatePicker ? (
            <div className="space-y-1">
              <div className="px-3 py-1 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Defer until
              </div>
              <button
                onClick={() => handleDefer(getTomorrow())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleDefer(getNextWeek())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Next Week
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setShowDatePicker(true)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Pick date...
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setShowDatePicker(false)}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <input
                type="date"
                autoFocus
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
