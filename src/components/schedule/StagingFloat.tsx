import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { useProjects } from '@/hooks/useProjects'
import { useNotes } from '@/hooks/useNotes'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { NotePicker, type NotePickerSelection } from '@/components/notes/NotePicker'
import { formatInboxBullet } from '@/lib/inboxBullet'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { InboxUndoToast } from './InboxUndoToast'

interface StagingFloatProps {
  weekTasks: Task[]
  projects: Project[]
  familyMembers: FamilyMember[]
  onPullToToday: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  onCompleteTask?: (taskId: string) => void
  onDeferTask?: (taskId: string, target: 'month' | 'quarter') => void
  onDeleteTask?: (taskId: string) => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  /** Render as a compact inline trigger (for desktop stats row) */
  inline?: boolean
}

const WEEK_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'next-week' }, { kind: 'someday' }, { kind: 'note' }, { kind: 'delete' }
]

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
  undoable: boolean
  /** Optional extra async side-effect to run alongside the task update on undo */
  onUndoExtra?: () => Promise<void>
}

const GROUP_MODE_KEY = 'symphony.thisweek.group'
type GroupMode = 'list' | 'project'

function loadGroupMode(): GroupMode {
  try {
    const v = localStorage.getItem(GROUP_MODE_KEY)
    return v === 'project' ? 'project' : 'list'
  } catch {
    return 'list'
  }
}

export function StagingFloat({
  weekTasks, projects, familyMembers,
  onPullToToday, onSelectTask, onCompleteTask, onDeferTask, onDeleteTask, onUpdateTask,
  inline,
}: StagingFloatProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<UndoEntry | null>(null)
  const [groupMode, setGroupModeState] = useState<GroupMode>(() => loadGroupMode())
  const [notePickerTaskId, setNotePickerTaskId] = useState<string | null>(null)

  const { addProject, deleteProject } = useProjects()
  const { notes, addNote, updateNote, deleteNote } = useNotes()
  const { addTask, updateTask } = useSupabaseTasks()
  const { currentDomain } = useDomain()

  // Restore a task snapshot after a note-route deletion — two-step to preserve rich fields
  const restoreTask = useCallback(async (snapshot: Task) => {
    const newId = await addTask(
      snapshot.title,
      snapshot.contactId,
      snapshot.projectId,
      snapshot.scheduledFor,
      {
        context: snapshot.context,
        assignedTo: snapshot.assignedTo ?? null,
        assignedToAll: snapshot.assignedToAll,
        category: snapshot.category,
        isAllDay: snapshot.isAllDay,
        location: snapshot.location,
        locationPlaceId: snapshot.locationPlaceId,
      },
    )
    if (!newId) return
    await updateTask(newId, {
      notes: snapshot.notes,
      links: snapshot.links,
      phoneNumber: snapshot.phoneNumber,
      needsDiscussion: snapshot.needsDiscussion,
      discussionNote: snapshot.discussionNote,
      bucket: snapshot.bucket,
    })
  }, [addTask, updateTask])

  const handleNoteSelect = useCallback(async (task: Task, selection: NotePickerSelection) => {
    const now = new Date()
    const bullet = formatInboxBullet({ title: task.title, notes: task.notes }, now)
    const taskSnapshot = { ...task }

    if (selection.kind === 'existing') {
      const target = notes.find((n) => n.id === selection.noteId)
      if (!target) {
        setNotePickerTaskId(null)
        return
      }
      const previousContent = target.content

      let appendOk = false
      try {
        await updateNote(target.id, { content: previousContent + '\n' + bullet })
        appendOk = true
      } catch (err) {
        console.error('Failed to append to note:', err)
      }
      if (!appendOk) {
        setNotePickerTaskId(null)
        return
      }

      if (onDeleteTask) onDeleteTask(task.id)
      setUndo({
        taskId: task.id,
        message: `Sent to '${target.title ?? 'note'}'`,
        previous: {},
        undoable: true,
        onUndoExtra: async () => {
          await updateNote(target.id, { content: previousContent })
          await restoreTask(taskSnapshot)
        },
      })
    } else {
      // kind === 'new'
      let created: Awaited<ReturnType<typeof addNote>> | null = null
      try {
        created = await addNote({
          title: selection.title,
          content: bullet,
          type: 'general',
          source: 'inbox_triage',
          context: taskSnapshot.context ?? (currentDomain !== 'universal' ? currentDomain : undefined),
        })
      } catch (err) {
        console.error('Failed to create note:', err)
      }
      if (!created) {
        setNotePickerTaskId(null)
        return
      }

      if (onDeleteTask) onDeleteTask(task.id)
      setUndo({
        taskId: task.id,
        message: `Created '${created.title ?? selection.title}'`,
        previous: {},
        undoable: true,
        onUndoExtra: async () => {
          await deleteNote(created.id)
          await restoreTask(taskSnapshot)
        },
      })
    }
    setNotePickerTaskId(null)
  }, [notes, updateNote, deleteNote, addNote, restoreTask, onDeleteTask, currentDomain])

  const makeOnCreateProject = useCallback(
    (taskId: string) => async (name: string, context: TaskContext | null) => {
      const project = await addProject({ name, context: context ?? undefined })
      if (!project) return
      try {
        await onUpdateTask?.(taskId, { projectId: project.id })
      } catch (err) {
        console.error('Failed to attach project to task:', err)
        await deleteProject(project.id)
        return
      }
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

  const setGroupMode = useCallback((mode: GroupMode) => {
    setGroupModeState(mode)
    try { localStorage.setItem(GROUP_MODE_KEY, mode) } catch { /* ignore */ }
  }, [])

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const PANEL_WIDTH = Math.min(720, window.innerWidth - 24)
    const idealLeft = rect.right - PANEL_WIDTH
    const left = Math.max(12, Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - 12))
    setPos({ top: rect.bottom + 6, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouse(e: MouseEvent) {
      const t = e.target as Node
      if (!buttonRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sorted = [...weekTasks].sort((a, b) => {
    if (!a.weekDeferredAt && !b.weekDeferredAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (!a.weekDeferredAt) return -1
    if (!b.weekDeferredAt) return 1
    return new Date(a.weekDeferredAt).getTime() - new Date(b.weekDeferredAt).getTime()
  })

  const applyAction = useCallback((task: Task, action: QuickAction) => {
    if (action.kind === 'note') {
      setNotePickerTaskId(task.id)
      return  // commit happens after user picks in the picker
    }

    const previous: Partial<Task> = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
      weekDeferredAt: task.weekDeferredAt,
    }
    setLeavingIds((s) => new Set(s).add(task.id))

    setTimeout(() => {
      let message = ''
      if (action.kind === 'today') {
        onPullToToday(task.id)
        message = 'Pulled to Today'
      } else if (action.kind === 'next-week') {
        onUpdateTask?.(task.id, { weekDeferredAt: new Date() })
        message = 'Bumped to next week'
      } else if (action.kind === 'someday') {
        onDeferTask?.(task.id, 'quarter')
        message = 'Sent to Someday'
      } else if (action.kind === 'delete') {
        onDeleteTask?.(task.id)
        message = 'Deleted'
      }
      setLeavingIds((s) => { const n = new Set(s); n.delete(task.id); return n })
      setUndo({ taskId: task.id, message, previous, undoable: action.kind !== 'delete' })
    }, 220)
  }, [onPullToToday, onDeferTask, onDeleteTask, onUpdateTask])

  const handleUndo = useCallback(async () => {
    if (!undo || !onUpdateTask) { setUndo(null); return }
    onUpdateTask(undo.taskId, undo.previous)
    if (undo.onUndoExtra) await undo.onUndoExtra()
    setUndo(null)
  }, [undo, onUpdateTask])

  if (weekTasks.length === 0) return null

  const triggerClass = inline
    ? 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-neutral-500 hover:bg-neutral-100 transition-colors'
    : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neutral-600 bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-label="This week"
      >
        <CalendarRange className="w-3.5 h-3.5" />
        <span>This week</span>
        <span className="font-semibold tabular-nums">{weekTasks.length}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 'min(720px, calc(100vw - 24px))' }}
          className="z-50 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 max-h-[70vh] overflow-y-auto"
          role="dialog"
          aria-label="This Week"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-display text-sm font-medium text-neutral-700">
              This Week · {sorted.length} item{sorted.length !== 1 ? 's' : ''}
            </h3>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setGroupMode('list')}
                aria-pressed={groupMode === 'list'}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  groupMode === 'list'
                    ? 'bg-neutral-200 text-neutral-800 font-medium'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setGroupMode('project')}
                aria-pressed={groupMode === 'project'}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  groupMode === 'project'
                    ? 'bg-neutral-200 text-neutral-800 font-medium'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                By project
              </button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-6">Nothing scheduled this week.</p>
          ) : groupMode === 'project' ? (
            <div className="space-y-4">
              {groupTasksByProject(sorted, projects).map(({ key, label, tasks }) => (
                <div key={key}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1.5 px-1 flex items-center gap-2">
                    <span>{label}</span>
                    <span className="text-neutral-300 font-normal normal-case tracking-normal">·</span>
                    <span className="text-neutral-400 font-normal normal-case tracking-normal">{tasks.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {tasks.map((task) => {
                      const project = projects.find((p) => p.id === task.projectId)
                      return (
                        <div key={task.id} className="relative">
                          <DenseInboxRow
                            task={task}
                            project={project}
                            projects={projects}
                            familyMembers={familyMembers}
                            quickActions={WEEK_ACTIONS}
                            isLeaving={leavingIds.has(task.id)}
                            onQuickAction={(action) => applyAction(task, action)}
                            onToggleComplete={() => onCompleteTask?.(task.id)}
                            onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                            onSelect={() => { onSelectTask(task.id); setOpen(false) }}
                            onCreateProject={makeOnCreateProject(task.id)}
                          />
                          {notePickerTaskId === task.id && (
                            <NotePicker
                              task={task}
                              notes={notes}
                              domain={currentDomain}
                              onSelect={(sel) => handleNoteSelect(task, sel)}
                              onClose={() => setNotePickerTaskId(null)}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                return (
                  <div key={task.id} className="relative">
                    <DenseInboxRow
                      task={task}
                      project={project}
                      projects={projects}
                      familyMembers={familyMembers}
                      quickActions={WEEK_ACTIONS}
                      isLeaving={leavingIds.has(task.id)}
                      onQuickAction={(action) => applyAction(task, action)}
                      onToggleComplete={() => onCompleteTask?.(task.id)}
                      onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                      onSelect={() => { onSelectTask(task.id); setOpen(false) }}
                      onCreateProject={makeOnCreateProject(task.id)}
                    />
                    {notePickerTaskId === task.id && (
                      <NotePicker
                        task={task}
                        notes={notes}
                        domain={currentDomain}
                        onSelect={(sel) => handleNoteSelect(task, sel)}
                        onClose={() => setNotePickerTaskId(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>,
        document.body,
      )}

      {undo && (
        <InboxUndoToast
          message={undo.message}
          onUndo={undo.undoable ? handleUndo : undefined}
          onDismiss={() => setUndo(null)}
        />
      )}
    </>
  )
}

function groupTasksByProject(
  tasks: Task[],
  projects: Project[],
): Array<{ key: string; label: string; tasks: Task[] }> {
  const buckets = new Map<string, { label: string; tasks: Task[] }>()
  for (const task of tasks) {
    const key = task.projectId ?? '__none__'
    const label = task.projectId
      ? projects.find((p) => p.id === task.projectId)?.name ?? 'Unknown project'
      : 'No project'
    const existing = buckets.get(key)
    if (existing) existing.tasks.push(task)
    else buckets.set(key, { label, tasks: [task] })
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }))
    .sort((a, b) => {
      if (a.key === '__none__') return 1
      if (b.key === '__none__') return -1
      return a.label.localeCompare(b.label)
    })
}
