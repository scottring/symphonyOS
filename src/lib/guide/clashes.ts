// The Week session's calendar check (spec 2026-11-01, step 3): what the week's
// fixed times say about themselves. Two that cross overlap; two at different
// places with under 15 minutes between them are tight. A timed span of a day
// or more (a trip, a conference) is left out, as an all-day event is. Facts
// only: nothing is suggested, and Scott decides what changes.

import { localYmd } from '@/lib/cadence/config'

export interface ClashEvent { id: string; title: string; start: Date; end: Date; place?: string }
export interface Clash { kind: 'overlap' | 'tight'; a: string; b: string; day: string }

const TIGHT_MS = 15 * 60_000
const DAY_MS = 24 * 60 * 60_000
const placeOf = (e: ClashEvent) => (e.place ?? '').trim().toLowerCase()

/** Each pair once, the earlier first; `day` is the later one's start
 *  (YYYY-MM-DD): where the clash is felt, the morning after a late night. */
export function findClashes(events: readonly ClashEvent[]): Clash[] {
  const sorted = events.filter((e) => e.end.getTime() - e.start.getTime() < DAY_MS).sort((x, y) => x.start.getTime() - y.start.getTime() || x.end.getTime() - y.end.getTime())
  const out: Clash[] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (b.start.getTime() >= a.end.getTime() + TIGHT_MS) break
      const day = localYmd(b.start)
      if (b.start < a.end) { out.push({ kind: 'overlap', a: a.id, b: b.id, day }); continue }
      const pa = placeOf(a), pb = placeOf(b)
      if (pa && pb && pa !== pb) out.push({ kind: 'tight', a: a.id, b: b.id, day })
    }
  }
  return out
}
