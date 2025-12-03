import { useState, useRef, useEffect } from 'react'

interface WhenPickerProps {
  value?: Date
  onChange: (date: Date | undefined) => void
}

export function WhenPicker({ value, onChange }: WhenPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDateInput, setShowDateInput] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowDateInput(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const today = new Date()
  today.setHours(9, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const handleSelect = (date: Date | undefined) => {
    onChange(date)
    setIsOpen(false)
    setShowDateInput(false)
  }

  const handleDateChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 9, 0, 0)
      handleSelect(newDate)
    }
  }

  const hasValue = value !== undefined

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          hasValue
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        aria-label="Set date"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[140px]">
          {showDateInput ? (
            <input
              type="date"
              autoFocus
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          ) : (
            <div className="space-y-1">
              <button
                onClick={() => handleSelect(today)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Today
              </button>
              <button
                onClick={() => handleSelect(tomorrow)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleSelect(nextWeek)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Next Week
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setShowDateInput(true)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                + Pick Date
              </button>
              {hasValue && (
                <>
                  <div className="border-t border-neutral-100 my-1" />
                  <button
                    onClick={() => handleSelect(undefined)}
                    className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
