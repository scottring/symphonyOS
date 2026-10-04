// A day's shape for the week's last planning step (Scott, 2026-10-03: "does
// it fit?"): what's taken between 7a and 9p, and the free windows left.
// Hours are decimals (9.5 = 9:30).

export interface Span { s: number; e: number }

export const DAY_START = 7
export const DAY_END = 21
const MIN_GAP = 0.5
const DEFAULT_LENGTH = 0.5

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60

/** Timed things as hours, clipped to the day; a time with no end takes half an hour. */
export function busyBlocks(items: { start: Date; end?: Date }[]): Span[] {
  return items.flatMap(({ start, end }) => {
    const s = Math.max(DAY_START, hourOf(start))
    const e = Math.min(DAY_END, end ? hourOf(end) : hourOf(start) + DEFAULT_LENGTH)
    return e > s ? [{ s, e }] : []
  })
}

/** The gaps between taken time, half an hour or longer (or `minGap` hours —
 *  the Week page's days count only an hour or more as free). */
export function freeWindows(busy: Span[], minGap = MIN_GAP): Span[] {
  const sorted = [...busy].sort((a, b) => a.s - b.s)
  const out: Span[] = []
  let cursor = DAY_START
  for (const b of sorted) {
    if (b.s - cursor >= minGap) out.push({ s: cursor, e: b.s })
    cursor = Math.max(cursor, b.e)
  }
  if (DAY_END - cursor >= minGap) out.push({ s: cursor, e: DAY_END })
  return out
}

function clock(h: number, withMeridiem: boolean): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const twelve = hh % 12 === 0 ? 12 : hh % 12
  return `${twelve}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${withMeridiem ? (hh < 12 ? 'a' : 'p') : ''}`
}

/** "Free 10:30a–4p · 5–7p" — the start's a/p only when it differs from the end's. */
export function formatFree(windows: Span[]): string {
  if (!windows.length) return 'No free time'
  if (windows.length === 1 && windows[0].s <= DAY_START && windows[0].e >= DAY_END) return 'Free all day'
  return 'Free ' + windows.map((w) => {
    const sameHalf = (w.s < 12) === (w.e < 12)
    return `${clock(w.s, !sameHalf)}–${clock(w.e, true)}`
  }).join(' · ')
}
