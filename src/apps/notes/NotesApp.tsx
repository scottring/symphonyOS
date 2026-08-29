// src/apps/notes/NotesApp.tsx
//
// The notes stream — the only surface in Symphony that shows a note you did
// not arrive at through the thing it hangs off.
//
// Notes have existed in the schema (and in four editors) since long before this
// page: entity notes, meeting notes, timeline notes, and — since the Supernote
// ingest landed — every block of prose read off a handwritten page. None of
// them were reachable unless you remembered which task/project/contact/event
// you attached them to, which made the whole register quietly write-only.
//
// This is deliberately a STREAM, not a library: reverse-chronological, no
// folders, no required titles, no filing step. An operational scrap ("plumber
// quoted $400") dies the moment it has to be named and put somewhere, and
// those scraps are the notes this page exists to keep.
//
// Long-form thinking still belongs in the Obsidian vault. Nothing here writes
// there — see the type='general' note on the composer below.

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NotebookPen, Search } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { useNoteTopics } from '@/hooks/useNoteTopics'
import { NoteModal } from '@/components/notes/NoteModal'
import { stripHtml } from '@/lib/htmlUtils'
import { formatRelativeTime } from '@/lib/timeUtils'
import type { DisplayNote } from '@/types/note'

/** A row's heading: the note's own title, else its first legible line. */
function headingFor(note: DisplayNote): string {
  if (note.title?.trim()) return note.title.trim()
  const text = stripHtml(note.content)
  return text.split('\n')[0]?.trim() || 'Untitled note'
}

function matches(note: DisplayNote, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    (note.title ?? '').toLowerCase().includes(needle) ||
    stripHtml(note.content).toLowerCase().includes(needle) ||
    (note.sourceTaskTitle ?? '').toLowerCase().includes(needle)
  )
}

export function NotesApp() {
  const { notesByDate, loading, addNote, updateNote, deleteNote } = useNotes()
  const { topics, addTopic } = useNoteTopics()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')

  // Filter inside each group, then drop groups the filter emptied — a bare
  // "Today" heading over nothing reads as a bug.
  const groups = useMemo(
    () =>
      notesByDate
        .map((g) => ({ ...g, notes: g.notes.filter((n) => matches(n, query)) }))
        .filter((g) => g.notes.length > 0),
    [notesByDate, query],
  )

  // ⌘K opens a note by putting its id in the URL, so a result is linkable and
  // survives a reload — same shape as the task detail param on /today.
  const openId = searchParams.get('note')
  const openNote = useMemo(() => {
    if (!openId) return null
    for (const g of notesByDate) {
      const found = g.notes.find((n) => n.id === openId)
      if (found) return found
    }
    return null
  }, [openId, notesByDate])

  function openNoteById(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('note', id)
    setSearchParams(next)
  }

  function closeNote() {
    const next = new URLSearchParams(searchParams)
    next.delete('note')
    setSearchParams(next)
  }

  function onRowClick(note: DisplayNote) {
    // A task note is a projection of `tasks.notes`, not a row in `notes` — it
    // has no independent life to edit, so the task itself is the destination.
    if (note.source === 'task' && note.sourceTaskId) {
      navigate(`/today?detail=task:${note.sourceTaskId}`)
      return
    }
    openNoteById(note.id)
  }

  async function submitDraft() {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    // type 'general', never 'quick_capture': useNotes dual-writes quick
    // captures to the Obsidian vault through Open Brain, which is dormant —
    // so that path fails silently AND would put a Symphony scrap in the
    // thinking vault, which is the split this surface exists to respect.
    await addNote({ content, type: 'general', source: 'manual' })
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-display text-neutral-900 mb-1">Notes</h1>
      <p className="text-[15px] text-neutral-500 mb-6">
        Everything you've jotted, newest first — typed here, attached to something, or read off a page.
      </p>

      {/* Composer — one line, Enter saves. Anything longer is written in the
          note itself once it's open; asking for a title up front is the
          friction that sent these notes elsewhere in the first place. */}
      <div className="flex items-center gap-2 mb-5">
        <NotebookPen className="w-5 h-5 text-neutral-400 shrink-0" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submitDraft()
            }
          }}
          placeholder="Write a note…"
          aria-label="Write a note"
          className="input-base flex-1"
        />
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Search className="w-4 h-4 text-neutral-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="input-base flex-1"
        />
      </div>

      {loading && groups.length === 0 && (
        <p className="text-[15px] text-neutral-400">Loading…</p>
      )}

      {!loading && groups.length === 0 && (
        <p className="text-[15px] text-neutral-400">
          {query ? 'No notes match that.' : "Nothing here yet — write one above."}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.date} className="mb-6">
          <h2 className="text-[13px] uppercase tracking-wide text-neutral-400 mb-2">
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onRowClick(note)}
                className="card w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 text-[15px] text-neutral-900 truncate">
                    {headingFor(note)}
                  </span>
                  <span className="text-[12px] text-neutral-400 shrink-0">
                    {formatRelativeTime(note.updatedAt)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {note.source === 'import' && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 shrink-0">
                      From a page
                    </span>
                  )}
                  {note.source === 'task' && note.sourceTaskTitle && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-600 shrink-0 truncate max-w-[40%]">
                      {note.sourceTaskTitle}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <NoteModal
        isOpen={Boolean(openNote)}
        note={openNote}
        topics={topics}
        onClose={closeNote}
        onUpdate={updateNote}
        onDelete={async (id) => {
          await deleteNote(id)
          closeNote()
        }}
        onAddTopic={(name) => addTopic({ name })}
      />
    </div>
  )
}
