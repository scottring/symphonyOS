// src/components/schedule/InboxView.tsx
import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { X, CornerDownRight, CalendarDays, Sun } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { Task, TaskContext } from '@/types/task'
import { mergeCaptureIntoTask } from '@/lib/captureMerge'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useAuth } from '@/hooks/useAuth'
import { useDomain } from '@/hooks/useDomain'
import { useInboxMode } from '@/hooks/useInboxMode'
import { useNotes } from '@/hooks/useNotes'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useSendToCalendar } from '@/hooks/useSendToCalendar'
import { showToast } from '@/hooks/useToast'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { HomeNeedsDetailsSection } from '@/apps/home/inbox/HomeNeedsDetailsSection'
import { SupernotePagesSection } from '@/components/capture/SupernotePagesSection'
import { NotePicker, type NotePickerSelection } from '@/components/notes/NotePicker'
import { formatInboxBullet } from '@/lib/inboxBullet'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { focusSnapshot } from '@/lib/placement/model'
import { InboxTriageActions } from './InboxTriageActions'
import type { TriageWhen } from './TriageWhenMenu'
import { getBaseDate, getThisEvening, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers'
import { wasWritten, isStep } from '@/hooks/useGatedTaskActions'
import type { DomainId } from '@/lib/domains'
import { BulkAreaDialog } from './BulkAreaDialog'
import { useDomainGate } from '@/components/domain/DomainGate'
import { FocusInboxCard } from './FocusInboxCard'
import { useMobile } from '@/hooks/useMobile'
import { PhoneCaptureBar, PhoneCaptureField } from '@/components/layout/PhoneCaptureBar'
import { InboxModeToggle } from './InboxModeToggle'
import { InboxUndoToast } from './InboxUndoToast'
import { filterInboxTasksForLayers } from '@/lib/today/domainFilter'
import { isBuyish, isToBuyNudgeDismissed, dismissToBuyNudge } from '@/lib/lists/toBuy'
import { ToBuyNudge } from './ToBuyNudge'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { selectRefileRows } from '@/lib/today/refile'
import { selectExpired } from '@/lib/today/expired'
import { RefileStrip } from './RefileStrip'
import { ExpiredSection } from './ExpiredSection'

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'note' }, { kind: 'delete' }
]

type BulkWhen = 'today' | 'this-week' | 'someday'
/** Where a move sends a row: a day/time, a period, Someday, Today (dated +
 *  chosen), or Completed. */
type MoveTarget = Date | 'today' | 'week' | 'month' | 'quarter' | 'someday' | 'complete'
type Move = { task: Task; target: MoveTarget; area?: DomainId; previous: Partial<Task> }

type UndoEntry = {
  taskId: string
  message: string
  previous: Partial<Task>
  undoable: boolean
  /** Optional extra async side-effect to run alongside the task update on undo */
  onUndoExtra?: () => Promise<void>
  /** A batch: every row to restore, each checked. Replaces taskId/previous. */
  restores?: { id: string; previous: Partial<Task> }[]
  /** "Retry" for an entry left behind by a failed undo. */
  actionLabel?: string
  /** A failure report: stays until dismissed. */
  persistent?: boolean
  /** Unconfirmed moves: re-run the forward write for just those rows. */
  retry?: () => void
  /**
   * Runs when the entry goes away WITHOUT an undo — the toast timed out or was
   * dismissed, another action replaced it, or the page unmounted. Delete uses
   * it: the row is hidden at once and only deleted here, so Undo can bring
   * back the same row (same id, attachments, commitments, focus) instead of a
   * re-inserted copy.
   */
  onExpire?: () => void
}

interface InboxViewProps {
  tasks: Task[]
  projects: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  panelOpen: boolean
  onClosePanel: () => void
  /** True while the first task fetch is in flight — gates the empty state so the
   *  inbox shows "Loading…" instead of a false "Inbox zero" before items arrive. */
  loading?: boolean
}

export function InboxView({
  tasks: allTasks, selectedItemId: _selectedItemId, onSelectItem,
  panelOpen: _panelOpen, onClosePanel: _onClosePanel,
  loading = false,
}: InboxViewProps) {
  const navigate = useNavigate()
  const { hash } = useLocation()
  const expiredAnchor = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hash === '#expired') expiredAnchor.current?.scrollIntoView({ block: 'start' })
  }, [hash])
  const {
    onUpdateTask, onPushTask, onDeleteTask, onUpdateTasksBulk,
    onAssignTaskAll, familyMembers = [], onToggleTask,
    onSendTaskToBuy: sendTaskToBuy,
  } = useScheduleActionsContext()
  const { notes, addNote, updateNote, deleteNote } = useNotes()
  const { addTask } = useSupabaseTasks()
  const isMobile = useMobile()
  const { user } = useAuth()

  const { soleDomain, layers, all: showAllDomains } = useDomain()

  // Rows deleted from the Inbox but still inside their Undo window. They are
  // hidden everywhere on this page; the real delete waits for the toast to go
  // (see UndoEntry.onExpire).
  const [pendingDeleteIds, setPendingDeleteIds] = useState<ReadonlySet<string>>(new Set())
  const tasks = useMemo(
    () => (pendingDeleteIds.size === 0 ? allTasks : allTasks.filter((t) => !pendingDeleteIds.has(t.id))),
    [allTasks, pendingDeleteIds],
  )

  const [undo, setUndo] = useState<UndoEntry | null>(null)
  // Mirrors `undo` so a replacement or unmount can expire the entry it
  // displaces — a pending delete must not be forgotten just because another
  // toast took its place.
  const undoRef = useRef<UndoEntry | null>(null)
  const pushUndo = useCallback((next: UndoEntry | null) => {
    const prev = undoRef.current
    undoRef.current = next
    if (prev && prev !== next) prev.onExpire?.()
    setUndo(next)
  }, [])
  const dismissUndo = useCallback(() => pushUndo(null), [pushUndo])
  useEffect(() => () => { undoRef.current?.onExpire?.(); undoRef.current = null }, [])

  // Every Inbox delete — a row, the Expired section, a bulk selection — hides
  // at once and deletes only when the Undo window closes, so Undo brings back
  // the SAME rows rather than re-inserted copies.
  const deleteWithUndo = useCallback((ids: string[], message: string) => {
    if (ids.length === 0) return
    const forget = () => setPendingDeleteIds((s) => { const next = new Set(s); ids.forEach((id) => next.delete(id)); return next })
    setPendingDeleteIds((s) => { const next = new Set(s); ids.forEach((id) => next.add(id)); return next })
    pushUndo({
      taskId: ids[0],
      message,
      previous: {},
      undoable: true,
      onUndoExtra: async () => { forget() },
      onExpire: () => {
        ids.forEach((id) => onDeleteTask?.(id))
        forget()
      },
    })
  }, [onDeleteTask, pushUndo])

  // Page chrome for the card's corner — only inside an AppShell (tests mount bare).

  const chrome = useAppShellChromeOptional()

  // Needs-re-filing strip: the UNFILTERED tasks prop, not filteredByDomain —
  // a stranded row must show regardless of which layers are checked.
  const refileRows = useMemo(
    () => selectRefileRows(tasks, user?.id ?? null),
    [tasks, user?.id],
  )

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
    deleteWithUndo(ids, ids.length === 1 ? 'Deleted' : `Deleted ${ids.length} items`)
    exitSelection()
  }, [selectedTaskIds, deleteWithUndo, exitSelection])

  // makeOnCreateProject (create a project from an inbox row and file the task
  // into it) lived here until Projects was hidden — 2026-09-02, see the note in
  // Sidebar.tsx. onAddProject/onDeleteProject stay on the props: they are still
  // wired by the container and nothing else needs to change to bring it back.

  // Restore a task snapshot verbatim after a destructive triage route (note
  // conversion, send-to-calendar). ONE insert, deliberately: the old two-step
  // issued updateTask immediately after addTask, and that write hit
  // findTaskById before the new row was in state — so it was dropped whole
  // ("Task not found") and every restore silently lost notes, links, phone
  // number and the discussion flags. Everything rides the INSERT now.
  const restoreTask = useCallback(async (snapshot: Task) => {
    await addTask(
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
        // addTask forces bucket 'timed' when scheduledFor is set, which is the
        // same invariant the snapshot already satisfies.
        bucket: snapshot.bucket,
        notes: snapshot.notes,
        links: snapshot.links,
        phoneNumber: snapshot.phoneNumber,
        needsDiscussion: snapshot.needsDiscussion,
        discussionNote: snapshot.discussionNote,
        neededOn: snapshot.neededOn,
      },
    )
  }, [addTask])

  const { sendToCalendar, undoSend, sendingTaskId } = useSendToCalendar((id) => onDeleteTask?.(id))

  // Convert an inbox item into a real Google event. The hook writes to Google
  // first and only then deletes the task, so a failure leaves the inbox exactly
  // as it was — all this has to do is say so.
  const handleSendToCalendar = useCallback(
    async (task: Task, start: Date, isAllDay: boolean, durationMinutes?: number) => {
      const snapshot = { ...task }

      const outcome = await sendToCalendar(task, {
        start,
        allDay: isAllDay || undefined,
        durationMinutes,
      })

      if (!outcome.ok) {
        // 'busy' = another row's send is still writing. Nothing went wrong and
        // nothing was lost, so there is nothing worth interrupting the user for.
        if (outcome.reason === 'busy') return
        showToast(
          outcome.reason === 'read-only'
            ? 'That calendar is shared read-only — the item is still in your inbox.'
            : outcome.reason === 'not-connected'
              ? 'Google Calendar isn’t connected — the item is still in your inbox.'
              : 'Couldn’t reach Google Calendar — the item is still in your inbox.',
          'error',
        )
        return
      }

      pushUndo({
        taskId: snapshot.id,
        message: `Sent to ${outcome.calendarName}`,
        // Empty: the task is gone, so there is nothing to update — handleUndo
        // skips onUpdateTask and the whole restore happens in onUndoExtra.
        previous: {},
        undoable: true,
        onUndoExtra: async () => {
          const eventRemoved = await undoSend(outcome.eventId, outcome.calendarId)
          await restoreTask(snapshot)
          // Half an undo has to look different from a whole one: the task is
          // back, but a real event is still sitting on the calendar and only the
          // user can clear it.
          if (!eventRemoved) {
            showToast(
              `'${snapshot.title}' is back in your inbox, but the event is still on ${outcome.calendarName} — remove it there.`,
              'error',
            )
          }
        },
      })
    },
    [sendToCalendar, undoSend, restoreTask, pushUndo],
  )

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

      // updateNote reports failure by its return value (it rolls back and
      // toasts rather than throwing) — the capture is deleted only once the
      // append really landed, or a failed write would lose it.
      let appendOk = false
      try {
        appendOk = await updateNote(target.id, { content: previousContent + '\n' + bullet })
      } catch (err) {
        console.error('Failed to append to note:', err)
      }
      if (!appendOk) {
        setNotePickerTaskId(null)
        return
      }

      if (onDeleteTask) onDeleteTask(task.id)
      pushUndo({
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
          context: taskSnapshot.context ?? undefined,
        })
      } catch (err) {
        console.error('Failed to create note:', err)
      }
      if (!created) {
        setNotePickerTaskId(null)
        return
      }

      if (onDeleteTask) onDeleteTask(task.id)
      pushUndo({
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
  }, [notes, updateNote, deleteNote, addNote, restoreTask, onDeleteTask, pushUndo])

  // Layer filter — the SHARED helper, not a local copy.
  //
  // Tagged rows follow the layer rule like everywhere else. UNTAGGED rows do
  // not: an Unsorted capture is exactly what the Inbox exists to show, and
  // hiding it whenever the tag filter happens to exclude "Unsorted" made a
  // fresh ⌘K capture vanish behind "Inbox zero" (Scott, 2026-09-20 — first
  // real-data walkthrough). RLS already limits `tasks` to what this user may
  // see, so "always" here means "always among your own". The render below
  // narrows to bucket 'inbox' anyway.
  const filteredByDomain = useMemo(
    () => filterInboxTasksForLayers(tasks, layers),
    [tasks, layers],
  )

  // Assignee filter — the shared matcher, defaulting to everyone.
  //
  // The local version returned early when 'unassigned' was among the
  // selections, so picking "Iris + Unassigned" silently showed ONLY the
  // unassigned items and dropped Iris's. makeAssigneeFilter ORs the pseudo-id
  // in with the rest, which is what the chips imply.
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const filteredTasks = useMemo(() => {
    const match = makeAssigneeFilter(selectedAssignees)
    return filteredByDomain.filter((t) => match(t.assignedTo, t.assignedToAll))
  }, [filteredByDomain, selectedAssignees])

  const hasUnassignedTasks = useMemo(() => {
    return filteredByDomain.some(
      (t) => !t.completed && !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0),
    )
  }, [filteredByDomain])

  // "To buy" routing, offered in the inbox as well as on Today.
  //
  // The nudge only ever rendered on the Today timeline, so a captured
  // "Buy strawberries" that was never scheduled had no route onto the list at
  // all — it just sat in the inbox as a task (launch rehearsal, 2026-09-04).
  // Triage is exactly where that decision belongs.
  const knownPeopleNames = useMemo(
    () => familyMembers.map((m) => m.name),
    [familyMembers],
  )
  // localStorage holds the dismissals, so nothing re-renders on its own.
  const [toBuyDismissals, setToBuyDismissals] = useState(0)
  const handleSendToBuy = useCallback(async (taskId: string) => {
    const result = await sendTaskToBuy?.(taskId)
    if (result) showToast(`"${result.itemText}" moved to To buy`, 'success', 4000)
  }, [sendTaskToBuy])

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
  // Empty because the domain or person filter hides captures — not Inbox zero.
  const hiddenByFilter = totalCount === 0
    && tasks.some((t) => !t.completed && t.bucket === 'inbox')

  // ...with ONE exception, added 2026-09-03: work whose date has passed.
  //
  // That isn't a planning output, it's the opposite — an expired date means
  // the commitment lapsed and the item is undecided again, which is exactly
  // what this page is for. It also had nowhere else to live: Today stopped
  // rendering carried-over rows and Review shows five at a time, so 26 open
  // past-dated tasks were reachable from no screen at all. Its own collapsed
  // section below the captures, never mixed into the triage list above.
  const expiredRows = useMemo(() => selectExpired(filteredTasks), [filteredTasks])

  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())

  const handleSelect = useCallback((taskId: string) => {
    onSelectItem(`task-${taskId}`)
  }, [onSelectItem])

  // ── Moves out of the Inbox: one runner for rows and selections ──
  // Every move has exactly one of three outcomes (review 2026-09-22):
  //  - cancelled: the life-area question was declined → nothing written, no Undo;
  //  - confirmed: every write reported success → "Sent …" with Undo;
  //  - unconfirmed: a write reported false → persistent notice with Retry and
  //    Undo. False is not "nothing changed": the task row can save before its
  //    commitment/focus records fail, so the snapshot is restored on Undo.
  // Cancel can only happen up front: the Inbox asks for a missing life area
  // itself and writes it WITH the placement, so no later write can come back
  // false because a gate was dismissed.
  const { requireDomain } = useDomainGate()

  /** Write one row's move. True = confirmed. Today also chooses it for today. */
  const writeMove = useCallback(async (task: Task, target: MoveTarget, area?: DomainId): Promise<boolean> => {
    const dest = target === 'today' ? getBaseDate(0) : target
    let ok: boolean
    if (dest === 'complete') {
      ok = onUpdateTask ? await wasWritten(onUpdateTask(task.id, { completed: true })) : false
    } else if (area || dest === 'someday') {
      // Same placement fields pushTask writes, with the answer in one write.
      const placement: Partial<Task> = dest === 'someday' || dest === 'week' || dest === 'month' || dest === 'quarter'
        ? { bucket: dest, scheduledFor: undefined }
        : { bucket: 'timed', scheduledFor: dest, isAllDay: dest.getHours() === 0 && dest.getMinutes() === 0 }
      ok = onUpdateTask ? await wasWritten(onUpdateTask(task.id, area ? { context: area, ...placement } : placement)) : false
    } else {
      ok = onPushTask ? await wasWritten(onPushTask(task.id, dest)) : false
    }
    // Choosing it for today is part of "Today"; its failure is unconfirmed too.
    if (ok && target === 'today' && onUpdateTask) ok = await wasWritten(onUpdateTask(task.id, { plannedOn: getBaseDate(0) }))
    return ok
  }, [onPushTask, onUpdateTask])

  /** Run the moves, then record ONE outcome: confirmed or unconfirmed. */
  const runMoves = useCallback(async (label: string, moves: Move[], earlier: Move[] = []) => {
    const confirmed: Move[] = [...earlier]
    const unconfirmed: Move[] = []
    for (const m of moves) (await writeMove(m.task, m.target, m.area) ? confirmed : unconfirmed).push(m)
    setLeavingIds((s) => { const next = new Set(s); moves.forEach((m) => next.delete(m.task.id)); return next })
    const all = [...confirmed, ...unconfirmed]
    if (all.length === 0) return
    const c = confirmed.length, u = unconfirmed.length
    const message = u === 0
      ? (label === 'Completed' ? (c === 1 ? 'Completed' : `Completed ${c}`) : c === 1 ? `Sent to ${label}` : `Sent ${c} to ${label}`)
      : c === 0
        ? `Couldn't confirm ${u === 1 ? (label === 'Completed' ? 'that it completed' : `the move to ${label}`) : `${u} moves to ${label}`}`
        : `Sent ${c} to ${label} · ${u} may not have saved`
    pushUndo({
      taskId: all[0].task.id,
      message,
      previous: {},
      restores: all.map((m) => ({ id: m.task.id, previous: m.previous })),
      undoable: true,
      persistent: u > 0,
      retry: u > 0 ? () => { void runMoves(label, unconfirmed, confirmed) } : undefined,
    })
  }, [writeMove, pushUndo])

  /** Snapshot for Undo, then ask for a missing life area (the only cancel). */
  const startMove = useCallback(async (task: Task, target: MoveTarget, knownArea?: DomainId): Promise<Move | null> => {
    const previous: Partial<Task> = {
      bucket: task.bucket, scheduledFor: task.scheduledFor, isAllDay: task.isAllDay,
      completed: task.completed, focus: focusSnapshot(task),
    }
    const needsArea = target !== 'complete' && task.context == null && !isStep(task)
    if (!needsArea) return { task, target, previous }
    const area = knownArea ?? await requireDomain(task)
    if (!area) return null
    // Undo also returns a newly classified item to Unsorted.
    return { task, target, area, previous: { ...previous, context: null } }
  }, [requireDomain])

  const moveRow = useCallback((task: Task, target: MoveTarget, label: string) => {
    setLeavingIds((s) => new Set(s).add(task.id))
    void (async () => {
      const move = await startMove(task, target)
      if (!move) {
        // Cancelled: nothing written, no notice, no Undo.
        setLeavingIds((s) => { const next = new Set(s); next.delete(task.id); return next })
        return
      }
      await new Promise((r) => setTimeout(r, 220)) // let the row's leave animation play
      await runMoves(label, [move])
    })()
  }, [startMove, runMoves])

  const applyTriage = useCallback((task: Task, action: QuickAction) => {
    if (action.kind === 'delete') {
      // Hide now, delete when the Undo window closes (onExpire).
      deleteWithUndo([task.id], 'Deleted')
      return
    }
    const byKind: Partial<Record<QuickAction['kind'], [MoveTarget, string]>> = {
      today: ['today', 'Today'], week: ['week', 'This Week'], month: ['month', 'This Month'],
      someday: ['someday', 'Someday'], complete: ['complete', 'Completed'],
    }
    const spec = byKind[action.kind]
    if (spec) moveRow(task, spec[0], spec[1])
  }, [deleteWithUndo, moveRow])

  // Fan-out triage: route an inbox item to a specific WHEN.
  const applyWhen = useCallback((task: Task, when: TriageWhen) => {
    const d = new Date()
    const specs: Record<TriageWhen, [MoveTarget, string]> = {
      'today': ['today', 'Today'],
      'tonight': [getThisEvening(), 'Tonight'],
      'tomorrow': [getBaseDate(1), 'Tomorrow'],
      'this-week': ['week', 'This Week'],
      'next-week': [getNextMonday(), 'Next Week'],
      'this-weekend': [getNextWeekend(), 'This Weekend'],
      'next-weekend': [getWeekendAfterNext(), 'Next Weekend'],
      'this-month': ['month', 'This Month'],
      'next-month': [new Date(d.getFullYear(), d.getMonth() + 1, 1), 'Next Month'],
      // Was offered but never handled: it wrote nothing and still offered Undo.
      'this-season': ['quarter', 'This Season'],
      'someday': ['someday', 'Someday'],
    }
    const [target, label] = specs[when]
    moveRow(task, target, label)
  }, [moveRow])

  // Schedule an inbox item to a specific date/time (the "Pick date" triage path).
  const applyDate = useCallback((task: Task, date: Date) => {
    moveRow(task, date, date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
  }, [moveRow])

  // Bulk triage to the three row destinations (2026-09-22). Every
  // unclassified item's life area is collected in ONE dialog before anything
  // moves; classified items keep theirs. Each write's result is checked, so a
  // failed placement is reported, never counted as sent, and one Undo restores
  // exactly the items that moved.
  const [bulkAsk, setBulkAsk] = useState<{ when: BulkWhen; rows: Task[]; unclassified: Task[] } | null>(null)

  const runBulkWhen = useCallback(async (when: BulkWhen, rows: Task[], areas: Map<string, DomainId>) => {
    exitSelection()
    const target: MoveTarget = when === 'this-week' ? 'week' : when
    const moves: Move[] = []
    // Areas were collected up front (BulkAreaDialog), so nothing here can cancel.
    for (const t of rows) { const m = await startMove(t, target, areas.get(t.id)); if (m) moves.push(m) }
    await runMoves(when === 'today' ? 'Today' : when === 'this-week' ? 'This Week' : 'Someday', moves)
  }, [exitSelection, startMove, runMoves])

  const handleBulkWhen = useCallback((when: BulkWhen) => {
    const rows = tasks.filter((t) => selectedTaskIds.has(t.id))
    if (rows.length === 0) return
    const unclassified = rows.filter((t) => t.context == null && !isStep(t))
    if (unclassified.length > 0) { setBulkAsk({ when, rows, unclassified }); return }
    void runBulkWhen(when, rows, new Map())
  }, [tasks, selectedTaskIds, runBulkWhen])

  // Undo awaits and checks every restore. Rows that fail to restore stay on
  // screen as a persistent "Retry" entry for just those rows — an Undo that
  // failed must never simply disappear (review 2026-09-22).
  const [undoBusy, setUndoBusy] = useState(false)
  const handleUndo = useCallback(async () => {
    if (!undo) { setUndo(null); return }
    if (undoBusy) return
    // Undone, not expired: clear the ref first so onExpire never runs.
    undoRef.current = null
    const restores = undo.restores
      ?? (Object.keys(undo.previous).length > 0 ? [{ id: undo.taskId, previous: undo.previous }] : [])
    setUndoBusy(true)
    const failed: typeof restores = []
    try {
      for (const r of restores) {
        const ok = onUpdateTask ? await wasWritten(onUpdateTask(r.id, r.previous)) : false
        if (!ok) failed.push(r)
      }
      if (undo.onUndoExtra) await undo.onUndoExtra()
    } finally {
      setUndoBusy(false)
    }
    if (failed.length === 0) { setUndo(null); return }
    const whole = restores.length
    const next: UndoEntry = {
      taskId: failed[0].id,
      message: whole === 1 ? "Couldn't undo that move" : `Couldn't undo ${failed.length} of ${whole} moves`,
      previous: {},
      restores: failed,
      undoable: true,
      actionLabel: 'Retry',
      persistent: true,
    }
    undoRef.current = next
    setUndo(next)
  }, [undo, undoBusy, onUpdateTask])

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

  // Focus mode has no row to look the task up from (unlike list mode's
  // per-row closure), so it hands back just the id plus what the picker
  // chose — look the task up here and forward to the same conversion flow
  // list mode uses.
  const handleFocusSendToCalendar = useCallback(
    (taskId: string, start: Date, isAllDay: boolean, durationMinutes?: number) => {
      const task = filteredTasks.find((t) => t.id === taskId)
      if (!task) return
      void handleSendToCalendar(task, start, isAllDay, durationMinutes)
    },
    [filteredTasks, handleSendToCalendar],
  )

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
    // Photo-capture suggestion: the AI matched this capture to an open task —
    // one tap merges note + photo onto it (mirrors the iOS inbox chip).
    const suggestedTarget =
      task.captureMeta?.status === 'done' && task.captureMeta.suggestedTaskId
        ? tasks.find((t) => t.id === task.captureMeta?.suggestedTaskId && !t.completed)
        : undefined
    const showToBuy =
      !!sendTaskToBuy &&
      !task.completed &&
      isBuyish(task.title, knownPeopleNames) &&
      !isToBuyNudgeDismissed(task.id)
    void toBuyDismissals // re-read localStorage after a dismissal
    return (
      <div key={task.id} className="relative">
        <DenseInboxRow
          task={task}
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
          contextControl="readonly"
          triageMenu={
            <InboxTriageActions
              title={task.title}
              onPick={(when) => applyWhen(task, when)}
              onPickDate={(date) => applyDate(task, date)}
              onNote={() => setNotePickerTaskId(task.id)}
              onSendToCalendar={(date, isAllDay, durationMinutes) => void handleSendToCalendar(task, date, isAllDay, durationMinutes)}
              calendarBusy={sendingTaskId !== null}
              onSetArea={(context) => onUpdateTask?.(task.id, { context })}
              onDelete={() => applyTriage(task, { kind: 'delete' })}
            />
          }
          onToggleComplete={() => onToggleTask?.(task.id)}
          onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
          onSelect={() => (selectionMode ? toggleTaskSelection(task.id) : handleSelect(task.id))}
          selectionMode={selectionMode}
          isSelected={selectedTaskIds.has(task.id)}
          onToggleSelection={() => toggleTaskSelection(task.id)}
          onAssign={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
        />
        {showToBuy && (
          <ToBuyNudge
            onSend={() => void handleSendToBuy(task.id)}
            onDismiss={() => { dismissToBuyNudge(task.id); setToBuyDismissals((n) => n + 1) }}
          />
        )}
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
            layers={layers}
            soleDomain={soleDomain}
            onSelect={(sel) => handleNoteSelect(task, sel)}
            onClose={() => setNotePickerTaskId(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className={PAGE_COLUMN_WIDE}>
      {/* The same open masthead the rest of the top group wears (Today, This
          Week, the period pages). No eyebrow — the inbox has no period to step
          through. Its own controls ride along the foot, as Today's do. */}
      <MastheadCard
        variant="page"
        title="Inbox"
        subline={
          totalCount === 0
            ? (loading ? 'Loading your inbox…' : hiddenByFilter ? 'Filtered — nothing in this view' : 'All clear — nothing to triage')
            : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`
        }
        controls={chrome ? <HomeChromeControls className="flex" /> : undefined}
        footer={(totalCount > 0 || familyMembers.length > 0) ? (
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
        ) : undefined}
      />

      <SupernotePagesSection />

      <HomeNeedsDetailsSection />

      <RefileStrip rows={refileRows} onFile={(t, context) => onUpdateTask?.(t.id, { context })} />

      {totalCount === 0 && loading ? (
        <div className="text-center py-16">
          <p className="font-display text-xl text-neutral-700">Loading your inbox…</p>
        </div>
      ) : hiddenByFilter ? (
        <div className="mx-auto max-w-xl py-16 text-center">
          <p className="mb-2 font-display text-[24px] text-neutral-800">Nothing matches these filters</p>
          <p className="text-[15px] text-neutral-500">Captures in other domains or for other people are hidden right now.</p>
          <button
            type="button"
            onClick={() => { showAllDomains(); setSelectedAssignees([]) }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800 hover:bg-primary-100 transition-colors"
          >
            Show everything
          </button>
        </div>
      ) : totalCount === 0 ? (
        <div className="mx-auto max-w-xl py-16 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mx-auto mb-5 h-8 w-8 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <p className="mb-2 font-display text-[24px] text-neutral-800">Inbox zero</p>
          <p className="text-[15px] text-neutral-500">Nothing is waiting for a decision.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/today')}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800 hover:bg-primary-100 transition-colors"
            >
              <Sun className="h-4 w-4" />
              Open today
            </button>
            <button
              type="button"
              onClick={() => navigate('/week')}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
              Plan week
            </button>
          </div>
        </div>
      ) : mode === 'focus' ? (
        <FocusInboxCard
          tasks={inboxTasks}
          familyMembers={familyMembers}
          onTriage={handleFocusTriage}
          onDelete={handleFocusDelete}
          onComplete={handleFocusComplete}
          onUpdate={(taskId, updates) => onUpdateTask?.(taskId, updates)}
          onSelectDetail={handleSelect}
          onExitFocus={() => setMode('dense')}
          onSendToCalendar={handleFocusSendToCalendar}
          sending={sendingTaskId !== null}
        />
      ) : (
        <div className="border-t border-neutral-300">
          {inboxTasks.map(renderRow)}
        </div>
      )}

      {/* #expired: the Planning panel's "older unfinished work" line lands
          here open, on the list, not on a fold to find. */}
      <div id="expired" ref={expiredAnchor} />
      <ExpiredSection
        rows={expiredRows}
        defaultOpen={hash === '#expired'}
        canDelete={!!onDeleteTask}
        onUpdateTask={(id, updates) => onUpdateTask?.(id, updates)}
        onPushTask={onPushTask}
        onDeleteTask={onDeleteTask ? (id) => deleteWithUndo([id], 'Deleted') : undefined}
        onCompleteTask={onToggleTask}
      />

      {undo && (
        <InboxUndoToast
          key={undo.message + (undo.actionLabel ?? '')}
          message={undo.message}
          onUndo={undo.undoable ? handleUndo : undefined}
          onDismiss={dismissUndo}
          actionLabel={undo.actionLabel}
          persistent={undo.persistent}
          busy={undoBusy}
          onRetry={undo.retry ? () => { const r = undo.retry!; undoRef.current = null; setUndo(null); r() } : undefined}
        />
      )}

      {/* Phone: the floating capture bar (native InboxView). Selecting rows
          swaps it for the bulk bar. */}
      {isMobile && selectedTaskIds.size === 0 && (
        <PhoneCaptureBar>
          <PhoneCaptureField placeholder="Add a task…" onSubmit={(text) => { void addTask(text) }} />
        </PhoneCaptureBar>
      )}
      </div>

      {bulkAsk && (
        <BulkAreaDialog
          destination={bulkAsk.when === 'today' ? 'Today' : bulkAsk.when === 'this-week' ? 'This week' : 'Someday'}
          items={bulkAsk.unclassified.map((t) => ({ id: t.id, title: t.title }))}
          classifiedCount={bulkAsk.rows.length - bulkAsk.unclassified.length}
          onCancel={() => setBulkAsk(null)}
          onConfirm={(areas) => { const ask = bulkAsk; setBulkAsk(null); void runBulkWhen(ask.when, ask.rows, areas) }}
        />
      )}

      {selectedTaskIds.size > 0 && (
        // The shared toolbar for a selection: the same three destinations as
        // a row, then life area and delete — instead of every row repeating
        // every action. Wraps on phones (above the tab bar).
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="inbox-bulk fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[55] flex w-[calc(100%-24px)] max-w-2xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2.5 rounded-2xl bg-neutral-900 text-white shadow-xl md:w-auto"
        >
          <span className="text-sm font-medium pr-1">{selectedTaskIds.size} selected</span>
          <span className="text-neutral-500" aria-hidden="true">·</span>
          <button type="button" onClick={() => handleBulkWhen('today')} className="text-sm px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-medium">Today</button>
          <button type="button" onClick={() => handleBulkWhen('this-week')} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10">This week</button>
          <button type="button" onClick={() => handleBulkWhen('someday')} className="text-sm px-2 py-1 rounded-lg hover:bg-white/10">Someday</button>
          <span className="text-neutral-600 mx-1" aria-hidden="true">|</span>
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            Area
            <select
              aria-label="Life area for selected"
              value=""
              onChange={(e) => { const v = e.target.value; if (v) void handleBulkContext(v === 'unsorted' ? null : v as TaskContext) }}
              className="rounded-lg bg-neutral-800 px-1.5 py-1 text-sm text-white"
            >
              <option value="">Set…</option>
              <option value="work">Work</option>
              <option value="family">Family</option>
              <option value="personal">Personal</option>
              <option value="unsorted">Unsorted</option>
            </select>
          </label>
          <button type="button" onClick={handleBulkDelete} className="text-sm px-2 py-1 rounded-lg hover:bg-red-500/30 text-red-300">Delete</button>
          <button type="button" onClick={exitSelection} aria-label="Cancel selection" className="ml-1 p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  )
}
