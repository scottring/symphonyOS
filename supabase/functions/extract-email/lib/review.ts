import type { EmailExtraction, EmailRepeat, Member, Who } from './types.ts'
import { matchMembers } from './members.ts'
import { addDays } from './dates.ts'

export interface SchoolMailItem {
  id: string
  kind: 'event' | 'task' | 'homework' | 'routine' | 'notice'
  title: string
  date: string | null
  time: string | null
  memberIds: string[]
  quote: string
  detail?: string
  location?: string
  repeat?: EmailRepeat
  showOnTimeline?: boolean
  warning?: string
}
export interface SchoolMailProposal {
  items: SchoolMailItem[]
  gaps: string[]
  confirmation?: boolean
}

export function isForwardingConfirmation(
  from: string,
  subject: string,
): boolean {
  return /(?:^|<)forwarding-noreply@google\.com>?$/i.test(from.trim()) &&
    /forwarding confirmation/i.test(subject)
}

/** Proposals only. Dates and people remain visible and editable before Save. */
export function buildSchoolMailReview(
  extraction: EmailExtraction,
  members: Member[],
  today: string,
): SchoolMailProposal {
  const items: SchoolMailItem[] = []
  const gaps = extraction.gaps.map((g) => g.note)
  const audience = (who: Who | undefined) => {
    const match = who
      ? matchMembers(who, members)
      : { matched: [], unmatched: [] }
    return {
      memberIds: match.matched.map((m) => m.id),
      ...(match.unmatched.length
        ? { warning: `Check who this is for: ${match.unmatched.join(', ')}` }
        : {}),
    }
  }
  const datedWarning = (date: string | undefined, confidence: number) =>
    date && date < today
      ? 'This date is in the past. Check it before saving.'
      : confidence < 0.75
      ? 'Please check this suggestion against the email.'
      : undefined
  for (const [e, event] of extraction.events.entries()) {
    items.push({
      id: `event-${e}`,
      kind: 'event',
      title: event.title,
      date: event.date,
      time: event.time ?? null,
      warning: datedWarning(event.date, event.confidence),
      ...audience(event.for),
      quote: event.source_quote,
      location: event.location,
    })
    for (const [n, item] of event.items.entries()) {
      const date = item.needed === 'night_before'
        ? addDays(event.date, -1)
        : item.needed === 'day_of'
        ? event.date
        : item.needed
      items.push({
        id: `event-${e}-item-${n}`,
        kind: item.kind === 'homework' ? 'homework' : 'task',
        title: item.text,
        date,
        time: null,
        warning: datedWarning(date, event.confidence),
        ...audience(item.for),
        quote: event.source_quote,
        detail: [item.detail, `For ${event.title}`].filter(Boolean).join('\n'),
      })
    }
  }
  for (const [n, todo] of extraction.todos.entries()) {
    items.push({
      id: `todo-${n}`,
      kind: todo.repeat
        ? 'routine'
        : todo.kind === 'homework'
        ? 'homework'
        : 'task',
      title: todo.title,
      date: todo.repeat ? null : todo.due ?? null,
      time: null,
      warning: datedWarning(todo.due, todo.confidence),
      ...audience(todo.for),
      quote: todo.source_quote,
      detail: todo.detail,
      repeat: todo.repeat,
      ...(todo.repeat ? { showOnTimeline: true } : {}),
    })
  }
  for (const [n, info] of extraction.good_to_know.entries()) {
    items.push({
      id: `info-${n}`,
      kind: 'notice',
      title: info.text,
      date: null,
      time: null,
      ...audience(info.for),
      quote: '',
    })
  }
  if (items.length > 80) {
    gaps.push(
      'This email contains more than 80 suggestions. Review the original for the remaining information.',
    )
  }
  return { items: items.slice(0, 80), gaps }
}
