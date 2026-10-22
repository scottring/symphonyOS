import type { CellValue, ChoiceColumn, ChoiceOption, PriceLine, WorkPiece } from '@/types/choice'
import { formatCents, howItAddsUp, priceFor, pricedSummary } from '@/lib/choices/price'

/** What an option's Price shows for the selected work. */
export type PriceCell =
  | { kind: 'total'; totalCents: number; how: string }
  | { kind: 'gap'; priced: string }
  | { kind: 'none' }

export function priceCellFor(
  lines: readonly PriceLine[],
  selected: readonly string[],
  work: readonly WorkPiece[],
): PriceCell {
  if (lines.length === 0) return { kind: 'none' }
  const result = priceFor(lines, selected, work)
  if (result) return { kind: 'total', totalCents: result.totalCents, how: howItAddsUp(result, work) }
  return { kind: 'gap', priced: pricedSummary(lines, work) }
}

/** The text of one column value; null when blank. */
export function formatCell(column: ChoiceColumn, value: CellValue | undefined): string | null {
  if (value == null || value === '') return null
  switch (column.kind) {
    case 'money': return typeof value === 'number' ? formatCents(value) : String(value)
    case 'yesno': return value === true ? 'Yes' : value === false ? 'No' : String(value)
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
      if (!m) return String(value)
      return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    default: return String(value)
  }
}

export function optionLines(lines: readonly PriceLine[], option: ChoiceOption): PriceLine[] {
  return lines.filter((l) => l.optionId === option.id)
}

export function contactLine(
  option: ChoiceOption,
  contacts: ReadonlyMap<string, { name: string; phone?: string }>,
): string | null {
  const c = option.contactId ? contacts.get(option.contactId) : undefined
  const parts = [c?.name, c?.phone, option.notes].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/

/** "Martinez Tile 410-555-0142" → name "Martinez Tile", phone "410-555-0142".
 *  A phone alone names the option by the number. */
export function splitPhone(text: string): { name: string; phone?: string } {
  const m = PHONE.exec(text)
  if (!m) return { name: text.trim() }
  const phone = m[0].trim()
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,·:–-]+|[\s,·:–-]+$/g, '')
  return { name: rest || phone, phone }
}
