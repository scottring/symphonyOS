import { useState } from 'react'
import type { CellValue, ChoiceOption } from '@/types/choice'
import { optionFact } from '@/lib/choices/facts'
import { StatusChip } from './StatusChip'
import { contactLine, formatCell } from './cells'
import { PriceCellView, type ComparisonProps } from './ComparisonTable'

/** Narrow layout: one card per option, facts as lines in the table's order.
 *  Empty facts are left out; "Edit" on a card shows every fact, editable. */
export function OptionCards(p: ComparisonProps) {
  const [editing, setEditing] = useState<string | null>(null)
  if (p.options.length === 0) {
    return <p className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-500">No options yet. Type a name below and press Add.</p>
  }
  return (
    <ul className="space-y-3">
      {p.options.map((o) => <Card key={o.id} p={p} o={o} editing={editing === o.id} onEdit={(on) => setEditing(on ? o.id : null)} />)}
    </ul>
  )
}

function Card({ p, o, editing, onEdit }: { p: ComparisonProps; o: ChoiceOption; editing: boolean; onEdit: (on: boolean) => void }) {
  const fact = optionFact(o, p.followUpOf(o), p.now)
  const cell = p.priceCellOf(o)
  const facts = p.columns
    .map((c) => ({ c, text: formatCell(c, o.values[c.id] as CellValue | undefined) }))
    .filter((f) => editing || f.text)
  const files = p.renderFiles?.(o)
  const canEdit = !!p.renderCell
  const contact = contactLine(o, p.contacts)
  return (
    <li className={`rounded-xl border border-neutral-200 bg-white p-3 ${o.status === 'ruled_out' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <b className="font-medium text-neutral-900">{o.name}</b>
        <span className="flex items-center gap-2">
          <StatusChip status={o.status} />
          {canEdit && (
            <button type="button" onClick={() => onEdit(!editing)} className="text-[13px] text-primary-600 hover:text-primary-700">
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </span>
      </div>
      {contact && <div className="mt-0.5 text-xs text-neutral-500">{contact}</div>}
      {fact && <div className="mt-1 text-xs text-neutral-500">{fact}</div>}
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
        {(editing || cell.kind !== 'none') && (
          <>
            <dt className="text-neutral-500">Price</dt>
            <dd><PriceCellView option={o} cell={cell} onEdit={p.onEditPrice} /></dd>
          </>
        )}
        {facts.map(({ c, text }) => (
          <div key={c.id} className="contents">
            <dt className="text-neutral-500">{c.label}</dt>
            <dd className="text-neutral-800">{editing && p.renderCell ? p.renderCell(o, c) : text}</dd>
          </div>
        ))}
        {files && (
          <>
            <dt className="text-neutral-500">Files</dt>
            <dd>{files}</dd>
          </>
        )}
      </dl>
      {p.renderActions && <div className="mt-2 text-xs">{p.renderActions(o)}</div>}
    </li>
  )
}
