import { useState, useCallback } from 'react'
import type { Note, NoteEntityType } from '@/types/note'
import { formatRelativeTime } from '@/lib/timeUtils'
import { EntityNoteCapture } from './EntityNoteCapture'

interface EntityNotesSectionProps {
  entityType: NoteEntityType
  entityId: string
  notes: Note[]
  loading?: boolean
  onAddNote: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onNavigateToNote?: (noteId: string) => void
}

export function EntityNotesSection({
  entityType,
  entityId,
  notes,
  loading = false,
  onAddNote,
  onNavigateToNote,
}: EntityNotesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  const handleNoteClick = useCallback(
    (noteId: string) => {
      if (onNavigateToNote) {
        onNavigateToNote(noteId)
      } else {
        // Toggle expansion for inline viewing
        setExpandedNoteId((prev) => (prev === noteId ? null : noteId))
      }
    },
    [onNavigateToNote]
  )

  const getPreviewText = (content: string, maxLength = 100) => {
    const firstLine = content.split('\n')[0]
    if (firstLine.length <= maxLength) return firstLine
    return firstLine.substring(0, maxLength) + '...'
  }

  return (
    <div className="mt-6">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span className="text-xs uppercase tracking-wide text-neutral-400 font-medium">
          Notes
        </span>
        {notes.length > 0 && (
          <span className="text-xs text-neutral-400">({notes.length})</span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {/* Loading state */}
          {loading && (
            <div className="text-sm text-neutral-400 py-2">Loading notes...</div>
          )}

          {/* Notes list */}
          {!loading && notes.length > 0 && (
            <div className="space-y-2">
              {notes.map((note) => {
                const isNoteExpanded = expandedNoteId === note.id
                return (
                  <div
                    key={note.id}
                    className="rounded-lg border border-neutral-100 bg-neutral-50/50 overflow-hidden"
                  >
                    <button
                      onClick={() => handleNoteClick(note.id)}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-100/50 transition-colors"
                    >
                      <p className="text-sm text-neutral-700 line-clamp-2">
                        {isNoteExpanded ? note.content : getPreviewText(note.content)}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {formatRelativeTime(note.createdAt)}
                      </p>
                    </button>
                    {isNoteExpanded && note.content.length > 100 && (
                      <div className="px-3 pb-2 text-sm text-neutral-700 whitespace-pre-wrap">
                        {note.content}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!loading && notes.length === 0 && (
            <p className="text-sm text-neutral-400 py-2">No notes yet</p>
          )}

          {/* Add note capture */}
          <EntityNoteCapture
            entityType={entityType}
            entityId={entityId}
            onSave={onAddNote}
          />
        </div>
      )}
    </div>
  )
}
