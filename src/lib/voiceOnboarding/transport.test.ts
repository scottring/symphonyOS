import { describe, it, expect, vi } from 'vitest'
import { DemoTransport, type TransportEvent } from './transport'
import { RealtimeTransport, errorForStatus, type RealtimeDeps } from './realtimeTransport'

const ctx = { step: 'year' as const, plan: [] }

function record(t: { subscribe: (fn: (e: TransportEvent) => void) => () => void }) {
  const events: TransportEvent[] = []
  t.subscribe((e) => events.push(e))
  return events
}

describe('DemoTransport (the labelled simulation)', () => {
  it('only speaks after start, proposes what was "said" for the step on screen, and stops cleanly', async () => {
    const t = new DemoTransport()
    const ev = record(t)
    t.say('ignored before start')
    expect(ev).toEqual([])
    await t.start(ctx)
    t.say('Feel at home in the garden')
    expect(ev).toContainEqual({ type: 'propose', level: 'year', text: 'Feel at home in the garden' })
    t.setMuted(true)
    expect(ev.at(-1)).toEqual({ type: 'status', status: 'muted' })
    t.say('not heard while muted')
    expect(ev.filter((e) => e.type === 'propose')).toHaveLength(1)
    t.stop()
    t.stop()
    expect(ev.filter((e) => e.type === 'status' && e.status === 'ended')).toHaveLength(1)
  })

  it('on a season or month question, says which goal it is asking about and proposes for that goal', async () => {
    const t = new DemoTransport()
    const ev = record(t)
    await t.start({ step: 'season', focus: 'Home office', plan: [] })
    expect(ev).toContainEqual(expect.objectContaining({ type: 'assistant', text: expect.stringContaining('(Home office)') }))
    t.say('Desk in place')
    expect(ev).toContainEqual({ type: 'propose', level: 'season', goal: 'Home office', text: 'Desk in place' })
    t.sync({ step: 'season:check', plan: [] })
    expect(ev.at(-2)).toEqual({ type: 'assistant', text: expect.stringContaining('across all your goals'), final: true })
  })

  it('asks the new question when the person moves by touch', async () => {
    const t = new DemoTransport()
    const ev = record(t)
    await t.start(ctx)
    t.sync({ step: 'month', plan: [] })
    expect(ev.filter((e) => e.type === 'assistant').at(-1)).toMatchObject({ text: expect.stringMatching(/this month/) })
  })
})

// ── RealtimeTransport, against fakes ───────────────────────────────────────

class FakeTrack { enabled = true; stopped = false; stop() { this.stopped = true } }
class FakeChannel {
  readyState = 'open'
  sent: unknown[] = []
  closed = false
  onmessage: ((m: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  send(s: string) { this.sent.push(JSON.parse(s)) }
  close() { this.closed = true; this.readyState = 'closed' }
}
class FakePeer {
  channel = new FakeChannel()
  senders: { track: FakeTrack }[] = []
  closed = false
  remote: unknown = null
  connectionState = 'new'
  ontrack: unknown = null
  onconnectionstatechange: (() => void) | null = null
  addTrack(track: FakeTrack) { this.senders.push({ track }) }
  getSenders() { return this.senders }
  createDataChannel(name: string) { expect(name).toBe('oai-events'); return this.channel }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' } }
  async setLocalDescription() {}
  async setRemoteDescription(d: unknown) { this.remote = d }
  close() { this.closed = true }
}

function setup(over: Partial<RealtimeDeps> & { status?: number; body?: string } = {}) {
  const track = new FakeTrack()
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  const peer = new FakePeer()
  const timers: { fn: () => void; ms: number }[] = []
  const fetchMock = vi.fn(async () => new Response(over.body ?? 'v=0 answer', {
    status: over.status ?? 200, headers: { 'x-voice-max-seconds': '120' },
  }))
  const gum = vi.fn(async () => stream)
  const t = new RealtimeTransport({
    endpoint: 'https://example.test/functions/v1/voice-session',
    apiKey: 'anon',
    getAccessToken: async () => 'user-jwt',
    getUserMedia: gum,
    createPeer: () => peer as unknown as RTCPeerConnection,
    fetch: fetchMock as unknown as typeof fetch,
    createAudio: () => ({ autoplay: false, srcObject: null, pause() {} }) as unknown as HTMLAudioElement,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimer: () => {},
    ...over,
  })
  return { t, track, peer, fetchMock, gum, timers, events: record(t) }
}

const serverEvent = (peer: FakePeer, e: unknown) => peer.channel.onmessage?.({ data: JSON.stringify(e) })

describe('RealtimeTransport', () => {
  it('sends the SDP offer to our server with the person’s session — no OpenAI key in the browser', async () => {
    const { t, fetchMock, peer, events } = setup()
    await t.start(ctx)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/functions/v1/voice-session')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', 'Content-Type': 'application/sdp' })
    expect(String(init.body)).toMatch(/^v=0/)
    expect(JSON.stringify(init)).not.toMatch(/sk-|ek_/)
    expect(peer.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' })
    expect(events.at(-1)).toEqual({ type: 'status', status: 'live' })
  })

  it('does not touch the microphone without a session', async () => {
    const { t, gum, events } = setup({ getAccessToken: async () => null })
    await t.start(ctx)
    expect(gum).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'not_signed_in' }))
  })

  it('a refused microphone falls back with a plain message and no network call', async () => {
    const { t, fetchMock, events } = setup({ getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError') } })
    await t.start(ctx)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'mic_denied' }))
    expect(events.at(-1)).toEqual({ type: 'status', status: 'error' })
  })

  it.each([[503, '{"error":"voice_disabled"}', 'disabled'], [429, '{"error":"daily_limit"}', 'limit'], [401, '', 'not_signed_in'], [502, '', 'unavailable']])(
    'server %s → %s, and the microphone is released', async (status, body, code) => {
      const { t, track, peer, events } = setup({ status, body })
      await t.start(ctx)
      expect(events).toContainEqual(expect.objectContaining({ type: 'error', code }))
      expect(track.stopped).toBe(true)
      expect(peer.closed).toBe(true)
    })

  it('stop releases everything, once', async () => {
    const { t, track, peer, events } = setup()
    await t.start(ctx)
    t.stop()
    t.stop()
    expect(track.stopped).toBe(true)
    expect(peer.closed).toBe(true)
    expect(peer.channel.closed).toBe(true)
    expect(events.filter((e) => e.type === 'status' && e.status === 'ended')).toHaveLength(1)
  })

  it('stopping while connecting never goes live and leaves no microphone open', async () => {
    let release!: (r: Response) => void
    const { t, track, events } = setup({ fetch: (() => new Promise<Response>((r) => { release = r })) as unknown as typeof fetch })
    const starting = t.start(ctx)
    await vi.waitFor(() => expect(release).toBeDefined())
    t.stop()
    release(new Response('v=0 answer'))
    await starting
    expect(track.stopped).toBe(true)
    expect(events.some((e) => e.type === 'status' && e.status === 'live')).toBe(false)
  })

  it('mute disables the microphone track without hanging up', async () => {
    const { t, track, peer } = setup()
    await t.start(ctx)
    t.setMuted(true)
    expect(track.enabled).toBe(false)
    t.setMuted(false)
    expect(track.enabled).toBe(true)
    expect(peer.closed).toBe(false)
  })

  it('ends at the server’s time limit', async () => {
    const { t, timers, track, events } = setup()
    await t.start(ctx)
    expect(timers[0].ms).toBe(120_000)
    timers[0].fn()
    expect(track.stopped).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended', reason: 'time_limit' })
  })

  it('a failed connection releases the microphone and says so', async () => {
    const { t, peer, track, events } = setup()
    await t.start(ctx)
    peer.connectionState = 'failed'
    peer.onconnectionstatechange?.()
    expect(track.stopped).toBe(true)
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'connection_lost' }))
  })

  it('shows interruptions: the person speaking over the guide', async () => {
    const { t, peer, events } = setup()
    await t.start(ctx)
    serverEvent(peer, { type: 'output_audio_buffer.started' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    serverEvent(peer, { type: 'output_audio_buffer.cleared' })
    expect(events.filter((e) => e.type === 'speaking')).toEqual([
      { type: 'speaking', who: 'assistant', active: true },
      { type: 'speaking', who: 'user', active: true },
      { type: 'speaking', who: 'assistant', active: false },
    ])
  })

  it('turns a propose_plan_card call into a card, answers the call, and asks for the next turn', async () => {
    const { t, peer, events } = setup()
    await t.start(ctx)
    peer.channel.sent = []
    serverEvent(peer, { type: 'response.done', response: { output: [
      { type: 'function_call', name: 'propose_plan_card', call_id: 'c1', arguments: JSON.stringify({ level: 'season', text: 'Two beds built' }) },
    ] } })
    expect(events).toContainEqual({ type: 'propose', level: 'season', text: 'Two beds built' })
    expect(peer.channel.sent).toEqual([
      { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ shown: true }) } },
      { type: 'response.create' },
    ])
  })

  it('carries the goal a card is for, as the guide named it', async () => {
    const { t, peer, events } = setup()
    await t.start(ctx)
    serverEvent(peer, { type: 'response.done', response: { output: [
      { type: 'function_call', name: 'propose_plan_card', call_id: 'c3', arguments: JSON.stringify({ level: 'month', goal: 'Home office', text: 'Paint the walls' }) },
    ] } })
    expect(events).toContainEqual({ type: 'propose', level: 'month', goal: 'Home office', text: 'Paint the walls' })
  })

  it('refuses a malformed card instead of guessing', async () => {
    const { t, peer, events } = setup()
    await t.start(ctx)
    serverEvent(peer, { type: 'response.done', response: { output: [
      { type: 'function_call', name: 'propose_plan_card', call_id: 'c2', arguments: JSON.stringify({ level: 'decade', text: 'x' }) },
    ] } })
    expect(events.some((e) => e.type === 'propose')).toBe(false)
    expect(JSON.stringify(peer.channel.sent)).toContain('needs level and text')
  })

  it('tells the conversation where the screen is when the channel opens, including the goal asked about', async () => {
    const { t, peer } = setup()
    await t.start({ step: 'season', focus: 'Home office', plan: ['Home office: —'] })
    peer.channel.onopen?.()
    expect(JSON.stringify(peer.channel.sent[0])).toContain('Current step: season. Goal on screen: Home office.')
    expect(peer.channel.sent[1]).toEqual({ type: 'response.create' })
  })

  it('maps status codes', () => {
    expect(errorForStatus(503, 'server_not_configured')).toBe('unavailable')
    expect(errorForStatus(400, '')).toBe('network')
  })
})
