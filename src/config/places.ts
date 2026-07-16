// src/config/places.ts
//
// Place themes: five illustrated worlds, each a sidebar medallion plus an
// accent-deep re-tint of the app (primary/accent hues shift; the warm paper
// neutrals stay put so every place stays calm and readable). The CSS lives
// in index.css under [data-place=...]; this file is the single source of
// truth for ids and copy. Woodsy Cabin is the default and maps to Nordic
// Journal's own teal-forest + terracotta — zero overrides.

export type PlaceId = 'urban' | 'small-city' | 'mountain-town' | 'cabin' | 'farm'

export interface Place {
  id: PlaceId
  name: string
  /** One line under the name in the picker. */
  tagline: string
  /** Swatch pair for the picker chips (primary-500, accent-400 of the place). */
  swatch: [string, string]
}

export const PLACES: Place[] = [
  {
    id: 'urban',
    name: 'Densely Urban',
    tagline: 'Steel, glass, and the late train home.',
    swatch: ['hsl(218 38% 30%)', 'hsl(38 55% 55%)'],
  },
  {
    id: 'small-city',
    name: 'Small City',
    tagline: 'A river, a clock tower, dusk coming on.',
    swatch: ['hsl(262 36% 30%)', 'hsl(345 45% 55%)'],
  },
  {
    id: 'mountain-town',
    name: 'Small Mountain Town',
    tagline: 'One road in, peaks over every rooftop.',
    swatch: ['hsl(210 45% 30%)', 'hsl(28 55% 55%)'],
  },
  {
    id: 'cabin',
    name: 'Woodsy Cabin',
    tagline: 'Pines, a stream, smoke from the chimney.',
    swatch: ['hsl(168 45% 30%)', 'hsl(18 50% 55%)'],
  },
  {
    id: 'farm',
    name: 'Farm',
    tagline: 'Barn red, wheat gold, rows to the horizon.',
    swatch: ['hsl(10 48% 32%)', 'hsl(44 55% 52%)'],
  },
]

export const DEFAULT_PLACE: PlaceId = 'cabin'

export function isPlaceId(v: unknown): v is PlaceId {
  return typeof v === 'string' && PLACES.some((p) => p.id === v)
}
