// src/components/planning/daily/PlanAssistDrawer.tsx
//
// The "make this doable" surface inside the Plan-your-day wizard (walkthrough
// P1): a right-side drawer hosting the fenced Symphony assistant, scoped to
// one task. The agent can break the task into subtasks, enrich its notes, or
// mark it needs-discussion — the wizard refetches after any write.
//
// Rendered above the wizard overlay (z-50), so the drawer sits at z-[60].

import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import type { AssistantTaskContext } from '@/lib/agentStream'
import { ChatPanel } from '@/components/chat/ChatPanel'

const PLAN_SUGGESTIONS = [
  'Break this into doable steps',
  'What do I need before I can start?',
  'The next step is a conversation — set that up',
]

interface PlanAssistDrawerProps {
  task: AssistantTaskContext
  onClose: () => void
  /** Called after the agent writes (subtasks/notes/discussion) so the wizard refetches. */
  onMutate?: () => void
}

export function PlanAssistDrawer({ task, onClose, onMutate }: PlanAssistDrawerProps) {
  const assistant = useSymphonyAssistant({ taskContext: task, onMutate })

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label={`Plan ${task.title}`}>
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
          entityContext={{ id: task.id, name: task.title, type: 'task' }}
          mode="chat"
          suggestions={PLAN_SUGGESTIONS}
          onSend={assistant.sendMessage}
          onClear={assistant.resetSession}
          onClose={onClose}
          onNewChat={assistant.resetSession}
          toolActivity={assistant.toolActivity}
        />
      </aside>
    </div>
  )
}
