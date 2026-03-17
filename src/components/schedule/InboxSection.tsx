import { useState } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact, ContactCategory } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import type { ScheduleContextItem } from '@/components/triage'
import { InboxTaskCard } from './InboxTaskCard'
import { TriageCard, InboxTriageModal } from '@/components/triage'
import { BulkActionToolbar } from './BulkActionToolbar'

interface InboxSectionProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onToggleWaiting?: (taskId: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSelectTask: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onAddTask?: (task: { title: string; projectId?: string }) => Promise<Task | null>
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory }) => Promise<Contact | null>
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
  // List picker props
  lists?: List[]
  listsByCategory?: Record<ListCategory, List[]>
  onSendToList?: (taskId: string, listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
  // Bulk actions
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void>
  // Panel state (for smart close behavior in cards)
  panelOpen?: boolean
  onClosePanel?: () => void
}

export function InboxSection({
  tasks,
  onUpdateTask,
  onToggleWaiting,
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
  lists = [],
  listsByCategory,
  onSendToList,
  onCreateList,
  onUpdateTasksBulk,
  panelOpen,
  onClosePanel,
}: InboxSectionProps) {
  // Suppress unused variable warnings - these are kept in the interface for future use
  void _contacts
  void _onSearchContacts
  void _onAddContact

  // Triage modal state
  const [triageTaskId, setTriageTaskId] = useState<string | null>(null)
  const triageTask = triageTaskId ? tasks.find(t => t.id === triageTaskId) : null

  // Selection state for bulk actions
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  // Bulk action handlers
  const handleBulkDefer = async (target: 'week' | 'month' | 'quarter') => {
    if (!onUpdateTasksBulk) return

    const taskIds = Array.from(selectedTaskIds)
    const updates: Partial<Task> = { bucket: target, scheduledFor: undefined }

    await onUpdateTasksBulk(taskIds, updates)

    // Clear selection and exit mode
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  const handleBulkSchedule = async (date: Date, isAllDay: boolean) => {
    if (!onUpdateTasksBulk) return

    const taskIds = Array.from(selectedTaskIds)
    const updates: Partial<Task> = {
      bucket: 'timed',
      scheduledFor: date,
      isAllDay,
    }

    await onUpdateTasksBulk(taskIds, updates)

    // Clear selection and exit mode
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  const handleBulkSetContext = async (context: TaskContext | undefined) => {
    if (!onUpdateTasksBulk) return

    const taskIds = Array.from(selectedTaskIds)
    const updates: Partial<Task> = { context }

    await onUpdateTasksBulk(taskIds, updates)

    // Clear selection and exit mode
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  const handleBulkAssign = async (memberIds: string[]) => {
    if (!onUpdateTasksBulk) return

    const taskIds = Array.from(selectedTaskIds)
    const updates: Partial<Task> = { assignedToAll: memberIds }

    await onUpdateTasksBulk(taskIds, updates)

    // Clear selection and exit mode
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  const handleBulkSendToList = async (listId: string) => {
    if (!onSendToList) return

    const taskIds = Array.from(selectedTaskIds)

    // Send each task to the list
    for (const taskId of taskIds) {
      onSendToList(taskId, listId)
    }

    // Clear selection and exit mode
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  const handleCancelSelection = () => {
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
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
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm tracking-wide text-neutral-500 uppercase flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
          </svg>
          Inbox ({tasks.length})
        </h2>
        <button
          onClick={() => {
            setSelectionMode(!selectionMode)
            if (selectionMode) {
              // Clear selection when exiting selection mode
              setSelectedTaskIds(new Set())
            }
          }}
          className={`text-sm font-medium transition-colors ${
            selectionMode
              ? 'text-primary-600 hover:text-primary-700'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {selectionMode ? 'Cancel' : 'Select'}
        </button>
      </div>
      <div className="space-y-3">
        {/* Show TriageCard for recently created task at the top */}
        {recentlyCreatedTask && onTriageCardCollapse && (
          <TriageCard
            task={recentlyCreatedTask}
            onUpdate={(updates) => onUpdateTask(recentlyCreatedTask.id, updates)}
            onDefer={(target) => onPushTask(recentlyCreatedTask.id, target)}
            onCollapse={onTriageCardCollapse}
            projects={projects}
            familyMembers={familyMembers}
            getScheduleItemsForDate={getScheduleItemsForDate}
            lists={lists}
            listsByCategory={listsByCategory}
            onSendToList={onSendToList ? (listId) => onSendToList(recentlyCreatedTask.id, listId) : undefined}
            onCreateList={onCreateList}
          />
        )}

        {/* Show regular cards for other tasks */}
        {otherTasks.map((task) => (
          <InboxTaskCard
            key={task.id}
            task={task}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
            onSelect={() => onSelectTask(task.id)}
            onDefer={(target) => onPushTask(task.id, target)}
            projects={projects}
            onOpenProject={onOpenProject}
            familyMembers={familyMembers}
            onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
            getScheduleItemsForDate={getScheduleItemsForDate}
            lists={lists}
            listsByCategory={listsByCategory}
            onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
            onCreateList={onCreateList}
            panelOpen={panelOpen}
            onClosePanel={onClosePanel}
            // Selection props
            selectionMode={selectionMode}
            isSelected={selectedTaskIds.has(task.id)}
            onToggleSelection={() => {
              setSelectedTaskIds(prev => {
                const next = new Set(prev)
                if (next.has(task.id)) {
                  next.delete(task.id)
                } else {
                  next.add(task.id)
                }
                return next
              })
            }}
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

      {/* Bulk Action Toolbar - shown when tasks are selected */}
      {selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          onDefer={handleBulkDefer}
          onSchedule={handleBulkSchedule}
          onSetContext={handleBulkSetContext}
          onAssign={handleBulkAssign}
          onSendToList={handleBulkSendToList}
          onCancel={handleCancelSelection}
          familyMembers={familyMembers}
          lists={lists}
          listsByCategory={listsByCategory}
          getScheduleItemsForDate={getScheduleItemsForDate}
        />
      )}
    </div>
  )
}
