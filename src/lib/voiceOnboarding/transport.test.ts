import { describe, it, expect, vi } from 'vitest'
import { DemoTransport, type TransportEvent } from './transport'
import { RealtimeTransport, TAP_FALLBACK_MS, errorForStatus, type RealtimeDeps } from './realtimeTransport'

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
    // Live, then the connect timing (a content-free metric for the UX05 targets).
    expect(events.at(-2)).toEqual({ type: 'status', status: 'live' })
    expect(events.at(-1)).toMatchObject({ type: 'metric', name: 'connect' })
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

  it.each([[503, '{"error":"voice_disabled"}', 'disabled'], [429, '{"error":"daily_limit"}', 'limit'], [401, '', 'not_signed_in'], [502, '', 'unavailable'],
    [429, '{"code":"ai_daily_limit"}', 'ai_daily_limit'], [429, '{"code":"ai_monthly_limit"}', 'ai_monthly_limit'], [503, '{"code":"ai_usage_unavailable"}', 'ai_usage_unavailable']])(
    'server %s → %s, and the microphone is released', async (status, body, code) => {
      const { t, track, peer, events } = setup({ status, body })
      await t.start(ctx)
      expect(events).toContainEqual(expect.objectContaining({ type: 'error', code }))
      expect(track.stopped).toBe(true)
      expect(peer.closed).toBe(true)
      if (String(code).startsWith('ai_')) {
        expect(events).toContainEqual(expect.objectContaining({ type: 'error', message: expect.stringContaining('change your plans directly') }))
        expect(JSON.stringify(events)).not.toContain('Typing works')
      }
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

  it('does not submit a partial second utterance when the session expires', async () => {
    const handleTurn = vi.fn(async () => 'What else?')
    const {t, peer, timers, track, events} = setup({turns:'tap',handleTurn})
    await t.start(ctx)
    t.sendText('Help plan today')
    await vi.waitFor(()=>expect(handleTurn).toHaveBeenCalledTimes(1))
    serverEvent(peer,{type:'response.done',response:{status:'completed'}})
    serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:'second'})
    serverEvent(peer,{type:'conversation.item.input_audio_transcription.delta',item_id:'second',delta:'Return the books'})
    timers[0].fn()
    serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'second',transcript:'Return the books Saturday'})
    expect(handleTurn).toHaveBeenCalledTimes(1)
    expect(track.stopped).toBe(true)
    expect(events).toContainEqual({type:'user',text:'Return the books'})
    expect(events.at(-1)).toEqual({type:'status',status:'ended',reason:'time_limit'})
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

describe('RealtimeTransport, tap to talk', () => {
  const sent = (peer: FakePeer) => peer.channel.sent.map((e) => (e as { type: string }).type)

  it('Talk is the person’s turn: the mic opens, Symphony doesn’t speak first', async () => {
    const { t, peer, track, events } = setup({ turns: 'tap' })
    await t.start(ctx)
    peer.channel.onopen?.()
    expect(track.enabled).toBe(true)
    expect(events).toContainEqual({ type: 'turn', turn: 'listening' })
    expect(sent(peer)).not.toContain('response.create')
  })

  it('a pause is not the end: no reply until Done, and the words show as they come', async () => {
    const { t, peer, events } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started', item_id: 'a' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_stopped' })
    serverEvent(peer, { type: 'input_audio_buffer.committed', item_id: 'a' })
    serverEvent(peer, { type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Add milk' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_started', item_id: 'b' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_stopped' })
    serverEvent(peer, { type: 'input_audio_buffer.committed', item_id: 'b' })
    serverEvent(peer, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: 'and eggs.' })
    serverEvent(peer, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Add milk' })
    expect(sent(peer)).not.toContain('response.create')
    expect(events.filter((e) => e.type === 'user').at(-1)).toEqual({ type: 'user', text: 'Add milk and eggs.' })
  })

  it('Done sends the turn and closes the mic; mid-sentence it commits what’s still coming', async () => {
    const { t, peer, track, events } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    t.finishTurn()
    expect(sent(peer).slice(-2)).toEqual(['input_audio_buffer.commit', 'response.create'])
    expect(track.enabled).toBe(false)
    expect(events.at(-1)).toEqual({ type: 'turn', turn: 'off' })
  })

  it('Done after a pause doesn’t commit an empty buffer', async () => {
    const { t, peer } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_stopped' })
    t.finishTurn()
    expect(sent(peer)).not.toContain('input_audio_buffer.commit')
    expect(sent(peer).at(-1)).toBe('response.create')
  })

  it('Done with nothing said asks for no reply', async () => {
    const { t, peer } = setup({ turns: 'tap' })
    await t.start(ctx)
    t.finishTurn()
    expect(sent(peer)).not.toContain('response.create')
  })

  it('open conversation: the mic is open on connect, and again once Symphony finishes answering', async () => {
    const { t, peer, track, events } = setup({ turns: 'tap' })
    await t.start(ctx)
    expect(track.enabled).toBe(true)
    expect(events.filter((e) => e.type === 'turn').at(-1)).toEqual({ type: 'turn', turn: 'listening' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    t.finishTurn()
    expect(track.enabled).toBe(false)
    serverEvent(peer, { type: 'response.created' })
    serverEvent(peer, { type: 'output_audio_buffer.started' })
    serverEvent(peer, { type: 'response.done', response: { output: [] } })
    serverEvent(peer, { type: 'output_audio_buffer.stopped' })
    expect(track.enabled).toBe(true)
    expect(events.filter((e) => e.type === 'turn').at(-1)).toEqual({ type: 'turn', turn: 'listening' })
  })

  it.each(['text-only', 'audio-stops-first'])('reopens the mic after a %s terminal reply', async mode => {
    const { t, peer, track } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    t.finishTurn()
    serverEvent(peer, { type: 'response.created' })
    if (mode === 'audio-stops-first') {
      serverEvent(peer, { type: 'output_audio_buffer.started' })
      serverEvent(peer, { type: 'output_audio_buffer.stopped' })
      expect(track.enabled).toBe(false)
    }
    serverEvent(peer, { type: 'response.done', response: { output: [] } })
    await Promise.resolve()
    expect(track.enabled).toBe(true)
  })

  it('a short quiet after speaking sends it (no Done needed); speaking again resets', async () => {
    const { t, peer, timers } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    serverEvent(peer, { type: 'input_audio_buffer.speech_stopped' })
    const fallback = timers.at(-1)!
    expect(fallback.ms).toBe(TAP_FALLBACK_MS)
    fallback.fn()
    expect(sent(peer).at(-1)).toBe('response.create')
  })

  it('Talk while Symphony is answering stops it and opens the mic', async () => {
    const { t, peer, track } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'input_audio_buffer.speech_started' })
    t.finishTurn()
    serverEvent(peer, { type: 'response.created' })
    serverEvent(peer, { type: 'output_audio_buffer.started' })
    t.listen()
    expect(sent(peer).slice(-3)).toEqual(['response.cancel', 'output_audio_buffer.clear', 'input_audio_buffer.clear'])
    expect(track.enabled).toBe(true)
  })

  it('harmless races are not shown as errors', async () => {
    const { t, peer, events } = setup({ turns: 'tap' })
    await t.start(ctx)
    serverEvent(peer, { type: 'error', error: { code: 'input_audio_buffer_commit_empty' } })
    serverEvent(peer, { type: 'error', error: { code: 'response_cancel_not_active' } })
    expect(events.filter((e) => e.type === 'error')).toEqual([])
  })

  it('auto turns are unchanged: Symphony opens, and Talk/Done do nothing', async () => {
    const { t, peer, track } = setup()
    await t.start(ctx)
    peer.channel.onopen?.()
    expect(sent(peer)).toContain('response.create')
    t.finishTurn()
    t.listen()
    expect(track.enabled).toBe(true)
  })
})

describe('workspace voice tools',()=>{
 it('awaits the saved result and deduplicates tool calls',async()=>{
  let resolve!:(v:unknown)=>void
  const handleTool=vi.fn(()=>new Promise(r=>{resolve=r}))
  const {t,peer}=setup({handleTool})
  await t.start(ctx)
  const event={type:'response.done',response:{output:[{type:'function_call',name:'ask_symphony',call_id:'one',arguments:'{"request":"Plan it today"}'}]}}
  serverEvent(peer,event);serverEvent(peer,event)
  expect(handleTool).toHaveBeenCalledTimes(1)
  expect(peer.channel.sent.filter((e:any)=>e.item?.type==='function_call_output')).toHaveLength(0)
  resolve({saved:true});await Promise.resolve();await Promise.resolve()
  expect(peer.channel.sent).toContainEqual(expect.objectContaining({item:expect.objectContaining({type:'function_call_output',output:'{"saved":true}'})}))
 })
 it('never emits stale tool results after ending voice',async()=>{
  let resolve!:(v:unknown)=>void
  const {t,peer}=setup({handleTool:()=>new Promise(r=>{resolve=r})})
  await t.start(ctx)
  serverEvent(peer,{type:'response.done',response:{output:[{type:'function_call',name:'ask_symphony',call_id:'one',arguments:'{}'}]}})
  t.stop();resolve({saved:true});await Promise.resolve();await Promise.resolve()
  expect(peer.channel.sent.filter((e:any)=>e.item?.type==='function_call_output')).toHaveLength(0)
 })
 it('keeps typed turns in the same live conversation',async()=>{
  const {t,peer}=setup();expect(t.sendText('hello')).toBe(false)
  await t.start(ctx);expect(t.sendText('show my week')).toBe(true)
  expect(peer.channel.sent).toContainEqual(expect.objectContaining({item:expect.objectContaining({content:[{type:'input_text',text:'show my week'}]})}))
 })
})


it('ignores silent/late caption items and keeps listening when Done is pressed in silence',async()=>{
 const {t,peer,track,events}=setup({turns:'tap'})
 await t.start(ctx);peer.channel.onopen?.()
 const sent=peer.channel.sent.length
 serverEvent(peer,{type:'input_audio_buffer.committed',item_id:'silence'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'silence',transcript:'Kaleb, Ella, piano practice.'})
 t.finishTurn()
 expect(peer.channel.sent.slice(sent)).not.toContainEqual({type:'response.create'})
 expect(track.enabled).toBe(true)
 expect(events.filter(e=>e.type==='user')).toHaveLength(0)
 serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:'real'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'real',transcript:'Call Kaleb'})
 expect(events).toContainEqual({type:'user',text:'Call Kaleb'})
 t.finishTurn();serverEvent(peer,{type:'response.done',response:{output:[]}})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'real',transcript:'Late old caption'})
 expect(events.filter(e=>e.type==='user').at(-1)).toEqual({type:'user',text:'Call Kaleb'})
 t.stop()
})


it('ignores queued data-channel events after End',async()=>{
 const {t,peer,events}=setup({turns:'tap'})
 await t.start(ctx);peer.channel.onopen?.();t.stop()
 const count=events.length
 serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:'late'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'late',transcript:'Late words'})
 serverEvent(peer,{type:'response.output_audio_transcript.done',transcript:'Late reply'})
 serverEvent(peer,{type:'output_audio_buffer.started'})
 expect(events).toHaveLength(count)
})


describe('shared app conversation', () => {
 const utterance=(peer:FakePeer,id:string,text?:string)=>{
  serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:id})
  serverEvent(peer,{type:'input_audio_buffer.speech_stopped',item_id:id})
  if(text!==undefined)serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text})
 }
 it('waits for final captions, preserves speech order and submits exactly once without a model relay',async()=>{
  const handleTurn=vi.fn(async()=> 'The library books are on the card for Saturday. Nothing saved yet.')
  const {t,peer}=setup({turns:'tap',handleTurn});await t.start(ctx);peer.channel.onopen?.()
  utterance(peer,'a');utterance(peer,'b','about dinner tonight.')
  t.finishTurn();expect(handleTurn).not.toHaveBeenCalled()
  serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'I want to talk to my mom'})
  await Promise.resolve();await Promise.resolve()
  expect(handleTurn).toHaveBeenCalledWith('I want to talk to my mom about dinner tonight.')
  serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'duplicate'})
  expect(handleTurn).toHaveBeenCalledTimes(1)
  const responses=peer.channel.sent.filter((e:any)=>e.type==='response.create') as any[]
  expect(responses).toHaveLength(1)
  expect(responses[0].response).toMatchObject({conversation:'none',tools:[],tool_choice:'none',input:[{content:[{text:'The library books are on the card for Saturday. Nothing saved yet.'}]}]})
 })
 it('does not act on noise, incomplete transcription, or captions arriving after End',async()=>{
  const handleTurn=vi.fn(async()=> 'Saved.')
  const {t,peer}=setup({turns:'tap',handleTurn});await t.start(ctx);peer.channel.onopen?.()
  serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'noise',transcript:'Approve'})
  t.finishTurn();expect(handleTurn).not.toHaveBeenCalled()
  utterance(peer,'late');t.finishTurn();t.stop()
  serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'late',transcript:'Approve'})
  expect(handleTurn).not.toHaveBeenCalled()
 })
 it('does not speak a late planner reply after End and cannot execute audio-model tools',async()=>{
  let finish!:(text:string)=>void
  const handleTurn=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve})),handleTool=vi.fn()
  const {t,peer}=setup({turns:'tap',handleTurn,handleTool});await t.start(ctx);peer.channel.onopen?.()
  utterance(peer,'a','Plan the rest of my week');t.finishTurn();t.stop();finish('What day?')
  await Promise.resolve();await Promise.resolve()
  expect(peer.channel.sent.filter((e:any)=>e.type==='response.create')).toHaveLength(0)
  expect(handleTool).not.toHaveBeenCalled()
 })
 it('typed input uses the same owner and audio tool output is ignored',async()=>{
  const handleTurn=vi.fn(async()=> 'Which day works?'),handleTool=vi.fn()
  const {t,peer}=setup({turns:'tap',handleTurn,handleTool});await t.start(ctx);peer.channel.onopen?.()
  expect(t.sendText('Plan the rest of my week')).toBe(true)
  await Promise.resolve();await Promise.resolve()
  serverEvent(peer,{type:'response.done',response:{output:[{type:'function_call',name:'approve_card',call_id:'bad',arguments:'{}'}]}})
  expect(handleTurn).toHaveBeenCalledWith('Plan the rest of my week');expect(handleTool).not.toHaveBeenCalled()
 })
})


it('recovers from incomplete transcription without submitting a partial request',async()=>{
 const handleTurn=vi.fn(async()=> 'On the card.')
 const {t,peer,timers,events}=setup({turns:'tap',handleTurn})
 await t.start(ctx);peer.channel.onopen?.()
 serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:'incomplete'})
 serverEvent(peer,{type:'input_audio_buffer.speech_stopped',item_id:'incomplete'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.delta',item_id:'incomplete',delta:'Do not'})
 t.finishTurn()
 timers.find(t=>t.ms===10000)!.fn()
 expect(handleTurn).not.toHaveBeenCalled()
 expect(events.at(-1)).toEqual({type:'turn',turn:'listening'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'incomplete',transcript:'Do not approve'})
 expect(handleTurn).not.toHaveBeenCalled()
})


it('beta explicit send tolerates pauses and submits the complete utterance only on Done',async()=>{
 const handleTurn=vi.fn(async()=>'Ready to review.')
 const {t,peer,timers}=setup({turns:'tap',explicitSend:true,handleTurn})
 await t.start(ctx)
 serverEvent(peer,{type:'input_audio_buffer.speech_started',item_id:'bike'})
 serverEvent(peer,{type:'input_audio_buffer.speech_stopped',item_id:'bike'})
 serverEvent(peer,{type:'conversation.item.input_audio_transcription.completed',item_id:'bike',transcript:'Take the bike to Bicycle Connection tomorrow.'})
 expect(timers.filter(x=>x.ms===TAP_FALLBACK_MS)).toHaveLength(0)
 expect(handleTurn).not.toHaveBeenCalled()
 t.finishTurn()
 await vi.waitFor(()=>expect(handleTurn).toHaveBeenCalledWith('Take the bike to Bicycle Connection tomorrow.'))
 t.stop()
})
