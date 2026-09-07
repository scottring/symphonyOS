import { CalendarClock } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { AppointmentRow } from '@/lib/wall/memberPageModel'

/** Rows that fit: 5 at 64px in a ~420px column. The model is already in clock order. */
const SHOWN = 5

/** An adult's left column: the hour large, the title beside it, a location beneath. */
export function AppointmentsWidget({ rows, className }: { rows: AppointmentRow[]; className?: string }) {
  const shown = rows.slice(0, SHOWN)
  return (
    <Widget title="Appointments" icon={CalendarClock} className={className}>
      {shown.length === 0 && <p className={`text-[1.05rem] ${WALL.muted}`}>Nothing on the clock today</p>}
      {shown.map((r) => (
        <div key={r.id} className={`${WALL.cardInset} flex items-center gap-3 px-4 py-2 min-h-[64px] ${r.past ? 'opacity-50' : ''}`}>
          <span className={`font-display text-[1.6rem] leading-none tabular-nums w-[4.2rem] shrink-0 ${WALL.inkStrong}`}>{r.time}</span>
          <div className="min-w-0">
            <div className={`text-[1.1rem] font-bold leading-tight truncate ${r.free ? WALL.muted : WALL.inkStrong}`}>{r.title}</div>
            {r.detail && <div className={`text-[0.9rem] font-semibold truncate ${WALL.muted}`}>{r.detail}</div>}
          </div>
        </div>
      ))}
      {rows.length > SHOWN && <p className={`text-[0.85rem] font-bold ${WALL.muted}`}>and {rows.length - SHOWN} more</p>}
    </Widget>
  )
}
