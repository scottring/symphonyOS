// src/components/planning/guided/stepTypes/BookNextStep.tsx
//
// The step that keeps the system alive: schedule the NEXT session before
// closing this one. Defaults to the morning after this period ends (9:00,
// 45 minutes), editable. Calendar write goes to the default calendar (the
// hook's existing behavior); disconnected falls back to a dated task.
import { useState, useMemo, useCallback } from 'react'
import { CalendarPlus, Check } from 'lucide-react'
import { DOMAIN_LABELS } from '@/lib/today/domainFilter'
import { useGuided } from '../GuidedContext'

function toInputValue(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function BookNextStep() {
  const { step, host, periodEnd, domain } = useGuided()
  const baseTitle = step.props?.bookTitle ?? 'Planning session'
  // Domain sessions book a domain-named next session ("Work — Seasonal
  // planning session") so parallel cadences don't collide on the calendar.
  const title = domain === 'universal' ? baseTitle : `${DOMAIN_LABELS[domain]} — ${baseTitle}`
  const defaultDate = useMemo(() => {
    const d = new Date(periodEnd)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }, [periodEnd])
  const [dateStr, setDateStr] = useState(() => toInputValue(defaultDate))
  const [booked, setBooked] = useState(false)

  const book = useCallback(async () => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return
    const start = new Date(y, m - 1, d, 9, 0, 0, 0)
    if (host.calendarConnected) {
      const end = new Date(start.getTime() + 45 * 60 * 1000)
      await host.createEvent({ title, startTime: start, endTime: end })
    } else {
      // Re-running the session must not stack duplicate reminder tasks
      // (observed: 3× "Seasonal planning session" piled on one day). Same
      // title + same day + still open = already booked.
      const already = host.tasks.some((t) => {
        if (t.completed || t.title !== title || !t.scheduledFor) return false
        const s = new Date(t.scheduledFor)
        return s.getFullYear() === y && s.getMonth() === m - 1 && s.getDate() === d
      })
      if (!already) await host.createDatedTask(title, start)
    }
    setBooked(true)
  }, [dateStr, host, title])

  if (booked) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-primary-700">
        <Check className="w-4 h-4" strokeWidth={3} /> Booked — {title}, {dateStr}. The system keeps running.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)}
        aria-label="Session date"
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
      <button type="button" onClick={() => void book()}
        className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
        <CalendarPlus className="w-4 h-4" />
        {host.calendarConnected ? 'Put it on the calendar' : 'Add a reminder task'}
      </button>
    </div>
  )
}
