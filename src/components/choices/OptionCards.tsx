import type { CellValue } from '@/types/choice'
import { optionFact } from '@/lib/choices/facts'
import { StatusChip } from './StatusChip'
import { formatCell } from './cells'
import { PriceBlock, type ComparisonProps } from './ComparisonTable'

/** Narrow layout: one card per option, facts as lines in the table's order.
 *  Empty facts are left out. */
export function OptionCards(p: ComparisonProps) {
  return (
    <ul className="space-y-3">
      {p.options.map((o) => {
        const fact = optionFact(o, p.followUpOf(o), p.now)
        const cell = p.priceCellOf(o)
        const facts = p.columns
          .map((c) => ({ c, text: formatCell(c, o.values[c.id] as CellValue | undefined) }))
          .filter((f) => f.text)
        const files = p.renderFiles?.(o)
        return (
          <li key={o.id} className={`rounded-xl border border-neutral-200 bg-white p-3 ${o.status === 'ruled_out' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <b className="font-medium text-neutral-900">{o.name}</b>
              <StatusChip status={o.status} />
            </div>
            {fact && <div className="mt-1 text-xs text-neutral-500">{fact}</div>}
            <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              {cell.kind !== 'none' && (
                <>
                  <dt className="text-neutral-500">Price</dt>
                  <dd><PriceBlock cell={cell} /></dd>
                </>
              )}
              {facts.map(({ c, text }) => (
                <div key={c.id} className="contents">
                  <dt className="text-neutral-500">{c.label}</dt>
                  <dd className="text-neutral-800">{text}</dd>
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
      })}
    </ul>
  )
}
