import { useMemo, useState } from 'react'
import { X, NotebookPen } from 'lucide-react'
import { parseLocalYmd } from '@/lib/cadence/config'
import { placementsEqual, type PlanItem, type PlanPlacement } from '@/lib/planParse'
import type { FamilyMember } from '@/types/family'

interface PlanReviewSheetProps {
  /** Parsed items, in page order. */
  items: PlanItem[]
  /** The SAME dates the parser was allowed to place on (local YYYY-MM-DD). */
  windowDates: string[]
  members: FamilyMember[]
  committing: boolean
  /** Called with only the checked rows, as edited. */
  onCommit: (items: PlanItem[]) => void
  onClose: () => void
}

interface Row extends PlanItem {
  included: boolean
}

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

function targetLabel(p: PlanPlacement): string {
  if (p.kind === 'week') return 'This week'
  if (p.kind === 'inbox') return 'Inbox'
  return dateLabel(p.date)
}

/**
 * The review step of plan-from-paper: everything the parser read, editable,
 * nothing written until "Add". Handwriting parsing will misread sometimes —
 * this sheet is where trust in the pipeline lives.
 */
export function PlanReviewSheet({ items, windowDates, members, committing, onCommit, onClose }: PlanReviewSheetProps) {
  const [rows, setRows] = useState<Row[]>(() => items.map((i) => ({ ...i, included: true })))

  /** A matched row already sitting where the page puts it is a no-op — it is
   *  neither an add nor a move, and commit skips its write entirely. */
  const counts = useMemo(() => {
    let adds = 0
    let moves = 0
    for (const r of rows) {
      if (!r.included || !r.title.trim()) continue
      if (!r.existing) adds++
      else if (!placementsEqual(r.existing.placement, r.placement)) moves++
    }
    return { adds, moves, total: adds + moves }
  }, [rows])

  const commitLabel = (() => {
    const { adds, moves } = counts
    const addPart = `Add ${adds} ${adds === 1 ? 'task' : 'tasks'}`
    const movePart = `Move ${moves} ${moves === 1 ? 'task' : 'tasks'}`
    if (adds && moves) return `Add ${adds}, move ${moves}`
    if (moves) return movePart
    return addPart
  })()

  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const commit = () => {
    onCommit(rows.filter((r) => r.included && r.title.trim()).map(({ included: _included, ...item }) => ({
      ...item,
      title: item.title.trim(),
    })))
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Review plan items"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary-600" />
            <h3 className="font-display text-xl text-neutral-900">From your plan page</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-neutral-500 text-[15px]">
            Couldn&rsquo;t read anything on this page. Try a straighter, brighter photo.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {rows.map((row, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={(e) => update(i, { included: e.target.checked })}
                  aria-label={`Include "${row.title}"`}
                  className="w-4 h-4 accent-primary-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <input
                    value={row.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    aria-label="Task title"
                    className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                  />
                  {row.note && <p className="text-[13px] text-neutral-500 truncate">{row.note}</p>}
                  {row.existing && (
                    <p className="text-[13px] text-amber-700 truncate" title={row.existing.title}>
                      already in Symphony as &ldquo;{row.existing.title}&rdquo; ({row.existing.label})
                      {placementsEqual(row.existing.placement, row.placement)
                        ? ' — no change'
                        : ` — will move to ${targetLabel(row.placement)}`}
                    </p>
                  )}
                </div>
                <select
                  value={placementValue(row.placement)}
                  onChange={(e) => update(i, { placement: placementFromValue(e.target.value) })}
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
                  onChange={(e) => update(i, { assigneeId: e.target.value === UNASSIGNED ? null : e.target.value })}
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

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200/60">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[14px] text-neutral-600 hover:bg-neutral-100 transition-colors">
            Cancel
          </button>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={commit}
              disabled={committing || counts.total === 0}
              className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
            >
              {committing ? 'Adding…' : commitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
