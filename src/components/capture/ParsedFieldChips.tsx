import type { EffectiveParsed } from '@/hooks/useQuickParse'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AppliedDomainChip } from './AppliedDomainChip'

// The project chip is gone (2026-09-02 — see the note in Sidebar.tsx): Projects
// are hidden from the product, so capture no longer offers to file into one.
// useQuickParse still parses `#name` and still sets projectId — the model is
// untouched; only the chip that advertised it is.
interface Props {
  parsed: EffectiveParsed
  contactName: string | null
  onClearDate: () => void
  onClearContact: () => void
  onClearCategory: () => void
  onClearContext: () => void
  onClearDuration?: () => void
}

// "45 min" / "1 hr" / "1 hr 30 min" — matches how the schedule rows label durations.
function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

// Format date and time for display — preserved verbatim from QuickCapture.
function formatDate(date: Date) {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isToday = date.toDateString() === today.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  // Check if time is set (not midnight exactly)
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
  const timeStr = hasTime
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  let dateStr: string
  if (isToday) {
    dateStr = 'Today'
  } else if (isTomorrow) {
    dateStr = 'Tomorrow'
  } else {
    dateStr = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return hasTime ? `${dateStr} at ${timeStr}` : dateStr
}

/**
 * Renders the parsed-field chips (date/time, contact, category,
 * applied context) with their × clear affordances. Behaviorally equivalent to
 * QuickCapture's original chip rendering, with aria-labels added to the clear (×) buttons
 * for accessibility. Extracted to support regression testing without markup changes.
 */
export function ParsedFieldChips({
  parsed,
  contactName,
  onClearDate,
  onClearContact,
  onClearCategory,
  onClearContext,
  onClearDuration,
}: Props) {
  if (
    !parsed.dueDate &&
    !parsed.contactId &&
    !parsed.category &&
    !parsed.context &&
    !parsed.durationMinutes
  ) {
    return null
  }

  return (
    <>
      {/* Date/time chip — only task-related fields, and only if NOT a note */}
      {!parsed.isNote && parsed.dueDate && (
        <div className="flex items-center gap-2">
          <span className="text-base">
            {parsed.dueDate.getHours() !== 0 || parsed.dueDate.getMinutes() !== 0
              ? <ConceptIcon name="time" size={18} decorative />
              : <ConceptIcon name="when" size={18} decorative />}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
            {formatDate(parsed.dueDate)}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearDate}
              aria-label="Clear date"
              className="ml-1 text-primary-400 hover:text-primary-600"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Duration chip */}
      {!parsed.isNote && parsed.durationMinutes !== undefined && parsed.durationMinutes > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-base"><ConceptIcon name="time" size={18} decorative /></span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
            {formatDuration(parsed.durationMinutes)}
            {onClearDuration && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClearDuration}
                aria-label="Clear duration"
                className="ml-1 text-primary-400 hover:text-primary-600"
              >
                ×
              </button>
            )}
          </span>
        </div>
      )}

      {/* Contact chip */}
      {!parsed.isNote && parsed.contactId && contactName && (
        <div className="flex items-center gap-2">
          <span className="text-base"><ConceptIcon name="person" size={18} decorative /></span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-100">
            {contactName}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearContact}
              aria-label="Clear contact"
              className="ml-1 text-amber-400 hover:text-amber-600"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Category chip - only show for non-task categories */}
      {!parsed.isNote && parsed.category && parsed.category !== 'task' && (
        <div className="flex items-center gap-2">
          <span className="text-base">
            {parsed.category === 'event' && <ConceptIcon name="when" size={18} decorative />}
            {parsed.category === 'activity' && <ConceptIcon name="activity" size={18} decorative />}
            {parsed.category === 'chore' && <ConceptIcon name="chore" size={18} decorative />}
            {parsed.category === 'errand' && <ConceptIcon name="errand" size={18} decorative />}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-100">
            {parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1)}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearCategory}
              aria-label="Clear category"
              className="ml-1 text-purple-400 hover:text-purple-600"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Applied context chip - show when context has been applied, whether by
          the domain picker or a typed #work/#family/#personal token. Colours
          come from DOMAINS so this reads as the filled-in state of the picker
          rather than a separate palette. */}
      {!parsed.isNote && parsed.context && (
        <div className="flex items-center gap-2">
          <span className="text-base"><ConceptIcon name="context" size={18} decorative /></span>
          <AppliedDomainChip context={parsed.context} onClear={onClearContext} />
        </div>
      )}
    </>
  )
}
