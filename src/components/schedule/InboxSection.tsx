import { useState, useEffect, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { ScheduleContextItem } from '@/components/triage'
import { InboxTaskCard } from './InboxTaskCard'
import { SwipeableCard } from './SwipeableCard'
import { TriageCard, InboxTriageModal } from '@/components/triage'
import { useMobile } from '@/hooks/useMobile'
import { taskToTimelineItem } from '@/types/timeline'
import { ChevronRight } from 'lucide-react'

interface InboxSectionProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, date: Date) => void
  onSelectTask: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onAddTask?: (task: { title: string; projectId?: string }) => Promise<Task | null>
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  recentlyCreatedTaskId?: string | null
  onTriageCardCollapse?: () => void
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  currentUserId?: string
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Bulk selection mode
  selectionMode?: boolean
  selectedIds?: Set<string>
  onEnterSelectionMode?: (taskId: string) => void
  onToggleSelect?: (taskId: string) => void
  // Calendar integration
  onAddToCalendar?: (task: Task) => Promise<void>
  addingToCalendarTaskId?: string | null
  // Collapsible state
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function InboxSection({
  tasks,
  onUpdateTask,
  onPushTask,
  onSelectTask,
  onDeleteTask,
  onAddTask,
  projects = [],
  contacts: _contacts = [],
  onSearchContacts: _onSearchContacts,
  onAddContact: _onAddContact,
  onAddProject,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
  onOpenProject,
  familyMembers = [],
  onAssignTask,
  currentUserId,
  getScheduleItemsForDate,
  selectionMode,
  selectedIds,
  onEnterSelectionMode,
  onToggleSelect,
  onAddToCalendar,
  addingToCalendarTaskId,
  collapsed: externalCollapsed,
  onCollapsedChange,
}: InboxSectionProps) {
  // Suppress unused variable warnings - these are kept in the interface for future use
  void _contacts
  void _onSearchContacts
  void _onAddContact

  const isMobile = useMobile()

  // Triage modal state
  const [triageTaskId, setTriageTaskId] = useState<string | null>(null)
  const triageTask = triageTaskId ? tasks.find(t => t.id === triageTaskId) : null

  // Handler for completing a task (used by SwipeableCard on mobile)
  const handleCompleteTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      onUpdateTask(taskId, { completed: !task.completed })
    }
  }, [tasks, onUpdateTask])

  // Internal collapsed state with user override capability
  const [userOverride, setUserOverride] = useState<boolean | null>(null)

  // Reset user override when external collapsed state changes (e.g., toggling Focus Mode)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on prop change
    setUserOverride(null)
  }, [externalCollapsed])

  // Determine actual collapsed state: user override takes priority
  const isCollapsed = userOverride !== null ? userOverride : (externalCollapsed ?? false)

  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setUserOverride(newState)
    onCollapsedChange?.(newState)
  }

  // Don't render if no inbox tasks
  if (tasks.length === 0) return null

  // Find the recently created task for the triage card
  const recentlyCreatedTask = recentlyCreatedTaskId
    ? tasks.find(t => t.id === recentlyCreatedTaskId)
    : null

  // Other tasks (excluding the recently created one if it exists)
  const otherTasks = recentlyCreatedTask
    ? tasks.filter(t => t.id !== recentlyCreatedTaskId)
    : tasks

  return (
    <div className="mb-10 mt-8 overflow-hidden">
      {/* Section header - clickable for collapse */}
      <button
        onClick={handleToggleCollapse}
        className="flex items-center gap-3 mb-5 w-full text-left group/header"
      >
        {/* Collapse chevron */}
        <ChevronRight
          className={`w-4 h-4 text-neutral-300 transition-transform duration-200 ${
            isCollapsed ? '' : 'rotate-90'
          }`}
        />

        {/* Icon */}
        <span className="text-neutral-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </span>

        {/* Label with decorative line */}
        <h2 className="time-group-header flex items-center gap-3">
          Inbox
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 bg-neutral-100 text-neutral-500 rounded-md text-xs font-semibold">
            {tasks.length}
          </span>
          <span className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent min-w-[40px]" />
        </h2>
      </button>

      {/* Items with collapse animation */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[4000px] opacity-100'
        }`}
      >
      <div className="md:space-y-2">
        {/* Show TriageCard for recently created task at the top */}
        {recentlyCreatedTask && onTriageCardCollapse && (
          <TriageCard
            task={recentlyCreatedTask}
            onUpdate={(updates) => onUpdateTask(recentlyCreatedTask.id, updates)}
            onDefer={(date) => {
              if (date) {
                onPushTask(recentlyCreatedTask.id, date)
              } else {
                onUpdateTask(recentlyCreatedTask.id, { deferredUntil: undefined })
              }
            }}
            onCollapse={onTriageCardCollapse}
            projects={projects}
            familyMembers={familyMembers}
            onAssignTask={onAssignTask ? (memberId) => onAssignTask(recentlyCreatedTask.id, memberId) : undefined}
            getScheduleItemsForDate={getScheduleItemsForDate}
          />
        )}

        {/* Show regular cards for other tasks */}
        {otherTasks.map((task) => {
          // Use SwipeableCard on mobile for better touch interactions
          if (isMobile) {
            const timelineItem = taskToTimelineItem(task)
            return (
              <SwipeableCard
                key={task.id}
                item={timelineItem}
                selected={false}
                onSelect={() => {}}
                onComplete={() => handleCompleteTask(task.id)}
                onDefer={(date: Date) => onPushTask(task.id, date)}
                onOpenDetail={() => onSelectTask(task.id)}
                familyMembers={familyMembers}
                assignedTo={task.assignedTo}
                onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
                selectionMode={selectionMode}
                multiSelected={selectedIds?.has(task.id)}
                onLongPress={onEnterSelectionMode ? () => onEnterSelectionMode(task.id) : undefined}
                onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
              />
            )
          }

          // Desktop: use InboxTaskCard with hover actions
          return (
            <InboxTaskCard
              key={task.id}
              task={task}
              onDefer={(date) => {
                console.log('[InboxSection] onDefer called:', { taskId: task.id, date, dateStr: date?.toISOString() })
                if (date) {
                  // Defer to specified date
                  onPushTask(task.id, date)
                } else {
                  // Clear deferral - show now
                  onUpdateTask(task.id, { deferredUntil: undefined })
                }
              }}
              onSchedule={(date, isAllDay) => {
                onUpdateTask(task.id, { scheduledFor: date, isAllDay, deferredUntil: undefined })
              }}
              onUpdate={(updates) => onUpdateTask(task.id, updates)}
              onSelect={() => onSelectTask(task.id)}
              onTriage={() => setTriageTaskId(task.id)}
              projects={projects}
              onOpenProject={onOpenProject}
              familyMembers={familyMembers}
              onAssignTask={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
              getScheduleItemsForDate={getScheduleItemsForDate}
              selectionMode={selectionMode}
              multiSelected={selectedIds?.has(task.id)}
              onLongPress={onEnterSelectionMode ? () => onEnterSelectionMode(task.id) : undefined}
              onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
              onAddToCalendar={onAddToCalendar ? () => onAddToCalendar(task) : undefined}
              isAddingToCalendar={addingToCalendarTaskId === task.id}
            />
          )
        })}
      </div>
      </div>

      {/* Inbox Triage Modal */}
      {triageTask && (
        <InboxTriageModal
          task={triageTask}
          isOpen={!!triageTaskId}
          onClose={() => setTriageTaskId(null)}
          onProcessAsTask={(updates) => {
            onUpdateTask(triageTask.id, updates)
            setTriageTaskId(null)
          }}
          onConvertToProject={async (name, projectTasks) => {
            // Create project with tasks, then delete the original inbox item
            if (onAddProject) {
              const project = await onAddProject({ name })
              if (project && onAddTask) {
                // Create all the tasks linked to the new project
                for (const task of projectTasks) {
                  await onAddTask({ title: task.title, projectId: project.id })
                }
              }
              // Delete the original inbox task - it's now a project
              if (onDeleteTask) {
                onDeleteTask(triageTask.id)
              }
              // Navigate to the new project
              if (project && onOpenProject) {
                onOpenProject(project.id)
              }
            }
            setTriageTaskId(null)
          }}
          onDelete={() => {
            if (onDeleteTask) {
              onDeleteTask(triageTask.id)
            }
            setTriageTaskId(null)
          }}
          projects={projects}
          familyMembers={familyMembers}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}
