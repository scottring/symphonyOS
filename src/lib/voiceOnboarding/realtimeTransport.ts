// src/lib/voiceOnboarding/realtimeTransport.ts
//
// OpenAI Realtime over WebRTC, through our own edge function
// (supabase/functions/voice-session). The browser sends its SDP offer to
// that function with the person's Supabase session; the function checks the
// account, the switch and today's limit, and creates the call with the
// server-held key, model and instructions. The browser never holds an OpenAI
// key — not even an ephemeral one. (OpenAI's "unified interface":
// POST /v1/realtime/calls from the server.)
//
// The microphone is requested only by start(), which the page calls only
// from an explicit tap, and every track is stopped by stop() — including on
// any error, a dropped connection, and the session time limit.

import { Emitter, VOICE_ERROR_COPY, isHorizon, type ConversationContext, type TransportEvent, type TransportStatus, type VoiceErrorCode, type VoiceTransport } from './transport'
import { MAX_LINE } from './flow'

export interface RealtimeDeps {
  /** The edge function URL that answers an SDP offer. */
  endpoint: string
  /** The person's Supabase access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>
  /** Supabase anon key, sent as `apikey` like every other function call. */
  apiKey?: string
  // Injected for tests; the browser's own by default.
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>
  createPeer?: () => RTCPeerConnection
  fetch?: typeof fetch
  createAudio?: () => HTMLAudioElement
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

/** Session length when the server does not say. The server's own cap is authoritative. */
export const DEFAULT_MAX_SECONDS = 480

export class RealtimeTransport implements VoiceTransport {
  readonly kind = 'realtime' as const
  private em = new Emitter()
  private status: TransportStatus = 'idle'
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private timer: unknown = null
  private assistantText = ''
  /** Bumped by stop(): a start() still awaiting the network must not resurrect anything. */
  private generation = 0

  private deps: RealtimeDeps

  constructor(deps: RealtimeDeps) {
    this.deps = deps
  }

  subscribe(fn: (e: TransportEvent) => void) { return this.em.subscribe(fn) }

  private set(status: TransportStatus, reason?: 'stopped' | 'time_limit') {
    this.status = status
    this.em.emit({ type: 'status', status, ...(reason ? { reason } : {}) })
  }

  private fail(code: VoiceErrorCode) {
    this.release()
    this.em.emit({ type: 'error', code, message: VOICE_ERROR_COPY[code] })
    this.set('error')
  }

  async start(ctx: ConversationContext): Promise<void> {
    if (this.status === 'connecting' || this.status === 'live' || this.status === 'muted') return
    const gen = ++this.generation
    const gum = this.deps.getUserMedia ?? (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
      ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c) : undefined)
    const createPeer = this.deps.createPeer ?? (typeof RTCPeerConnection !== 'undefined' ? () => new RTCPeerConnection() : undefined)
    if (!gum || !createPeer) { this.fail('unsupported'); return }

    this.set('connecting')
    const token = await this.deps.getAccessToken().catch(() => null)
    if (gen !== this.generation) return
    if (!token) { this.fail('not_signed_in'); return }

    try {
      this.stream = await gum({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      if (gen === this.generation) this.fail('mic_denied')
      return
    }
    if (gen !== this.generation) { this.release(); return }

    try {
      const pc = createPeer()
      this.pc = pc
      const audio = (this.deps.createAudio ?? (() => document.createElement('audio')))()
      audio.autoplay = true
      this.audio = audio
      pc.ontrack = (e) => { audio.srcObject = e.streams[0] ?? null }
      pc.onconnectionstatechange = () => {
        // 'disconnected' can recover by itself; 'failed' cannot.
        if (pc.connectionState === 'failed') {
          if (this.pc === pc) this.fail('connection_lost')
        }
      }
      for (const track of this.stream.getAudioTracks()) pc.addTrack(track, this.stream)

      const dc = pc.createDataChannel('oai-events')
      this.dc = dc
      dc.onmessage = (m) => this.onServerEvent(m.data)
      dc.onopen = () => this.sync(ctx, true)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const res = await (this.deps.fetch ?? fetch)(this.deps.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
          ...(this.deps.apiKey ? { apikey: this.deps.apiKey } : {}),
        },
        body: offer.sdp ?? '',
      })
      if (gen !== this.generation) { this.release(); return }
      if (!res.ok) { this.fail(errorForStatus(res.status, await res.text().catch(() => ''))); return }
      const answer = await res.text()
      if (gen !== this.generation) { this.release(); return }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

      const maxSeconds = Number(res.headers.get('x-voice-max-seconds')) || DEFAULT_MAX_SECONDS
      this.timer = (this.deps.setTimer ?? ((f, ms) => setTimeout(f, ms)))(() => this.end('time_limit'), maxSeconds * 1000)
      this.set('live')
    } catch {
      if (gen === this.generation) this.fail('network')
    }
  }

  setMuted(muted: boolean) {
    if (this.status !== 'live' && this.status !== 'muted') return
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = !muted
    this.set(muted ? 'muted' : 'live')
  }

  stop() { this.end('stopped') }

  private end(reason: 'stopped' | 'time_limit') {
    this.generation++
    const wasActive = this.status !== 'idle' && this.status !== 'ended'
    this.release()
    if (wasActive) this.set('ended', reason)
  }

  /** Every resource let go: mic tracks stopped, channel and peer closed, audio detached. */
  private release() {
    if (this.timer !== null) { (this.deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer); this.timer = null }
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.stream = null
    try { this.dc?.close() } catch { /* already closed */ }
    this.dc = null
    const pc = this.pc
    this.pc = null
    if (pc) {
      for (const s of pc.getSenders?.() ?? []) s.track?.stop()
      pc.ontrack = null
      pc.onconnectionstatechange = null
      try { pc.close() } catch { /* already closed */ }
    }
    if (this.audio) { this.audio.pause?.(); this.audio.srcObject = null; this.audio = null }
  }

  sync(ctx: ConversationContext, opening = false) {
    const dc = this.dc
    if (!dc || dc.readyState !== 'open') return
    // App context, not the person's words: where the screen is and the plan
    // so far, so a touch edit and the voice stay in step.
    const note = `[Screen update] Current step: ${ctx.step}.${ctx.focus ? ` Goal on screen: ${ctx.focus}.` : ''} Plan so far: ${ctx.plan.length ? ctx.plan.join(' | ') : '(empty)'}.`
    send(dc, { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: note }] } })
    // Only the opening asks for a reply; later updates ride along with the next turn.
    if (opening) send(dc, { type: 'response.create' })
  }

  private onServerEvent(raw: unknown) {
    let e: { type?: string; [k: string]: unknown }
    try { e = JSON.parse(String(raw)) } catch { return }
    switch (e.type) {
      case 'input_audio_buffer.speech_started':
        // The person started talking. Over WebRTC the server stops the
        // reply and drops audio not yet played; the screen shows who has the floor.
        this.em.emit({ type: 'speaking', who: 'user', active: true })
        break
      case 'input_audio_buffer.speech_stopped':
        this.em.emit({ type: 'speaking', who: 'user', active: false })
        break
      case 'output_audio_buffer.started':
        this.em.emit({ type: 'speaking', who: 'assistant', active: true })
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.em.emit({ type: 'speaking', who: 'assistant', active: false })
        break
      case 'response.output_audio_transcript.delta':
        this.assistantText += typeof e.delta === 'string' ? e.delta : ''
        this.em.emit({ type: 'assistant', text: this.assistantText, final: false })
        break
      case 'response.output_audio_transcript.done':
        this.em.emit({ type: 'assistant', text: typeof e.transcript === 'string' ? e.transcript : this.assistantText, final: true })
        this.assistantText = ''
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof e.transcript === 'string' && e.transcript.trim()) this.em.emit({ type: 'user', text: e.transcript.trim() })
        break
      case 'response.done':
        this.onResponseDone(e.response)
        break
      case 'error':
        // Reported, not fatal: the connection may carry on.
        this.em.emit({ type: 'error', code: 'model', message: VOICE_ERROR_COPY.model })
        break
    }
  }

  private onResponseDone(response: unknown) {
    const output = (response as { output?: unknown[] } | undefined)?.output
    if (!Array.isArray(output) || !this.dc) return
    let answered = false
    for (const item of output as { type?: string; name?: string; call_id?: string; arguments?: string }[]) {
      if (item?.type !== 'function_call' || !item.call_id) continue
      const result = item.name === 'propose_plan_card' ? this.propose(item.arguments) : { shown: false, error: 'unknown tool' }
      send(this.dc, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) } })
      answered = true
    }
    if (answered) send(this.dc, { type: 'response.create' })
  }

  /** A card the model proposes is only SHOWN; saving is the person's tap. */
  private propose(args: string | undefined): { shown: boolean; error?: string } {
    let parsed: { level?: unknown; text?: unknown; goal?: unknown }
    try { parsed = JSON.parse(args ?? '{}') } catch { return { shown: false, error: 'bad arguments' } }
    const text = typeof parsed.text === 'string' ? parsed.text.trim().slice(0, MAX_LINE) : ''
    if (!isHorizon(parsed.level) || !text) return { shown: false, error: 'needs level and text' }
    const goal = typeof parsed.goal === 'string' ? parsed.goal.trim().slice(0, MAX_LINE) : ''
    this.em.emit({ type: 'propose', level: parsed.level, text, ...(goal ? { goal } : {}) })
    return { shown: true }
  }
}

function send(dc: RTCDataChannel, event: unknown) {
  try { dc.send(JSON.stringify(event)) } catch { /* channel closing */ }
}

export function errorForStatus(status: number, body: string): VoiceErrorCode {
  if (status === 401) return 'not_signed_in'
  if (status === 429) return 'limit'
  if (status === 503 && body.includes('voice_disabled')) return 'disabled'
  if (status >= 500) return 'unavailable'
  return 'network'
}
