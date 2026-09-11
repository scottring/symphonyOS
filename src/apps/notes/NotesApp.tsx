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
//
// THE SHAPE (2026-09-11): a ruled journal, not a stack of cards. Every other
// Library page is a list of objects you manage; these are jottings, and a card
// around each one implies filing work that this surface exists to refuse. So:
// a date margin down the left, one hairline rule, entries hanging off it, and
// the origin of each entry as a mark in the gutter rather than a chip on its
// own line. The rule is the only furniture on the page.

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PenLine, ScanLine, Search, SquareCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { useNoteTopics } from '@/hooks/useNoteTopics'
import { NoteModal } from '@/components/notes/NoteModal'
import { PageMasthead } from '@/components/layout/PageMasthead'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { stripHtml } from '@/lib/htmlUtils'
import { noteHeading, noteExcerpt } from '@/lib/noteHeading'
import type { DisplayNote } from '@/types/note'

/** A note hanging off a task is that task's note: the task names it, and the
 *  jotting itself is what you read underneath. Everything else names itself. */
function headingFor(note: DisplayNote): string {
  if (note.source === 'task' && note.sourceTaskTitle) return note.sourceTaskTitle
  return noteHeading(note.title, note.content)
}

function excerptFor(note: DisplayNote): string {
  const titled = note.source === 'task' ? true : Boolean(note.title?.trim())
  return noteExcerpt(note.title, note.content, titled)
}

/** Where the note came from, as one mark in the margin. Three origins, and a
 *  reader can tell them apart at a glance: typed here, read off a paper page,
 *  or written against something you have to do. */
const ORIGINS: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  import: { icon: ScanLine, label: 'From a page', tone: 'text-amber-600' },
  task: { icon: SquareCheck, label: 'On a task', tone: 'text-primary-600' },
  manual: { icon: PenLine, label: 'Written here', tone: 'text-neutral-400' },
}

function originOf(note: DisplayNote) {
  return ORIGINS[note.source === 'import' ? 'import' : note.source === 'task' ? 'task' : 'manual']
}

/** The entry's own date. The margin says which stretch of days you are in;
 *  this says which one, so a week's worth of entries never blur together. */
function stamp(when: Date): string {
  const now = new Date()
  const sameDay = when.toDateString() === now.toDateString()
  if (sameDay) return when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameYear = when.getFullYear() === now.getFullYear()
  return when.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  })
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
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        <PageMasthead
          title="Notes"
          description="Everything you've jotted, newest first — typed here, attached to something, or read off a page."
          actions={
            <label className="relative block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                aria-label="Search notes"
                className="w-36 sm:w-44 sm:focus:w-60 transition-[width] pl-8 pr-3 py-2 text-[14px] rounded-lg bg-transparent border border-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:border-primary-400 focus:bg-white/70"
              />
            </label>
          }
        />

        {/* Composer — one line on ruled paper, Enter saves. Anything longer is
            written in the note itself once it's open; asking for a title up
            front is the friction that sent these notes elsewhere. */}
        <div className="mb-8">
          <div className="flex items-center gap-3 border-b border-neutral-300 focus-within:border-primary-500 transition-colors pb-2">
            <PenLine className="w-[18px] h-[18px] text-neutral-400 shrink-0" />
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
              className="flex-1 bg-transparent border-0 p-0 text-[19px] font-display text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal focus:outline-none focus:ring-0"
            />
            <span
              className={`text-[11px] uppercase tracking-[0.1em] text-neutral-400 shrink-0 transition-opacity ${draft.trim() ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden="true"
            >
              Enter saves
            </span>
          </div>
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
          <section key={group.date} className="sm:grid sm:grid-cols-[7rem_1fr]">
            {/* The date margin. It stays put while its own entries scroll, so
                you always know which stretch of days you are reading. */}
            <h2 className="sm:sticky sm:top-6 self-start h-fit py-2 text-[12px] font-display uppercase tracking-[0.14em] text-neutral-400">
              {group.label}
            </h2>

            <div className="border-l border-neutral-200 pl-4 sm:pl-6 pb-6">
              {group.notes.map((note) => {
                const origin = originOf(note)
                const Glyph = origin.icon
                const excerpt = excerptFor(note)
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onRowClick(note)}
                    className="group w-full text-left grid grid-cols-[18px_1fr] gap-x-3 py-3 -ml-[1.05rem] sm:-ml-[1.55rem] pl-[1.05rem] sm:pl-[1.55rem] pr-3 rounded-r-lg hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors"
                  >
                    <Glyph
                      className={`w-[18px] h-[18px] mt-[3px] shrink-0 ${origin.tone}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      {/* The mark is the label for everyone who can see it;
                          spell it out for everyone who can't — except where
                          it is already written beside the date. */}
                      {note.source !== 'import' && <span className="sr-only">{origin.label}. </span>}
                      <div className="flex items-baseline gap-3">
                        <h3 className="flex-1 min-w-0 truncate text-[16px] font-display text-neutral-900 group-hover:text-primary-800 transition-colors">
                          {headingFor(note)}
                        </h3>
                        <span className="shrink-0 text-[12px] text-neutral-400 tabular-nums">
                          {note.source === 'import' && (
                            <span className="text-amber-600/90">From a page · </span>
                          )}
                          {stamp(note.updatedAt)}
                        </span>
                      </div>
                      {excerpt && (
                        <p className="mt-0.5 text-[13.5px] leading-relaxed text-neutral-500 line-clamp-2">
                          {excerpt}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
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
    </div>
  )
}
