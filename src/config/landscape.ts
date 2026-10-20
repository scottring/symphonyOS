// src/config/landscape.ts
//
// The Landscape look (stage 2, design approved 2026-10-20): one style — a
// soft sky over rounded hills, Fraunces titles, rounder pieces — with colour
// palettes as the theme, in place of the place themes' different artworks.
// It sits behind a switch (Settings → The look: Classic or Landscape) so the
// Classic look and its places stay exactly as they were. The CSS lives in
// src/styles/landscape.css under :root[data-look='landscape'][data-palette].

export type Look = 'classic' | 'landscape'

export type PaletteId = 'dusk' | 'dawn' | 'clear' | 'forest' | 'coast' | 'night'

export interface Palette {
  id: PaletteId
  name: string
  /** Sky, top to horizon. */
  sky: [string, string, string]
  /** Hills, far to near. */
  hills: [string, string, string]
  /** The ground the page stands on. */
  ground: string
  /** The small figure on the near hill. */
  figure: string
  /** Which existing lighting the palette reads as (night flips the page dark). */
  lighting: 'daytime' | 'dusk-dawn' | 'nighttime'
}

export const PALETTES: Palette[] = [
  { id: 'dusk', name: 'Dusk', sky: ['#5b6aa6', '#d99ab0', '#f8cfae'], hills: ['#b590ad', '#8f7aa3', '#6a648f'], ground: '#f8efe9', figure: '#4b4d78', lighting: 'dusk-dawn' },
  { id: 'dawn', name: 'Dawn', sky: ['#86a9c8', '#f0c3b6', '#fde6c6'], hills: ['#e5b5a6', '#c4958c', '#9a7477'], ground: '#fbf2ea', figure: '#6b4f5c', lighting: 'dusk-dawn' },
  { id: 'clear', name: 'Clear day', sky: ['#3d86c6', '#8cc2e8', '#e2f1f7'], hills: ['#a5d29d', '#73b17e', '#438c66'], ground: '#f3f7f2', figure: '#2a5d86', lighting: 'daytime' },
  { id: 'forest', name: 'Forest', sky: ['#4b7666', '#a7c3a0', '#ebefd9'], hills: ['#86a985', '#5d8668', '#3a5e4b'], ground: '#f2f2e8', figure: '#2f4a3e', lighting: 'daytime' },
  { id: 'coast', name: 'Coast', sky: ['#2c6d8d', '#7cbfc8', '#e6f4ef'], hills: ['#a2d5cf', '#5fa8b2', '#2c7a8c'], ground: '#f1f6f4', figure: '#1f4f66', lighting: 'daytime' },
  { id: 'night', name: 'Night', sky: ['#1e2446', '#3b4479', '#76699a'], hills: ['#4a4d78', '#383b64', '#2a2c4e'], ground: '#23253d', figure: '#cdb98a', lighting: 'nighttime' },
]

export const DEFAULT_PALETTE: PaletteId = 'dusk'

export function isPaletteId(v: unknown): v is PaletteId {
  return typeof v === 'string' && PALETTES.some((p) => p.id === v)
}

export function paletteById(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}
