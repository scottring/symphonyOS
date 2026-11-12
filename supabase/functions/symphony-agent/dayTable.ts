// The next two weeks, each day with its weekday name, told to Symphony with
// every turn. Given only "Today is 2026-11-12", the model worked weekdays out
// itself and slipped: a school email's "Friday" landed on Saturday the 21st
// (2026-11-12). Reading the day off a table is reliable; arithmetic is not.

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "(Days: Thu 2026-11-12 (today), Fri 2026-11-13, … — …)" for 14 days from
 *  `today` (the household's YYYY-MM-DD). Empty for a date that isn't real. */
export function dayTableLine(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return ''
  // Noon UTC: whole days, no DST edge can move the date.
  const start = new Date(`${today}T12:00:00Z`)
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== today) return ''
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000)
    return `${DAY[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}${i === 0 ? ' (today)' : ''}`
  })
  return `\n(Days: ${days.join(', ')}. When someone names a weekday, take its date from this list; never work a date out yourself.)`
}
