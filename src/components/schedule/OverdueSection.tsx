import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { ProactiveSuggestion, SuggestionEntityType } from '@/types/proactiveSuggestion'
import { ScheduleItem } from './ScheduleItem'
import { SwipeableCard } from './SwipeableCard'
import { FollowUpInput } from './FollowUpInput'
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
  onActSuggestion,
  onDismissSuggestion,
  onOpenGuidedChat,
}: OverdueSectionProps) {
  const isMobile = useMobile()

  // Sort: incomplete first (oldest at top), then completed at bottom
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    const dateA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
    const dateB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
    return dateA - dateB
  }), [tasks])

  if (tasks.length === 0) return null

  const handleToggle = (taskId: string, wasCompleted: boolean) => {
    if (onToggleWithFollowUp) {
      onToggleWithFollowUp(taskId, wasCompleted)
    } else {
      onToggleTask(taskId)
    }
  }

  return (
    <div
      role="region"
      aria-label="Carried over tasks"
      className="mb-10 animate-fade-in-up"
    >
      {/* Section header — calm, plain. These are obligations, not emergencies. */}
      <h3 className="time-group-header mb-4" style={{ color: 'hsl(220 9% 46%)' }}>
        Carried over
      </h3>

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
                {followUpTaskId === taskId && onFollowUpSubmit && onFollowUpDismiss && (
                  <FollowUpInput
                    sourceTask={task}
                    onSubmit={(title) => onFollowUpSubmit(title, taskId)}
                    onDismiss={onFollowUpDismiss}
                    projectName={projectName || undefined}
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
              />
              {followUpTaskId === taskId && onFollowUpSubmit && onFollowUpDismiss && (
                <FollowUpInput
                  sourceTask={task}
                  onSubmit={(title) => onFollowUpSubmit(title, taskId)}
                  onDismiss={onFollowUpDismiss}
                  projectName={projectName || undefined}
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

