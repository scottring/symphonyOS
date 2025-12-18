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
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
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
  onAssignTaskAll,
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
    <div className="mb-8">
      <h2 className="font-display text-sm tracking-wide text-neutral-500 uppercase mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
        </svg>
        Inbox ({tasks.length})
      </h2>
      <div className="space-y-3">
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
            onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
            projects={projects}
            onOpenProject={onOpenProject}
            familyMembers={familyMembers}
            onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
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
