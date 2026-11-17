// Ringtones the wall plays through the EMEET when an allowed call comes in to
// the kid phone, so the handset's own ringer can stay switched off (Scott,
// 2026-11-17: the Trimline's built-in warble is "obnoxious" and can't be
// changed — see the kid-phone hardware notes).
//
// Every sound is made in the browser with Web Audio: no files to load, nothing
// to 404 after a deploy. Melodies are original or public domain (Twinkle,
// Brahms' Lullaby, the Westminster quarters).
//
// The players take the context and destination as arguments so tests can run
// them against a fake context and check every note is scheduled sanely.

export type RingtoneId =
  | 'music-box' | 'wind-chimes' | 'harp' | 'kalimba' | 'westminster' | 'lullaby'
  | 'frog-chorus' | 'cuckoo' | 'slide-whistle' | 'robot' | 'birdsong' | 'xylophone'

export type RingtoneMood = 'calm' | 'fun'

export interface Ringtone {
  id: RingtoneId
  label: string
  mood: RingtoneMood
  blurb: string
}

export const RINGTONES: Ringtone[] = [
  { id: 'music-box', label: 'Music box', mood: 'calm', blurb: 'Twinkle, twinkle on a tiny music box' },
  { id: 'wind-chimes', label: 'Wind chimes', mood: 'calm', blurb: 'Chimes on the porch in a breeze' },
  { id: 'harp', label: 'Harp', mood: 'calm', blurb: 'A slow rising harp sweep' },
  { id: 'kalimba', label: 'Kalimba', mood: 'calm', blurb: 'Soft thumb-piano plinks' },
  { id: 'westminster', label: 'Clock tower', mood: 'calm', blurb: 'Big Ben chimes, gently' },
  { id: 'lullaby', label: 'Lullaby flute', mood: 'calm', blurb: "Brahms' Lullaby on a wooden flute" },
  { id: 'frog-chorus', label: 'Frog chorus', mood: 'fun', blurb: 'A pond full of ribbits' },
  { id: 'cuckoo', label: 'Cuckoo clock', mood: 'fun', blurb: 'Cuckoo! Cuckoo! Cuckoo!' },
  { id: 'slide-whistle', label: 'Slide whistle', mood: 'fun', blurb: 'Wheee-ooo-wheee' },
  { id: 'robot', label: 'Robot', mood: 'fun', blurb: 'Bleep bloop, incoming transmission' },
  { id: 'birdsong', label: 'Songbird', mood: 'fun', blurb: 'A chatty little bird' },
  { id: 'xylophone', label: 'Xylophone ta-da', mood: 'fun', blurb: 'A bouncy fanfare' },
]

export const DEFAULT_RINGTONE: RingtoneId = 'music-box'
export const RINGTONE_STORAGE_KEY = 'symphony.wall.kidphone.ringtone'

export function asRingtone(v: unknown): RingtoneId {
  return RINGTONES.some((r) => r.id === v) ? (v as RingtoneId) : DEFAULT_RINGTONE
}

export function ringtoneLabel(id: RingtoneId): string {
  return RINGTONES.find((r) => r.id === id)?.label ?? 'Music box'
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined

/** The wall's chosen ringtone. Kept on the kiosk: it's the only thing that rings. */
export function loadRingtone(store: Store): RingtoneId {
  try { return asRingtone(store?.getItem(RINGTONE_STORAGE_KEY)) } catch { return DEFAULT_RINGTONE }
}

export function saveRingtone(store: Store, id: RingtoneId): void {
  try { store?.setItem(RINGTONE_STORAGE_KEY, id) } catch { /* private mode, full storage */ }
}

// ---- Synthesis ------------------------------------------------------------

/** The slice of a Web Audio context the players use. */
export type AudioCtx = Pick<BaseAudioContext, 'createOscillator' | 'createGain' | 'createBiquadFilter' | 'currentTime'>

interface Out { ctx: AudioCtx; dest: AudioNode }

const SILENT = 0.0001

/** A note with an instant-ish attack and an exponential fade — the shape of
 *  anything struck or plucked. */
function tone(o: Out, at: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.005): void {
  const osc = o.ctx.createOscillator()
  const g = o.ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(SILENT, at)
  g.gain.linearRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(SILENT, at + dur)
  osc.connect(g).connect(o.dest)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

/** A held note that swoops from f0 to f1 (whistles, chirps, robot bwoops). */
function glide(o: Out, at: number, path: [freq: number, atOffset: number][], peak: number, type: OscillatorType = 'sine', vibratoHz = 0): number {
  const osc = o.ctx.createOscillator()
  const g = o.ctx.createGain()
  osc.type = type
  const [[f0]] = path
  osc.frequency.setValueAtTime(f0, at)
  for (const [f, dt] of path.slice(1)) osc.frequency.exponentialRampToValueAtTime(f, at + dt)
  const dur = path[path.length - 1][1]
  if (vibratoHz) {
    const lfo = o.ctx.createOscillator()
    const depth = o.ctx.createGain()
    lfo.frequency.setValueAtTime(vibratoHz, at)
    depth.gain.setValueAtTime(f0 * 0.02, at)
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + dur + 0.1)
  }
  g.gain.setValueAtTime(SILENT, at)
  g.gain.linearRampToValueAtTime(peak, at + 0.02)
  g.gain.setValueAtTime(peak, at + Math.max(0.02, dur - 0.06))
  g.gain.exponentialRampToValueAtTime(SILENT, at + dur + 0.04)
  osc.connect(g).connect(o.dest)
  osc.start(at)
  osc.stop(at + dur + 0.1)
  return dur
}

/** Church-bell partials (hum, prime, tierce, quint, nominal), long tail. */
function bell(o: Out, at: number, f: number, dur: number, peak: number): void {
  const partials: [number, number][] = [[0.5, 0.35], [1, 1], [1.19, 0.3], [1.5, 0.2], [2, 0.45], [2.74, 0.12]]
  for (const [ratio, g] of partials) tone(o, at, f * ratio, dur * (ratio < 1 ? 1.2 : 1 / Math.sqrt(ratio)), peak * g, 'sine', 0.004)
}

/** A breathy held note with gentle vibrato. */
function flute(o: Out, at: number, f: number, dur: number, peak: number): void {
  for (const [ratio, g] of [[1, 1], [2, 0.12], [3, 0.04]] as const) {
    const osc = o.ctx.createOscillator()
    const env = o.ctx.createGain()
    const lfo = o.ctx.createOscillator()
    const depth = o.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f * ratio, at)
    lfo.frequency.setValueAtTime(5, at)
    depth.gain.setValueAtTime(f * ratio * 0.005, at)
    lfo.connect(depth).connect(osc.frequency)
    env.gain.setValueAtTime(SILENT, at)
    env.gain.linearRampToValueAtTime(peak * g, at + 0.07)
    env.gain.linearRampToValueAtTime(peak * g * 0.8, at + dur * 0.85)
    env.gain.exponentialRampToValueAtTime(SILENT, at + dur + 0.18)
    osc.connect(env).connect(o.dest)
    for (const n of [osc, lfo]) { n.start(at); n.stop(at + dur + 0.25) }
  }
}

// Note frequencies (equal temperament, A4 = 440).
const N = {
  B3: 246.94, C4: 261.63, E4: 329.63, G4: 392, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, Eb5: 622.25, Fs5: 739.99, G5: 783.99, Gs5: 830.61, A5: 880, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, B6: 1975.53, D7: 2349.32,
}

type Player = (o: Out, t0: number) => number

const musicBox: Player = (o, t0) => {
  // Twinkle, twinkle, little star — C C G G A A G.
  const tune = [N.C6, N.C6, N.G6, N.G6, N.A6, N.A6, N.G6]
  tune.forEach((f, i) => {
    const at = t0 + i * 0.27
    const last = i === tune.length - 1
    tone(o, at, f, last ? 1.8 : 1.2, 0.2)
    tone(o, at, f * 2, 0.45, 0.05)
    tone(o, at, f * 3.01, 0.18, 0.025)
  })
  return 6 * 0.27 + 1.8
}

const windChimes: Player = (o, t0) => {
  const notes = [N.C6, N.D6, N.E6, N.G6, N.A6, N.C6 * 2]
  let at = t0
  for (let i = 0; i < 12; i++) {
    const f = notes[(i * 7 + 3) % notes.length]
    tone(o, at, f, 1.8, 0.12)
    tone(o, at, f * 2.76, 0.8, 0.03)
    at += 0.16 + ((i * 37) % 9) * 0.03
  }
  return at - t0 + 1.8
}

const harp: Player = (o, t0) => {
  const up = [N.C4, N.E4, N.G4, N.B4, N.D5, N.E5, N.G5, N.B5, N.D6]
  up.forEach((f, i) => {
    const at = t0 + i * 0.085
    tone(o, at, f, 2.2, 0.15, 'triangle', 0.003)
    tone(o, at, f * 2, 0.9, 0.04)
  })
  // A soft answer from the top, after the sweep settles.
  ;[N.G5, N.E5].forEach((f, i) => tone(o, t0 + 1.2 + i * 0.3, f, 1.6, 0.1, 'triangle', 0.003))
  return 1.2 + 0.3 + 1.6
}

const kalimba: Player = (o, t0) => {
  const tune = [N.D5, N.Fs5, N.A5, N.D6, N.B5, N.A5, N.Fs5, N.A5]
  tune.forEach((f, i) => {
    const at = t0 + i * 0.21
    tone(o, at, f, 0.95, 0.24)
    tone(o, at, f * 5.4, 0.06, 0.03) // the tine's click
  })
  return 7 * 0.21 + 0.95
}

const westminster: Player = (o, t0) => {
  // The Westminster quarters, first two changes, an octave up.
  const phrases = [[N.Gs5, N.Fs5, N.E5, N.B4], [N.E5, N.Gs5, N.Fs5, N.B4]]
  let at = t0
  phrases.forEach((p) => {
    p.forEach((f, i) => {
      const last = i === p.length - 1
      bell(o, at, f, last ? 2 : 1.6, 0.1)
      at += last ? 0.75 : 0.45
    })
  })
  // The hum partial rings 1.2x a note's length.
  return at - t0 - 0.75 + 2 * 1.2
}

const lullaby: Player = (o, t0) => {
  // Brahms' Lullaby, first line. [note, beats]
  const beat = 0.3
  const tune: [number, number][] = [
    [N.E5, 0.5], [N.E5, 0.5], [N.G5, 2],
    [N.E5, 0.5], [N.E5, 0.5], [N.G5, 2],
    [N.E5, 0.5], [N.G5, 0.5], [N.C6, 1], [N.B5, 1.5], [N.A5, 0.5], [N.A5, 1], [N.G5, 2],
  ]
  let at = t0
  for (const [f, beats] of tune) {
    flute(o, at, f, beats * beat * 0.92, 0.2)
    at += beats * beat
  }
  return at - t0 + 0.25
}

/** One frog: "rib-bit" as fast buzzy pulses of a filtered sawtooth. */
function ribbit(o: Out, at: number, pitch: number, peak: number): number {
  const syllables: [number, number][] = [[pitch, 6], [pitch * 1.25, 5]]
  let t = at
  for (const [f, pulses] of syllables) {
    const osc = o.ctx.createOscillator()
    const bp = o.ctx.createBiquadFilter()
    const g = o.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(f, t)
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(f * 5, t)
    bp.Q.setValueAtTime(1.4, t)
    g.gain.setValueAtTime(SILENT, t)
    for (let k = 0; k < pulses; k++) {
      const p = t + k * 0.024
      g.gain.setValueAtTime(SILENT, p)
      g.gain.linearRampToValueAtTime(peak, p + 0.003)
      g.gain.setValueAtTime(peak, p + 0.01)
      g.gain.exponentialRampToValueAtTime(SILENT, p + 0.023)
    }
    osc.connect(bp).connect(g).connect(o.dest)
    osc.start(t)
    osc.stop(t + pulses * 0.024 + 0.05)
    t += pulses * 0.024 + 0.06
  }
  return t - at
}

const frogChorus: Player = (o, t0) => {
  const frogs: [at: number, pitch: number, peak: number][] = [
    [0, 110, 0.5], [0.45, 150, 0.4], [0.9, 110, 0.5], [1.25, 210, 0.3], [1.55, 85, 0.6], [1.95, 150, 0.4],
  ]
  let end = 0
  for (const [at, pitch, peak] of frogs) end = Math.max(end, at + ribbit(o, t0 + at, pitch, peak))
  return end
}

const cuckoo: Player = (o, t0) => {
  for (let i = 0; i < 3; i++) {
    const at = t0 + i * 0.75
    tone(o, at, N.G5, 0.22, 0.22, 'triangle', 0.01)
    tone(o, at + 0.24, N.Eb5, 0.4, 0.22, 'triangle', 0.01)
    tone(o, at, N.G5 * 2, 0.12, 0.03)
  }
  return 2 * 0.75 + 0.24 + 0.4
}

const slideWhistle: Player = (o, t0) => {
  const a = glide(o, t0, [[450, 0], [1700, 0.55], [1700, 0.65], [380, 1.15]], 0.18, 'sine', 6)
  const b = glide(o, t0 + a + 0.15, [[500, 0], [1500, 0.3]], 0.16, 'sine', 6)
  return a + 0.15 + b + 0.05
}

const robot: Player = (o, t0) => {
  const bleeps = [N.C5, N.G5, N.E5, N.C6, N.G4, N.A5, N.E5 * 1.06, N.E6]
  bleeps.forEach((f, i) => tone(o, t0 + i * 0.12, f, 0.09, 0.07, 'square', 0.002))
  const at = t0 + bleeps.length * 0.12 + 0.1
  const up = glide(o, at, [[300, 0], [900, 0.25]], 0.16, 'sine')
  const down = glide(o, at + up + 0.08, [[900, 0], [280, 0.25]], 0.16, 'sine')
  return at - t0 + up + 0.08 + down + 0.05
}

const birdsong: Player = (o, t0) => {
  let at = t0
  const chirp = (f0: number, f1: number, len: number, peak = 0.12) => { glide(o, at, [[f0, 0], [f1, len]], peak) }
  for (let i = 0; i < 3; i++) { chirp(2800, 4200, 0.05); at += 0.09 }
  at += 0.2
  chirp(3600, 2400, 0.3, 0.1); at += 0.4
  for (let i = 0; i < 6; i++) { chirp(3400, 3900, 0.03, 0.09); at += 0.05 }
  at += 0.22
  chirp(3000, 3600, 0.1); at += 0.16
  chirp(3000, 3700, 0.12); at += 0.2
  return at - t0
}

const xylophone: Player = (o, t0) => {
  const bar = (at: number, f: number, peak = 0.22) => {
    tone(o, at, f, 0.45, peak)
    tone(o, at, f * 3.93, 0.07, peak * 0.25)
  }
  const run = [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6]
  run.forEach((f, i) => bar(t0 + i * 0.12, f))
  // Ta-da: a rolled chord, struck fast and fading.
  const start = t0 + run.length * 0.12 + 0.08
  for (let k = 0; k < 10; k++) {
    const peak = 0.16 * (1 - k / 12)
    ;[N.C6, N.E6, N.G6].forEach((f, j) => bar(start + k * 0.065 + j * 0.012, f, peak))
  }
  return start - t0 + 9 * 0.065 + 0.5
}

export const PLAYERS: Record<RingtoneId, Player> = {
  'music-box': musicBox,
  'wind-chimes': windChimes,
  harp,
  kalimba,
  westminster,
  lullaby,
  'frog-chorus': frogChorus,
  cuckoo,
  'slide-whistle': slideWhistle,
  robot,
  birdsong,
  xylophone,
}

// ---- Playback -------------------------------------------------------------

let shared: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    if (!shared) {
      const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
      const Ctx = g.AudioContext ?? g.webkitAudioContext
      if (!Ctx) return null
      shared = new Ctx()
    }
    // The wall's Chromium policy allows autoplay (infra/wall-kiosk); on any
    // other browser this only works after a tap, which is fine for previews.
    if (shared.state === 'suspended') void shared.resume().catch(() => undefined)
    return shared
  } catch {
    return null
  }
}

/** Overall loudness through the EMEET. The players keep their own peaks low. */
const VOLUME = 0.9

/**
 * Per-tone gain so every ringtone rings about equally loud (~-16 dB RMS)
 * without clipping. Measured by rendering each one in Chromium's
 * OfflineAudioContext (2026-11-17); a tone limited by its peaks (frogs,
 * bells, harp) sits a little under the target. Re-measure if a player changes.
 */
export const LOUDNESS: Record<RingtoneId, number> = {
  'music-box': 3,
  'wind-chimes': 3.5,
  harp: 2.4,
  kalimba: 2.3,
  westminster: 4.2,
  lullaby: 1.7,
  'frog-chorus': 2.1,
  cuckoo: 4,
  'slide-whistle': 1.6,
  robot: 3.2,
  birdsong: 3, // held below target: 3–4 kHz chirps get shrill
  xylophone: 2.1,
}

export interface Playback {
  /** How long one pass lasts, in seconds. */
  seconds: number
  stop: () => void
}

/** Play one pass of a ringtone. Silent (and harmless) where audio is blocked. */
export function playRingtone(id: RingtoneId, ctx: AudioContext | null = audioContext()): Playback {
  if (!ctx) return { seconds: 0, stop: () => undefined }
  try {
    const tone = asRingtone(id)
    const master = ctx.createGain()
    master.gain.setValueAtTime(VOLUME * LOUDNESS[tone], ctx.currentTime)
    master.connect(ctx.destination)
    const seconds = PLAYERS[tone]({ ctx, dest: master }, ctx.currentTime + 0.03)
    let stopped = false
    return {
      seconds,
      stop: () => {
        if (stopped) return
        stopped = true
        try {
          const now = ctx.currentTime
          master.gain.cancelScheduledValues(now)
          master.gain.setValueAtTime(master.gain.value, now)
          master.gain.linearRampToValueAtTime(0, now + 0.08)
          setTimeout(() => { try { master.disconnect() } catch { /* already gone */ } }, 200)
        } catch { /* context closed */ }
      },
    }
  } catch {
    return { seconds: 0, stop: () => undefined }
  }
}

/** Gap between passes, like a phone's ring-pause. */
export const RING_GAP_MS = 2_000

/** Ring over and over until the returned function is called. */
export function startRinging(id: RingtoneId): () => void {
  let current: Playback | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const pass = () => {
    if (stopped) return
    current = playRingtone(id)
    // Silent context (blocked audio): try again later rather than spin.
    const ms = current.seconds > 0 ? current.seconds * 1000 + RING_GAP_MS : 4_000
    timer = setTimeout(pass, ms)
  }
  pass()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    current?.stop()
  }
}
