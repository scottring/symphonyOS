// src/components/planning/guided/altitude.ts
//
// Pure camera math for the guided-session descent (kept out of
// GuidedScene.tsx so that file only exports a component — react-refresh).

export type SceneHorizon = 'annual' | 'seasonal' | 'monthly' | 'weekly' | 'daily'

/** Camera travel per horizon: [start, end] offsets in vh into the 340vh world. */
const CAMERA: Record<SceneHorizon, [number, number]> = {
  annual: [0, 205],
  seasonal: [40, 165],
  monthly: [90, 180],
  weekly: [120, 195],
  daily: [172, 205],
}

/** Where a camera offset IS, in trail language — the altimeter's big word. */
export function placeAt(horizon: SceneHorizon, progress: number): { place: string; sub: string } {
  const [a, b] = CAMERA[horizon]
  const y = a + (b - a) * Math.min(1, Math.max(0, progress))
  const place =
    y < 25 ? 'The summit'
    : y < 70 ? 'The high ridge'
    : y < 115 ? 'The switchbacks'
    : y < 150 ? 'The meadow'
    : y < 188 ? 'The valley'
    : 'Home'
  const SUB: Record<SceneHorizon, string> = {
    annual: 'year altitude', seasonal: 'season altitude', monthly: 'month altitude',
    weekly: 'week altitude', daily: 'today',
  }
  return { place, sub: SUB[horizon] }
}

export function cameraOffset(horizon: SceneHorizon, progress: number): number {
  const [a, b] = CAMERA[horizon]
  return a + (b - a) * Math.min(1, Math.max(0, progress))
}
