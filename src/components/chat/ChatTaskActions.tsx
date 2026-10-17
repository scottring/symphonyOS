// src/components/chat/ChatTaskActions.tsx
//
// A task or routine Symphony names in a reply carries its own actions right
// there (Scott, 2026-10-17: "can we have the chat responses have some direct
// actions, like marking it as complete"; "add routines to the chat actions
// too"). A task: Done, Today, Open. A routine: Done today, Skip today, Open,
// all on today's occurrence only; the routine itself is untouched. Each saves
// through the canvas receipt, so it shows Saved and offers Undo like any
// other change on the page. Without the provider, replies stay plain text.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, CalendarPlus, ArrowUpRight, SkipForward } from 'lucide-react'
import type { Task } from '@/types/task'
import type { ActionableStatus, Routine } from '@/types/actionable'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'
import { localYmd } from '@/lib/cadence/config'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { isPlannedToday, matchMention, matchTaskMention, startOfDay } from '@/lib/chat/taskMentions'

export type ChatMention = { kind: 'task'; task: Task } | { kind: 'routine'; routine: Routine }

interface ChatTaskActionsValue {
  match: (line: string) => ChatMention | null
  toggle: (task: Task) => void
  planToday: (task: Task) => void
  open?: (task: Task) => void
  /** Today's occurrence of a routine: done, or back to not done. */
  routineDone: (routine: Routine, done: boolean) => void
  /** Today's occurrence of a routine: skipped, or back on the day. */
  routineSkip: (routine: Routine, skip: boolean) => void
  openRoutine?: (routine: Routine) => void
  /** Where today's occurrence stands, read from its instance. */
  occurrenceStatus: (routineId: string, date: Date) => Promise<ActionableStatus | null>
}

const ChatTaskActionsContext = createContext<ChatTaskActionsValue | null>(null)

export function useChatTaskActions(): ChatTaskActionsValue | null {
  return useContext(ChatTaskActionsContext)
}

interface ProviderProps {
  tasks: Task[]
  toggleTask: (id: string) => Promise<unknown>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  routines?: Routine[]
  children: ReactNode
}

export function ChatTaskActionsProvider({ tasks, toggleTask, updateTask, routines = [], children }: ProviderProps) {
  const activity = useCanvasActivity()
  const selection = useSelectionOptional()
  const { markDone, undoDone, skip, getInstance } = useActionableInstances()
  const value = useMemo<ChatTaskActionsValue>(() => {
    // Goals live on lists above the week; the conversation acts on tasks.
    const actionable = tasks.filter((t) => !t.isGoal)
    // A routine's steps are done inside it, not named on their own.
    const whole = routines.filter((r) => !r.parent_routine_id)
    const today = () => startOfDay(new Date())
    return {
      match: (line) => {
        const task = matchTaskMention(line, actionable)
        const routine = matchMention(line, whole, (r) => r.name)
        // A task and a routine of the same name: a guess either way.
        if (task && routine) return null
        if (task) return { kind: 'task', task }
        if (routine) return { kind: 'routine', routine }
        return null
      },
      toggle: (t) => {
        const was = t.completed
        void activity.run(was ? `Reopen “${t.title}”` : `Done: “${t.title}”`, () => toggleTask(t.id) as Promise<boolean>, {
          ids: [t.id], undo: async () => { await updateTask(t.id, { completed: was }) },
        })
      },
      planToday: (t) => {
        const patch = lineDropUpdates(t, { kind: 'day', at: today() })
        // Undo writes back exactly the fields the placement wrote.
        const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof Task]])) as Partial<Task>
        void activity.run(`Plan “${t.title}” for today`, () => updateTask(t.id, patch) as Promise<boolean | void>, {
          ids: [t.id], undo: async () => { await updateTask(t.id, prev) },
        })
      },
      open: selection ? (t) => selection.setSelection({ kind: 'task', id: t.id }) : undefined,
      routineDone: (r, done) => {
        const day = today()
        void activity.run(done ? `Done today: “${r.name}”` : `Not done today: “${r.name}”`,
          () => (done ? markDone('routine', r.id, day) : undoDone('routine', r.id, day)), {
            ids: [r.id], undo: () => (done ? undoDone('routine', r.id, day) : markDone('routine', r.id, day)),
          })
      },
      routineSkip: (r, skipIt) => {
        const day = today()
        void activity.run(skipIt ? `Skip “${r.name}” today` : `Put “${r.name}” back on today`,
          () => (skipIt ? skip('routine', r.id, day) : undoDone('routine', r.id, day)), {
            ids: [r.id], undo: () => (skipIt ? undoDone('routine', r.id, day) : skip('routine', r.id, day)),
          })
      },
      openRoutine: selection ? (r) => selection.setSelection({ kind: 'routine', id: r.id, date: localYmd(today()) }) : undefined,
      occurrenceStatus: async (id, date) => (await getInstance('routine', id, date))?.status ?? null,
    }
  }, [tasks, routines, toggleTask, updateTask, activity, selection, markDone, undoDone, skip, getInstance])
  return <ChatTaskActionsContext.Provider value={value}>{children}</ChatTaskActionsContext.Provider>
}

/** A line of the reply that names a task or routine, with its actions after it. */
export function ChatMentionLine({ mention, html }: { mention: ChatMention; html: string }) {
  if (mention.kind === 'routine') return <RoutineLine routine={mention.routine} html={html} />
  return (
    <div className={`chat-task-line${mention.task.completed ? ' is-done' : ''}`}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      <ChatTaskLineActions task={mention.task} />
    </div>
  )
}

/** The named task's actions, drawn after its line in the reply. */
export function ChatTaskLineActions({ task }: { task: Task }) {
  const actions = useChatTaskActions()
  if (!actions) return null
  const done = task.completed
  return (
    <span className="chat-task-actions" role="group" aria-label={`Actions for “${task.title}”`}>
      <button type="button" className={`chat-task-action${done ? ' is-done' : ''}`} aria-pressed={done}
        onClick={() => actions.toggle(task)} title={done ? 'Reopen' : 'Mark done'}>
        <Check size={13} aria-hidden="true" />{done ? 'Done' : 'Mark done'}
      </button>
      {!done && !isPlannedToday(task) && (
        <button type="button" className="chat-task-action" onClick={() => actions.planToday(task)} title="Plan for today">
          <CalendarPlus size={13} aria-hidden="true" />Today
        </button>
      )}
      {actions.open && (
        <button type="button" className="chat-task-action" onClick={() => actions.open!(task)} aria-label={`Open “${task.title}”`} title="Open">
          <ArrowUpRight size={13} aria-hidden="true" />Open
        </button>
      )}
    </span>
  )
}

/** Where today's occurrence stands; null until read. Re-read when any
 *  occurrence changes (the writers signal it), so Undo shows here too. */
function useTodayStatus(routineId: string): ActionableStatus | null {
  const actions = useChatTaskActions()
  const [status, setStatus] = useState<{ id: string; value: ActionableStatus | null } | null>(null)
  const read = actions?.occurrenceStatus
  useEffect(() => {
    if (!read) return
    let live = true
    const load = async () => {
      const value = await read(routineId, startOfDay(new Date())).catch(() => null)
      if (live) setStatus({ id: routineId, value })
    }
    void load()
    const stop = onInstancesChanged(() => { void load() })
    return () => { live = false; stop() }
  }, [routineId, read])
  return status?.id === routineId ? status.value : null
}

function RoutineLine({ routine, html }: { routine: Routine; html: string }) {
  const actions = useChatTaskActions()
  const status = useTodayStatus(routine.id)
  if (!actions) return null
  const done = status === 'completed'
  const skipped = status === 'skipped'
  return (
    <div className={`chat-task-line${done || skipped ? ' is-done' : ''}`}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      <span className="chat-task-actions" role="group" aria-label={`Actions for “${routine.name}”`}>
        {!skipped && (
          <button type="button" className={`chat-task-action${done ? ' is-done' : ''}`} aria-pressed={done}
            onClick={() => actions.routineDone(routine, !done)} title={done ? 'Not done today' : 'Done for today'}>
            <Check size={13} aria-hidden="true" />Done today
          </button>
        )}
        {!done && (
          <button type="button" className={`chat-task-action${skipped ? ' is-done' : ''}`} aria-pressed={skipped}
            onClick={() => actions.routineSkip(routine, !skipped)} title={skipped ? 'Put back on today' : 'Skip today only'}>
            <SkipForward size={13} aria-hidden="true" />{skipped ? 'Skipped today' : 'Skip today'}
          </button>
        )}
        {actions.openRoutine && (
          <button type="button" className="chat-task-action" onClick={() => actions.openRoutine!(routine)} aria-label={`Open “${routine.name}”`} title="Open">
            <ArrowUpRight size={13} aria-hidden="true" />Open
          </button>
        )}
      </span>
    </div>
  )
}
