// Scott, 2026-11-04: paper-style horizons. Chooses the fold layout (horizontal,
// vertical on phones, or Duo split) and sizes the two sheets.

export type FoldMode = 'h' | 'v' | 'duo'

export function detectFoldMode(i: {
  width: number
  height: number
  coarse: boolean
  segments: boolean
}): FoldMode {
  const ratio = i.height / i.width
  if (i.segments) return 'duo'
  if (i.coarse && i.width >= 560 && i.width <= 900 && ratio >= 1.2 && ratio <= 1.65) return 'duo'
  return i.width < 760 ? 'v' : 'h'
}

export function foldSizes(
  mode: FoldMode,
  spreadWidth: number,
  viewportHeight: number,
): { above: number; current: number; edge: number; maxAboveHeight: number } {
  if (mode === 'v') {
    return {
      above: spreadWidth,
      current: spreadWidth,
      edge: 46,
      maxAboveHeight: Math.round(0.62 * viewportHeight),
    }
  }
  if (mode === 'duo') {
    const above = Math.round(0.38 * spreadWidth)
    return { above, current: spreadWidth - above, edge: 22, maxAboveHeight: viewportHeight }
  }
  const above = Math.round(Math.min(340, Math.max(220, 0.36 * spreadWidth)))
  return {
    above,
    current: Math.min(560, spreadWidth - above),
    edge: 34,
    maxAboveHeight: viewportHeight,
  }
}
