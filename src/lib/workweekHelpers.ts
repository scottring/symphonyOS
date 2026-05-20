/**
 * Returns the Monday of the week containing `d`.
 *
 * For weekends (Sat/Sun), snaps to the UPCOMING Monday — the rationale
 * is that Workweek view is forward-looking; if you switch to it on a
 * Saturday, you want to see the week you're about to start, not the one
 * that just ended.
 *
 * Time portion is zeroed for clean date arithmetic downstream.
 */
export function mondayOfWeek(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  const dow = result.getDay()  // 0 = Sun, 1 = Mon, ..., 6 = Sat
  let offset: number
  if (dow === 0) offset = 1          // Sun → +1 (next Mon)
  else if (dow === 6) offset = 2     // Sat → +2 (next Mon)
  else offset = 1 - dow              // Mon-Fri → step back to Mon (or 0)
  result.setDate(result.getDate() + offset)
  return result
}
