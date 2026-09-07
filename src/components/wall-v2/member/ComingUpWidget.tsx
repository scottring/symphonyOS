import { CalendarDays } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { ComingUpRow } from '../wallStrip'

/** This person's next few days, one line each — is my week heavy, and where. */
export function ComingUpWidget({ rows }: { rows: ComingUpRow[] }) {
  return (
    <Widget title="Coming up" icon={CalendarDays}>
      {rows.length === 0 && <p className={`text-[1rem] ${WALL.muted}`}>Clear ahead</p>}
      {rows.map((r) => (
        <div key={r.dateKey} className="flex items-baseline gap-3 min-w-0">
          <span className={`text-[0.95rem] font-bold uppercase tracking-wide shrink-0 w-[3.2rem] ${WALL.muted}`}>{r.dayLabel}</span>
          <span className={`text-[1.05rem] font-semibold leading-tight truncate ${WALL.ink}`}>{r.summary}</span>
        </div>
      ))}
    </Widget>
  )
}
