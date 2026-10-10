// "Tell Symphony" — the kiosk's command entry (conversational canvas, slice 7).
//
// Always: a panel of phrase buttons and a typed line, each producing the
// same KioskCommand the on-screen controls run (parseKioskCommand). Speech
// is OFF by default: the wall mic was disabled on 2026-05-25 because the kids
// played with it. A grown-up can opt in here (stored on this device only);
// speech then uses the browser's built-in recognition (no API key; in Chrome
// the audio is processed by Google's service) and the bar shows an
// unmistakable Listening state.
//
// NOT VALIDATED IN THE ROOM. Distance, echo off the EMEET M0 Plus
// speakerphone, kids talking over each other and false triggers all need a
// real test on the Pi with that speakerphone before anyone relies on voice.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, X } from 'lucide-react'
import {
  parseKioskCommand, describeKioskCommand, KIOSK_PHRASES, readVoiceOptIn, writeVoiceOptIn, type KioskCommand,
} from '@/lib/wall/activity/kioskCommands'

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

export interface KioskTellSymphonyProps {
  /** Runs a command; returns what happened in a few words (or a reason it
   *  couldn't run). The same function the on-screen buttons use. */
  onCommand: (c: KioskCommand) => string
}

export function KioskTellSymphony({ onCommand }: KioskTellSymphonyProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [voiceOn, setVoiceOn] = useState(() => readVoiceOptIn(safeStorage()))
  const [listening, setListening] = useState(false)
  const supported = recognitionCtor() !== null
  const rec = useRef<RecognitionLike | null>(null)

  const run = useCallback((c: KioskCommand, from: string | null = null) => {
    setHeard(from)
    const said = onCommand(c)
    setFeedback(said || describeKioskCommand(c))
    setOpen(false)
  }, [onCommand])

  const runText = useCallback((text: string, heard: boolean) => {
    const c = parseKioskCommand(text)
    if (!c) { setFeedback(`${heard ? 'Heard' : 'Didn’t understand'} “${text.trim()}” — try a button below.`); setOpen(true); return }
    run(c, text.trim())
  }, [run])

  const stopListening = useCallback(() => {
    rec.current?.abort()
    rec.current = null
    setListening(false)
  }, [])
  useEffect(() => () => { rec.current?.abort() }, [])
  // The answer under the bar fades after a few seconds; inside the panel it stays.
  useEffect(() => {
    if (open || !feedback) return
    const id = setTimeout(() => { setFeedback(null); setHeard(null) }, 6000)
    return () => clearTimeout(id)
  }, [open, feedback])

  const listen = useCallback(() => {
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
      const hit = alts.find((a) => parseKioskCommand(a))
      runText(hit ?? alts[0] ?? '', true)
    }
    r.onerror = (e) => { setFeedback(e.error === 'not-allowed' ? 'The microphone is blocked on this device.' : 'Didn’t catch that — try again or tap a button.') }
    r.onend = () => { setListening(false); rec.current = null }
    rec.current = r
    setFeedback(null)
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }, [voiceOn, runText])

  const toggleVoice = () => {
    const next = !voiceOn
    writeVoiceOptIn(safeStorage(), next)
    setVoiceOn(next)
    if (!next) stopListening()
  }

  const stateLabel = listening ? 'Listening…' : voiceOn && supported ? 'Voice on · tap to talk' : 'Voice off · tap for commands'

  return (
    <>
      {/* The board's pill: always in the middle of the bar; the listening
          state turns the whole pill dark. The last answer shows in it for a
          few seconds ("Heard: …"). */}
      <button
        type="button"
        className={`kc-voice ${listening ? 'is-listening' : ''}`}
        aria-pressed={open || listening}
        aria-label={`Tell Symphony — ${stateLabel}`}
        onClick={() => {
          if (listening) { stopListening(); return }
          if (voiceOn && supported && !open) { setOpen(true); listen(); return }
          setOpen((o) => !o)
        }}
      >
        <span className="kc-voice-m" aria-hidden="true">{voiceOn && supported ? <Mic /> : <MicOff />}</span>
        <span className="kc-voice-t">
          {listening
            ? <><i>Say a command · tap to stop</i><b>Listening…</b></>
            : !open && feedback
              ? <><i>{heard ? `Heard: “${heard}”` : 'Done'}</i><b>{feedback}</b></>
              : <><i>{stateLabel}</i><b>Tell Symphony</b></>}
        </span>
      </button>

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
              <button key={p.label} type="button" className="kc-btn" onClick={() => run(p.command)}>{p.label}</button>
            ))}
          </div>
          <form className="kc-tell-type" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { runText(typed, false); setTyped('') } }}>
            <label className="sr-only" htmlFor="kc-tell-input">Type a command</label>
            <input id="kc-tell-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type: we have 6 people" autoComplete="off" />
            <button type="submit" className="kc-btn is-accent">Do it</button>
          </form>
          <div className="kc-voice-row">
            <button type="button" role="switch" aria-checked={voiceOn} className={`kc-btn ${voiceOn ? 'is-on' : ''}`} onClick={toggleVoice} disabled={!supported}>
              {voiceOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />} Voice commands: {voiceOn ? 'On' : 'Off'}
            </button>
            {voiceOn && supported && !listening && <button type="button" className="kc-btn is-primary" onClick={listen}><Mic aria-hidden="true" /> Talk</button>}
            <small>{supported
              ? 'Off by default. Voice is new on this wall and hasn’t been tested in the room yet.'
              : 'This browser has no speech recognition — buttons and typing still work.'}</small>
          </div>
        </div>
      )}
      <span className="sr-only" role="status">{!open && feedback ? feedback : ''}</span>
    </>
  )
}
