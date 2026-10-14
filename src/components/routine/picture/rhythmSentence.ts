// src/components/routine/picture/rhythmSentence.ts
//
// One plain sentence under the Routines title (frame "After 1"): when school
// days run (first start to bedtime), the fullest day, and this week's
// exceptions. Rules decide what it says, as on Week (wall philosophy rule 5);
// nothing here is generated. Nothing to say, no sentence.

import { localYmd } from '@/lib/cadence/config'
import { clock, inCell, type Occurrence } from './routinesPicture'

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })
const isWeekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5
const minutes = (t: Date) => t.getHours() * 60 + t.getMinutes()

/** The time most days share (ties go to the earliest). */
function usual(times: Date[]): Date | null {
  if (!times.length) return null
  const count = new Map<number, { n: number; t: Date }>()
  for (const t of times) {
    const m = minutes(t)
    count.set(m, { n: (count.get(m)?.n ?? 0) + 1, t })
  }
  return [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0])[0][1].t
}

function exceptionPhrase(o: Occurrence, day: Date): string {
  const kinds = o.exception!.kinds
  const when = longDay(day)
  if (kinds.includes('skipped')) return `${o.title} is skipped ${when}`
  if (kinds.includes('moved')) return `${o.title} moves to ${when}`
  if (kinds.includes('who')) return `${o.exception!.label.split(', ').pop()} has ${o.title} ${when}`
  return `${o.title} is ${o.exception!.label} ${when}`
}

export function rhythmSentence(days: Date[], occurrences: Occurrence[]): string | null {
  const keyOf = new Map(days.map((d) => [localYmd(d), d]))
  const live = occurrences.filter((o) => keyOf.has(o.dayKey) && !o.exception?.kinds.includes('skipped'))
  const parts: string[] = []

  // When the weekdays start, and bedtime.
  const weekdayKeys = [...keyOf.entries()].filter(([, d]) => isWeekday(d)).map(([k]) => k)
  const firsts = weekdayKeys.flatMap((k) => {
    const timed = live.filter((o) => o.dayKey === k && o.time && o.time.getHours() < 12).map((o) => o.time!)
    return timed.length ? [timed.reduce((a, b) => (minutes(a) <= minutes(b) ? a : b))] : []
  })
  const start = firsts.length >= 2 ? usual(firsts) : null
  const bed = usual(live.filter((o) => weekdayKeys.includes(o.dayKey) && o.time && o.time.getHours() >= 17 && /\bbed/i.test(o.title)).map((o) => o.time!))
  const school = live.some((o) => weekdayKeys.includes(o.dayKey) && /\bschool\b/i.test(o.title))
  const who = school ? 'School days' : 'Weekdays'
  if (start && bed) parts.push(`${who} run ${clock(start)} to bedtime at ${clock(bed)}.`)
  else if (start) parts.push(`${who} start at ${clock(start)}.`)
  else if (bed) parts.push(`Bedtime is at ${clock(bed)}.`)

  // The fullest day: clearly the most in its cells, and at least three.
  const load = days.map((d) => ({ d, n: live.filter((o) => keyOf.get(o.dayKey) === d && inCell(o)).length })).sort((a, b) => b.n - a.n)
  if (load.length > 1 && load[0].n >= 3 && load[0].n > load[1].n) parts.push(`${longDay(load[0].d)} is the full one.`)

  // This week's saved exceptions.
  const exceptions = occurrences.filter((o) => o.exception && keyOf.has(o.dayKey))
  if (exceptions.length === 1) parts.push(`This week: ${exceptionPhrase(exceptions[0], keyOf.get(exceptions[0].dayKey)!)}.`)
  else if (exceptions.length === 2) parts.push(`This week: ${exceptions.map((o) => exceptionPhrase(o, keyOf.get(o.dayKey)!)).join(', and ')}.`)
  else if (exceptions.length > 2) parts.push(`This week has ${exceptions.length} changes.`)

  return parts.length ? parts.join(' ') : null
}
