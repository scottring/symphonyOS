import type { DisplayNote, NoteTopic } from '@/types/note'
import { noteTypeColors } from '@/types/note'
import { formatRelativeTime } from '@/lib/timeUtils'
import { stripHtml, htmlToPlainText } from '@/lib/htmlUtils'

interface NoteCardProps {
  note: DisplayNote
  topic?: NoteTopic
  isSelected?: boolean
  onClick?: () => void
}

export function NoteCard({ note, topic, isSelected, onClick }: NoteCardProps) {
  // Check if content contains HTML tags
  const hasHtml = /<[^>]+>/.test(note.content)

  // Convert HTML to plain text if needed
  const plainContent = hasHtml ? htmlToPlainText(note.content) : note.content

  // Extract first line as title, rest as preview
  const lines = plainContent.split('\n')
  const displayTitle = note.title || lines[0] || 'Untitled'
  const preview = lines.slice(1).join(' ').trim()

  return (
    <button
      className={`
        w-full text-left p-4 rounded-lg transition-colors group
        ${isSelected ? 'bg-white shadow-sm' : 'hover:bg-white/50'}
      `}
      onClick={onClick}
    >
      {/* Type indicator - subtle left border color */}
      <div className={`border-l-2 pl-3 -ml-1 ${noteTypeColors[note.type]}`}>
        {/* Title/First line - Fraunces serif */}
        <h4 className="font-display text-lg leading-snug mb-1 line-clamp-2 text-neutral-800">
          {displayTitle}
        </h4>

        {/* Preview - DM Sans body */}
        {preview && (
          <p className="text-sm text-neutral-500 line-clamp-2 mb-2">{preview}</p>
        )}

        {/* Task indicator */}
        {note.sourceTaskId && note.sourceTaskTitle && (
          <div className="flex items-center gap-1.5 text-xs text-primary-600 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            <span>From task: {note.sourceTaskTitle}</span>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <time>{formatRelativeTime(note.createdAt)}</time>

          {/* Topic pill - only if assigned */}
          {topic && (
            <>
              <span>•</span>
              <span
                className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700"
                style={topic.color ? { backgroundColor: `${topic.color}20`, color: topic.color } : undefined}
              >
                {topic.name}
              </span>
            </>
          )}

          {/* Linked entity count - subtle */}
          {note.entityLinks && note.entityLinks.length > 0 && (
            <>
              <span>•</span>
              <span className="opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-3 h-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                    clipRule="evenodd"
                  />
                </svg>
                {note.entityLinks.length}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}
