// src/components/schedule/TodayComingUp.tsx
//
// "Coming up", under Today's Schedule: the next few dated tasks after today
// (walkthrough 2026-10-02, #28: "today's tasks only show on Today if today is
// that date, which can be a bit disconcerting"). Quiet — a few lines and a
// door to their week; silent when there is nothing. Rows are the caller's
// already-filtered tasks (life areas + people), never an unfiltered list.
import { useNavigate } from 'react-router-dom'
import type { ForwardItem } from '@/lib/today/forwardLook'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'

const MAX_ROWS = 5

/** "Mon, Oct 5 · 11:45 AM" — or "Mon, Oct 5" for an all-day row. */
export function comingUpWhen(item: Pick<ForwardItem, 'when' | 'isAllDay'>): string {
  const day = item.when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return item.isAllDay ? day : `${day} · ${item.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export function TodayComingUp({ items, onOpen }: { items: readonly ForwardItem[]; onOpen: (id: string) => void }) {
  const navigate = useNavigate()
  const shown = items.slice(0, MAX_ROWS)
  if (!shown.length) return null
  const firstWeek = weekStartAnchor(shown[0].when, readCadenceConfig().weekStartsOn)
  return (
    <section aria-labelledby="today-coming-up-heading" className="daybook-journal-section today-coming-up">
      <div className="daybook-journal-heading">
        <h2 id="today-coming-up-heading">Coming up</h2>
      </div>
      <ul className="pv2-list mt-1">
        {shown.map((item, i) => (
          <li key={item.id ?? `${item.title}-${i}`} className="pv2-rrow pv2-rrow-sans">
            <button type="button" className="min-w-0 text-left text-neutral-600 hover:text-neutral-900" disabled={!item.id} onClick={() => item.id && onOpen(item.id)}>
              <span className="tabular-nums text-neutral-500">{comingUpWhen(item)}</span>
              <span className="text-neutral-400"> · </span>
              {item.title}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="pv2-link mt-2" onClick={() => navigate(`/week?start=${localYmd(firstWeek)}`)}>Open week →</button>
    </section>
  )
}
