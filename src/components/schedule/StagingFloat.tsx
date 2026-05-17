import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
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
  { kind: 'today' }, { kind: 'next-week' }, { kind: 'someday' }, { kind: 'delete' }
]

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
  undoable: boolean
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

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: Math.max(rect.left - 80, 12) })
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

  const handleUndo = useCallback(() => {
    if (!undo || !onUpdateTask) { setUndo(null); return }
    onUpdateTask(undo.taskId, undo.previous)
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 'min(440px, calc(100vw - 24px))' }}
          className="z-50 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 max-h-[70vh] overflow-y-auto"
          role="dialog"
          aria-label="This Week"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-display text-sm font-medium text-neutral-700">
              This Week · {sorted.length} item{sorted.length !== 1 ? 's' : ''}
            </h3>
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-6">Nothing scheduled this week.</p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                return (
                  <DenseInboxRow
                    key={task.id}
                    task={task}
                    project={project}
                    familyMembers={familyMembers}
                    quickActions={WEEK_ACTIONS}
                    isLeaving={leavingIds.has(task.id)}
                    onQuickAction={(action) => applyAction(task, action)}
                    onToggleComplete={() => onCompleteTask?.(task.id)}
                    onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
                    onSelect={() => { onSelectTask(task.id); setOpen(false) }}
                  />
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
