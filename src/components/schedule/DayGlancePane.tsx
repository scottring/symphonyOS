import { useMemo } from 'react'
import { CalendarClock, Moon, Sparkles, Check } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import { WeatherChip } from './WeatherChip'

export interface DayGlancePaneProps {
  viewedDate: Date
  tasks: Task[]
  events: CalendarEvent[]
  familyMembers: FamilyMember[]
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.start_time ?? e.startTime
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function isAllDay(e: CalendarEvent): boolean {
  return e.all_day === true || e.allDay === true
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Resting state of the Today right rail: a calm, glanceable read on the day.
 *  Replaced by the selected item's detail when something is tapped (the rail
 *  "takes over"). Counts stay in the Today stats row; this surfaces what isn't
 *  already on screen — next event, family load, and what's left for tonight. */
export function DayGlancePane({ viewedDate, tasks, events, familyMembers }: DayGlancePaneProps) {
  const isToday = sameDay(viewedDate, new Date())

  // Incomplete tasks scheduled for the viewed day.
  const dayTasks = useMemo(
    () => tasks.filter(t => !t.completed && t.scheduledFor && sameDay(new Date(t.scheduledFor), viewedDate)),
    [tasks, viewedDate],
  )

  // Next upcoming timed event on the viewed day (skips all-day; "next" only if today).
  const nextEvent = useMemo(() => {
    const nowMs = new Date().getTime()
    const candidates = events
      .map(e => ({ e, start: eventStart(e) }))
      .filter((x): x is { e: CalendarEvent; start: Date } => x.start !== null && !isAllDay(x.e))
      .filter(x => sameDay(x.start, viewedDate) && (!isToday || x.start.getTime() >= nowMs))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    return candidates[0] ?? null
  }, [events, viewedDate, isToday])

  // Per-(core)-member open-task load for the day.
  const family = useMemo(() => {
    const core = familyMembers.filter(m => m.member_type === 'core')
    return core.map(m => {
      const count = dayTasks.filter(t =>
        (t.assignedToAll?.includes(m.id)) || t.assignedTo === m.id,
      ).length
      return { id: m.id, name: m.name, count }
    })
  }, [familyMembers, dayTasks])

  // What's left for tonight: incomplete tasks scheduled this evening (5pm+).
  const tonight = useMemo(
    () => dayTasks
      .filter(t => new Date(t.scheduledFor as Date).getHours() >= 17)
      .sort((a, b) => new Date(a.scheduledFor as Date).getTime() - new Date(b.scheduledFor as Date).getTime()),
    [dayTasks],
  )

  return (
    <div className="h-full overflow-y-auto px-5 py-5 bg-bg-base">
      {/* Persistent header — survives the takeover (date + weather) */}
      <div className="flex items-center justify-between gap-2 pb-4 mb-1 border-b border-neutral-200/60">
        <p className="font-display text-base text-neutral-800 leading-tight">
          {viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
        <WeatherChip />
      </div>

      {/* Next event */}
      <Section label="Next event">
        {nextEvent ? (
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-[15px] font-medium text-neutral-800 shrink-0">{fmtTime(nextEvent.start)}</span>
            <span className="text-[15px] text-neutral-600 truncate">{nextEvent.e.title}</span>
          </div>
        ) : (
          <Empty icon={CalendarClock} text={isToday ? 'Nothing left on the calendar' : 'No events'} />
        )}
      </Section>

      {/* Family */}
      {family.length > 0 && (
        <Section label="Family">
          <ul className="space-y-1.5">
            {family.map(m => (
              <li key={m.id} className="flex items-center justify-between text-[15px]">
                <span className="text-neutral-700">{m.name}</span>
                {m.count > 0 ? (
                  <span className="tabular-nums text-neutral-500">{m.count}</span>
                ) : (
                  <Check className="w-4 h-4 text-primary-500" aria-label="all clear" />
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Tonight */}
      <Section label="Tonight">
        {tonight.length > 0 ? (
          <ul className="space-y-1.5">
            {tonight.slice(0, 5).map(t => (
              <li key={t.id} className="text-[15px] text-neutral-600 truncate">{t.title}</li>
            ))}
            {tonight.length > 5 && (
              <li className="text-[13px] text-neutral-400">+{tonight.length - 5} more</li>
            )}
          </ul>
        ) : (
          <Empty icon={Moon} text="Nothing scheduled for tonight" />
        )}
      </Section>

      {/* Assistant — stubbed; wired to the proactive assistant in a later pass */}
      <div className="mt-6 pt-4 border-t border-neutral-200/60">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary-400" />
          <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Assistant</span>
        </div>
        <p className="text-[13px] text-neutral-400 leading-snug">
          Proactive suggestions will surface here.
        </p>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[14px] text-neutral-400">
      <Icon className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
