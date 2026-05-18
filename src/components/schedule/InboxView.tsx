// src/components/schedule/InboxView.tsx
import { useMemo, useCallback, useState } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useDomain } from '@/hooks/useDomain'
import { useInboxMode } from '@/hooks/useInboxMode'
import { useProjects } from '@/hooks/useProjects'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { HomeNeedsDetailsSection } from '@/apps/home/inbox/HomeNeedsDetailsSection'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { FocusInboxCard } from './FocusInboxCard'
import { InboxModeToggle } from './InboxModeToggle'
import { InboxUndoToast } from './InboxUndoToast'

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'delete' }
]

const BUCKET_LABELS: Record<'week' | 'month' | 'quarter', string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'Someday',
}

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
  undoable: boolean
  /** Optional extra async side-effect to run alongside the task update on undo */
  onUndoExtra?: () => Promise<void>
}

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
  tasks, projects, selectedItemId: _selectedItemId, onSelectItem,
  panelOpen: _panelOpen, onClosePanel: _onClosePanel, currentUserMemberId,
}: InboxViewProps) {
  const {
    onUpdateTask, onPushTask, onDeleteTask,
    onAssignTaskAll, familyMembers = [], onOpenProject, onToggleTask,
  } = useScheduleActionsContext()

  const { addProject, deleteProject } = useProjects()

  const { currentDomain } = useDomain()
  const [mode, setMode] = useInboxMode()

  const makeOnCreateProject = useCallback(
    (taskId: string) => async (name: string, context: TaskContext | null) => {
      const project = await addProject({ name, context: context ?? undefined })
      if (!project) return
      await onUpdateTask?.(taskId, { projectId: project.id })
      setUndo({
        taskId,
        message: `Attached to '${project.name}'`,
        previous: { projectId: undefined },
        undoable: true,
        onUndoExtra: () => deleteProject(project.id),
      })
    },
    [addProject, deleteProject, onUpdateTask],
  )

  // Domain + privacy filter
  const filteredByDomain = useMemo(() => {
    return tasks.filter((task) => {
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignee = task.assignedTo || task.assignedToAll?.[0]
        if (assignee && assignee !== currentUserMemberId) return false
      }
      if (currentDomain === 'universal') return true
      if (task.bucket === 'inbox' && !task.completed) return true
      return task.context === currentDomain
    })
  }, [tasks, currentDomain, currentUserMemberId])

  // Assignee filter
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const filteredTasks = useMemo(() => {
    if (selectedAssignees.length === 0) return filteredByDomain
    return filteredByDomain.filter((t) => {
      if (selectedAssignees.includes('unassigned')) {
        return !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0)
      }
      return selectedAssignees.some((id) => t.assignedTo === id || t.assignedToAll?.includes(id))
    })
  }, [filteredByDomain, selectedAssignees])

  const hasUnassignedTasks = useMemo(() => {
    return filteredByDomain.some(
      (t) => !t.completed && !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0),
    )
  }, [filteredByDomain])

  const sortByCreated = (a: Task, b: Task) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  const inboxTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'inbox').sort(sortByCreated),
    [filteredTasks],
  )
  const weekTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'week').sort(sortByCreated),
    [filteredTasks],
  )
  const monthTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'month').sort(sortByCreated),
    [filteredTasks],
  )
  const quarterTasks = useMemo(
    () => filteredTasks.filter((t) => !t.completed && t.bucket === 'quarter').sort(sortByCreated),
    [filteredTasks],
  )

  const totalCount = inboxTasks.length + weekTasks.length + monthTasks.length + quarterTasks.length

  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<UndoEntry | null>(null)

  const handleSelect = useCallback((taskId: string) => {
    onSelectItem(`task-${taskId}`)
  }, [onSelectItem])

  const applyTriage = useCallback((task: Task, action: QuickAction) => {
    const previous: Partial<Task> = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
    }

    setLeavingIds((s) => new Set(s).add(task.id))

    setTimeout(() => {
      let message = ''
      if (action.kind === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (onPushTask) onPushTask(task.id, today)
        message = 'Sent to Today'
      } else if (action.kind === 'week' || action.kind === 'month' || action.kind === 'someday') {
        const bucket = action.kind === 'someday' ? 'quarter' : action.kind
        if (onPushTask) onPushTask(task.id, bucket as 'week' | 'month' | 'quarter')
        message = `Sent to ${BUCKET_LABELS[bucket as 'week' | 'month' | 'quarter']}`
      } else if (action.kind === 'delete') {
        if (onDeleteTask) onDeleteTask(task.id)
        message = 'Deleted'
      }

      setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
      setUndo({ taskId: task.id, message, previous, undoable: action.kind !== 'delete' })
    }, 220)
  }, [onPushTask, onDeleteTask])

  const handleUndo = useCallback(() => {
    if (!undo || !onUpdateTask) { setUndo(null); return }
    onUpdateTask(undo.taskId, undo.previous)
    if (undo.onUndoExtra) undo.onUndoExtra()
    setUndo(null)
  }, [undo, onUpdateTask])

  const handleFocusTriage = useCallback((taskId: string, bucket: 'today' | 'week' | 'month' | 'quarter') => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    const action: QuickAction =
      bucket === 'today' ? { kind: 'today' }
      : bucket === 'quarter' ? { kind: 'someday' }
      : { kind: bucket }
    applyTriage(task, action)
  }, [filteredTasks, applyTriage])

  const handleFocusDelete = useCallback((taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    applyTriage(task, { kind: 'delete' })
  }, [filteredTasks, applyTriage])

  const renderRow = (task: Task) => {
    const project = projects.find((p) => p.id === task.projectId)
    return (
      <DenseInboxRow
        key={task.id}
        task={task}
        project={project}
        projects={projects}
        familyMembers={familyMembers}
        quickActions={INBOX_ACTIONS}
        isLeaving={leavingIds.has(task.id)}
        onQuickAction={(action) => applyTriage(task, action)}
        onToggleComplete={() => onToggleTask?.(task.id)}
        onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
        onSelect={() => handleSelect(task.id)}
        onOpenProject={onOpenProject}
        onAssign={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
        onCreateProject={makeOnCreateProject(task.id)}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-6">
      <div className="max-w-4xl mx-auto">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Inbox</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {totalCount === 0
              ? 'All clear — nothing to triage'
              : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalCount > 0 && <InboxModeToggle mode={mode} onChange={setMode} />}
          {familyMembers.length > 0 && (
            <AssigneeFilter
              selectedAssignees={selectedAssignees}
              onSelectAssignees={setSelectedAssignees}
              assigneesWithTasks={familyMembers}
              hasUnassignedTasks={hasUnassignedTasks}
            />
          )}
        </div>
      </header>

      <HomeNeedsDetailsSection />

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
      ) : mode === 'focus' ? (
        <FocusInboxCard
          tasks={inboxTasks}
          projects={projects}
          familyMembers={familyMembers}
          onTriage={handleFocusTriage}
          onDelete={handleFocusDelete}
          onUpdate={(taskId, updates) => onUpdateTask?.(taskId, updates)}
          onSelectDetail={handleSelect}
          onExitFocus={() => setMode('dense')}
        />
      ) : (
        <div className="space-y-6">
          {inboxTasks.length > 0 && (
            <section>
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                New ({inboxTasks.length})
              </h2>
              <div className="space-y-2">
                {inboxTasks.map(renderRow)}
              </div>
            </section>
          )}
          {(['week', 'month', 'quarter'] as const).map((bucket) => {
            const list = bucket === 'week' ? weekTasks : bucket === 'month' ? monthTasks : quarterTasks
            if (list.length === 0) return null
            return (
              <BucketSection key={bucket} title={BUCKET_LABELS[bucket]} count={list.length}>
                {list.map(renderRow)}
              </BucketSection>
            )
          })}
        </div>
      )}

      {undo && (
        <InboxUndoToast
          message={undo.message}
          onUndo={undo.undoable ? handleUndo : undefined}
          onDismiss={() => setUndo(null)}
        />
      )}
      </div>
    </div>
  )
}

interface BucketSectionProps {
  title: string
  count: number
  children: React.ReactNode
}

function BucketSection({ title, count, children }: BucketSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 mb-3 text-neutral-500 hover:text-neutral-700"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <h2 className="font-display text-sm tracking-wide uppercase">{title}</h2>
        <span className="text-xs text-neutral-400">({count})</span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </section>
  )
}
