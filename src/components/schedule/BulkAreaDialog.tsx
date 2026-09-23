// Bulk triage asks for the life area of every unclassified item ONCE, up
// front, before anything moves (Scott, 2026-09-22). Items that already have
// a life area are not listed and keep theirs. Cancel moves nothing.
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import type { DomainId } from '@/lib/domains'

const AREAS: { id: DomainId; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'family', label: 'Family' },
  { id: 'personal', label: 'Personal' },
]

interface BulkAreaDialogProps {
  /** What the selection is being sent to, for the heading ("Today"). */
  destination: string
  items: { id: string; title: string }[]
  /** How many selected items already have a life area (they keep it). */
  classifiedCount: number
  onConfirm: (areas: Map<string, DomainId>) => void
  onCancel: () => void
}

export function BulkAreaDialog({ destination, items, classifiedCount, onConfirm, onCancel }: BulkAreaDialogProps) {
  const [areas, setAreas] = useState<Map<string, DomainId>>(new Map())
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(true, ref, onCancel)
  const complete = items.every((i) => areas.has(i.id))
  const setOne = (id: string, area: DomainId) => setAreas((prev) => new Map(prev).set(id, area))
  const setAll = (area: DomainId) => setAreas(new Map(items.map((i) => [i.id, area])))
  const allSame = useMemo(() => {
    const vals = new Set(items.map((i) => areas.get(i.id)))
    return vals.size === 1 ? [...vals][0] : undefined
  }, [areas, items])

  const chip = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onCancel} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-area-title"
        className="bulk-area-dialog fixed left-1/2 top-1/2 z-[70] flex max-h-[85vh] w-[calc(100%-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-bg-elevated p-5 shadow-xl"
      >
        <h2 id="bulk-area-title" className="font-display text-lg text-neutral-900">Where do these belong?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Before sending to {destination}, choose a life area for {items.length === 1 ? 'the unclassified item' : `the ${items.length} unclassified items`}.
          {classifiedCount > 0 && ` ${classifiedCount} already ${classifiedCount === 1 ? 'has' : 'have'} one and ${classifiedCount === 1 ? 'keeps it' : 'keep theirs'}.`}
        </p>

        {items.length > 1 && (
          <div role="group" aria-label="Set all" className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-neutral-500">All:</span>
            {AREAS.map((a) => (
              <button key={a.id} type="button" aria-pressed={allSame === a.id} onClick={() => setAll(a.id)} className={chip(allSame === a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-3 flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="w-full min-w-0 break-words text-sm text-neutral-800 sm:w-auto sm:flex-1 sm:truncate">{item.title}</span>
              <span role="group" aria-label={`Life area for ${item.title}`} className="flex gap-1">
                {AREAS.map((a) => (
                  <button key={a.id} type="button" aria-pressed={areas.get(item.id) === a.id} onClick={() => setOne(item.id, a.id)}
                    className={chip(areas.get(item.id) === a.id)}>
                    {a.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600">
            Cancel
          </button>
          <button type="button" disabled={!complete} onClick={() => onConfirm(areas)}
            className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            Send to {destination}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
