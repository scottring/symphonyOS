import { useMemo, useState } from 'react'
import { X, NotebookPen, HelpCircle } from 'lucide-react'
import { parseLocalYmd } from '@/lib/cadence/config'
import type { PlanItem, PlanPlacement } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'

export interface PageReviewPayload {
  items: PlanItem[]
  notes: PageNote[]
}

export interface PageReviewSheetProps {
  /** Parsed actions, in page order. */
  items: PlanItem[]
  /** Parsed prose, in page order. */
  notes: PageNote[]
  /** Lines the model could not read. Read-only until promoted. */
  unclear: string[]
  /** The SAME dates the parser was allowed to place on (local YYYY-MM-DD). */
  windowDates: string[]
  members: FamilyMember[]
  committing: boolean
  /** Called with only the checked rows, as edited. */
  onCommit: (payload: PageReviewPayload) => void
  onClose: () => void
}

interface ItemRow extends PlanItem { included: boolean }
interface NoteRow extends PageNote { included: boolean }

const UNASSIGNED = ''

function placementValue(p: PlanPlacement): string {
  return p.kind === 'date' ? p.date : p.kind
}

function placementFromValue(v: string): PlanPlacement {
  if (v === 'week') return { kind: 'week' }
  if (v === 'inbox') return { kind: 'inbox' }
  return { kind: 'date', date: v }
}

function dateLabel(ymd: string): string {
  return parseLocalYmd(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * The review step of page-from-paper: everything the parser read, editable,
 * nothing written until "Add". Handwriting parsing will misread sometimes —
 * this sheet is where trust in the pipeline lives. Unclear lines sit apart
 * and inert precisely because a wrong task costs more than an unread line.
 */
export function PageReviewSheet({
  items, notes, unclear, windowDates, members, committing, onCommit, onClose,
}: PageReviewSheetProps) {
  const [itemRows, setItemRows] = useState<ItemRow[]>(() => items.map((i) => ({ ...i, included: true })))
  const [noteRows, setNoteRows] = useState<NoteRow[]>(() => notes.map((n) => ({ ...n, included: true })))
  const [unread, setUnread] = useState<string[]>(() => unclear)

  const includedCount = useMemo(
    () => itemRows.filter((r) => r.included).length + noteRows.filter((r) => r.included).length,
    [itemRows, noteRows],
  )
  const isEmpty = itemRows.length === 0 && noteRows.length === 0 && unread.length === 0

  const updateItem = (index: number, patch: Partial<ItemRow>) =>
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const updateNote = (index: number, patch: Partial<NoteRow>) =>
    setNoteRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const promoteToTask = (line: string) => {
    setItemRows((prev) => [...prev, { title: line, placement: { kind: 'inbox' }, assigneeId: null, note: null, included: true }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }
  const promoteToNote = (line: string) => {
    setNoteRows((prev) => [...prev, { title: line, content: line, included: true }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }

  const commit = () => {
    onCommit({
      items: itemRows
        .filter((r) => r.included && r.title.trim())
        .map(({ included: _included, ...item }) => ({ ...item, title: item.title.trim() })),
      notes: noteRows
        .filter((r) => r.included && r.content.trim())
        .map(({ included: _included, ...note }) => ({ title: note.title.trim(), content: note.content.trim() })),
    })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Review page items"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary-600" />
            <h3 className="font-display text-xl text-neutral-900">From your page</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEmpty ? (
          <div className="px-5 py-10 text-center text-neutral-500 text-[15px]">
            Couldn&rsquo;t read anything on this page. Try a straighter, brighter scan.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            {itemRows.length > 0 && (
              <div className="space-y-2">
                {itemRows.map((row, i) => (
                  <div key={`i-${i}`} className={`flex items-center gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateItem(i, { included: e.target.checked })}
                      aria-label={`Include "${row.title}"`}
                      className="w-4 h-4 accent-primary-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        value={row.title}
                        onChange={(e) => updateItem(i, { title: e.target.value })}
                        aria-label="Task title"
                        className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                      />
                      {row.note && <p className="text-[13px] text-neutral-500 truncate">{row.note}</p>}
                    </div>
                    <select
                      value={placementValue(row.placement)}
                      onChange={(e) => updateItem(i, { placement: placementFromValue(e.target.value) })}
                      aria-label="When"
                      className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0"
                    >
                      <option value="inbox">Inbox</option>
                      <option value="week">This week</option>
                      {windowDates.map((d) => (
                        <option key={d} value={d}>{dateLabel(d)}</option>
                      ))}
                    </select>
                    <select
                      value={row.assigneeId ?? UNASSIGNED}
                      onChange={(e) => updateItem(i, { assigneeId: e.target.value === UNASSIGNED ? null : e.target.value })}
                      aria-label="Assignee"
                      className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0 max-w-[110px]"
                    >
                      <option value={UNASSIGNED}>Me</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {noteRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500">Notes</p>
                {noteRows.map((row, i) => (
                  <div key={`n-${i}`} className={`flex items-start gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateNote(i, { included: e.target.checked })}
                      aria-label={`Include note "${row.title}"`}
                      className="w-4 h-4 accent-primary-600 shrink-0 mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        value={row.title}
                        onChange={(e) => updateNote(i, { title: e.target.value })}
                        aria-label="Note title"
                        className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                      />
                      <textarea
                        value={row.content}
                        onChange={(e) => updateNote(i, { content: e.target.value })}
                        aria-label="Note content"
                        rows={3}
                        className="w-full bg-transparent text-[13px] text-neutral-600 focus:outline-none resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unread.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Couldn&rsquo;t read these
                </p>
                {unread.map((line) => (
                  <div key={line} className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-3 py-2">
                    <span className="flex-1 min-w-0 text-[14px] text-neutral-500 truncate">{line}</span>
                    <button
                      type="button"
                      onClick={() => promoteToTask(line)}
                      aria-label={`Make "${line}" a task`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Task
                    </button>
                    <button
                      type="button"
                      onClick={() => promoteToNote(line)}
                      aria-label={`Keep "${line}" as a note`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Note
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200/60">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[14px] text-neutral-600 hover:bg-neutral-100 transition-colors">
            Cancel
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={commit}
              disabled={committing || includedCount === 0}
              className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
            >
              {committing ? 'Adding…' : `Add ${includedCount} ${includedCount === 1 ? 'item' : 'items'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
