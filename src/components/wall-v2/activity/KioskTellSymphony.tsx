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

import { useState } from 'react'
import { Mic, MicOff, Undo2, X } from 'lucide-react'
import { KIOSK_PHRASES, type KioskCommand } from '@/lib/wall/activity/kioskCommands'
import { useTellSymphony, type TellSymphony, type WallVoice } from './useTellSymphony'

export type { WallVoice, WallCapture } from './useTellSymphony'

export interface KioskTellSymphonyProps {
  /** Runs a command; returns what happened in a few words (or a reason it
   *  couldn't run). The same function the on-screen buttons use. */
  onCommand: (c: KioskCommand) => string
  voice?: WallVoice
}

export function KioskTellSymphony({ onCommand, voice }: KioskTellSymphonyProps) {
  return <TellSymphonyPill tell={useTellSymphony(onCommand, voice)} />
}

/** The slice-7 pill and its commands panel, over a shared useTellSymphony. */
export function TellSymphonyPill({ tell: t }: { tell: TellSymphony }) {
  const [typed, setTyped] = useState('')
  const { open, setOpen, feedback, heard, answer, undo, voiceOn, supported, listening, listener, live, isListening, isThinking, micLive, stateLabel } = t
  const { handle, runPhrase, stopListening, listenInBrowser, toggleVoice, takeBack, onPill } = t

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
