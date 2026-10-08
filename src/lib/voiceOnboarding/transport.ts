// src/lib/voiceOnboarding/transport.ts
//
// What the page needs from a voice connection, whichever one it is: start
// (only on an explicit tap), mute, stop, tell the conversation where the
// person moved by touch, and events back — status, what was said, who is
// speaking (for interruptions), a proposed plan card, and errors. The page
// never touches a microphone or a network itself.
//
// Two implementations:
//  - DemoTransport (here): a deterministic SIMULATION. No microphone, no
//    network, no cost. It exists so the screen can be checked safely, and the
//    page labels it as a simulation wherever it is in use.
//  - RealtimeTransport (realtimeTransport.ts): OpenAI Realtime over WebRTC,
//    connected through the voice-session edge function.

import { HORIZONS, horizonOf, type Horizon, type Step } from './flow'

export type TransportStatus = 'idle' | 'connecting' | 'live' | 'muted' | 'ended' | 'error'

export type VoiceErrorCode =
  | 'unsupported' | 'mic_denied' | 'not_signed_in' | 'disabled' | 'limit' | 'unavailable' | 'network' | 'connection_lost' | 'model'

export type TransportEvent =
  | { type: 'status'; status: TransportStatus; reason?: 'stopped' | 'time_limit' }
  | { type: 'assistant'; text: string; final: boolean }
  | { type: 'user'; text: string }
  | { type: 'speaking'; who: 'user' | 'assistant'; active: boolean }
  /** `goal`: the goal it is for, as the guide named it (else the one on screen). */
  | { type: 'propose'; level: Horizon; text: string; goal?: string }
  | { type: 'error'; code: VoiceErrorCode; message: string }

/** Where the conversation is, as the screen sees it. */
export interface ConversationContext {
  step: Step
  /** The goal the question on screen is about (season and month), if any. */
  focus?: string
  /** The plan so far, as short lines ("Year: …"), so the voice can pick up after a touch edit. */
  plan: string[]
}

export interface VoiceTransport {
  readonly kind: 'demo' | 'realtime'
  start(ctx: ConversationContext): Promise<void>
  setMuted(muted: boolean): void
  /** Ends the conversation and releases the microphone. Safe to call twice. */
  stop(): void
  /** The person moved by touch or typing; keep the voice in step. */
  sync(ctx: ConversationContext): void
  subscribe(fn: (e: TransportEvent) => void): () => void
}

export const VOICE_ERROR_COPY: Record<VoiceErrorCode, string> = {
  unsupported: 'This browser can’t do voice. Typing works just the same.',
  mic_denied: 'The microphone wasn’t allowed. You can type instead, or allow it and start again.',
  not_signed_in: 'Voice needs you signed in. Typing works without it.',
  disabled: 'Voice isn’t switched on for this account yet. Typing works just the same.',
  limit: 'That’s today’s voice limit. Typing works just the same.',
  unavailable: 'Voice is unavailable right now. Typing works just the same.',
  network: 'Couldn’t reach the voice service. Typing works just the same.',
  connection_lost: 'The voice connection dropped. Your plan so far is kept — type, or start voice again.',
  model: 'The voice service reported a problem. Your plan so far is kept.',
}

export class Emitter {
  private fns = new Set<(e: TransportEvent) => void>()
  subscribe(fn: (e: TransportEvent) => void): () => void {
    this.fns.add(fn)
    return () => { this.fns.delete(fn) }
  }
  emit(e: TransportEvent): void {
    for (const fn of [...this.fns]) fn(e)
  }
}

const DEMO_LINES: Record<Horizon | 'review' | 'check', string> = {
  year: 'Let’s look at the whole year first. What goals do you want it to hold? Name them one at a time.',
  season: 'For this season — what would show this goal moving? Nothing is fine too.',
  month: 'And this month — what is its part of this goal?',
  week: 'Now the week, for all your goals together. What will you do?',
  today: 'What will you do today? You can pick from this week.',
  check: 'Here it is across all your goals. Change anything, or carry on when it looks right.',
  review: 'That’s the plan. Have a look, and save it when it reads right.',
}

function demoLine(ctx: ConversationContext): string {
  if (ctx.step.endsWith(':check')) return DEMO_LINES.check
  const h = horizonOf(ctx.step)
  const line = DEMO_LINES[h]
  return (h === 'season' || h === 'month') && ctx.focus ? `${line} (${ctx.focus})` : line
}

/**
 * Simulated voice. `say(text)` stands in for the person speaking: it is
 * "heard" (a user transcript), and the guide proposes it as the card for the
 * step on screen — the same events the real connection produces, in the same
 * order, with no audio and no network.
 */
export class DemoTransport implements VoiceTransport {
  readonly kind = 'demo' as const
  private em = new Emitter()
  private status: TransportStatus = 'idle'
  private ctx: ConversationContext = { step: 'year', plan: [] }

  subscribe(fn: (e: TransportEvent) => void) { return this.em.subscribe(fn) }

  private set(status: TransportStatus, reason?: 'stopped' | 'time_limit') {
    this.status = status
    this.em.emit({ type: 'status', status, ...(reason ? { reason } : {}) })
  }

  async start(ctx: ConversationContext): Promise<void> {
    if (this.status === 'live' || this.status === 'muted') return
    this.ctx = ctx
    this.set('connecting')
    this.set('live')
    this.ask()
  }

  private ask() {
    this.em.emit({ type: 'speaking', who: 'assistant', active: true })
    this.em.emit({ type: 'assistant', text: demoLine(this.ctx), final: true })
    this.em.emit({ type: 'speaking', who: 'assistant', active: false })
  }

  setMuted(muted: boolean) {
    if (this.status !== 'live' && this.status !== 'muted') return
    this.set(muted ? 'muted' : 'live')
  }

  stop() {
    if (this.status === 'idle' || this.status === 'ended') return
    this.set('ended', 'stopped')
  }

  sync(ctx: ConversationContext) {
    const moved = ctx.step !== this.ctx.step || ctx.focus !== this.ctx.focus
    this.ctx = ctx
    if (moved && this.status === 'live') this.ask()
  }

  /** Simulate the person saying `text`. Ignored unless live and unmuted. */
  say(text: string) {
    const level = horizonOf(this.ctx.step)
    if (this.status !== 'live' || level === 'review') return
    this.em.emit({ type: 'speaking', who: 'user', active: true })
    this.em.emit({ type: 'speaking', who: 'user', active: false })
    this.em.emit({ type: 'user', text })
    this.em.emit({ type: 'propose', level, text, ...(this.ctx.focus ? { goal: this.ctx.focus } : {}) })
  }

  /** Simulate talking over the guide: its line stops, the person is heard. */
  interrupt() {
    if (this.status !== 'live') return
    this.em.emit({ type: 'speaking', who: 'assistant', active: true })
    this.em.emit({ type: 'speaking', who: 'user', active: true })
    this.em.emit({ type: 'speaking', who: 'assistant', active: false })
    this.em.emit({ type: 'speaking', who: 'user', active: false })
  }

  /** Simulate a dropped connection, to check the fallback. */
  fail() {
    if (this.status === 'idle' || this.status === 'ended') return
    this.em.emit({ type: 'error', code: 'connection_lost', message: VOICE_ERROR_COPY.connection_lost })
    this.set('error')
  }
}

export function isHorizon(v: unknown): v is Horizon {
  return typeof v === 'string' && (HORIZONS as readonly string[]).includes(v)
}
