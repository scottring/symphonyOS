import { useEffect, useRef, useState, useCallback } from 'react'
import { TiptapEditor } from './TiptapEditor'

interface NotesEditorModalProps {
  isOpen: boolean
  title: string
  content: string
  onClose: () => void
  onSave: (content: string) => void
}

export function NotesEditorModal({
  isOpen,
  title,
  content,
  onClose,
  onSave,
}: NotesEditorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [editContent, setEditContent] = useState(content)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync content when prop changes
  useEffect(() => {
    setEditContent(content)
    setHasChanges(false)
  }, [content, isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, editContent, hasChanges])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleContentChange = useCallback((newContent: string) => {
    setEditContent(newContent)
    setHasChanges(true)
  }, [])

  const handleSave = useCallback(() => {
    onSave(editContent)
    setHasChanges(false)
    onClose()
  }, [editContent, onSave, onClose])

  const handleClose = useCallback(() => {
    if (hasChanges) {
      // Auto-save on close
      onSave(editContent)
    }
    onClose()
  }, [hasChanges, editContent, onSave, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Modal */}
      <div
        ref={modalRef}
        className="bg-white w-full max-w-4xl h-[90vh] md:h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit notes"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-display font-medium text-neutral-800">
              {title}
            </h2>
            {hasChanges && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg
                         hover:bg-primary-700 transition-colors"
            >
              Save & Close
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          <TiptapEditor
            content={editContent}
            onChange={handleContentChange}
            placeholder="Start writing..."
            autoFocus
          />
        </div>

        {/* Footer with keyboard hints */}
        <div className="hidden md:flex items-center gap-4 px-6 py-3 border-t border-neutral-100 text-xs text-neutral-400 flex-shrink-0">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">⌘S</kbd>
            to save
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">Esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  )
}
