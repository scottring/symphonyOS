// Which part of the day the wall is in (Scott, 2026-10-04: the mockup "Wall,
// by time of day"). The centre card follows it: out the door, after school,
// dinner, then tomorrow's heads-up through the night.
export type WallMoment = 'morning' | 'after' | 'dinner' | 'evening'

export interface WallMomentOptions {
  /** A school day: mornings end at 9 (the kids are gone); otherwise at 11. */
  schoolDay: boolean
  /** When dinner is; the dinner card opens 75 minutes before. Default 6:00. */
  dinnerAt?: { h: number; m: number }
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes()

export function wallMoment(now: Date, { schoolDay, dinnerAt = { h: 18, m: 0 } }: WallMomentOptions): WallMoment {
  const t = minutes(now)
  const morningStart = 5 * 60
  const morningEnd = (schoolDay ? 9 : 11) * 60
  const eveningStart = 19 * 60 + 30
  const dinnerStart = dinnerAt.h * 60 + dinnerAt.m - 75
  if (t < morningStart || t >= eveningStart) return 'evening'
  if (t < morningEnd) return 'morning'
  if (t >= dinnerStart) return 'dinner'
  return 'after'
}
