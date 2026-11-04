// Scott, 2026-11-04: paper-style horizons. Paper sounds made on the fly with Web Audio
// (no audio files). Ported from the prototype's Sound object. The AudioContext is
// created lazily on the first sound call, which always comes from a user gesture.
// Safe without Web Audio and with storage that throws.

const KEY = 'symphony-paper-sound'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let master: GainNode | null = null
let on = true
try {
  on = localStorage.getItem(KEY) !== 'off'
} catch {
  /* default on */
}

function ready(): boolean {
  if (!on) return false
  if (!ctx) {
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
      }
      const Ctor = w.AudioContext || w.webkitAudioContext
      if (!Ctor) return false
      const c = new Ctor()
      const len = c.sampleRate
      const buf = c.createBuffer(1, len, c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      const m = c.createGain()
      m.gain.value = 0.9
      m.connect(c.destination)
      ctx = c
      noise = buf
      master = m
    } catch {
      ctx = null
      return false
    }
  }
  try {
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* ignore */
  }
  return true
}

function grain(t: number, gain: number, freq: number, dur: number) {
  const c = ctx!
  const s = c.createBufferSource()
  s.buffer = noise
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 0.8 + Math.random() * 1.6
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.0025)
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur)
  s.connect(bp).connect(g).connect(master!)
  s.start(t, Math.random() * 0.85, dur + 0.03)
}

function safe(fn: () => void) {
  try {
    if (ready()) fn()
  } catch {
    /* sound is optional */
  }
}

export const paperSound = {
  get on() {
    return on
  },
  setOn(v: boolean) {
    on = v
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off')
    } catch {
      /* ignore */
    }
  },
  crinkle(n = 6, over = 0.26, level = 1) {
    safe(() => {
      const t0 = ctx!.currentTime + 0.005
      for (let i = 0; i < n; i++) {
        const t = t0 + Math.pow(Math.random(), 1.4) * over
        grain(t, (0.035 + Math.random() * 0.11) * level, 1700 + Math.random() * 4200, 0.012 + Math.random() * 0.035)
      }
    })
  },
  swish(dur = 0.32, level = 1) {
    safe(() => {
      const c = ctx!
      const t = c.currentTime + 0.005
      const s = c.createBufferSource()
      s.buffer = noise
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 0.7
      bp.frequency.setValueAtTime(500, t)
      bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.7)
      const g = c.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.075 * level, t + dur * 0.35)
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur)
      s.connect(bp).connect(g).connect(master!)
      s.start(t, Math.random() * 0.5, dur + 0.05)
    })
  },
  land(level = 1) {
    safe(() => {
      const c = ctx!
      const t = c.currentTime + 0.003
      const s = c.createBufferSource()
      s.buffer = noise
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 520
      const g = c.createGain()
      g.gain.setValueAtTime(0.22 * level, t)
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07)
      s.connect(lp).connect(g).connect(master!)
      s.start(t, Math.random() * 0.5, 0.1)
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(120, t)
      o.frequency.exponentialRampToValueAtTime(62, t + 0.09)
      const og = c.createGain()
      og.gain.setValueAtTime(0.11 * level, t)
      og.gain.exponentialRampToValueAtTime(0.0005, t + 0.11)
      o.connect(og).connect(master!)
      o.start(t)
      o.stop(t + 0.13)
      for (let i = 0; i < 3; i++) grain(t + 0.01 + Math.random() * 0.05, 0.04 * level, 2500 + Math.random() * 2500, 0.02)
    })
  },
  pencil() {
    safe(() => {
      const c = ctx!
      const t = c.currentTime + 0.003
      for (let i = 0; i < 2; i++) {
        const s = c.createBufferSource()
        s.buffer = noise
        const hp = c.createBiquadFilter()
        hp.type = 'bandpass'
        hp.frequency.value = 3200 + i * 1600
        hp.Q.value = 1.4
        const g = c.createGain()
        const tt = t + i * 0.055
        g.gain.setValueAtTime(0, tt)
        g.gain.linearRampToValueAtTime(0.12, tt + 0.004)
        g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.045)
        s.connect(hp).connect(g).connect(master!)
        s.start(tt, Math.random() * 0.8, 0.06)
      }
    })
  },
}
