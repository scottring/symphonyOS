// The day, to scale (Scott, 2026-10-06, option B): Today's timed day drawn
// as a column of hours — events and timed work where they fall, the free
// stretches named, a "now" line. It replaces the Schedule list, so
// it is the one picture of the day, not a second one above a list.
//
// Pure: positions in px from the top of the column. Hours are decimals
// (9.5 = 9:30). Never writes.

export interface ScaleInput {
  id: string
  start: Date
  /** No end: half an hour, as everywhere else on Today. */
  end?: Date | null
}

export interface ScaleBlock {
  id: string
  top: number
  height: number
  /** Side by side when two things share time: this one's column, of `lanes`. */
  lane: number
  lanes: number
  /** Too short for two lines: drawn as one "4:00 · Title" line. */
  compact: boolean
}

export interface ScaleFree { top: number; height: number; label: string }

export interface DayScale {
  startHour: number
  endHour: number
  pxPerHour: number
  height: number
  blocks: ScaleBlock[]
  free: ScaleFree[]
  ticks: { top: number; label: string }[]
  /** The now line in px, or null when it isn't today. */
  now: number | null
}

export const DEFAULT_START = 7
export const DEFAULT_END = 21
const DEFAULT_MINUTES = 30
/** The shortest a block is drawn: one line of text. */
export const MIN_BLOCK = 26
/** Below this a block is a one-line chip. */
const COMPACT_BELOW = 40
/** Between two chips stacked because they start close together. */
const STACK_GAP = 4
/** An hour or more counts as free, as on the Week page's days. */
const MIN_FREE_HOURS = 1
const FREE_INSET = 4
const MIN_FREE_PX = 36

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60

/** "6a", "12p", "2p" */
export function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24
  const twelve = hh % 12 === 0 ? 12 : hh % 12
  return `${twelve}${hh < 12 ? 'a' : 'p'}`
}

/** "4½ hours free", "1 hour free" — quarter hours, as a person says them. */
export function freeHoursLabel(hours: number): string {
  const q = Math.round(hours * 4) / 4
  const whole = Math.floor(q)
  const frac = ({ 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' } as Record<number, string>)[q - whole] ?? ''
  return `${whole}${frac} ${q === 1 ? 'hour' : 'hours'} free`
}

/** The hour a dropped thing lands on: `top` px down the column, to the quarter hour. */
export function timeAtOffset(scale: Pick<DayScale, 'startHour' | 'endHour' | 'pxPerHour'>, top: number, day: Date): Date {
  const raw = scale.startHour + top / scale.pxPerHour
  const quarter = Math.round(raw * 4) / 4
  const h = Math.min(scale.endHour - 0.25, Math.max(scale.startHour, quarter))
  const out = new Date(day)
  out.setHours(Math.floor(h), Math.round((h - Math.floor(h)) * 60), 0, 0)
  return out
}

export function buildDayScale(
  items: ScaleInput[],
  /** fromHour: "Hide earlier hours" — the column opens at this hour; what
   *  ended before it is left off, and what runs across it starts there. */
  opts: { now?: Date | null; pxPerHour?: number; fromHour?: number | null } = {},
): DayScale {
  const pph = opts.pxPerHour ?? 48
  const from0 = opts.fromHour ?? null
  const spans = items.flatMap((i) => {
    const s = hourOf(i.start)
    const rawEnd = i.end ? hourOf(i.end) : s + DEFAULT_MINUTES / 60
    // An end on the next day (or before the start) runs to midnight.
    const e = Math.max(i.end && (i.end.getDate() !== i.start.getDate() || rawEnd <= s) ? 24 : rawEnd, s + 0.25)
    if (from0 !== null && e <= from0) return []
    return [{ id: i.id, s: from0 !== null ? Math.max(s, from0) : s, e }]
  })
  const nowH = opts.now ? hourOf(opts.now) : null

  // The column runs 7a–9p, stretched to hold everything on it and the now line.
  let startHour = from0 ?? DEFAULT_START
  let endHour = DEFAULT_END
  for (const sp of spans) {
    startHour = Math.min(startHour, Math.floor(sp.s))
    endHour = Math.max(endHour, Math.ceil(sp.e))
  }
  if (nowH !== null) {
    startHour = Math.min(startHour, Math.floor(nowH))
    endHour = Math.max(endHour, Math.ceil(nowH))
  }
  startHour = Math.max(0, startHour)
  endHour = Math.min(24, endHour)
  const y = (h: number) => (h - startHour) * pph

  // Blocks in time order, longer first at the same start.
  const placed = [...spans]
    .sort((a, b) => a.s - b.s || b.e - a.e)
    .map((sp) => {
      const natural = (sp.e - sp.s) * pph
      return { id: sp.id, top: y(sp.s), height: Math.max(MIN_BLOCK, natural), compact: natural < COMPACT_BELOW, lane: 0, lanes: 1 }
    })

  // Clusters of things that touch on screen. Two short chips stack (the
  // second just under the first, as a list would); anything else shares the
  // width, side by side, the way a calendar draws overlapping meetings.
  let cluster: typeof placed = []
  let clusterBottom = -Infinity
  const flush = () => {
    const laneEnds: number[] = []
    for (const b of cluster) {
      let lane = laneEnds.findIndex((end) => end <= b.top + 0.5)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0) }
      laneEnds[lane] = b.top + b.height
      b.lane = lane
    }
    for (const b of cluster) b.lanes = laneEnds.length
  }
  for (const b of placed) {
    if (cluster.length === 0 || b.top >= clusterBottom) {
      flush()
      cluster = [b]
      clusterBottom = b.top + b.height
      continue
    }
    if (b.compact && cluster.every((c) => c.compact)) b.top = clusterBottom + STACK_GAP
    cluster.push(b)
    clusterBottom = Math.max(clusterBottom, b.top + b.height)
  }
  flush()

  const columnHeight = Math.max(y(endHour), ...placed.map((b) => b.top + b.height + 8))

  // Free time: the gaps between taken time, an hour or more. On today the
  // part before now is spent, so a gap starts at now.
  const busy = [...spans].sort((a, b) => a.s - b.s)
  const from = nowH !== null ? Math.max(startHour, nowH) : startHour
  const windows: { s: number; e: number }[] = []
  let cursor = from
  for (const b of busy) {
    if (b.s - cursor >= MIN_FREE_HOURS) windows.push({ s: cursor, e: b.s })
    cursor = Math.max(cursor, b.e)
  }
  if (endHour - cursor >= MIN_FREE_HOURS) windows.push({ s: cursor, e: endHour })

  const free: ScaleFree[] = []
  for (const w of windows) {
    // Kept clear of any block drawn into it (a chip pushed down, a minimum
    // height), taken top to bottom: a block that starts too near the top to
    // leave room above it pushes the stretch down; one further in ends it.
    // (In placement order, a second chip stacked under the first ended the
    // evening before it began — 2026-10-07.)
    let top = y(w.s)
    let bottom = y(w.e)
    for (const b of [...placed].sort((p, q) => p.top - q.top)) {
      if (b.top >= bottom || b.top + b.height <= top) continue
      if (b.top < top + MIN_FREE_PX) top = Math.max(top, b.top + b.height)
      else bottom = Math.min(bottom, b.top)
    }
    top += FREE_INSET
    bottom -= FREE_INSET
    if (bottom - top < MIN_FREE_PX) continue
    const toEnd = w.e >= endHour
    const label = toEnd && w.s >= 16
      ? 'Evening open'
      : toEnd && w.s <= from
        ? (nowH !== null ? 'The rest of the day is open' : 'Open all day')
        : freeHoursLabel(w.e - w.s)
    free.push({ top, height: bottom - top, label })
  }

  const ticks: DayScale['ticks'] = []
  for (let h = startHour; h <= endHour; h += 2) ticks.push({ top: y(h), label: hourLabel(h) })

  return {
    startHour,
    endHour,
    pxPerHour: pph,
    height: columnHeight,
    blocks: placed.map(({ id, top, height, lane, lanes, compact }) => ({ id, top, height, lane, lanes, compact })),
    free,
    ticks,
    now: nowH !== null ? y(nowH) : null,
  }
}
