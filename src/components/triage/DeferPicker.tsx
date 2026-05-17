import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine, Calendar, CalendarDays, CalendarRange } from 'lucide-react'

interface DeferPickerProps {
  onDefer: (target: 'week' | 'month' | 'quarter') => void
}

export function DeferPicker({ onDefer }: DeferPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (containerRef.current && !containerRef.current.contains(target) &&
          dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const estimatedHeight = 120
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const shouldPositionAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

      if (shouldPositionAbove) {
        setDropdownPosition({ bottom: window.innerHeight - rect.top + 4, left: rect.right - 160 })
      } else {
        setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 160 })
      }
    }
  }, [isOpen])

  const handleDefer = (target: 'week' | 'month' | 'quarter') => {
    onDefer(target)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
        title="Defer to later"
        aria-label="Defer item"
      >
        <ArrowRightToLine className="w-4 h-4" />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]"
          style={{
            ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
            left: dropdownPosition.left
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-1">
              Defer
            </div>
            <button
              onClick={() => handleDefer('week')}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                text-neutral-700 bg-neutral-50 hover:bg-blue-50 hover:text-blue-700
                transition-all duration-150"
            >
              <Calendar className="w-4 h-4" />
              <span>This Week</span>
            </button>
            <button
              onClick={() => handleDefer('month')}
              className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium
                text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                transition-all duration-150"
            >
              <CalendarDays className="w-4 h-4" />
              <span>This Month</span>
            </button>
            <button
              onClick={() => handleDefer('quarter')}
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
