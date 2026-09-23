// src/config/places.ts
//
// Place themes: five illustrated worlds. "Your place" is THE theme: each
// place tints selected tabs, primary actions, links and small highlights with
// a colour drawn from its illustration. The neutral page, ink text and
// life-area colours never change. The CSS lives in index.css under
// [data-place=...]; this file is the single source of truth for ids and copy.
// Woodsy Cabin (forest green) is the default and needs no override.

export type PlaceId = 'urban' | 'small-city' | 'mountain-town' | 'cabin' | 'farm'

export interface Place {
  id: PlaceId
  name: string
  /** One line under the name in the picker. */
  tagline: string
  /** The place's accent (its primary-500), shown in the picker. */
  swatch: string
}

export const PLACES: Place[] = [
  {
    id: 'urban',
    name: 'Densely Urban',
    tagline: 'Steel, glass, and the late train home.',
    swatch: 'hsl(215 30% 36%)', // slate blue
  },
  {
    id: 'small-city',
    name: 'Small City',
    tagline: 'A river, a clock tower, dusk coming on.',
    swatch: 'hsl(315 28% 34%)', // plum
  },
  {
    id: 'mountain-town',
    name: 'Small Mountain Town',
    tagline: 'One road in, peaks over every rooftop.',
    swatch: 'hsl(203 52% 34%)', // alpine blue
  },
  {
    id: 'cabin',
    name: 'Woodsy Cabin',
    tagline: 'Pines, a stream, smoke from the chimney.',
    swatch: 'hsl(150 34% 30%)', // forest green
  },
  {
    id: 'farm',
    name: 'Farm',
    tagline: 'Barn red, wheat gold, rows to the horizon.',
    swatch: 'hsl(6 52% 38%)', // barn red
  },
]

export const DEFAULT_PLACE: PlaceId = 'cabin'

export function isPlaceId(v: unknown): v is PlaceId {
  return typeof v === 'string' && PLACES.some((p) => p.id === v)
}
