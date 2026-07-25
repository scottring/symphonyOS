// src/components/schedule/PrintableDayList.tsx
//
// The day as a compact list, for printing (or just for reading without the
// app's chrome). Today currently renders ~57 rows across cards, chips, avatars
// and hover controls — a real schedule buried in interface. This is the same
// content with everything decorative removed: one line per item, grouped by
// the same day sections, nothing you can click.
//
// Screen-hidden by default (see `.print-only` in index.css) and revealed by the
// print stylesheet, so it costs nothing until you ask for it.
//
// Deliberately open items only: a printed list is a to-do list, and carrying
// the day's completed rows onto paper defeats the point. The done count is
// stated once at the top instead.
import type { Task } from '@/types/task'
import { type TimelineItem, taskToTimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'

interface PrintableDayListProps {
  date: Date
  sectionsOrder: readonly DaySection[]
  grouped: Partial<Record<DaySection, TimelineItem[]>>
  /** Still-open items carried from earlier days, printed under their own head.
   *  Raw tasks — the day sections arrive as timeline items, overdue does not. */
  overdue?: Task[]
}

function timeLabel(item: TimelineItem): string {
  if (!item.startTime) return ''
  const d = new Date(item.startTime)
  if (Number.isNaN(d.getTime())) return ''
  // An all-day item has no meaningful clock time; midnight is the marker.
  if (d.getHours() === 0 && d.getMinutes() === 0) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function Row({ item }: { item: TimelineItem }) {
  const time = timeLabel(item)
  return (
    <li className="day-print-row">
      <span className="day-print-box" aria-hidden="true">☐</span>
      <span className="day-print-time">{time}</span>
      <span className="day-print-title">{item.title}</span>
    </li>
  )
}

export function PrintableDayList({ date, sectionsOrder, grouped, overdue = [] }: PrintableDayListProps) {
  const isOpen = (i: TimelineItem) => !i.completed && !i.skipped
  const sections = sectionsOrder
    .map((section) => ({ section, items: (grouped[section] ?? []).filter(isOpen) }))
    .filter(({ items }) => items.length > 0)

  const openOverdue = overdue.map(taskToTimelineItem).filter(isOpen)
  const total =
    sections.reduce((n, s) => n + s.items.length, 0) + openOverdue.length
  const done = sectionsOrder.reduce(
    (n, s) => n + (grouped[s] ?? []).filter((i) => i.completed).length,
    0,
  )

  return (
    <div className="print-only day-print" data-testid="printable-day-list">
      <header className="day-print-head">
        <h1>{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h1>
        <p>
          {total} to do{done > 0 ? ` · ${done} already done` : ''}
        </p>
      </header>

      {total === 0 ? (
        <p className="day-print-empty">Nothing left on this day.</p>
      ) : (
        <>
          {openOverdue.length > 0 && (
            <section>
              <h2>Carried over</h2>
              <ul>{openOverdue.map((i) => <Row key={i.id} item={i} />)}</ul>
            </section>
          )}
          {sections.map(({ section, items }) => (
            <section key={section}>
              <h2>{daySectionMeta(section).label}</h2>
              <ul>{items.map((i) => <Row key={i.id} item={i} />)}</ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
