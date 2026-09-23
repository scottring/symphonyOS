// Where a capture is about to go, and who will see it — said BEFORE Enter.
//
// The first real-data walkthrough (Scott, 2026-09-20): a ⌘K task with no chip
// landed Unsorted and vanished from the Family view; a ⌘K event with no chip
// landed on the primary calendar (mapped Personal) and vanished too. Two
// silent defaults for the same empty choice. The modal now states the
// destination and the audience in plain words, and the confirmation names
// them again with a way to get there.
import type { TaskContext } from '@/types/task'
import { layerOf, type Layer } from '@/lib/domains'

export type CaptureKind = 'note' | 'event' | 'routine' | 'dated' | 'inbox'

/** "only you" / "shared with household" — the audience a life area implies.
 *  Work and Personal are private; Family is shared. Unsorted is private. */
export function audienceLabel(context: TaskContext | null | undefined): string {
  return context === 'family' ? 'shared with household' : 'only you'
}

export function contextLabel(context: TaskContext | null | undefined): string {
  if (!context) return 'Unsorted'
  return context.charAt(0).toUpperCase() + context.slice(1)
}

/** The line under the ⌘K box. `calendarName` is the calendar an event would
 *  be written to, when the host knows it. */
export function destinationLine(opts: {
  kind: CaptureKind
  context: TaskContext | null | undefined
  when?: Date | null
  calendarName?: string | null
}): string {
  const { kind, context, when, calendarName } = opts
  const audience = `${contextLabel(context)} · ${audienceLabel(context)}`
  switch (kind) {
    case 'note': return '→ Notes'
    case 'event': return `→ ${calendarName ?? 'your primary calendar'}`
    case 'routine': return `→ Routines · ${audience}`
    case 'dated': return `→ ${when ? when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'a day'} · ${audience}`
    default: return `→ Inbox · ${audience}`
  }
}

/** Will the current view hide what was just made? The rule for tasks is the
 *  layer rule; the caller supplies the resolved context. */
export function hiddenByView(context: TaskContext | null | undefined, layers: ReadonlySet<Layer>): boolean {
  return !layers.has(layerOf(context))
}

/** The confirmation after Enter: what was made, where it went, and one link
 *  there. The destination line already promises this before Enter; until walk
 *  finding S1-07 nothing delivered it, so a ⌘K capture wrote correctly and
 *  said nothing — Scott, mid-walk: "perhaps we should add a hyperlink to 'go
 *  to inbox' after items have been entered in cmd-k". */
export interface CaptureConfirmation {
  message: string
  /** Where the thing now lives. */
  route: string
  linkLabel: string
}

export function captureConfirmation(opts: {
  kind: CaptureKind
  context: TaskContext | null | undefined
  when?: Date | null
  isToday?: boolean
}): CaptureConfirmation {
  const { kind, context, when, isToday } = opts
  switch (kind) {
    case 'note':
      return { message: 'Added to Notes', route: '/notes', linkLabel: 'Go to notes' }
    case 'routine':
      return { message: 'Added to Routines', route: '/routines', linkLabel: 'Go to routines' }
    case 'event':
    case 'dated': {
      const day = when
        ? when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : 'a day'
      return isToday
        ? { message: 'Added to Today', route: '/today', linkLabel: 'Go to today' }
        : { message: `Added to ${day}`, route: '/week', linkLabel: 'Go to week' }
    }
    default:
      return {
        message: `Added to Inbox · ${contextLabel(context)} · ${audienceLabel(context)}`,
        route: '/inbox',
        linkLabel: 'Go to inbox',
      }
  }
}
