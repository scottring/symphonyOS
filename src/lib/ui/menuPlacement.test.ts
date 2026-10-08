import { describe, it, expect } from 'vitest'
import { placeMenu } from './menuPlacement'

const btn = (left: number, top: number, w = 120, h = 20) => ({ left, right: left + w, top, bottom: top + h })

describe('placeMenu — measured, inside the viewport', () => {
  it('sits under its button, left-aligned, when there is room', () => {
    expect(placeMenu(btn(100, 100), { width: 400, height: 200 }, { width: 1440, height: 900 })).toEqual({ top: 124, left: 100, maxHeight: 768 })
  })
  it('slides left to keep its right edge on screen', () => {
    expect(placeMenu(btn(1300, 100), { width: 400, height: 200 }, { width: 1440, height: 900 }).left).toBe(1440 - 400 - 8)
  })
  it('on a phone a menu wider than the screen is held to the screen, 8px each side', () => {
    const p = placeMenu(btn(250, 100), { width: 480, height: 200 }, { width: 390, height: 844 })
    expect(p.left).toBe(8)
  })
  it('opens upward when below is too short and above has more room, never past the top', () => {
    const p = placeMenu(btn(100, 800), { width: 300, height: 300 }, { width: 1440, height: 900 })
    expect(p.top).toBe(800 - 4 - 300)
    const tall = placeMenu(btn(100, 500), { width: 300, height: 2000 }, { width: 1440, height: 900 })
    expect(tall.top).toBeGreaterThanOrEqual(8)
    expect(tall.maxHeight).toBe(500 - 4 - 8)
  })
  it('end-aligned (a ⋯ menu): its right edge under the button’s, clamped likewise', () => {
    expect(placeMenu(btn(1000, 100, 32), { width: 300, height: 100 }, { width: 1440, height: 900 }, 'end').left).toBe(1032 - 300)
    expect(placeMenu(btn(20, 100, 32), { width: 300, height: 100 }, { width: 390, height: 844 }, 'end').left).toBe(8)
  })
})
