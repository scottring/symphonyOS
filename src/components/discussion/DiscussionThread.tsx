// src/components/discussion/DiscussionThread.tsx
//
// The item's Discussion: a conversation WITH someone (Scott, 2026-10-14: "it's
// not at all clear who I'm chatting with"; mockup "Talking with Iris",
// approved). The header names the people ("You and Iris") and whose turn it
// is; a new discussion starts by choosing who it's with; the box says
// "Message Iris…"; Symphony answers only when asked, and its turns look like
// Symphony's, not a person's. "Mark settled" closes it with what was decided.
// Rendered inside AssistDrawer in discuss mode; the drawer owns open/close.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types/chat'
import type { FamilyMember } from '@/types/family'
import type { Scope } from '@/lib/scope'
import { DiscussionComposer } from './DiscussionComposer'

export interface DiscussionChoice {
  /** The person's auth id. */
  id: string
  name: string
}

export interface DiscussionThreadProps {
  /** The item's title. */
  title: string
  /** The underlying item's scope. */
  scope: Scope
  /** "You and Iris" / "Just you". */
  peopleLabel: string
  /** "Waiting on Iris" / "Waiting on you" / "Settled" … */
  stateLabel: string
  /** The others' names, for the box ("Message Iris…") and the empty state. */
  others: string[]
  messages: ChatMessageType[]
  loading: boolean
  sending: boolean
  error: string | null
  toolActivity: string[]
  currentUserId: string | null
  familyMembers: FamilyMember[]
  /** Rendered as Symphony asks in the empty state. */
  suggestions: string[]
  /** Who it can be with (the household's other logins). Shown to choose from
   *  until the first message. */
  choices?: DiscussionChoice[]
  /** The chosen people (auth ids). */
  chosen?: string[]
  onChoose?: (ids: string[]) => void
  /** "Iris saw this · 12:40" / "Not seen yet" — under your own last word. */
  seen?: string | null
  /** Set when settled: who settled it and what was decided. */
  settled?: { by: string; outcome: string | null } | null
  onSettle?: (outcome: string | null) => void | Promise<boolean | void>
  onReopen?: () => void
  /** Open the item itself (from the Discussions page). */
  onOpenItem?: () => void
  onPost: (text: string) => void | Promise<boolean | void>
  onAsk: (text: string) => void | Promise<boolean | void>
  onClose: () => void
}

export function DiscussionThread({
  title, scope, peopleLabel, stateLabel, others, messages, loading, sending, error, toolActivity,
  currentUserId, familyMembers, suggestions, choices = [], chosen = [], onChoose, seen, settled,
  onSettle, onReopen, onOpenItem, onPost, onAsk, onClose,
}: DiscussionThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [settling, setSettling] = useState(false)
  const [outcome, setOutcome] = useState('')
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, seen])

  const last = messages[messages.length - 1]
  // Symphony has been asked and hasn't started answering yet.
  const thinking = sending && !!last && last.role === 'user' && last.askedSymphony === true
  const starting = messages.length === 0 && !loading
  const withNames = others.length === 0 ? '' : others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
  // A private item: choosing someone shows them this conversation and the
  // item's name, never the item. Said before the first word, not after.
  const privateNote = scope === 'individual' && others.length > 0
    ? `${withNames} will see this conversation and the name of this item, not the item itself.`
    : null
  const toggle = (id: string) => {
    if (!onChoose) return
    onChoose(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col border-l border-neutral-200 bg-white"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
    >
      {/* Header: who, whose turn, about what */}
      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <ConceptIcon name="discussion" size={16} decorative />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold leading-tight text-neutral-800">{peopleLabel}</h2>
            <p className={`mt-0.5 text-[12.5px] ${stateLabel === 'Waiting on you' ? 'font-semibold text-[#b84a26]' : 'text-neutral-500'}`}>{stateLabel}</p>
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
        {onOpenItem ? (
          <button type="button" onClick={onOpenItem} className="mt-2.5 flex w-full items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-left text-[13.5px] text-neutral-800 hover:bg-neutral-200/70">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">About</span>
            <span className="min-w-0 truncate font-medium" title={title}>{title}</span>
          </button>
        ) : (
          <p className="mt-2.5 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-[13.5px] text-neutral-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">About</span>
            <span className="min-w-0 truncate font-medium" title={title}>{title}</span>
          </p>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading && messages.length === 0 ? (
          <p className="pt-8 text-center text-xs text-neutral-400">Opening the discussion…</p>
        ) : starting ? (
          <div className="flex flex-col gap-4">
            {choices.length > 0 && onChoose && (
              <fieldset className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-primary-600/70 bg-primary-50/40 p-4">
                <legend className="px-1 text-[15px] font-semibold text-neutral-800">Talk about this with</legend>
                <div className="flex flex-wrap gap-2">
                  {choices.map((c) => (
                    <button key={c.id} type="button" aria-pressed={chosen.includes(c.id)} onClick={() => toggle(c.id)}
                      className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border-[1.5px] px-4 text-[14px] ${chosen.includes(c.id) ? 'border-primary-700 bg-white font-semibold text-primary-800' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                      {c.name}
                    </button>
                  ))}
                  {scope === 'individual' && (
                    <button type="button" aria-pressed={chosen.length === 0} onClick={() => onChoose([])}
                      className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border-[1.5px] px-4 text-[14px] ${chosen.length === 0 ? 'border-primary-700 bg-white font-semibold text-primary-800' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                      <ConceptIcon name="ai" size={13} decorative />Just Symphony
                    </button>
                  )}
                </div>
                <p className="text-[12.5px] leading-snug text-neutral-600">
                  {others.length > 0
                    ? (privateNote ?? `${withNames} will see it in Discussions, at the top of Symphony. It stays open until one of you marks it settled.`)
                    : 'Just you: think it through here. Symphony answers when you ask.'}
                </p>
              </fieldset>
            )}
            {choices.length === 0 && (
              <p className="pt-6 text-center text-sm text-neutral-600">Think it through here. Symphony answers when you ask.</p>
            )}
            {others.length === 0 && suggestions.length > 0 && (
              <div className="mx-auto flex w-full max-w-[280px] flex-col gap-2">
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

        {seen && !starting && <p className="-mt-1 mb-2 text-right text-[12px] text-neutral-500">{seen}</p>}

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

        {settled && (
          <div className="mx-auto mt-2 flex max-w-[92%] flex-col items-center gap-1 rounded-xl bg-[#e4efe6] px-4 py-3 text-center text-[13px] text-[#2d5a3d]" role="status">
            <span className="font-semibold">Settled by {settled.by}</span>
            {settled.outcome && <span>{settled.outcome}</span>}
            {onReopen && <button type="button" onClick={onReopen} className="mt-1 text-[12.5px] font-medium underline">Reopen</button>}
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

      {settling ? (
        <form className="flex flex-col gap-2 border-t border-neutral-200 bg-white px-3 pt-2.5 pb-3"
          onSubmit={(e) => { e.preventDefault(); void Promise.resolve(onSettle?.(outcome.trim() || null)).then(() => { setSettling(false); setOutcome('') }) }}>
          <label htmlFor="discussion-outcome" className="text-[13px] font-semibold text-neutral-700">What did you decide? <span className="font-normal text-neutral-500">(optional)</span></label>
          <input id="discussion-outcome" autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)}
            className="min-h-[44px] rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 text-sm focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder="Nov 6 and 16; skip the 3rd" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSettling(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>
            <button type="submit" className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">Mark settled</button>
          </div>
        </form>
      ) : (
        <DiscussionComposer onPost={onPost} onAsk={onAsk} disabled={sending}
          placeholder={others.length > 0 ? `Message ${withNames}…` : 'Think it through… or @Symphony to ask'}
          aside={onSettle && !settled && messages.length > 0 ? (
            <button type="button" onClick={() => setSettling(true)}
              className="inline-flex items-center rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              Mark settled
            </button>
          ) : undefined} />
      )}
    </div>
  )
}
