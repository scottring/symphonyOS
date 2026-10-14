// Kitchen wall v2 (Scott approved the mockup 2026-10-14): the conversation
// dock is the wall's only bottom bar.
//
//   [Home][More] · ( mic · hint + an example · one suggestion ) · NEXT
//
// The suggestion chip sends its words exactly as if they were said. The
// pill shows the ears' state: idle (teal mic), listening (a teal ring and
// level bars), quiet hours or muted (an outlined mic with a slash). Typing
// is reached from More → Type instead, and opens a field in the pill.
// Symphony's reply shows in a band above the dock — glass, full stage width,
// large type, never cut short — and fades like the old feedback did.
//
// More is not a sheet: it takes the stage's side column (KioskMorePanel).
// Presentation only: what a sentence does lives in useTellSymphony.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Home, LayoutGrid, Mic, MicOff, Keyboard, Square, Undo2, X, ArrowLeft, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DockCopy } from '@/lib/wall/activity/dockCopy'
import type { TellSymphony } from './useTellSymphony'

export interface KioskDockProps {
  tell: TellSymphony
  copy: DockCopy
  typing: boolean
  setTyping: (on: boolean) => void
  onHome: () => void
  onBack?: () => void
  moreOpen: boolean
  onMore: () => void
  /** Held activities (cooking, timers) as chips beside the nav. */
  held?: ReactNode
  next: { time: string; title: string } | null
  /** The conversation has the side column: no reply band (stage 3). */
  replyInSide?: boolean
}

function NavButton({ icon: Icon, label, onClick, current }: { icon: LucideIcon; label: string; onClick: () => void; current?: boolean }) {
  return (
    <button type="button" className={`kw-navb ${current ? 'is-current' : ''}`} onClick={onClick} aria-pressed={current === undefined ? undefined : current}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </button>
  )
}

/** Level bars while the wall listens (decorative; the listener sends no levels). */
function Bars() {
  return <span className="kw-bars" aria-hidden="true">{[16, 34, 22, 44, 28, 14].map((h, i) => <i key={i} style={{ height: `calc(${h} * var(--p))`, animationDelay: `${i * 90}ms` }} />)}</span>
}

export function KioskDock(p: KioskDockProps) {
  const t = p.tell
  const l = t.listener
  const wake = l.wake ?? 'Hey Symphony'
  const quiet = t.live && l.quiet && !t.isListening
  const muted = t.live && l.muted
  const off = quiet || muted
  const [typed, setTyped] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (p.typing) input.current?.focus() }, [p.typing])

  // What a tap on the pill does: listen, or (when the wall can't hear) type.
  const talk = () => {
    if (t.live) {
      if (t.isListening) { l.cancel(); return }
      if (l.muted) { p.setTyping(true); return }
      t.clearReply()
      l.listen()
      return
    }
    if (t.listening) { t.stopListening(); return }
    if (t.voiceOn && t.supported) { t.clearReply(); t.listenInBrowser(); return }
    p.setTyping(true)
  }

  const conv = t.talk
  const lastSaid = [...conv.turns].reverse().find((x) => x.who === 'symphony')?.text ?? t.answer ?? t.feedback ?? ''
  let hint: string, line: string
  if (t.isListening) { hint = 'Listening · tap to stop'; line = conv.card ? 'Say “approve”, or say what to change' : 'Go ahead…' }
  else if (t.isThinking) { hint = t.heard ? `Heard “${t.heard}”` : 'One moment'; line = 'Thinking…' }
  else if (t.isSpeaking) { hint = 'Symphony is speaking · tap to talk'; line = lastSaid.length > 60 ? `“${lastSaid.slice(0, 58).trimEnd()}…”` : lastSaid ? `“${lastSaid}”` : 'Speaking…' }
  else if (conv.card && !off) { hint = t.live ? `Say “${wake}”, or tap` : 'Tap to talk'; line = 'Say “approve”, or say what to change' }
  else if (conv.planning && !off) { hint = t.live ? `Say “${wake}”, or tap · either of you can answer` : 'Tap to talk'; line = 'Answer, or say “approve” when ready' }
  else if (quiet) { hint = `Not listening for “${wake}”`; line = 'Quiet hours · tap to talk' }
  else if (muted) { hint = 'The microphone is off'; line = 'Tap to type, or turn it on in More' }
  else if (t.live) { hint = `Say “${wake}”, or tap${p.copy.tapWhat}`; line = p.copy.line }
  else if (t.voiceOn && t.supported) { hint = `Tap to talk${p.copy.tapWhat ? `, or tap${p.copy.tapWhat}` : ''}`; line = p.copy.line }
  else { hint = 'Tap to type'; line = p.copy.line }
  const MicIcon = t.isListening ? Square : off ? MicOff : !t.live && !(t.voiceOn && t.supported) ? Keyboard : Mic
  const reply = t.answer ?? t.feedback
  const showReply = !!reply && !t.isListening && !p.typing && !p.replyInSide
  // After Approve, Undo rides the band when the conversation has no side column.
  const saved = !p.replyInSide ? conv.saved : null

  return (
    <>
      {showReply && (
        <section className="kw-reply" role="status" aria-label="Symphony says">
          <div className="kw-reply-body">
            {t.heard && <p className="kw-reply-heard">You said “{t.heard}”</p>}
            <p className={`kw-reply-text ${reply.length > 320 ? 'is-long' : reply.length > 160 ? 'is-mid' : ''}`}>{reply}</p>
          </div>
          {t.undo && <button type="button" className="kw-btn" onClick={() => void t.takeBack()}><Undo2 aria-hidden="true" />Undo</button>}
          {saved && <button type="button" className="kw-btn kw-undo" onClick={() => void t.undoCard()}><Undo2 aria-hidden="true" />Undo</button>}
        </section>
      )}
      {!showReply && saved && !t.isListening && !p.typing && (
        <section className="kw-reply" role="status" aria-label="Symphony says">
          <div className="kw-reply-body"><p className="kw-reply-text is-mid">Saved · {saved.title}</p></div>
          <button type="button" className="kw-btn kw-undo" onClick={() => void t.undoCard()}><Undo2 aria-hidden="true" />Undo</button>
        </section>
      )}
      <footer className="kw-dock" aria-label="Kiosk">
        <nav className="kw-nav" aria-label="Wall">
          <NavButton icon={Home} label="Home" onClick={p.onHome} />
          {p.onBack && <NavButton icon={ArrowLeft} label="Back" onClick={p.onBack} />}
          <NavButton icon={LayoutGrid} label="More" onClick={p.onMore} current={p.moreOpen} />
          {p.held}
        </nav>
        {p.typing ? (
          <form className="kw-talk is-typing" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void t.handle(typed, false); setTyped(''); p.setTyping(false) } }}>
            <span className="kw-mic is-off" aria-hidden="true"><Keyboard /></span>
            <label className="sr-only" htmlFor="kw-type">Type to Symphony</label>
            <input id="kw-type" ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to Symphony: add milk to the grocery list" autoComplete="off" />
            <button type="submit" className="kw-chip is-send" aria-label="Send"><Send aria-hidden="true" />Send</button>
            <button type="button" className="kw-close" aria-label="Stop typing" onClick={() => { setTyped(''); p.setTyping(false) }}><X aria-hidden="true" /></button>
          </form>
        ) : (
          <div className={`kw-talk ${t.isListening || t.isSpeaking ? 'is-live' : ''} ${off ? 'is-quiet' : ''}`}>
            <button type="button" className="kw-talk-main" onClick={talk} aria-label={`Talk to Symphony — ${hint}`}>
              <span className={`kw-mic ${off ? 'is-off' : ''}`} aria-hidden="true"><MicIcon /></span>
              {(t.isListening || t.isSpeaking) && <Bars />}
              <span className="kw-say"><span className="kw-hint">{hint}</span><span className="kw-line">{line}</span></span>
            </button>
            {p.copy.chip && !off && !t.isListening && !t.isThinking && !conv.active && (
              <button type="button" className="kw-chip" onClick={() => void t.handle(p.copy.chip!, true)}>{p.copy.chip}</button>
            )}
          </div>
        )}
        <div className="kw-next" aria-label="Next">
          <span className="kw-eyebrow">Next</span>
          {p.next ? <b>{p.next.time} · {p.next.title}</b> : <b className="is-quiet">Nothing else today</b>}
        </div>
      </footer>
    </>
  )
}

export interface MoreTile { id: string; label: string; sub?: string; icon: LucideIcon; onSelect: () => void }

/** More, in place: the side column's 2×4 tiles (More.dc.html). */
export function KioskMorePanel({ tiles, onDone }: { tiles: MoreTile[]; onDone: () => void }) {
  return (
    <section className="kw-more" aria-label="More">
      <div className="kw-more-head">
        <h2>More</h2>
        <button type="button" className="kw-btn is-quiet" onClick={onDone}>Done</button>
      </div>
      <div className={`kw-tiles ${tiles.length > 8 ? 'is-tight' : ''}`}>
        {tiles.map(({ id, label, sub, icon: Icon, onSelect }) => (
          <button key={id} type="button" className="kw-tile" onClick={onSelect}>
            <Icon aria-hidden="true" /><span><b>{label}</b>{sub && <small>{sub}</small>}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
