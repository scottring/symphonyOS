import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { ScheduleItem } from './ScheduleItem'
import { taskToTimelineItem } from '@/types/timeline'
import { formatOverdueDate } from '@/lib/timeUtils'

interface OverdueSectionProps {
  tasks: Task[]
  selectedItemId: string | null
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onPushTask?: (taskId: string, date: Date) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  // Bulk selection mode
  selectionMode?: boolean
  selectedIds?: Set<string>
  onEnterSelectionMode?: (taskId: string) => void
  onToggleSelect?: (taskId: string) => void
}

// Warm amber color for overdue header
const colors = {
  warning600: 'hsl(32 80% 44%)',
}

export function OverdueSection({
  tasks,
  selectedItemId,
  onSelectTask,
  onToggleTask,
  onPushTask,
  contactsMap,
  projectsMap,
  familyMembers = [],
  onAssignTask,
  selectionMode,
  selectedIds,
  onEnterSelectionMode,
  onToggleSelect,
}: OverdueSectionProps) {
  if (tasks.length === 0) return null

  // Sort by oldest first (most overdue at top)
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
    const dateB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
    return dateA - dateB
  })

  return (
    <div
      role="region"
      aria-label="Overdue tasks"
      className="mb-8 animate-fade-in-up"
    >
      {/* Section header - matches TimeGroup styling */}
      <h3
        className="font-display text-sm tracking-wide uppercase mb-4 flex items-center gap-2"
        style={{ color: colors.warning600 }}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
        Overdue ({tasks.length})
      </h3>

      {/* Overdue task items */}
      <div className="space-y-3">
        {sortedTasks.map((task) => {
          const item = taskToTimelineItem(task)
          const taskId = task.id
          const contactName = task.contactId && contactsMap?.get(task.contactId)?.name
          const projectName = task.projectId && projectsMap?.get(task.projectId)?.name
          const overdueLabel = task.scheduledFor
            ? formatOverdueDate(new Date(task.scheduledFor))
            : undefined

          return (
            <ScheduleItem
              key={task.id}
              item={item}
              selected={selectedItemId === `task-${task.id}`}
              onSelect={() => onSelectTask(`task-${task.id}`)}
              onToggleComplete={() => onToggleTask(taskId)}
              onPush={onPushTask ? (date: Date) => onPushTask(taskId, date) : undefined}
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
              isOverdue
              overdueLabel={overdueLabel}
              selectionMode={selectionMode}
              multiSelected={selectedIds?.has(taskId)}
              onLongPress={onEnterSelectionMode ? () => onEnterSelectionMode(taskId) : undefined}
              onToggleSelect={onToggleSelect ? () => onToggleSelect(taskId) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
