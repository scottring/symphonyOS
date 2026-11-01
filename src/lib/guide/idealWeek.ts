// The ideal week: Season's 168-hour fit test. A template, not a schedule.
// A block with a goalId is a goal block; every other block is base (sleep,
// work, meals...). The user types every label and number.

export type IdealWeek = { blocks: { id: string; label: string; hours: number; goalId?: string; when?: string }[] }

export const WEEK_HOURS = 168

const round = (n: number) => Math.round(n * 1e6) / 1e6

export const totalHours = (w: IdealWeek): number => round(w.blocks.reduce((s, b) => s + b.hours, 0))
export const goalHours = (w: IdealWeek): number => round(w.blocks.reduce((s, b) => (b.goalId ? s + b.hours : s), 0))
export const baseHours = (w: IdealWeek): number => round(totalHours(w) - goalHours(w))

/** 168 minus everything blocked; negative when the blocks overfill the week. */
export const hoursLeft = (w: IdealWeek): number => round(WEEK_HOURS - totalHours(w))

/** 3.75 -> "3h 45m", 4 -> "4h", 0.75 -> "45m", -2.5 -> "-2h 30m". */
export function formatHours(h: number): string {
  const mins = Math.round(Math.abs(h) * 60)
  const sign = h < 0 && mins > 0 ? '-' : ''
  const hh = Math.floor(mins / 60), mm = mins % 60
  if (hh === 0 && mm === 0) return '0h'
  if (mm === 0) return `${sign}${hh}h`
  if (hh === 0) return `${sign}${mm}m`
  return `${sign}${hh}h ${mm}m`
}

function single(s: string): number | null {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const m = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/.exec(s)
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60
}

/** "3h 45m", "3.75", "45m", "3 x 1h 15m" (also the multiplication sign) -> hours. Null when it is not a positive amount. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const times = /^(\d+)\s*[×x*]\s*(.+)$/.exec(s)
  const each = times ? single(times[2].trim()) : single(s)
  if (each === null) return null
  const hours = round(each * (times ? Number(times[1]) : 1))
  return hours > 0 ? hours : null
}
