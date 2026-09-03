// src/components/discussion/DiscussionThread.tsx
//
// The item's Discussion: a conversation between the people who can see the
// item, with Symphony as a third participant who speaks only when invited.
// The header says who is in the room so there is no invite step to look for.
// Rendered inside AssistDrawer in discuss mode; the drawer owns open/close.

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types/chat'
import type { FamilyMember } from '@/types/family'
import { DiscussionComposer } from './DiscussionComposer'

export interface DiscussionThreadProps {
  /** The item's title. */
  title: string
  /** "Shared with Iris" / "Only you" — derived, see sharedWithLabel. */
  sharedWithLabel: string
  messages: ChatMessageType[]
  loading: boolean
  sending: boolean
  error: string | null
  toolActivity: string[]
  currentUserId: string | null
  familyMembers: FamilyMember[]
  /** Rendered as Symphony asks in the empty state. */
  suggestions: string[]
  onPost: (text: string) => void
  onAsk: (text: string) => void
  onClose: () => void
}

export function DiscussionThread({
  title, sharedWithLabel, messages, loading, sending, error, toolActivity,
  currentUserId, familyMembers, suggestions, onPost, onAsk, onClose,
}: DiscussionThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const last = messages[messages.length - 1]
  // Symphony has been asked and hasn't started answering yet.
  const thinking = sending && !!last && last.role === 'user' && last.askedSymphony === true
  const shared = sharedWithLabel !== 'Only you'

  return (
    <div
      className="flex h-full min-h-0 flex-col border-l border-neutral-200 bg-white"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <ConceptIcon name="discussion" size={15} decorative />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-800">Discussion</h2>
          <p className="truncate text-xs text-neutral-500" title={title}>{title}</p>
          <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${shared ? 'text-primary-700' : 'text-neutral-400'}`}>
            <ConceptIcon name="person" size={11} decorative />
            {sharedWithLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close discussion"
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading && messages.length === 0 ? (
          <p className="pt-8 text-center text-xs text-neutral-400">Opening the discussion…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-400">
              <ConceptIcon name="discussion" size={22} decorative />
            </div>
            <p className="text-sm text-neutral-600">
              {shared
                ? `Talk it through with ${sharedWithLabel.replace(/^Shared with /, '')}, or ask Symphony.`
                : 'Think it through here, or ask Symphony.'}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Symphony only answers when you ask.
            </p>
            {suggestions.length > 0 && (
              <div className="mt-5 flex w-full max-w-[260px] flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onAsk(s)}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                  >
                    <ConceptIcon name="ai" size={12} decorative />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              currentUserId={currentUserId}
              familyMembers={familyMembers}
            />
          ))
        )}

        {thinking && (
          <div className="mb-3 flex justify-start" aria-label="Symphony is thinking">
            <div className="rounded-2xl bg-neutral-100 px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto mb-3 max-w-[85%] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {toolActivity.length > 0 && sending && (
        <div className="border-t border-neutral-200/60 px-4 py-1.5 text-xs text-neutral-400">
          {toolActivity[toolActivity.length - 1].replace(/^mcp__symphony__symphony_/, '').replace(/^symphony_/, '').replace(/_/g, ' ')}…
        </div>
      )}

      <DiscussionComposer onPost={onPost} onAsk={onAsk} disabled={sending} />
    </div>
  )
}
