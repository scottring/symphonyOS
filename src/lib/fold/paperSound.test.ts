import { describe, it, expect, vi, afterEach } from 'vitest'
import { paperSound } from '@/lib/fold/paperSound'

afterEach(() => vi.restoreAllMocks())

describe('paperSound', () => {
  it('is silent and safe without AudioContext', () => {
    expect((window as unknown as { AudioContext?: unknown }).AudioContext).toBeUndefined()
    expect(() => {
      paperSound.swish()
      paperSound.crinkle()
      paperSound.crinkle(3, 0.08, 0.7)
      paperSound.land()
      paperSound.pencil()
      paperSound.stamp()
    }).not.toThrow()
  })
  it('setOn persists and tolerates throwing storage', () => {
    paperSound.setOn(false)
    expect(localStorage.getItem('symphony-paper-sound')).toBe('off')
    expect(paperSound.on).toBe(false)
    paperSound.setOn(true)
    expect(localStorage.getItem('symphony-paper-sound')).toBe('on')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => paperSound.setOn(false)).not.toThrow()
    expect(paperSound.on).toBe(false)
    expect(() => paperSound.land()).not.toThrow()
  })
})
