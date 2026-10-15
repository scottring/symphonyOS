// src/components/canvas/ConversationStrip.tsx
//
// The conversation's place in the frame: one docked line under Today, Week
// and Plan. The composer (text + mic) is always there; the latest receipt sits
// above it with its save state, what changed (each change opens its item),
// and Undo or Retry. The full transcript stays in the existing AI pane.
//
// Docked (Plan on desktop): the one conversation on the page, pinned to the
// window's foot (approved Season board, 2026-10-10). No side pane opens; the
// latest exchange shows above the field, with Earlier for the rest.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Mic, Send, Undo2, RotateCcw, X, MessageSquare, Check } from 'lucide-react'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types/chat'
import type { ConversationWalk } from './conversationWalk'
import { useCanvasActivity, type CanvasReceipt } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { PendingChangeCard } from './ChangeCard'
import { DictationMicButton } from '@/components/common/DictationMicButton'

export interface StripVoice {
  /** Live two-way voice is available to this account. */
  available: boolean
  active: boolean
  status: string
  start: () => void
  stop: () => void
  mute?: () => void
  /** Why the last start was refused, shown under the bar (2026-10-15). */
  error?: string | null
  /** Live voice's latest words each way, shown in the docked bar. */
  heard?: string
  reply?: string
  /** Tap to talk: 'listening' while it's the person's turn. */
  turn?: 'listening' | 'off'
  /** Open the mic for the person's turn (stops Symphony if it is talking). */
  talk?: () => void
  /** Done: send the turn. */
  done?: () => void
}

interface Props {
  onSend: (text: string) => void
  busy: boolean
  voice: StripVoice
  /** Opens the full conversation elsewhere (the side pane). Docked bars have none. */
  onOpenConversation?: () => void
  /** Where proposals are reviewed; shown when there are some. */
  onReviewProposals?: () => void
  placeholder?: string
  compact?: boolean
  /** Phone: the capture bar and the conversation overlay own typing, so the
   *  strip shows only the latest receipt and suggestions, and only when there are some. */
  receiptOnly?: boolean
  /** Pinned to the window's foot, the page's one conversation. */
  docked?: boolean
  /** Docked: the conversation, so its latest reply shows above the field. */
  messages?: ChatMessageType[]
  /** Docked: the page's walk ("Plan this season with me"). */
  walk?: ConversationWalk | null
  /** Docked: room left for an open side pane, in px. */
  right?: number
}

const STATE_LABEL: Record<CanvasReceipt['state'], string> = {
  listening: 'Listening', working: 'Working', saving: 'Saving', saved: 'Saved',
  partial: 'Partly saved', failed: "Didn't save", answered: '', unverified: 'Not checked here',
}

export function SaveStateBadge({ state }: { state: CanvasReceipt['state'] }) {
  const label = STATE_LABEL[state]
  if (!label) return null
  return <span className={`canvas-state is-${state}`} role="status">{label}</span>
}

/** The latest exchange, or the whole conversation when asked for. */
function DockedTranscript({ messages, busy, voice }: { messages: ChatMessageType[]; busy: boolean; voice: StripVoice }) {
  const [earlier, setEarlier] = useState(false)
  // Closing hides what is there now; the next message brings it back.
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const said = messages.filter((m) => m.content.trim() || m.role === 'assistant')
  const lastUser = said.map((m) => m.role).lastIndexOf('user')
  const latest = lastUser >= 0 ? said.slice(lastUser) : said.slice(-1)
  const shown = earlier ? said : latest
  const end = shown.at(-1)
  useEffect(() => { scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight }) }, [end?.id, end?.content, earlier])

  const listening = voice.active && voice.turn === 'listening'
  const live = voice.active && (voice.heard || voice.reply || listening)
  // While it's your turn: your words as you say them, and no hurry.
  if (live) return <div className="canvas-transcript" aria-live="polite">
    {listening
      ? <p className="canvas-transcript-voice is-listening"><small>You</small>{voice.heard || <span className="canvas-transcript-wait">Listening — take your time. Tap Done when you’re finished.</span>}</p>
      : <>
          {voice.heard && <p className="canvas-transcript-voice"><small>You</small>{voice.heard}</p>}
          {voice.reply && <p className="canvas-transcript-voice"><small>Symphony</small>{voice.reply}</p>}
        </>}
  </div>
  if (said.length === 0 || closedAt === said.length) return null
  return <div className="canvas-transcript">
    <div ref={scroller} className="canvas-transcript-scroll" aria-live="polite">
      {shown.map((m) => m.content.trim()
        ? <ChatMessage key={m.id} message={m} />
        : busy ? <p key={m.id} className="canvas-transcript-wait" role="status">Symphony is thinking…</p> : null)}
    </div>
    <div className="canvas-transcript-tools">
      {said.length > latest.length && <button type="button" className="canvas-link" aria-expanded={earlier} onClick={() => setEarlier((v) => !v)}>
        {earlier ? 'Only the latest' : 'Earlier'}
      </button>}
      <button type="button" className="canvas-icon" onClick={() => { setClosedAt(said.length); setEarlier(false) }} aria-label="Hide the conversation"><X size={14} aria-hidden="true" /></button>
    </div>
  </div>
}

export function ConversationStrip({ onSend, busy, voice, onOpenConversation, onReviewProposals, placeholder = 'Tell Symphony, or ask…', compact = false, receiptOnly = false, docked = false, messages, walk, right = 0 }: Props) {
  const { receipt, undo, retry, dismiss, proposals, changeSet } = useCanvasActivity()
  const selection = useSelectionOptional()
  const [draft, setDraft] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    onSend(text)
    setDraft('')
  }
  const appendDictation = useCallback((text: string) => setDraft((d) => (d ? `${d} ${text}` : text)), [])

  const pending = proposals.filter((p) => p.state !== 'saving').length
  // Docked, an answer is in the transcript; the receipt line is for saves.
  const shown = receipt && (receipt.state !== 'answered' || (receipt.request && !messages))

  if (receiptOnly && !shown && pending === 0 && !changeSet) return null

  return (
    <section className={`canvas-strip${compact ? ' is-compact' : ''}${docked ? ' is-docked' : ''}${voice.active ? ' is-listening' : ''}`} aria-label="Conversation with Symphony"
      style={docked ? { right } : undefined}>
      {messages && <DockedTranscript messages={messages} busy={busy} voice={voice} />}
      <PendingChangeCard />
      {shown && receipt && (
        <div className="canvas-receipt" aria-live="polite">
          <SaveStateBadge state={receipt.state} />
          {receipt.request && <span className="canvas-receipt-request">{receipt.source === 'conversation' ? `“${receipt.request}”` : receipt.request}</span>}
          {receipt.summary && receipt.summary !== STATE_LABEL[receipt.state] && <span className="canvas-receipt-summary">{receipt.summary}</span>}
          {receipt.requestId && (receipt.state === 'failed' || receipt.state === 'partial' || receipt.state === 'unverified') && (
            <span className="canvas-receipt-summary" title="Quote this if you report the problem">Ref {receipt.requestId.slice(0, 8)}</span>
          )}
          {receipt.changes.length > 0 && selection && (
            <span className="canvas-receipt-changes">
              {receipt.changes.filter((c) => c.kind !== 'removed' && c.entity === 'task').slice(0, 4).map((c) => (
                <button key={c.id} type="button" className="canvas-chip" onClick={() => selection.setSelection({ kind: 'task', id: c.id })}>
                  {c.title}
                </button>
              ))}
            </span>
          )}
          <span className="canvas-receipt-actions">
            {receipt.undoable && <button type="button" className="canvas-link" onClick={() => void undo()}><Undo2 size={13} aria-hidden="true" /> Undo</button>}
            {receipt.canRetry && <button type="button" className="canvas-link" onClick={retry}><RotateCcw size={13} aria-hidden="true" /> Retry</button>}
            {receipt.state !== 'saving' && receipt.state !== 'working' && (
              <button type="button" className="canvas-icon" onClick={dismiss} aria-label="Dismiss"><X size={14} aria-hidden="true" /></button>
            )}
          </span>
        </div>
      )}
      {pending > 0 && (
        <div className="canvas-proposals-line">
          <span className="canvas-state is-proposed">Suggested</span>
          <span>{pending === 1 ? '1 suggestion from Symphony' : `${pending} suggestions from Symphony`}. Nothing is saved until you keep it.</span>
          {onReviewProposals && <button type="button" className="canvas-link" onClick={onReviewProposals}>Review</button>}
        </div>
      )}
      {receiptOnly ? (
        onOpenConversation && <button type="button" className="canvas-link" onClick={onOpenConversation}><MessageSquare size={14} aria-hidden="true" /> Open the conversation</button>
      ) : (
      <>
      {/* The page's suggested talk reads as a suggestion, not a command
          (Scott, 2026-10-14: three same-looking buttons were confusing). */}
      {walk && !voice.active && (
        <p className="canvas-suggest">Suggested: <button type="button" className="canvas-suggest-link" disabled={busy} onClick={() => onSend(walk.message)}>{walk.label}</button></p>
      )}
      <form className="canvas-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="canvas-composer-input">Message Symphony</label>
        <input
          id="canvas-composer-input"
          className="canvas-composer-field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={voice.active ? (voice.turn === 'listening' ? 'Listening — take your time' : 'Tap Talk, or type') : placeholder}
          autoComplete="off"
        />
        {!voice.available && <DictationMicButton onTranscript={appendDictation} className="canvas-icon" title="Dictate into the message" />}
        {voice.available && (() => {
          // Tap to talk: Talk opens your turn, Done sends it. Pauses are yours.
          const listening = voice.active && voice.turn === 'listening'
          const connecting = voice.active && voice.status === 'connecting'
          const onClick = !voice.active ? voice.start : listening ? voice.done : voice.talk
          return (
            <button
              type="button"
              className={`canvas-mic${listening ? ' is-on' : ''}`}
              onClick={() => onClick?.()}
              disabled={connecting}
              aria-pressed={listening}
              aria-label={listening ? 'Done talking — send to Symphony' : voice.active ? 'Talk — your turn' : 'Talk with Symphony'}
            >
              {listening ? <Check size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              {/* An icon in the field until a conversation is on (2026-10-14). */}
              {voice.active && <span>{connecting ? 'Connecting…' : listening ? 'Done' : 'Talk'}</span>}
            </button>
          )
        })()}
        {voice.error && !voice.active && <p role="alert" className="canvas-voice-error">{voice.error}</p>}
        {voice.active && voice.status !== 'connecting' && (
          <button type="button" className="canvas-link" onClick={voice.stop} aria-label="End voice conversation">End</button>
        )}
        {(!docked || draft.trim()) && <button type="submit" className="canvas-send" disabled={!draft.trim() || busy} aria-label="Send">
          <Send size={15} aria-hidden="true" />
        </button>}
        {onOpenConversation && <button type="button" className="canvas-icon" onClick={onOpenConversation} aria-label="Open the conversation" title="Open the conversation">
          <MessageSquare size={16} aria-hidden="true" />
        </button>}
      </form>
      </>
      )}
    </section>
  )
}
