// "Tell Symphony" — the kiosk's command entry (conversational canvas, slice 7).
//
// Always: a panel of phrase buttons and a typed line. With the wall listener
// running on the Pi (infra/wall-listener, 2026-10-13), the wall also hears
// "Hey Symphony" / "Hey Sym" or a tap on this pill: what was said is a
// kitchen command, a capture (groceries, the scratchpad, the Inbox — each
// with Undo), or a question answered from what the wall shows, spoken back
// in a short sentence. A mic button beside the pill turns the microphone off
// and shows when it is live; overnight it is off by itself (a tap still
// works). Everyone may talk to it, kids included (Scott, 2026-10-13).
//
// Without the listener, speech falls back to the browser's recognition
// behind the old opt-in (the wall mic was switched off on 2026-05-25 because
// the kids played with it); buttons and typing work either way.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Undo2, X } from 'lucide-react'
import {
  describeKioskCommand, KIOSK_PHRASES, readVoiceOptIn, writeVoiceOptIn, type KioskCommand,
} from '@/lib/wall/activity/kioskCommands'
import { readUtterance, type WallUtterance } from '@/lib/wall/voice/wallUtterance'
import { useWallListener, type Heard } from '@/lib/wall/voice/useWallListener'
import { askWall, speechFor, type VoiceSave } from '@/lib/wall/voice/wallVoiceActions'

interface RecognitionResultLike { 0: { transcript: string }; length: number; [i: number]: { transcript: string } }
interface RecognitionEventLike { results: { 0: RecognitionResultLike; length: number } }
interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const safeStorage = (): Storage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export type WallCapture = Extract<WallUtterance, { kind: 'groceries' | 'talk' | 'note' | 'inbox' }>

/** What the wall can save and what it knows, for sentences said to it. */
export interface WallVoice {
  save: (c: WallCapture) => Promise<VoiceSave>
  /** What the wall shows right now, as plain lines (wallSnapshot). */
  snapshot: () => string
}

export interface KioskTellSymphonyProps {
  /** Runs a command; returns what happened in a few words (or a reason it
   *  couldn't run). The same function the on-screen buttons use. */
  onCommand: (c: KioskCommand) => string
  voice?: WallVoice
}

const UNDO_MS = 10_000

export function KioskTellSymphony({ onCommand, voice }: KioskTellSymphonyProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [undo, setUndo] = useState<(() => Promise<boolean>) | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => readVoiceOptIn(safeStorage()))
  const [listening, setListening] = useState(false)
  const supported = recognitionCtor() !== null
  const rec = useRef<RecognitionLike | null>(null)
  const replyRef = useRef<(text: string) => void>(() => {})

  /** A question, or anything not otherwise understood: ask the wall. An answer is
   *  shown; a change it can't make yet is kept in the Inbox with Undo. */
  const askAbout = useCallback(async (text: string): Promise<string> => {
    if (!voice) return 'I can’t answer questions on this screen.'
    setBusy(true)
    const asked = await askWall(text, voice.snapshot()).catch(() => ({ answer: 'Sorry, I couldn’t answer that just now.' }))
    if ('change' in asked) {
      const r = await voice.save({ kind: 'inbox', text: asked.change }).finally(() => setBusy(false))
      if (r.undo) { const fn = r.undo; setUndo(() => fn) }
      return r.undo ? `I can’t change that from the wall yet. I saved it to your inbox: ${asked.change}` : r.said
    }
    setBusy(false)
    setAnswer(asked.answer)
    return asked.answer
  }, [voice])

  /** One sentence, typed or said, → what the wall does with it. */
  const handle = useCallback(async (text: string, spoken: boolean) => {
    const u = readUtterance(text)
    setHeard(text.trim() || null)
    setAnswer(null)
    setUndo(null)
    setOpen(false)
    let said: string
    let speak: string | null = null
    switch (u.kind) {
      case 'command':
        said = onCommand(u.command) || describeKioskCommand(u.command)
        break
      case 'groceries': case 'talk': case 'note': case 'inbox': {
        if (!voice) { said = 'Saving isn’t set up on this screen.'; break }
        setBusy(true)
        const r = await voice.save(u).finally(() => setBusy(false))
        said = r.said
        if (r.undo) { const fn = r.undo; setUndo(() => fn) }
        break
      }
      case 'question':
        said = await askAbout(u.text)
        break
      default:
        // An imperative ("change dinner to Wednesday") isn't question-shaped but
        // still deserves an answer or an Inbox note; only empty text is a miss.
        if (u.kind === 'unknown' && u.text.trim()) { said = await askAbout(u.text); break }
        said = u.text ? `Didn’t catch what to do with “${u.text}”. Try “add milk to the grocery list” or ask a question.` : 'Didn’t catch that.'
        speak = 'Sorry, I didn’t catch that.'
    }
    setFeedback(said)
    if (spoken) replyRef.current(speak ?? said)
  }, [onCommand, voice, askAbout])

  const onHeard = useCallback((h: Heard) => { void handle(h.text, true) }, [handle])
  const onNothing = useCallback((reason: string) => {
    setHeard(null); setAnswer(null); setUndo(null)
    setFeedback(reason === 'silence' ? 'Didn’t hear anything.' : 'Didn’t catch that.')
  }, [])
  const listener = useWallListener(onHeard, onNothing)
  const live = listener.connected

  // Say it back: a natural voice when the app can make one, else the Pi's own.
  useEffect(() => {
    replyRef.current = (text: string) => {
      if (!listener.connected) return
      void speechFor(text).then((wav) => (wav ? listener.play(wav) : listener.say(text)))
    }
  }, [listener])

  const runPhrase = useCallback((c: KioskCommand) => {
    setHeard(null); setAnswer(null); setUndo(null)
    setFeedback(onCommand(c) || describeKioskCommand(c))
    setOpen(false)
  }, [onCommand])

  const stopListening = useCallback(() => {
    rec.current?.abort()
    rec.current = null
    setListening(false)
  }, [])
  useEffect(() => () => { rec.current?.abort() }, [])
  // The answer under the bar fades; longer while Undo or an answer is up.
  useEffect(() => {
    if (open || !feedback || busy) return
    const id = setTimeout(() => { setFeedback(null); setHeard(null); setAnswer(null); setUndo(null) }, undo ? UNDO_MS : answer ? 15_000 : 6000)
    return () => clearTimeout(id)
  }, [open, feedback, busy, undo, answer])

  // Browser recognition, only when there is no wall listener.
  const listenInBrowser = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || !voiceOn) return
    rec.current?.abort()
    const r = new Ctor()
    r.lang = 'en-US'
    r.interimResults = false
    r.continuous = false
    r.maxAlternatives = 3
    r.onresult = (e) => {
      const alts: string[] = []
      const first = e.results[0]
      for (let i = 0; i < (first?.length ?? 0); i++) alts.push(first[i].transcript)
      const hit = alts.find((a) => readUtterance(a).kind !== 'unknown')
      void handle(hit ?? alts[0] ?? '', false)
    }
    r.onerror = (e) => { setFeedback(e.error === 'not-allowed' ? 'The microphone is blocked on this device.' : 'Didn’t catch that — try again or tap a button.') }
    r.onend = () => { setListening(false); rec.current = null }
    rec.current = r
    setFeedback(null)
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }, [voiceOn, handle])

  const toggleVoice = () => {
    const next = !voiceOn
    writeVoiceOptIn(safeStorage(), next)
    setVoiceOn(next)
    if (!next) stopListening()
  }

  const takeBack = async () => {
    const fn = undo
    setUndo(null)
    if (!fn) return
    setFeedback((await fn()) ? 'Undone.' : 'Couldn’t undo — remove it from the list.')
    setAnswer(null)
  }

  const isListening = live ? listener.state === 'listening' : listening
  const isThinking = busy || (live && listener.state === 'thinking')
  const micLive = live && !listener.muted && !listener.quiet && listener.state !== 'speaking'

  const stateLabel = live
    ? listener.muted ? 'Microphone off · tap for commands'
      : listener.quiet ? 'Quiet hours · tap to talk'
        : listener.wake ? `Say “${listener.wake}” or tap` : 'Tap to talk'
    : voiceOn && supported ? 'Voice on · tap to talk' : 'Voice off · tap for commands'

  const onPill = () => {
    if (live) {
      if (isListening) { listener.cancel(); return }
      if (listener.muted || open) { setOpen((o) => !o); return }
      setFeedback(null); setAnswer(null); setUndo(null)
      listener.listen()
      return
    }
    if (listening) { stopListening(); return }
    if (voiceOn && supported && !open) { setOpen(true); listenInBrowser(); return }
    setOpen((o) => !o)
  }

  return (
    <>
      {/* The board's pill: always in the middle of the bar; the listening
          state turns the whole pill dark. The last answer shows in it for a
          few seconds ("Heard: …"). */}
      <button
        type="button"
        className={`kc-voice ${isListening ? 'is-listening' : ''}`}
        aria-pressed={open || isListening}
        aria-label={`Tell Symphony — ${isListening ? 'Listening' : isThinking ? 'Thinking' : stateLabel}`}
        onClick={onPill}
      >
        <span className="kc-voice-m" aria-hidden="true">{(live ? !listener.muted : voiceOn && supported) ? <Mic /> : <MicOff />}</span>
        <span className="kc-voice-t">
          {isListening
            ? <><i>{live ? 'Go ahead · tap to stop' : 'Say a command · tap to stop'}</i><b>Listening…</b></>
            : isThinking
              ? <><i>{heard ? `Heard: “${heard}”` : 'One moment'}</i><b>Thinking…</b></>
              : !open && feedback
                ? <><i>{heard ? `Heard: “${heard}”` : 'Done'}</i><b>{feedback}</b></>
                : <><i>{stateLabel}</i><b>Tell Symphony</b></>}
        </span>
      </button>
      {live && undo && !open && (
        <button type="button" className="kc-btn kc-voice-undo" onClick={() => void takeBack()}><Undo2 aria-hidden="true" /> Undo</button>
      )}
      {live && (
        // Always visible while the listener runs: off, and whether it is live.
        <button type="button" className={`kc-tool kc-mic ${micLive ? 'is-live' : ''}`} aria-pressed={listener.muted}
          aria-label={listener.muted ? 'Turn the microphone on' : 'Turn the microphone off'}
          onClick={() => listener.mute(!listener.muted)}>
          {listener.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
          <small>{listener.muted ? 'Mic off' : listener.quiet ? 'Quiet' : 'Mic on'}</small>
          <span className="kc-mic-dot" aria-hidden="true" />
        </button>
      )}
      {answer && !open && !isListening && (
        <div className="kc-answer" role="status">
          {heard && <small>{heard}</small>}
          <p>{answer}</p>
        </div>
      )}

      {open && (
        <div className="kc-tell-panel" role="dialog" aria-label="Tell Symphony">
          <div className="kc-tell-head">
            <h2>Tell Symphony</h2>
            <button type="button" className="kc-btn kc-icon-btn" aria-label="Close commands" onClick={() => { stopListening(); setOpen(false) }}><X /></button>
          </div>
          {listening && (
            <div className="kc-listening" role="status" aria-live="assertive">
              <span className="kc-listening-dot" aria-hidden="true" />
              <strong>Listening…</strong> say a command, like “next step” or “timer 5 minutes”.
              <button type="button" className="kc-btn" onClick={stopListening}>Stop listening</button>
            </div>
          )}
          {feedback && <p className="kc-tell-feedback" role="status">{feedback}</p>}
          <div className="kc-phrases">
            {KIOSK_PHRASES.map((p) => (
              <button key={p.label} type="button" className="kc-btn" onClick={() => runPhrase(p.command)}>{p.label}</button>
            ))}
          </div>
          <form className="kc-tell-type" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void handle(typed, false); setTyped('') } }}>
            <label className="sr-only" htmlFor="kc-tell-input">Type a command</label>
            <input id="kc-tell-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type: add milk to the grocery list" autoComplete="off" />
            <button type="submit" className="kc-btn is-accent">Do it</button>
          </form>
          <div className="kc-voice-row">
            {live ? (
              <>
                <button type="button" role="switch" aria-checked={!listener.muted} className={`kc-btn ${!listener.muted ? 'is-on' : ''}`} onClick={() => listener.mute(!listener.muted)}>
                  {listener.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />} Microphone: {listener.muted ? 'Off' : 'On'}
                </button>
                <small>{listener.wake ? `Say “${listener.wake}” or “Hey Sym”, or tap the bar. ` : ''}Off overnight by itself. Only what’s said after the name or a tap leaves the wall’s own computer.</small>
              </>
            ) : (
              <>
                <button type="button" role="switch" aria-checked={voiceOn} className={`kc-btn ${voiceOn ? 'is-on' : ''}`} onClick={toggleVoice} disabled={!supported}>
                  {voiceOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />} Voice commands: {voiceOn ? 'On' : 'Off'}
                </button>
                {voiceOn && supported && !listening && <button type="button" className="kc-btn is-primary" onClick={listenInBrowser}><Mic aria-hidden="true" /> Talk</button>}
                <small>{supported
                  ? 'Off by default. Voice is new on this wall and hasn’t been tested in the room yet.'
                  : 'This browser has no speech recognition — buttons and typing still work.'}</small>
              </>
            )}
          </div>
        </div>
      )}
      <span className="sr-only" role="status">{!open && feedback ? feedback : ''}</span>
    </>
  )
}
