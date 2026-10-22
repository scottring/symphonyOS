import type { PriceLine, WorkPiece } from '@/types/choice'

export interface PriceResult { totalCents: number; lines: PriceLine[] }

const NUMBER_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

export function formatCents(cents: number): string {
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

/** Names the pieces in work-list order. All pieces selected, with three or
 *  more in the list, reads "All three". */
export function workLabel(ids: readonly string[], work: readonly WorkPiece[]): string {
  const picked = work.filter((w) => ids.includes(w.id))
  if (picked.length === 0) return ''
  if (picked.length >= 3 && picked.length === work.length) {
    return `All ${NUMBER_WORDS[picked.length] ?? picked.length}`
  }
  return picked.map((w) => w.label).join(' + ')
}

function workIndex(line: PriceLine, work: readonly WorkPiece[]): number {
  return Math.min(...line.workIds.map((id) => work.findIndex((w) => w.id === id)))
}

function orderLines(lines: readonly PriceLine[], work: readonly WorkPiece[]): PriceLine[] {
  return [...lines].sort(
    (a, b) => workIndex(a, work) - workIndex(b, work) || a.workIds.length - b.workIds.length,
  )
}

/** Lines whose pieces all still exist in the work list. */
function liveLines(lines: readonly PriceLine[], work: readonly WorkPiece[]): PriceLine[] {
  const ids = new Set(work.map((w) => w.id))
  return lines.filter((l) => l.workIds.length > 0 && l.workIds.every((id) => ids.has(id)))
}

export function priceFor(
  lines: readonly PriceLine[],
  selected: readonly string[],
  work: readonly WorkPiece[],
): PriceResult | null {
  if (work.length === 0) {
    if (lines.length === 0) return null
    return { totalCents: lines.reduce((s, l) => s + l.amountCents, 0), lines: [...lines] }
  }
  const target = new Set(work.filter((w) => selected.includes(w.id)).map((w) => w.id))
  if (target.size === 0) return null
  const usable = liveLines(lines, work).filter((l) => l.workIds.every((id) => target.has(id)))

  let best: PriceResult | null = null
  const search = (start: number, covered: Set<string>, chosen: PriceLine[], total: number) => {
    if (covered.size === target.size) {
      if (
        !best ||
        total < best.totalCents ||
        (total === best.totalCents && chosen.length < best.lines.length)
      ) {
        best = { totalCents: total, lines: [...chosen] }
      }
      return
    }
    for (let i = start; i < usable.length; i++) {
      const l = usable[i]
      if (l.workIds.some((id) => covered.has(id))) continue
      const next = new Set(covered)
      l.workIds.forEach((id) => next.add(id))
      search(i + 1, next, [...chosen, l], total + l.amountCents)
    }
  }
  search(0, new Set(), [], 0)
  if (!best) return null
  const r: PriceResult = best
  return { totalCents: r.totalCents, lines: orderLines(r.lines, work) }
}

export function howItAddsUp(result: PriceResult, work: readonly WorkPiece[]): string {
  if (result.lines.length === 1 && result.lines[0].workIds.length > 1) {
    return `${workLabel(result.lines[0].workIds, work)}, one price`
  }
  return result.lines
    .map((l) => {
      const label = workLabel(l.workIds, work)
      return label ? `${label} ${formatCents(l.amountCents)}` : formatCents(l.amountCents)
    })
    .join(' + ')
}

export function pricedSummary(lines: readonly PriceLine[], work: readonly WorkPiece[]): string {
  const live = work.length === 0 ? [...lines] : orderLines(liveLines(lines, work), work)
  if (live.length === 0) return ''
  const parts = live.map((l) => {
    const label = workLabel(l.workIds, work)
    return label ? `${label} ${formatCents(l.amountCents)}` : formatCents(l.amountCents)
  })
  return `Priced: ${parts.join(' · ')}`
}
