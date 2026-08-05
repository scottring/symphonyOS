import { Video, CircleSlash } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { ContextPicker } from '@/components/triage'
import { AssigneeDropdown, MultiAssigneeDropdown } from '@/components/family'
import { RescheduleButton } from './RescheduleButton'
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'

interface RowActionRailProps {
  item: TimelineItem
  variant: 'full' | 'minimal'
  /** Opens the full detail panel — the '...' menu's escape hatch. */
  onSelect: () => void
  onContextChange?: (context: TaskContext | undefined) => void
  onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void
  onAssign?: (memberId: string | null) => void
  onAssignAll?: (memberIds: string[]) => void
  familyMembers: FamilyMember[]
  assignedTo?: string | null
  assignedToAll: string[]
  /** Events the system suggests promoting — tints the overflow trigger amber. */
  isSuggestedPromotion?: boolean
}

/** An icon cell — 28px, on every row, always. */
const SLOT = 'w-7 h-7 flex items-center justify-center'

/**
 * The assignee cell is wider than an icon cell because the avatar stack grows
 * with the number of people: MultiAssigneeDropdown draws up to four 24px
 * circles at -8px overlap, so 24px for one and 72px for four. Reserving the
 * maximum is what stops that growth shoving its neighbours around as the
 * assignees change — the exact bug this rail exists to kill. Because EVERY
 * cell is a reserved fixed width, the slot order below is free: it is a
 * reading decision, not a layout constraint.
 *
 * Right-aligned inside the cell (not centred) so the stack sits flush against
 * the context icon that follows it. The reserve then spends itself as
 * whitespace on the cell's LEFT, where it merges with the title column's own
 * slack and reads as the gap before the rail rather than a hole inside it.
 */
const WHO_SLOT = 'w-[4.5rem] h-7 flex items-center justify-end'

// Start Meeting button - uses context to avoid prop drilling
function StartMeetingButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const onStartMeeting = ctx.onStartMeeting

  if (!onStartMeeting) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const eventId = item.id.replace('event-', '')
    onStartMeeting(
      eventId,
      item.title,
      item.attendees || [],
      item.startTime ?? undefined,
      item.endTime ?? undefined
    )
  }

  return (
    <button
      onClick={handleClick}
      className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
      title="Start meeting"
      aria-label="Start meeting"
    >
      <Video className="w-4 h-4" />
    </button>
  )
}

// Skip-today button — routines only. Surfaces the "Skip today" action that
// otherwise hides in the '...' menu, so skipping a single instance is one tap.
// Reads onSkipRoutine from context (same handler the menu uses; it fires the
// undo toast) to avoid prop-drilling. The instance is skipped for the viewed
// day only; the routine returns on its next scheduled occurrence.
function SkipRoutineButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const onSkipRoutine = ctx.onSkipRoutine

  if (!onSkipRoutine) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSkipRoutine(item.id.replace('routine-', ''))
  }

  return (
    <button
      onClick={handleClick}
      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
      title="Skip today"
      aria-label="Skip today"
    >
      <CircleSlash className="w-4 h-4" />
    </button>
  )
}

/**
 * The row's trailing controls, as a FIXED four-cell rail.
 *
 * Every cell is 28px and every gap is 4px on every row, whatever the row's
 * type — empty cells render as spacers rather than collapsing. That is the
 * whole point. These controls used to be six conditional flex siblings, so a
 * task showed six, an event five, a routine three, and because the title
 * column absorbed the slack, only the last one ever formed a column. Nothing
 * down the page lined up. Reserve the shape and the columns hold.
 *
 * Slot order is fixed: assignee | context | verb | overflow. Exactly one verb
 * exists per row type — a task reschedules, a routine skips, a timed event
 * starts — so they share one slot without ever competing for it. That is what
 * lets the rail be four cells wide instead of six.
 *
 * The order reads WHO -> WHAT KIND -> DO IT -> MORE: identity and
 * classification first, because "is this mine?" is the question you ask of a
 * whole list at once and it wants a column near the text; the two action
 * controls sit outboard, where a mis-aimed tap is least costly. Any order is
 * equally stable — every cell is a reserved width — so this is chosen for
 * reading, not for layout.
 *
 * The rail carries ACTIONS only. State (flagged for discussion, subtask
 * counts, project) belongs with the title, because a strip that means two
 * things can't have one shape.
 */
export function RowActionRail({
  item,
  variant,
  onSelect,
  onContextChange,
  onUpdateDiscussion,
  onAssign,
  onAssignAll,
  familyMembers,
  assignedTo,
  assignedToAll,
  isSuggestedPromotion,
}: RowActionRailProps) {
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isLive = !item.completed && !item.skipped

  const verb =
    isTask && !item.completed && variant !== 'minimal' ? <RescheduleButton item={item} />
    : isRoutine && isLive ? <SkipRoutineButton item={item} />
    : isEvent && isLive && !item.allDay ? <StartMeetingButton item={item} />
    : null

  const menu = variant !== 'minimal' && (isTask || isRoutine || isEvent)
    ? (
      <ScheduleItemActionsMenu
        item={item}
        onOpenDetail={onSelect}
        onUpdateDiscussion={onUpdateDiscussion}
        isSuggestedPromotion={isSuggestedPromotion}
      />
    )
    : null

  // Context stays hover-revealed while unset (the tag-needs-context nudge).
  // With fixed cells that no longer shifts anything, so the behaviour is
  // preserved exactly as it was.
  const context = onContextChange ? (
    <div
      className={
        isEvent || item.context
          ? 'transition-opacity'
          : 'opacity-0 group-hover:opacity-100 transition-opacity'
      }
      onClick={(e) => e.stopPropagation()}
    >
      <ContextPicker
        size="sm"
        value={item.context ?? undefined}
        onChange={onContextChange}
      />
    </div>
  ) : null

  const who = familyMembers.length > 0 && onAssignAll ? (
    <div onClick={(e) => e.stopPropagation()}>
      <MultiAssigneeDropdown
        members={familyMembers}
        selectedIds={assignedToAll}
        onSelect={onAssignAll}
        size="sm"
        label={isEvent ? "Who's attending?" : "Who's responsible?"}
      />
    </div>
  ) : familyMembers.length > 0 && onAssign ? (
    <div onClick={(e) => e.stopPropagation()}>
      <AssigneeDropdown
        members={familyMembers}
        selectedId={assignedTo}
        onSelect={onAssign}
        size="sm"
      />
    </div>
  ) : null

  // assignee | context | verb | overflow — see the slot-order note above.
  const cells: Array<{ node: React.ReactNode; className: string }> = [
    { node: who, className: WHO_SLOT },
    { node: context, className: SLOT },
    { node: verb, className: SLOT },
    { node: menu, className: SLOT },
  ]

  return (
    <div className="shrink-0 flex items-center gap-1">
      {cells.map((cell, i) => (
        <div key={i} data-rail-slot className={cell.className}>
          {cell.node}
        </div>
      ))}
    </div>
  )
}
