// src/lib/cadence/seasons.ts
//
// The household's seasons. Not meteorological, not fiscal — the four
// boundaries this household plans by ("we're making our own groupings",
// Scott, 2026-09-05; the next one starts October). Everything that says
// "season" reads these: the cadence anchor, the season pool, the Season tab,
// the paper window. Nothing hard-codes Mar/Jun/Sep/Dec any more.
//
// Persisted on households.seasons (jsonb) and mirrored to localStorage so
// synchronous callers — the writers that stamp season_start — have an answer
// before the household row has loaded, the same way readCadenceConfig works.

export interface SeasonBoundary {
  name: string
  /** 1–12 */
  month: number
  /** 1–31, clamped to the month's length */
  day: number
}

export type Seasons = readonly [SeasonBoundary, SeasonBoundary, SeasonBoundary, SeasonBoundary]

export const DEFAULT_SEASONS: Seasons = [
  { name: 'Winter', month: 1, day: 1 },
  { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 },
  { name: 'Fall', month: 10, day: 1 },
]

const STORAGE_KEY = 'symphony-seasons'
export const SEASONS_SYNC_EVENT = 'symphony:seasons-changed'

function daysInMonth(month: number, year = 2001): number {
  // 2001 is not a leap year: Feb clamps to 28 so a boundary never lands on a day
  // that exists only every fourth year.
  return new Date(year, month, 0).getDate()
}

/** Any junk → a valid, calendar-ordered 4-tuple. DEFAULT when it can't be made valid. */
export function normalizeSeasons(raw: unknown): Seasons {
  if (!Array.isArray(raw) || raw.length !== 4) return DEFAULT_SEASONS
  const cleaned: SeasonBoundary[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return DEFAULT_SEASONS
    const { name, month, day } = item as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) return DEFAULT_SEASONS
    if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return DEFAULT_SEASONS
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1) return DEFAULT_SEASONS
    cleaned.push({ name: name.trim(), month, day: Math.min(day, daysInMonth(month)) })
  }
  cleaned.sort((a, b) => a.month - b.month || a.day - b.day)
  return cleaned as unknown as Seasons
}

function boundaryDate(b: SeasonBoundary, year: number): Date {
  return new Date(year, b.month - 1, b.day)
}

/** Midnight of the boundary on or before `date`. Before the year's first
 *  boundary, that is the LAST boundary of the previous year. */
export function seasonStartFor(date: Date, seasons: Seasons): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const year = d.getFullYear()
  for (let i = seasons.length - 1; i >= 0; i--) {
    const start = boundaryDate(seasons[i], year)
    if (start <= d) return start
  }
  return boundaryDate(seasons[seasons.length - 1], year - 1)
}

/** Midnight of the boundary AFTER the one `date` is in — the exclusive end. */
export function seasonEndFor(date: Date, seasons: Seasons): Date {
  const start = seasonStartFor(date, seasons)
  const idx = seasons.findIndex((b) => boundaryDate(b, start.getFullYear()).getTime() === start.getTime())
  if (idx < seasons.length - 1) return boundaryDate(seasons[idx + 1], start.getFullYear())
  return boundaryDate(seasons[0], start.getFullYear() + 1)
}

export function nextSeasonStart(date: Date, seasons: Seasons): Date {
  return seasonEndFor(date, seasons)
}

function boundaryOf(start: Date, seasons: Seasons): SeasonBoundary {
  return seasons.find((b) => b.month - 1 === start.getMonth() && b.day === start.getDate()) ?? seasons[0]
}

/** "Fall 2026" — named for the year the season STARTED, so late December
 *  of a season that began in October is still 2026. */
export function seasonLabel(date: Date, seasons: Seasons): string {
  const start = seasonStartFor(date, seasons)
  return `${boundaryOf(start, seasons).name} ${start.getFullYear()}`
}

/** "2026-fall" — the stable key a nudge dismissal is scoped to. */
export function seasonToken(date: Date, seasons: Seasons): string {
  const start = seasonStartFor(date, seasons)
  return `${start.getFullYear()}-${boundaryOf(start, seasons).name.toLowerCase().replace(/\s+/g, '-')}`
}

export function isSeasonBoundary(date: Date, seasons: Seasons): boolean {
  return seasons.some((b) => b.month - 1 === date.getMonth() && b.day === date.getDate())
}

export function readSeasons(): Seasons {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SEASONS
    return normalizeSeasons(JSON.parse(raw))
  } catch {
    return DEFAULT_SEASONS
  }
}

export function cacheSeasons(seasons: Seasons): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seasons))
    window.dispatchEvent(new Event(SEASONS_SYNC_EVENT))
  } catch {
    // private browsing / quota — the in-memory value still flows through the hook
  }
}
