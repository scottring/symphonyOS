import { useMemo, useCallback, useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useDomain } from '@/hooks/useDomain'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { InboxTaskCard } from './InboxTaskCard'

interface InboxViewProps {
  tasks: Task[]
  projects: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  panelOpen: boolean
  onClosePanel: () => void
  currentUserMemberId?: string
}

export function InboxView({
  tasks,
  projects,
  selectedItemId,
  onSelectItem,
  panelOpen,
  onClosePanel,
  currentUserMemberId,
}: InboxViewProps) {
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTaskAll,
    familyMembers = [],
    lists = [], listsByCategory, onSendToList, onCreateList,
    onOpenProject,
  } = useScheduleActionsContext()

  const { currentDomain } = useDomain()

  // Domain + privacy filtering (matches HomeView logic)
  const filteredByDomain = useMemo(() => {
    return tasks.filter(task => {
      // Hide other members' work/personal tasks (private domains)
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignee = task.assignedTo || (task.assignedToAll?.[0])
        if (assignee && assignee !== currentUserMemberId) return false
      }
      // Universal shows everything passing privacy filter
      if (currentDomain === 'universal') return true
      // Always show inbox tasks regardless of domain — they need triage
      if (task.bucket === 'inbox' && !task.completed) return true
      // Specific domain match
      return task.context === currentDomain
    })
  }, [tasks, currentDomain, currentUserMemberId])

  // Assignee filter state
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  // Assignee filtering
  const filteredTasks = useMemo(() => {
    if (selectedAssignees.length === 0) return filteredByDomain
    return filteredByDomain.filter(task => {
      if (selectedAssignees.includes('unassigned')) {
        return !task.assignedTo && (!task.assignedToAll || task.assignedToAll.length === 0)
      }
      return selectedAssignees.some(id =>
        task.assignedTo === id || task.assignedToAll?.includes(id)
      )
    })
  }, [filteredByDomain, selectedAssignees])

  // For AssigneeFilter component
  const hasUnassignedTasks = useMemo(() => {
    return filteredByDomain.some(t =>
      !t.completed && !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0)
    )
  }, [filteredByDomain])

  // Inbox tasks: bucket='inbox', not completed
  const inboxTasks = useMemo(() => {
    return filteredTasks
      .filter(t => !t.completed && t.bucket === 'inbox')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [filteredTasks])

  // Week tasks: bucket='week', not completed
  const weekTasks = useMemo(() => {
    return filteredTasks
      .filter(t => !t.completed && t.bucket === 'week')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [filteredTasks])

  // Month tasks: bucket='month', not completed
  const monthTasks = useMemo(() => {
    return filteredTasks
      .filter(t => !t.completed && t.bucket === 'month')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [filteredTasks])

  const handleSelectTask = useCallback((taskId: string) => {
    onSelectItem(`task-${taskId}`)
  }, [onSelectItem])

  const totalCount = inboxTasks.length + weekTasks.length + monthTasks.length

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Inbox</h1>
          {familyMembers.length > 0 && (
            <AssigneeFilter
              selectedAssignees={selectedAssignees}
              onSelectAssignees={setSelectedAssignees}
              assigneesWithTasks={familyMembers}
              hasUnassignedTasks={hasUnassignedTasks}
            />
          )}
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {totalCount === 0
            ? 'All clear — nothing to triage'
            : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`
          }
        </p>
      </header>

      {totalCount === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
          <p className="text-neutral-500">Press <kbd className="px-2 py-1 bg-neutral-100 rounded-md text-xs font-mono">Cmd+K</kbd> to capture something</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* New / Inbox items */}
          {inboxTasks.length > 0 && (
            <section>
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
                </svg>
                New ({inboxTasks.length})
              </h2>
              <div className="space-y-2">
                {inboxTasks.map(task => (
                  <InboxTaskCard
                    key={task.id}
                    task={task}
                    onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                    onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
                    onSelect={() => handleSelectTask(task.id)}
                    onDefer={(target) => onPushTask?.(task.id, target)}
                    projects={projects}
                    onOpenProject={onOpenProject}
                    familyMembers={familyMembers}
                    onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
                    lists={lists}
                    listsByCategory={listsByCategory}
                    onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
                    onCreateList={onCreateList}
                    panelOpen={panelOpen && selectedItemId === `task-${task.id}`}
                    onClosePanel={onClosePanel}
                  />
                ))}
              </div>
            </section>
          )}

          {/* This Week items */}
          {weekTasks.length > 0 && (
            <section>
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3 flex items-center gap-2">
                <span className="block w-2.5 h-2.5 rounded-full bg-blue-400" />
                This Week ({weekTasks.length})
              </h2>
              <div className="space-y-2">
                {weekTasks.map(task => (
                  <InboxTaskCard
                    key={task.id}
                    task={task}
                    onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                    onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
                    onSelect={() => handleSelectTask(task.id)}
                    onDefer={(target) => onPushTask?.(task.id, target)}
                    projects={projects}
                    onOpenProject={onOpenProject}
                    familyMembers={familyMembers}
                    onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
                    lists={lists}
                    listsByCategory={listsByCategory}
                    onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
                    onCreateList={onCreateList}
                    panelOpen={panelOpen && selectedItemId === `task-${task.id}`}
                    onClosePanel={onClosePanel}
                  />
                ))}
              </div>
            </section>
          )}

          {/* This Month items */}
          {monthTasks.length > 0 && (
            <section>
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3 flex items-center gap-2">
                <span className="block w-2.5 h-2.5 rounded-full bg-violet-400" />
                This Month ({monthTasks.length})
              </h2>
              <div className="space-y-2">
                {monthTasks.map(task => (
                  <InboxTaskCard
                    key={task.id}
                    task={task}
                    onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                    onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
                    onSelect={() => handleSelectTask(task.id)}
                    onDefer={(target) => onPushTask?.(task.id, target)}
                    projects={projects}
                    onOpenProject={onOpenProject}
                    familyMembers={familyMembers}
                    onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
                    lists={lists}
                    listsByCategory={listsByCategory}
                    onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
                    onCreateList={onCreateList}
                    panelOpen={panelOpen && selectedItemId === `task-${task.id}`}
                    onClosePanel={onClosePanel}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
