// What a sentence said or typed to the kitchen wall does, and the state of
// the wall's ears — shared by the slice-7 "Tell Symphony" pill and the v2
// conversation dock (Kitchen wall v2, 2026-10-14). One path for everything:
// speech from the Pi's listener, the browser's own recognition, typing, and
// the dock's suggestion chip all go through `handle`.
//
// With the wall listener running on the Pi (infra/wall-listener), the wall
// hears "Hey Symphony" / "Hey Sym" or a tap: what was said is a kitchen
// command, a capture (groceries, the scratchpad, the Inbox — each with Undo),
// or a question answered from what the wall shows, spoken back in a short
// sentence. Without the listener, speech falls back to the browser's
// recognition behind the old opt-in; typing works either way.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeKioskCommand, readVoiceOptIn, writeVoiceOptIn, type KioskCommand } from '@/lib/wall/activity/kioskCommands'
import { readUtterance, type WallUtterance } from '@/lib/wall/voice/wallUtterance'
import { useWallListener, type Heard, type WallListener } from '@/lib/wall/voice/useWallListener'
import { askWall, speechFor, type VoiceSave } from '@/lib/wall/voice/wallVoiceActions'
import { talkIntent } from '@/lib/wall/wallTalk'
import { useWallTalk, type WallTalkDeps } from './useWallTalk'

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
  /** The full Symphony agent (Kitchen wall v2, stage 3). Without it, anything
   *  not handled locally is answered by wall-ask, as before. */
  agent?: WallTalkDeps
}

/** Design previews only: the listener's state, held still (no microphone). */
export type ListenerPreview = 'idle' | 'listening' | 'quiet' | 'muted'

const UNDO_MS = 10_000

export function useTellSymphony(onCommand: (c: KioskCommand) => string, voice?: WallVoice, preview?: ListenerPreview) {
  const [open, setOpen] = useState(false)
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

  const talk = useWallTalk(voice?.agent)

  /** A turn with Symphony; if it fails or takes over ~20s, wall-ask answers
   *  instead and the wall says so. */
  const converse = useCallback(async (run: () => Promise<{ reply: string } | null>, fallback: string): Promise<string | null> => {
    setBusy(true)
    try {
      const r = await run()
      setBusy(false)
      if (!r) return null
      setAnswer(r.reply)
      return r.reply
    } catch (e) {
      setBusy(false)
      const slow = e instanceof Error && e.message === 'timeout'
      const quick = await askAbout(fallback)
      const said = `${slow ? 'Symphony is taking too long' : 'Symphony couldn’t answer just now'}, so here’s the wall’s quick answer: ${quick}`
      talk.addReply(said)
      setAnswer(said)
      return said
    }
  }, [askAbout, talk])

  /** One sentence, typed or said, → what the wall does with it. Timers, kiosk
   *  commands, groceries, notes, talk-abouts and Inbox captures ("remind us
   *  to…") stay instant and local — a clear single item happens at once; with
   *  the agent, everything else is a turn with Symphony. */
  const handle = useCallback(async (text: string, spoken: boolean) => {
    const u = readUtterance(text)
    setHeard(text.trim() || null)
    setAnswer(null)
    setUndo(null)
    setOpen(false)
    let said: string | null
    let speak: string | null = null
    const intent = talk.enabled ? talkIntent(text, !!talk.card) : null
    const agentTakes = talk.enabled && (u.kind === 'question' || (u.kind === 'unknown' && !!u.text.trim()))
    if (intent === 'approve') {
      setBusy(true)
      said = (await talk.approve().finally(() => setBusy(false))) ?? 'There’s nothing to approve.'
    } else if (intent === 'dismiss') {
      talk.dismiss()
      said = 'Okay, not now. Nothing was changed.'
    } else if (intent === 'plan-week') {
      said = await converse(() => talk.startPlanning(), text)
    } else if (agentTakes) {
      said = await converse(() => talk.ask(text.trim()), u.kind === 'question' || u.kind === 'unknown' ? u.text : text)
    } else {
      switch (u.kind) {
        case 'command':
          if (u.command.type === 'home') talk.end()
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
    }
    if (said === null) return
    setFeedback(said)
    if (spoken) replyRef.current(speak ?? said)
  }, [onCommand, voice, askAbout, talk, converse])

  const onHeard = useCallback((h: Heard) => { void handle(h.text, true) }, [handle])
  const onNothing = useCallback((reason: string) => {
    setHeard(null); setAnswer(null); setUndo(null)
    setFeedback(reason === 'silence' ? 'Didn’t hear anything.' : 'Didn’t catch that.')
  }, [])
  const real = useWallListener(onHeard, onNothing)
  const listener: WallListener = useMemo(() => {
    if (!preview) return real
    const noop = () => {}
    return {
      ...real, connected: true, wake: 'Hey Symphony', muted: preview === 'muted', quiet: preview === 'quiet',
      state: preview === 'listening' ? 'listening' : preview === 'idle' ? 'ready' : preview,
      listen: noop, cancel: noop, mute: noop, say: noop, play: noop, done: noop,
    }
  }, [real, preview])
  const live = listener.connected

  // Say it back: a natural voice when the app can make one, else the Pi's own.
  useEffect(() => {
    replyRef.current = (text: string) => {
      if (!listener.connected) return
      void speechFor(text).then((wav) => (wav ? listener.play(wav) : listener.say(text)))
    }
  }, [listener])

  const clearReply = useCallback(() => { setFeedback(null); setHeard(null); setAnswer(null); setUndo(null) }, [])

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
  // The reply fades; longer while Undo or an answer is up.
  useEffect(() => {
    if (open || !feedback || busy) return
    const id = setTimeout(clearReply, undo ? UNDO_MS : answer ? 15_000 : 6000)
    return () => clearTimeout(id)
  }, [open, feedback, busy, undo, answer, clearReply])

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

  const toggleVoice = useCallback(() => {
    const next = !voiceOn
    writeVoiceOptIn(safeStorage(), next)
    setVoiceOn(next)
    if (!next) stopListening()
  }, [voiceOn, stopListening])

  const takeBack = useCallback(async () => {
    const fn = undo
    setUndo(null)
    if (!fn) return
    setFeedback((await fn()) ? 'Undone.' : 'Couldn’t undo — remove it from the list.')
    setAnswer(null)
  }, [undo])

  const isListening = live ? listener.state === 'listening' : listening
  const isThinking = busy || (live && listener.state === 'thinking')
  /** The wall is saying Symphony's reply out loud. */
  const isSpeaking = live && listener.state === 'speaking'
  const micLive = live && !listener.muted && !listener.quiet && listener.state !== 'speaking'
  /** The wall can hear right now (the listener's mic, or the browser's opt-in). */
  const canHear = live ? !listener.muted : voiceOn && supported

  const stateLabel = live
    ? listener.muted ? 'Microphone off · tap for commands'
      : listener.quiet ? 'Quiet hours · tap to talk'
        : listener.wake ? `Say “${listener.wake}” or tap` : 'Tap to talk'
    : voiceOn && supported ? 'Voice on · tap to talk' : 'Voice off · tap for commands'

  /** The slice-7 pill: listen, or open the commands panel. */
  const onPill = () => {
    if (live) {
      if (isListening) { listener.cancel(); return }
      if (listener.muted || open) { setOpen((o) => !o); return }
      clearReply()
      listener.listen()
      return
    }
    if (listening) { stopListening(); return }
    if (voiceOn && supported && !open) { setOpen(true); listenInBrowser(); return }
    setOpen((o) => !o)
  }

  /** Tap Approve: same as saying it. */
  const approveCard = useCallback(async () => {
    setBusy(true)
    const said = await talk.approve().finally(() => setBusy(false))
    if (said) { setHeard(null); setAnswer(null); setFeedback(said) }
  }, [talk])
  const undoCard = useCallback(async () => {
    const said = await talk.undoSaved()
    setHeard(null); setAnswer(null); setFeedback(said)
  }, [talk])

  return {
    talk, approveCard, undoCard,
    open, setOpen, feedback, heard, answer, undo, busy, voiceOn, supported, listening, listener, live,
    isListening, isThinking, isSpeaking, micLive, canHear, stateLabel,
    handle, runPhrase, stopListening, listenInBrowser, toggleVoice, takeBack, clearReply, onPill,
  }
}

export type TellSymphony = ReturnType<typeof useTellSymphony>
