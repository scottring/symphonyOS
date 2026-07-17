// src/components/schedule/InboxView.tsx
import { useMemo, useCallback, useState } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { X, CornerDownRight } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import { mergeCaptureIntoTask } from '@/lib/captureMerge'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useDomain } from '@/hooks/useDomain'
import { useInboxMode } from '@/hooks/useInboxMode'
import { useNotes } from '@/hooks/useNotes'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { HomeNeedsDetailsSection } from '@/apps/home/inbox/HomeNeedsDetailsSection'
import { NotePicker, type NotePickerSelection } from '@/components/notes/NotePicker'
import { formatInboxBullet } from '@/lib/inboxBullet'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { TriageWhenMenu, type TriageWhen } from './TriageWhenMenu'
import { getBaseDate, getThisEvening, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers'
import { FocusInboxCard } from './FocusInboxCard'
import { InboxModeToggle } from './InboxModeToggle'
import { InboxUndoToast } from './InboxUndoToast'

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'note' }, { kind: 'delete' }
]

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
  /** True while the first task fetch is in flight — gates the empty state so the
   *  inbox shows "Loading…" instead of a false "Inbox zero" before items arrive. */
  loading?: boolean
}

export function InboxView({
  tasks, projects, selectedItemId: _selectedItemId, onSelectItem,
  panelOpen: _panelOpen, onClosePanel: _onClosePanel, currentUserMemberId,
  loading = false,
}: InboxViewProps) {
  const {
    onUpdateTask, onPushTask, onDeleteTask, onUpdateTasksBulk,
    onAssignTaskAll, familyMembers = [], onOpenProject, onToggleTask,
    onAddProject, onDeleteProject,
  } = useScheduleActionsContext()
  const { notes, addNote, updateNote, deleteNote } = useNotes()
  const { addTask, updateTask } = useSupabaseTasks()

  const { currentDomain } = useDomain()

  const [notePickerTaskId, setNotePickerTaskId] = useState<string | null>(null)
  const [mode, setMode] = useInboxMode()

  // Bulk select → assign context (and delete). Lets you tag many items at once
  // (e.g. mark a batch 'family' so they surface on the kitchen wall).
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  const toggleTaskSelection = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedTaskIds(new Set())
  }, [])

  const handleBulkContext = useCallback(async (context: TaskContext | null) => {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    if (onUpdateTasksBulk) await onUpdateTasksBulk(ids, { context: context ?? undefined })
    else ids.forEach(id => onUpdateTask?.(id, { context: context ?? undefined }))
    exitSelection()
  }, [selectedTaskIds, onUpdateTasksBulk, onUpdateTask, exitSelection])

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedTaskIds)
    ids.forEach(id => onDeleteTask?.(id))
    exitSelection()
  }, [selectedTaskIds, onDeleteTask, exitSelection])

  const makeOnCreateProject = useCallback(
    (taskId: string) => async (name: string, context: TaskContext | null) => {
      if (!onAddProject) return
      const project = await onAddProject({ name, context: context ?? undefined })
      if (!project) return
      const removeCreatedProject = (): Promise<void> =>
        onDeleteProject ? onDeleteProject(project.id) : Promise.resolve()
      try {
        await onUpdateTask?.(taskId, { projectId: project.id })
      } catch (err) {
        console.error('Failed to attach project to task:', err)
        await removeCreatedProject()
        return
      }
      setUndo({
        taskId,
        message: `Attached to '${project.name}'`,
        previous: { projectId: undefined },
        undoable: true,
        onUndoExtra: removeCreatedProject,
      })
    },
    [onAddProject, onDeleteProject, onUpdateTask],
  )

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

  // Domain + privacy filter
  const filteredByDomain = useMemo(() => {
    return tasks.filter((task) => {
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        // Visible to anyone the task is assigned to — check the full set, not [0].
        const assignees = task.assignedToAll && task.assignedToAll.length > 0
          ? task.assignedToAll
          : (task.assignedTo ? [task.assignedTo] : [])
        if (assignees.length > 0 && !assignees.includes(currentUserMemberId)) return false
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
  // The inbox is capture-triage ONLY: true captures (bucket 'inbox'), not
  // already-planned month/season/week tasks. Those belong to their horizon views
  // (This Month / This Season / This Week). Surfacing them here made the inbox
  // show planning outputs — and their per-horizon copies — as "items to triage",
  // which is exactly the confusing duplication the inbox should never show.
  const totalCount = inboxTasks.length

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
      // Captured so "Done" is undoable — restores the item to the inbox.
      completed: task.completed,
    }

    setLeavingIds((s) => new Set(s).add(task.id))

    setTimeout(() => {
      let message = ''
      if (action.kind === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (onPushTask) onPushTask(task.id, today)
        message = 'Sent to Today'
      } else if (action.kind === 'week' || action.kind === 'month') {
        if (onPushTask) onPushTask(task.id, action.kind)
        message = action.kind === 'week' ? 'Sent to This Week' : 'Sent to This Month'
      } else if (action.kind === 'someday') {
        // Real someday bucket — the old code sent "Someday" to quarter/season.
        if (onUpdateTask) onUpdateTask(task.id, { bucket: 'someday', scheduledFor: undefined })
        message = 'Sent to Someday'
      } else if (action.kind === 'complete') {
        if (onUpdateTask) onUpdateTask(task.id, { completed: true })
        message = 'Completed'
      } else if (action.kind === 'delete') {
        if (onDeleteTask) onDeleteTask(task.id)
        message = 'Deleted'
      }

      setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
      setUndo({ taskId: task.id, message, previous, undoable: action.kind !== 'delete' })
    }, 220)
  }, [onPushTask, onDeleteTask, onUpdateTask])

  // Fan-out triage: route an inbox item to a specific WHEN. Mirrors applyTriage's
  // leaving-animation + undo, but covers the richer temporal vocabulary. Dated
  // whens go through onPushTask (bucket=timed + all-day inference — "Tonight" at
  // 6pm stays timed); pool whens set the bucket. Someday uses onUpdateTask since
  // onPushTask's signature predates the 'someday' bucket.
  const applyWhen = useCallback((task: Task, when: TriageWhen) => {
    const previous: Partial<Task> = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
    }
    setLeavingIds((s) => new Set(s).add(task.id))
    setTimeout(() => {
      let message = ''
      const firstOfNextMonth = () => {
        const d = new Date()
        return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0)
      }
      switch (when) {
        case 'today': onPushTask?.(task.id, getBaseDate(0)); message = 'Sent to Today'; break
        case 'tonight': onPushTask?.(task.id, getThisEvening()); message = 'Sent to Tonight'; break
        case 'tomorrow': onPushTask?.(task.id, getBaseDate(1)); message = 'Sent to Tomorrow'; break
        case 'this-week': onPushTask?.(task.id, 'week'); message = 'Sent to This Week'; break
        case 'next-week': onPushTask?.(task.id, getNextMonday()); message = 'Sent to Next Week'; break
        case 'this-weekend': onPushTask?.(task.id, getNextWeekend()); message = 'Sent to This Weekend'; break
        case 'next-weekend': onPushTask?.(task.id, getWeekendAfterNext()); message = 'Sent to Next Weekend'; break
        case 'this-month': onPushTask?.(task.id, 'month'); message = 'Sent to This Month'; break
        case 'next-month': onPushTask?.(task.id, firstOfNextMonth()); message = 'Sent to Next Month'; break
        case 'someday': onUpdateTask?.(task.id, { bucket: 'someday', scheduledFor: undefined }); message = 'Sent to Someday'; break
      }
      setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
      setUndo({ taskId: task.id, message, previous, undoable: true })
    }, 220)
  }, [onPushTask, onUpdateTask])

  // Schedule an inbox item to a specific date/time (the "Pick date" triage path).
  const applyDate = useCallback((task: Task, date: Date) => {
    const previous: Partial<Task> = { bucket: task.bucket, scheduledFor: task.scheduledFor, isAllDay: task.isAllDay }
    setLeavingIds((s) => new Set(s).add(task.id))
    setTimeout(() => {
      onPushTask?.(task.id, date)
      setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
      setUndo({ taskId: task.id, message: 'Scheduled', previous, undoable: true })
    }, 220)
  }, [onPushTask])

  const handleUndo = useCallback(async () => {
    if (!undo) { setUndo(null); return }
    // Only call onUpdateTask if there are actual fields to restore
    if (onUpdateTask && Object.keys(undo.previous).length > 0) {
      onUpdateTask(undo.taskId, undo.previous)
    }
    if (undo.onUndoExtra) await undo.onUndoExtra()
    setUndo(null)
  }, [undo, onUpdateTask])

  const handleFocusTriage = useCallback((taskId: string, bucket: 'today' | 'week' | 'month' | 'quarter') => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    // Route through applyWhen so "Someday" lands in the real `someday` bucket
    // (not the legacy `quarter`) — consistent with the list-mode fan-out.
    const when: TriageWhen =
      bucket === 'today' ? 'today'
      : bucket === 'week' ? 'this-week'
      : bucket === 'month' ? 'this-month'
      : 'someday'
    applyWhen(task, when)
  }, [filteredTasks, applyWhen])

  const handleFocusComplete = useCallback((taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    applyTriage(task, { kind: 'complete' })
  }, [filteredTasks, applyTriage])

  const handleFocusDelete = useCallback((taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId)
    if (!task) return
    applyTriage(task, { kind: 'delete' })
  }, [filteredTasks, applyTriage])

  // Merge a photo capture into its AI-suggested destination task.
  const [mergingCaptureId, setMergingCaptureId] = useState<string | null>(null)
  const handleMergeCapture = useCallback(async (capture: Task, target: Task) => {
    if (!onUpdateTask || !onDeleteTask) return
    setMergingCaptureId(capture.id)
    try {
      await mergeCaptureIntoTask(capture, target, { updateTask: onUpdateTask, deleteTask: onDeleteTask })
    } finally {
      setMergingCaptureId(null)
    }
  }, [onUpdateTask, onDeleteTask])

  const renderRow = (task: Task) => {
    const project = projects.find((p) => p.id === task.projectId)
    // Photo-capture suggestion: the AI matched this capture to an open task —
    // one tap merges note + photo onto it (mirrors the iOS inbox chip).
    const suggestedTarget =
      task.captureMeta?.status === 'done' && task.captureMeta.suggestedTaskId
        ? tasks.find((t) => t.id === task.captureMeta?.suggestedTaskId && !t.completed)
        : undefined
    return (
      <div key={task.id} className="relative">
        <DenseInboxRow
          task={task}
          project={project}
          projects={projects}
          familyMembers={familyMembers}
          quickActions={INBOX_ACTIONS}
          isLeaving={leavingIds.has(task.id)}
          onQuickAction={(action) => {
            if (action.kind === 'note') {
              setNotePickerTaskId(task.id)
              return
            }
            applyTriage(task, action)
          }}
          triageMenu={
            <TriageWhenMenu
              onPick={(when) => applyWhen(task, when)}
              onPickDate={(date) => applyDate(task, date)}
              onNote={() => setNotePickerTaskId(task.id)}
              onDelete={() => applyTriage(task, { kind: 'delete' })}
            />
          }
          onToggleComplete={() => onToggleTask?.(task.id)}
          onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
          onSelect={() => (selectionMode ? toggleTaskSelection(task.id) : handleSelect(task.id))}
          selectionMode={selectionMode}
          isSelected={selectedTaskIds.has(task.id)}
          onToggleSelection={() => toggleTaskSelection(task.id)}
          onOpenProject={onOpenProject}
          onAssign={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
          onCreateProject={makeOnCreateProject(task.id)}
        />
        {suggestedTarget && (
          <button
            type="button"
            onClick={() => void handleMergeCapture(task, suggestedTarget)}
            disabled={mergingCaptureId === task.id}
            className="mt-1 ml-8 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100 text-xs font-medium hover:bg-primary-100 disabled:opacity-60 transition-colors"
          >
            <CornerDownRight className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[320px]">
              {mergingCaptureId === task.id ? 'Merging…' : `Add to: ${suggestedTarget.title}`}
            </span>
          </button>
        )}
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
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className={PAGE_COLUMN}>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Inbox</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {totalCount === 0
              ? (loading ? 'Loading your inbox…' : 'All clear — nothing to triage')
              : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              className={`text-sm font-medium px-2.5 py-1.5 rounded-lg transition-colors ${selectionMode ? 'text-primary-700 bg-primary-50' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
            >
              {selectionMode ? 'Done' : 'Select'}
            </button>
          )}
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

      {totalCount === 0 && loading ? (
        <div className="text-center py-16">
          <p className="font-display text-xl text-neutral-700">Loading your inbox…</p>
        </div>
      ) : totalCount === 0 ? (
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
          onComplete={handleFocusComplete}
          onUpdate={(taskId, updates) => onUpdateTask?.(taskId, updates)}
          onSelectDetail={handleSelect}
          onExitFocus={() => setMode('dense')}
        />
      ) : (
        <div className="space-y-2">
          {inboxTasks.map(renderRow)}
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

      {selectedTaskIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-neutral-900 text-white shadow-xl"
        >
          <span className="text-sm font-medium pr-1">{selectedTaskIds.size} selected</span>
          <span className="text-neutral-500">·</span>
          <span className="text-xs text-neutral-400 pl-1">Context:</span>
          <button type="button" onClick={() => handleBulkContext('work')} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10">Work</button>
          <button type="button" onClick={() => handleBulkContext('family')} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10">Family</button>
          <button type="button" onClick={() => handleBulkContext('personal')} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10">Personal</button>
          <button type="button" onClick={() => handleBulkContext(null)} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10 text-neutral-300">Clear</button>
          <span className="text-neutral-600 mx-1">|</span>
          <button type="button" onClick={handleBulkDelete} className="text-sm px-2 py-1 rounded-lg hover:bg-red-500/30 text-red-300">Delete</button>
          <button type="button" onClick={exitSelection} aria-label="Cancel selection" className="ml-1 p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  )
}

