import { useState, useRef, useEffect } from 'react'
import type { NoteEntityType } from '@/types/note'

interface EntityNoteCaptureProps {
  entityType: NoteEntityType
  entityId: string
  onSave: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  placeholder?: string
}

export function EntityNoteCapture({
  entityType,
  entityId,
  onSave,
  placeholder = 'Add a note...',
}: EntityNoteCaptureProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isExpanded])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [content])

  const handleSave = async () => {
    const trimmed = content.trim()
    if (!trimmed || isSaving) return

    setIsSaving(true)
    try {
      await onSave(trimmed, entityType, entityId)
      setContent('')
      setIsExpanded(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setContent('')
    setIsExpanded(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors w-full"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        Add note
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm text-neutral-700 resize-none focus:outline-none min-h-[80px]"
      />
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-t border-neutral-100">
        <span className="text-xs text-neutral-400">
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to save
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || isSaving}
            className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
