import { describe, it, expect } from 'vitest'
import { PLACES } from '@/config/places'
import { PANORAMAS, PRINTS, WOODBLOCK, backgroundArt, sceneryArt } from './panoramas'

const LIGHTS = ['daytime', 'dusk-dawn', 'nighttime'] as const

describe('scenery style resolution', () => {
  it('draws a woodblock print for every place in every light', () => {
    for (const { id } of PLACES) {
      for (const light of LIGHTS) {
        const art = sceneryArt('woodblock', id, light)
        expect(art).toBe(WOODBLOCK[id][light])
        expect(art.src).not.toBe(PANORAMAS[id][light].src)
        expect(art.veil).not.toBe(art.src)
        // The mountain overlook (2026-10-30) stands taller than the cut
        // prints, so its skyline sits higher in the band.
        expect(art.skyline).toBeGreaterThan(id === 'mountain-town' ? 0.3 : 0.6)
        expect(art.skyline).toBeLessThan(0.7)
      }
    }
  })

  it('shows the mountain overlook in every light', () => {
    const day = sceneryArt('woodblock', 'mountain-town', 'daytime')
    expect(sceneryArt('woodblock', 'mountain-town', 'dusk-dawn')).toBe(day)
    expect(sceneryArt('woodblock', 'mountain-town', 'nighttime')).toBe(day)
  })

  it('leaves the painted style exactly as it was', () => {
    for (const { id } of PLACES) {
      for (const light of LIGHTS) expect(sceneryArt('painted', id, light)).toBe(PANORAMAS[id][light])
    }
  })
})

describe('chosen background', () => {
  it('offers only the mountain overlook and the train yard', () => {
    expect(Object.keys(PRINTS).sort()).toEqual(['overlook', 'train-yard'])
    expect(backgroundArt('overlook')).toBe(WOODBLOCK['mountain-town'].daytime)
    expect(backgroundArt('train-yard')).toBe(PRINTS['train-yard'])
    expect(PRINTS['train-yard'].veil).not.toBe(PRINTS['train-yard'].src)
  })

  it('stands the trains high in the band, below a feathered top', () => {
    // The middle of the print: trains from near the top, no wires above them.
    expect(PRINTS['train-yard'].skyline).toBeGreaterThan(0.05)
    expect(PRINTS['train-yard'].skyline).toBeLessThan(0.3)
  })
})
