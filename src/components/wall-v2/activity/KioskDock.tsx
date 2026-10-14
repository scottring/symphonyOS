// Kitchen wall v2 (Scott approved the mockup 2026-10-14): the conversation
// dock is the wall's only bottom bar.
//
//   [Home][Back][More][held] · ( the strip ) · NEXT
//
// Home shows only away from Home (an activity, an answer, More, plan the
// week); on the home moments the bar is More · mic · Next.
//
// The adaptive strip (Scott, 2026-10-14, "calmer screens"): when there is
// nothing to say, the centre is one round mic (teal, a soft tint ring; an
// outlined mic with a slash in quiet hours or muted). A tap opens the strip
// listening AND with a text field focused, so you can talk or type; "Hey
// Symphony" opens it too. It stays open while it has something to say —
// listening or typing, thinking, Symphony speaking or a reply showing, a
// change card waiting, the conversation going on — and where hands are busy
// (cooking, out the door), and collapses back to the mic otherwise. No
// suggestion chips. Symphony's reply shows in a band above the dock — glass,
// full stage width, large type, never cut short — and fades as before.
//
// More is not a sheet: it takes the stage's side column (KioskMorePanel).
// Presentation only: what a sentence does lives in useTellSymphony.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Home, LayoutGrid, Mic, MicOff, Square, Undo2, ArrowLeft, Send, Calculator } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DockCopy } from '@/lib/wall/activity/dockCopy'
import { TALK_IDLE_MS } from '@/lib/wall/wallTalk'
import type { TellSymphony } from './useTellSymphony'

export interface KioskDockProps {
  tell: TellSymphony
  copy: DockCopy
  /** The strip's text field is open (a tap on the mic). */
  typing: boolean
  setTyping: (on: boolean) => void
  /** Away from Home only; without it the bar has no Home button. */
  onHome?: () => void
  onBack?: () => void
  moreOpen: boolean
  onMore: () => void
  /** Held activities (cooking, timers) as chips beside the nav. */
  held?: ReactNode
  next: { time: string; title: string } | null
  /** The conversation has the side column: no reply band (stage 3). */
  replyInSide?: boolean
  /** Math of the day, one tap from any screen; the dot means a kid's problem is still open. */
  math?: { onOpen: () => void; open: boolean; current: boolean }
}

function NavButton({ icon: Icon, label, onClick, current, dot, aria }: { icon: LucideIcon; label: string; onClick: () => void; current?: boolean; dot?: boolean; aria?: string }) {
  return (
    <button type="button" className={`kw-navb ${current ? 'is-current' : ''}`} onClick={onClick} aria-pressed={current === undefined ? undefined : current} aria-label={aria}>
      <Icon aria-hidden="true" /><span>{label}</span>
      {dot && <i className="kw-navb-dot" aria-hidden="true" />}
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
  const conv = t.talk
  const { setTyping } = p

  // The text field is open after a tap, and whenever the wall is listening.
  const entry = p.typing || t.isListening
  useEffect(() => { if (entry) input.current?.focus() }, [entry])

  // Spoken, not typed: when listening ends with nothing typed, the field
  // closes and the strip moves on to thinking and the reply.
  const wasListening = useRef(false)
  useEffect(() => {
    if (wasListening.current && !t.isListening && !typed.trim()) setTyping(false)
    wasListening.current = t.isListening
  }, [t.isListening, typed, setTyping])

  // An open field left empty folds back after the conversation's idle time.
  useEffect(() => {
    if (!p.typing || t.isListening || typed.trim()) return
    const id = setTimeout(() => setTyping(false), TALK_IDLE_MS)
    return () => clearTimeout(id)
  }, [p.typing, t.isListening, typed, setTyping])

  const canListen = t.live ? !l.muted : t.voiceOn && t.supported
  const listen = () => {
    t.clearReply()
    if (t.live) l.listen()
    else t.listenInBrowser()
  }
  /** Typing instead: drop what was being heard. */
  const stopListening = () => { if (t.live) l.cancel(); else t.stopListening() }
  /** A tap while listening: done — send what was said (never throw it away). */
  const finishListening = () => { if (t.live) l.finish(); else t.finishListening() }

  /** A tap on the mic: open the strip listening, with the field focused. */
  const openStrip = () => {
    if (t.isListening) { finishListening(); return }
    setTyping(true)
    if (canListen) listen()
    else t.clearReply()
  }
  /** The mic inside the open field: stop, or listen again. */
  const fieldMic = () => {
    if (t.isListening) { finishListening(); return }
    if (canListen) listen()
    input.current?.focus()
  }

  const lastSaid = [...conv.turns].reverse().find((x) => x.who === 'symphony')?.text ?? t.answer ?? t.feedback ?? ''
  let hint: string, line: string
  if (t.isThinking) { hint = t.heard ? `Heard “${t.heard}”` : 'One moment'; line = 'Thinking…' }
  else if (t.isSpeaking) { hint = 'Symphony is speaking · tap to talk'; line = lastSaid.length > 60 ? `“${lastSaid.slice(0, 58).trimEnd()}…”` : lastSaid ? `“${lastSaid}”` : 'Speaking…' }
  else if (conv.card && !off) { hint = t.live ? `Say “${wake}”, or tap` : 'Tap to talk or type'; line = 'Say “approve”, or say what to change' }
  else if (conv.planning && !off) { hint = t.live ? `Say “${wake}”, or tap · either of you can answer` : 'Tap to talk or type'; line = 'Answer, or say “approve” when ready' }
  else if (quiet) { hint = `Not listening for “${wake}”`; line = 'Quiet hours · tap to talk' }
  else if (muted) { hint = 'The microphone is off'; line = 'Tap to type, or turn it on in More' }
  else if (t.live) { hint = `Say “${wake}”, or tap${p.copy.tapWhat}`; line = p.copy.line }
  else if (t.voiceOn && t.supported) { hint = `Tap to talk${p.copy.tapWhat ? `, or tap${p.copy.tapWhat}` : ''}`; line = p.copy.line }
  else { hint = 'Tap to type'; line = p.copy.line }

  const reply = t.answer ?? t.feedback
  const showReply = !!reply && !entry && !p.replyInSide
  // After Approve, Undo rides the band when the conversation has no side column.
  const saved = !p.replyInSide ? conv.saved : null
  const open = entry || t.isThinking || t.isSpeaking || !!reply || !!conv.saved || conv.active || p.copy.open
  const fieldHint = t.isListening
    ? (conv.card ? 'Listening · say “approve”, or what to change' : 'Listening — or type')
    : canListen ? 'Type, or tap the mic to talk' : 'Type to Symphony'

  let strip: ReactNode
  if (!open) {
    strip = (
      <button type="button" className={`kw-mic is-solo ${off ? 'is-off' : ''}`} onClick={openStrip}
        aria-label={`Talk to Symphony — ${quiet ? 'quiet hours, tap to talk or type' : muted ? 'the microphone is off, tap to type' : 'tap to talk or type'}`}>
        {off ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>
    )
  } else if (entry) {
    strip = (
      <form className="kw-strip-in" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void t.handle(typed, false); setTyped(''); setTyping(false) } }}>
        <button type="button" className={`kw-mic ${t.isListening ? '' : canListen ? '' : 'is-off'}`} onClick={fieldMic}
          aria-label={t.isListening ? 'Stop listening' : canListen ? 'Talk to Symphony — tap to listen' : 'Talk to Symphony — type below'}>
          {t.isListening ? <Square aria-hidden="true" /> : canListen ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        </button>
        {t.isListening && <Bars />}
        <span className="kw-say">
          <span className="kw-hint" aria-hidden="true">{fieldHint}</span>
          <input ref={input} value={typed} aria-label="Type to Symphony" autoComplete="off"
            placeholder={conv.card ? 'Say “approve”, or say what to change' : 'What’s for dinner tomorrow?'}
            onChange={(e) => { setTyped(e.target.value); if (e.target.value.trim() && t.isListening) stopListening() }} />
        </span>
        <button type="submit" className="kw-chip is-send" aria-label="Send"><Send aria-hidden="true" />Send</button>
      </form>
    )
  } else {
    strip = (
      <button type="button" className="kw-talk-main" onClick={openStrip} aria-label={`Talk to Symphony — ${hint}`}>
        <span className={`kw-mic ${off ? 'is-off' : ''}`} aria-hidden="true">{off ? <MicOff /> : <Mic />}</span>
        {t.isSpeaking && <Bars />}
        <span className="kw-say"><span className="kw-hint">{hint}</span><span className="kw-line">{line}</span></span>
      </button>
    )
  }

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
      {!showReply && saved && !entry && (
        <section className="kw-reply" role="status" aria-label="Symphony says">
          <div className="kw-reply-body"><p className="kw-reply-text is-mid">Saved · {saved.title}</p></div>
          <button type="button" className="kw-btn kw-undo" onClick={() => void t.undoCard()}><Undo2 aria-hidden="true" />Undo</button>
        </section>
      )}
      <footer className={`kw-dock ${open ? '' : 'is-calm'}`} aria-label="Kiosk">
        <nav className="kw-nav" aria-label="Wall">
          {p.onHome && <NavButton icon={Home} label="Home" onClick={p.onHome} />}
          {p.onBack && <NavButton icon={ArrowLeft} label="Back" onClick={p.onBack} />}
          <NavButton icon={LayoutGrid} label="More" onClick={p.onMore} current={p.moreOpen} />
          {p.math && (
            <NavButton icon={Calculator} label="Math" onClick={p.math.onOpen} current={p.math.current} dot={p.math.open}
              aria={`Math of the day${p.math.open ? ' · still to solve' : ''}`} />
          )}
          {p.held}
        </nav>
        <div className={`kw-talk ${open ? 'is-open' : 'is-collapsed'} ${entry ? 'is-typing' : ''} ${t.isListening || t.isSpeaking ? 'is-live' : ''} ${off && !entry ? 'is-quiet' : ''}`}
          data-strip={open ? 'open' : 'collapsed'}>
          <div className="kw-strip-body" key={!open ? 'mic' : entry ? 'field' : 'hint'}>{strip}</div>
        </div>
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
