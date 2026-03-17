import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine, Sun, Calendar, CalendarDays, CalendarRange } from 'lucide-react'

interface PushDropdownProps {
  onPush: (target: Date | 'week' | 'month' | 'quarter') => void
  size?: 'sm' | 'md'
  showTodayOption?: boolean
}

export function PushDropdown({ onPush, size = 'md', showTodayOption = false }: PushDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const estimatedHeight = 180
      const spaceBelow = window.innerHeight - rect.bottom - 4
      const flipUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight

      setDropdownPosition({
        top: flipUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handlePush = (target: Date | 'week' | 'month' | 'quarter') => {
    onPush(target)
    setIsOpen(false)
  }

  const getToday = () => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }

  const buttonClasses = size === 'sm'
    ? 'p-1 rounded transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
    : 'p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="Push task"
      >
        <ArrowRightToLine className={iconClasses} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]"
          style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-1">
              {showTodayOption ? 'Move to' : 'Defer to'}
            </div>

            {showTodayOption && (
              <>
                <button
                  onClick={() => handlePush(getToday())}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-primary-600 bg-primary-50 hover:bg-primary-100
                    transition-all duration-150"
                >
                  <Sun className="w-4 h-4" />
                  <span>Today</span>
                </button>
                <div className="border-t border-neutral-100 my-2" />
              </>
            )}

            <button
              onClick={() => handlePush('week')}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                text-neutral-700 bg-neutral-50 hover:bg-blue-50 hover:text-blue-700
                transition-all duration-150"
            >
              <Calendar className="w-4 h-4" />
              <span>This Week</span>
            </button>
            <button
              onClick={() => handlePush('month')}
              className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium
                text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                transition-all duration-150"
            >
              <CalendarDays className="w-4 h-4" />
              <span>This Month</span>
            </button>
            <button
              onClick={() => handlePush('quarter')}
              className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium
                text-neutral-700 bg-neutral-50 hover:bg-purple-50 hover:text-purple-700
                transition-all duration-150"
            >
              <CalendarRange className="w-4 h-4" />
              <span>This Quarter</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
