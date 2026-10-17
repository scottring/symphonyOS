// Conversation history, proposed changes and confirmed results share one reading surface.

import { useEffect, useRef, useState, useId, type FormEvent } from 'react'
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
  /** What is happening now, so the bar moves: who is speaking, or a save running. */
  speaking?: 'you' | 'symphony' | null
  working?: boolean
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
  /** Beta chat: typing and explicit Save, without voice controls or duplicate captions. */
  chatOnly?: boolean
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
  /** Full-height conversation beside the page, or inside the phone overlay. */
  panel?: boolean
  onClose?: () => void
  draft?: string
  onDraftChange?: (draft: string) => void
  error?: string | null
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

export function SaveStateBadge({ state, text }: { state: CanvasReceipt['state']; text?: string }) {
  const label = text ?? STATE_LABEL[state]
  if (!label) return null
  return <span className={`canvas-state is-${state}`} role="status">{label}</span>
}

function VoiceState({ voice }: { voice: StripVoice }) {
  const listening = voice.active && voice.turn === 'listening'
  const state = !voice.active ? null
    : voice.working ? { key: 'working', text: 'Working on it…' }
    : voice.speaking === 'symphony' ? { key: 'symphony', text: 'Symphony is speaking' }
    : voice.speaking === 'you' ? { key: 'you', text: 'Hearing you…' }
    : listening ? { key: 'listening', text: 'Listening — your turn, take your time' }
    : voice.status === 'connecting' ? { key: 'connecting', text: 'Connecting…' }
    : { key: 'thinking', text: 'Thinking…' }
  return state ? <p className={`canvas-voice-state is-${state.key}`} data-testid="voice-state" role="status"><span className="canvas-voice-dot" aria-hidden="true" /><span className="canvas-voice-dot" aria-hidden="true" /><span className="canvas-voice-dot" aria-hidden="true" />{state.text}</p> : null
}

/** The latest exchange, or the whole conversation when asked for. */
function DockedTranscript({ messages, busy, voice, panel = false, chatOnly = false }: { messages: ChatMessageType[]; busy: boolean; voice: StripVoice; panel?: boolean; chatOnly?: boolean }) {
  const [earlier, setEarlier] = useState(false)
  // Closing hides what is there now; the next message brings it back.
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const said = messages.filter((m) => m.content.trim() || m.role === 'assistant')
  const lastUser = said.map((m) => m.role).lastIndexOf('user')
  const latest = lastUser >= 0 ? said.slice(lastUser) : said.slice(-1)
  const shown = panel || earlier ? said : latest
  const end = shown.at(-1)
  useEffect(() => { scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight }) }, [end?.id, end?.content, earlier])

  const listening = voice.active && voice.turn === 'listening'
  // While it's your turn: your words as you say them, and no hurry.
  const liveWords = !chatOnly && (voice.active || (voice.error && voice.heard)) ? <div className="canvas-transcript" aria-live="polite">
    {voice.heard && <p className="canvas-transcript-voice"><small>{voice.active ? 'You' : 'Last words heard (may be incomplete)'}</small>{voice.heard}</p>}
    {voice.reply && (panel || !listening) && <p className="canvas-transcript-voice"><small>Symphony</small>{voice.reply}</p>}
    {!panel && <VoiceState voice={voice} />}
  </div>
  : null
  if (!panel && liveWords) return liveWords
  if (!panel && (said.length === 0 || closedAt === said.length)) return null
  return <div className="canvas-transcript">
    <div ref={scroller} className="canvas-transcript-scroll" aria-live="polite">
      {shown.map((m) => m.content.trim()
        ? <ChatMessage key={m.id} message={m} />
        : busy ? <p key={m.id} className="canvas-transcript-wait" role="status">Symphony is thinking…</p> : null)}
    </div>
    {panel && liveWords}
    {chatOnly && busy && !shown.some(m => m.role === 'assistant' && !m.content.trim()) && <p className="canvas-transcript-wait" role="status">Symphony is thinking…</p>}
    {panel && said.length === 0 && (!voice.active || chatOnly) && !busy && <p className="canvas-transcript-empty">{chatOnly ? 'What would you like to work on?' : 'Talk through your plans here. Your conversation stays beside the page.'}</p>}
    {!panel && <div className="canvas-transcript-tools">
      {said.length > latest.length && <button type="button" className="canvas-link" aria-expanded={earlier} onClick={() => setEarlier((v) => !v)}>
        {earlier ? 'Only the latest' : 'Earlier'}
      </button>}
      <button type="button" className="canvas-icon" onClick={() => { setClosedAt(said.length); setEarlier(false) }} aria-label="Hide the conversation"><X size={14} aria-hidden="true" /></button>
    </div>}
  </div>
}

export function ConversationStrip({ chatOnly = false, onSend, busy, voice, onOpenConversation, onReviewProposals, placeholder = 'Tell Symphony, or ask…', compact = false, receiptOnly = false, docked = false, panel = false, onClose, messages, walk, right = 0, draft: externalDraft, onDraftChange, error }: Props) {
  const { receipt, undo, retry, dismiss, proposals, changeSet } = useCanvasActivity()
  const selection = useSelectionOptional()
  const [localDraft, setLocalDraft] = useState('')
  const draft = externalDraft ?? localDraft
  const setDraft = (next: string) => { setLocalDraft(next); onDraftChange?.(next) }
  const inputId = useId()
  const composer = useRef<HTMLTextAreaElement>(null)
  const [editing, setEditing] = useState(false)
  const saving = receipt?.state === 'saving' || changeSet?.state === 'saving'
  const editDraft = () => { setEditing(true); composer.current?.focus() }
  const panelScroll = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const lastMessage = messages?.at(-1)
  useEffect(() => {
    if (panel && followLatest.current) panelScroll.current?.scrollTo?.({ top: panelScroll.current.scrollHeight })
  }, [panel, lastMessage?.id, lastMessage?.content, voice.heard, voice.reply, changeSet, receipt])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy || saving) return
    followLatest.current = true
    onSend(text)
    setDraft('')
    setEditing(false)
  }
  const appendDictation = (text: string) => setDraft(draft ? `${draft} ${text}` : text)

  const pending = proposals.filter((p) => p.state !== 'saving').length
  // Docked, an answer is in the transcript; the receipt line is for saves.
  const shown = receipt && (receipt.state !== 'answered' || (chatOnly && receipt.undoable) || (receipt.request && !messages))
  const cardOwnsReceipt = chatOnly && changeSet && receipt?.request === changeSet.title && ['saving', 'failed', 'partial'].includes(receipt.state)
  const showChatReceipt = chatOnly && shown && !cardOwnsReceipt && receipt?.state !== 'working'

  if (receiptOnly && !shown && pending === 0 && !changeSet) return null

  return (
    <section className={`canvas-strip${compact ? ' is-compact' : ''}${docked ? ' is-docked' : ''}${panel ? ' is-panel' : ''}${chatOnly ? ' is-chat' : ''}${voice.active && !chatOnly ? ' is-listening' : ''}`} aria-label={chatOnly ? "Chat with Symphony" : "Conversation with Symphony"}
      style={docked ? { right } : undefined}>
      {panel && onClose && <header className="conversation-panel-header"><h2>{chatOnly ? "Chat with Symphony" : "Conversation"}</h2><button type="button" className="canvas-icon" aria-label="Close conversation" onClick={onClose}><X size={20} /></button></header>}
      <div ref={panelScroll} className={panel ? 'conversation-panel-scroll' : undefined} onScroll={event => {
        const el = event.currentTarget
        followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}>
      {error && <p role="alert" className="canvas-voice-error">{error}</p>}
      {messages && <DockedTranscript messages={messages} busy={busy} voice={voice} panel={panel} chatOnly={chatOnly} />}
      <PendingChangeCard chat={chatOnly} updating={busy} onEdit={chatOnly ? editDraft : undefined} />
      {showChatReceipt && receipt && <ChatReceipt receipt={receipt} onUndo={() => void undo()} onRetry={retry} busy={busy || saving} />}
      {!chatOnly && shown && receipt && (
        <div key={`${receipt.key}:${receipt.state}:${receipt.summary}`} className={`canvas-receipt is-${receipt.state}`} aria-live="polite">
          <SaveStateBadge state={receipt.state} text={receipt.summary === 'Undone' || receipt.summary === 'Undoing…' ? receipt.summary : undefined} />
          {receipt.request && <span className="canvas-receipt-request">{receipt.source === 'conversation' ? `“${receipt.request}”` : receipt.request}</span>}
          {receipt.summary && receipt.summary !== STATE_LABEL[receipt.state] && !['Undone', 'Undoing…'].includes(receipt.summary) && <span className="canvas-receipt-summary">{receipt.summary}</span>}
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
      </div>
      {receiptOnly ? (
        onOpenConversation && <button type="button" className="canvas-link" onClick={onOpenConversation}><MessageSquare size={14} aria-hidden="true" /> Open the conversation</button>
      ) : (
      <>
      {/* The page's suggested talk reads as a suggestion, not a command
          (Scott, 2026-10-14: three same-looking buttons were confusing). */}
      {walk && !voice.active && (!chatOnly || (!messages?.length && !changeSet && !receipt && !busy)) && (
        <p className="canvas-suggest">Suggested: <button type="button" className="canvas-suggest-link" disabled={busy} onClick={() => onSend(walk.message)}>{walk.label}</button></p>
      )}
      {panel && !chatOnly && <VoiceState voice={voice} />}
      <form className="canvas-composer" onSubmit={submit}>
        <label className={chatOnly ? "canvas-composer-label" : "sr-only"} htmlFor={inputId}>Message Symphony</label>
        <textarea
          id={inputId}
          ref={composer}
          className="canvas-composer-field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={chatOnly ? (editing ? 'What would you like to change?' : '') : voice.active ? (voice.turn === 'listening' ? 'Listening — take your time' : 'Tap Talk, or type') : placeholder}
          autoComplete="off"
          rows={panel ? 2 : 1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(e) } }}
        />
        {!chatOnly && !voice.available && <DictationMicButton onTranscript={appendDictation} className="canvas-icon" title="Dictate into the message" />}
        {!chatOnly && voice.available && (() => {
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
        {!chatOnly && voice.error && <p role="alert" className="canvas-voice-error">{voice.error}</p>}
        {!chatOnly && voice.active && (
          <button type="button" className="canvas-link" onClick={voice.stop} aria-label="End voice conversation">End</button>
        )}
        {(!docked || draft.trim()) && <button type="submit" className="canvas-send" disabled={!draft.trim() || busy || saving} aria-label="Send">
          <Send size={15} aria-hidden="true" />{chatOnly && <span>Send</span>}
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

/** One truthful result after the draft has finished saving; keep failures explicit. */
function ChatReceipt({ receipt, onUndo, onRetry, busy }: { receipt: CanvasReceipt; onUndo: () => void; onRetry: () => void; busy: boolean }) {
  const undone = receipt.summary === 'Undone'
  const undoing = receipt.summary === 'Undoing…'
  const count = receipt.changeCount
  const changes = count ? `${count} ${count === 1 ? 'change' : 'changes'}` : null
  const label = undone ? 'Undone' : undoing ? 'Undoing…' : receipt.state === 'answered' ? 'Previous saved changes'
    : receipt.state === 'saved' && changes ? `Saved ${changes}` : STATE_LABEL[receipt.state]
  const showSummary = receipt.summary && ![label, STATE_LABEL[receipt.state], 'Undone', 'Undoing…'].includes(receipt.summary)
  return <div className={`canvas-chat-result is-${receipt.state}`} role="status">
    <p className="canvas-chat-result-title">{receipt.state === 'saved' && !undone && <Check size={16} aria-hidden="true" />}{label}</p>
    {undone ? <p>Those changes have been undone.</p> : showSummary ? <p>{receipt.summary}</p> : !changes && receipt.state !== 'answered' && <p>{receipt.request}</p>}
    {receipt.requestId && ['failed', 'partial', 'unverified'].includes(receipt.state) && <p className="canvas-receipt-summary">Ref {receipt.requestId.slice(0, 8)}</p>}
    <div className="canvas-chat-result-actions">
      {receipt.undoable && <button type="button" className="canvas-link" onClick={onUndo} disabled={busy}><Undo2 size={14} aria-hidden="true" />{changes ? `Undo ${changes === '1 change' ? 'this change' : `these ${changes}`}` : 'Undo last saved changes'}</button>}
      {receipt.canRetry && <button type="button" className="canvas-link" onClick={onRetry} disabled={busy}>Try again</button>}
    </div>
  </div>
}
