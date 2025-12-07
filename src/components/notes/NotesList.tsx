import type { Note, NoteTopic } from '@/types/note'
import { NoteCard } from './NoteCard'

interface NotesListProps {
  notesByDate: { date: string; label: string; notes: Note[] }[]
  topicsMap: Map<string, NoteTopic>
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

export function NotesList({ notesByDate, topicsMap, selectedNoteId, onSelectNote }: NotesListProps) {
  if (notesByDate.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-primary-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="font-display text-xl mb-2 text-neutral-800">No notes yet</h3>
        <p className="text-neutral-500 text-sm max-w-xs">
          Start capturing thoughts, meeting notes, and ideas. They'll appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {notesByDate.map((group) => (
        <div key={group.date}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-3 font-medium">
            {group.label}
          </h3>
          <div className="space-y-1">
            {group.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                topic={note.topicId ? topicsMap.get(note.topicId) : undefined}
                isSelected={note.id === selectedNoteId}
                onClick={() => onSelectNote(note.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
