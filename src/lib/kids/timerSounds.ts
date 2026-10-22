// The sound a kid's timer ends with, made in the browser (Web Audio), so
// there are no files to load and nothing to fail on a tablet offline. Each
// plays for about three seconds. A tablet only plays sound after a tap, so
// the shell calls unlockAudio() on the tap that starts a timer.

export type TimerSound = 'chimes' | 'birds' | 'bell' | 'drums'

export const TIMER_SOUNDS: { id: TimerSound; label: string }[] = [
  { id: 'chimes', label: 'Wind chimes' },
  { id: 'birds', label: 'Birdsong' },
  { id: 'bell', label: 'Gentle bell' },
  { id: 'drums', label: 'Drum roll' },
]

export function asTimerSound(v: unknown): TimerSound {
  return TIMER_SOUNDS.some((s) => s.id === v) ? (v as TimerSound) : 'chimes'
}

type Ctx = AudioContext
let ctx: Ctx | null = null

function audio(): Ctx | null {
  if (ctx) return ctx
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try { ctx = new AC() } catch { ctx = null }
  return ctx
}

/** Call from a tap: a tablet keeps audio locked until the person touches it. */
export function unlockAudio(): void {
  const c = audio()
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined)
}

function tone(c: Ctx, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(c.destination)
  o.start(at)
  o.stop(at + dur + 0.05)
}

function chimes(c: Ctx, t0: number) {
  // A pentatonic handful, struck at loose intervals like wind.
  const notes = [1046.5, 1174.7, 1396.9, 1568, 1760, 2093]
  let at = t0
  for (let i = 0; i < 12; i++) {
    const f = notes[(i * 7 + 3) % notes.length]
    tone(c, at, f, 1.8, 0.12)
    tone(c, at, f * 2.76, 0.8, 0.03)
    at += 0.16 + ((i * 37) % 9) * 0.03
  }
}

function birds(c: Ctx, t0: number) {
  // Quick rising chirps in three phrases.
  for (let phrase = 0; phrase < 3; phrase++) {
    for (let i = 0; i < 4; i++) {
      const at = t0 + phrase * 0.9 + i * 0.13
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(2400 + phrase * 300, at)
      o.frequency.exponentialRampToValueAtTime(4200 + phrase * 200, at + 0.08)
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
      o.connect(g).connect(c.destination)
      o.start(at)
      o.stop(at + 0.12)
    }
  }
}

function bell(c: Ctx, t0: number) {
  // Two soft strikes, each a fundamental and a few bell partials.
  for (const at of [t0, t0 + 1.4]) {
    tone(c, at, 523.25, 2.6, 0.18)
    tone(c, at, 523.25 * 2.0, 1.8, 0.06)
    tone(c, at, 523.25 * 2.76, 1.2, 0.04)
    tone(c, at, 523.25 * 5.4, 0.6, 0.015)
  }
}

function drums(c: Ctx, t0: number) {
  // A snare roll that speeds up, then one big hit.
  const len = Math.floor(c.sampleRate * 0.08)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  let at = t0
  let gap = 0.12
  while (at < t0 + 2.2) {
    const src = c.createBufferSource()
    const g = c.createGain()
    src.buffer = buf
    g.gain.setValueAtTime(0.08 + (at - t0) * 0.05, at)
    src.connect(g).connect(c.destination)
    src.start(at)
    at += gap
    gap = Math.max(0.035, gap * 0.93)
  }
  tone(c, at + 0.05, 110, 0.9, 0.5, 'triangle')
  tone(c, at + 0.05, 220, 0.5, 0.2, 'sine')
}

export function playTimerSound(sound: TimerSound): void {
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
  const t0 = c.currentTime + 0.05
  if (sound === 'chimes') chimes(c, t0)
  else if (sound === 'birds') birds(c, t0)
  else if (sound === 'bell') bell(c, t0)
  else drums(c, t0)
}
