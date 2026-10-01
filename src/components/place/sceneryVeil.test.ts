import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachSceneryVeil, contentProgress, cornerRise, veilProgress, SCENERY_CONTENT_EVENT, SCENERY_VEIL_DISTANCE } from './sceneryVeil'

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

describe('contentProgress', () => {
  it('is 0 while the content ends above the scene, and 1 once it runs well into it', () => {
    expect(contentProgress(500, 600)).toBe(0)
    expect(contentProgress(600, 600)).toBe(0)
    expect(contentProgress(648, 600)).toBeCloseTo(0.5)
    expect(contentProgress(2000, 600)).toBe(1)
  })
})

describe('cornerRise', () => {
  it('stands full height at the outer edge and settles to nothing toward the middle', () => {
    expect(cornerRise(0)).toBe(1)
    expect(cornerRise(0.5)).toBe(1)
    const mid = cornerRise(0.75)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(cornerRise(0.9)).toBeLessThan(mid)
    expect(cornerRise(1)).toBe(0)
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

  const rect = (left: number, top: number, right: number, bottom: number) =>
    () => ({ left, top, right, bottom, width: right - left, height: bottom - top } as DOMRect)

  // A 1440-wide window: the scene stands 840 → 570 at the corners (370 wide),
  // with a 40px ground strip between them; the content column runs 200–1240.
  function withContent(bottom: number) {
    const { scroller, target, progress } = setup()
    const content = document.createElement('div')
    content.setAttribute('data-scenery-content', '')
    content.getBoundingClientRect = rect(200, 100, 1240, bottom)
    const row = document.createElement('div')
    row.getBoundingClientRect = rect(200, 100, 1240, bottom)
    content.appendChild(row)
    const spacer = document.createElement('div')
    spacer.setAttribute('aria-hidden', 'true')
    spacer.getBoundingClientRect = rect(200, bottom, 1240, bottom + 400)
    content.appendChild(spacer)
    const scene = document.createElement('div')
    scene.getBoundingClientRect = rect(0, 570, 1440, 840)
    const strip = document.createElement('div')
    strip.className = 'place-scenery-strip'
    strip.getBoundingClientRect = rect(0, 800, 1440, 840)
    const left = document.createElement('div')
    left.className = 'place-scenery-corner'
    left.getBoundingClientRect = rect(0, 570, 370, 840)
    const right = document.createElement('div')
    right.className = 'place-scenery-corner'
    right.getBoundingClientRect = rect(1070, 570, 1440, 840)
    scene.append(strip, left, right)
    return { scroller, target, progress, content, scene }
  }

  it('lets content run past the corners\' tops where the corners have already settled', () => {
    // 600 is below the corners' full height (570) but above where they stand
    // under the column's edges (~608).
    const { scroller, target, progress, content, scene } = withContent(600)
    scroller.appendChild(content)
    attachSceneryVeil(scroller, target, scene)
    expect(progress()).toBe('0')
  })

  it('ignores spacers: empty page below the last row is not content', () => {
    const { scroller, target, progress, content, scene } = withContent(500)
    scroller.appendChild(content)
    attachSceneryVeil(scroller, target, scene)
    expect(progress()).toBe('0')
  })

  it('leaves the scene open when the page content ends above it', () => {
    const { scroller, target, progress, content, scene } = withContent(420)
    scroller.appendChild(content)
    attachSceneryVeil(scroller, target, scene)
    expect(progress()).toBe('0')
  })

  it('veils the scene, before any scroll, when a long day runs down into it', () => {
    const { scroller, target, progress, content, scene } = withContent(1400)
    scroller.appendChild(content)
    attachSceneryVeil(scroller, target, scene)
    expect(progress()).toBe('1')
  })

  it('re-checks when page content mounts after the scenery', () => {
    const { scroller, target, progress, content, scene } = withContent(1400)
    attachSceneryVeil(scroller, target, scene)
    expect(progress()).toBe('0')
    scroller.appendChild(content)
    window.dispatchEvent(new Event(SCENERY_CONTENT_EVENT))
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
