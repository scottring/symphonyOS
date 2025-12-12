import { useState, useRef, useEffect } from 'react'

interface CompletionNotesPromptProps {
  taskId: string
  taskTitle: string
  onAddNote: (note: string) => void
  onDismiss: () => void
  autoHideAfter?: number // ms, default 5000
}

export function CompletionNotesPrompt({
  taskTitle,
  onAddNote,
  onDismiss,
  autoHideAfter = 5000,
}: CompletionNotesPromptProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [isDismissing, setIsDismissing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-dismiss after timeout
  useEffect(() => {
    if (!isExpanded && autoHideAfter > 0) {
      timeoutRef.current = setTimeout(() => {
        handleDismiss()
      }, autoHideAfter)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isExpanded, autoHideAfter])

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  const handleDismiss = () => {
    setIsDismissing(true)
    setTimeout(onDismiss, 200) // Allow fade-out animation
  }

  const handleSave = () => {
    if (note.trim()) {
      onAddNote(note.trim())
    }
    handleDismiss()
  }

  const handleExpand = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsExpanded(true)
  }

  return (
    <div
      className={`
        bg-green-50 border border-green-200 rounded-xl p-4 transition-all duration-200
        ${isDismissing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      {!isExpanded ? (
        // Collapsed state - prompt
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-green-700 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm truncate">
              <span className="font-medium">Completed:</span>{' '}
              <span className="text-green-600">{taskTitle}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleExpand}
              className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
            >
              Add note
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 text-green-400 hover:text-green-600 transition-colors"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        // Expanded state - note input
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">Add a note</span>
          </div>
          <textarea
            ref={inputRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cost, outcome, what you learned..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-green-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                       resize-none placeholder:text-neutral-400"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={!note.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
