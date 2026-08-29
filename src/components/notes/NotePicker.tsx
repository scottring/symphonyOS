import { useState, useMemo, useEffect, useRef } from 'react'
import type { Note } from '@/types/note'
import type { Task } from '@/types/task'
import type { DomainId, Layer } from '@/lib/domains'
import { matchesLayers } from '@/lib/today/domainFilter'
import { useNoteSuggestion } from '@/hooks/useNoteSuggestion'

export type NotePickerSelection =
  | { kind: 'existing'; noteId: string }
  | { kind: 'new'; title: string }

interface NotePickerProps {
  task: Pick<Task, 'id' | 'title' | 'notes'>
  notes: Note[]
  layers: ReadonlySet<Layer>
  /** The single checked domain, if exactly one — only used to give
   *  useNoteSuggestion's edge-function call a single life-area label ('universal'
   *  when zero-or-many are checked). Not used for filtering; that's `layers`. */
  soleDomain: DomainId | null
  onSelect: (sel: NotePickerSelection) => void
  onClose: () => void
}

const CONFIDENCE_THRESHOLD = 0.6

export function NotePicker({ task, notes, layers, soleDomain, onSelect, onClose }: NotePickerProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Filter the candidate list (this is what the user sees + what the AI sees)
  const visibleNotes = useMemo(() => {
    return notes.filter((n) => {
      if (n.readonly) return false
      if (!matchesLayers(n.context, layers)) return false
      return true
    })
  }, [notes, layers])

  // AI suggestion
  const { suggestion, loading } = useNoteSuggestion({
    task,
    candidateNotes: visibleNotes,
    domain: soleDomain ?? 'universal',
    enabled: true,
  })

  // Seed newTitle from the AI suggestion once it arrives (only if user hasn't typed)
  useEffect(() => {
    if (suggestion?.suggested_new_title && !newTitle) {
      setNewTitle(suggestion.suggested_new_title)
    }
  }, [suggestion, newTitle])

  // Filtered list for the visible search results
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return [...visibleNotes].sort((a, b) =>
        (a.title ?? '').localeCompare(b.title ?? ''),
      )
    }
    const q = query.toLowerCase()
    return visibleNotes.filter((n) =>
      ((n.title ?? '').toLowerCase().includes(q)) ||
      ((n.content ?? '').toLowerCase().includes(q)),
    )
  }, [visibleNotes, query])

  // Close on ESC / outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouse)
    }
  }, [onClose])

  const bestMatchNote =
    suggestion?.best_match && suggestion.best_match.confidence >= CONFIDENCE_THRESHOLD
      ? visibleNotes.find((n) => n.id === suggestion.best_match!.id)
      : null

  const handleCreate = () => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    onSelect({ kind: 'new', title: trimmed })
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Send to note"
      className="absolute z-40 mt-1 w-[360px] max-h-[480px] overflow-hidden flex flex-col bg-white border border-neutral-200 rounded-xl shadow-xl"
    >
      {/* AI suggestion strip */}
      <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50 min-h-[44px] flex items-center gap-2 flex-wrap">
        {loading && (
          <span className="text-xs text-neutral-400 animate-pulse">Looking for matches…</span>
        )}
        {!loading && bestMatchNote && (
          <button
            type="button"
            aria-label={`Best match: ${bestMatchNote.title}`}
            onClick={() => onSelect({ kind: 'existing', noteId: bestMatchNote.id })}
            className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200"
          >
            Looks like → {bestMatchNote.title}
          </button>
        )}
        {!loading && suggestion?.suggested_new_title && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setNewTitle(suggestion.suggested_new_title)
            }}
            className="px-2 py-1 text-xs font-medium bg-neutral-100 text-neutral-700 rounded-full hover:bg-neutral-200"
          >
            + new "{suggestion.suggested_new_title}"
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-neutral-100">
        <input
          type="text"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Existing notes list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-neutral-400">No matching notes.</p>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect({ kind: 'existing', noteId: n.id })}
              className="block w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-50"
            >
              <div className="text-sm font-medium text-neutral-800 truncate">{n.title ?? '(untitled)'}</div>
              {n.content && (
                <div className="text-xs text-neutral-500 truncate">{n.content.slice(0, 60)}</div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Create new */}
      <div className="border-t border-neutral-100">
        {!creating ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              if (!newTitle) setNewTitle(suggestion?.suggested_new_title ?? task.title)
            }}
            className="block w-full text-left px-3 py-2 text-sm text-primary-700 hover:bg-primary-50"
          >
            + Create new note…
          </button>
        ) : (
          <div className="px-3 py-2 space-y-2">
            <label className="block text-xs text-neutral-500" htmlFor="new-note-title">
              Note title
            </label>
            <input
              id="new-note-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Note title"
              autoFocus
              className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="w-full px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
