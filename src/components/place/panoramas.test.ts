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
  it('follows your place by default, in the chosen style and light', () => {
    expect(backgroundArt('place', 'woodblock', 'farm', 'nighttime')).toBe(WOODBLOCK.farm.nighttime)
    expect(backgroundArt('place', 'painted', 'cabin', 'daytime')).toBe(PANORAMAS.cabin.daytime)
  })

  it("draws another place's scene without changing the place", () => {
    expect(backgroundArt('urban', 'painted', 'cabin', 'dusk-dawn')).toBe(PANORAMAS.urban['dusk-dawn'])
  })

  it('shows a print the same in every style and light', () => {
    for (const style of ['painted', 'woodblock'] as const) {
      for (const light of LIGHTS) expect(backgroundArt('train-yard', style, 'farm', light)).toBe(PRINTS['train-yard'])
    }
    expect(PRINTS['train-yard'].veil).not.toBe(PRINTS['train-yard'].src)
  })
})
