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
  /** The option's one log line: the next planned event and the last one done. */
  logLineOf?: (o: ChoiceOption) => { next?: string; last?: string } | null
  /** Editing places: attachments cell, per-row actions, "+ Column", a
   *  column's heading menu, an editable value, and the price editor. */
  renderFiles?: (o: ChoiceOption) => ReactNode
  renderActions?: (o: ChoiceOption) => ReactNode
  addColumnSlot?: ReactNode
  renderColumnMenu?: (c: ChoiceColumn) => ReactNode
  renderCell?: (o: ChoiceOption, c: ChoiceColumn) => ReactNode
  onEditPrice?: (o: ChoiceOption) => void
}

/** An editable value looks tappable; an empty one says what tapping adds. */
export const editableCell = '-mx-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-neutral-100'
export const addLabel = 'text-primary-600'

/** "Home visit Fri Oct 30, 10:00 · last: Phone call Oct 22"; the planned
 *  part in the primary color. */
export function LogLineView({ line }: { line: { next?: string; last?: string } | null | undefined }) {
  if (!line) return null
  // Each phrase stays whole; only the quoted summary after " · " may wrap.
  const cut = line.last ? line.last.indexOf(' · ') : -1
  const lastHead = line.last && (cut < 0 ? line.last : line.last.slice(0, cut))
  const lastTail = line.last && cut >= 0 ? line.last.slice(cut) : ''
  return (
    <div className="mt-1 break-words text-xs text-neutral-500">
      {line.next && <span className="whitespace-nowrap text-primary-600">{line.next}</span>}
      {line.next && line.last && ' · '}
      {lastHead && <span className="whitespace-nowrap">{line.next ? `last: ${lastHead}` : lastHead}</span>}
      {lastTail}
    </div>
  )
}

/** The price block, as a button that opens the editor when editing. */
export function PriceCellView({ option, cell, onEdit }: { option: ChoiceOption; cell: PriceCell; onEdit?: (o: ChoiceOption) => void }) {
  if (!onEdit) return <PriceBlock cell={cell} />
  return (
    <button type="button" aria-label={`Price for ${option.name}`} onClick={() => onEdit(option)}
      className={`${editableCell} block`}>
      {cell.kind === 'none' ? <span className={addLabel}>Add price</span> : <PriceBlock cell={cell} />}
    </button>
  )
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
  const head = (label: string, key: SortKey, column?: ChoiceColumn) => (
    <th key={column?.id} scope="col" className="whitespace-nowrap px-3 py-2 text-left align-bottom text-[12px] font-semibold text-neutral-500">
      <button
        type="button"
        onClick={() => p.onSort(key)}
        aria-label={label}
        className={`font-semibold hover:text-neutral-800 ${isActive(p.sortKey, key) ? 'text-neutral-900' : ''}`}
      >
        {label}{isActive(p.sortKey, key) ? ' ↑' : ''}
      </button>
      {column && p.renderColumnMenu?.(column)}
    </th>
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-neutral-200">
          <tr>
            {head('Option', { kind: 'name' })}
            {head(p.priceHeading, { kind: 'price' })}
            {p.columns.map((c) => head(c.label, { kind: 'column', columnId: c.id }, c))}
            <th scope="col" className="px-3 py-2 text-left align-bottom text-[12px] font-semibold text-neutral-500">Files</th>
            <th scope="col" className="px-3 py-2 text-left align-bottom text-[12px] font-normal text-neutral-500">{p.addColumnSlot}</th>
          </tr>
        </thead>
        <tbody>
          {p.options.length === 0 && (
            <tr>
              <td colSpan={p.columns.length + 4} className="px-3 py-4 text-neutral-500">
                No options yet. Type a name below and press Add.
              </td>
            </tr>
          )}
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
                  <LogLineView line={p.logLineOf?.(o)} />
                </td>
                <td className="px-3 py-3"><PriceCellView option={o} cell={p.priceCellOf(o)} onEdit={p.onEditPrice} /></td>
                {p.columns.map((c) => {
                  if (p.renderCell) return <td key={c.id} className="px-3 py-3">{p.renderCell(o, c)}</td>
                  const text = formatCell(c, o.values[c.id] as CellValue | undefined)
                  return (
                    <td key={c.id} className={`px-3 py-3 ${text ? 'text-neutral-800' : 'text-neutral-400'}`}>{text ?? '—'}</td>
                  )
                })}
                <td className="px-3 py-3">{p.renderFiles?.(o) ?? <span className="text-neutral-400">—</span>}</td>
                <td className="px-3 py-3 text-xs">{p.renderActions?.(o)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
