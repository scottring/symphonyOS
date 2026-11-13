// src/components/schedule/TodayComingUp.tsx
//
// "Coming up", under Today's Schedule: the next few dated tasks after today
// (walkthrough 2026-10-02, #28: "today's tasks only show on Today if today is
// that date, which can be a bit disconcerting"). Quiet — a few lines and a
// door to their week; silent when there is nothing. Rows are the caller's
// already-filtered tasks (life areas + people), never an unfiltered list.
//
// Calmer (Scott, 2026-11-13): the same thing twice on a day shows once; the
// first two days are spelled out, each later day folds to one line
// ("Thu 19 · 2 things") that opens in place; dates read "Tue 17"; each row
// wears its kind's icon.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { ForwardItem } from '@/lib/today/forwardLook'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { displayTitle } from '@/lib/today/displayTitle'
import { KindIcon } from './KindIcon'

const MAX_ROWS = 8
/** Days spelled out before the rest fold. */
const OPEN_DAYS = 2

/** "Mon, Oct 5 · 11:45 AM" — or "Mon, Oct 5" for an all-day row. */
export function comingUpWhen(item: Pick<ForwardItem, 'when' | 'isAllDay'>): string {
  const day = item.when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return item.isAllDay ? day : `${day} · ${item.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** "Tue 17". */
function shortDay(d: Date): string {
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
}

/** The rows grouped by day, a repeated title on the same day shown once. */
export function comingUpDays(items: readonly ForwardItem[]): { key: string; when: Date; items: ForwardItem[] }[] {
  const days: { key: string; when: Date; items: ForwardItem[] }[] = []
  for (const item of items) {
    const key = localYmd(item.when)
    let day = days.find((d) => d.key === key)
    if (!day) { day = { key, when: item.when, items: [] }; days.push(day) }
    const t = displayTitle(item.title).trim().toLowerCase()
    if (!day.items.some((i) => displayTitle(i.title).trim().toLowerCase() === t)) day.items.push(item)
  }
  return days
}

function Row({ item, onOpen }: { item: ForwardItem; onOpen: (id: string) => void }) {
  return (
    <li className="today-cu-row">
      <span className="today-cu-icon" aria-hidden="true"><KindIcon title={item.title} size={16} /></span>
      <button type="button" className="min-w-0 text-left text-neutral-700 hover:text-neutral-900" disabled={!item.id} onClick={() => item.id && onOpen(item.id)}>
        {displayTitle(item.title)}
        {!item.isAllDay && <span className="text-neutral-500"> · {item.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '')}</span>}
      </button>
    </li>
  )
}

export function TodayComingUp({ items, onOpen }: { items: readonly ForwardItem[]; onOpen: (id: string) => void }) {
  const navigate = useNavigate()
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const days = comingUpDays(items.slice(0, MAX_ROWS))
  if (!days.length) return null
  const firstWeek = weekStartAnchor(days[0].when, readCadenceConfig().weekStartsOn)
  return (
    <section aria-labelledby="today-coming-up-heading" className="daybook-journal-section today-coming-up">
      <div className="daybook-journal-heading">
        <h2 id="today-coming-up-heading">Coming up</h2>
      </div>
      <div className="today-cu mt-1">
        {days.map((day, i) => {
          const open = i < OPEN_DAYS || opened.has(day.key)
          return (
            <div key={day.key} className="today-cu-day">
              {open ? (
                <>
                  <span className="today-cu-date tabular-nums">{shortDay(day.when)}</span>
                  <ul className="today-cu-list">{day.items.map((item, j) => <Row key={item.id ?? `${item.title}-${j}`} item={item} onOpen={onOpen} />)}</ul>
                </>
              ) : (
                <button type="button" className="today-cu-fold" aria-expanded={false}
                  onClick={() => setOpened((s) => new Set(s).add(day.key))}>
                  <ChevronRight size={15} aria-hidden="true" />
                  <span className="tabular-nums">{shortDay(day.when)}</span>
                  <span> · {day.items.length === 1 ? displayTitle(day.items[0].title) : `${day.items.length} things`}</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" className="pv2-link mt-2" onClick={() => navigate(`/week?start=${localYmd(firstWeek)}`)}>Open week →</button>
    </section>
  )
}
