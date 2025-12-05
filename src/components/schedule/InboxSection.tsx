import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { InboxTaskCard } from './InboxTaskCard'
import { TriageCard } from '@/components/triage'

interface InboxSectionProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, date: Date) => void
  onSelectTask: (taskId: string) => void
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  recentlyCreatedTaskId?: string | null
  onTriageCardCollapse?: () => void
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
}

export function InboxSection({
  tasks,
  onUpdateTask,
  onPushTask,
  onSelectTask,
  projects = [],
  contacts = [],
  onSearchContacts,
  onAddContact,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
  onOpenProject,
  familyMembers = [],
  onAssignTask,
}: InboxSectionProps) {
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
            onPush={(date) => onPushTask(recentlyCreatedTask.id, date)}
            onCollapse={onTriageCardCollapse}
            projects={projects}
            contacts={contacts}
            onSearchContacts={onSearchContacts}
            onAddContact={onAddContact}
          />
        )}

        {/* Show regular cards for other tasks */}
        {otherTasks.map((task) => (
          <InboxTaskCard
            key={task.id}
            task={task}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onPush={(date) => onPushTask(task.id, date)}
            onSelect={() => onSelectTask(task.id)}
            projects={projects}
            contacts={contacts}
            onSearchContacts={onSearchContacts}
            onAddContact={onAddContact}
            onOpenProject={onOpenProject}
            familyMembers={familyMembers}
            onAssign={onAssignTask
              ? (memberId) => onAssignTask(task.id, memberId)
              : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
