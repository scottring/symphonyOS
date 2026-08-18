import { useMemo, useReducer, useState } from 'react'
import { CornerUpLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { ToBuyNudge } from './ToBuyNudge'
import { isBuyish, isToBuyNudgeDismissed, dismissToBuyNudge } from '@/lib/lists/toBuy'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { ProactiveSuggestion, SuggestionEntityType } from '@/types/proactiveSuggestion'
import { ScheduleItem } from './ScheduleItem'
import { SwipeableCard } from './SwipeableCard'
import { FollowUpInput } from './FollowUpInput'
import { ProactiveSuggestionChips, isActionableSuggestion } from './ProactiveSuggestionChips'
import { taskToTimelineItem } from '@/types/timeline'
import { formatOverdueDate } from '@/lib/timeUtils'
import { useMobile } from '@/hooks/useMobile'

interface OverdueSectionProps {
  tasks: Task[]
  selectedItemId: string | null
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onToggleWaiting?: (taskId: string) => void
  onPushTask?: (taskId: string, target: Date | 'week' | 'month' | 'quarter') => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
  // Bulk multi-select (hover checkbox on each carried-over row)
  bulkSelectedIds?: Set<string>
  onToggleBulkSelect?: (taskId: string) => void
  followUpTaskId?: string | null
  onToggleWithFollowUp?: (taskId: string, wasCompleted: boolean) => void
  onFollowUpSubmit?: (title: string, sourceTaskId: string) => void
  onFollowUpDismiss?: () => void
  panelOpen?: boolean
  onClosePanel?: () => void
  onDeleteTask?: (taskId: string) => void
  /**
   * List-only mode for the backlog footer (2026-08-18): the parent renders the
   * "N carried over" line and owns expansion, so this skips the collapsed
   * strip and the section heading and renders just the task rows.
   */
  headerless?: boolean
  /** Convert a buy-ish task to a "To buy" list item (the host owns the undo toast). */
  onSendToBuy?: (taskId: string) => void
  // Proactive suggestions
  suggestionsForTask?: (entityType: SuggestionEntityType, entityId: string) => ProactiveSuggestion[]
  onActSuggestion?: (suggestionId: string, detail?: string, outcome?: string) => void
  onDismissSuggestion?: (suggestionId: string) => void
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}

export function OverdueSection({
  tasks,
  selectedItemId,
  onSelectTask,
  onToggleTask,
  onToggleWaiting,
  onPushTask,
  onUpdateTask,
  contactsMap,
  projectsMap,
  familyMembers = [],
  onAssignTask,
  onAssignTaskAll,
  bulkSelectedIds,
  onToggleBulkSelect,
  followUpTaskId,
  onToggleWithFollowUp,
  onFollowUpSubmit,
  onFollowUpDismiss,
  panelOpen,
  onClosePanel,
  suggestionsForTask,
  onActSuggestion,
  onDismissSuggestion,
  onOpenGuidedChat,
  headerless = false,
  onSendToBuy,
}: OverdueSectionProps) {
  const isMobile = useMobile()
  const [expanded, setExpanded] = useState(false)

  // Dismissing a To buy nudge writes localStorage, which React can't see —
  // this tick exists purely to re-render so the dismissed nudge disappears.
  const [, bumpToBuyDismissals] = useReducer((x: number) => x + 1, 0)

  // Sort: incomplete first (oldest at top), then completed at bottom — and then
  // pull every child up to sit directly beneath its own parent.
  //
  // The date sort alone scattered children away from their parents, while a row
  // is indented whenever its parent is anywhere in this list. The result read as
  // a false parent/child relationship: four yard subtasks rendered nested under
  // an unrelated "Pay Camp Notre Dame final session payment", which itself
  // showed 1/1. Adjacency is what the indentation is claiming, so adjacency is
  // what it has to have — the same rule grouping.ts applies to the day sections.
  const sortedTasks = useMemo(() => {
    const base = [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const dateA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const dateB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return dateA - dateB
    })

    const present = new Set(base.map((t) => t.id))
    const childrenOf = new Map<string, typeof base>()
    for (const t of base) {
      if (!t.parentTaskId || !present.has(t.parentTaskId)) continue
      const arr = childrenOf.get(t.parentTaskId) ?? []
      arr.push(t)
      childrenOf.set(t.parentTaskId, arr)
    }
    if (childrenOf.size === 0) return base

    const claimed = new Set([...childrenOf.values()].flat().map((t) => t.id))
    const out: typeof base = []
    for (const t of base) {
      if (claimed.has(t.id)) continue // emitted directly under its parent
      out.push(t)
      for (const child of childrenOf.get(t.id) ?? []) out.push(child)
    }
    return out
  }, [tasks])

  if (tasks.length === 0) return null

  const handleToggle = (taskId: string, wasCompleted: boolean) => {
    if (onToggleWithFollowUp) {
      onToggleWithFollowUp(taskId, wasCompleted)
    } else {
      onToggleTask(taskId)
    }
  }

  const incompleteCount = tasks.filter((t) => !t.completed).length
  const firstIncomplete = sortedTasks.find((t) => !t.completed) ?? sortedTasks[0]

  // Collapsed by default: carried-over items are obligations to review, not
  // the day's headline — one calm line keeps the timeline above the fold.
  // (Headerless mode: the footer owns that line, so go straight to the list.)
  if (!headerless && !expanded) {
    return (
      <div role="region" aria-label="Carried over tasks">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="w-full flex items-center gap-2 px-3 md:px-0 py-1 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          <CornerUpLeft className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
          <span className="font-medium text-amber-700/90 shrink-0">
            {incompleteCount || tasks.length} carried over
          </span>
          {firstIncomplete && (
            <span className="min-w-0 truncate text-neutral-500">
              — {firstIncomplete.title}
              {tasks.length > 1 ? ` +${tasks.length - 1} more` : ''}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
        </button>
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Carried over tasks"
      className={headerless ? 'animate-fade-in-up' : 'mb-10 animate-fade-in-up'}
    >
      {/* Section header — calm, plain. These are obligations, not emergencies. */}
      {!headerless && (
        <h3 className="time-group-header mb-4 flex items-center gap-2" style={{ color: 'hsl(220 9% 46%)' }}>
          Carried over
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Collapse carried over"
            className="inline-flex items-center text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </h3>
      )}

      <div className="timeline-group timeline-group--tight stagger-in">
        {sortedTasks.map((task, index) => {
          const item = taskToTimelineItem(task)
          const taskId = task.id
          const contactName = task.contactId && contactsMap?.get(task.contactId)?.name
          const projectName = task.projectId && projectsMap?.get(task.projectId)?.name
          const overdueLabel = task.scheduledFor
            ? formatOverdueDate(new Date(task.scheduledFor))
            : undefined

          // Deduplicate: only show date label on first item of each date group
          const prevTask = index > 0 ? sortedTasks[index - 1] : null
          const prevLabel = prevTask?.scheduledFor
            ? formatOverdueDate(new Date(prevTask.scheduledFor))
            : undefined
          const shouldHideTime = index > 0 && overdueLabel === prevLabel

          // Only show as indented subtask if parent is also visible in this list
          const parentVisible = task.parentTaskId ? sortedTasks.some(t => t.id === task.parentTaskId) : false

          if (isMobile) {
            return (
              <div key={task.id} className={parentVisible ? 'ml-6 border-l-2 border-neutral-200 pl-2' : ''}>
                <SwipeableCard
                  item={item}
                  selected={selectedItemId === `task-${task.id}`}
                  onSelect={() => onSelectTask(`task-${task.id}`)}
                  onComplete={() => handleToggle(taskId, !!task.completed)}
                  onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(taskId) : undefined}
                  onDefer={onPushTask ? (target: Date | 'week' | 'month' | 'quarter') => onPushTask(taskId, target) : undefined}
                  familyMembers={familyMembers}
                  assignedTo={task.assignedTo}
                  assignedToAll={task.assignedToAll ?? []}
                  onAssignAll={
                    onAssignTaskAll
                      ? (memberIds) => onAssignTaskAll(taskId, memberIds)
                      : undefined
                  }
                  onOpenDetail={() => onSelectTask(`task-${task.id}`)}
                />
                {suggestionsForTask && (
                  <ProactiveSuggestionChips
                    suggestions={suggestionsForTask('task', task.id)
                    .filter((s) => isActionableSuggestion(s, { hasGuidedChat: !!onOpenGuidedChat }))
                    .slice(0, 1)}
                    onAct={onActSuggestion ?? (() => {})}
                    onDismiss={onDismissSuggestion ?? (() => {})}
                    onOpenGuidedChat={onOpenGuidedChat}
                    className="ml-0 mt-1"
                  />
                )}
                {followUpTaskId === taskId && onFollowUpSubmit && onFollowUpDismiss && (
                  <FollowUpInput
                    sourceTask={task}
                    onSubmit={(title) => onFollowUpSubmit(title, taskId)}
                    onDismiss={onFollowUpDismiss}
                    projectName={projectName || undefined}
                  />
                )}
                {onSendToBuy && !task.completed && isBuyish(task.title) && !isToBuyNudgeDismissed(taskId) && (
                  <ToBuyNudge
                    onSend={() => onSendToBuy(taskId)}
                    onDismiss={() => { dismissToBuyNudge(taskId); bumpToBuyDismissals() }}
                  />
                )}
              </div>
            )
          }

          return (
            <OverdueCard
              key={task.id}
              parentVisible={parentVisible}
            >
              <ScheduleItem
                item={item}
                selected={selectedItemId === `task-${task.id}`}
                bulkSelectable
                bulkSelected={bulkSelectedIds?.has(task.id)}
                showBulkAffordance={(bulkSelectedIds?.size ?? 0) > 0}
                onToggleBulkSelect={onToggleBulkSelect ? () => onToggleBulkSelect(task.id) : undefined}
                onSelect={() => onSelectTask(`task-${task.id}`)}
                onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(taskId) : undefined}
                onToggleComplete={() => handleToggle(taskId, !!task.completed)}
                onPush={onPushTask ? (target: Date | 'week' | 'month' | 'quarter') => onPushTask(taskId, target) : undefined}
                onSchedule={onUpdateTask ? (date: Date, isAllDay: boolean) => onUpdateTask(taskId, { bucket: 'timed', scheduledFor: date, isAllDay }) : undefined}
                contactName={contactName || undefined}
                projectName={projectName || undefined}
                projectId={task.projectId || undefined}
                familyMembers={familyMembers}
                assignedTo={task.assignedTo}
                assignedToAll={task.assignedToAll ?? []}
                onAssign={
                  onAssignTask
                    ? (memberId) => onAssignTask(taskId, memberId)
                    : undefined
                }
                onAssignAll={
                  onAssignTaskAll
                    ? (memberIds) => onAssignTaskAll(taskId, memberIds)
                    : undefined
                }
                onContextChange={onUpdateTask ? (context) => onUpdateTask(taskId, { context }) : undefined}
                onUpdateDiscussion={onUpdateTask ? (next) => onUpdateTask(taskId, next) : undefined}
                isOverdue={!task.completed}
                overdueLabel={task.completed ? undefined : overdueLabel}
                hideTime={shouldHideTime}
                panelOpen={panelOpen}
                onClosePanel={onClosePanel}
                // Under the title and left-aligned WITH it. As a block sibling of
                // the whole row it sat at the card's left edge, beneath the date
                // gutter and checkbox, so it read as the NEXT task's chip.
                belowTitleAccessory={suggestionsForTask ? (
                  <ProactiveSuggestionChips
                    suggestions={suggestionsForTask('task', task.id)
                      .filter((s) => isActionableSuggestion(s, { hasGuidedChat: !!onOpenGuidedChat }))
                      .slice(0, 1)}
                    onAct={onActSuggestion ?? (() => {})}
                    onDismiss={onDismissSuggestion ?? (() => {})}
                    onOpenGuidedChat={onOpenGuidedChat}
                    className="ml-0"
                  />
                ) : undefined}
              />
              {followUpTaskId === taskId && onFollowUpSubmit && onFollowUpDismiss && (
                <FollowUpInput
                  sourceTask={task}
                  onSubmit={(title) => onFollowUpSubmit(title, taskId)}
                  onDismiss={onFollowUpDismiss}
                  projectName={projectName || undefined}
                />
              )}
              {onSendToBuy && !task.completed && isBuyish(task.title) && !isToBuyNudgeDismissed(taskId) && (
                <ToBuyNudge
                  onSend={() => onSendToBuy(taskId)}
                  onDismiss={() => { dismissToBuyNudge(taskId); bumpToBuyDismissals() }}
                />
              )}
            </OverdueCard>
          )
        })}
      </div>
    </div>
  )
}

function OverdueCard({
  children,
  parentVisible,
}: {
  children: React.ReactNode
  parentVisible: boolean
}) {
  return (
    <div className={parentVisible ? 'ml-6 border-l-2 border-neutral-200 pl-2' : ''}>
      {children}
    </div>
  )
}

