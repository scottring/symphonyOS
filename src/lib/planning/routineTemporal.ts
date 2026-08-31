//
// Human-readable temporal parameters for a routine — the WHY behind its
// appearance in the planning pool's Routines tab ("Weekly · Sat · no set
// time" explains exactly what a drop onto the grid would pin down).
import type { Routine } from '@/types/actionable'

const DAY_LABELS: Record<string, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
}

function timeLabel(timeOfDay: string | null): string {
  if (!timeOfDay) return 'no set time'
  const [hh, mm] = timeOfDay.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 'no set time'
  const period = hh >= 12 ? 'PM' : 'AM'
  const hour12 = hh % 12 === 0 ? 12 : hh % 12
  return `${hour12}:${String(mm).padStart(2, '0')} ${period}`
}

export function routineTemporalLabel(routine: Routine): string {
  const p = routine.recurrence_pattern
  const parts: string[] = []

  const interval = p.interval && p.interval > 1 ? p.interval : null
  switch (p.type) {
    case 'daily':
      parts.push(interval ? `Every ${interval} days` : 'Daily')
      break
    case 'weekly':
      parts.push(interval ? `Every ${interval} weeks` : 'Weekly')
      if (p.days?.length) parts.push(p.days.map((d) => DAY_LABELS[d] ?? d).join(', '))
      break
    case 'monthly':
      parts.push(interval ? `Every ${interval} months` : 'Monthly')
      if (p.day_of_month) parts.push(`day ${p.day_of_month}`)
      break
    case 'quarterly':
      parts.push('Quarterly')
      break
    case 'yearly':
      parts.push('Yearly')
      break
    case 'specific_days':
      parts.push(p.dates?.length ? `${p.dates.length} set dates` : 'Set dates')
      break
    case 'since_last':
      parts.push(`${p.interval ?? 1} ${p.unit ?? 'days'} after last done`)
      break
  }

  parts.push(timeLabel(routine.time_of_day))
  return parts.join(' · ')
}
