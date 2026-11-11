// src/shell/TellSymphonyBar.tsx
//
// One bar at the foot of the page for talking to Symphony and adding things
// (Scott, 2026-11-11, boards D/E of the Today look-and-feel canvas). It
// replaces the "Chat with Symphony" pill and the round + on desktop: type
// and press Enter to tell Symphony (the Chat card opens with your words), +
// opens the quick-add box (⌘K), the mic talks. While the Chat card is open
// its own composer is the bar, so this one steps aside.

import { useId, useState, type FormEvent } from 'react'
import { ArrowRight, Mic, Plus, Sparkles } from 'lucide-react'
import { DictationMicButton } from '@/components/common/DictationMicButton'

interface Props {
  /** Send what was typed to Symphony (opens the Chat card). */
  onSend: (text: string) => void
  /** Open the quick-add box. */
  onAdd: () => void
  /** Start a voice conversation, when voice is on; otherwise the mic dictates. */
  onTalk?: () => void
  /** Width of the side card, so the bar centres on the page beside it. */
  right?: number
  busy?: boolean
}

export function TellSymphonyBar({ onSend, onAdd, onTalk, right = 0, busy = false }: Props) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    onSend(text)
    setDraft('')
  }
  return (
    <div className="tell-bar-dock" style={{ right }}>
      <form className="tell-bar" onSubmit={submit} aria-label="Tell Symphony">
        <button type="button" className="tell-bar-icon tell-bar-add" onClick={onAdd} aria-label="Add something" title="Add a task, event or note (⌘K)">
          <Plus size={18} aria-hidden="true" />
        </button>
        <Sparkles className="tell-bar-mark" size={17} aria-hidden="true" />
        <label htmlFor={inputId} className="sr-only">Tell Symphony what changed</label>
        <input
          id={inputId}
          className="tell-bar-field"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tell Symphony what changed, or ask…"
          autoComplete="off"
        />
        {onTalk
          ? <button type="button" className="tell-bar-icon" onClick={onTalk} aria-label="Talk with Symphony" title="Talk with Symphony"><Mic size={18} aria-hidden="true" /></button>
          : <DictationMicButton className="tell-bar-icon" title="Dictate" onTranscript={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />}
        <button type="submit" className="tell-bar-send" disabled={!draft.trim() || busy} aria-label="Send to Symphony">
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
