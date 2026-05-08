import { useState, useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'

interface DiscussionPickerProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
}

export function DiscussionPicker({ flagged, note, onChange }: DiscussionPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus textarea when opening if already flagged
  useEffect(() => {
    if (isOpen && flagged && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen, flagged])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          flagged
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        aria-label="Needs discussion"
      >
        <MessageCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 min-w-[260px]">
          <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => onChange({ flagged: e.target.checked, note })}
              className="rounded"
            />
            <span>Needs discussion</span>
          </label>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => {
              // If user starts typing in an unflagged state, auto-flag.
              const nextFlagged = flagged || e.target.value.length > 0
              onChange({ flagged: nextFlagged, note: e.target.value })
            }}
            placeholder="What's the question?"
            rows={3}
            className={`w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                       focus:outline-none focus:ring-2 focus:ring-primary-500 ${flagged ? '' : 'opacity-60'}`}
          />
          {flagged && (
            <>
              <div className="border-t border-neutral-100 my-2" />
              <button
                onClick={() => {
                  onChange({ flagged: false, note: '' })
                  setIsOpen(false)
                }}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
