import { useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { ScheduleContextItem } from '@/components/triage'
import { InboxTaskCard } from './InboxTaskCard'
import { TriageCard, InboxTriageModal } from '@/components/triage'

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
}: InboxSectionProps) {
  // Suppress unused variable warnings - these are kept in the interface for future use
  void _contacts
  void _onSearchContacts
  void _onAddContact

  // Triage modal state
  const [triageTaskId, setTriageTaskId] = useState<string | null>(null)
  const triageTask = triageTaskId ? tasks.find(t => t.id === triageTaskId) : null
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
    <div className="mb-10 mt-12">
      {/* Section header - refined editorial style */}
      <div className="flex items-center gap-3 mb-5">
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
      </div>

      <div className="space-y-2">
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
        {otherTasks.map((task) => (
          <InboxTaskCard
            key={task.id}
            task={task}
            onDefer={(date) => {
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
          />
        ))}
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
          onConvertToProject={async (name, projectTasks, _domain) => {
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
