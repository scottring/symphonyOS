import type { DisplayNote, NoteTopic } from '@/types/note'
import { noteTypeColors, vaultDomainLabels } from '@/types/note'
import { formatRelativeTime } from '@/lib/timeUtils'
import { htmlToPlainText } from '@/lib/htmlUtils'

interface NoteCardProps {
  note: DisplayNote
  topic?: NoteTopic
  isSelected?: boolean
  onClick?: () => void
}

/** Derive a clean, short title for display.
 *  Priority: explicit note.title → source task title → first sentence (≤60 chars). */
function deriveTitle(note: DisplayNote, plainContent: string): string {
  if (note.title?.trim()) return note.title.trim()
  if (note.sourceTaskId && note.sourceTaskTitle?.trim()) return note.sourceTaskTitle.trim()
  const firstLine = plainContent.split('\n')[0].trim()
  if (!firstLine) return 'Untitled'
  // First sentence boundary (3–60 chars before .!?:)
  const sentenceMatch = firstLine.match(/^([^.!?:]{3,60}[.!?:])/)
  if (sentenceMatch) return sentenceMatch[1].trim().replace(/[.!?:]+$/, '')
  if (firstLine.length > 60) return firstLine.slice(0, 60).trimEnd() + '…'
  return firstLine
}

export function NoteCard({ note, topic, isSelected, onClick }: NoteCardProps) {
  const hasHtml = /<[^>]+>/.test(note.content)
  const plainContent = hasHtml ? htmlToPlainText(note.content) : note.content
  const displayTitle = deriveTitle(note, plainContent)
  const isTaskAttached = !!(note.sourceTaskId && note.sourceTaskTitle)

  // Preview = the rest of the content after the title material.
  // For task-attached notes (title comes from elsewhere), show the full first line.
  // For derived titles, skip the part already consumed by the title.
  const previewSource = isTaskAttached || !!note.title?.trim()
    ? plainContent
    : plainContent.slice(displayTitle.length)
  const preview = previewSource.replace(/\s+/g, ' ').trim()

  return (
    <button
      className={`
        w-full text-left card card-interactive p-4 mb-2
        relative overflow-hidden
        ${isSelected ? 'ring-2 ring-primary-300/60' : ''}
      `}
      onClick={onClick}
    >
      {/* Type indicator — colored hairline along the left edge */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-1 ${noteTypeColors[note.type]}`}
      />

      <div className="pl-2">
        <h4 className="font-display text-lg leading-snug mb-1 line-clamp-2 text-neutral-800">
          {displayTitle}
        </h4>

        {preview && (
          <p className="text-sm text-neutral-500 line-clamp-2 mb-2">{preview}</p>
        )}

        {isTaskAttached && !note.title?.trim() && (
          <div className="flex items-center gap-1.5 text-xs text-primary-600/80 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            <span>Task note</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <time>{formatRelativeTime(note.createdAt)}</time>

          {'vaultDomain' in note && note.vaultDomain && (
            <>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-medium">
                {vaultDomainLabels[note.vaultDomain] ?? note.vaultDomain}
              </span>
            </>
          )}

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

          {note.entityLinks && note.entityLinks.length > 0 && (
            <>
              <span>•</span>
              <span className="opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-3 h-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
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
