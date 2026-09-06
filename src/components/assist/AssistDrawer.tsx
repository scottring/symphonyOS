// src/components/assist/AssistDrawer.tsx
//
// A right-side drawer with two faces:
//
// - Given a `discuss` entity: the item's ONE shared Discussion. Everyone who
//   can see the item sees the same thread, each message says who wrote it, it
//   updates live, and Symphony speaks only when invited (Ask button or
//   "@Symphony"). Rendered by DiscussionThread.
// - Without one: the older per-opener planning chat (useSymphonyAssistant),
//   rendered by ChatPanel — the solo AI surface.
//
// Rendered at z-[60] so it sits above full-screen overlays.

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { useDiscussThread, type DiscussEntity } from '@/hooks/useDiscussThread'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import type { AssistantTaskContext } from '@/lib/agentStream'
import type { ChatMessage } from '@/types/chat'
import { sharedWithLabel, canOfferShare } from '@/lib/discussions/sharedWith'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { DiscussionThread } from '@/components/discussion/DiscussionThread'

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

const EVENT_SUGGESTIONS = [
  'What do we need to have ready for this?',
  'Who is taking the kids?',
  'Draft a note to the organizer',
]

interface AssistDrawerProps {
  item: AssistantTaskContext
  onClose: () => void
  /** Called after the agent writes (subtasks/notes/schedule) so the caller refetches. */
  onMutate?: () => void
  /** Turns this into the item's shared Discussion. The scope must already
   *  be derived with scopeForDomain — the drawer never invents one. */
  discuss?: DiscussEntity
  /** Share the underlying item with the house (e.g. task.context -> 'family').
   *  The drawer has no update function of its own — this comes from whichever
   *  host has one. Offered only when canOfferShare(...) says it's eligible. */
  onShare?: () => void
}

export function AssistDrawer({ item, onClose, onMutate, discuss, onShare }: AssistDrawerProps) {
  // Escape closes the drawer first; the panel that opened it stays (useEscapeKey stack).
  useEscapeKey(true, onClose)
  const isRoutine = item.kind === 'routine'
  const { members } = useFamilyMembers()

  // The item's shared thread. Null entity = solo mode, and the hook no-ops.
  const thread = useDiscussThread(discuss ?? null, { taskContext: item, onMutate, markRead: true })

  // Solo planning chat. Called unconditionally (hooks), used only without `discuss`.
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
      ...(m.askedSymphony ? { askedSymphony: true as const } : {}),
    })),
    [thread.messages],
  )

  const unavailable = !!discuss && !thread.threadId && !!thread.error
  const shareEligible = !!discuss && canOfferShare(discuss.scope, members)
  const suggestions = discuss?.type === 'event'
    ? EVENT_SUGGESTIONS
    : isRoutine ? ROUTINE_SUGGESTIONS : TASK_SUGGESTIONS

  // Portaled to <body>: the detail panel that opens this drawer is its own
  // stacking context, so a z-[60] inside it still sat under the z-50 capture
  // FAB. Out here the z-index means what it says.
  return createPortal(
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
        ) : discuss ? (
          <DiscussionThread
            title={item.title}
            sharedWithLabel={sharedWithLabel(thread.sharedWith, discuss.scope)}
            scope={discuss.scope}
            messages={discussMessages}
            loading={thread.loading}
            sending={thread.sending}
            error={thread.error}
            toolActivity={thread.toolActivity}
            currentUserId={thread.selfAuthId}
            familyMembers={members}
            suggestions={suggestions}
            onPost={(text) => { void thread.post(text) }}
            onAsk={(text) => { void thread.ask(text) }}
            onClose={onClose}
            onShare={shareEligible ? onShare : undefined}
          />
        ) : (
          <ChatPanel
            messages={assistant.messages}
            loading={assistant.loading}
            error={assistant.error}
            entityContext={{ id: item.id, name: item.title, type: isRoutine ? 'routine' : 'task' }}
            mode="chat"
            suggestions={suggestions}
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
        )}
      </aside>
    </div>,
    document.body,
  )
}
