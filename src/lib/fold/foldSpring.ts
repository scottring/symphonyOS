// Scott, 2026-11-04: paper-style horizons. Spring that drives the folded sheet
// (0 = folded, 1 = open). Pure math so the component only has to call it per frame.

export interface SpringState {
  p: number
  v: number
}

const K = 170
const C = 2 * Math.sqrt(K) * 0.78

export function springStep(s: SpringState, target: 0 | 1, dt: number): SpringState {
  const d = Math.min(0.032, dt)
  const a = K * (target - s.p) - C * s.v
  const v = s.v + a * d
  return { p: s.p + v * d, v }
}

export function springSettled(s: SpringState, target: 0 | 1): boolean {
  return Math.abs(target - s.p) < 0.0006 && Math.abs(s.v) < 0.002
}

/** Where a released drag should land: open when the projected position passes halfway. */
export function releaseTarget(p: number, v: number): 0 | 1 {
  return p + v * 0.12 > 0.5 ? 1 : 0
}
