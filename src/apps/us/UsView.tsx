// src/apps/us/UsView.tsx
//
// Phase 4 — the "Us" couple surface. A calm view of the marriage's shared world:
// this week together, what needs joint attention (the needs_discussion kernel),
// and who's carrying what. Distinct from the household wall by the scope TAG
// (couple/compound) — no scope_groups yet (Option A). Pure + testable.

import { CalendarDays, MessagesSquare, Users } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'

const evStart = (e: CalendarEvent) => e.startTime ?? e.start_time
const evAllDay = (e: CalendarEvent) => Boolean(e.allDay ?? e.all_day)

function isShared(t: Task): boolean {
  return t.scope === 'couple' || t.scope === 'compound'
}

interface UsViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  members: FamilyMember[]
  now: Date
  onSelectTask: (id: string) => void
}

const SECTION = 'flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-400 mb-3'

export function UsView({ tasks, events, members, now, onSelectTask }: UsViewProps) {
  const memberName = (id: string | null | undefined) =>
    (id && members.find((m) => m.id === id)?.name) || 'Unassigned'

  const shared = tasks.filter((t) => !t.completed && isShared(t))
  const needsUs = shared.filter((t) => t.needsDiscussion)

  // This week's calendar (today → +7d), in start order.
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEvents = events
    .filter((e) => { const r = evStart(e); if (!r) return false; const d = new Date(r); return d >= weekStart && d < weekEnd })
    .sort((a, b) => new Date(evStart(a)!).getTime() - new Date(evStart(b)!).getTime())

  // Who's got what — shared tasks grouped by assignee (first assignee wins).
  const byAssignee = new Map<string, { name: string; tasks: Task[] }>()
  for (const t of shared) {
    const id = (t.assignedToAll && t.assignedToAll[0]) || t.assignedTo || 'unassigned'
    const entry = byAssignee.get(id) ?? { name: memberName(id === 'unassigned' ? null : id), tasks: [] }
    entry.tasks.push(t)
    byAssignee.set(id, entry)
  }
  const delegation = [...byAssignee.values()].sort((a, b) => b.tasks.length - a.tasks.length)

  const dayLabel = (raw: string) => new Date(raw).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const timeLabel = (e: CalendarEvent) => {
    const r = evStart(e); if (!r || evAllDay(e)) return 'All day'
    return new Date(r).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] w-full mx-auto px-4 py-6 md:px-8 md:py-8 space-y-8">
        <header>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Us</h1>
          <p className="text-sm text-neutral-500 mt-1">The two of you — shared this week, what needs you, who's got what.</p>
        </header>

        {/* This week, together */}
        <section>
          <h2 className={SECTION}><CalendarDays className="w-3.5 h-3.5" /> This week, together</h2>
          {weekEvents.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing shared on the calendar this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {weekEvents.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm text-neutral-700">
                  <span className="w-28 shrink-0 text-neutral-500">{dayLabel(evStart(e)!)}</span>
                  <span className="w-20 shrink-0 text-neutral-400 tabular-nums">{timeLabel(e)}</span>
                  <span className="truncate">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Needs us */}
        <section>
          <h2 className={SECTION}><MessagesSquare className="w-3.5 h-3.5" /> Needs us ({needsUs.length})</h2>
          {needsUs.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing flagged for the two of you to discuss.</p>
          ) : (
            <ul className="space-y-2">
              {needsUs.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onSelectTask(t.id)}
                    className="w-full flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2 text-left hover:bg-amber-50 transition-colors">
                    <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{memberName((t.assignedToAll && t.assignedToAll[0]) || t.assignedTo)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Who's got what */}
        <section>
          <h2 className={SECTION}><Users className="w-3.5 h-3.5" /> Who's got what</h2>
          {delegation.length === 0 ? (
            <p className="text-sm text-neutral-400">No shared tasks yet. Tag a task "couple" or "family" to see it here.</p>
          ) : (
            <div className="space-y-3">
              {delegation.map((d) => (
                <div key={d.name} className="rounded-xl border border-neutral-100 bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-neutral-700">{d.name}</span>
                    <span className="text-xs text-neutral-400">{d.tasks.length}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {d.tasks.slice(0, 4).map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => onSelectTask(t.id)}
                          className="text-sm text-neutral-600 hover:text-primary-700 truncate text-left">
                          {t.title}
                        </button>
                      </li>
                    ))}
                    {d.tasks.length > 4 && <li className="text-xs text-neutral-400">+{d.tasks.length - 4} more</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
