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
import { Mic, MicOff, Send, Undo2, RotateCcw, X, MessageSquare } from 'lucide-react'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types/chat'
import type { ConversationWalk } from './conversationWalk'
import { useCanvasActivity, type CanvasReceipt } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { DictationMicButton } from '@/components/common/DictationMicButton'
import { usePageGuide } from '@/components/explain/GuideProvider'

export interface StripVoice {
  /** Live two-way voice is available to this account. */
  available: boolean
  active: boolean
  status: string
  start: () => void
  stop: () => void
  mute?: () => void
  /** Live voice's latest words each way, shown in the docked bar. */
  heard?: string
  reply?: string
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
  /** Docked: "What is this page?", where the page has a guide. */
  explain?: ConversationWalk | null
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

  const live = voice.active && (voice.heard || voice.reply)
  if (live) return <div className="canvas-transcript" aria-live="polite">
    {voice.heard && <p className="canvas-transcript-voice"><small>You</small>{voice.heard}</p>}
    {voice.reply && <p className="canvas-transcript-voice"><small>Symphony</small>{voice.reply}</p>}
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

export function ConversationStrip({ onSend, busy, voice, onOpenConversation, onReviewProposals, placeholder = 'Tell Symphony, or ask…', compact = false, receiptOnly = false, docked = false, messages, walk, explain, right = 0 }: Props) {
  const { receipt, undo, retry, dismiss, proposals } = useCanvasActivity()
  const selection = useSelectionOptional()
  const guide = usePageGuide()
  const [draft, setDraft] = useState('')
  // Docked, the bar carries a tour's Back / Next / Close (the note does elsewhere).
  const setBarHosted = guide?.setBarHosted
  useEffect(() => {
    if (!docked || receiptOnly || !setBarHosted) return
    setBarHosted(true)
    return () => setBarHosted(false)
  }, [docked, receiptOnly, setBarHosted])
  const touring = docked && !!guide && guide.count > 1 && guide.source === 'chat'

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

  if (receiptOnly && !shown && pending === 0) return null

  return (
    <section className={`canvas-strip${compact ? ' is-compact' : ''}${docked ? ' is-docked' : ''}${voice.active ? ' is-listening' : ''}`} aria-label="Conversation with Symphony"
      style={docked ? { right } : undefined}>
      {messages && <DockedTranscript messages={messages} busy={busy} voice={voice} />}
      {shown && receipt && (
        <div className="canvas-receipt" aria-live="polite">
          <SaveStateBadge state={receipt.state} />
          {receipt.request && <span className="canvas-receipt-request">{receipt.source === 'conversation' ? `“${receipt.request}”` : receipt.request}</span>}
          {receipt.summary && receipt.summary !== STATE_LABEL[receipt.state] && <span className="canvas-receipt-summary">{receipt.summary}</span>}
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
      {touring && guide && (
        <div className="canvas-tour" aria-label="Showing you this page">
          <span className="canvas-tour-count">{guide.index + 1} of {guide.count}</span>
          <span>Showing you this page</span>
          <button type="button" className="canvas-link" disabled={guide.index === 0} onClick={guide.back}>Back</button>
          <button type="button" className="canvas-link" onClick={guide.next}>{guide.index === guide.count - 1 ? 'Done' : 'Next'}</button>
          {guide.index < guide.count - 1 && <button type="button" className="canvas-link" onClick={guide.close}>Close</button>}
        </div>
      )}
      {receiptOnly ? (
        onOpenConversation && <button type="button" className="canvas-link" onClick={onOpenConversation}><MessageSquare size={14} aria-hidden="true" /> Open the conversation</button>
      ) : (
      <form className="canvas-composer" onSubmit={submit}>
        {walk && !voice.active && <button type="button" className="canvas-walk" disabled={busy} onClick={() => onSend(walk.message)}>{walk.label}</button>}
        {explain && <button type="button" className="canvas-walk canvas-explain" disabled={busy} onClick={() => onSend(explain.message)}>{explain.label}</button>}
        <label className="sr-only" htmlFor="canvas-composer-input">Message Symphony</label>
        <input
          id="canvas-composer-input"
          className="canvas-composer-field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={voice.active ? (voice.status === 'muted' ? 'Voice muted' : 'Listening… or type') : placeholder}
          autoComplete="off"
        />
        {!voice.available && <DictationMicButton onTranscript={appendDictation} className="canvas-icon" title="Dictate into the message" />}
        {voice.available && (
          <button
            type="button"
            className={`canvas-mic${voice.active ? ' is-on' : ''}`}
            onClick={voice.active ? voice.stop : voice.start}
            aria-pressed={voice.active}
            aria-label={voice.active ? 'End voice conversation' : 'Talk with Symphony'}
          >
            {voice.active ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
            <span>{voice.active ? (voice.status === 'connecting' ? 'Connecting…' : docked ? 'End' : 'Listening') : 'Talk'}</span>
          </button>
        )}
        {docked && voice.active && voice.mute && voice.status !== 'connecting' && (
          <button type="button" className="canvas-link" aria-pressed={voice.status === 'muted'} onClick={voice.mute}>{voice.status === 'muted' ? 'Unmute' : 'Mute'}</button>
        )}
        {(!docked || draft.trim()) && <button type="submit" className="canvas-send" disabled={!draft.trim() || busy} aria-label="Send">
          <Send size={15} aria-hidden="true" />
        </button>}
        {onOpenConversation && <button type="button" className="canvas-icon" onClick={onOpenConversation} aria-label="Open the conversation" title="Open the conversation">
          <MessageSquare size={16} aria-hidden="true" />
        </button>}
      </form>
      )}
    </section>
  )
}
