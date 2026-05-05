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
import { getOverdueSuggestions, type OverdueSuggestion } from '@/lib/overdueSuggestions'

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
  followUpTaskId,
  onToggleWithFollowUp,
  onFollowUpSubmit,
  onFollowUpDismiss,
  panelOpen,
  onClosePanel,
  onDeleteTask,
  suggestionsForTask,
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
      aria-label="Overdue tasks"
      className="mb-10 animate-fade-in-up"
    >
      {/* Section header — warm but subtle */}
      <h3 className="time-group-header mb-4" style={{ color: 'hsl(32 60% 50%)' }}>
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

          // Prefer proactive suggestions from engine, fall back to rule-based
          const proactiveSuggs = suggestionsForTask?.('task', taskId) || []
          const fallbackSuggs = getOverdueSuggestions(task, contactName || undefined)

          return (
            <div key={task.id} className={`group/card ${parentVisible ? 'ml-6 border-l-2 border-neutral-200 pl-2' : ''}`}>
              <ScheduleItem
                item={item}
                selected={selectedItemId === `task-${task.id}`}
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
                suggestions={proactiveSuggs.length > 0 ? proactiveSuggs : undefined}
                onActSuggestion={onActSuggestion}
                onDismissSuggestion={onDismissSuggestion}
                onOpenGuidedChat={onOpenGuidedChat}
              />
              {/* Fallback rule-based suggestions (proactive ones show inline via ScheduleItem) */}
              {proactiveSuggs.length === 0 && fallbackSuggs.length > 0 && (
                <div className="h-0 group-hover/card:h-auto overflow-hidden transition-all">
                  <SuggestionChips
                    suggestions={fallbackSuggs}
                    taskId={taskId}
                    onPush={onPushTask}
                    onDelete={onDeleteTask}
                  />
                </div>
              )}
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

function SuggestionChips({
  suggestions,
  taskId,
  onPush,
  onDelete,
}: {
  suggestions: OverdueSuggestion[]
  taskId: string
  onPush?: (taskId: string, target: Date | 'week' | 'month' | 'quarter') => void
  onDelete?: (taskId: string) => void
}) {
  return (
    <div className="flex gap-2 ml-[6.5rem] mt-0.5 mb-2">
      {suggestions.map((s) => (
        <button
          key={s.type}
          onClick={() => {
            if (s.type === 'call' && s.phoneNumber) {
              window.open(`tel:${s.phoneNumber}`, '_self')
            } else if (s.type === 'open_link' && s.url) {
              window.open(s.url, '_blank')
            } else if (s.type === 'someday' && onPush) {
              onPush(taskId, 'quarter')
            } else if (s.type === 'stale' && onDelete) {
              onDelete(taskId)
            }
          }}
          className="text-xs px-2.5 py-1 rounded-full border transition-colors bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
        >
          {s.type === 'call' && (
            <span className="mr-1">&#9743;</span>
          )}
          {s.type === 'open_link' && (
            <span className="mr-1">&rarr;</span>
          )}
          {s.label}
        </button>
      ))}
    </div>
  )
}
