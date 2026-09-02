import { memo, useState, useRef, useEffect } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { Task, TaskContext } from '@/types/task'
import { formatTimeLong, formatTimeRangeLong, inferMealTime } from '@/lib/timeUtils'
import { isSameDay } from '@/lib/dateUtils'
import { SchedulePopover, type ScheduleContextItem } from '@/components/triage'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { AssigneeDropdown, MultiAssigneeDropdown } from '@/components/family'
import { Video, Check, Pencil, Hourglass, ListChecks, ChevronUp, ChevronDown, MessageCircle, AlertCircle, Mail } from 'lucide-react'
import { ScheduleItemItems } from './ScheduleItemItems'
import { RowActionRail } from './RowActionRail'
import { useMobile } from '@/hooks/useMobile'
import { TaskCheckbox } from './TaskCheckbox'
import { ExpandingPanel } from './ExpandingPanel'
import { MobileTypeTile } from './MobileTypeTile'
import { DOMAIN_COLORS } from '@/lib/domainColors'
import { rowSubtitle } from '@/lib/rowSubtitle'
import { TimelineSpine } from './TimelineSpine'
import { locationLink } from '@/lib/locationLink'

// Nordic Journal calendar icon - minimal, elegant design
// Uses the event's context color (Work/Family/Personal) or falls back to primary teal-forest
function CalendarIcon({
  context,
  completed
}: {
  context?: 'work' | 'family' | 'personal' | null
  completed?: boolean
}) {
  // Primary forest-teal from design system: hsl(168 45% 30%) ≈ #2a6b5e
  const primaryColor = '#2a6b5e'
  const primaryLight = '#e8f4f1' // ~primary-50
  const completedColor = '#2a6b5e'

  // Context color mapping - matches domain switcher
  const contextColorMap = {
    work: 'rgb(37 99 235)',      // Blue-600
    family: 'rgb(217 119 6)',    // Amber-600
    personal: 'rgb(147 51 234)', // Purple-600
  }

  // Use context color if provided, otherwise use primary
  const accentColor = context ? contextColorMap[context] : primaryColor

  return (
    <div className="w-5 h-5 relative" title="Calendar event">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Calendar outline - clean rounded rectangle */}
        <rect
          x="2.5"
          y="4"
          width="15"
          height="13"
          rx="2"
          fill={completed ? completedColor : primaryLight}
          stroke={completed ? completedColor : primaryColor}
          strokeWidth="1.5"
          className="transition-colors"
        />
        {/* Calendar header line */}
        <line
          x1="2.5"
          y1="7.5"
          x2="17.5"
          y2="7.5"
          stroke={completed ? primaryLight : primaryColor}
          strokeWidth="1.5"
          className="transition-colors"
        />
        {/* Small color dot showing the context color */}
        {!completed && context && (
          <circle
            cx="10"
            cy="12"
            r="2.5"
            fill={accentColor}
          />
        )}
        {/* Checkmark when completed */}
        {completed && (
          <path
            d="M6.5 11.5L9 14L13.5 9.5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  )
}

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  // Bulk multi-select (Today): a hover-revealed checkbox at the row's left edge.
  // `bulkSelectable` enables it (task rows only); `showBulkAffordance` keeps it
  // visible once any selection exists; toggling never opens the detail panel.
  bulkSelectable?: boolean
  bulkSelected?: boolean
  showBulkAffordance?: boolean
  onToggleBulkSelect?: () => void
  onSelect: () => void
  onToggleComplete: () => void
  /** Completes ONE per-person item under the block. Subtasks are tasks, so
   *  callers pass the same task-completion handler the parent row uses. */
  onToggleSubtask?: (subtaskId: string) => void
  onToggleWaiting?: () => void
  onPush?: (target: Date | 'week' | 'month' | 'quarter') => void
  onSchedule?: (date: Date, isAllDay: boolean) => void
  onSkip?: () => void
  contactName?: string
  /**
   * Projects are hidden from the product (2026-09-02, see Sidebar.tsx) so the
   * row no longer draws either of these. They stay on the props because the
   * data and every caller still carry them — hide the noun, keep the model.
   */
  projectName?: string
  projectId?: string
  parentTaskName?: string
  parentTaskId?: string
  onOpenParentTask?: (taskId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
  // Multi-member assignment (for events)
  assignedToAll?: string[]
  onAssignAll?: (memberIds: string[]) => void
  // Context assignment (work/family/personal)
  onContextChange?: (context: TaskContext | undefined) => void
  // Needs-discussion flag — task variant only
  onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void
  // Overdue styling
  isOverdue?: boolean
  overdueLabel?: string
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Panel state (for smart close behavior)
  panelOpen?: boolean
  onClosePanel?: () => void
  // Coaching indicator
  hasCoaching?: boolean
  // Visual weight variant
  variant?: 'full' | 'minimal'
  // Hide time label (for same-time grouping) — preserves column space
  hideTime?: boolean
  /** Draw the timeline spine reaching UP from this row's marker to the row above. */
  spineAbove?: boolean
  /** Draw the timeline spine reaching DOWN from this row's marker to the row below. */
  spineBelow?: boolean
  /**
   * Rendered directly BENEATH the title, inside the title's own column — so it
   * left-aligns with the title text automatically, whatever the row's leading
   * columns are (time label, checkbox, date gutter).
   *
   * Used for the anchored suggestion chip. It previously rendered as a block
   * sibling of the whole row at the card's left edge, which put it under the
   * leading columns and made it read as belonging to the NEXT task down.
   * Aligning by structure rather than a hardcoded margin is deliberate: the old
   * `ml-[6.5rem]` default was tuned for one layout and was wrong everywhere else.
   */
  belowTitleAccessory?: React.ReactNode
}

// Warm muted color tokens for overdue styling
const overdueColors = {
  warning50: 'hsl(38 50% 96%)',
  warning500: 'hsl(35 45% 55%)',
  warning600: 'hsl(32 40% 52%)',
}

// Domain context colors - shared utility (kept for future use)
const _contextColors: Record<string, { dot: string; bg: string }> = DOMAIN_COLORS

export const ScheduleItem = memo(function ScheduleItem({
  item,
  selected,
  bulkSelectable,
  bulkSelected,
  showBulkAffordance,
  onToggleBulkSelect,
  onSelect,
  onToggleComplete,
  onToggleSubtask,
  onToggleWaiting,
  onPush,
  onSchedule,
  contactName,
  parentTaskName,
  parentTaskId,
  onOpenParentTask,
  familyMembers = [],
  assignedTo,
  onAssign,
  assignedToAll = [],
  onAssignAll,
  onContextChange,
  onUpdateDiscussion,
  isOverdue,
  overdueLabel,
  getScheduleItemsForDate,
  panelOpen,
  onClosePanel,
  hasCoaching,
  variant = 'full',
  hideTime,
  spineAbove,
  spineBelow,
  belowTitleAccessory,
}: ScheduleItemProps) {
  const isMobile = useMobile()
  // Needed-today mark: STATE, so it lives with the title chips. The '...' menu
  // (ScheduleItemActionsMenu) sets it via the same context handler. A mark
  // expires by ceasing to match the VIEWED day (src/lib/today/neededToday.ts),
  // not the real calendar day — nothing ever clears `neededOn` — so compare
  // against ctx.viewedDate. Fall back to "now" only when no provider supplies
  // it (e.g. a test rendering ScheduleItem in isolation).
  const { onSetNeededToday, viewedDate } = useScheduleActionsContext()
  const isNeededToday = !!item.neededOn && isSameDay(item.neededOn, viewedDate ?? new Date())
  // Hover state powers the smooth expanding banner (location-only metadata row).
  // On mobile we never expand — preserves the pre-existing behavior where
  // these were never visible without hover.
  const [isHovered, setIsHovered] = useState(false)
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isActionable = isTask || isRoutine || isEvent // Events are now checkable
  /** This row came out of a capture (a forwarded school email). */
  const fromEmail = !!item.captureId
  /**
   * Per-person items: subtasks that name a person, plus every open subtask of a
   * row extracted from an email. Unlike plain steps these are the CONTENT of
   * the block — "Picture Day" means nothing without "Liam: collared shirt" —
   * so they render inline, always, at every width. Completed ones drop out:
   * what is left is what still has to happen.
   */
  const isPerPerson = (s: Task) => !!s.assignedTo || fromEmail
  const perPersonItems = (item.originalTask?.subtasks ?? []).filter(
    (s) => !s.completed && isPerPerson(s),
  )
  const hasPerPersonItems = perPersonItems.length > 0
  /**
   * Everything the per-person list does NOT cover — ordinary steps, which stay
   * behind the disclosure. Split on the per-person PREDICATE, not on the
   * rendered list: a per-person item that has been completed drops out of the
   * inline list, and it must not reappear here as if it were a plain step.
   */
  const plainSubtasks = (item.originalTask?.subtasks ?? []).filter((s) => !isPerPerson(s))
  /** Anything rendering beneath the title makes the title column taller — the
   *  leading columns then need pinning to the title's first line. */
  const hasBelowTitleContent = !!belowTitleAccessory
    || !!(item.isWaiting && item.waitingFor && !item.completed)
    || hasPerPersonItems
    || fromEmail
  const contextColor = item.context ? DOMAIN_COLORS[item.context]?.dot : undefined

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()

    // Always close panel if open
    if (panelOpen && onClosePanel) {
      onClosePanel()
    }

    // Then perform the complete action
    onToggleComplete()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't hijack Enter/Space when focus is inside a text-entry element
    // (e.g., a popover textarea like DiscussionPicker's). Without this guard,
    // typing a space in any text field nested under the row would select the
    // row instead of inserting the space.
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  // Parse time display
  const getTimeDisplay = () => {
    // All-day items - check for meal keyword inference first
    if (item.allDay) {
      const inferred = inferMealTime(item.title)
      if (inferred && item.startTime) {
        // Show inferred time for meal events (e.g., "6:30 PM" for dinner)
        const inferredDate = new Date(item.startTime)
        inferredDate.setHours(inferred.hour, inferred.minute, 0, 0)
        return { type: 'single' as const, time: formatTimeLong(inferredDate) }
      }
      return { type: 'allday' as const }
    }

    if (!item.startTime) return null

    if (item.endTime) {
      const rangeStr = formatTimeRangeLong(item.startTime, item.endTime, item.allDay)
      if (rangeStr === 'All day') {
        return { type: 'allday' as const }
      }
      const [start, end] = rangeStr.split('|')
      return { type: 'range' as const, start, end }
    }

    return { type: 'single' as const, time: formatTimeLong(item.startTime) }
  }

  const timeDisplay = getTimeDisplay()

  const hasContactChip = !!contactName
  // The steps disclosure is for plain subtasks only — the per-person items are
  // already on screen, always open, so a chip revealing the same names again is
  // a second, contradicting affordance. It used to be `!hasPerPersonItems &&
  // …`, which let ONE assigned subtask hide every plain step beside it. The two
  // populations coexist: the chip now counts what the inline list does not
  // cover, and reads its counts from the split rather than from the row's
  // whole-subtask totals.
  const stepsTotal = hasPerPersonItems ? plainSubtasks.length : (item.subtaskCount ?? 0)
  const stepsDone = hasPerPersonItems
    ? plainSubtasks.filter((s) => s.completed).length
    : (item.subtaskCompletedCount ?? 0)
  const hasSubtasks = stepsTotal > 0
  /** Provenance, rendered in the subtitle slot at EVERY width. */
  const emailBadge = (
    <span className="inline-flex items-center gap-1 align-middle">
      <Mail className="w-3 h-3 shrink-0" aria-hidden />
      From an email
    </span>
  )
  // Steps disclosure — collapsed by default. Local because it is pure view
  // state and each row opens independently.
  const [stepsOpen, setStepsOpen] = useState(false)


  // ── Mobile card render ────────────────────────────────────────────────────
  // Matches the mockup: each row is a discrete card with a left time column,
  // a tinted icon block, a title + small context line, and a right cluster
  // (assignee, more). Desktop render falls through below.
  if (isMobile) {
    // Time displayed stacked: "1:00 / PM" for single times, with a hyphen row
    // for ranges ("6:30 / – / 7:15 / PM").
    const splitTime = (s: string) => {
      const m = s.match(/^(.+?)\s?(AM|PM)$/i)
      return m ? [m[1], m[2].toUpperCase()] : [s, '']
    }
    const renderStackedTime = () => {
      if (!timeDisplay) return null
      if (timeDisplay.type === 'allday') {
        return <span className="text-[11px] font-medium text-neutral-400">All day</span>
      }
      if (timeDisplay.type === 'range') {
        const [s1, p1] = splitTime(timeDisplay.start)
        const [s2] = splitTime(timeDisplay.end)
        return (
          <>
            <div>{s1}</div>
            <div>–</div>
            <div>{s2}</div>
            <div>{p1}</div>
          </>
        )
      }
      const timeStr = timeDisplay.time ?? ''
      const [hm, ap] = splitTime(timeStr)
      return (
        <>
          <div>{hm}</div>
          {ap && <div>{ap}</div>}
        </>
      )
    }

    // Small context line: category, then location. (Project was the first
    // preference until Projects was hidden — 2026-09-02, see Sidebar.tsx.)
    const contextLabel = (item.category && item.category !== 'task' ? item.category : null) || item.location || null
    const dotColor = contextColor || null

    // Swipe gestures: right → complete, left → edit (open detail panel).
    // The card translates with the finger; coloured action panels behind it
    // reveal under the card. Past the commit threshold, releasing fires the
    // action; otherwise the card snaps back.
    const SWIPE_COMMIT_PX = 80
    const SWIPE_MAX_PX = 140
    return (
      <ScheduleItemMobileCard
        swipeMaxPx={SWIPE_MAX_PX}
        swipeCommitPx={SWIPE_COMMIT_PX}
        onCompleteSwipe={() => handleCheckboxClick({ stopPropagation: () => {} } as React.MouseEvent)}
        onEditSwipe={onSelect}
        // Centred is right for a one-line row and wrong the moment the inline
        // per-person items (or the "From an email" line) make the title column
        // tall — the time and the type tile drift to the vertical middle of the
        // card, away from the title they label. Same rule the desktop branch
        // applies to its leading column via hasBelowTitleContent/self-start.
        cardClassName={`
          relative flex ${hasPerPersonItems || fromEmail ? 'items-start' : 'items-center'} gap-3 bg-bg-elevated rounded-2xl border border-neutral-200/70
          px-3 py-3 shadow-card
          ${selected ? 'ring-2 ring-primary-300 shadow-md' : ''}
          ${item.completed || item.skipped ? 'opacity-60' : ''}
        `}
        ariaPressed={selected}
      >
        {/* Left time column — stacked */}
        <div className="w-10 shrink-0 text-[11px] font-medium text-neutral-500 leading-tight tabular-nums text-left">
          {renderStackedTime()}
        </div>

        {/* Tinted type tile — anchors the row's left side and carries domain
            color. The parent card owns the completed/skipped opacity-60, so
            the tile must not re-apply opacity itself. */}
        <MobileTypeTile
          type={item.type}
          context={item.context ?? null}
        />

        {/* Title + context line */}
        <div className="flex-1 min-w-0">
          <div className={`text-[15px] font-semibold leading-tight line-clamp-2 break-words ${item.completed || item.skipped ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
            {item.title}
          </div>
          {contextLabel && (
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-500 mt-0.5 truncate">
              {dotColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
              <span className="truncate">{contextLabel}</span>
            </div>
          )}
          {fromEmail && (
            <div className="text-[12px] text-neutral-500 mt-0.5">{emailBadge}</div>
          )}
          {/* Per-person items — inline on the phone too. This is where a
              parent actually reads "who needs what tomorrow". */}
          <ScheduleItemItems
            items={perPersonItems}
            members={familyMembers}
            onToggle={onToggleSubtask}
            viewedDate={viewedDate}
          />
        </div>

        {/* Right cluster — assignee. Three-dot removed; swipe
            now exposes the same actions (right→complete, left→edit). Needed
            today is a TAP control here, not a third swipe — swipe already
            means complete (right) / edit (left), and a third gesture would be
            undiscoverable. Uses the same isSameDay-against-viewedDate
            definition of "marked" as the desktop chip/menu — bare truthiness
            of item.neededOn was a bug already fixed once there. */}
        <div className="flex items-center gap-1 shrink-0">
          {/* `!item.completed` matches the desktop chip: a done task is not
              still "needed today", and an amber marker on it is a lie. */}
          {isTask && onSetNeededToday && item.originalTask && !item.completed && (
            <button
              type="button"
              aria-label={isNeededToday ? 'Not needed today' : 'Need today'}
              onClick={(e) => {
                e.stopPropagation()
                onSetNeededToday(item.originalTask!.id, isNeededToday ? null : (viewedDate ?? new Date()))
              }}
              className="p-1.5 rounded-lg"
            >
              <AlertCircle className={`w-4 h-4 ${isNeededToday ? 'text-amber-500' : 'text-neutral-300'}`} />
            </button>
          )}
          {familyMembers.length > 0 && onAssignAll ? (
            <div onClick={(e) => e.stopPropagation()}>
              <MultiAssigneeDropdown
                members={familyMembers}
                selectedIds={assignedToAll}
                onSelect={onAssignAll}
                size="sm"
                label={item.type === 'event' ? "Who's attending?" : "Who's responsible?"}
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
          ) : null}
        </div>
      </ScheduleItemMobileCard>
    )
  }

  return (
    <div
      data-selectable
      onClick={() => {
        // Always select this item (switches panel to show this item's details)
        onSelect()
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        group relative cursor-pointer transition-all duration-200 rounded-xl border
        ${variant === 'minimal'
          ? `px-3 py-1 md:py-0.5 border-transparent hover:bg-neutral-50/60 ${selected ? 'bg-neutral-50 ring-1 ring-neutral-200' : ''}`
          : `px-3 py-2 md:py-1 ${selected
              ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200'
              : 'border-transparent hover:bg-primary-50/50 hover:border-primary-100'
            }`
        }
        ${item.completed || item.skipped ? 'opacity-60' : ''}
      `}
    >
      {/* Bulk multi-select checkbox — hover-revealed at the row's left edge.
          Absolutely positioned so it never shifts layout; the row content gets
          a left pad (below) only while it's shown. Toggling stops propagation
          so it never opens the detail panel. */}
      {bulkSelectable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleBulkSelect?.() }}
          aria-label={bulkSelected ? 'Deselect item' : 'Select item'}
          aria-pressed={!!bulkSelected}
          className={`absolute left-1.5 top-1/2 -translate-y-1/2 z-[2] grid place-items-center w-4 h-4 rounded-[4px] border-2 transition-all ${
            bulkSelected
              ? 'opacity-100 bg-primary-600 border-primary-600 text-white'
              : `border-neutral-300 text-transparent ${showBulkAffordance ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
          }`}
        >
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        </button>
      )}

      {/* Main row: time | checkbox/circle | title.
          The bulk checkbox is absolutely positioned at the left edge. We reserve
          a permanent gutter for it whenever the row is bulk-selectable, so the
          checkbox fades in on hover WITHOUT shifting the row (which used to slide
          the check circle out from under the cursor) and WITHOUT overlapping the
          time (which the gutterless version did). Every Today row is
          bulk-selectable, so they all reserve the gutter and stay aligned. */}
      <div className={`relative flex items-center gap-3 ${bulkSelectable ? 'pl-5' : ''}`}>
        <TimelineSpine above={spineAbove} below={spineBelow} hasBulkGutter={!!bulkSelectable} />

        {/* Time column - fixed width for alignment */}
        {hideTime ? (
          <div className="w-16 shrink-0" />
        ) : (isTask && onSchedule) || ((isRoutine || item.type === 'event') && onPush) ? (
          <div
            className="w-16 shrink-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <SchedulePopover
              value={item.startTime ?? undefined}
              isAllDay={item.allDay}
              onSchedule={(date, isAllDay) => {
                if (onSchedule) {
                  onSchedule(date, isAllDay)
                } else if (onPush) {
                  onPush(date)
                }
              }}
              onClear={onSchedule ? () => {
                onSchedule(undefined as unknown as Date, false)
              } : undefined}
              getItemsForDate={getScheduleItemsForDate}
              skipToTime={true}
              itemTitle={item.title}
              trigger={
                <button
                  className="w-full text-left text-xs font-medium tabular-nums rounded-md px-1 py-0.5 -mx-1 hover:bg-neutral-100 transition-colors cursor-pointer underline decoration-dotted decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500"
                  title="Change time"
                >
                  {isOverdue && overdueLabel ? (
                    <span style={{ color: overdueColors.warning600 }}>
                      {overdueLabel}
                    </span>
                  ) : timeDisplay ? (
                    timeDisplay.type === 'allday' ? (
                      <span className="text-neutral-400">All day</span>
                    ) : timeDisplay.type === 'range' ? (
                      <div className="leading-tight text-neutral-400">
                        <div>{timeDisplay.start}</div>
                        <div className="text-neutral-300">{timeDisplay.end}</div>
                      </div>
                    ) : (
                      <span className="text-neutral-500">{timeDisplay.time}</span>
                    )
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </button>
              }
            />
          </div>
        ) : (
          <div className="w-16 shrink-0 text-xs font-medium tabular-nums">
            {isOverdue && overdueLabel ? (
              <span style={{ color: overdueColors.warning600 }}>
                {overdueLabel}
              </span>
            ) : timeDisplay ? (
              timeDisplay.type === 'allday' ? (
                <span className="text-neutral-400">All day</span>
              ) : timeDisplay.type === 'range' ? (
                <div className="leading-tight text-neutral-400">
                  <div>{timeDisplay.start}</div>
                  <div className="text-neutral-300">{timeDisplay.end}</div>
                </div>
              ) : (
                <span className="text-neutral-500">{timeDisplay.time}</span>
              )
            ) : (
              <span className="text-neutral-300">—</span>
            )}
          </div>
        )}

        {/* Checkbox/circle/calendar - fixed width for alignment, hidden on mobile when overdue */}
        {/* When something renders beneath the title (suggestion chip, "waiting on"
            line) the title column grows taller, and a centred checkbox drifts
            down, away from the name it belongs to. self-start pins it to the top
            of the row — which IS the title's first line, the title column being
            the tallest child — with a nudge to centre it on that line's box. */}
        {!(isMobile && isOverdue) && (
          <div className={`w-5 shrink-0 flex items-center justify-center relative z-[1] ${
            hasBelowTitleContent ? `self-start ${variant === 'minimal' ? '' : 'mt-0.5'}` : ''
          }`}>
            {isEvent ? (
              // Calendar events show a calendar icon with the context color
              <button
                onClick={handleCheckboxClick}
                className="touch-target flex items-center justify-center -m-2 p-2 rounded-full"
                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                <CalendarIcon
                  context={item.context}
                  completed={item.completed}
                />
              </button>
            ) : isActionable ? (
              // Tasks and routines show checkbox (square for tasks, circle for routines)
              <TaskCheckbox
                completed={item.completed}
                isWaiting={isTask ? item.isWaiting : undefined}
                onToggleComplete={() => handleCheckboxClick({ stopPropagation: () => {} } as React.MouseEvent)}
                onToggleWaiting={() => {
                  if (panelOpen && onClosePanel) onClosePanel()
                  onToggleWaiting?.()
                }}
                isRoutine={isRoutine}
                contextColor={contextColor}
              />
            ) : null}
          </div>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`
                flex-1 min-w-0
                ${variant === 'minimal' ? 'text-sm' : 'text-base'} font-medium line-clamp-2 transition-colors
                ${item.completed || item.skipped
                  ? 'line-through text-neutral-400'
                  : item.isWaiting
                    ? 'text-amber-600/70 italic'
                    : variant === 'minimal'
                    ? 'text-neutral-500 group-hover:text-neutral-700'
                    : 'text-neutral-800 group-hover:text-neutral-900'
                }
              `}
            >
              {item.title}
              {/* Bare marker only when there's no sentence — otherwise the
                  "Waiting on …" line below says it better. */}
              {item.isWaiting && !item.waitingFor && !item.completed && (
                <span className="ml-1.5 text-xs text-amber-500 not-italic font-normal">waiting</span>
              )}
            </span>
            {/* Coaching sparkle indicator — desktop only */}
            {hasCoaching && (
              <span className="hidden md:inline shrink-0 text-amber-400 opacity-60" title="Coaching tips available">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
              </span>
            )}
            {/* Flagged for discussion — STATE, so it belongs with the title
                chips, not in the action rail. The control that sets it lives in
                the row's '...' menu. */}
            {item.needsDiscussion && (
              <span
                className="hidden md:inline shrink-0 text-primary-500"
                aria-label={item.discussionNote ? `Needs discussion: ${item.discussionNote}` : 'Needs discussion'}
                title={item.discussionNote || 'Needs discussion'}
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </span>
            )}
            {/* Needed today mark — STATE, so it belongs with the title chips,
                not the action rail. The '...' menu sets/clears it; clicking the
                chip itself is a shortcut to clear. */}
            {isNeededToday && !item.completed && (
              <button
                type="button"
                title="Needed today — click to clear"
                onClick={(e) => { e.stopPropagation(); onSetNeededToday?.(item.originalTask!.id, null) }}
                className="hidden md:inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 bg-amber-100/70"
              >
                <AlertCircle className="w-3 h-3" aria-hidden />
                Today
              </button>
            )}
            {/* Subtask indicator — desktop only. A disclosure, not a label:
                steps no longer earn their own Today rows (they used to inherit
                the parent's date and produce N competing rows), so this is the
                only way to see them without leaving the page. Collapsed by
                default — the parent holds the slot, the steps are detail. */}
            {hasSubtasks && (
              <button
                type="button"
                aria-expanded={stepsOpen}
                aria-label={`${stepsTotal} steps`}
                onClick={(e) => { e.stopPropagation(); setStepsOpen((v) => !v) }}
                className="hidden md:inline-flex shrink-0 items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <ListChecks className="w-3 h-3" />
                {stepsDone}/{stepsTotal}
                {stepsOpen
                  ? <ChevronUp className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
          {/* What the wait is ON — its own line beneath the title, never a
              replacement for it. Replacing the title would break scanning: two
              months from now "Guy's response about pizza" won't tell you which
              task it belonged to. */}
          {item.isWaiting && item.waitingFor && !item.completed && (
            <div className="flex items-baseline gap-1.5 text-[12px] text-amber-600/90 leading-tight mt-0.5 min-w-0">
              <Hourglass className="w-3 h-3 shrink-0 translate-y-[1px]" aria-hidden />
              <span className="truncate" title={item.waitingFor}>
                Waiting on {item.waitingFor}
              </span>
            </div>
          )}
          {/* Subtitle: category + duration, plus provenance. Empty for plain
              tasks. The category/duration half stays desktop-only as before;
              "From an email" shows at every width, so a row carrying it is not
              wrapped in `hidden md:block`. */}
          {(() => {
            const subtitle = rowSubtitle(item)
            if (!subtitle && !fromEmail) return null
            if (!fromEmail) {
              return (
                <div className="hidden md:block text-[12px] text-neutral-500 leading-tight mt-0.5">
                  {subtitle}
                </div>
              )
            }
            return (
              <div className="text-[12px] text-neutral-500 leading-tight mt-0.5">
                {subtitle && <span className="hidden md:inline">{subtitle} · </span>}
                {emailBadge}
              </div>
            )
          })()}
          {/* Per-person items — always open, every width. Left-aligned WITH the
              title, same as the steps list below. */}
          <ScheduleItemItems
            items={perPersonItems}
            members={familyMembers}
            onToggle={onToggleSubtask}
            viewedDate={viewedDate}
          />
          {/* Steps — revealed by the subtask chip above. Left-aligned WITH the
              title (a block sibling of the whole row would sit under the time
              gutter and read as the next task's content). */}
          {stepsOpen && plainSubtasks.length ? (
            <ul className="hidden md:block mt-1 space-y-0.5 border-l-2 border-neutral-200 pl-3">
              {plainSubtasks.map((s) => (
                <li key={s.id} className="text-[13px] text-neutral-600">
                  <span className={s.completed ? 'line-through text-neutral-400' : ''}>
                    {s.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Suggestion chip — under the title, left-aligned WITH the title. */}
          {belowTitleAccessory && <div className="mt-1">{belowTitleAccessory}</div>}
        </div>

        {/* Trailing controls — a FIXED four-slot rail, not a run of conditional
            siblings. See RowActionRail for why: the old version rendered six
            controls on a task, five on an event, three on a routine, so nothing
            formed a column down the page. */}
        <RowActionRail
          item={item}
          variant={variant}
          onSelect={onSelect}
          onContextChange={onContextChange}
          onUpdateDiscussion={onUpdateDiscussion}
          onAssign={onAssign}
          onAssignAll={onAssignAll}
          familyMembers={familyMembers}
          assignedTo={assignedTo}
          assignedToAll={assignedToAll}
        />
      </div>

      {/* Metadata row — location on hover, contact/parentTask always compact */}
      {(item.location || hasContactChip || parentTaskName) && (() => {
        const onlyLocation = !hasContactChip && !parentTaskName
        const metadataContent = (
          <div className={`flex items-center gap-2 ml-[5.75rem] flex-wrap ${onlyLocation ? 'pt-1' : 'mt-1'}`}>
            {/* Location chip — hover-only for cleaner default view.
                URL-shaped locations (Zoom/Meet/Teams) open the meeting URL
                directly; physical locations open Google Maps directions. */}
            {item.location && (() => {
              const link = locationLink(item.location, item.locationPlaceId, item.meetingUrl)
              if (link.kind === 'empty') return null
              const isMeeting = link.kind === 'url' || link.kind === 'virtual'
              const chipClass = 'inline-flex items-center gap-1 px-1.5 py-0.5 text-primary-600 hover:text-primary-700 rounded text-[11px] font-medium transition-all opacity-0 group-hover:opacity-100 max-w-[220px]'
              const icon = isMeeting ? (
                <Video className="w-3 h-3 shrink-0" aria-hidden />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              )
              // A virtual meeting with no join URL is a label, never a directions link.
              if (link.kind === 'virtual') {
                return (
                  <span className={chipClass} title="Video meeting">
                    {icon}
                    <span className="truncate">{item.location}</span>
                  </span>
                )
              }
              return (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={chipClass}
                  title={isMeeting ? 'Open meeting link' : 'Get directions'}
                >
                  {icon}
                  <span className="truncate">{link.kind === 'url' ? 'Join meeting' : item.location}</span>
                </a>
              )
            })()}

            {/* Contact chip - desktop only */}
            {hasContactChip && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-neutral-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span className="truncate max-w-[80px]">{contactName}</span>
              </span>
            )}

            {/* Parent task context */}
            {parentTaskName && parentTaskId && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenParentTask?.(parentTaskId)
                }}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 hover:underline truncate max-w-[180px]"
              >
                {parentTaskName}
              </button>
            )}
          </div>
        )

        // If location is the only metadata, the row collapses until hover.
        // Wrap in ExpandingPanel so layout shifts smoothly instead of jumping.
        return onlyLocation
          ? <ExpandingPanel open={isHovered && !isMobile}>{metadataContent}</ExpandingPanel>
          : metadataContent
      })()}

    </div>
  )
})

// ─── ScheduleItemMobileCard ──────────────────────────────────────────────────
// Wraps the mobile card with swipe gestures:
//   • drag left  past commit threshold → fire onCompleteSwipe (complete)
//   • drag right past commit threshold → fire onEditSwipe (open detail)
// Coloured action panels reveal underneath as the card slides. Touches that
// move primarily vertically don't engage the swipe (so page scroll still
// works). A small tap (delta < 6px) falls through to onClickCard.

interface ScheduleItemMobileCardProps {
  swipeCommitPx: number
  swipeMaxPx: number
  onCompleteSwipe: () => void
  onEditSwipe: () => void
  ariaPressed?: boolean
  cardClassName: string
  children: React.ReactNode
}

function ScheduleItemMobileCard({
  swipeCommitPx,
  swipeMaxPx,
  onCompleteSwipe,
  onEditSwipe,
  ariaPressed,
  cardClassName,
  children,
}: ScheduleItemMobileCardProps) {
  // `dragging` is the only React state — it flips on/off between gestures so
  // the CSS transition class can toggle. Per-frame motion is driven via refs
  // below so the card subtree (including dropdowns) never re-renders mid-drag.
  const [dragging, setDragging] = useState(false)

  const cardEl = useRef<HTMLDivElement>(null)
  const completePanelEl = useRef<HTMLDivElement>(null)
  const editPanelEl = useRef<HTMLDivElement>(null)

  const startX = useRef(0)
  const startY = useRef(0)
  const decided = useRef<'horizontal' | 'vertical' | null>(null)
  const dxRef = useRef(0)
  const rafPending = useRef(false)
  const haptic = useRef(false) // fires once per gesture when crossing commit
  // Track mount so a rAF that survives the component (e.g. a fast swipe-to-
  // complete removes the card from the list mid-gesture) doesn't fire a
  // spurious haptic tick on a row that no longer exists.
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const paint = () => {
    rafPending.current = false
    if (!mounted.current) return
    const dx = dxRef.current
    if (cardEl.current) {
      cardEl.current.style.transform = `translateX(${dx}px)`
    }
    const intensity = Math.min(1, Math.abs(dx) / swipeCommitPx)
    if (completePanelEl.current) {
      completePanelEl.current.style.opacity = dx < 0 ? String(intensity) : '0'
    }
    if (editPanelEl.current) {
      editPanelEl.current.style.opacity = dx > 0 ? String(intensity) : '0'
    }
    // Light haptic tick on commit-threshold crossing (Android only; no-op on iOS).
    if (!haptic.current && Math.abs(dx) >= swipeCommitPx) {
      haptic.current = true
      navigator.vibrate?.(10)
    }
  }

  const requestPaint = () => {
    if (rafPending.current) return
    rafPending.current = true
    requestAnimationFrame(paint)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
    decided.current = null
    dxRef.current = 0
    haptic.current = false
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const ax = t.clientX - startX.current
    const ay = t.clientY - startY.current
    if (decided.current === null) {
      if (Math.abs(ax) < 6 && Math.abs(ay) < 6) return
      decided.current = Math.abs(ax) > Math.abs(ay) ? 'horizontal' : 'vertical'
    }
    if (decided.current === 'vertical') return // let the page scroll
    dxRef.current = Math.max(-swipeMaxPx, Math.min(swipeMaxPx, ax))
    requestPaint()
  }

  const commit = () => {
    const dx = dxRef.current
    if (decided.current === 'horizontal') {
      // Right-to-left (dx < 0) → Complete. Left-to-right (dx > 0) → Edit.
      if (dx <= -swipeCommitPx) {
        onCompleteSwipe()
      } else if (dx >= swipeCommitPx) {
        onEditSwipe()
      }
    }
    // Snap back. Once `dragging` flips to false on the next React frame, the
    // card gains the transform-transition class, so this looks like a spring.
    dxRef.current = 0
    requestPaint()
    decided.current = null
    setDragging(false)
  }

  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl">
      {/* Complete action — right side, revealed on right-to-left swipe. */}
      <div
        ref={completePanelEl}
        aria-hidden
        className="absolute inset-y-0 right-0 w-1/2 flex items-center justify-end pr-5 rounded-r-2xl bg-emerald-500"
        style={{ opacity: 0 }}
      >
        <Check className="w-6 h-6 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Complete</span>
      </div>
      {/* Edit action — left side, revealed on left-to-right swipe. */}
      <div
        ref={editPanelEl}
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/2 flex items-center justify-start pl-5 rounded-l-2xl bg-sky-500"
        style={{ opacity: 0 }}
      >
        <Pencil className="w-5 h-5 text-white" />
        <span className="ml-2 text-white text-sm font-medium">Edit</span>
      </div>

      <div
        ref={cardEl}
        data-selectable
        aria-pressed={ariaPressed}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={commit}
        onTouchCancel={commit}
        className={cardClassName}
        // INVARIANT: `transform` MUST stay a static string literal here.
        // React's style diff only writes properties whose virtual-DOM value
        // changed — because `transform` is never a different string between
        // renders, React never overwrites the imperative value paint() wrote
        // via cardEl.current.style.transform. If you ever make `transform`
        // dependent on a render-time value, React will snap the card back to
        // that value on every re-render mid-drag.
        style={{
          transform: 'translateX(0px)',
          transition: dragging ? 'none' : 'transform 200ms ease-out',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
