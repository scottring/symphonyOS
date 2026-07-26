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
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { ParserContext } from '@/lib/quickInputParser'
import type { useTimelineInsert } from '@/hooks/useTimelineInsert'
import type { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'

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

// ─── Meal detection ────────────────────────────────────────────────────────────

const MEAL_RE = /breakfast|brunch|lunch|dinner|supper/i

function isMealItem(id: string, type: string, title: string): boolean {
  return String(id).startsWith('meal:') || (type === 'event' && MEAL_RE.test(title))
}

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
  /** The Up Next hero lifts its item out of its section. */
  upNextId: string | undefined
  firstSectionItemId: string | null
  collapsedKeys: Set<string>
  openedByUser: Set<string>
  onToggleSection: (section: DaySection, currentlyCollapsed: boolean) => void
  selectedKeys: Set<string>
  onToggleBulkSelect: (key: string) => void
  tasksMap: Map<string, Task>
  shareNudgeByEventId: Map<string, { eventId: string; context: string }>
  parserContext: ParserContext
  currentDomain: 'work' | 'family' | 'personal' | 'universal'
  insert: ReturnType<typeof useTimelineInsert>
  proactive: ReturnType<typeof useProactiveSuggestions>
  getRoutineStats: (id: string) => { currentStreak?: number } | undefined
  isPromotionSuggested: (eventId: string) => boolean
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  panelOpen?: boolean
  onClosePanel?: () => void
}

export function TodaySectionList({
  sectionsOrder,
  grouped,
  viewedDate,
  isMobile,
  selectedItemId,
  upNextId,
  firstSectionItemId,
  collapsedKeys,
  openedByUser,
  onToggleSection,
  selectedKeys,
  onToggleBulkSelect,
  tasksMap,
  shareNudgeByEventId,
  parserContext,
  currentDomain,
  insert,
  proactive,
  getRoutineStats,
  isPromotionSuggested,
  onSelectItem,
  onToggleTask,
  onCompleteRoutine,
  onCompleteEvent,
  panelOpen,
  onClosePanel,
}: TodaySectionListProps) {
  const ctx = useScheduleActionsContext()
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onOpenTask, onOpenGuidedChat,
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

  return (
    <>
      {sectionsOrder.map((section) => {
        const allSectionItems = grouped[section]
        if (!allSectionItems || allSectionItems.length === 0) return null

        // The hero item is lifted out of its section.
        const items = upNextId
          ? allSectionItems.filter((i) => i.id !== upNextId)
          : allSectionItems
        const completedCount = items.filter((i) => i.completed).length
        const restAllDone = items.length > 0 && completedCount === items.length
        const emptyBecauseHero = items.length === 0
        const key = sectionKey(section)

        // Precedence: empty-because-hero always collapses; an explicit fold
        // always wins; an explicit open overrides the auto rule; otherwise
        // auto-collapse when everything remaining is done. `collapsedKeys` and
        // `openedByUser` are independent facts — never derive one from the other.
        const collapsed = emptyBecauseHero
          ? true
          : collapsedKeys.has(key)
            ? true
            : openedByUser.has(key)
              ? false
              : restAllDone

        return (
          <section key={section}>
            <DaySectionHeader
              section={section}
              itemCount={items.length}
              completedCount={completedCount}
              collapsed={collapsed}
              emptyBecauseHero={emptyBecauseHero}
              onToggle={() => onToggleSection(section, collapsed)}
            />
            {!collapsed && (
              <div className="space-y-1">
                {items.map((item, itemIndex) => {
                  const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
                  const contactName = item.contactId && contactsMap?.get(item.contactId)?.name || undefined
                  const projectName = item.projectId && projectsMap?.get(item.projectId)?.name || undefined
                  const parentTaskId = item.parentTaskId
                  const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                  const isFirstItem = item.id === firstSectionItemId

                  // ── Group cards ──────────────────────────────────────
                  // A parent task and its adjacent subtask rows (grouping.ts
                  // places children directly after their parent within a
                  // section) render inside one enclosed, tinted card. Roles
                  // are derived purely from adjacency, so a parent whose
                  // children live in another section gets no card.
                  const prevItem = itemIndex > 0 ? items[itemIndex - 1] : null
                  const nextItem = itemIndex < items.length - 1 ? items[itemIndex + 1] : null
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

                  // Insert point before this item
                  const prevItemForInsert = itemIndex > 0 ? items[itemIndex - 1] : null
                  const insertCtxBefore = {
                    before: prevItemForInsert?.startTime ?? null,
                    after: item.startTime ?? null,
                    section,
                    date: viewedDate,
                  }
                  const insertBefore = (
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
                        currentDomain,
                      }}
                    />
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
                    const timeLabel = item.startTime
                      ? new Date(item.startTime).toLocaleTimeString('en-US', {
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
                        {showInsert && insertBefore}
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
                      </div>
                    )
                  }

                  // Routine collection — collapsed row with per-step completion
                  if (item.type === 'routine-collection') {
                    return (
                      <div key={item.id} data-item-id={item.id}>
                        {showInsert && insertBefore}
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
                    )
                  }

                  // Standard schedule item
                  return (
                    <div key={item.id} className={isGroupChild ? '-mt-1' : undefined}>
                    {showInsert && insertBefore}
                    <div data-item-id={item.id} className={groupCardClass || undefined} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
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
                      parentTaskName={parentTaskName}
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
                      routineStreak={
                        item.type === 'routine'
                          ? getRoutineStats(bareRoutineId)?.currentStreak
                          : undefined
                      }
                      suggestions={(() => {
                        const entityType = item.type === 'event' ? 'calendar_event' : item.type === 'task' ? 'task' : null
                        const entityId = item.type === 'event' ? item.id.replace('event-', '') : taskId
                        if (!entityType || !entityId) return undefined
                        const s = proactive.suggestionsForEntity(entityType, entityId)
                        return s.length > 0 ? s : undefined
                      })()}
                      onActSuggestion={proactive.actOnSuggestion}
                      onDismissSuggestion={proactive.dismissSuggestion}
                      onOpenGuidedChat={onOpenGuidedChat}
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
                        </>
                      )
                    })()}
                    </div>
                    </div>
                  )
                })}
                {/* Trailing insert point: after the last item per section */}
                {(() => {
                  const insertCtxTrailing = {
                    before: items.length > 0 ? (items[items.length - 1].startTime ?? null) : null,
                    after: null,
                    section,
                    date: viewedDate,
                  }
                  return (
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
                        currentDomain,
                      }}
                    />
                  )
                })()}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
