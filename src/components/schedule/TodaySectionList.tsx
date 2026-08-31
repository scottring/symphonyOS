/**
 * TodaySectionList — Today's seven day sections and every row inside them.
 *
 * Lifted verbatim out of TodayView, which the Stage 2b spec forbids growing:
 * "Lift the section loop, the drag wiring and the collapse state into their own
 * units first. If this file is longer at the end than it started, the work was
 * done wrong."
 *
 * Reads `useScheduleActionsContext()` directly rather than taking forty
 * handler props — it is the same context TodayView reads, and threading it
 * through would be a second copy of the same wiring.
 */
import { useCallback, useMemo, useReducer, useState } from 'react'
import type { Task } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { ParserContext } from '@/lib/quickInputParser'
import type { useTimelineInsert } from '@/hooks/useTimelineInsert'

import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
import { sectionKey } from '@/lib/today/sectionCollapse'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { computeAnchorTime } from '@/lib/timelineAnchor'
import { parseMealTitle } from '@/lib/mealTitle'

import { DaySectionHeader } from '@/components/schedule/DaySectionHeader'
import { TimelineInsertPoint } from './TimelineInsertPoint'
import { EveningMealCard } from './EveningMealCard'
import { ScheduleItem } from './ScheduleItem'
import { RoutineCollectionRow } from './RoutineCollectionRow'
import { ShareToFamilyNudge } from './ShareToFamilyNudge'
import { ToBuyNudge } from './ToBuyNudge'
import { isBuyish, isToBuyNudgeDismissed, dismissToBuyNudge } from '@/lib/lists/toBuy'
import { TodayBandDropZone, TodayGapDropZone } from './TodayDropZones'
import { TodayDraggableRow } from './TodayDraggableRow'
import { GroupNameInput } from './GroupNameInput'
import { useTodayDragState } from './TodayDragProvider'
import { refusalFor } from '@/lib/today/todayDrop'
import { DEFAULT_SECTION_CAP } from '@/lib/today/pageCap'
import { curateUnits } from '@/lib/today/curate'
import { computeOpenSpans } from '@/lib/today/openSpace'
import { effectiveStartTime } from '@/lib/timeUtils'
import { OpenSpaceLine } from './OpenSpaceLine'
import { countRoutineRowUnits } from '@/lib/today/routineCollections'

// ─── Meal detection ────────────────────────────────────────────────────────────

const MEAL_RE = /breakfast|brunch|lunch|dinner|supper/i

function isMealItem(id: string, type: string, title: string): boolean {
  return String(id).startsWith('meal:') || (type === 'event' && MEAL_RE.test(title))
}

/**
 * The "Up next" marker — replaces the UpNextHero card (2026-08-18). The next
 * commitment stays IN the timeline where the eye expects it; this one small
 * line plus a tinted row is the entire treatment. Lifting it into a hero left
 * its home section rendering an empty heading labelled "· up next".
 */
function UpNextMarker({ status }: { status?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 md:px-0 pt-1.5 pb-1" data-testid="up-next-marker">
      <span className="text-[11px] uppercase tracking-wider font-bold text-amber-600">Up next</span>
      {status && <span className="text-[12px] text-neutral-500">· {status}</span>}
    </div>
  )
}

/** Row tint for the up-next commitment — subtle, no layout shift. */
const UP_NEXT_ROW_CLASS = 'rounded-xl bg-primary-50/60 ring-1 ring-primary-100'

/** Locate a rendered timeline item by id across every section. */
export function findTimelineItem(
  grouped: Record<DaySection, TimelineItem[]>,
  id: string,
): TimelineItem | null {
  for (const list of Object.values(grouped)) {
    const found = list.find((i) => i.id === id)
    if (found) return found
  }
  return null
}

export interface TodaySectionListProps {
  sectionsOrder: DaySection[]
  grouped: Record<DaySection, TimelineItem[]>
  viewedDate: Date
  isMobile: boolean
  selectedItemId: string | null
  /** The next commitment, highlighted IN PLACE — never lifted out of the list. */
  upNextId: string | undefined
  /** e.g. "starts in ~2.5 hr" — rendered on the up-next marker line. */
  upNextStatus?: string
  /** Wall clock used to measure open space. Injected so tests are deterministic. */
  now?: Date
  firstSectionItemId: string | null
  collapsedKeys: Set<string>
  openedByUser: Set<string>
  onToggleSection: (section: DaySection, currentlyCollapsed: boolean) => void
  selectedKeys: Set<string>
  onToggleBulkSelect: (key: string) => void
  tasksMap: Map<string, Task>
  shareNudgeByEventId: Map<string, { eventId: string; context: string }>
  parserContext: ParserContext
  insert: ReturnType<typeof useTimelineInsert>
  isPromotionSuggested: (eventId: string) => boolean
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  panelOpen?: boolean
  onClosePanel?: () => void
  /** True when this event sits on a read-only calendar — it refuses the drag. */
  isReadOnlyEvent: (item: TimelineItem) => boolean
  /** Raw task id of a just-created group, rendered as an inline name field. */
  renamingGroupId?: string | null
  onRenameGroupDone?: () => void
  /** Convert a buy-ish task to a "To buy" list item (the host owns the undo toast). */
  onSendToBuy?: (taskId: string) => void
}

export function TodaySectionList({
  sectionsOrder,
  grouped,
  viewedDate,
  isMobile,
  selectedItemId,
  upNextId,
  upNextStatus,
  now,
  firstSectionItemId,
  collapsedKeys,
  openedByUser,
  onToggleSection,
  selectedKeys,
  onToggleBulkSelect,
  tasksMap,
  shareNudgeByEventId,
  parserContext,
  insert,
  isPromotionSuggested,
  onSelectItem,
  onToggleTask,
  onCompleteRoutine,
  onCompleteEvent,
  panelOpen,
  onClosePanel,
  isReadOnlyEvent,
  renamingGroupId,
  onRenameGroupDone,
  onSendToBuy,
}: TodaySectionListProps) {
  const ctx = useScheduleActionsContext()
  const { dragging } = useTodayDragState()

  // Dismissing a To buy nudge writes localStorage, which React can't see —
  // this tick exists purely to re-render so the dismissed nudge disappears.
  const [, bumpToBuyDismissals] = useReducer((x: number) => x + 1, 0)

  // Which sections the user has expanded past the cap. Not persisted: a cap is
  // about this reading of the page, not a standing preference.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set())
  const expandSection = useCallback((key: string) => {
    setExpandedSections((prev) => new Set(prev).add(key))
  }, [])
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onOpenTask,
    contactsMap, projectsMap, familyMembers = [],
    eventNotesMap,
  } = ctx

  const onCreateTaskAt = ctx.onCreateTaskAt
  const onCreateEventAt = ctx.onCreateEventAt
  const onCreateRoutineAt = ctx.onCreateRoutineAt

  // Core members act as default diners on the evening meal card until per-meal
  // diner assignment lands.
  const { diners, servesCount } = useMemo(() => {
    const coreMembers = familyMembers.filter((m) => m.member_type === 'core')
    return {
      diners: coreMembers.map((m) => ({ id: m.id, initials: m.initials, color: m.color })),
      servesCount: coreMembers.length > 0 ? coreMembers.length : undefined,
    }
  }, [familyMembers])

  // Open space is a property of the whole day, not of one band: the gap that
  // matters most on a light day runs from a morning routine clear through to
  // dinner. Computed over every timed item in render order across all
  // sections, INCLUDING any the section cap will hide — a hidden commitment
  // still occupies its hour, and a span that ignored it would overstate the
  // room by exactly that much.
  const openSpans = useMemo(
    () => computeOpenSpans(
      sectionsOrder.flatMap((s) => grouped[s] ?? []),
      { now: now ?? new Date(), viewedDate },
    ),
    [sectionsOrder, grouped, now, viewedDate],
  )

  return (
    <>
      {sectionsOrder.map((section) => {
        const allSectionItems = grouped[section]
        const isEmpty = !allSectionItems || allSectionItems.length === 0
        // Empty sections stay hidden for reading, but a drag needs somewhere to
        // aim: you cannot drop something at 6 AM if the Early morning band
        // isn't on screen. Unscheduled is never a drop target, so it stays
        // hidden either way.
        if (isEmpty && (!dragging || section === 'unscheduled')) return null

        const items = allSectionItems ?? []
        // The cap bounds what RENDERS. Every count below still comes from the
        // full `items` — the header is where the truth about the day lives.
        // Capped by GROUP, not by row: a group renders as one enclosed card
        // whose borders come from adjacency, so cutting the run in half leaves
        // a card with no bottom edge.
        // curateUnits, not capUnits: same unit model and the same honest count,
        // but the survivors are chosen by relevance rather than by position, so
        // the row you needed can't be the one hidden behind "+9 more" purely
        // because of where it landed in the sort.
        const { visible, hiddenCount } = curateUnits(
          items,
          DEFAULT_SECTION_CAP,
          expandedSections.has(sectionKey(section)),
          (item) => !item.isSubtask,
        )
        const completedCount = items.filter((i) => i.completed).length
        const restAllDone = items.length > 0 && completedCount === items.length
        // The untimed-routine slab collapses to one "Anytime · M of N done"
        // row regardless of whether it holds 12 routines or 60 — computed
        // from the same `items` the rows below would render, so it can't
        // drift from what's actually on screen.
        const anytimeSummary = section === 'unscheduled' ? countRoutineRowUnits(items) : undefined
        const key = sectionKey(section)

        // The flat agenda (2026-08-18): timed sections carry NO header and never
        // collapse — the day reads as one time-ordered list, the way a paper
        // plan does. The band structure itself stays, because bands are the
        // drag targets; while a drag is live the headers reappear as labels so
        // there is something to aim at. Only Anytime (unscheduled) keeps a
        // permanent header: its collapsed "Anytime · M of N done" row is the
        // fixed-budget summary of the untimed-routine slab, and folding it is
        // the point. Precedence there: an explicit fold always wins; an
        // explicit open overrides the auto rule; otherwise auto-collapse when
        // everything is done. `collapsedKeys` and `openedByUser` are
        // independent facts — never derive one from the other.
        const collapsed = section === 'unscheduled'
          ? collapsedKeys.has(key)
            ? true
            : openedByUser.has(key)
              ? false
              : restAllDone
          : false
        const showHeader = section === 'unscheduled' || dragging

        return (
          <section key={section}>
            <TodayBandDropZone section={section}>
            {showHeader && (
              <DaySectionHeader
                section={section}
                itemCount={items.length}
                completedCount={completedCount}
                collapsed={collapsed}
                onToggle={() => onToggleSection(section, collapsed)}
                anytimeSummary={anytimeSummary}
              />
            )}
            {!collapsed && (
              <div className="space-y-1 md:space-y-0.5">
                {visible.map((item, itemIndex) => {
                  const isUpNext = !!upNextId && item.id === upNextId
                  const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
                  const contactName = item.contactId && contactsMap?.get(item.contactId)?.name || undefined
                  const projectName = item.projectId && projectsMap?.get(item.projectId)?.name || undefined
                  const parentTaskId = item.parentTaskId
                  const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                  const isFirstItem = item.id === firstSectionItemId
                  // No affordance at all when the item refuses — a read-only
                  // event that accepted the drag would fail at Google and
                  // spring back for no visible reason.
                  const dragRefused = !!refusalFor(item, isReadOnlyEvent)

                  // ── Group cards ──────────────────────────────────────
                  // A parent task and its adjacent subtask rows (grouping.ts
                  // places children directly after their parent within a
                  // section) render inside one enclosed, tinted card. Roles
                  // are derived purely from adjacency, so a parent whose
                  // children live in another section gets no card.
                  const prevItem = itemIndex > 0 ? visible[itemIndex - 1] : null
                  const nextItem = itemIndex < visible.length - 1 ? visible[itemIndex + 1] : null
                  const isGroupParent = !!taskId && !!nextItem && !!nextItem.isSubtask && nextItem.parentTaskId === taskId
                  const isGroupChild = !!item.isSubtask && !!prevItem &&
                    (prevItem.id === `task-${item.parentTaskId}` ||
                      (!!prevItem.isSubtask && prevItem.parentTaskId === item.parentTaskId))
                  const isLastGroupChild = isGroupChild &&
                    (!nextItem || !(nextItem.isSubtask && nextItem.parentTaskId === item.parentTaskId))
                  const groupCardClass = isGroupParent
                    ? 'rounded-t-2xl border border-b-0 border-primary-200/70 bg-primary-50/30 pt-0.5'
                    : isLastGroupChild
                      ? 'border-x border-b border-primary-200/70 bg-primary-50/30 rounded-b-2xl pb-1 pl-4'
                      : isGroupChild
                        ? 'border-x border-primary-200/70 bg-primary-50/30 pl-4'
                        : ''
                  // Don't offer an insert point between a parent and its
                  // children — a task added there wouldn't be in the group.
                  const showInsert = !isGroupChild

                  // The free run that ends where this item begins, if any.
                  const openSpan = openSpans.get(item.id)

                  // Insert point before this item
                  const prevItemForInsert = itemIndex > 0 ? visible[itemIndex - 1] : null
                  const insertCtxBefore = {
                    before: prevItemForInsert?.startTime ?? null,
                    after: item.startTime ?? null,
                    section,
                    date: viewedDate,
                  }
                  const insertBefore = (
                    <TodayGapDropZone section={section} index={itemIndex}>
                    <TimelineInsertPoint
                      onPick={(k) => insert.handlePick(insertCtxBefore, k)}
                      onCreate={(kind, r) => {
                        if (kind === 'task') onCreateTaskAt?.(r)
                        else if (kind === 'event') onCreateEventAt?.(r)
                        else onCreateRoutineAt?.(r)
                      }}
                      quickInput={{
                        anchorTime: computeAnchorTime(insertCtxBefore),
                        parserContext,
                      }}
                    />
                    </TodayGapDropZone>
                  )

                  // Evening meal gets a special card (desktop only — on mobile
                  // we let meal items render as compact rows to match the
                  // pre-redesign list). 'night' too: evening now ends at 20:59,
                  // so a 21:00 dinner is a night item and would otherwise lose
                  // its meal-card treatment.
                  if (
                    !isMobile &&
                    (section === 'evening' || section === 'night') &&
                    isMealItem(item.id, item.type, item.title)
                  ) {
                    // effectiveStartTime, not startTime: an all-day "Dinner:
                    // ..." event lands in this branch via the same meal
                    // inference that filed it under evening, but its stored
                    // start is the all-day instant — printing that verbatim
                    // is what made the evening card announce "Dinner at
                    // 8:00 AM".
                    const mealStart = effectiveStartTime(item)
                    const timeLabel = mealStart
                      ? mealStart.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : ''
                    const parsed = parseMealTitle(item.title)
                    // For synthesized meal events, MealEventsProvider stores
                    // the recipe source URL in `description` → maps onto
                    // `googleDescription` on the timeline item.
                    const recipeUrl = item.googleDescription?.startsWith('http')
                      ? item.googleDescription
                      : undefined
                    const fromPlan = String(item.id).startsWith('meal:')
                    return (
                      <div key={item.id}>
                        {openSpan && <OpenSpaceLine span={openSpan} />}
                        {showInsert && insertBefore}
                        <TodayDraggableRow itemId={item.id} disabled={dragRefused}>
                        <div {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                          <EveningMealCard
                            title={parsed.title}
                            sides={parsed.sides}
                            timeLabel={timeLabel}
                            recipeUrl={recipeUrl}
                            fromPlan={fromPlan}
                            servesCount={servesCount}
                            diners={diners}
                            onSelect={() => onSelectItem(item.id)}
                          />
                        </div>
                        </TodayDraggableRow>
                      </div>
                    )
                  }

                  // Routine collection — collapsed row with per-step completion
                  if (item.type === 'routine-collection') {
                    return (
                      <div key={item.id} data-item-id={item.id}>
                        {openSpan && <OpenSpaceLine span={openSpan} />}
                        {showInsert && insertBefore}
                        {isUpNext && <UpNextMarker status={upNextStatus} />}
                        <TodayDraggableRow itemId={item.id} disabled={dragRefused}>
                        <div className={isUpNext ? UP_NEXT_ROW_CLASS : undefined}>
                        <RoutineCollectionRow
                          item={item}
                          onSelect={() => onSelectItem(item.id)}
                          onSelectStep={(stepId) => onSelectItem(stepId)}
                          onCompleteStep={(stepTimelineId, completed) => {
                            if (!onCompleteRoutine) return
                            const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                            const entityId = slot === null ? routineId : `${routineId}#${slot}`
                            onCompleteRoutine(entityId, completed)
                          }}
                          onSkipStep={onSkipRoutine ? (stepTimelineId) => {
                            const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                            const entityId = slot === null ? routineId : `${routineId}#${slot}`
                            onSkipRoutine(entityId)
                          } : undefined}
                          onCompleteStepAt={onCompleteRoutine ? (stepTimelineId, completedAt) => {
                            const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                            const entityId = slot === null ? routineId : `${routineId}#${slot}`
                            onCompleteRoutine(entityId, true, completedAt)
                          } : undefined}
                          onHideToday={onUpdateRoutine ? () => {
                            // Pause until tomorrow: reference + paused_until, so the
                            // useRoutines auto-resume brings it back on the next day.
                            const parentId = item.id.replace('routine-collection-', '')
                            const tomorrow = new Date()
                            tomorrow.setHours(0, 0, 0, 0)
                            tomorrow.setDate(tomorrow.getDate() + 1)
                            onUpdateRoutine(parentId, { visibility: 'reference', paused_until: tomorrow.toISOString() })
                          } : undefined}
                          onRemove={onUpdateRoutine ? () => {
                            const parentId = item.id.replace('routine-collection-', '')
                            onUpdateRoutine(parentId, { visibility: 'reference' })
                          } : undefined}
                        />
                        </div>
                        </TodayDraggableRow>
                      </div>
                    )
                  }

                  // A group the drag just created: its header row is an open
                  // name field until it is committed or dismissed. Not
                  // draggable while editing — the pointer belongs to the text.
                  if (taskId && taskId === renamingGroupId) {
                    return (
                      <div key={item.id}>
                        {openSpan && <OpenSpaceLine span={openSpan} />}
                        {showInsert && insertBefore}
                        <div data-item-id={item.id} className={groupCardClass || undefined}>
                          <GroupNameInput
                            initialName={item.title}
                            onCommit={(name) => {
                              if (name !== item.title) onUpdateTask?.(taskId, { title: name })
                              onRenameGroupDone?.()
                            }}
                            onCancel={() => onRenameGroupDone?.()}
                          />
                        </div>
                      </div>
                    )
                  }

                  // Standard schedule item
                  return (
                    <div key={item.id} className={isGroupChild ? '-mt-1' : undefined}>
                    {openSpan && <OpenSpaceLine span={openSpan} />}
                    {showInsert && insertBefore}
                    {isUpNext && <UpNextMarker status={upNextStatus} />}
                    <TodayDraggableRow itemId={item.id} disabled={dragRefused}>
                    {/* Group chrome wins over the up-next tint: stripping a
                        parent's card top to tint it leaves the group's border
                        broken. The marker line above still says "Up next". */}
                    <div data-item-id={item.id} className={(groupCardClass || (isUpNext ? UP_NEXT_ROW_CLASS : '')) || undefined} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                    {(() => {
                      const { routineId: bareRoutineId, slot } = item.type === 'routine'
                        ? parseRoutineTimelineId(item.id)
                        : { routineId: '', slot: null }
                      const routineEntityId = slot === null ? bareRoutineId : `${bareRoutineId}#${slot}`
                      return (
                        <>
                    <ScheduleItem
                      item={item}
                      selected={selectedItemId === item.id}
                      bulkSelectable={true}
                      bulkSelected={selectedKeys.has(item.id)}
                      showBulkAffordance={selectedKeys.size > 0}
                      onToggleBulkSelect={() => onToggleBulkSelect(item.id)}
                      onSelect={() => onSelectItem(item.id)}
                      onToggleWaiting={
                        item.type === 'task' && taskId && onToggleWaiting
                          ? () => onToggleWaiting(taskId)
                          : undefined
                      }
                      onToggleComplete={() => {
                        if (item.type === 'task' && taskId) {
                          onToggleTask(taskId)
                        } else if (item.type === 'routine' && onCompleteRoutine) {
                          onCompleteRoutine(routineEntityId, !item.completed)
                        } else if (item.type === 'event' && onCompleteEvent) {
                          onCompleteEvent(item.id.replace('event-', ''), !item.completed)
                        }
                      }}
                      onPush={
                        item.type === 'task' && taskId && onPushTask
                          ? (target) => onPushTask(taskId, target)
                          : item.type === 'routine' && onPushRoutine
                          ? (date) => { if (date instanceof Date) onPushRoutine(bareRoutineId, date) }
                          : item.type === 'event' && onPushEvent
                          ? (date) => { if (date instanceof Date) onPushEvent(item.id.replace('event-', ''), date) }
                          : undefined
                      }
                      onSchedule={
                        item.type === 'task' && taskId && onUpdateTask
                          ? (date, isAllDay) => onUpdateTask(taskId, { bucket: 'timed', scheduledFor: date, isAllDay })
                          : undefined
                      }
                      onSkip={
                        item.type === 'routine' && onSkipRoutine
                          ? () => onSkipRoutine(routineEntityId)
                          : item.type === 'event' && onSkipEvent
                          ? () => onSkipEvent(item.id.replace('event-', ''))
                          : undefined
                      }
                      contactName={contactName}
                      projectName={projectName}
                      projectId={item.projectId ?? undefined}
                      // Inside a group card the parent's name is already the
                      // header two rows up — repeating it on every child is
                      // noise. Keep it for an orphan child, where it is the
                      // only thing saying what this row belongs to.
                      parentTaskName={isGroupChild ? undefined : parentTaskName}
                      parentTaskId={parentTaskId}
                      onOpenParentTask={onOpenTask}
                      familyMembers={familyMembers}
                      assignedTo={item.assignedTo}
                      onAssign={
                        item.type === 'task' && taskId && onAssignTask
                          ? (memberId) => onAssignTask(taskId, memberId)
                          : item.type === 'event' && onAssignEvent
                          ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
                          : item.type === 'routine' && onAssignRoutine
                          ? (memberId) => onAssignRoutine(bareRoutineId, memberId)
                          : undefined
                      }
                      assignedToAll={
                        item.type === 'event' && eventNotesMap
                          ? eventNotesMap.get(item.id.replace('event-', ''))?.assignedToAll ?? []
                          : item.type === 'task'
                          ? item.originalTask?.assignedToAll ?? []
                          : item.type === 'routine'
                          ? item.originalRoutine?.assigned_to_all ?? []
                          : []
                      }
                      onAssignAll={
                        item.type === 'task' && taskId && onAssignTaskAll
                          ? (memberIds) => onAssignTaskAll(taskId, memberIds)
                          : item.type === 'event' && onAssignEventAll
                          ? (memberIds) => onAssignEventAll(item.id.replace('event-', ''), memberIds)
                          : item.type === 'routine' && onAssignRoutineAll
                          ? (memberIds) => onAssignRoutineAll(bareRoutineId, memberIds)
                          : undefined
                      }
                      onContextChange={
                        item.type === 'task' && taskId && onUpdateTask
                          ? (context) => onUpdateTask(taskId, { context })
                          : item.type === 'routine' && onUpdateRoutine
                          ? (context) => onUpdateRoutine(bareRoutineId, { context })
                          : item.type === 'event' && onUpdateEventContext
                          ? (context) => onUpdateEventContext(item.id.replace('event-', ''), context ?? null)
                          : undefined
                      }
                      onUpdateDiscussion={
                        item.type === 'task' && taskId && onUpdateTask
                          ? (next) => onUpdateTask(taskId, next)
                          : undefined
                      }
                      panelOpen={panelOpen}
                      onClosePanel={onClosePanel}
                      isSuggestedPromotion={
                        item.type === 'event'
                          ? isPromotionSuggested(item.id.replace('event-', ''))
                          : undefined
                      }
                      variant={item.type === 'routine' ? 'minimal' : 'full'}
                    />
                    {item.type === 'event' && (() => {
                      const nudge = shareNudgeByEventId.get(item.id.replace('event-', ''))
                      if (!nudge) return null
                      return (
                        <ShareToFamilyNudge
                          contextLabel={nudge.context}
                          onAdd={() => ctx.onShareEventWithFamily?.(nudge.eventId)}
                          onDismiss={() => ctx.onDismissShareNudge?.(nudge.eventId)}
                        />
                      )
                    })()}
                    {item.type === 'task' && taskId && onSendToBuy && !item.completed &&
                      isBuyish(item.title) && !isToBuyNudgeDismissed(taskId) && (
                      <ToBuyNudge
                        onSend={() => onSendToBuy(taskId)}
                        onDismiss={() => { dismissToBuyNudge(taskId); bumpToBuyDismissals() }}
                      />
                    )}
                        </>
                      )
                    })()}
                    </div>
                    </TodayDraggableRow>
                    </div>
                  )
                })}
                {/* Trailing insert point: after the last item per section */}
                {(() => {
                  const insertCtxTrailing = {
                    before: visible.length > 0 ? (visible[visible.length - 1].startTime ?? null) : null,
                    after: null,
                    section,
                    date: viewedDate,
                  }
                  return (
                    <TodayGapDropZone section={section} index={visible.length}>
                    <TimelineInsertPoint
                      onPick={(k) => insert.handlePick(insertCtxTrailing, k)}
                      onCreate={(kind, r) => {
                        if (kind === 'task') onCreateTaskAt?.(r)
                        else if (kind === 'event') onCreateEventAt?.(r)
                        else onCreateRoutineAt?.(r)
                      }}
                      quickInput={{
                        anchorTime: computeAnchorTime(insertCtxTrailing),
                        parserContext,
                      }}
                    />
                    </TodayGapDropZone>
                  )
                })()}
                {/* A cap that hides its own truncation is worse than a long
                    page — the count is always stated, and always expandable. */}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => expandSection(sectionKey(section))}
                    className="w-full text-left px-3 md:px-0 py-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    +{hiddenCount} more today
                  </button>
                )}
              </div>
            )}
            </TodayBandDropZone>
          </section>
        )
      })}
    </>
  )
}
