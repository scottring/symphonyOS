import { useState, useRef, useEffect } from 'react'
import type { ContactCategory } from '@/types/contact'
import { getCategoryLabel, getCategoryIcon } from '@/types/contact'

interface CategoryPickerProps {
  value: ContactCategory | undefined
  onChange: (category: ContactCategory | undefined) => void
}

const CATEGORIES: ContactCategory[] = [
  'family',
  'friend',
  'service_provider',
  'professional',
  'school',
  'medical',
  'other',
]

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleSelect = (category: ContactCategory | undefined) => {
    onChange(category)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors w-full
          ${value
            ? 'border-primary-200 bg-primary-50 text-primary-700'
            : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
          }
        `}
      >
        <span className="text-base">{value ? getCategoryIcon(value) : '🏷️'}</span>
        <span className="text-sm font-medium flex-1 text-left">
          {value ? getCategoryLabel(value) : 'Add category'}
        </span>
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-neutral-200 shadow-lg z-50 py-1 overflow-hidden">
          {/* Clear option if value is set */}
          {value && (
            <>
              <button
                onClick={() => handleSelect(undefined)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 transition-colors text-left"
              >
                <span className="text-base text-neutral-400">✕</span>
                <span className="text-sm text-neutral-500">Remove category</span>
              </button>
              <div className="border-t border-neutral-100 my-1" />
            </>
          )}

          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => handleSelect(category)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 transition-colors text-left
                ${value === category ? 'bg-primary-50' : ''}
              `}
            >
              <span className="text-base">{getCategoryIcon(category)}</span>
              <span className={`text-sm ${value === category ? 'text-primary-700 font-medium' : 'text-neutral-700'}`}>
                {getCategoryLabel(category)}
              </span>
              {value === category && (
                <svg className="w-4 h-4 text-primary-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
