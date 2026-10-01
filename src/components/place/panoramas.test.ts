import { describe, it, expect } from 'vitest'
import { PANORAMAS, WOODBLOCK, sceneryArt, hasStyleArt } from './panoramas'

// The woodblock set arrives a place and a light at a time (2026-10-01). A
// missing print must fall back to the WHOLE painted scene — never a woodblock
// sky over a painted landscape or the reverse.
describe('scenery style resolution', () => {
  it('draws the woodblock print, with its own sky, where one exists', () => {
    const { art, style } = sceneryArt('woodblock', 'mountain-town', 'daytime')
    expect(style).toBe('woodblock')
    expect(art).toBe(WOODBLOCK['mountain-town']!.daytime)
    expect(art.sky).toBeTruthy()
  })

  it('falls back to the painted scene for a light the print has not reached', () => {
    const { art, style } = sceneryArt('woodblock', 'mountain-town', 'nighttime')
    expect(style).toBe('painted')
    expect(art).toBe(PANORAMAS['mountain-town'].nighttime)
    expect(art.sky).toBeUndefined()
  })

  it('falls back to the painted scene for a place with no prints yet', () => {
    expect(sceneryArt('woodblock', 'farm', 'daytime')).toEqual({ art: PANORAMAS.farm.daytime, style: 'painted' })
    expect(hasStyleArt('woodblock', 'farm')).toBe(false)
    expect(hasStyleArt('woodblock', 'mountain-town')).toBe(true)
  })

  it('leaves the painted style exactly as it was', () => {
    expect(sceneryArt('painted', 'mountain-town', 'daytime')).toEqual({ art: PANORAMAS['mountain-town'].daytime, style: 'painted' })
  })
})
