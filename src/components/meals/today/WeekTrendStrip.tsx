import { dayLabelFor } from '@/lib/weekHelpers'

interface Props {
  days: { date: Date; totalGramsActual?: number }[]
  weekStart: Date
}

/** Below-the-fold rhythm strip. No average line, no green/red, no goal. */
export function WeekTrendStrip({ days, weekStart }: Props) {
  const today = new Date()
  const max = days.reduce((m, d) => (d.totalGramsActual ?? 0) > m ? (d.totalGramsActual ?? 0) : m, 0) || 1

  return (
    <div className="mt-6 pt-4 border-t border-neutral-100">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-3">WEEK SO FAR</div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => {
          const dayOfWeek = (() => {
            const start = new Date(weekStart)
            const diff = Math.round((d.date.getTime() - start.getTime()) / 86400000)
            return diff
          })()
          const future = d.date > today
          const grams = d.totalGramsActual
          const pct = grams ? Math.max(0.1, grams / max) : 0
          const isToday = d.date.toDateString() === today.toDateString()
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 min-w-0">
              <div className={`text-[10px] font-medium uppercase tracking-[0.12em] truncate ${isToday ? 'text-primary-500' : 'text-neutral-400'}`}>
                {dayLabelFor(dayOfWeek)}
              </div>
              <div className={`text-[11px] font-display italic ${grams ? 'text-neutral-700' : 'text-neutral-300'}`}>
                {grams ? `${grams}g` : '·'}
              </div>
              <div className="w-full h-8 flex items-end">
                <div className={`w-full rounded-t-sm ${future ? 'bg-neutral-100' : 'bg-primary-300/70'}`}
                     style={{ height: `${(future ? 0 : pct) * 100}%`, minHeight: future ? 0 : (grams ? 3 : 0) }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
