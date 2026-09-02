const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && YMD.test(s)
}

function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (asUtc - at.getTime()) / 60_000
}

/** The instant at which `ymd hm` occurs on the wall clock of `tz`. */
export function zonedIso(ymd: string, hm: string | null, tz: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = (hm ?? '00:00').split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes: the offset at the naive guess, then at the corrected instant,
  // which settles DST transitions.
  let guess = wall
  for (let i = 0; i < 2; i++) guess = wall - offsetMinutes(new Date(guess), tz) * 60_000
  return new Date(guess).toISOString()
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d + n)
  return new Date(t).toISOString().slice(0, 10)
}
