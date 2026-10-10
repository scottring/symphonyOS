// src/components/canvas/ConversationStrip.tsx
//
// The conversation's place in the frame: one docked line under Today, Week
// and Plan. The composer (text + mic) is always there; the latest receipt sits
// above it with its save state, what changed (each change opens its item),
// and Undo or Retry. The full transcript stays in the existing AI pane.

import { useCallback, useState, type FormEvent } from 'react'
import { Mic, MicOff, Send, Undo2, RotateCcw, X, MessageSquare } from 'lucide-react'
import { useCanvasActivity, type CanvasReceipt } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { DictationMicButton } from '@/components/common/DictationMicButton'

export interface StripVoice {
  /** Live two-way voice is available to this account. */
  available: boolean
  active: boolean
  status: string
  start: () => void
  stop: () => void
}

interface Props {
  onSend: (text: string) => void
  busy: boolean
  voice: StripVoice
  onOpenConversation: () => void
  /** Where proposals are reviewed; shown when there are some. */
  onReviewProposals?: () => void
  placeholder?: string
  compact?: boolean
  /** Phone: the capture bar and the conversation overlay own typing, so the
   *  strip shows only the latest receipt and suggestions, and only when there are some. */
  receiptOnly?: boolean
}

const STATE_LABEL: Record<CanvasReceipt['state'], string> = {
  listening: 'Listening', working: 'Working', saving: 'Saving', saved: 'Saved',
  partial: 'Partly saved', failed: "Didn't save", answered: '',
}

export function SaveStateBadge({ state }: { state: CanvasReceipt['state'] }) {
  const label = STATE_LABEL[state]
  if (!label) return null
  return <span className={`canvas-state is-${state}`} role="status">{label}</span>
}

export function ConversationStrip({ onSend, busy, voice, onOpenConversation, onReviewProposals, placeholder = 'Tell Symphony, or ask…', compact = false, receiptOnly = false }: Props) {
  const { receipt, undo, retry, dismiss, proposals } = useCanvasActivity()
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
  const shown = receipt && (receipt.state !== 'answered' || receipt.request)

  if (receiptOnly && !shown && pending === 0) return null

  return (
    <section className={`canvas-strip${compact ? ' is-compact' : ''}${voice.active ? ' is-listening' : ''}`} aria-label="Conversation with Symphony">
      {shown && receipt && (
        <div className="canvas-receipt" aria-live="polite">
          <SaveStateBadge state={receipt.state} />
          {receipt.request && <span className="canvas-receipt-request">{receipt.source === 'conversation' ? `“${receipt.request}”` : receipt.request}</span>}
          {receipt.summary && <span className="canvas-receipt-summary">{receipt.summary}</span>}
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
        <button type="button" className="canvas-link" onClick={onOpenConversation}><MessageSquare size={14} aria-hidden="true" /> Open the conversation</button>
      ) : (
      <form className="canvas-composer" onSubmit={submit}>
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
            <span>{voice.active ? (voice.status === 'connecting' ? 'Connecting…' : 'Listening') : 'Talk'}</span>
          </button>
        )}
        <button type="submit" className="canvas-send" disabled={!draft.trim() || busy} aria-label="Send">
          <Send size={15} aria-hidden="true" />
        </button>
        <button type="button" className="canvas-icon" onClick={onOpenConversation} aria-label="Open the conversation" title="Open the conversation">
          <MessageSquare size={16} aria-hidden="true" />
        </button>
      </form>
      )}
    </section>
  )
}
