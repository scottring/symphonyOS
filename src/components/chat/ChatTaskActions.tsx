// src/components/chat/ChatTaskActions.tsx
//
// A task Symphony names in a reply carries the task's own actions right there
// (Scott, 2026-10-17: "can we have the chat responses have some direct
// actions, like marking it as complete"): Done, Today, and Open. Each saves
// through the canvas receipt, so it shows Saved and offers Undo like any
// other change on the page. Without the provider, replies stay plain text.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Check, CalendarPlus, ArrowUpRight } from 'lucide-react'
import type { Task } from '@/types/task'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { isPlannedToday, matchTaskMention, startOfDay } from '@/lib/chat/taskMentions'

interface ChatTaskActionsValue {
  match: (line: string) => Task | null
  toggle: (task: Task) => void
  planToday: (task: Task) => void
  open?: (task: Task) => void
}

const ChatTaskActionsContext = createContext<ChatTaskActionsValue | null>(null)

export function useChatTaskActions(): ChatTaskActionsValue | null {
  return useContext(ChatTaskActionsContext)
}

interface ProviderProps {
  tasks: Task[]
  toggleTask: (id: string) => Promise<unknown>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  children: ReactNode
}

export function ChatTaskActionsProvider({ tasks, toggleTask, updateTask, children }: ProviderProps) {
  const activity = useCanvasActivity()
  const selection = useSelectionOptional()
  const value = useMemo<ChatTaskActionsValue>(() => {
    // Goals live on lists above the week; the conversation acts on tasks.
    const actionable = tasks.filter((t) => !t.isGoal)
    return {
      match: (line) => matchTaskMention(line, actionable),
      toggle: (t) => {
        const was = t.completed
        void activity.run(was ? `Reopen “${t.title}”` : `Done: “${t.title}”`, () => toggleTask(t.id) as Promise<boolean>, {
          ids: [t.id], undo: async () => { await updateTask(t.id, { completed: was }) },
        })
      },
      planToday: (t) => {
        const patch = lineDropUpdates(t, { kind: 'day', at: startOfDay(new Date()) })
        // Undo writes back exactly the fields the placement wrote.
        const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof Task]])) as Partial<Task>
        void activity.run(`Plan “${t.title}” for today`, () => updateTask(t.id, patch) as Promise<boolean | void>, {
          ids: [t.id], undo: async () => { await updateTask(t.id, prev) },
        })
      },
      open: selection ? (t) => selection.setSelection({ kind: 'task', id: t.id }) : undefined,
    }
  }, [tasks, toggleTask, updateTask, activity, selection])
  return <ChatTaskActionsContext.Provider value={value}>{children}</ChatTaskActionsContext.Provider>
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
