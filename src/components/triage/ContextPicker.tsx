import { useState, useRef, useEffect } from 'react'
import type { TaskContext } from '@/types/task'

interface ContextPickerProps {
  value?: TaskContext
  onChange: (context: TaskContext | undefined) => void
}

const CONTEXTS: { value: TaskContext; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: 'bg-blue-500' },
  { value: 'family', label: 'Family', color: 'bg-amber-500' },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500' },
]

export function ContextPicker({ value, onChange }: ContextPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (ctx: TaskContext | undefined) => {
    onChange(ctx)
    setIsOpen(false)
  }

  const selectedContext = CONTEXTS.find(c => c.value === value)
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
        aria-label="Set context"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[120px]">
          <div className="space-y-1">
            {CONTEXTS.map(({ value: ctxValue, label, color }) => (
              <button
                key={ctxValue}
                onClick={() => handleSelect(ctxValue)}
                className={`w-full px-3 py-1.5 text-sm text-left rounded-lg flex items-center gap-2 ${
                  value === ctxValue
                    ? 'bg-primary-50 text-primary-700'
                    : 'hover:bg-neutral-50 text-neutral-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {label}
              </button>
            ))}
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
        </div>
      )}
    </div>
  )
}
