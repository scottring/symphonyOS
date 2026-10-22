import type { OptionStatus } from '@/types/choice'
import { CONTACT_KINDS, LOG_KIND_LABEL, type LogEntry, type LogKind, type PlannedEvent } from '@/types/goalLog'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Local calendar day, not UTC: an evening entry must not land on tomorrow. */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isAhead(on: string, now: Date): boolean {
  return on > localYmd(now)
}

/** Logging a contact moves Considering to Contacted; status never moves backward. */
export function statusAfterLog(status: OptionStatus, kind: LogKind): OptionStatus | null {
  return status === 'considering' && CONTACT_KINDS.has(kind) ? 'contacted' : null
}

export type LogLine = {
  key: string
  when: Date
  on: string
  time?: string
  kind: LogKind
  optionId?: string
  text: string
  userId?: string
  upcoming: boolean
  entryId?: string
  taskId?: string
}

function parseYmd(on: string, time?: string): Date {
  const [y, m, d] = on.split('-').map(Number)
  const [hh, mm] = time ? time.split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, hh, mm)
}

export function mergeLog(
  entries: readonly LogEntry[], planned: readonly PlannedEvent[],
): { upcoming: LogLine[]; done: LogLine[] } {
  const upcoming: LogLine[] = planned.filter((p) => !p.completed).map((p) => ({
    key: `t:${p.taskId}`, when: p.scheduledFor, on: localYmd(p.scheduledFor),
    time: p.allDay ? undefined : `${pad(p.scheduledFor.getHours())}:${pad(p.scheduledFor.getMinutes())}`,
    kind: p.kind, optionId: p.optionId, text: p.title, upcoming: true, taskId: p.taskId,
  }))
  upcoming.sort((a, b) => a.when.getTime() - b.when.getTime())

  const created = new Map<string, number>()
  const done: LogLine[] = entries.map((e) => {
    created.set(`e:${e.id}`, e.createdAt.getTime())
    return {
      key: `e:${e.id}`, when: parseYmd(e.on, e.time), on: e.on, time: e.time, kind: e.kind,
      optionId: e.optionId, text: e.summary, userId: e.userId, upcoming: false, entryId: e.id,
    }
  })
  for (const p of planned) {
    if (!p.completed) continue
    const when = p.completedAt ?? p.scheduledFor
    done.push({
      key: `t:${p.taskId}`, when, on: localYmd(when),
      time: p.allDay ? undefined : `${pad(when.getHours())}:${pad(when.getMinutes())}`,
      kind: p.kind, optionId: p.optionId, text: p.title, upcoming: false, taskId: p.taskId,
    })
  }
  done.sort((a, b) => b.when.getTime() - a.when.getTime() || (created.get(b.key) ?? 0) - (created.get(a.key) ?? 0))
  return { upcoming, done }
}

const monthDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`
/** "Oct 22" for a YYYY-MM-DD day. */
export const dayLabel = (on: string) => monthDay(parseYmd(on))
/** "Fri Oct 30" for a YYYY-MM-DD day. */
export const weekdayLabel = (on: string) => `${WEEKDAYS[parseYmd(on).getDay()]} ${dayLabel(on)}`
/** Stored HH:MM with the leading zero dropped, e.g. 09:05 -> 9:05, 14:30 stays. */
export const shortTime = (t: string) => t.replace(/^0/, '')

export function rowLine(
  log: { upcoming: LogLine[]; done: LogLine[] }, optionId: string,
): { next?: string; last?: string } | null {
  const nextLine = log.upcoming.find((l) => l.optionId === optionId)
  const lastLine = log.done.find((l) => l.optionId === optionId)
  const out: { next?: string; last?: string } = {}
  if (nextLine) {
    out.next = `${LOG_KIND_LABEL[nextLine.kind]} ${weekdayLabel(nextLine.on)}${nextLine.time ? `, ${shortTime(nextLine.time)}` : ''}`
  }
  if (lastLine) {
    let s = `${LOG_KIND_LABEL[lastLine.kind]} ${dayLabel(lastLine.on)}`
    if (!nextLine && lastLine.text.length <= 40) s += ` · “${lastLine.text}”`
    out.last = s
  }
  return out.next || out.last ? out : null
}
