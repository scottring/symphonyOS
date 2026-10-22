import type { ReactNode } from 'react'
import type { CellValue, ChoiceColumn, ChoiceOption } from '@/types/choice'
import type { SortKey } from '@/lib/choices/sort'
import { formatCents } from '@/lib/choices/price'
import { optionFact } from '@/lib/choices/facts'
import type { FollowUp } from '@/types/choice'
import { StatusChip } from './StatusChip'
import { contactLine, formatCell, type PriceCell } from './cells'

export interface ComparisonProps {
  options: readonly ChoiceOption[]
  columns: readonly ChoiceColumn[]
  priceHeading: string
  priceCellOf: (o: ChoiceOption) => PriceCell
  contacts: ReadonlyMap<string, { name: string; phone?: string }>
  followUpOf: (o: ChoiceOption) => FollowUp | undefined
  now: Date
  sortKey: SortKey | null
  onSort: (key: SortKey) => void
  /** Task 6 places: attachments cell, per-row actions, "+ Column". */
  renderFiles?: (o: ChoiceOption) => ReactNode
  renderActions?: (o: ChoiceOption) => ReactNode
  addColumnSlot?: ReactNode
}

export function PriceBlock({ cell }: { cell: PriceCell }) {
  if (cell.kind === 'none') return <span className="text-neutral-400">—</span>
  if (cell.kind === 'total') {
    return (
      <>
        <b className="block font-semibold text-neutral-900">{formatCents(cell.totalCents)}</b>
        <small className="block text-xs text-neutral-500">{cell.how}</small>
      </>
    )
  }
  return (
    <>
      <span className="block text-neutral-600">No price for just these</span>
      {cell.priced && <small className="block text-xs text-neutral-500">{cell.priced}</small>}
    </>
  )
}

const isActive = (k: SortKey | null, t: SortKey) =>
  !!k && k.kind === t.kind && (k.kind !== 'column' || (t.kind === 'column' && k.columnId === t.columnId))

export function ComparisonTable(p: ComparisonProps) {
  const head = (label: string, key: SortKey, id?: string) => (
    <th key={id} scope="col" className="px-3 py-2 text-left align-bottom text-[12px] font-semibold text-neutral-500">
      <button
        type="button"
        onClick={() => p.onSort(key)}
        aria-label={label}
        className={`font-semibold hover:text-neutral-800 ${isActive(p.sortKey, key) ? 'text-neutral-900' : ''}`}
      >
        {label}{isActive(p.sortKey, key) ? ' ↑' : ''}
      </button>
    </th>
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-neutral-200">
          <tr>
            {head('Option', { kind: 'name' })}
            {head(p.priceHeading, { kind: 'price' })}
            {p.columns.map((c) => head(c.label, { kind: 'column', columnId: c.id }, c.id))}
            <th scope="col" className="px-3 py-2 text-left align-bottom text-[12px] font-semibold text-neutral-500">Files</th>
            <th scope="col" className="px-3 py-2 text-left align-bottom text-[12px] font-normal text-neutral-500">{p.addColumnSlot}</th>
          </tr>
        </thead>
        <tbody>
          {p.options.map((o) => {
            const contact = contactLine(o, p.contacts)
            const fact = optionFact(o, p.followUpOf(o), p.now)
            return (
              <tr key={o.id} className={`border-t border-neutral-100 align-top ${o.status === 'ruled_out' ? 'opacity-60' : ''}`}>
                <td className="px-3 py-3">
                  <b className="block font-medium text-neutral-900">{o.name}</b>
                  {contact && <small className="block text-xs text-neutral-500">{contact}</small>}
                  <span className="mt-1 inline-block"><StatusChip status={o.status} /></span>
                  {fact && <div className="mt-1 text-xs text-neutral-500">{fact}</div>}
                </td>
                <td className="px-3 py-3"><PriceBlock cell={p.priceCellOf(o)} /></td>
                {p.columns.map((c) => {
                  const text = formatCell(c, o.values[c.id] as CellValue | undefined)
                  return (
                    <td key={c.id} className={`px-3 py-3 ${text ? 'text-neutral-800' : 'text-neutral-400'}`}>{text ?? '—'}</td>
                  )
                })}
                <td className="px-3 py-3">{p.renderFiles?.(o)}</td>
                <td className="px-3 py-3 text-xs">{p.renderActions?.(o)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
