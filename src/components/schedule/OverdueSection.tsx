import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
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
  followUpTaskId?: string | null
  onToggleWithFollowUp?: (taskId: string, wasCompleted: boolean) => void
  onFollowUpSubmit?: (title: string, sourceTaskId: string) => void
  onFollowUpDismiss?: () => void
  panelOpen?: boolean
  onClosePanel?: () => void
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
  followUpTaskId,
  onToggleWithFollowUp,
  onFollowUpSubmit,
  onFollowUpDismiss,
  panelOpen,
  onClosePanel,
}: OverdueSectionProps) {
  const isMobile = useMobile()

  if (tasks.length === 0) return null

  // Sort: incomplete first (oldest at top), then completed at bottom
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    const dateA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
    const dateB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
    return dateA - dateB
  }), [tasks])

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
      aria-label="Overdue tasks"
      className="mb-10 animate-fade-in-up"
    >
      {/* Section header — "Overdue" in amber, same style as MORNING etc. */}
      <h3 className="time-group-header mb-4" style={{ color: 'hsl(32 80% 44%)' }}>
        Overdue
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

          if (isMobile) {
            return (
              <div key={task.id}>
                <SwipeableCard
                  item={item}
                  selected={selectedItemId === `task-${task.id}`}
                  onSelect={() => onSelectTask(`task-${task.id}`)}
                  onComplete={() => handleToggle(taskId, !!task.completed)}
                  onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(taskId) : undefined}
                  onDefer={onPushTask ? (target: Date | 'week' | 'month' | 'quarter') => onPushTask(taskId, target) : undefined}
                  familyMembers={familyMembers}
                  assignedTo={task.assignedTo}
                  onAssign={
                    onAssignTask
                      ? (memberId) => onAssignTask(taskId, memberId)
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
            <div key={task.id}>
              <ScheduleItem
                item={item}
                selected={selectedItemId === `task-${task.id}`}
                onSelect={() => onSelectTask(`task-${task.id}`)}
                onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(taskId) : undefined}
                onToggleComplete={() => handleToggle(taskId, !!task.completed)}
                onPush={onPushTask ? (target: Date | 'week' | 'month' | 'quarter') => onPushTask(taskId, target) : undefined}
                contactName={contactName || undefined}
                projectName={projectName || undefined}
                projectId={task.projectId || undefined}
                familyMembers={familyMembers}
                assignedTo={task.assignedTo}
                onAssign={
                  onAssignTask
                    ? (memberId) => onAssignTask(taskId, memberId)
                    : undefined
                }
                onContextChange={onUpdateTask ? (context) => onUpdateTask(taskId, { context }) : undefined}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
