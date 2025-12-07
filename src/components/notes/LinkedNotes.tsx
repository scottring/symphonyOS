import type { Note } from '@/types/note'
import { noteTypeDotColors } from '@/types/note'
import { formatRelativeTime } from '@/lib/timeUtils'

interface LinkedNotesProps {
  notes: Note[]
  onSelectNote?: (noteId: string) => void
  onCreateNote?: () => void
}

export function LinkedNotes({ notes, onSelectNote, onCreateNote }: LinkedNotesProps) {
  if (notes.length === 0 && !onCreateNote) {
    return null
  }

  return (
    <div className="border-t border-neutral-100 pt-6">
      <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-4 font-medium">
        Related Notes
      </h3>

      {notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => {
            const lines = note.content.split('\n')
            const displayTitle = note.title || lines[0] || 'Untitled'
            const preview = lines.slice(1).join(' ').trim()

            return (
              <button
                key={note.id}
                className="w-full text-left p-4 rounded-lg bg-bg-base border border-neutral-100 hover:border-primary-300 transition-colors cursor-pointer group"
                onClick={() => onSelectNote?.(note.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Note type indicator - small colored dot */}
                  <div
                    className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${noteTypeDotColors[note.type]}`}
                  />

                  <div className="flex-1 min-w-0">
                    {/* First line as title */}
                    <p className="font-display text-base leading-snug mb-1 line-clamp-2 text-neutral-800">
                      {displayTitle}
                    </p>

                    {/* Preview - lighter */}
                    {preview && (
                      <p className="text-sm text-neutral-500 line-clamp-2">{preview}</p>
                    )}

                    {/* Timestamp */}
                    <time className="text-xs text-neutral-400 mt-2 block">
                      {formatRelativeTime(note.createdAt)}
                    </time>
                  </div>

                  {/* Expand icon on hover */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Add note button */}
      {onCreateNote && (
        <button
          className="mt-3 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          onClick={onCreateNote}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Add note...
        </button>
      )}
    </div>
  )
}
