import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { InboxTaskCard } from './InboxTaskCard'

interface InboxSectionProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onSelectTask: (taskId: string) => void
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
}

export function InboxSection({
  tasks,
  onUpdateTask,
  onSelectTask,
  projects = [],
  contacts = [],
  onSearchContacts,
}: InboxSectionProps) {
  // Don't render if no inbox tasks
  if (tasks.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="font-display text-sm tracking-wide text-neutral-500 uppercase mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
        </svg>
        Inbox ({tasks.length})
      </h2>
      <div className="space-y-3">
        {tasks.map((task) => (
          <InboxTaskCard
            key={task.id}
            task={task}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onSelect={() => onSelectTask(task.id)}
            projects={projects}
            contacts={contacts}
            onSearchContacts={onSearchContacts}
          />
        ))}
      </div>
    </div>
  )
}
