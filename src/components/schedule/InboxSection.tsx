import { useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { InboxTaskCard } from './InboxTaskCard'
import { TriageCard, InboxTriageModal } from '@/components/triage'

interface InboxSectionProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, date: Date) => void
  onSelectTask: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
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
}

export function InboxSection({
  tasks,
  onUpdateTask,
  onPushTask,
  onSelectTask,
  onDeleteTask,
  projects = [],
  contacts = [],
  onSearchContacts,
  onAddContact,
  onAddProject,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
  onOpenProject,
  familyMembers = [],
  onAssignTask,
  currentUserId,
}: InboxSectionProps) {
  // Triage modal state
  const [triageTaskId, setTriageTaskId] = useState<string | null>(null)
  const triageTask = triageTaskId ? tasks.find(t => t.id === triageTaskId) : null

  // Note: contacts/onSearchContacts/onAddContact kept for TriageCard, but not passed to InboxTaskCard
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
            onAssignTask={onAssignTask ? (memberId) => onAssignTask(recentlyCreatedTask.id, memberId) : undefined}
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
          onConvertToProject={async (name, _domain) => {
            // Create project and delete the inbox task
            if (onAddProject) {
              await onAddProject({ name })
              // Delete the original task - it's now a project
              if (onDeleteTask) {
                onDeleteTask(triageTask.id)
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
