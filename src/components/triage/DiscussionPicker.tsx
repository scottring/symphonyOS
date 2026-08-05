import { useState, useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { DiscussionPopover } from './DiscussionPopover'

interface DiscussionPickerProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
}

export function DiscussionPicker({ flagged, note, onChange }: DiscussionPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
        <DiscussionPopover
          flagged={flagged}
          note={note}
          onChange={onChange}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
