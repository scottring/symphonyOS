import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachSceneryVeil, veilProgress, SCENERY_VEIL_DISTANCE } from './sceneryVeil'

describe('veilProgress', () => {
  it('is 0 at the top, rises with scroll, and holds at 1 past the distance', () => {
    expect(SCENERY_VEIL_DISTANCE).toBe(150)
    expect(veilProgress(0)).toBe(0)
    expect(veilProgress(75)).toBeCloseTo(0.5)
    expect(veilProgress(150)).toBe(1)
    expect(veilProgress(1800)).toBe(1)
  })

  it('treats overscroll bounce and junk as the top', () => {
    expect(veilProgress(-40)).toBe(0)
    expect(veilProgress(Number.NaN)).toBe(0)
    expect(veilProgress(50, 0)).toBe(0)
  })
})

describe('attachSceneryVeil', () => {
  let frames: FrameRequestCallback[]
  const flush = () => { const run = frames; frames = []; run.forEach((f) => f(0)) }

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  afterEach(() => { vi.unstubAllGlobals() })

  function setup(scrollTop = 0) {
    const scroller = document.createElement('div')
    const target = document.createElement('div')
    Object.defineProperty(scroller, 'scrollTop', { value: scrollTop, writable: true, configurable: true })
    return { scroller, target, progress: () => target.style.getPropertyValue('--scenery-progress') }
  }

  it('starts from where the page already is (a restored scroll position)', () => {
    const { scroller, target, progress } = setup(300)
    attachSceneryVeil(scroller, target)
    expect(progress()).toBe('1')
  })

  it('follows the scroller, writing once a frame however many scroll events arrive', () => {
    const { scroller, target, progress } = setup()
    const setProperty = vi.spyOn(target.style, 'setProperty')
    attachSceneryVeil(scroller, target)
    expect(progress()).toBe('0')
    setProperty.mockClear()

    for (const top of [20, 40, 60, 75]) {
      scroller.scrollTop = top
      scroller.dispatchEvent(new Event('scroll'))
    }
    expect(frames).toHaveLength(1)
    flush()
    expect(setProperty).toHaveBeenCalledTimes(1)
    expect(progress()).toBe('0.5')

    scroller.scrollTop = 180
    scroller.dispatchEvent(new Event('scroll'))
    flush()
    expect(progress()).toBe('1')
  })

  it('stops listening and clears the value on cleanup', () => {
    const { scroller, target, progress } = setup()
    const detach = attachSceneryVeil(scroller, target)
    detach()
    expect(progress()).toBe('')
    scroller.scrollTop = 120
    scroller.dispatchEvent(new Event('scroll'))
    expect(frames).toHaveLength(0)
    expect(progress()).toBe('')
  })
})
