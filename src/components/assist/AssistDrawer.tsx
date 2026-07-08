// src/components/assist/AssistDrawer.tsx
//
// The "make this doable" surface (walkthrough P1): a right-side drawer hosting
// the fenced Symphony assistant, scoped to one task or routine. The agent can
// break a task into subtasks, enrich notes, mark it needs-discussion, or
// adjust a routine — callers refetch after any write via onMutate.
//
// Used from the Plan-your-day wizard cards and the task/routine detail panels.
// Rendered at z-[60] so it sits above full-screen overlays (wizard is z-50).

import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import type { AssistantTaskContext } from '@/lib/agentStream'
import { ChatPanel } from '@/components/chat/ChatPanel'

const TASK_SUGGESTIONS = [
  'Break this into doable steps',
  'What do I need before I can start?',
  'The next step is a conversation — set that up',
]

const ROUTINE_SUGGESTIONS = [
  'Help me fit this into our week',
  'Adjust when this happens',
  'What would make this routine stick?',
]

interface AssistDrawerProps {
  item: AssistantTaskContext
  onClose: () => void
  /** Called after the agent writes (subtasks/notes/schedule) so the caller refetches. */
  onMutate?: () => void
}

export function AssistDrawer({ item, onClose, onMutate }: AssistDrawerProps) {
  const isRoutine = item.kind === 'routine'
  // Persist every conversation, linked to this task/routine — a planning chat
  // (specs, store advice, decisions) is task context the user must be able to
  // reopen later from the entity's panel.
  const assistant = useSymphonyAssistant({
    taskContext: item,
    onMutate,
    persistKey: isRoutine ? 'routine' : 'task',
    persistEntityId: item.id,
  })

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label={`Plan ${item.title}`}>
      {/* Backdrop — click to close */}
      <button
        type="button"
        aria-label="Close planning assistant"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-black/20 cursor-default"
      />
      <aside className="absolute inset-y-0 right-0 w-full max-w-[420px] shadow-2xl bg-white">
        <ChatPanel
          messages={assistant.messages}
          loading={assistant.loading}
          error={assistant.error}
          entityContext={{ id: item.id, name: item.title, type: isRoutine ? 'routine' : 'task' }}
          mode="chat"
          suggestions={isRoutine ? ROUTINE_SUGGESTIONS : TASK_SUGGESTIONS}
          onSend={assistant.sendMessage}
          onClear={assistant.resetSession}
          onClose={onClose}
          onNewChat={assistant.resetSession}
          toolActivity={assistant.toolActivity}
          sessions={assistant.sessions}
          sessionsLoading={assistant.sessionsLoading}
          onLoadSession={assistant.loadSession}
          onDeleteSession={assistant.deleteSession}
          activeSessionId={assistant.activeSessionId}
        />
      </aside>
    </div>
  )
}
