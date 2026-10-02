import { describe, it, expect } from 'vitest'
import { PLACES } from '@/config/places'
import { PANORAMAS, WOODBLOCK, sceneryArt } from './panoramas'

const LIGHTS = ['daytime', 'dusk-dawn', 'nighttime'] as const

describe('scenery style resolution', () => {
  it('draws a woodblock print for every place in every light', () => {
    for (const { id } of PLACES) {
      for (const light of LIGHTS) {
        const art = sceneryArt('woodblock', id, light)
        expect(art).toBe(WOODBLOCK[id][light])
        expect(art.src).not.toBe(PANORAMAS[id][light].src)
        expect(art.veil).not.toBe(art.src)
        expect(art.skyline).toBeGreaterThan(0.6)
        expect(art.skyline).toBeLessThan(0.7)
      }
    }
  })

  it('leaves the painted style exactly as it was', () => {
    for (const { id } of PLACES) {
      for (const light of LIGHTS) expect(sceneryArt('painted', id, light)).toBe(PANORAMAS[id][light])
    }
  })
})
