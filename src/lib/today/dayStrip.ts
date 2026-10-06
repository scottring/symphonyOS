// The day, drawn (2026-10-06, "Today, calmer"): one band from 7a to 9p under
// the date — what's on the calendar, the timed work, the free stretches named,
// and a "now" mark. The same hours the Week page's free time counts
// (dayShape.ts), laid out as positions so the strip is a picture of the list
// below it, not new data.
import { busyBlocks, freeWindows, DAY_START, DAY_END, type Span } from '@/lib/week/dayShape'

export interface StripInput {
  id: string
  title: string
  kind: 'event' | 'task' | 'routine'
  start: Date
  end?: Date
}

export interface StripBlock {
  id: string
  title: string
  kind: StripInput['kind']
  /** Left edge and width, in % of the 7a–9p band. */
  left: number
  width: number
  /** 0 or 1: two things at once sit one above the other. */
  lane: 0 | 1
  start: Date
  end?: Date
}

export interface StripFree { left: number; width: number; label: string }

export interface DayStrip {
  blocks: StripBlock[]
  free: StripFree[]
  /** Whether any two blocks overlap (each then takes half the height). */
  stacked: boolean
  /** The "now" mark in %, or null when it isn't today or now is off the band. */
  now: number | null
}

const SPAN = DAY_END - DAY_START
const pct = (h: number) => ((h - DAY_START) / SPAN) * 100

/** "4½ hr free" — quarter hours, as a person would say them. */
export function freeLabel(hours: number): string {
  const q = Math.round(hours * 4) / 4
  const whole = Math.floor(q)
  const frac = ({ 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' } as Record<number, string>)[q - whole] ?? ''
  return `${whole || ''}${frac || (whole ? '' : '0')} hr free`
}

export function buildDayStrip(items: StripInput[], opts: { now?: Date | null } = {}): DayStrip {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const spans = busyBlocks(sorted.map((i) => ({ start: i.start, end: i.end })))
  // busyBlocks drops things wholly outside the band; keep items and spans paired.
  const paired: { item: StripInput; span: Span }[] = []
  for (const item of sorted) {
    const [span] = busyBlocks([{ start: item.start, end: item.end }])
    if (span) paired.push({ item, span })
  }
  const laneEnds: [number, number] = [-Infinity, -Infinity]
  let stacked = false
  const blocks: StripBlock[] = paired.map(({ item, span }) => {
    const lane: 0 | 1 = span.s >= laneEnds[0] ? 0 : 1
    if (lane === 1) stacked = true
    laneEnds[lane] = Math.max(laneEnds[lane], span.e)
    return { id: item.id, title: item.title, kind: item.kind, left: pct(span.s), width: pct(span.e) - pct(span.s), lane, start: item.start, end: item.end }
  })
  // An hour or more counts as free, as on the Week page's days.
  const free = freeWindows(spans, 1).map((w) => ({ left: pct(w.s), width: pct(w.e) - pct(w.s), label: freeLabel(w.e - w.s) }))
  let now: number | null = null
  if (opts.now) {
    const h = opts.now.getHours() + opts.now.getMinutes() / 60
    now = h >= DAY_START && h <= DAY_END ? pct(h) : null
  }
  return { blocks, free, stacked, now }
}

export const STRIP_TICKS = [7, 10, 13, 16, 19].map((h) => ({ left: pct(h), label: h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p` }))
