// src/components/assist/AssistDrawer.tsx
//
// The Discuss drawer: a right-side drawer hosting the item's ONE shared AI
// thread. On a family task both partners open the same conversation — each
// message says who wrote it, it updates live, and Symphony answers whoever
// asked with the whole thread as context. Private items keep private threads.
//
// Given a `discuss` entity it uses useDiscussThread. Without one it falls back
// to the older per-opener planning chat (useSymphonyAssistant), which also
// still supplies the read-only history dropdown of pre-Discuss conversations.
//
// Used from the task/routine detail panels. Rendered at z-[60] so it sits
// above full-screen overlays.

import { useMemo, useState } from 'react'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { useDiscussThread, type DiscussEntity } from '@/hooks/useDiscussThread'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import type { AssistantTaskContext } from '@/lib/agentStream'
import type { ChatMessage } from '@/types/chat'
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
  /** Turns this into the item's shared Discuss thread. The scope must already
   *  be derived with scopeForDomain — the drawer never invents one. */
  discuss?: DiscussEntity
}

export function AssistDrawer({ item, onClose, onMutate, discuss }: AssistDrawerProps) {
  const isRoutine = item.kind === 'routine'
  const { members, getCurrentUserMember } = useFamilyMembers()
  // Viewing an older pre-Discuss conversation from the history dropdown.
  // Sending always goes back to the shared thread.
  const [viewingHistory, setViewingHistory] = useState(false)

  // The item's shared thread. Null entity = solo mode, and the hook no-ops.
  const thread = useDiscussThread(discuss ?? null, { taskContext: item, onMutate })

  // Still mounted in Discuss mode: it supplies the read-only history of older
  // mode='chat' conversations on this entity.
  const assistant = useSymphonyAssistant({
    taskContext: item,
    onMutate,
    persistKey: isRoutine ? 'routine' : 'task',
    persistEntityId: item.id,
  })

  const discussMessages: ChatMessage[] = useMemo(
    () => thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      author: m.author,
      ...(m.sources ? { sources: m.sources } : {}),
    })),
    [thread.messages],
  )

  const inDiscuss = !!discuss && !viewingHistory
  const unavailable = !!discuss && !thread.threadId && !!thread.error

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-label={discuss ? `Discuss ${item.title}` : `Plan ${item.title}`}
    >
      {/* Backdrop — click to close */}
      <button
        type="button"
        aria-label="Close planning assistant"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-black/20 cursor-default"
      />
      <aside className="absolute inset-y-0 right-0 w-full max-w-[420px] shadow-2xl bg-white">
        {unavailable ? (
          <div className="flex flex-col h-full items-center justify-center gap-3 px-8 text-center">
            <p className="text-sm text-neutral-600">Discussion isn't available yet</p>
            <p className="text-xs text-neutral-400">
              This item's shared thread needs the Discuss migration applied.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              Close
            </button>
          </div>
        ) : (
          <ChatPanel
            messages={inDiscuss ? discussMessages : assistant.messages}
            loading={inDiscuss ? (thread.loading || thread.sending) : assistant.loading}
            error={inDiscuss ? thread.error : assistant.error}
            entityContext={{ id: item.id, name: item.title, type: isRoutine ? 'routine' : 'task' }}
            mode="chat"
            heading={discuss ? 'Discussion' : undefined}
            currentUserId={getCurrentUserMember()?.auth_user_id ?? undefined}
            familyMembers={members}
            participants={inDiscuss ? thread.participants : []}
            suggestions={isRoutine ? ROUTINE_SUGGESTIONS : TASK_SUGGESTIONS}
            onSend={discuss
              ? (msg) => { setViewingHistory(false); void thread.send(msg) }
              : assistant.sendMessage}
            onClear={assistant.resetSession}
            onClose={onClose}
            onNewChat={discuss
              ? () => { setViewingHistory(false); assistant.resetSession() }
              : assistant.resetSession}
            toolActivity={inDiscuss ? thread.toolActivity : assistant.toolActivity}
            sessions={assistant.sessions}
            sessionsLoading={assistant.sessionsLoading}
            onLoadSession={(session) => {
              assistant.loadSession(session)
              if (discuss) setViewingHistory(true)
            }}
            onDeleteSession={assistant.deleteSession}
            activeSessionId={viewingHistory ? assistant.activeSessionId : null}
          />
        )}
      </aside>
    </div>
  )
}
