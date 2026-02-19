import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { TaskContext } from '@/types/task'

interface ContextPickerProps {
  value?: TaskContext | null
  onChange: (context: TaskContext | undefined) => void
}

const CONTEXTS: { value: TaskContext; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: 'rgb(37 99 235)' },      // Blue-600 (matches domain switcher)
  { value: 'family', label: 'Family', color: 'rgb(217 119 6)' },  // Amber-600 (matches domain switcher)
  { value: 'personal', label: 'Personal', color: 'rgb(147 51 234)' }, // Purple-600 (matches domain switcher)
]

export function ContextPicker({ value, onChange }: ContextPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleSelect = (ctx: TaskContext | undefined) => {
    onChange(ctx)
    setIsOpen(false)
  }

  const hasValue = value != null
  const selectedContext = CONTEXTS.find(ctx => ctx.value === value)

  // Map context colors to match domain switcher
  const contextStyles = {
    work: { color: 'rgb(37 99 235)' },      // Blue-600
    family: { color: 'rgb(217 119 6)' },    // Amber-600
    personal: { color: 'rgb(147 51 234)' }, // Purple-600
  }

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[120px] animate-fade-in-up"
      style={{
        top: menuPosition.top,
        right: menuPosition.right,
      }}
    >
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
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
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
  ) : null

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg transition-colors ${
          hasValue
            ? 'bg-neutral-50 hover:bg-neutral-100'
            : 'hover:bg-neutral-100'
        }`}
        aria-label="Set context"
      >
        {selectedContext ? (
          <svg
            className="w-5 h-5 transition-colors"
            fill="currentColor"
            viewBox="0 0 24 24"
            style={contextStyles[selectedContext.value as keyof typeof contextStyles]}
          >
            <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-neutral-400 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        )}
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}
